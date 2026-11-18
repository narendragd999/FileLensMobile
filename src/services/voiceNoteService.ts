/**
 * voiceNoteService.ts — Voice-First Second Brain Core Orchestrator
 *
 * Fulfills all thesis non-negotiable principles:
 * 1. Explicit mic toggle (no ambient background listening)
 * 2. Fully offline on-device STT, extraction, embedding
 * 3. Durability first: raw transcript written to disk immediately before processing
 * 4. Language-faithful: verbatim Hindi/English/Hinglish transcription
 * 5. Conservative automation: high-confidence reminders only
 */

import { PermissionsAndroid, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import {
  extractTemporalAndActionItems,
  extractSemanticActionItems,
  TemporalExtractionResult,
  ChecklistItem,
  normalizeActionItems,
  splitMultiIntentTranscript,
} from './temporalExtractionService';
import {
  saveVoiceNoteRecord,
  getVoiceNotesByTemporalClass as dbGetVoiceNotes,
  deleteVoiceNoteById as dbDeleteVoiceNoteById,
  updateVoiceNoteReminderStatus,
  updateVoiceNoteRecord,
  saveFileChunkEmbeddings,
  toggleVoiceNoteActionItem as dbToggleActionItem,
  linkDocumentToVoiceNote as dbLinkDocument,
  unlinkDocumentFromVoiceNote as dbUnlinkDocument,
  getAllCards,
  getAllPdfDocuments,
  getAllChunkEmbeddings,
  VoiceNoteRecord,
} from './database';
import { chunkText } from '../utils/textChunker';
import { generateEmbedding, cosineSimilarity } from './embeddingService';
import {
  scheduleVoiceNoteReminder,
  setDeviceClockAlarm,
  openDeviceCalendarEvent,
  cancelVoiceNoteReminderByNoteId,
  cleanReminderTaskText,
} from './reminderService';

let nativeModule: any = null;
let eventEmitter: any = null;

try {
  nativeModule = requireNativeModule('ExpoPdfToImage');
  if (nativeModule) {
    eventEmitter = new EventEmitter(nativeModule);
  }
} catch (e) {
  console.warn('[voiceNoteService] Native module init warning:', e);
}

const VOICE_NOTES_DIR = `${FileSystem.documentDirectory}voice_notes/`;

/**
 * Ensure the local durable voice notes directory exists
 */
async function ensureDirExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(VOICE_NOTES_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VOICE_NOTES_DIR, { intermediates: true });
  }
}

/**
 * Convert any Date or ISO date string into a local YYYY-MM-DD date key
 */
