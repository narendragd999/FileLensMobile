/**
 * fileToBrainService.ts — Bridge between File Manager, Smart Cards, and Second Brain.
 *
 * Capabilities:
 *   1. Add any file to Smart Cards (mark is_card = 1, assign category tag)
 *   2. Schedule any file to Second Brain with date, time, task label, and automated push notification reminders
 */

import { getDatabase, markFileAsCard, saveVoiceNoteRecord, upsertFile } from './database';
import { scheduleVoiceNoteReminder } from './reminderService';
import { StorageItem } from './fileManagerService';

/**
 * Adds an existing storage item to Smart Cards
 */
export async function addFileToCards(
  item: StorageItem,
  customTag: string = 'Document'
): Promise<{ success: boolean; fileId?: number; error?: string }> {
  try {
    const database = await getDatabase();
    let fileRow = await database.getFirstAsync<{ id: number }>(
      'SELECT id FROM files WHERE uri = ?',
      [item.uri]
    );

    let targetFileId: number;
    if (fileRow && fileRow.id) {
      targetFileId = fileRow.id;
    } else {
      // Upsert into files database first
      targetFileId = await upsertFile({
        uri: item.uri,
        name: item.name,
        extension: item.extension || item.name.split('.').pop() || '',
        size: item.size || 0,
        modified: item.modified || new Date().toISOString(),
        contentText: item.name,
        ocrText: '',
        ocrStatus: 'pending',
      });
    }

    await markFileAsCard(targetFileId, customTag);
    return { success: true, fileId: targetFileId };
  } catch (err: any) {
    console.warn('[fileToBrainService] addFileToCards failed:', err);
    return { success: false, error: err?.message || 'Failed to add card' };
  }
}

/**
 * Batch adds multiple storage items to Smart Cards
 */
export async function batchAddFilesToCards(
  items: StorageItem[],
  customTag: string = 'Documents'
): Promise<{ addedCount: number }> {
  let count = 0;
  for (const item of items) {
    const res = await addFileToCards(item, customTag);
    if (res.success) count++;
  }
  return { addedCount: count };
}

/**
 * Schedules a file reminder into Second Brain
 */
export async function scheduleFileToBrain(
  item: StorageItem,
  scheduledDate: Date,
  taskTitle?: string,
  taskNotes?: string
): Promise<{ success: boolean; noteId?: number; error?: string }> {
  try {
    const now = new Date();
    const isToday =
      scheduledDate.getFullYear() === now.getFullYear() &&
      scheduledDate.getMonth() === now.getMonth() &&
      scheduledDate.getDate() === now.getDate();

    const temporalClass: 'today' | 'future' | 'historical' =
      scheduledDate.getTime() < now.getTime() - 86400000
        ? 'historical'
        : isToday
        ? 'today'
        : 'future';

    const title = (taskTitle || `Review ${item.name}`).trim();
    const transcript = (taskNotes || `Scheduled reminder for ${item.name}`).trim();
    const syntheticUri = `file_reminder_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const docType =
      item.mimeType === 'application/pdf'
        ? 'pdf'
        : item.mimeType?.startsWith('image/')
        ? 'scan'
        : 'card';

    const noteId = await saveVoiceNoteRecord({
      uri: syntheticUri,
      title,
      rawTranscript: transcript,
      temporalClass,
      resolvedDatetime: scheduledDate.toISOString(),
      actionItems: [title],
      isReminderSet: true,
      imageUris: item.mimeType?.startsWith('image/') ? [item.uri] : [],
      linkedDocUri: item.uri,
      linkedDocName: item.name,
      linkedDocType: docType,
    });

    // Schedule high-priority system reminder and advance notice
    try {
      await scheduleVoiceNoteReminder(noteId, title, transcript || title, scheduledDate);
    } catch (schedErr) {
      console.warn('[fileToBrainService] scheduleVoiceNoteReminder notice:', schedErr);
    }

    return { success: true, noteId };
  } catch (err: any) {
    console.warn('[fileToBrainService] scheduleFileToBrain failed:', err);
    return { success: false, error: err?.message || 'Failed to schedule to Brain' };
  }
}
