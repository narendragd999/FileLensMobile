/**
 * second-brain.tsx — Voice-First Second Brain UI Surface
 *
 * Core Query Surfaces:
 *   1. Today: Today''s chronological notes & action commitments
 *   2. Upcoming: Future-dated plans & exact scheduled reminders
 *   3. History: Complete voice memory archive
 *
 * Captures spoken thoughts offline via explicit mic toggle.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Haptics } from '../utils/haptics';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  FadeInDown,
  FadeIn,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
} from 'react-native-reanimated';
import { NativeScaleButton, MotionSpring, cardLayoutTransition, getStaggerDelay, AnimatedModalSheet } from '../utils/motion';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { launchGoogleDocScanner } from 'expo-pdf-to-image';
import { useThemeColors } from '../utils/theme';
import {
  startVoiceCapture,
  stopVoiceCapture,
  isVoiceCaptureActive,
  subscribeToVoiceEvents,
  processVoiceTranscript,
  getVoiceNotesByTemporalClass,
  deleteVoiceNoteById,
  reclassifyExistingVoiceNotes,
  updateVoiceNoteActionItems,
  getActionItemsFromRawTranscript,
  attachImagesToVoiceNote,
  updateVoiceNoteDate,
  toggleActionItemCompletion,
  linkDocumentToNote,
  unlinkDocumentFromNote,
  getAvailableLinkableDocuments,
  searchVoiceNotesSemantically,
  SemanticSearchResult,
} from '../services/voiceNoteService';
import { getDatabase } from '../services/database';
import { findRelevantCardsForNote, NoteCardLink } from '../services/semanticExtensionsService';

import {
  extractTemporalAndActionItems,
  TemporalExtractionResult,
  ChecklistItem,
  normalizeActionItems,
} from '../services/temporalExtractionService';
import { VoiceNoteRecord, updateVoiceNoteRecord, updateVoiceNoteTitle } from '../services/database';
import { getBillingState, BillingState } from '../services/billingService';
import SubscriptionModal from '../components/SubscriptionModal';
import { SemanticAiDownloadModal } from '../components/SemanticAiDownloadModal';
import { isModelDownloaded, isAiEnabled } from '../services/semanticAiModelService';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import VoiceNoteConfirmModal from '../components/VoiceNoteConfirmModal';
import { ocrImage } from '../services/ocrService';
import DayPlanDetailModal from '../components/DayPlanDetailModal';
import { HeaderMenuButton } from '../components/QuickNavModal';
import {
  scheduleDayPlanAwarenessReminders,
  isDayPlanAwarenessActive,
  scheduleMorningDailyDigest,
  isMorningDailyDigestActive,
  cancelMorningDailyDigest,
} from '../services/reminderService';


export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const WORLD_LANGUAGES: SupportedLanguage[] = [
  // Indian Languages
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'en-IN', name: 'English (India)', nativeName: 'English / Hinglish', flag: '🇮🇳' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'ur-IN', name: 'Urdu', nativeName: 'اردو', flag: '🇮🇳' },

  // Worldwide Major Languages
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)', flag: '🇬🇧' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '中文 (简体)', flag: '🇨🇳' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'id-ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th-TH', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
];

type TemporalTab = 'today' | 'future' | 'historical';

export default function SecondBrainScreen() {
  const router = useRouter();
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TemporalTab>('today');
  const [notes, setNotes] = useState<VoiceNoteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [pendingAttachedImageUri, setPendingAttachedImageUri] = useState<string | null>(null);
  const [locale, setLocale] = useState<string>('hi-IN');
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null); // YYYY-MM-DD
  const [datePickerModalVisible, setDatePickerModalVisible] = useState(false);
  const [pickerCalendarMonth, setPickerCalendarMonth] = useState<Date>(new Date());

  const currentLang = WORLD_LANGUAGES.find(l => l.code === locale) || WORLD_LANGUAGES[0];


  // Paywall / Subscriptions
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Alert Modal
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[] | undefined>(undefined);

  // Manual Note Input
  const [manualInput, setManualInput] = useState('');
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [quickAddMenuVisible, setQuickAddMenuVisible] = useState(false);
  const [targetPlanId, setTargetPlanId] = useState<number | undefined>(undefined);

  // Pre-Processing Verification & Preview Modal
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [pendingExtraction, setPendingExtraction] = useState<TemporalExtractionResult | null>(null);

  // Day Plan Detail View Modal
  const [selectedPlanForDetail, setSelectedPlanForDetail] = useState<VoiceNoteRecord | null>(null);
  const selectedPlanForDetailRef = useRef<VoiceNoteRecord | null>(null);
  selectedPlanForDetailRef.current = selectedPlanForDetail;
  const [planDateChangeTarget, setPlanDateChangeTarget] = useState<VoiceNoteRecord | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleHour, setRescheduleHour] = useState<number>(9);
  const [rescheduleMinute, setRescheduleMinute] = useState<number>(0);
  const [reschedulePeriod, setReschedulePeriod] = useState<'AM' | 'PM'>('AM');

  // Pulse animation for recording
  const pulseScale = useSharedValue(1);

  // Long-run Day Plan Awareness Bell
  const [isAwarenessActive, setIsAwarenessActive] = useState<boolean>(false);

  useEffect(() => {
    isDayPlanAwarenessActive().then(setIsAwarenessActive);
  }, []);

  const handleToggleAwarenessBell = async () => {
    try {
      if (isAwarenessActive) {
        await scheduleDayPlanAwarenessReminders(0, 0);
        setIsAwarenessActive(false);
        setAlertTitle('Awareness Bell Paused');
        setAlertMessage('Recurring reminder notifications for today and upcoming plans have been paused.');
        setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
        setAlertVisible(true);
      } else {
        const todayNotes = await getVoiceNotesByTemporalClass('today');
        const upcomingNotes = await getVoiceNotesByTemporalClass('future');
        const todayCount = todayNotes.reduce((acc, n) => acc + (n.actionItems?.filter(a => !a.startsWith('[DONE] ')).length || 1), 0);
        const upcomingCount = upcomingNotes.length;
        const success = await scheduleDayPlanAwarenessReminders(todayCount, upcomingCount);
        if (success) {
          setIsAwarenessActive(true);
          setAlertTitle('🔔 Awareness Bell Active');
          setAlertMessage(`Scheduled recurring reminder bells to keep you aware of today's plans (${todayCount} tasks) and upcoming plans (${upcomingCount} plans).`);
          setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
          setAlertVisible(true);
        } else {
          setAlertTitle('Notification Permission Required');
          setAlertMessage('Please allow notifications so FileLensPro can ring reminder bells for your day plans.');
          setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
          setAlertVisible(true);
        }
      }
    } catch (e: any) {
      console.warn('[second-brain] handleToggleAwarenessBell error:', e);
    }
  };

  // Morning Daily Digest State (8:00 AM)
  const [isMorningDigestEnabled, setIsMorningDigestEnabled] = useState<boolean>(false);

  useEffect(() => {
    isMorningDailyDigestActive().then(setIsMorningDigestEnabled);
  }, []);

  const handleToggleMorningDigest = async () => {
    try {
      if (isMorningDigestEnabled) {
        await cancelMorningDailyDigest();
        setIsMorningDigestEnabled(false);
        setAlertTitle('Morning Digest Paused');
        setAlertMessage('Automated 8:00 AM daily briefing notifications have been turned off.');
        setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
        setAlertVisible(true);
      } else {
        const todayNotes = await getVoiceNotesByTemporalClass('today');
        const count = todayNotes.reduce((acc, n) => {
          const cl = normalizeActionItems(n.actionItems);
          return acc + cl.filter(i => !i.completed).length;
        }, 0);
        const ok = await scheduleMorningDailyDigest(8, 0, count);
        if (ok) {
          setIsMorningDigestEnabled(true);
          setAlertTitle('☀️ Morning Briefing Active');
          setAlertMessage('FileLensPro will deliver an automated daily briefing at 8:00 AM with your scheduled tasks and commitments.');
          setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
          setAlertVisible(true);
        } else {
          setAlertTitle('Permission Required');
          setAlertMessage('Please allow notification permissions to receive morning digests.');
          setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
          setAlertVisible(true);
        }
      }
    } catch (e) {
      console.warn('[second-brain] Morning digest toggle error:', e);
    }
  };

  // On-Device 384-Dim Semantic Vector Search State
  const [isSemanticSearchActive, setIsSemanticSearchActive] = useState<boolean>(false);
  const [semanticSearchResults, setSemanticSearchResults] = useState<SemanticSearchResult[]>([]);
  const [isSearchingSemantics, setIsSearchingSemantics] = useState<boolean>(false);

  useEffect(() => {
    if (!isSemanticSearchActive || !searchQuery.trim()) {
      setSemanticSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingSemantics(true);
      try {
        const results = await searchVoiceNotesSemantically(searchQuery.trim(), 0.18);
        setSemanticSearchResults(results);
      } catch (e) {
        console.warn('[second-brain] Semantic search error:', e);
      } finally {
        setIsSearchingSemantics(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, isSemanticSearchActive]);

  // Document & ID Card Cross-Linking Modal State
  const [linkDocModalVisible, setLinkDocModalVisible] = useState(false);
  const [targetNoteForLink, setTargetNoteForLink] = useState<VoiceNoteRecord | null>(null);
  const [availableDocs, setAvailableDocs] = useState<{ pdfs: any[]; cards: any[] }>({ pdfs: [], cards: [] });
  const [linkDocTab, setLinkDocTab] = useState<'pdf' | 'card'>('pdf');
  const [linkDocSearch, setLinkDocSearch] = useState('');

  // Multilingual Semantic AI Model Modal State
  const [aiDownloadModalVisible, setAiDownloadModalVisible] = useState(false);
  const [isAiModelActive, setIsAiModelActive] = useState(false);

  const checkAiModelStatus = async () => {
    const isDl = await isModelDownloaded();
    const isEn = await isAiEnabled();
    setIsAiModelActive(isDl && isEn);
  };

  useEffect(() => {
    checkAiModelStatus();
  }, []);

  const handleOpenLinkModal = async (note: VoiceNoteRecord) => {
    setTargetNoteForLink(note);
    const docs = await getAvailableLinkableDocuments();
    setAvailableDocs(docs);
    setLinkDocModalVisible(true);
  };

  const handleSelectLinkDoc = async (docUri: string, docName: string, docType: string) => {
    if (!targetNoteForLink) return;
    await linkDocumentToNote(targetNoteForLink.id, docUri, docName, docType);
    setLinkDocModalVisible(false);
    setTargetNoteForLink(null);
    await loadNotes(activeTab);
  };

  const [allCardsForSuggestions, setAllCardsForSuggestions] = useState<Array<{ id: number; name: string; uri: string; custom_tag?: string; ocr_text?: string }>>([]);

  const loadCardsForSuggestions = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ id: number; name: string; uri: string; custom_tag: string | null; ocr_text: string | null }>(
        "SELECT id, name, uri, custom_tag, ocr_text FROM files WHERE is_card = 1 ORDER BY id DESC LIMIT 150"
      );
      setAllCardsForSuggestions(rows.map(r => ({
        id: r.id,
        name: r.name,
        uri: r.uri,
        custom_tag: r.custom_tag || undefined,
        ocr_text: r.ocr_text || undefined,
      })));
    } catch (e) {
      console.warn('[second-brain] loadCardsForSuggestions error:', e);
    }
  }, []);

  useEffect(() => {
    loadCardsForSuggestions();
  }, [loadCardsForSuggestions]);

  const handleDirectLinkCard = async (noteId: number, cardUri: string, cardName: string, cardType: string) => {
    await linkDocumentToNote(noteId, cardUri, cardName, cardType);
    Haptics.success();
    await loadNotes(activeTab);
  };

  const handleUnlinkDoc = async (note: VoiceNoteRecord) => {
    await unlinkDocumentFromNote(note.id);
    await loadNotes(activeTab);
  };

  // Deep Link Navigation & External Intent Sharing (e.g. WhatsApp, Calendar, Browser, Documents)
  const params = useLocalSearchParams<{
    openFileId?: string;
    openVoiceUri?: string;
    openNoteId?: string;
    sharedText?: string;
    sharedImageUri?: string;
    linkDocUri?: string;
    linkDocName?: string;
    linkDocType?: string;
  }>();
  const handledParamTargetRef = useRef<string | null>(null);
  const handledSharedTextRef = useRef<string | null>(null);
  const handledLinkDocRef = useRef<string | null>(null);

  useEffect(() => {
    if (params?.linkDocUri && handledLinkDocRef.current !== params.linkDocUri) {
      handledLinkDocRef.current = params.linkDocUri;
      setManualInput(`Review and action ${params.linkDocName || 'document'}`);
      setIsAddingManual(true);
    }
  }, [params?.linkDocUri, params?.linkDocName]);

  useEffect(() => {
    const targetKey = params?.openFileId || params?.openVoiceUri || params?.openNoteId;
    if (!targetKey || handledParamTargetRef.current === targetKey) return;

    (async () => {
      try {
        const all = await getVoiceNotesByTemporalClass();
        const found = all.find((n) => {
          if (params.openFileId && String(n.fileId) === String(params.openFileId)) return true;
          if (params.openNoteId && String(n.id) === String(params.openNoteId)) return true;
          if (params.openVoiceUri && (n.uri === params.openVoiceUri || params.openVoiceUri.includes(String(n.id)))) return true;
          return false;
        });

        if (found) {
          handledParamTargetRef.current = targetKey;
          setSelectedDateFilter(null);
          if (activeTab !== found.temporalClass) {
            setActiveTab(found.temporalClass);
          }
          setSelectedPlanForDetail(found);
        }
      } catch (err) {
        console.warn('[SecondBrain] Deep link navigation error:', err);
      }
    })();
  }, [params?.openFileId, params?.openVoiceUri, params?.openNoteId]);

  // Handle incoming meeting / plan intent from WhatsApp or other apps
  useEffect(() => {
    if (params?.sharedText && handledSharedTextRef.current !== params.sharedText) {
      handledSharedTextRef.current = params.sharedText;
      try {
        const text = decodeURIComponent(params.sharedText).trim();
        if (text) {
          if (params.sharedImageUri) {
            setPendingAttachedImageUri(decodeURIComponent(params.sharedImageUri));
          }
          const extraction = extractTemporalAndActionItems(text);
          setPendingTranscript(text);
          setPendingExtraction(extraction);
          setConfirmModalVisible(true);
        }
      } catch (err) {
        console.warn('[SecondBrain] Error parsing incoming sharedText intent:', err);
      }
    }
  }, [params?.sharedText, params?.sharedImageUri]);

  useEffect(() => {
    loadBilling();
    reclassifyExistingVoiceNotes()
      .then(() => loadNotes(activeTab))
      .catch(() => loadNotes(activeTab));

    // Subscribe to native voice events
    const unsubscribe = subscribeToVoiceEvents({
      onPartial: (text) => {
        if (!selectedPlanForDetailRef.current) {
          setLiveTranscript(text);
        }
      },
      onFinal: async (text) => {
        // CRITICAL GUARD: If the user is currently dictating inside DayPlanDetailModal,
        // do not capture it here as a separate root voice note for today!
        if (selectedPlanForDetailRef.current) {
          return;
        }
        setLiveTranscript(text);
        if (text.trim()) {
          // Open Confirmation Preview Modal so user can review/edit before saving
          const extraction = extractTemporalAndActionItems(text.trim());
          setPendingTranscript(text.trim());
          setPendingExtraction(extraction);
          setConfirmModalVisible(true);
          setLiveTranscript('');
        }
      },
      onStateChange: (capturing) => {
        if (!selectedPlanForDetailRef.current) {
          setIsRecording(capturing);
        }
      },

      onError: (err) => {
        if (selectedPlanForDetailRef.current) return;
        setIsRecording(false);
        const isPerm = err.toLowerCase().includes('permission');
        setAlertTitle(isPerm ? 'Microphone Permission Required' : 'Voice Capture Notice');
        setAlertMessage(isPerm ? 'Please grant microphone access to capture voice notes offline.' : err);
        if (isPerm) {
          setAlertButtons([
            { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
            {
              text: 'Open Settings',
              style: 'default',
              onPress: () => {
                setAlertVisible(false);
                Linking.openSettings();
              },
            },
          ]);
        } else {
          setAlertButtons(undefined);
        }
        setAlertVisible(true);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.28, { duration: 650 }),
          withTiming(1.0, { duration: 650 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1.0, { duration: 250 });
    }
  }, [isRecording]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const loadBilling = async () => {
    try {
      const state = await getBillingState();
      setBillingState(state);
    } catch (e) {
      console.warn('Failed to load billing state:', e);
    }
  };

  const loadNotes = async (tab: TemporalTab) => {
    setLoading(true);
    try {
      const data = await getVoiceNotesByTemporalClass(tab);
      setNotes(data);
    } catch (e) {
      console.warn('Error loading voice notes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes(activeTab);
  }, [activeTab]);

  const toYMD = (d: Date | string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  const format12Hour = (hours: number, minutes: number): string => {
    let adjustedMinutes = minutes;
    let adjustedHours = hours;
    while (adjustedMinutes < 0) {
      adjustedMinutes += 60;
      adjustedHours -= 1;
    }
    while (adjustedMinutes >= 60) {
      adjustedMinutes -= 60;
      adjustedHours += 1;
    }
    adjustedHours = (adjustedHours % 24 + 24) % 24;
    const period = adjustedHours >= 12 ? 'PM' : 'AM';
    const displayHour = adjustedHours % 12 === 0 ? 12 : adjustedHours % 12;
    const displayMin = adjustedMinutes < 10 ? `0${adjustedMinutes}` : `${adjustedMinutes}`;
    return `${displayHour}:${displayMin} ${period}`;
  };

  const filteredNotes = React.useMemo(() => {
    if (isSemanticSearchActive && searchQuery.trim()) {
      return semanticSearchResults.map(res => ({
        ...res.note,
        _semanticMatch: res,
      }));
    }

    return notes.filter((n) => {
      // 0. Must match active tab
      if (n.temporalClass !== activeTab) {
        return false;
      }

      // 1. Date Filter (by scheduled date or created date)
      if (selectedDateFilter) {
        const scheduledKey = n.resolvedDatetime ? toYMD(n.resolvedDatetime) : null;
        const createdKey = toYMD(n.createdAt);
        if (scheduledKey) {
          if (scheduledKey !== selectedDateFilter) return false;
        } else {
          if (createdKey !== selectedDateFilter) return false;
        }
      }

      // 2. Text Query Filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const transcriptMatch = n.rawTranscript.toLowerCase().includes(q);
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const docMatch = (n.linkedDocName || '').toLowerCase().includes(q);
      const actionMatch = (n.actionItems || []).some((act) => {
        const text = typeof act === 'string' ? act : act?.text || '';
        return text.toLowerCase().includes(q);
      });
      return transcriptMatch || titleMatch || actionMatch || docMatch;
    });
  }, [notes, activeTab, selectedDateFilter, searchQuery, isSemanticSearchActive, semanticSearchResults]);


  const handleToggleRecord = async () => {
    // Check Pro / Trial access
    if (billingState && !billingState.hasProAccess) {
      setPaywallVisible(true);
      return;
    }

    if (isRecording) {
      const capturedSoFar = liveTranscript.trim();
      await stopVoiceCapture();
      setIsRecording(false);
      if (capturedSoFar) {
        const extraction = extractTemporalAndActionItems(capturedSoFar);
        setPendingTranscript(capturedSoFar);
        setPendingExtraction(extraction);
        setConfirmModalVisible(true);
        setLiveTranscript('');
      }
    } else {
      setLiveTranscript('');
      const started = await startVoiceCapture(locale);
      if (started) {
        setIsRecording(true);
      } else {
        setAlertTitle('Microphone Permission Needed');
        setAlertMessage('FileLensPro requires microphone access to record voice notes offline. If you previously denied permission, tap "Open Settings" to enable it.');
        setAlertButtons([
          { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
          {
            text: 'Open Settings',
            style: 'default',
            onPress: () => {
              setAlertVisible(false);
              Linking.openSettings();
            },
          },
        ]);
        setAlertVisible(true);
      }
    }
  };

  const handleSaveManualNote = async () => {
    if (!manualInput.trim()) return;
    const text = manualInput.trim();
    setManualInput('');
    setIsAddingManual(false);
    Keyboard.dismiss();

    // If targetPlanId is set, find the target plan's resolved date
    const targetPlan = targetPlanId ? notes.find(n => n.id === targetPlanId) : null;
    const refDate = targetPlan?.resolvedDatetime || (targetPlan?.temporalClass === 'today' ? undefined : targetPlan?.createdAt);

    // Open Confirmation Preview Modal so user can review/edit
    const extraction = extractTemporalAndActionItems(
      text,
      refDate ? { referenceDate: refDate } : undefined
    );
    if (targetPlan) {
      extraction.temporalClass = targetPlan.temporalClass;
      extraction.resolvedDatetime = targetPlan.resolvedDatetime;
    }
    setPendingTranscript(text);
    setPendingExtraction(extraction);
    setConfirmModalVisible(true);
  };

  const handleScanCardToBrain = async () => {
    // Check Pro / Trial access
    if (billingState && !billingState.hasProAccess) {
      setPaywallVisible(true);
      return;
    }

    try {
      // User explicitly required: Google Docs Camera ONLY
      const scanResult = await launchGoogleDocScanner();
      if (!scanResult || scanResult.canceled || !scanResult.success || !scanResult.pages || scanResult.pages.length === 0) {
        return;
      }

      const capturedPageUri = scanResult.pages[0];
      setPendingAttachedImageUri(capturedPageUri);

      // Run Native ML Kit OCR to extract text from card/document
      setLoading(true);
      try {
        const ocrResult = await ocrImage(capturedPageUri, 'eng+hin');
        const extractedText = (ocrResult?.text || '').trim();

        if (extractedText) {
          const extraction = extractTemporalAndActionItems(extractedText);
          setPendingTranscript(extractedText);
          setPendingExtraction(extraction);
        } else {
          // If no text could be recognized, still create note with image attached & prompt user
          const extraction = extractTemporalAndActionItems('Scanned Card / Document');
          setPendingTranscript('');
          setPendingExtraction(extraction);
        }
        setConfirmModalVisible(true);
      } catch (ocrErr) {
        console.warn('[SecondBrain] OCR on scanned card failed:', ocrErr);
        const extraction = extractTemporalAndActionItems('Scanned Card / Document');
        setPendingTranscript('');
        setPendingExtraction(extraction);
        setConfirmModalVisible(true);
      } finally {
        setLoading(false);
      }
    } catch (scannerErr: any) {
      console.warn('[SecondBrain] Google Document Scanner failed:', scannerErr);
      setAlertTitle('Scanner Error');
      setAlertMessage(scannerErr?.message || 'Google Document Scanner is not available on this device.');
      setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
    }
  };

  const handleQuickPasteFromClipboard = async () => {
    // Check Pro / Trial access
    if (billingState && !billingState.hasProAccess) {
      setPaywallVisible(true);
      return;
    }

    try {
      const clipText = await Clipboard.getStringAsync();
      if (clipText && clipText.trim()) {
        const trimmed = clipText.trim();
        const extraction = extractTemporalAndActionItems(trimmed);
        setPendingTranscript(trimmed);
        setPendingExtraction(extraction);
        setConfirmModalVisible(true);
      } else {
        setAlertTitle('Clipboard Empty');
        setAlertMessage('No text found in clipboard. Copy text from WhatsApp, SMS or email first.');
        setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
        setAlertVisible(true);
      }
    } catch (e) {
      console.warn('[SecondBrain] Clipboard read error:', e);
    }
  };

  const handleConfirmSaveVoiceNote = async (
    finalTranscript: string,
    overrides: Partial<TemporalExtractionResult>
  ) => {
    setConfirmModalVisible(false);
    if (!finalTranscript.trim()) return;

    setLoading(true);
    try {
      const saved = await processVoiceTranscript(finalTranscript.trim(), {
        targetVoiceNoteId: targetPlanId,
        extractionOverrides: overrides,
        linkedDocUri: params?.linkDocUri,
        linkedDocName: params?.linkDocName,
        linkedDocType: params?.linkDocType,
      });

      if (pendingAttachedImageUri && saved) {
        try {
          await attachImagesToVoiceNote(saved.id, [pendingAttachedImageUri]);
        } catch (attErr) {
          console.warn('[SecondBrain] Failed to attach shared intent image:', attErr);
        }
        setPendingAttachedImageUri(null);
      }

      setTargetPlanId(undefined);
      setPendingTranscript('');
      setPendingExtraction(null);

      // Clean up URL params if navigated from intent
      if (params?.sharedText || params?.sharedImageUri || params?.linkDocUri) {
        handledSharedTextRef.current = null;
        handledLinkDocRef.current = null;
      }

      await loadNotes(activeTab);
    } catch (e) {
      console.warn('Error saving confirmed voice note:', e);
    } finally {
      setLoading(false);
    }
  };


  const handleToggleActionItem = async (note: VoiceNoteRecord, index: number) => {
    try {
      await toggleActionItemCompletion(note.id, index);
      await loadNotes(activeTab);
    } catch (e) {
      console.warn('[second-brain] Error toggling action item:', e);
    }
  };

  const performDeleteActionItem = async (note: VoiceNoteRecord, index: number) => {
    const currentActions = normalizeActionItems(
      (note.actionItems && note.actionItems.length > 0)
        ? note.actionItems
        : getActionItemsFromRawTranscript(note.rawTranscript)
    );
    const newActions = currentActions.filter((_, i) => i !== index);
    await updateVoiceNoteActionItems(note.id, newActions as any);
    setSelectedPlanForDetail(prev => prev && prev.id === note.id ? { ...prev, actionItems: newActions } : prev);
    await loadNotes(activeTab);
  };

  const performDeleteActionItems = async (note: VoiceNoteRecord, indices: number[]) => {
    const currentActions = normalizeActionItems(
      (note.actionItems && note.actionItems.length > 0)
        ? note.actionItems
        : getActionItemsFromRawTranscript(note.rawTranscript)
    );
    const indexSet = new Set(indices);
    const newActions = currentActions.filter((_, i) => !indexSet.has(i));
    await updateVoiceNoteActionItems(note.id, newActions as any);
    setSelectedPlanForDetail(prev => prev && prev.id === note.id ? { ...prev, actionItems: newActions } : prev);
    await loadNotes(activeTab);
  };

  const handleDeleteActionItem = async (note: VoiceNoteRecord, index: number) => {
    const currentActions = normalizeActionItems(
      (note.actionItems && note.actionItems.length > 0)
        ? note.actionItems
        : getActionItemsFromRawTranscript(note.rawTranscript)
    );
    const itemText = currentActions[index]?.text || 'this task';
    setAlertTitle('Delete Task');
    setAlertMessage(`Are you sure you want to delete "${itemText}"?`);
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setAlertVisible(false);
          await performDeleteActionItem(note, index);
        },
      },
    ]);
    setAlertVisible(true);
  };

  const handleEditActionItem = async (note: VoiceNoteRecord, index: number, newText: string) => {
    if (!newText.trim()) return;
    const currentActions = normalizeActionItems(
      (note.actionItems && note.actionItems.length > 0)
        ? note.actionItems
        : getActionItemsFromRawTranscript(note.rawTranscript)
    );
    if (currentActions[index]) {
      currentActions[index].text = newText.trim();
    }
    await updateVoiceNoteActionItems(note.id, currentActions as any);
    await loadNotes(activeTab);
  };

  const handleAddActionItemToPlan = async (note: VoiceNoteRecord, newText: string) => {
    if (!newText.trim()) return;
    const currentActions = normalizeActionItems(
      (note.actionItems && note.actionItems.length > 0)
        ? note.actionItems
        : getActionItemsFromRawTranscript(note.rawTranscript)
    );
    const newActions = [
      ...currentActions,
      {
        id: String(Date.now()),
        text: newText.trim(),
        completed: false,
        dueDatetime: null,
      },
    ];
    await updateVoiceNoteActionItems(note.id, newActions as any);
    setSelectedPlanForDetail(prev => prev && prev.id === note.id ? { ...prev, actionItems: newActions } : prev);
    await loadNotes(activeTab);
  };

  useEffect(() => {
    if (selectedPlanForDetail) {
      const fresh = notes.find((n) => n.id === selectedPlanForDetail.id);
      if (fresh) {
        setSelectedPlanForDetail(fresh);
      } else {
        setSelectedPlanForDetail(null);
      }
    }
  }, [notes]);

  const handleDelete = async (id: number) => {
    setAlertTitle('Delete Note');
    setAlertMessage('Are you sure you want to delete this voice note and its tasks?');
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setAlertVisible(false);
          await deleteVoiceNoteById(id);
          await loadNotes(activeTab);
        },
      },
    ]);
    setAlertVisible(true);
  };


  const handleAttachImageToCard = (note: VoiceNoteRecord) => {
    setAlertTitle('Attach Photo / Document');
    setAlertMessage('Choose where to get the image or document for this note:');
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Document Scanner',
        style: 'default',
        onPress: async () => {
          setAlertVisible(false);
          try {
            const scanResult = await launchGoogleDocScanner();
            if (scanResult && scanResult.success && scanResult.pages && scanResult.pages.length > 0) {
              await attachImagesToVoiceNote(note.id, scanResult.pages);
              await loadNotes(activeTab);
            }
          } catch (e) {
            console.warn('[second-brain] Document Scanner error, falling back to camera:', e);
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status === 'granted') {
                const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  const uris = result.assets.map(a => a.uri);
                  await attachImagesToVoiceNote(note.id, uris);
                  await loadNotes(activeTab);
                }
              }
            } catch (err) {
              console.warn('[second-brain] Camera error:', err);
            }
          }
        },
      },
      {
        text: 'Gallery',
        style: 'default',
        onPress: async () => {
          setAlertVisible(false);
          try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              setAlertTitle('Permission Denied');
              setAlertMessage('Permission to access photos is needed to attach images.');
              setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
              setAlertVisible(true);
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsMultipleSelection: true,
              quality: 0.8,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const uris = result.assets.map(a => a.uri);
              await attachImagesToVoiceNote(note.id, uris);
              await loadNotes(activeTab);
            }
          } catch (e) {
            console.warn('[second-brain] Gallery error:', e);
          }
        },
      },
      {
        text: 'Files / PDF',
        style: 'default',
        onPress: async () => {
          setAlertVisible(false);
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: '*/*',
              multiple: true,
              copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const uris = result.assets.map(a => a.uri);
              await attachImagesToVoiceNote(note.id, uris);
              await loadNotes(activeTab);
            }
          } catch (e) {
            console.warn('[second-brain] Document picker error:', e);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setAlertTitle('Copied');
    setAlertMessage('Transcript copied to clipboard.');
    setAlertVisible(true);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: COLORS.bg }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top App Bar */}
        <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: COLORS.text }]} numberOfLines={1}>Brain</Text>
              <NativeScaleButton
                style={[styles.proBadge, { backgroundColor: COLORS.accent, flexShrink: 0 }]}
                onPress={() => setPaywallVisible(true)}
              >
                <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                <Text style={styles.proBadgeText}>
                  {billingState?.isSubscribed ? 'PRO' : `${billingState?.trialDaysRemaining ?? 30}D FREE`}
                </Text>
              </NativeScaleButton>
            </View>
            <Text style={[styles.subtitle, { color: COLORS.muted }]} numberOfLines={1}>
              Offline spoken capture • Hindi & English
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Awareness Bell */}
            <NativeScaleButton
              style={[
                styles.headerActionBtn,
                {
                  borderColor: isAwarenessActive ? '#10B981' : COLORS.border,
                  backgroundColor: isAwarenessActive ? '#10B98120' : COLORS.surface2,
                }
              ]}
              onPress={handleToggleAwarenessBell}
              accessibilityLabel="Day Plan Awareness Bell"
            >
              <Ionicons
                name={isAwarenessActive ? "notifications" : "notifications-outline"}
                size={17}
                color={isAwarenessActive ? "#10B981" : COLORS.text}
              />
            </NativeScaleButton>

            {/* Automated 8:00 AM Morning Daily Digest Toggle */}
            <NativeScaleButton
              style={[
                styles.headerActionBtn,
                {
                  borderColor: isMorningDigestEnabled ? '#F59E0B' : COLORS.border,
                  backgroundColor: isMorningDigestEnabled ? '#F59E0B20' : COLORS.surface2,
                }
              ]}
              onPress={handleToggleMorningDigest}
              accessibilityLabel="Morning Daily Digest at 8:00 AM"
            >
              <Ionicons
                name={isMorningDigestEnabled ? "sunny" : "sunny-outline"}
                size={17}
                color={isMorningDigestEnabled ? "#F59E0B" : COLORS.text}
              />
            </NativeScaleButton>

            {/* Multilingual Semantic AI Model Management Button */}
            <NativeScaleButton
              style={[
                styles.headerActionBtn,
                {
                  borderColor: isAiModelActive ? COLORS.accent : COLORS.border,
                  backgroundColor: isAiModelActive ? COLORS.accent + '20' : COLORS.surface2,
                }
              ]}
              onPress={() => setAiDownloadModalVisible(true)}
              accessibilityLabel="Multilingual Semantic AI Model"
            >
              <Ionicons
                name={isAiModelActive ? "sparkles" : "sparkles-outline"}
                size={17}
                color={isAiModelActive ? COLORS.accent : COLORS.muted}
              />
            </NativeScaleButton>

            <HeaderMenuButton />
          </View>
        </View>

        {/* Mic Capture Section */}
        <View style={[styles.captureSection, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
          <View style={styles.micRow}>
            <Reanimated.View style={[styles.pulseCircle, animatedPulseStyle]}>
              <NativeScaleButton
                style={[styles.micButton, { backgroundColor: isRecording ? '#EF4444' : COLORS.accent }]}
                onPress={handleToggleRecord}
                scaleTo={0.92}
              >
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={32} color="#FFFFFF" />
              </NativeScaleButton>
            </Reanimated.View>

            <View style={styles.micTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.micStatusText, { color: isRecording ? '#EF4444' : COLORS.text, flex: 1 }]}>
                  {isRecording ? 'Listening offline... tap to finish' : 'Tap to speak a plan, task, or note'}
                </Text>
                {/* Dedicated Speech Recognition Language Selector */}
                <NativeScaleButton
                  style={[
                    styles.langToggle,
                    {
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.surface2,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginLeft: 8,
                    }
                  ]}
                  onPress={() => setLangModalVisible(true)}
                  accessibilityLabel="Select voice recognition language"
                >
                  <Text style={[styles.langText, { color: COLORS.text, fontSize: 11 }]}>
                    {currentLang.flag} {currentLang.name.split(' ')[0]}
                  </Text>
                  <Ionicons name="chevron-down" size={10} color={COLORS.muted} style={{ marginLeft: 3 }} />
                </NativeScaleButton>
              </View>

              <Text style={[styles.micHintText, { color: COLORS.muted }]}>
                {isRecording
                  ? 'Auto-stops after 35s of silence'
                  : 'e.g. "Meeting tomorrow at 10 AM" / "कल सुबह 10 बजे मीटिंग"'}
              </Text>
            </View>
          </View>

          {/* Live partial transcript streaming */}
          {liveTranscript.length > 0 && (
            <Reanimated.View
              entering={FadeIn.duration(200)}
              style={[styles.liveBox, { backgroundColor: COLORS.surface2 }]}
            >
              <Ionicons name="recording-outline" size={16} color={COLORS.accent} />
              <Text style={[styles.liveText, { color: COLORS.text }]} numberOfLines={3}>
                {liveTranscript}
              </Text>
            </Reanimated.View>
          )}
        </View>

        {/* Temporal Query Surfaces Tabs */}
        <View style={[styles.tabBar, { borderBottomColor: COLORS.border }]}>
          <TabButton
            label="Today's Plan"
            icon="today"
            active={activeTab === 'today'}
            onPress={() => {
              setActiveTab('today');
              if (selectedDateFilter && selectedDateFilter !== toYMD(new Date())) {
                setSelectedDateFilter(null);
              }
            }}
            colors={COLORS}
          />
          <TabButton
            label="Upcoming"
            icon="calendar"
            active={activeTab === 'future'}
            onPress={() => {
              setActiveTab('future');
              if (selectedDateFilter && selectedDateFilter <= toYMD(new Date())) {
                setSelectedDateFilter(null);
              }
            }}
            colors={COLORS}
          />
          <TabButton
            label="History & Recall"
            icon="time"
            active={activeTab === 'historical'}
            onPress={() => {
              setActiveTab('historical');
              if (selectedDateFilter && selectedDateFilter >= toYMD(new Date())) {
                setSelectedDateFilter(null);
              }
            }}
            colors={COLORS}
          />
        </View>

        {/* In-Brain Realtime Search Filter Bar (Text + AI Semantic + Calendar Date Filter) */}
        <View style={[styles.inBrainSearchBox, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
          <Ionicons name={isSemanticSearchActive ? "sparkles" : "search"} size={16} color={isSemanticSearchActive ? COLORS.accent : COLORS.dim} />
          <TextInput
            style={[styles.inBrainSearchInput, { color: COLORS.text }]}
            placeholder={isSemanticSearchActive ? "Ask AI: 'show fees, electricity, bills...'" : "Search tasks, voice notes..."}
            placeholderTextColor={COLORS.dim}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color={COLORS.dim} />
            </TouchableOpacity>
          )}

          {/* AI Semantic Search Mode Toggle */}
          <TouchableOpacity
            style={[
              styles.semanticToggleBtn,
              {
                backgroundColor: isSemanticSearchActive ? COLORS.accent : COLORS.surface2,
                borderColor: isSemanticSearchActive ? COLORS.accent : COLORS.border,
              }
            ]}
            onPress={() => setIsSemanticSearchActive(!isSemanticSearchActive)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSemanticSearchActive ? "hardware-chip" : "hardware-chip-outline"}
              size={13}
              color={isSemanticSearchActive ? "#FFFFFF" : COLORS.text}
            />
            <Text
              style={[
                styles.semanticToggleText,
                { color: isSemanticSearchActive ? "#FFFFFF" : COLORS.text }
              ]}
            >
              {isSearchingSemantics ? '...' : 'AI'}
            </Text>
          </TouchableOpacity>

          {/* Date Picker Button */}
          <TouchableOpacity
            style={[
              styles.datePickerTriggerBtn,
              {
                backgroundColor: selectedDateFilter ? COLORS.accent + '20' : COLORS.surface2,
                borderColor: selectedDateFilter ? COLORS.accent : COLORS.border,
              },
            ]}
            onPress={() => setDatePickerModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={selectedDateFilter ? 'calendar' : 'calendar-outline'}
              size={15}
              color={selectedDateFilter ? COLORS.accent : COLORS.text}
            />
            <Text
              style={[
                styles.datePickerTriggerText,
                { color: selectedDateFilter ? COLORS.accent : COLORS.text },
              ]}
            >
              {selectedDateFilter ? selectedDateFilter : 'Pick Date'}
            </Text>
            {selectedDateFilter ? (
              <TouchableOpacity
                onPress={() => setSelectedDateFilter(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={14} color={COLORS.accent} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Notes List */}
        {loading ? (
          <View style={styles.loaderCenter}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        ) : filteredNotes.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Ionicons
              name={activeTab === 'today' ? 'checkbox-outline' : activeTab === 'future' ? 'calendar-outline' : 'archive-outline'}
              size={54}
              color={COLORS.dim}
            />
            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
              {searchQuery.trim() || selectedDateFilter
                ? 'No matching notes or tasks found'
                : activeTab === 'today'
                ? 'Nothing planned for today yet'
                : activeTab === 'future'
                ? 'No upcoming commitments'
                : 'No past voice notes'}
            </Text>
            <Text style={[styles.emptyDesc, { color: COLORS.muted }]}>
              {searchQuery.trim() || selectedDateFilter
                ? `Filter active: ${[searchQuery ? `"${searchQuery}"` : null, selectedDateFilter ? `Date ${selectedDateFilter}` : null].filter(Boolean).join(' + ')}. Tap clear to reset.`
                : 'Tap the microphone above to speak in English, Hindi, or Hinglish.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredNotes}
            keyExtractor={(item) => item.id.toString()}
            style={{ flex: 1 }}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item, index }) => (
              <VoiceNoteCard
                item={item}
                index={index}
                colors={COLORS}
                onPress={() => setSelectedPlanForDetail(item)}
                onDelete={() => handleDelete(item.id)}
                onCopy={() => handleCopy(item.rawTranscript)}
                onAddToPlan={() => {
                  setTargetPlanId(item.id);
                  setIsAddingManual(true);
                }}
                onToggleActionItem={(idx) => handleToggleActionItem(item, idx)}
                onDeleteActionItem={(idx) => handleDeleteActionItem(item, idx)}
                onEditActionItem={(idx, text) => handleEditActionItem(item, idx, text)}
                onAttachImage={() => handleAttachImageToCard(item)}
                onLinkDoc={() => handleOpenLinkModal(item)}
                onUnlinkDoc={() => handleUnlinkDoc(item)}
                cardsPool={allCardsForSuggestions}
                onLinkDocDirect={handleDirectLinkCard}
              />
            )}
          />
        )}


        {/* Single 3-in-1 Unified Add Button */}
        <NativeScaleButton
          style={[styles.unifiedAddBtn, { backgroundColor: COLORS.accent }]}
          onPress={() => setQuickAddMenuVisible(true)}
          scaleTo={0.94}
        >
          <Ionicons name="add-circle" size={20} color="#FFFFFF" />
          <Text style={styles.unifiedAddBtnText}>Add Note / Scan Card</Text>
          <Ionicons name="chevron-up" size={14} color="#FFFFFF" />
        </NativeScaleButton>
      </KeyboardAvoidingView>

      {/* 3-in-1 Quick Action Menu Modal */}
      <Modal
        visible={quickAddMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickAddMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setQuickAddMenuVisible(false)}
        >
          <AnimatedModalSheet
            style={[styles.quickAddMenuBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <View style={styles.quickAddMenuHandle} />
            <Text style={[styles.quickAddMenuTitle, { color: COLORS.text }]}>Add to Second Brain</Text>
            <Text style={[styles.quickAddMenuSubtitle, { color: COLORS.muted }]}>
              Select how you want to add this note, card, or plan
            </Text>

            {/* Option 1: Google Docs Camera Document Scanner */}
            <TouchableOpacity
              style={[styles.quickAddOptionItem, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={() => {
                setQuickAddMenuVisible(false);
                setTimeout(handleScanCardToBrain, 180);
              }}
            >
              <View style={[styles.quickAddIconBox, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="camera" size={22} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.quickAddOptionTitle, { color: COLORS.text }]}>Scan Card / Document</Text>
                <Text style={[styles.quickAddOptionDesc, { color: COLORS.muted }]}>
                  Google Docs Camera with edge detection & instant OCR
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.dim} />
            </TouchableOpacity>

            {/* Option 2: Type Note Manually */}
            <TouchableOpacity
              style={[styles.quickAddOptionItem, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={() => {
                setQuickAddMenuVisible(false);
                setTargetPlanId(undefined);
                setTimeout(() => setIsAddingManual(true), 180);
              }}
            >
              <View style={[styles.quickAddIconBox, { backgroundColor: COLORS.text + '15' }]}>
                <Ionicons name="create-outline" size={22} color={COLORS.text} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.quickAddOptionTitle, { color: COLORS.text }]}>Type Note or Plan</Text>
                <Text style={[styles.quickAddOptionDesc, { color: COLORS.muted }]}>
                  Write manually in Hindi, English, or Hinglish
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.dim} />
            </TouchableOpacity>

            {/* Option 3: Paste from Clipboard */}
            <TouchableOpacity
              style={[styles.quickAddOptionItem, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={() => {
                setQuickAddMenuVisible(false);
                setTimeout(handleQuickPasteFromClipboard, 180);
              }}
            >
              <View style={[styles.quickAddIconBox, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="clipboard-outline" size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.quickAddOptionTitle, { color: COLORS.text }]}>Paste from Clipboard</Text>
                <Text style={[styles.quickAddOptionDesc, { color: COLORS.muted }]}>
                  Extract tasks & schedule from WhatsApp or SMS
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.dim} />
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity
              style={[styles.quickAddCancelBtn, { borderColor: COLORS.border }]}
              onPress={() => setQuickAddMenuVisible(false)}
            >
              <Text style={[styles.quickAddCancelText, { color: COLORS.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </AnimatedModalSheet>
        </TouchableOpacity>
      </Modal>

      {/* Type Note Modal - Guaranteed 100% visible above keyboard */}
      <Modal
        visible={isAddingManual}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setIsAddingManual(false);
          setTargetPlanId(undefined);
          Keyboard.dismiss();
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              setIsAddingManual(false);
              setTargetPlanId(undefined);
              Keyboard.dismiss();
            }}
          />
          <View style={[styles.typeNoteModalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={styles.typeNoteHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeNoteTitle, { color: COLORS.text }]}>
                  {targetPlanId ? "Add Task to Day's Plan" : "Type a Note or Plan"}
                </Text>
                <Text style={[styles.typeNoteSubtitle, { color: COLORS.muted }]}>
                  {targetPlanId ? "Item will be appended to selected date" : "Supports Hindi, English & exact times"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setIsAddingManual(false);
                  setTargetPlanId(undefined);
                  Keyboard.dismiss();
                }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Paste from Clipboard Quick Action */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.typeNotePasteChip, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                onPress={async () => {
                  try {
                    const text = await Clipboard.getStringAsync();
                    if (text && text.trim()) {
                      setManualInput((prev) => (prev.trim() ? `${prev}\n${text.trim()}` : text.trim()));
                    } else {
                      setAlertTitle('Clipboard Empty');
                      setAlertMessage('No text found in clipboard. Copy text from WhatsApp, SMS or email first.');
                      setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
                      setAlertVisible(true);
                    }
                  } catch (e) {
                    console.warn('[second-brain] Clipboard paste error:', e);
                  }
                }}
              >
                <Ionicons name="clipboard-outline" size={13} color={COLORS.accent} />
                <Text style={[styles.typeNotePasteChipText, { color: COLORS.accent }]}>Paste from Clipboard</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.typeNoteInput,
                { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface2 },
              ]}
              placeholder={
                targetPlanId
                  ? 'e.g. Project review at 5:00 PM / क्लाइंट को मेल भेजना है...'
                  : 'e.g. Pick up vehicle tomorrow at 10:00 AM / कल सुबह 10:00 बजे गाड़ी लेने जाना है...'
              }
              placeholderTextColor={COLORS.dim}
              value={manualInput}
              onChangeText={setManualInput}
              multiline
              autoFocus
            />

            <View style={styles.typeNoteActions}>
              <TouchableOpacity
                style={[styles.typeNoteCancelBtn, { borderColor: COLORS.border }]}
                onPress={() => {
                  setIsAddingManual(false);
                  setTargetPlanId(undefined);
                  Keyboard.dismiss();
                }}
              >
                <Text style={[styles.typeNoteCancelText, { color: COLORS.muted }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeNoteSubmitBtn,
                  { backgroundColor: manualInput.trim() ? COLORS.accent : COLORS.dim },
                ]}
                disabled={!manualInput.trim()}
                onPress={handleSaveManualNote}
              >
                <Text style={styles.typeNoteSubmitText}>Review & Save</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.langModalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={[styles.langModalHeader, { borderBottomColor: COLORS.border }]}>
              <View>
                <Text style={[styles.langModalTitle, { color: COLORS.text }]}>Voice Language</Text>
                <Text style={[styles.langModalSubtitle, { color: COLORS.muted }]}>
                  Choose from 28+ worldwide languages
                </Text>
              </View>
              <TouchableOpacity onPress={() => setLangModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Language Search */}
            <View style={[styles.langSearchBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="search" size={16} color={COLORS.dim} />
              <TextInput
                style={[styles.langSearchInput, { color: COLORS.text }]}
                placeholder="Search language (e.g. Hindi, English, Spanish)..."
                placeholderTextColor={COLORS.dim}
                value={langSearch}
                onChangeText={setLangSearch}
              />
              {langSearch.length > 0 && (
                <TouchableOpacity onPress={() => setLangSearch('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.dim} />
                </TouchableOpacity>
              )}
            </View>

            {/* Language List */}
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {WORLD_LANGUAGES.filter(
                (l) =>
                  l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
                  l.nativeName.toLowerCase().includes(langSearch.toLowerCase()) ||
                  l.code.toLowerCase().includes(langSearch.toLowerCase())
              ).map((lang) => {
                const isSelected = locale === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langItemRow,
                      { borderBottomColor: COLORS.border },
                      isSelected && { backgroundColor: COLORS.surface2 },
                    ]}
                    onPress={() => {
                      setLocale(lang.code);
                      setLangModalVisible(false);
                      setLangSearch('');
                    }}
                  >
                    <Text style={styles.langFlag}>{lang.flag}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.langItemName, { color: COLORS.text, fontWeight: isSelected ? '700' : '500' }]}>
                        {lang.name}
                      </Text>
                      <Text style={[styles.langItemNative, { color: COLORS.muted }]}>{lang.nativeName}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Voice Note Confirmation & Verification Modal */}
      {pendingExtraction && (
        <VoiceNoteConfirmModal
          visible={confirmModalVisible}
          initialTranscript={pendingTranscript}
          initialExtraction={pendingExtraction}
          attachedImageUri={pendingAttachedImageUri}
          onRemoveAttachedImage={() => setPendingAttachedImageUri(null)}
          colors={COLORS}
          targetPlanTitle={
            targetPlanId
              ? notes.find((n) => n.id === targetPlanId)?.resolvedDatetime
                ? `Plan for ${new Date(notes.find((n) => n.id === targetPlanId)!.resolvedDatetime!).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                : "Selected Day's Plan"
              : undefined
          }
          onConfirm={handleConfirmSaveVoiceNote}
          onDiscard={() => {
            setConfirmModalVisible(false);
            setPendingTranscript('');
            setPendingExtraction(null);
            setTargetPlanId(undefined);
            setPendingAttachedImageUri(null);
            if (params?.sharedText || params?.sharedImageUri) {
              router.replace('/second-brain');
            }
          }}
        />
      )}

      {/* Subscription Paywall Modal */}
      <SubscriptionModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSuccess={() => {
          loadBilling();
          setPaywallVisible(false);
        }}
      />

      {/* Day Plan Detail & Full Checklist Modal */}
      {selectedPlanForDetail && (
        <DayPlanDetailModal
          visible={!!selectedPlanForDetail}
          item={selectedPlanForDetail}
          colors={COLORS}
          onClose={() => setSelectedPlanForDetail(null)}
          onToggleActionItem={(idx) => {
            if (selectedPlanForDetail) {
              handleToggleActionItem(selectedPlanForDetail, idx);
            }
          }}
          onDeleteActionItem={(idx) => {
            if (selectedPlanForDetail) {
              performDeleteActionItem(selectedPlanForDetail, idx);
            }
          }}
          onDeleteActionItems={(indices) => {
            if (selectedPlanForDetail) {
              performDeleteActionItems(selectedPlanForDetail, indices);
            }
          }}
          onEditActionItem={(idx, text) => {
            if (selectedPlanForDetail) {
              handleEditActionItem(selectedPlanForDetail, idx, text);
            }
          }}
          onAddActionItem={(text) => {
            if (selectedPlanForDetail) {
              handleAddActionItemToPlan(selectedPlanForDetail, text);
            }
          }}
          onAddVoiceNoteToPlan={async (spokenText) => {
            if (selectedPlanForDetail) {
              await handleAddActionItemToPlan(selectedPlanForDetail, spokenText);
            }
          }}
          onAttachImages={async (uris) => {
            if (selectedPlanForDetail) {
              await attachImagesToVoiceNote(selectedPlanForDetail.id, uris);
              const currentUris = selectedPlanForDetail.imageUris || [];
              const merged = Array.from(new Set([...currentUris, ...uris]));
              setSelectedPlanForDetail({
                ...selectedPlanForDetail,
                imageUris: merged,
              });
              await loadNotes(activeTab);
            }
          }}
          onUpdateAttachments={async (uris) => {
            if (selectedPlanForDetail) {
              await updateVoiceNoteRecord(selectedPlanForDetail.id, {
                temporalClass: selectedPlanForDetail.temporalClass,
                resolvedDatetime: selectedPlanForDetail.resolvedDatetime,
                actionItems: selectedPlanForDetail.actionItems,
                isReminderSet: selectedPlanForDetail.isReminderSet,
                imageUris: uris,
                rawTranscript: selectedPlanForDetail.rawTranscript,
              });
              setSelectedPlanForDetail({
                ...selectedPlanForDetail,
                imageUris: uris,
              });
              await loadNotes(activeTab);
            }
          }}
          onDeletePlan={() => {
            if (selectedPlanForDetail) {
              const id = selectedPlanForDetail.id;
              setSelectedPlanForDetail(null);
              handleDelete(id);
            }
          }}
          onChangeDate={() => {
            if (selectedPlanForDetail) {
              setPlanDateChangeTarget(selectedPlanForDetail);
              const targetDate = selectedPlanForDetail.resolvedDatetime
                ? new Date(selectedPlanForDetail.resolvedDatetime)
                : new Date();
              setRescheduleDate(targetDate);
              setPickerCalendarMonth(new Date(targetDate));
              let h = targetDate.getHours();
              const period = h >= 12 ? 'PM' : 'AM';
              h = h % 12;
              if (h === 0) h = 12;
              setRescheduleHour(h);
              setRescheduleMinute(targetDate.getMinutes());
              setReschedulePeriod(period);
              setDatePickerModalVisible(true);
            }
          }}
          onRenamePlan={async (newTitle) => {
            if (selectedPlanForDetail) {
              await updateVoiceNoteTitle(selectedPlanForDetail.id, newTitle);
              setSelectedPlanForDetail(prev => prev ? { ...prev, title: newTitle } : prev);
              await loadNotes(activeTab);
            }
          }}
          onCopyTranscript={handleCopy}
        />
      )}

      {/* Alert Modal */}
      <ThemedAlertModal
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onClose={() => setAlertVisible(false)}
      />

      {/* Interactive Date Picker Modal (Used for both Filtering and Rescheduling Plans) */}
      <Modal
        visible={datePickerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDatePickerModalVisible(false);
          setPlanDateChangeTarget(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setDatePickerModalVisible(false);
            setPlanDateChangeTarget(null);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.calendarModalBox,
              { backgroundColor: COLORS.surface, borderColor: COLORS.border, maxHeight: '85%' },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={[styles.calendarHeader, { borderBottomColor: COLORS.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.calendarTitle, { color: COLORS.text }]}>
                    {planDateChangeTarget ? 'Reschedule Day Plan' : 'Filter by Date'}
                  </Text>
                  <Text style={[styles.calendarSubtitle, { color: COLORS.muted }]}>
                    {planDateChangeTarget
                      ? 'Choose the new date and exact reminder alarm time'
                      : 'Find tasks & voice notes for a specific day'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setDatePickerModalVisible(false);
                    setPlanDateChangeTarget(null);
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={22} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {/* Quick Presets */}
              <View style={styles.calendarPresetsRow}>
                <TouchableOpacity
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: (planDateChangeTarget && toYMD(rescheduleDate) === toYMD(new Date()))
                        ? COLORS.accent
                        : COLORS.surface2,
                      borderColor: (planDateChangeTarget && toYMD(rescheduleDate) === toYMD(new Date()))
                        ? COLORS.accent
                        : COLORS.border,
                    },
                  ]}
                  onPress={async () => {
                    const today = new Date();
                    if (planDateChangeTarget) {
                      setRescheduleDate(today);
                      setPickerCalendarMonth(new Date(today));
                    } else {
                      setSelectedDateFilter(toYMD(today));
                      setActiveTab('today');
                      setDatePickerModalVisible(false);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      {
                        color: (planDateChangeTarget && toYMD(rescheduleDate) === toYMD(new Date()))
                          ? '#FFFFFF'
                          : COLORS.text,
                      },
                    ]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: (() => {
                        const tm = new Date();
                        tm.setDate(tm.getDate() + 1);
                        return (planDateChangeTarget && toYMD(rescheduleDate) === toYMD(tm))
                          ? COLORS.accent
                          : COLORS.surface2;
                      })(),
                      borderColor: (() => {
                        const tm = new Date();
                        tm.setDate(tm.getDate() + 1);
                        return (planDateChangeTarget && toYMD(rescheduleDate) === toYMD(tm))
                          ? COLORS.accent
                          : COLORS.border;
                      })(),
                    },
                  ]}
                  onPress={async () => {
                    const tm = new Date();
                    tm.setDate(tm.getDate() + 1);
                    if (planDateChangeTarget) {
                      setRescheduleDate(tm);
                      setPickerCalendarMonth(new Date(tm));
                    } else {
                      setSelectedDateFilter(toYMD(tm));
                      setActiveTab('future');
                      setDatePickerModalVisible(false);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      {
                        color: (() => {
                          const tm = new Date();
                          tm.setDate(tm.getDate() + 1);
                          return (planDateChangeTarget && toYMD(rescheduleDate) === toYMD(tm))
                            ? '#FFFFFF'
                            : COLORS.text;
                        })(),
                      },
                    ]}
                  >
                    Tomorrow
                  </Text>
                </TouchableOpacity>

                {!planDateChangeTarget && (
                  <TouchableOpacity
                    style={[
                      styles.presetChip,
                      { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                    ]}
                    onPress={() => {
                      const yest = new Date();
                      yest.setDate(yest.getDate() - 1);
                      setSelectedDateFilter(toYMD(yest));
                      setActiveTab('historical');
                      setDatePickerModalVisible(false);
                    }}
                  >
                    <Text style={[styles.presetChipText, { color: COLORS.text }]}>Yesterday</Text>
                  </TouchableOpacity>
                )}

                {selectedDateFilter && !planDateChangeTarget && (
                  <TouchableOpacity
                    style={[
                      styles.presetChip,
                      { backgroundColor: COLORS.danger + '15', borderColor: COLORS.danger },
                    ]}
                    onPress={() => {
                      setSelectedDateFilter(null);
                      setDatePickerModalVisible(false);
                    }}
                  >
                    <Text style={[styles.presetChipText, { color: COLORS.danger }]}>Clear Filter</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Month Navigation */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity
                  onPress={() => {
                    const prev = new Date(pickerCalendarMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setPickerCalendarMonth(prev);
                  }}
                  style={styles.monthNavBtn}
                >
                  <Ionicons name="chevron-back" size={20} color={COLORS.text} />
                </TouchableOpacity>

                <Text style={[styles.monthNavLabel, { color: COLORS.text }]}>
                  {pickerCalendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    const next = new Date(pickerCalendarMonth);
                    next.setMonth(next.getMonth() + 1);
                    setPickerCalendarMonth(next);
                  }}
                  style={styles.monthNavBtn}
                >
                  <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {/* Day of Week Headers */}
              <View style={styles.weekDaysHeader}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <Text key={i} style={[styles.weekDayText, { color: COLORS.muted }]}>
                    {day}
                  </Text>
                ))}
              </View>

              {/* Calendar Days Grid */}
              <View style={styles.daysGrid}>
                {(() => {
                  const year = pickerCalendarMonth.getFullYear();
                  const month = pickerCalendarMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells: React.ReactNode[] = [];

                  // Blank cells before first day
                  for (let b = 0; b < firstDay; b++) {
                    cells.push(<View key={`b-${b}`} style={styles.calendarDayCell} />);
                  }

                  const todayStr = toYMD(new Date());
                  const targetPlanDateStr = planDateChangeTarget ? toYMD(rescheduleDate) : null;

                  for (let d = 1; d <= daysInMonth; d++) {
                    const cellDate = new Date(year, month, d);
                    const cellDateStr = toYMD(cellDate);
                    const isSelected = planDateChangeTarget
                      ? targetPlanDateStr === cellDateStr
                      : selectedDateFilter === cellDateStr;
                    const isToday = todayStr === cellDateStr;

                    cells.push(
                      <TouchableOpacity
                        key={`day-${d}`}
                        style={[
                          styles.calendarDayCell,
                          isSelected && { backgroundColor: COLORS.accent, borderRadius: 18 },
                          !isSelected && isToday && { borderWidth: 1, borderColor: COLORS.accent, borderRadius: 18 },
                        ]}
                        onPress={async () => {
                          if (planDateChangeTarget) {
                            setRescheduleDate(cellDate);
                          } else {
                            setSelectedDateFilter(cellDateStr);
                            const todayStr = toYMD(new Date());
                            if (cellDateStr === todayStr) {
                              setActiveTab('today');
                            } else if (cellDateStr > todayStr) {
                              setActiveTab('future');
                            } else {
                              setActiveTab('historical');
                            }
                            setDatePickerModalVisible(false);
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            {
                              color: isSelected
                                ? '#FFFFFF'
                                : isToday
                                ? COLORS.accent
                                : COLORS.text,
                              fontWeight: isSelected || isToday ? '700' : '400',
                            },
                          ]}
                        >
                          {d}
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  return cells;
                })()}
              </View>

              {/* Time Selection & Pre-Reminder (Only when Rescheduling) */}
              {planDateChangeTarget && (
                <View style={styles.rescheduleTimeSection}>
                  <View style={[styles.timeDivider, { backgroundColor: COLORS.border }]} />

                  <View style={styles.rescheduleSectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="alarm-outline" size={17} color={COLORS.accent} />
                      <Text style={[styles.rescheduleSectionTitle, { color: COLORS.text }]}>Reminder Time</Text>
                    </View>
                    <Text style={[styles.rescheduleSelectedTimeText, { color: COLORS.accent }]}>
                      {format12Hour(rescheduleHour % 12 + (reschedulePeriod === 'PM' ? 12 : 0), rescheduleMinute)}
                    </Text>
                  </View>

                  {/* Quick Time Preset Chips */}
                  <View style={styles.quickTimesRow}>
                    {[
                      { label: '9:00 AM', h: 9, m: 0, p: 'AM' as const },
                      { label: '12:00 PM', h: 12, m: 0, p: 'PM' as const },
                      { label: '3:00 PM', h: 3, m: 0, p: 'PM' as const },
                      { label: '6:00 PM', h: 6, m: 0, p: 'PM' as const },
                      { label: '8:30 PM', h: 8, m: 30, p: 'PM' as const },
                    ].map((preset) => {
                      const isTimeActive =
                        rescheduleHour === preset.h &&
                        rescheduleMinute === preset.m &&
                        reschedulePeriod === preset.p;
                      return (
                        <TouchableOpacity
                          key={preset.label}
                          style={[
                            styles.quickTimeChip,
                            {
                              backgroundColor: isTimeActive ? COLORS.accent : COLORS.surface2,
                              borderColor: isTimeActive ? COLORS.accent : COLORS.border,
                            },
                          ]}
                          onPress={() => {
                            setRescheduleHour(preset.h);
                            setRescheduleMinute(preset.m);
                            setReschedulePeriod(preset.p);
                          }}
                        >
                          <Text
                            style={[
                              styles.quickTimeChipText,
                              { color: isTimeActive ? '#FFFFFF' : COLORS.text, fontWeight: isTimeActive ? '700' : '500' },
                            ]}
                          >
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Custom Steppers: Hour, Minute, AM/PM */}
                  <View style={[styles.timeStepperBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
                    {/* Hour Stepper */}
                    <View style={styles.stepperGroup}>
                      <Text style={[styles.stepperLabel, { color: COLORS.muted }]}>Hour</Text>
                      <View style={styles.stepperControls}>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: COLORS.surface }]}
                          onPress={() => setRescheduleHour((h) => (h === 1 ? 12 : h - 1))}
                        >
                          <Ionicons name="remove" size={16} color={COLORS.text} />
                        </TouchableOpacity>
                        <Text style={[styles.stepperValText, { color: COLORS.text }]}>
                          {rescheduleHour < 10 ? `0${rescheduleHour}` : rescheduleHour}
                        </Text>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: COLORS.surface }]}
                          onPress={() => setRescheduleHour((h) => (h === 12 ? 1 : h + 1))}
                        >
                          <Ionicons name="add" size={16} color={COLORS.text} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={[styles.stepperColon, { color: COLORS.muted }]}>:</Text>

                    {/* Minute Stepper */}
                    <View style={styles.stepperGroup}>
                      <Text style={[styles.stepperLabel, { color: COLORS.muted }]}>Minute</Text>
                      <View style={styles.stepperControls}>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: COLORS.surface }]}
                          onPress={() => setRescheduleMinute((m) => (m <= 0 ? 59 : m - 1))}
                        >
                          <Ionicons name="remove" size={16} color={COLORS.text} />
                        </TouchableOpacity>
                        <Text style={[styles.stepperValText, { color: COLORS.text }]}>
                          {rescheduleMinute < 10 ? `0${rescheduleMinute}` : rescheduleMinute}
                        </Text>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: COLORS.surface }]}
                          onPress={() => setRescheduleMinute((m) => (m >= 59 ? 0 : m + 1))}
                        >
                          <Ionicons name="add" size={16} color={COLORS.text} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* AM/PM Toggle */}
                    <View style={styles.periodToggleGroup}>
                      <TouchableOpacity
                        style={[
                          styles.periodBtn,
                          reschedulePeriod === 'AM' && { backgroundColor: COLORS.accent },
                        ]}
                        onPress={() => setReschedulePeriod('AM')}
                      >
                        <Text style={[styles.periodBtnText, { color: reschedulePeriod === 'AM' ? '#FFFFFF' : COLORS.text }]}>
                          AM
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.periodBtn,
                          reschedulePeriod === 'PM' && { backgroundColor: COLORS.accent },
                        ]}
                        onPress={() => setReschedulePeriod('PM')}
                      >
                        <Text style={[styles.periodBtnText, { color: reschedulePeriod === 'PM' ? '#FFFFFF' : COLORS.text }]}>
                          PM
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Pre-Reminder Notice Banner */}
                  <View style={[styles.preReminderNoticeCard, { backgroundColor: COLORS.accent + '12', borderColor: COLORS.accent + '35' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="alarm" size={14} color={COLORS.accent} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>
                        Sharp Alarm: {rescheduleDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} at {format12Hour(rescheduleHour % 12 + (reschedulePeriod === 'PM' ? 12 : 0), rescheduleMinute)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Ionicons name="timer-outline" size={14} color="#F59E0B" />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#F59E0B' }}>
                        Pre-Reminder: 15 mins before ({format12Hour(rescheduleHour % 12 + (reschedulePeriod === 'PM' ? 12 : 0), rescheduleMinute - 15)})
                      </Text>
                    </View>
                  </View>

                  {/* Confirm Reschedule CTA */}
                  <TouchableOpacity
                    style={[styles.confirmRescheduleBtn, { backgroundColor: COLORS.accent }]}
                    onPress={async () => {
                      const finalDate = new Date(rescheduleDate);
                      let finalH = rescheduleHour % 12;
                      if (reschedulePeriod === 'PM') finalH += 12;
                      finalDate.setHours(finalH, rescheduleMinute, 0, 0);

                      await updateVoiceNoteDate(planDateChangeTarget.id, finalDate);
                      const updatedNotes = await getVoiceNotesByTemporalClass();
                      const updated = updatedNotes.find((n) => n.id === planDateChangeTarget.id) || null;
                      setSelectedPlanForDetail(updated);
                      setPlanDateChangeTarget(null);
                      setDatePickerModalVisible(false);
                      await loadNotes(activeTab);

                      const chosenTimeStr = format12Hour(finalH, rescheduleMinute);
                      const preTimeStr = format12Hour(finalH, rescheduleMinute - 15);
                      setAlertTitle('Plan Rescheduled');
                      setAlertMessage(`Plan scheduled for ${finalDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${chosenTimeStr}.\n\nReminders scheduled:\n• 15-minute advance alert (${preTimeStr})\n• Sharp-time alarm (${chosenTimeStr})`);
                      setAlertVisible(true);
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.confirmRescheduleBtnText}>Confirm Reschedule & Set Alarms</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Document & ID Card Cross-Linking Modal */}
      <Modal
        visible={linkDocModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setLinkDocModalVisible(false);
          setTargetNoteForLink(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.linkDocModalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={[styles.linkDocModalHeader, { borderBottomColor: COLORS.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.linkDocModalTitle, { color: COLORS.text }]}>Link Document or Card</Text>
                <Text style={[styles.linkDocModalSubtitle, { color: COLORS.muted }]}>
                  Attach a scanned document, PDF, or ID Card to this note
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setLinkDocModalVisible(false);
                  setTargetNoteForLink(null);
                }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Tabs: PDFs/Scans vs ID Cards */}
            <View style={styles.linkDocTabRow}>
              <TouchableOpacity
                style={[
                  styles.linkDocTabBtn,
                  linkDocTab === 'pdf' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                ]}
                onPress={() => setLinkDocTab('pdf')}
              >
                <Ionicons name="document-text-outline" size={15} color={linkDocTab === 'pdf' ? '#FFFFFF' : COLORS.text} />
                <Text style={[styles.linkDocTabText, { color: linkDocTab === 'pdf' ? '#FFFFFF' : COLORS.text }]}>
                  PDFs & Scans ({availableDocs.pdfs.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.linkDocTabBtn,
                  linkDocTab === 'card' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                ]}
                onPress={() => setLinkDocTab('card')}
              >
                <Ionicons name="card-outline" size={15} color={linkDocTab === 'card' ? '#FFFFFF' : COLORS.text} />
                <Text style={[styles.linkDocTabText, { color: linkDocTab === 'card' ? '#FFFFFF' : COLORS.text }]}>
                  ID Cards ({availableDocs.cards.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Filter Search */}
            <View style={[styles.langSearchBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginVertical: 10 }]}>
              <Ionicons name="search" size={16} color={COLORS.dim} />
              <TextInput
                style={[styles.langSearchInput, { color: COLORS.text }]}
                placeholder={linkDocTab === 'pdf' ? "Search PDFs & scanned documents..." : "Search ID cards..."}
                placeholderTextColor={COLORS.dim}
                value={linkDocSearch}
                onChangeText={setLinkDocSearch}
              />
              {linkDocSearch.length > 0 && (
                <TouchableOpacity onPress={() => setLinkDocSearch('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.dim} />
                </TouchableOpacity>
              )}
            </View>

            {/* Pick from System / Device Files Button */}
            {linkDocTab === 'pdf' && (
              <TouchableOpacity
                style={[styles.pickSystemFileBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.accent }]}
                onPress={async () => {
                  try {
                    const result = await DocumentPicker.getDocumentAsync({
                      type: ['application/pdf', '*/*'],
                      copyToCacheDirectory: true,
                    });
                    if (!result.canceled && result.assets && result.assets.length > 0) {
                      const file = result.assets[0];
                      await handleSelectLinkDoc(file.uri, file.name || 'Document.pdf', 'pdf');
                    }
                  } catch (e) {
                    console.warn('[second-brain] DocumentPicker error:', e);
                  }
                }}
              >
                <Ionicons name="folder-open" size={16} color={COLORS.accent} />
                <Text style={[styles.pickSystemFileBtnText, { color: COLORS.accent }]}>
                  Browse & Link from Device Files (PDF / Doc)
                </Text>
              </TouchableOpacity>
            )}

            {/* Items List */}
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {linkDocTab === 'pdf' ? (
                availableDocs.pdfs.filter(d => (d.name || '').toLowerCase().includes(linkDocSearch.toLowerCase())).length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.muted, fontSize: 13 }}>No matching PDFs found in Document Hub</Text>
                  </View>
                ) : (
                  availableDocs.pdfs
                    .filter(d => (d.name || '').toLowerCase().includes(linkDocSearch.toLowerCase()))
                    .map((pdf, idx) => (
                      <TouchableOpacity
                        key={pdf.id || idx}
                        style={[styles.linkDocItemRow, { borderBottomColor: COLORS.border }]}
                        onPress={() => handleSelectLinkDoc(pdf.uri, pdf.name || 'Document', 'pdf')}
                      >
                        <View style={[styles.linkDocIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
                          <Ionicons name="document-text" size={20} color={COLORS.accent} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.linkDocItemName, { color: COLORS.text }]} numberOfLines={1}>
                            {pdf.name || 'Untitled Document'}
                          </Text>
                          <Text style={[styles.linkDocItemSub, { color: COLORS.muted }]}>
                            {pdf.pageCount ? `${pdf.pageCount} pages` : 'PDF'} • Scanned Document
                          </Text>
                        </View>
                        <Ionicons name="link" size={18} color={COLORS.accent} />
                      </TouchableOpacity>
                    ))
                )
              ) : (
                availableDocs.cards.filter(c => ((c.title || c.cardType || '').toLowerCase()).includes(linkDocSearch.toLowerCase())).length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.muted, fontSize: 13 }}>No ID cards found in Card Wallet</Text>
                  </View>
                ) : (
                  availableDocs.cards
                    .filter(c => ((c.title || c.cardType || '').toLowerCase()).includes(linkDocSearch.toLowerCase()))
                    .map((card, idx) => (
                      <TouchableOpacity
                        key={card.id || idx}
                        style={[styles.linkDocItemRow, { borderBottomColor: COLORS.border }]}
                        onPress={() => handleSelectLinkDoc(card.frontUri || card.backUri || String(card.id), card.title || card.cardType || 'ID Card', 'card')}
                      >
                        <View style={[styles.linkDocIconWrap, { backgroundColor: '#8B5CF620' }]}>
                          <Ionicons name="card" size={20} color="#8B5CF6" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.linkDocItemName, { color: COLORS.text }]} numberOfLines={1}>
                            {card.title || card.cardType || 'ID Card'}
                          </Text>
                          <Text style={[styles.linkDocItemSub, { color: COLORS.muted }]}>
                            {card.cardNumber ? `•••• ${String(card.cardNumber).slice(-4)}` : 'ID Card'}
                          </Text>
                        </View>
                        <Ionicons name="link" size={18} color={COLORS.accent} />
                      </TouchableOpacity>
                    ))
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Multilingual Semantic AI Model Download & Management Modal */}
      <SemanticAiDownloadModal
        visible={aiDownloadModalVisible}
        onClose={() => {
          setAiDownloadModalVisible(false);
          checkAiModelStatus();
        }}
        colors={COLORS}
      />
    </SafeAreaView>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon: any;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <NativeScaleButton
      style={[
        styles.tabBtn,
        active && { borderBottomColor: colors.accent, borderBottomWidth: 3 },
      ]}
      onPress={onPress}
      scaleTo={0.95}
    >
      <Ionicons name={icon} size={16} color={active ? colors.accent : colors.muted} />
      <Text style={[styles.tabLabel, { color: active ? colors.accent : colors.muted, fontWeight: active ? '700' : '500' }]}>
        {label}
      </Text>
    </NativeScaleButton>
  );
}

function VoiceNoteCard({
  item,
  index = 0,
  colors,
  onPress,
  onDelete,
  onCopy,
  onAddToPlan,
  onToggleActionItem,
  onDeleteActionItem,
  onEditActionItem,
  onAttachImage,
  onLinkDoc,
  onUnlinkDoc,
  cardsPool,
  onLinkDocDirect,
}: {
  item: VoiceNoteRecord;
  index?: number;
  colors: any;
  onPress: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onAddToPlan: () => void;
  onToggleActionItem: (index: number) => void;
  onDeleteActionItem: (index: number) => void;
  onEditActionItem: (index: number, text: string) => void;
  onAttachImage: () => void;
  onLinkDoc?: () => void;
  onUnlinkDoc?: () => void;
  cardsPool?: Array<{ id: number; name: string; uri: string; custom_tag?: string; ocr_text?: string }>;
  onLinkDocDirect?: (noteId: number, cardUri: string, cardName: string, cardType: string) => void;
}) {
  const router = useRouter();
  const [showSpokenLog, setShowSpokenLog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [isTasksExpanded, setIsTasksExpanded] = useState(false);
  const [suggestedCard, setSuggestedCard] = useState<NoteCardLink | null>(null);

  useEffect(() => {
    if (item.linkedDocUri || !cardsPool || cardsPool.length === 0 || !item.rawTranscript) {
      setSuggestedCard(null);
      return;
    }
    let active = true;
    findRelevantCardsForNote(item.rawTranscript, cardsPool, 0.38, 1)
      .then(matches => {
        if (active && matches.length > 0) {
          setSuggestedCard(matches[0]);
        } else if (active) {
          setSuggestedCard(null);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [item.linkedDocUri, item.rawTranscript, cardsPool]);

  const formattedDate = new Date(item.createdAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formattedResolved = item.resolvedDatetime
    ? new Date(item.resolvedDatetime).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const checklist = normalizeActionItems(
    (item.actionItems && item.actionItems.length > 0)
      ? item.actionItems
      : getActionItemsFromRawTranscript(item.rawTranscript)
  );

  const completedCount = checklist.filter(i => i.completed).length;
  const totalCount = checklist.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const startEdit = (idx: number, currentText: string) => {
    setIsTasksExpanded(true);
    setEditingIndex(idx);
    setEditText(currentText);
  };

  const saveEdit = (idx: number) => {
    if (editText.trim()) {
      onEditActionItem(idx, editText.trim());
    }
    setEditingIndex(null);
    setEditText('');
  };

  return (
    <Reanimated.View
      entering={FadeInDown.delay(getStaggerDelay(index)).springify().damping(20)}
      layout={cardLayoutTransition}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Top Card Row */}
      <View style={styles.cardHeader}>
        <View style={styles.tagRow}>
          <View style={[styles.temporalTag, { backgroundColor: item.temporalClass === 'future' ? '#8B5CF6' : colors.accent }]}>
            <Text style={styles.temporalTagText}>
              {item.temporalClass === 'today' ? "TODAY'S PLAN" : item.temporalClass === 'future' ? 'UPCOMING PLAN' : 'HISTORY & RECALL'}
            </Text>
          </View>
          {formattedResolved && (
            <View style={[styles.timeTag, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="time-outline" size={12} color={colors.text} />
              <Text style={[styles.timeTagText, { color: colors.text }]}>{formattedResolved}</Text>
            </View>
          )}
          {item.isReminderSet && (
            <View style={[styles.alarmTag, { backgroundColor: '#10B981' }]}>
              <Ionicons name="alarm" size={11} color="#FFFFFF" />
              <Text style={styles.alarmTagText}>ALARM SET</Text>
            </View>
          )}
          {(item as any)._semanticMatch && (
            <View style={[styles.semanticBadge, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}>
              <Ionicons name="sparkles" size={11} color={colors.accent} />
              <Text style={[styles.semanticBadgeText, { color: colors.accent }]}>
                {Math.round((item as any)._semanticMatch.similarity * 100)}% Match
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardActionRow}>
          <NativeScaleButton onPress={onCopy} style={styles.cardIconBtn} scaleTo={0.88}>
            <Ionicons name="copy-outline" size={16} color={colors.muted} />
          </NativeScaleButton>
          <NativeScaleButton onPress={onDelete} style={styles.cardIconBtn} scaleTo={0.88}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </NativeScaleButton>
        </View>
      </View>

      {/* Optional Custom Plan Title */}
      {!!item.title?.trim() && (
        <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
            {item.title.trim()}
          </Text>
        </TouchableOpacity>
      )}

      {/* Interactive Sub-Task Action Checklist */}
      {checklist.length > 0 ? (
        <View style={[styles.actionItemsBox, { backgroundColor: colors.surface2 }]}>
          <TouchableOpacity
            style={styles.actionHeaderRow}
            activeOpacity={0.7}
            onPress={() => setIsTasksExpanded(prev => !prev)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons
                name={isTasksExpanded ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color={colors.muted}
              />
              <Text style={[styles.actionHeader, { color: colors.muted }]}>
                TO-DO TASKS ({completedCount}/{totalCount}):
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {totalCount > 0 && (
                <Text style={[styles.progressPercentText, { color: completedCount === totalCount ? '#10B981' : colors.accent }]}>
                  {progressPercent}%
                </Text>
              )}
              <Text style={{ fontSize: 11, color: colors.accent, fontWeight: '600' }}>
                {isTasksExpanded ? 'Collapse' : 'Expand'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Mini Progress Bar */}
          {totalCount > 0 && (
            <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: completedCount === totalCount ? '#10B981' : colors.accent,
                  }
                ]}
              />
            </View>
          )}

          {isTasksExpanded && checklist.map((actItem, idx) => {
            const isDone = actItem.completed;
            const displayText = actItem.text;
            const isEditingThis = editingIndex === idx;

            return (
              <View key={actItem.id || idx} style={[styles.actRow, { borderBottomColor: colors.border }]}>
                {isEditingThis ? (
                  <View style={styles.inlineEditRow}>
                    <TextInput
                      style={[styles.inlineEditInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                      value={editText}
                      onChangeText={setEditText}
                      autoFocus
                    />
                    <NativeScaleButton onPress={() => saveEdit(idx)} style={[styles.inlineEditSaveBtn, { backgroundColor: colors.accent }]}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </NativeScaleButton>
                    <TouchableOpacity onPress={() => setEditingIndex(null)} style={{ padding: 4 }}>
                      <Ionicons name="close" size={16} color={colors.dim} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <NativeScaleButton
                      style={styles.todoCheckbox}
                      onPress={() => onToggleActionItem(idx)}
                      scaleTo={0.86}
                    >
                      <Ionicons
                        name={isDone ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={isDone ? '#10B981' : colors.accent}
                      />
                    </NativeScaleButton>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.actText,
                          { color: isDone ? colors.dim : colors.text },
                          isDone && styles.actTextDone,
                        ]}
                        onPress={() => onToggleActionItem(idx)}
                      >
                        {displayText}
                      </Text>
                      {actItem.dueDatetime ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="time-outline" size={10} color={colors.muted} />
                          <Text style={{ fontSize: 10, color: colors.muted }}>
                            {new Date(actItem.dueDatetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.actActionsCol}>
                      <TouchableOpacity onPress={() => startEdit(idx, displayText)} style={{ padding: 3 }}>
                        <Ionicons name="pencil" size={13} color={colors.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => onDeleteActionItem(idx)} style={{ padding: 3 }}>
                        <Ionicons name="trash-outline" size={13} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Linked Document Capsule (1-tap view & unlink) */}
      {item.linkedDocUri ? (
        <View style={[styles.linkedDocCapsule, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
            <Ionicons
              name={item.linkedDocType === 'card' ? 'card' : 'document-text'}
              size={18}
              color={item.linkedDocType === 'card' ? '#8B5CF6' : colors.accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkedDocTypeLabel, { color: colors.muted }]}>
                {item.linkedDocType === 'card' ? 'LINKED ID CARD' : 'LINKED DOCUMENT'}
              </Text>
              <Text style={[styles.linkedDocName, { color: colors.text }]} numberOfLines={1}>
                {item.linkedDocName || 'Linked Item'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={[styles.viewDocBtn, { backgroundColor: colors.accent }]}
              onPress={() => {
                if (item.linkedDocType === 'card') {
                  router.push('/cards');
                } else {
                  router.push({
                    pathname: '/documents',
                    params: { openDocUri: item.linkedDocUri },
                  });
                }
              }}
            >
              <Text style={styles.viewDocBtnText}>View</Text>
              <Ionicons name="open-outline" size={12} color="#FFFFFF" />
            </TouchableOpacity>
            {onUnlinkDoc && (
              <TouchableOpacity
                style={styles.unlinkDocBtn}
                onPress={onUnlinkDoc}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 2 }}>
          {suggestedCard && (
            <View style={[styles.suggestedLinkBar, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Ionicons name="sparkles" size={13} color="#8B5CF6" />
                <Text style={[styles.suggestedLinkText, { color: colors.text }]} numberOfLines={1}>
                  Relevant Card: <Text style={{ fontWeight: '700' }}>{suggestedCard.card.name}</Text>
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.suggestedLinkBtn, { backgroundColor: colors.accent }]}
                onPress={() => onLinkDocDirect?.(item.id, suggestedCard.card.uri, suggestedCard.card.name, 'card')}
                activeOpacity={0.8}
              >
                <Text style={styles.suggestedLinkBtnText}>+ Link</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={[styles.linkDocPrompt, { borderColor: colors.border }]}
            onPress={onLinkDoc}
          >
            <Ionicons name="link-outline" size={13} color={colors.muted} />
            <Text style={[styles.linkDocPromptText, { color: colors.muted }]}>Link a PDF, Document or ID Card</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Collapsible Spoken Audit Log Toggle */}
      <TouchableOpacity
        style={styles.logToggleRow}
        onPress={() => setShowSpokenLog(!showSpokenLog)}
      >
        <Ionicons name={showSpokenLog ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
        <Text style={[styles.logToggleText, { color: colors.muted }]}>
          {showSpokenLog ? 'Hide original spoken log' : 'View original spoken transcript'}
        </Text>
      </TouchableOpacity>

      {/* Raw Transcript Content (Visible if toggled OR if no action items exist) */}
      {(showSpokenLog || checklist.length === 0) && (
        <View style={[styles.rawTranscriptBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Text style={[styles.transcriptText, { color: colors.text }]}>{item.rawTranscript}</Text>
        </View>
      )}

      {/* Attached Images Thumbnail Strip (if any) */}
      {item.imageUris && item.imageUris.length > 0 && (
        <View style={styles.cardImagesContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardImagesScroll}>
            {item.imageUris.map((imgUri, i) => {
              const lower = imgUri.toLowerCase();
              const isDoc = lower.endsWith('.pdf') || lower.includes('.pdf') || !!lower.match(/\.(pdf|docx|doc|xls|xlsx|csv|txt|rtf)$/i);
              const isPdf = lower.includes('.pdf');
              return (
                <TouchableOpacity key={i} onPress={onPress} activeOpacity={0.8} style={styles.cardImageThumbWrapper}>
                  {isDoc ? (
                    <View style={[styles.cardImageThumb, { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name={isPdf ? 'document-text' : 'document-attach'} size={18} color={isPdf ? '#EF4444' : colors.accent} />
                      <Text style={{ fontSize: 7.5, fontWeight: '800', color: isPdf ? '#EF4444' : colors.accent }}>{isPdf ? 'PDF' : 'DOC'}</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: imgUri }} style={styles.cardImageThumb} resizeMode="cover" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={[styles.cardImageBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <Ionicons name="attach-outline" size={11} color="#FFFFFF" />
            <Text style={styles.cardImageBadgeText}>{item.imageUris.length}</Text>
          </View>
        </View>
      )}

      {/* Button to open full Day Plan Detail view */}
      <NativeScaleButton
        style={[styles.openDetailBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
        onPress={onPress}
        scaleTo={0.98}
      >
        <View style={styles.openDetailLeft}>
          <Ionicons name="list-outline" size={15} color={colors.accent} />
          <Text style={[styles.openDetailBtnText, { color: colors.text }]}>
            Open Day Plan & All Tasks
          </Text>
        </View>
        <View style={styles.openDetailRight}>
          <Text style={[styles.openDetailBadge, { color: colors.accent, backgroundColor: colors.surface }]}>
            {checklist.length} tasks
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.muted} />
        </View>
      </NativeScaleButton>

      {/* Bottom Row with Add to Plan, Attach Photo & Timestamp */}
      <View style={styles.cardFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <NativeScaleButton
            style={[styles.addToPlanBtn, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            onPress={onAddToPlan}
            scaleTo={0.93}
          >
            <Ionicons name="add-circle-outline" size={13} color={colors.accent} />
            <Text style={[styles.addToPlanText, { color: colors.accent }]}>Add to plan</Text>
          </NativeScaleButton>

          <NativeScaleButton
            style={[styles.addToPlanBtn, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            onPress={onAttachImage}
            scaleTo={0.93}
          >
            <Ionicons name="scan-outline" size={13} color={colors.accent} />
            <Text style={[styles.addToPlanText, { color: colors.accent }]}>Scan / Attach</Text>
          </NativeScaleButton>
        </View>
        <Text style={[styles.createdDate, { color: colors.dim }]}>{formattedDate}</Text>
      </View>
    </Reanimated.View>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langToggle: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  langText: {
    fontSize: 12,
    fontWeight: '700',
  },
  captureSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pulseCircle: {
    borderRadius: 36,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  micTextCol: {
    flex: 1,
  },
  micStatusText: {
    fontSize: 15,
    fontWeight: '700',
  },
  micHintText: {
    fontSize: 12,
    marginTop: 3,
  },
  liveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  liveText: {
    fontSize: 13,
    flex: 1,
    fontStyle: 'italic',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabLabel: {
    fontSize: 12,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
    gap: 12,
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  tagRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  temporalTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  temporalTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  timeTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  alarmTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  alarmTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    marginTop: -2,
  },
  cardIconBtn: {
    padding: 6,
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionItemsBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  inBrainSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderBottomWidth: 1,
    gap: 8,
  },
  inBrainSearchInput: {
    flex: 1,
    fontSize: 13,
  },
  datePickerTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
  },
  datePickerTriggerText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  actionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
  },
  todoCheckbox: {
    padding: 2,
  },
  actText: {
    fontSize: 13,
    flex: 1,
  },
  actTextDone: {
    textDecorationLine: 'line-through',
  },
  actActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineEditRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineEditInput: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 12,
  },
  inlineEditSaveBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  logToggleText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  rawTranscriptBox: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
  },

  addToPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  addToPlanText: {
    fontSize: 11,
    fontWeight: '600',
  },
  createdDate: {
    fontSize: 10,
  },
  unifiedAddBtn: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 28,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  unifiedAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  quickAddMenuBox: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  quickAddMenuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF50',
    alignSelf: 'center',
    marginBottom: 16,
  },
  quickAddMenuTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  quickAddMenuSubtitle: {
    fontSize: 12,
    marginTop: 3,
    marginBottom: 16,
  },
  quickAddOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  quickAddIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  quickAddOptionDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  quickAddCancelBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  quickAddCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickSystemFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  pickSystemFileBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  typeNotePasteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeNotePasteChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  floatingAddBtn: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    elevation: 3,
  },
  floatingAddText: {
    fontSize: 12,
    fontWeight: '600',
  },
  manualInputBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  planTargetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  planTargetBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  inputRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 13,
  },
  manualSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  langModalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 36,
  },
  langModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  langModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  langModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  langSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 12,
    gap: 8,
  },
  langSearchInput: {
    flex: 1,
    fontSize: 13,
  },
  langItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderRadius: 8,
  },
  langFlag: {
    fontSize: 22,
  },
  langItemName: {
    fontSize: 14,
  },
  langItemNative: {
    fontSize: 11,
    marginTop: 1,
  },
  cardImagesContainer: {
    marginTop: 8,
    position: 'relative',
  },
  cardImagesScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  cardImageThumbWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
  },
  cardImageThumb: {
    width: 64,
    height: 64,
    borderRadius: 7,
  },
  cardImageBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cardImageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  openDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  openDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  openDetailBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  openDetailRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openDetailBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeNoteModalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
  },
  typeNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeNoteTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  typeNoteSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  typeNoteInput: {
    minHeight: 90,
    maxHeight: 160,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  typeNoteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  typeNoteCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeNoteCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeNoteSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    gap: 6,
  },
  typeNoteSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  calendarModalBox: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    maxWidth: 380,
    width: '90%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  calendarSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  calendarPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 4,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
  },
  monthNavLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  weekDaysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  weekDayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  calendarDayText: {
    fontSize: 13,
  },
  rescheduleTimeSection: {
    marginTop: 10,
    paddingTop: 8,
  },
  timeDivider: {
    height: 1,
    marginVertical: 10,
    opacity: 0.3,
  },
  rescheduleSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rescheduleSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  rescheduleSelectedTimeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  quickTimesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  quickTimeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickTimeChipText: {
    fontSize: 11,
  },
  timeStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  stepperGroup: {
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  stepperValText: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 26,
    textAlign: 'center',
  },
  stepperColon: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 12,
  },
  periodToggleGroup: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    padding: 2,
    marginTop: 14,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  preReminderNoticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 14,
  },
  confirmRescheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    elevation: 3,
    marginBottom: 6,
  },
  confirmRescheduleBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Semantic Search Mode & Badge Styles
  semanticToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  semanticToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  semanticBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  semanticBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  // Checklist Progress Bar Styles
  progressPercentText: {
    fontSize: 10,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Document Cross-Linking Capsule Styles
  linkedDocCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  linkedDocTypeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  linkedDocName: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  viewDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  viewDocBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  unlinkDocBtn: {
    padding: 2,
  },
  linkDocPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 8,
    gap: 6,
  },
  linkDocPromptText: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Link Document Modal Styles
  linkDocModalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
  },
  linkDocModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  linkDocModalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  linkDocModalSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  linkDocTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  linkDocTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
    gap: 6,
  },
  linkDocTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  linkDocItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
  },
  linkDocIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkDocItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  linkDocItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  suggestedLinkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  suggestedLinkText: {
    fontSize: 11,
  },
  suggestedLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  suggestedLinkBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