export function toLocalYMD(d: Date | string): string {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extracts action items from raw transcript bullets, sentences, or OCR text.
 * Uses the universal semantic action extractor for full sentence fidelity.
 */
export function getActionItemsFromRawTranscript(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const items = extractSemanticActionItems(raw);
  return items.length > 0 ? items : [raw.trim()];
}

/**
 * Check if voice capture is currently active
 */
export function isVoiceCaptureActive(): boolean {
  if (nativeModule && typeof nativeModule.isVoiceCaptureActive === 'function') {
    try {
      return nativeModule.isVoiceCaptureActive();
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * Check and request runtime microphone permission from Android in-app
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const checkGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (checkGranted) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'FileLensPro needs access to your microphone to capture voice notes offline.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    console.warn('[voiceNoteService] Failed to request microphone permission:', e);
    return false;
  }
}

/**
 * Start explicit voice capture
 */
export async function startVoiceCapture(locale: string = 'en-IN'): Promise<boolean> {
  const hasPermission = await requestMicrophonePermission();
  if (!hasPermission) {
    console.warn('[voiceNoteService] RECORD_AUDIO permission not granted');
    return false;
  }

  if (nativeModule && typeof nativeModule.startVoiceCapture === 'function') {
    try {
      return await nativeModule.startVoiceCapture(locale);
    } catch (e) {
      console.warn('[voiceNoteService] Error starting voice capture:', e);
      return false;
    }
  }
  return false;
}

/**
 * Stop voice capture
 */
export async function stopVoiceCapture(): Promise<boolean> {
  if (nativeModule && typeof nativeModule.stopVoiceCapture === 'function') {
    try {
      return await nativeModule.stopVoiceCapture();
    } catch (e) {
      console.warn('[voiceNoteService] Error stopping voice capture:', e);
      return false;
    }
  }
  return false;
}

/**
 * Subscribe to voice capture events
 */
export function subscribeToVoiceEvents(callbacks: {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onStateChange?: (isCapturing: boolean) => void;
  onError?: (error: string) => void;
}) {
  if (!eventEmitter) return () => {};

  const subs = [
    callbacks.onPartial && eventEmitter.addListener('onSpeechPartialResult', (e: any) => callbacks.onPartial!(e.text || '')),
    callbacks.onFinal && eventEmitter.addListener('onSpeechFinalResult', (e: any) => callbacks.onFinal!(e.text || '')),
    callbacks.onStateChange && eventEmitter.addListener('onSpeechStateChange', (e: any) => callbacks.onStateChange!(e.isCapturing ?? false)),
    callbacks.onError && eventEmitter.addListener('onSpeechError', (e: any) => callbacks.onError!(e.error || '')),
  ].filter(Boolean);

  return () => {
    subs.forEach(s => s?.remove());
  };
}

/**
 * Process a completed speech transcript through the pipeline
 *
 * Implements "One Day, One Plan" (Daily Aggregated Planning):
 * If a plan already exists for the resolved target date (or for today),
 * it seamlessly appends the new thoughts, synthesizes commitments/action items,
 * updates reminders, and keeps a single unified daily plan card!
 */
export async function processVoiceTranscript(
  rawTranscript: string,
  options?: {
    targetVoiceNoteId?: number;
    extractionOverrides?: Partial<TemporalExtractionResult>;
    linkedDocUri?: string;
    linkedDocName?: string;
    linkedDocType?: string;
  }
): Promise<VoiceNoteRecord | null> {
  const cleanTranscript = rawTranscript.trim();
  if (!cleanTranscript) return null;

  await ensureDirExists();

  // Check if target plan was specified
  const allNotes = await getVoiceNotesByTemporalClass();
  let existingPlan: VoiceNoteRecord | undefined;
  if (options?.targetVoiceNoteId) {
    existingPlan = allNotes.find(n => n.id === options.targetVoiceNoteId);
  }

  // If target plan has a resolved date or creation date, use it as reference
  const planReferenceDate = existingPlan?.resolvedDatetime || (existingPlan?.temporalClass === 'today' ? undefined : existingPlan?.createdAt);

  // 1. Detect multi-intent speech clauses with distinct times
  const splitEvents = splitMultiIntentTranscript(
    cleanTranscript,
    planReferenceDate ? { referenceDate: planReferenceDate } : undefined
  );

  // Async temporal extraction with optional user overrides
  const autoExtraction: TemporalExtractionResult = extractTemporalAndActionItems(
    cleanTranscript,
    planReferenceDate ? { referenceDate: planReferenceDate } : undefined
  );
  const extraction: TemporalExtractionResult = {
    ...autoExtraction,
    ...(options?.extractionOverrides || {}),
    actionItems: options?.extractionOverrides?.actionItems ?? autoExtraction.actionItems,
  };

  // Structured checklist items with sub-task timestamps
  let structuredChecklist: ChecklistItem[] = [];
  if (splitEvents.length > 1) {
    structuredChecklist = splitEvents.map(e => e.item);
  } else {
    const rawItems = extraction.actionItems.length > 0
      ? extraction.actionItems
      : [cleanTranscript];
    structuredChecklist = rawItems.map((act, idx) => ({
      id: String(idx + 1),
      text: act,
      completed: false,
      dueDatetime: extraction.resolvedDatetime,
    }));
  }

  const now = new Date();
  const todayKey = toLocalYMD(now);

  if (options?.targetVoiceNoteId) {
    existingPlan = allNotes.find(n => n.id === options.targetVoiceNoteId);
  } else if (extraction.resolvedDatetime) {
    const targetDateKey = toLocalYMD(extraction.resolvedDatetime);
    existingPlan = allNotes.find(n => {
      if (n.resolvedDatetime) {
        return toLocalYMD(n.resolvedDatetime) === targetDateKey;
      }
      if (extraction.temporalClass === 'today' && n.temporalClass === 'today') {
        return toLocalYMD(n.createdAt) === targetDateKey;
      }
      return false;
    });
  } else if (extraction.temporalClass === 'today') {
    existingPlan = allNotes.find(n => {
      if (n.temporalClass !== 'today') return false;
      const noteDateKey = n.resolvedDatetime ? toLocalYMD(n.resolvedDatetime) : toLocalYMD(n.createdAt);
      return noteDateKey === todayKey;
    });
  }

  const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (existingPlan) {
    // 1. Merge transcripts with clean chronological bullets
    const updatedTranscript = `${existingPlan.rawTranscript}\n\n• [${timeLabel}] ${cleanTranscript}`;

    // 2. Merge checklist items seamlessly
    const existingChecklist = normalizeActionItems(existingPlan.actionItems);
    const existingTexts = new Set(existingChecklist.map(i => i.text.toLowerCase()));
    const appendedItems: ChecklistItem[] = [];
    for (const newItem of structuredChecklist) {
      if (!existingTexts.has(newItem.text.toLowerCase())) {
        appendedItems.push({
          ...newItem,
          id: String(existingChecklist.length + appendedItems.length + 1),
        });
      }
    }
    const mergedChecklist = [...existingChecklist, ...appendedItems];

    // 3. Resolve datetime and reminder state
    let updatedDatetime = existingPlan.resolvedDatetime;
    if (extraction.resolvedDatetime) {
      if (options?.targetVoiceNoteId && existingPlan.resolvedDatetime) {
        const newD = new Date(extraction.resolvedDatetime);
        const planD = new Date(existingPlan.resolvedDatetime);
        planD.setHours(newD.getHours(), newD.getMinutes(), 0, 0);
        updatedDatetime = planD.toISOString();
      } else {
        updatedDatetime = extraction.resolvedDatetime;
      }
    }
    const isReminderActive = existingPlan.isReminderSet || extraction.isHighConfidenceReminder;

    const linkedDocUri = options?.linkedDocUri || existingPlan.linkedDocUri;
    const linkedDocName = options?.linkedDocName || existingPlan.linkedDocName;
    const linkedDocType = options?.linkedDocType || existingPlan.linkedDocType;

    // Update SQLite record with merged transcript & actions & linked doc
    await updateVoiceNoteRecord(existingPlan.id, {
      temporalClass: existingPlan.temporalClass,
      resolvedDatetime: updatedDatetime,
      actionItems: mergedChecklist,
      isReminderSet: isReminderActive,
      rawTranscript: updatedTranscript,
      linkedDocUri,
      linkedDocName,
      linkedDocType,
    });

    // Append to file on disk
    try {
      await FileSystem.writeAsStringAsync(existingPlan.uri, updatedTranscript);
    } catch (fsErr) {
      console.warn('[voiceNoteService] Error writing updated transcript to disk:', fsErr);
    }

    // Schedule / update reminder
    if (extraction.isHighConfidenceReminder && updatedDatetime) {
      try {
        const triggerDate = new Date(updatedDatetime);
        const reminderTitle = mergedChecklist[0]?.text || 'Scheduled Reminder';
        await scheduleVoiceNoteReminder(
          existingPlan.id,
          reminderTitle,
          updatedTranscript,
          triggerDate,
          { actionItems: mergedChecklist }
        );
      } catch (remErr) {
        console.warn('[voiceNoteService] Reminder rescheduling error:', remErr);
      }
    }

    const refreshed = await getVoiceNotesByTemporalClass();
    return refreshed.find(n => n.id === existingPlan.id) || null;
  }

  // Otherwise, create a new daily plan record
  const timestamp = Date.now();
  const filePath = `${VOICE_NOTES_DIR}VN_${timestamp}.txt`;
  await FileSystem.writeAsStringAsync(filePath, cleanTranscript);

  const voiceNoteId = await saveVoiceNoteRecord({
    uri: filePath,
    rawTranscript: cleanTranscript,
    temporalClass: extraction.temporalClass,
    resolvedDatetime: extraction.resolvedDatetime,
    actionItems: structuredChecklist,
    isReminderSet: extraction.isHighConfidenceReminder,
    linkedDocUri: options?.linkedDocUri,
    linkedDocName: options?.linkedDocName,
    linkedDocType: options?.linkedDocType,
  });

  // Async semantic chunking and embedding (for unified semantic search)
  try {
    const chunks = chunkText(cleanTranscript);
    const chunkVectors: Array<{ text: string; pageNumber: number; vector: Float32Array }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await generateEmbedding(chunk.text);
      chunkVectors.push({
        text: chunk.text,
        pageNumber: chunk.pageNumber,
        vector,
      });
    }
    const note = await getVoiceNotesByTemporalClass();
    const currentNote = note.find(n => n.id === voiceNoteId);
    if (currentNote) {
      await saveFileChunkEmbeddings(currentNote.fileId, chunkVectors);
    }
  } catch (embedErr) {
    console.warn('[voiceNoteService] Semantic embedding error:', embedErr);
  }

  // Schedule exact alarm reminder if high confidence
  if (extraction.isHighConfidenceReminder && extraction.resolvedDatetime) {
    try {
      const triggerDate = new Date(extraction.resolvedDatetime);
      const reminderTitle = extraction.actionItems[0] || 'Scheduled Reminder';
      await scheduleVoiceNoteReminder(
        voiceNoteId,
        reminderTitle,
        cleanTranscript,
        triggerDate,
        { actionItems: extraction.actionItems }
      );
    } catch (remErr) {
      console.warn('[voiceNoteService] Reminder scheduling error:', remErr);
    }
  }

  const notes = await getVoiceNotesByTemporalClass();
  return notes.find(n => n.id === voiceNoteId) || null;
}

/**
 * Automatically inspects and reclassifies existing stored voice notes if improved
 * temporal models yield higher-fidelity dates, times, or reminder states.
 * Also consolidates multiple separate notes for the same target day into One Day, One Plan.
 */
export async function reclassifyExistingVoiceNotes(): Promise<void> {
  try {
    const allNotes = await getVoiceNotesByTemporalClass();
    const dayMap: Record<string, VoiceNoteRecord[]> = {};

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    for (const note of allNotes) {
      let updatedTemporalClass = note.temporalClass;
      let targetDayKey: string | null = null;

      if (note.resolvedDatetime) {
        const resTime = new Date(note.resolvedDatetime).getTime();
        if (resTime < todayStart) {
          updatedTemporalClass = 'historical';
        } else if (resTime >= todayStart && resTime <= todayEnd) {
          updatedTemporalClass = 'today';
        } else {
          updatedTemporalClass = 'future';
        }
        targetDayKey = toLocalYMD(note.resolvedDatetime);
      } else if (note.temporalClass === 'today') {
        const createdTime = new Date(note.createdAt).getTime();
        if (createdTime < todayStart) {
          updatedTemporalClass = 'historical';
        } else {
          updatedTemporalClass = 'today';
        }
        targetDayKey = toLocalYMD(note.createdAt);
      } else if (note.temporalClass === 'future') {
        targetDayKey = toLocalYMD(note.createdAt);
      }

      const existingActions = (note.actionItems && note.actionItems.length > 0)
        ? note.actionItems
        : getActionItemsFromRawTranscript(note.rawTranscript);

      if (note.temporalClass !== updatedTemporalClass) {
        await updateVoiceNoteRecord(note.id, {
          temporalClass: updatedTemporalClass,
          resolvedDatetime: note.resolvedDatetime,
          actionItems: existingActions,
          isReminderSet: note.isReminderSet,
          imageUris: note.imageUris,
          rawTranscript: note.rawTranscript,
        });
        note.temporalClass = updatedTemporalClass;
        note.actionItems = existingActions;
      }

      // Collect for One Day, One Plan consolidation
      if (targetDayKey) {
        if (!dayMap[targetDayKey]) {
          dayMap[targetDayKey] = [];
        }
        dayMap[targetDayKey].push(note);
      }
    }

    // Merge multiple notes on the same day into a unified primary note
    for (const [dayKey, notesOnDay] of Object.entries(dayMap)) {
      if (notesOnDay.length > 1) {
        const primary = notesOnDay[0];
        let mergedTranscript = primary.rawTranscript;
        const mergedActions = [...primary.actionItems];

        for (let i = 1; i < notesOnDay.length; i++) {
          const dup = notesOnDay[i];
          if (!mergedTranscript.includes(dup.rawTranscript)) {
            mergedTranscript += `\n\n• ${dup.rawTranscript}`;
          }
          for (const act of dup.actionItems) {
            if (!mergedActions.includes(act)) {
              mergedActions.push(act);
            }
          }
          await deleteVoiceNoteById(dup.id);
        }

        await updateVoiceNoteRecord(primary.id, {
          temporalClass: primary.temporalClass,
          resolvedDatetime: primary.resolvedDatetime,
          actionItems: mergedActions,
          isReminderSet: primary.isReminderSet,
          rawTranscript: mergedTranscript,
        });


        try {
          await FileSystem.writeAsStringAsync(primary.uri, mergedTranscript);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[voiceNoteService] Error in reclassifyExistingVoiceNotes:', err);
  }
}

/**
 * Update action items for an existing voice note (for edit, delete, toggle)
 */
export async function updateVoiceNoteActionItems(
  noteId: number,
  newActionItems: string[]
): Promise<void> {
  const notes = await getVoiceNotesByTemporalClass();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  await updateVoiceNoteRecord(noteId, {
    temporalClass: note.temporalClass,
    resolvedDatetime: note.resolvedDatetime,
    actionItems: newActionItems,
    isReminderSet: note.isReminderSet,
    imageUris: note.imageUris,
    rawTranscript: note.rawTranscript,
  });
}

/**
 * Attach or update images associated with a voice note
 */
export async function attachImagesToVoiceNote(
  noteId: number,
  newImageUris: string[]
): Promise<void> {
  const notes = await getVoiceNotesByTemporalClass();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  const currentUris = note.imageUris || [];
  const mergedUris = Array.from(new Set([...currentUris, ...newImageUris]));

  await updateVoiceNoteRecord(noteId, {
    temporalClass: note.temporalClass,
    resolvedDatetime: note.resolvedDatetime,
    actionItems: note.actionItems,
    isReminderSet: note.isReminderSet,
    imageUris: mergedUris,
    rawTranscript: note.rawTranscript,
  });
}

/**
 * Retrieve voice notes dynamically classified into temporal tabs:
 * - 'today': Notes scheduled for today (or created today)
 * - 'future': Notes scheduled for future dates (e.g. tomorrow, next week)
 * - 'historical': Notes whose scheduled date has passed (< today) or undated memos
 * 
 * Auto-rolling: At midnight, tomorrow's notes automatically become today's,
 * and today's past notes automatically roll into historical!
 */
export async function getVoiceNotesByTemporalClass(
  tab?: 'today' | 'future' | 'historical'
): Promise<VoiceNoteRecord[]> {
  const allNotes = await dbGetVoiceNotes();
  const todayKey = toLocalYMD(new Date());

  const evaluated = allNotes.map((note) => {
    let effectiveClass: 'today' | 'future' | 'historical';

    if (note.resolvedDatetime) {
      const noteDateKey = toLocalYMD(note.resolvedDatetime);
      if (noteDateKey === todayKey) {
        effectiveClass = 'today';
      } else if (noteDateKey > todayKey) {
        effectiveClass = 'future';
      } else {
        effectiveClass = 'historical';
      }
    } else {
      const createdDateKey = toLocalYMD(note.createdAt);
      if (createdDateKey === todayKey && note.temporalClass !== 'historical') {
        effectiveClass = 'today';
      } else {
        effectiveClass = 'historical';
      }
    }

    // Quietly synchronize SQLite if date changed (e.g. overnight transition)
    if (note.temporalClass !== effectiveClass) {
      note.temporalClass = effectiveClass;
      updateVoiceNoteRecord(note.id, {
        temporalClass: effectiveClass,
        resolvedDatetime: note.resolvedDatetime,
        actionItems: note.actionItems,
        isReminderSet: note.isReminderSet,
      }).catch(() => {});
    }

    // Ensure action items are always populated so all spoken thoughts show as to-dos
    if (!note.actionItems || note.actionItems.length === 0) {
      note.actionItems = getActionItemsFromRawTranscript(note.rawTranscript);
    }

    return note;
  });

  if (!tab) return evaluated;

  const filtered = evaluated.filter((n) => n.temporalClass === tab);

  if (tab === 'future') {
    return filtered.sort((a, b) => {
      const timeA = a.resolvedDatetime ? new Date(a.resolvedDatetime).getTime() : 0;
      const timeB = b.resolvedDatetime ? new Date(b.resolvedDatetime).getTime() : 0;
      return timeA - timeB;
    });
  }

  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Update the scheduled date/time for a voice note plan
 */
export async function updateVoiceNoteDate(
  noteId: number,
  newDate: Date
): Promise<void> {
  const notes = await getVoiceNotesByTemporalClass();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  const now = new Date();
  const todayKey = toLocalYMD(now);
  const targetKey = toLocalYMD(newDate);

  let newClass: 'today' | 'future' | 'historical';
  if (targetKey === todayKey) {
    newClass = 'today';
  } else if (targetKey > todayKey) {
    newClass = 'future';
  } else {
    newClass = 'historical';
  }

  const rawBase = (note as any).title?.trim() || note.actionItems?.[0] || note.rawTranscript || 'Scheduled Plan';
  const cleanTask = cleanReminderTaskText(rawBase);

  // If previous title was empty or contained old time expressions, update to cleanTask
  const updatedTitle = (note as any).title?.trim()
    ? cleanReminderTaskText((note as any).title)
    : cleanTask;

  const updatedActionItems = (note.actionItems && note.actionItems.length > 0)
    ? note.actionItems.map(item => cleanReminderTaskText(item) || item)
    : [cleanTask];

  await updateVoiceNoteRecord(noteId, {
    title: updatedTitle,
    temporalClass: newClass,
    resolvedDatetime: newDate.toISOString(),
    actionItems: updatedActionItems,
    isReminderSet: true,
    imageUris: note.imageUris,
    rawTranscript: note.rawTranscript,
  });

  // Always schedule reminder and 15m advance pre-reminder for the newly rescheduled time
  try {
    await scheduleVoiceNoteReminder(
      noteId,
      updatedTitle,
      cleanTask,
      newDate,
      { actionItems: updatedActionItems }
    );
  } catch (e) {
    console.warn('[voiceNoteService] Failed to reschedule reminder on date update:', e);
  }
}

/**
 * Delete a voice note, cancel any scheduled device reminders/alarms, and purge database records.
 */
export async function deleteVoiceNoteById(id: number): Promise<void> {
  try {
    await cancelVoiceNoteReminderByNoteId(id);
  } catch (e) {
    console.warn('[voiceNoteService] Error cancelling reminder for voice note:', id, e);
  }
  await dbDeleteVoiceNoteById(id);
}

/**
 * Toggle completion of a checklist item in a voice note
 */
export async function toggleActionItemCompletion(
  noteId: number,
  itemIndex: number,
  completed?: boolean
): Promise<ChecklistItem[]> {
  return await dbToggleActionItem(noteId, itemIndex, completed);
}

/**
 * Cross-link a document or ID card to a voice note
 */
export async function linkDocumentToNote(
  noteId: number,
  docUri: string,
  docName: string,
  docType: string = 'pdf'
): Promise<void> {
  await dbLinkDocument(noteId, docUri, docName, docType);
}

/**
 * Remove document link from a voice note
 */
export async function unlinkDocumentFromNote(noteId: number): Promise<void> {
  await dbUnlinkDocument(noteId);
}

/**
 * Retrieve all available PDF documents and ID cards for cross-linking
 */
export async function getAvailableLinkableDocuments(): Promise<{
  pdfs: Array<{ id: number; uri: string; name: string; size: number; pageCount?: number }>;
  cards: Array<{ id: number; uri: string; name: string; category: string }>;
}> {
  const [pdfs, cards] = await Promise.all([
    getAllPdfDocuments(),
    getAllCards(),
  ]);

  return {
    pdfs: pdfs.map(p => ({
      id: p.id,
      uri: p.uri,
      name: p.name,
      size: p.size,
      pageCount: (p as any).pageCount,
    })),
    cards: cards.map(c => ({
      id: c.id,
      uri: c.uri,
      name: c.name,
      category: c.category,
    })),
  };
}

export interface SemanticSearchResult {
  note: VoiceNoteRecord;
  similarity: number;
  matchPercent: number;
  matchingSnippet: string;
}

/**
 * On-Device 384-Dim Multilingual Semantic Vector Search
 * Converts query into a dense 384-dim vector using on-device tokenization & phonetic embeddings,
 * then computes cosine similarity against all stored notes and indexed chunks.
 */
export async function searchVoiceNotesSemantically(
  query: string,
  minSimilarity: number = 0.20
): Promise<SemanticSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const queryVector = await generateEmbedding(cleanQuery);
  const allNotes = await getVoiceNotesByTemporalClass();
  let chunkEmbeddings: any[] = [];
  try {
    chunkEmbeddings = await getAllChunkEmbeddings();
  } catch (e) {
    chunkEmbeddings = [];
  }

  const results: SemanticSearchResult[] = [];

  for (const note of allNotes) {
    let bestSimilarity = 0.0;
    let bestSnippet = '';

    // 1. Direct similarity with transcript
    if (note.rawTranscript) {
      const transcriptVector = await generateEmbedding(note.rawTranscript);
      const transcriptSim = cosineSimilarity(queryVector, transcriptVector);
      if (transcriptSim > bestSimilarity) {
        bestSimilarity = transcriptSim;
        bestSnippet = note.rawTranscript.slice(0, 150);
      }
    }

    // 2. Direct similarity with title
    if (note.title && note.title.trim()) {
      const titleVector = await generateEmbedding(note.title);
      const titleSim = cosineSimilarity(queryVector, titleVector);
      if (titleSim > bestSimilarity) {
        bestSimilarity = titleSim;
        bestSnippet = note.title;
      }
    }

    // 3. Direct similarity with individual action items
    const checklist = normalizeActionItems(note.actionItems);
    for (const item of checklist) {
      if (item.text) {
        const itemVector = await generateEmbedding(item.text);
        const itemSim = cosineSimilarity(queryVector, itemVector);
        if (itemSim > bestSimilarity) {
          bestSimilarity = itemSim;
          bestSnippet = item.text;
        }
      }
    }

    // 4. Chunk embeddings similarity
    const noteChunks = chunkEmbeddings.filter(c => c.fileId === note.fileId);
    for (const chunk of noteChunks) {
      const chunkSim = cosineSimilarity(queryVector, chunk.vector);
      if (chunkSim > bestSimilarity) {
        bestSimilarity = chunkSim;
        bestSnippet = chunk.chunkText.slice(0, 150);
      }
    }

    if (bestSimilarity >= minSimilarity) {
      results.push({
        note,
        similarity: bestSimilarity,
        matchPercent: Math.round(Math.min(100, Math.max(0, bestSimilarity * 100))),
        matchingSnippet: bestSnippet || note.rawTranscript.slice(0, 100),
      });
    }
  }

  // Sort descending by highest match
  return results.sort((a, b) => b.similarity - a.similarity);
}

export {
  updateVoiceNoteReminderStatus,
  setDeviceClockAlarm,
  openDeviceCalendarEvent,
};


