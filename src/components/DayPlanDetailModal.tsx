import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { NativeScaleButton } from '../utils/motion';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { launchGoogleDocScanner } from 'expo-pdf-to-image';
import { VoiceNoteRecord } from '../services/database';
import { normalizeActionItems, ChecklistItem } from '../services/temporalExtractionService';
import { ThemedAlertModal, AlertButton } from './ThemedAlertModal';
import {
  getActionItemsFromRawTranscript,
  startVoiceCapture,
  stopVoiceCapture,
  subscribeToVoiceEvents,
  requestMicrophonePermission,
  attachImagesToVoiceNote,
} from '../services/voiceNoteService';

interface DayPlanDetailModalProps {
  visible: boolean;
  item: VoiceNoteRecord | null;
  colors: any;
  onClose: () => void;
  onToggleActionItem: (index: number) => void;
  onDeleteActionItem: (index: number) => void;
  onDeleteActionItems?: (indices: number[]) => void;
  onEditActionItem: (index: number, newText: string) => void;
  onAddActionItem: (newText: string) => void;
  onAddVoiceNoteToPlan?: (spokenText: string) => Promise<void>;
  onAttachImages?: (imageUris: string[]) => Promise<void>;
  onUpdateAttachments?: (imageUris: string[]) => Promise<void>;
  onChangeDate?: () => void;
  onRenamePlan?: (newTitle: string) => Promise<void> | void;
  onDeletePlan: () => void;
  onCopyTranscript: (text: string) => void;
}

export default function DayPlanDetailModal({
  visible,
  item,
  colors,
  onClose,
  onToggleActionItem,
  onDeleteActionItem,
  onDeleteActionItems,
  onEditActionItem,
  onAddActionItem,
  onAddVoiceNoteToPlan,
  onAttachImages,
  onUpdateAttachments,
  onChangeDate,
  onRenamePlan,
  onDeletePlan,
  onCopyTranscript,
}: DayPlanDetailModalProps) {
  const router = useRouter();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [newTaskInput, setNewTaskInput] = useState('');
  const [isRecordingTask, setIsRecordingTask] = useState(false);
  const isRecordingTaskRef = useRef(false);
  const pulseScale = useSharedValue(1);

  // Multi-Selection and Bulk Delete State for Tasks
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTodoIndices, setSelectedTodoIndices] = useState<number[]>([]);

  // Rename Plan State
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [planTitleInput, setPlanTitleInput] = useState('');

  // Themed Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[] | undefined>(undefined);

  // Full-Screen Image Preview State
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // Collapsible Voice Log State (declared at top to respect React Rules of Hooks)
  const [showSpokenLog, setShowSpokenLog] = useState(false);

  useEffect(() => {
    isRecordingTaskRef.current = isRecordingTask;
    let unsubscribe = () => {};
    if (isRecordingTask) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 500 }),
          withTiming(1.0, { duration: 500 })
        ),
        -1,
        true
      );

      unsubscribe = subscribeToVoiceEvents({
        onPartial: (text) => {
          if (text && isRecordingTaskRef.current) setNewTaskInput(text);
        },
        onFinal: (text) => {
          if (text && isRecordingTaskRef.current) setNewTaskInput(text);
        },
        onError: (err) => {
          isRecordingTaskRef.current = false;
          setIsRecordingTask(false);
        },
        onStateChange: (capturing) => {
          if (!capturing) {
            isRecordingTaskRef.current = false;
            setIsRecordingTask(false);
          }
        },
      });
    } else {
      pulseScale.value = withTiming(1.0, { duration: 200 });
    }
    return () => {
      unsubscribe();
    };
  }, [isRecordingTask]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isRecordingTask ? pulseScale.value : 1 }],
  }));

  useEffect(() => {
    return () => {
      if (isRecordingTaskRef.current) {
        isRecordingTaskRef.current = false;
        stopVoiceCapture().catch(() => {});
      }
    };
  }, []);

  if (!item) return null;

  const resolvedDate = item.resolvedDatetime
    ? new Date(item.resolvedDatetime)
    : null;
  const isValidDate = !!(resolvedDate && !isNaN(resolvedDate.getTime()));

  const formattedHeaderDate = isValidDate
    ? resolvedDate!.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : item.temporalClass === 'today'
    ? "Today's Plan"
    : item.temporalClass === 'future'
    ? 'Upcoming Plan'
    : 'Historical Note';

  const formattedResolvedTime = isValidDate
    ? resolvedDate!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const checklist = normalizeActionItems(
    (item.actionItems && item.actionItems.length > 0)
      ? item.actionItems
      : getActionItemsFromRawTranscript(item.rawTranscript)
  );
  const completedCount = checklist.filter((a) => a.completed).length;
  const totalCount = checklist.length;

  const handleStartEdit = (idx: number, currentText: string) => {
    setEditingIndex(idx);
    setEditText(currentText);
  };

  const handleSaveEdit = (idx: number) => {
    if (editText.trim()) {
      onEditActionItem(idx, editText.trim());
    }
    setEditingIndex(null);
    setEditText('');
  };

  const handleAddNewTask = async () => {
    const text = newTaskInput.trim();
    if (!text) return;
    setNewTaskInput('');
    if (isRecordingTask) {
      isRecordingTaskRef.current = false;
      setIsRecordingTask(false);
      stopVoiceCapture().catch(() => {});
    }
    try {
      onAddActionItem(text);
    } catch (e) {
      console.warn('[DayPlanDetailModal] Add task error:', e);
    }
  };

  const handleToggleVoiceForTask = async () => {
    if (isRecordingTask) {
      isRecordingTaskRef.current = false;
      setIsRecordingTask(false);
      await stopVoiceCapture();
      const spoken = newTaskInput.trim();
      if (spoken) {
        setNewTaskInput('');
        try {
          onAddActionItem(spoken);
        } catch (e) {
          console.warn('[DayPlanDetailModal] Add voice task error:', e);
        }
      }
    } else {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        setAlertTitle('Permission Denied');
        setAlertMessage('Microphone permission is required to capture voice tasks.');
        setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
        setAlertVisible(true);
        return;
      }
      setNewTaskInput('');
      isRecordingTaskRef.current = true;
      setIsRecordingTask(true);
      await startVoiceCapture();
    }
  };

  const confirmDeleteTask = (idx: number) => {
    const taskName = checklist[idx]?.text || 'this task';
    setAlertTitle('Delete Task');
    setAlertMessage(`Are you sure you want to delete "${taskName}"?`);
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setAlertVisible(false);
          onDeleteActionItem(idx);
        },
      },
    ]);
    setAlertVisible(true);
  };

  useEffect(() => {
    setIsSelectMode(false);
    setSelectedTodoIndices([]);
  }, [item?.id, visible]);

  const handleToggleTodoSelection = (index: number) => {
    setSelectedTodoIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleSelectAllTodos = () => {
    if (selectedTodoIndices.length === checklist.length) {
      setSelectedTodoIndices([]);
    } else {
      setSelectedTodoIndices(checklist.map((_, i) => i));
    }
  };

  const confirmDeleteSelectedTodos = () => {
    if (selectedTodoIndices.length === 0) return;
    const count = selectedTodoIndices.length;
    setAlertTitle('Delete Selected Tasks');
    setAlertMessage(`Are you sure you want to delete ${count} selected task${count > 1 ? 's' : ''}?`);
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setAlertVisible(false);
          if (onDeleteActionItems) {
            onDeleteActionItems(selectedTodoIndices);
          } else {
            const sorted = [...selectedTodoIndices].sort((a, b) => b - a);
            for (const idx of sorted) {
              onDeleteActionItem(idx);
            }
          }
          setSelectedTodoIndices([]);
          setIsSelectMode(false);
        },
      },
    ]);
    setAlertVisible(true);
  };

  const confirmClearAllTodos = () => {
    if (checklist.length === 0) return;
    setAlertTitle('Clear All Tasks');
    setAlertMessage(`Are you sure you want to delete all ${checklist.length} tasks from this plan?`);
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          setAlertVisible(false);
          const allIndices = checklist.map((_, i) => i);
          if (onDeleteActionItems) {
            onDeleteActionItems(allIndices);
          } else {
            const sorted = [...allIndices].sort((a, b) => b - a);
            for (const idx of sorted) {
              onDeleteActionItem(idx);
            }
          }
          setSelectedTodoIndices([]);
          setIsSelectMode(false);
        },
      },
    ]);
    setAlertVisible(true);
  };

  const handlePickImage = async () => {
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
        if (onAttachImages) {
          await onAttachImages(uris);
        } else if (item) {
          await attachImagesToVoiceNote(item.id, uris);
        }
      }
    } catch (e) {
      console.warn('[DayPlanDetailModal] Pick image error:', e);
    }
  };

  const handleCaptureImage = async () => {
    try {
      const scanResult = await launchGoogleDocScanner();
      if (scanResult && scanResult.success && scanResult.pages && scanResult.pages.length > 0) {
        if (onAttachImages) {
          await onAttachImages(scanResult.pages);
        } else if (item) {
          await attachImagesToVoiceNote(item.id, scanResult.pages);
        }
      }
    } catch (e: any) {
      console.warn('[DayPlanDetailModal] Document Scanner error, falling back to camera:', e);
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status === 'granted') {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled && result.assets && result.assets.length > 0) {
            const uris = result.assets.map(a => a.uri);
            if (onAttachImages) {
              await onAttachImages(uris);
            } else if (item) {
              await attachImagesToVoiceNote(item.id, uris);
            }
          }
        }
      } catch (err) {
        console.warn('[DayPlanDetailModal] Capture photo error:', err);
      }
    }
  };

  const isDocFile = (uri: string) => {
    const lower = uri.toLowerCase();
    return lower.endsWith('.pdf') || lower.includes('.pdf') || !!lower.match(/\.(pdf|docx|doc|xls|xlsx|csv|txt|rtf)$/i);
  };

  const getFileExt = (uri: string) => {
    const clean = uri.split('?')[0];
    const ext = clean.split('.').pop();
    return ext && ext.length <= 4 ? ext.toUpperCase() : 'DOC';
  };

  const getFileName = (uri: string) => {
    try {
      const clean = uri.split('?')[0];
      const name = decodeURIComponent(clean.split('/').pop() || 'Document');
      return name;
    } catch {
      return uri.split('/').pop() || 'Document';
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uris = result.assets.map(a => a.uri);
        if (onAttachImages) {
          await onAttachImages(uris);
        } else if (item) {
          await attachImagesToVoiceNote(item.id, uris);
        }
      }
    } catch (e) {
      console.warn('[DayPlanDetailModal] Pick document error:', e);
    }
  };

  const handleOpenAttachment = async (uri: string) => {
    if (isDocFile(uri)) {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      } catch (e) {
        console.warn('[DayPlanDetailModal] Failed to open document:', e);
      }
    } else {
      setPreviewImageUri(uri);
    }
  };

  const handleRemoveAttachment = (targetUri: string) => {
    if (!item) return;
    const targetName = getFileName(targetUri);
    setAlertTitle('Remove Attachment');
    setAlertMessage(`Are you sure you want to remove "${targetName}" from this plan?`);
    setAlertButtons([
      { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setAlertVisible(false);
          const updated = (item.imageUris || []).filter(u => u !== targetUri);
          if (onUpdateAttachments) {
            await onUpdateAttachments(updated);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  const handleCopyAllTodos = async () => {
    try {
      if (checklist.length === 0) return;
      const cleanTasks = checklist.map((act, i) => {
        return `${i + 1}. [${act.completed ? 'x' : ' '}] ${act.text}`;
      });
      const headerTitle = isValidDate
        ? `Day Plan (${resolvedDate!.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })})`
        : 'Day Plan Tasks';
      const textToCopy = `${headerTitle}\n${cleanTasks.join('\n')}`;
      await Clipboard.setStringAsync(textToCopy);
      setAlertTitle('Copied All Tasks');
      setAlertMessage('All to-do checklist items have been copied to clipboard.');
      setAlertButtons([{ text: 'OK', style: 'default', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
    } catch (err) {
      console.warn('[DayPlanDetailModal] handleCopyAllTodos error:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Top Bar Header */}
          <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerTitleContainer}
              onPress={() => {
                setPlanTitleInput(item.title || '');
                setRenameModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.title?.trim() ? item.title : formattedHeaderDate}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={colors.accent} style={{ marginLeft: 5 }} />
              </View>
              <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
                {item.title?.trim()
                  ? `${formattedHeaderDate} • Tap to rename`
                  : `${formattedHeaderDate} • Tap to rename`}
              </Text>
            </TouchableOpacity>

            <View style={styles.topBarActions}>
              {onChangeDate && (
                <TouchableOpacity
                  onPress={onChangeDate}
                  style={[styles.topBarMiniBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="calendar-outline" size={15} color={colors.accent} />
                  <Text style={[styles.topBarMiniBtnText, { color: colors.accent }]}>Reschedule</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setAlertTitle('Delete Day Plan');
                  setAlertMessage('Are you sure you want to delete this entire day plan and all its tasks?');
                  setAlertButtons([
                    { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        setAlertVisible(false);
                        onDeletePlan();
                      },
                    },
                  ]);
                  setAlertVisible(true);
                }}
                style={styles.deletePlanBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={19} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Meta badges row */}
            <View style={styles.metaRow}>
              <View style={[styles.badge, { backgroundColor: item.temporalClass === 'future' ? '#8B5CF6' : colors.accent }]}>
                <Ionicons
                  name={item.temporalClass === 'today' ? 'today' : item.temporalClass === 'future' ? 'calendar' : 'time'}
                  size={11}
                  color="#FFFFFF"
                />
                <Text style={styles.badgeText}>
                  {item.temporalClass === 'today' ? 'TODAY' : item.temporalClass === 'future' ? 'UPCOMING' : 'HISTORY'}
                </Text>
              </View>

              {formattedResolvedTime && (
                <View style={[styles.metaTimeBadge, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Ionicons name="time-outline" size={12} color={colors.text} />
                  <Text style={[styles.metaTimeText, { color: colors.text }]}>{formattedResolvedTime}</Text>
                </View>
              )}

              {item.isReminderSet && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      borderRadius: 8,
                      backgroundColor: colors.accent + '18',
                    }}
                  >
                    <Ionicons name="calendar-outline" size={11} color={colors.accent} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent }}>Eve Prep</Text>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: '#10B98120',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="notifications" size={12} color="#10B981" />
                  </View>
                </View>
              )}
            </View>

            {/* Linked Document Banner (if attached) */}
            {item.linkedDocUri ? (
              <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: item.linkedDocType === 'card' ? '#8B5CF620' : colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons
                        name={item.linkedDocType === 'card' ? 'card' : 'document-text'}
                        size={20}
                        color={item.linkedDocType === 'card' ? '#8B5CF6' : colors.accent}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 }}>
                        {item.linkedDocType === 'card' ? 'LINKED ID CARD' : 'LINKED DOCUMENT'}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                        {item.linkedDocName || 'Linked Item'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 5 }}
                    onPress={() => {
                      onClose();
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
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Open</Text>
                    <Ionicons name="open-outline" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* To-Do Checklist Section */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>To-Do Checklist</Text>
                    {totalCount > 0 && (
                      <View style={[styles.progressPill, { backgroundColor: colors.surface2 }]}>
                        <Text style={[styles.progressText, { color: completedCount === totalCount ? '#10B981' : colors.accent }]}>
                          {completedCount}/{totalCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                    {totalCount > 0
                      ? `${Math.round((completedCount / totalCount) * 100)}% completed`
                      : 'No tasks added yet'}
                  </Text>
                </View>

                {totalCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={[
                        styles.compactPillBtn,
                        {
                          backgroundColor: isSelectMode ? colors.accent + '20' : colors.surface2,
                          borderColor: isSelectMode ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setIsSelectMode(!isSelectMode);
                        if (isSelectMode) setSelectedTodoIndices([]);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelectMode ? 'checkmark-circle' : 'checkbox-outline'}
                        size={13}
                        color={colors.accent}
                      />
                      <Text style={[styles.compactPillBtnText, { color: colors.accent }]}>
                        {isSelectMode ? 'Done' : 'Select'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.compactPillBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                      onPress={handleCopyAllTodos}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="copy-outline" size={13} color={colors.accent} />
                      <Text style={[styles.compactPillBtnText, { color: colors.accent }]}>Copy All</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Multi-Selection Action Toolbar */}
              {isSelectMode && totalCount > 0 && (
                <View style={[styles.selectToolbar, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.todoToolBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={handleSelectAllTodos}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={selectedTodoIndices.length === totalCount ? 'checkbox' : 'square-outline'}
                      size={13}
                      color={colors.accent}
                    />
                    <Text style={[styles.todoToolBtnText, { color: colors.accent }]}>
                      {selectedTodoIndices.length === totalCount ? 'Select None' : 'Select All'}
                    </Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {selectedTodoIndices.length > 0 && (
                      <TouchableOpacity
                        style={[styles.todoToolBtn, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}
                        onPress={confirmDeleteSelectedTodos}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash" size={13} color="#EF4444" />
                        <Text style={[styles.todoToolBtnText, { color: '#EF4444', fontWeight: '700' }]}>
                          Delete ({selectedTodoIndices.length})
                        </Text>
                      </TouchableOpacity>
                    )}

                    {selectedTodoIndices.length === 0 && totalCount > 1 && (
                      <TouchableOpacity
                        style={[styles.todoToolBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={confirmClearAllTodos}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={13} color={colors.danger} />
                        <Text style={[styles.todoToolBtnText, { color: colors.danger }]}>Clear All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Task Items */}
              {checklist.map((actItem, idx) => {
                const isDone = actItem.completed;
                const displayText = actItem.text;
                const isEditing = editingIndex === idx;
                const isSelected = selectedTodoIndices.includes(idx);

                return (
                  <View
                    key={actItem.id || idx}
                    style={[
                      styles.taskItemRow,
                      { borderBottomColor: colors.border },
                      isDone && !isSelectMode && { opacity: 0.65 },
                      isSelected && { backgroundColor: colors.accent + '14', borderRadius: 8, paddingHorizontal: 4 },
                    ]}
                  >
                    {isEditing ? (
                      <View style={styles.editRow}>
                        <TextInput
                          style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                          value={editText}
                          onChangeText={setEditText}
                          autoFocus
                        />
                        <TouchableOpacity
                          style={[styles.editActionBtn, { backgroundColor: colors.accent }]}
                          onPress={() => handleSaveEdit(idx)}
                        >
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.editCancelBtn}
                          onPress={() => setEditingIndex(null)}
                        >
                          <Ionicons name="close" size={18} color={colors.dim} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        {isSelectMode ? (
                          <TouchableOpacity
                            style={styles.checkboxTouch}
                            onPress={() => handleToggleTodoSelection(idx)}
                          >
                            <Ionicons
                              name={isSelected ? 'checkbox' : 'square-outline'}
                              size={22}
                              color={isSelected ? colors.accent : colors.dim}
                            />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={styles.checkboxTouch}
                            onPress={() => onToggleActionItem(idx)}
                          >
                            <Ionicons
                              name={isDone ? 'checkbox' : 'square-outline'}
                              size={22}
                              color={isDone ? '#10B981' : colors.accent}
                            />
                          </TouchableOpacity>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.taskText,
                              { color: isDone && !isSelectMode ? colors.dim : colors.text },
                              isDone && !isSelectMode && styles.taskTextDone,
                              isSelected && { color: colors.accent, fontWeight: '600' },
                            ]}
                            onPress={() => {
                              if (isSelectMode) {
                                handleToggleTodoSelection(idx);
                              } else {
                                onToggleActionItem(idx);
                              }
                            }}
                          >
                            {displayText}
                          </Text>
                          {actItem.dueDatetime ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Ionicons name="time-outline" size={11} color={colors.muted} />
                              <Text style={{ fontSize: 11, color: colors.muted }}>
                                Due at {new Date(actItem.dueDatetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {!isSelectMode ? (
                          <View style={styles.taskActions}>
                            <TouchableOpacity
                              onPress={() => handleStartEdit(idx, displayText)}
                              style={styles.actionIconBtn}
                            >
                              <Ionicons name="pencil" size={15} color={colors.muted} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => confirmDeleteTask(idx)}
                              style={styles.actionIconBtn}
                            >
                              <Ionicons name="trash-outline" size={15} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleToggleTodoSelection(idx)}
                            style={styles.actionIconBtn}
                          >
                            <Ionicons
                              name={isSelected ? 'checkbox' : 'square-outline'}
                              size={18}
                              color={isSelected ? colors.accent : colors.dim}
                            />
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                );
              })}

              {/* Quick Add Task Input + Voice Note Mic in Detail View */}
              <View
                style={[
                  styles.addTaskRow,
                  {
                    borderColor: isRecordingTask ? '#EF4444' : colors.border,
                    backgroundColor: colors.surface2,
                  },
                ]}
              >
                <Reanimated.View style={animatedPulseStyle}>
                  <NativeScaleButton
                    style={[
                      styles.micTaskBtn,
                      { backgroundColor: isRecordingTask ? '#EF4444' : colors.accent },
                    ]}
                    onPress={handleToggleVoiceForTask}
                    scaleTo={0.92}
                  >
                    <Ionicons name={isRecordingTask ? 'stop' : 'mic'} size={17} color="#FFFFFF" />
                  </NativeScaleButton>
                </Reanimated.View>

                <TextInput
                  style={[styles.addTaskInput, { color: colors.text }]}
                  placeholder={
                    isRecordingTask
                      ? 'Listening... speak task'
                      : `Add task for ${resolvedDate ? resolvedDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'this day'}...`
                  }
                  placeholderTextColor={isRecordingTask ? '#EF4444' : colors.dim}
                  value={newTaskInput}
                  onChangeText={setNewTaskInput}
                  onSubmitEditing={handleAddNewTask}
                  returnKeyType="done"
                  blurOnSubmit={false}
                />

                {/* Inline Clear Button */}
                {!!newTaskInput.trim() && !isRecordingTask && (
                  <TouchableOpacity
                    style={styles.clearInputBtn}
                    onPress={() => setNewTaskInput('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.dim} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.addTaskBtn,
                    { backgroundColor: newTaskInput.trim() ? colors.accent : colors.border },
                  ]}
                  disabled={!newTaskInput.trim()}
                  onPress={handleAddNewTask}
                >
                  <Ionicons name="add" size={19} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Listening Banner */}
              {isRecordingTask && (
                <View style={[styles.recordingIndicatorRow, { backgroundColor: '#EF444415' }]}>
                  <Text style={styles.recordingIndicatorText}>
                    Recording speech... Speak clearly in Hindi or English, tap stop when done.
                  </Text>
                </View>
              )}
            </View>

            {/* Attached Photos & Documents Section */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 14 }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleCol}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>
                    Attached Photos & Docs
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.muted }]} numberOfLines={1}>
                    {item.imageUris && item.imageUris.length > 0
                      ? `${item.imageUris.length} file(s) attached`
                      : 'Attach bills, receipts, or PDF docs'}
                  </Text>
                </View>
                <View style={styles.attachBtnGroup}>
                  <TouchableOpacity
                    style={[styles.compactPillBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                    onPress={handleCaptureImage}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="scan" size={13} color={colors.accent} />
                    <Text style={[styles.compactPillBtnText, { color: colors.accent }]}>Scanner</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.compactPillBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                    onPress={handlePickImage}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="images-outline" size={13} color={colors.accent} />
                    <Text style={[styles.compactPillBtnText, { color: colors.accent }]}>Photos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.compactPillBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                    onPress={handlePickDocument}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={13} color={colors.accent} />
                    <Text style={[styles.compactPillBtnText, { color: colors.accent }]}>Files / PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Attached Photos & Documents Grid */}
              {item.imageUris && item.imageUris.length > 0 ? (
                <View style={styles.imagesGrid}>
                  {item.imageUris.map((fileUri, idx) => {
                    const isDoc = isDocFile(fileUri);
                    const isPdf = fileUri.toLowerCase().includes('.pdf');
                    return isDoc ? (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.docGridItem,
                          { backgroundColor: colors.surface2, borderColor: colors.border },
                        ]}
                        onPress={() => handleOpenAttachment(fileUri)}
                        activeOpacity={0.8}
                      >
                        <TouchableOpacity
                          style={styles.removeAttachBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleRemoveAttachment(fileUri);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close" size={11} color="#FFFFFF" />
                        </TouchableOpacity>
                        <View style={styles.docIconBadge}>
                          <Ionicons
                            name={isPdf ? 'document-text' : 'document-attach'}
                            size={24}
                            color={isPdf ? '#EF4444' : colors.accent}
                          />
                          <View
                            style={[
                              styles.docExtBadge,
                              { backgroundColor: isPdf ? '#EF444420' : `${colors.accent}20` },
                            ]}
                          >
                            <Text
                              style={[
                                styles.docExtText,
                                { color: isPdf ? '#EF4444' : colors.accent },
                              ]}
                            >
                              {getFileExt(fileUri)}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[styles.docNameText, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {getFileName(fileUri)}
                        </Text>
                        <Text style={[styles.docTapToOpen, { color: colors.dim }]}>Tap to open</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        key={idx}
                        style={styles.imageGridItem}
                        onPress={() => handleOpenAttachment(fileUri)}
                        activeOpacity={0.85}
                      >
                        <TouchableOpacity
                          style={styles.removeAttachBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleRemoveAttachment(fileUri);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close" size={11} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Image source={{ uri: fileUri }} style={styles.gridThumbImage} resizeMode="cover" />
                        <View style={styles.zoomIconOverlay}>
                          <Ionicons name="expand" size={11} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.emptyAttachBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Ionicons name="document-attach-outline" size={24} color={colors.dim} />
                  <Text style={[styles.emptyAttachText, { color: colors.muted }]}>
                    No photos or documents attached yet. Tap Camera, Photos, or Files above.
                  </Text>
                </View>
              )}
            </View>

            {/* Compact Collapsible Spoken Voice Notes & Transcripts Log Section */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 14 }]}>
              <TouchableOpacity
                style={styles.collapsibleLogHeader}
                onPress={() => setShowSpokenLog(!showSpokenLog)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="mic-outline" size={16} color={colors.muted} />
                    <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 15 }]}>Spoken Voice Log</Text>
                  </View>
                  <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                    {showSpokenLog ? 'Tap to collapse transcript' : 'Tap to expand original voice recording text'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.compactPillBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                    onPress={() => onCopyTranscript(item.rawTranscript)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={12} color={colors.accent} />
                    <Text style={[styles.compactPillBtnText, { color: colors.accent }]}>Copy Log</Text>
                  </TouchableOpacity>
                  <Ionicons
                    name={showSpokenLog ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.muted}
                  />
                </View>
              </TouchableOpacity>

              {showSpokenLog && (
                <View style={[styles.rawBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={[styles.rawText, { color: colors.text }]} selectable>
                    {item.rawTranscript}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Full-Screen Image Preview Modal */}
        <Modal
          visible={!!previewImageUri}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewImageUri(null)}
        >
          <View style={styles.fullPreviewOverlay}>
            <SafeAreaView style={styles.fullPreviewSafe}>
              <TouchableOpacity
                style={styles.fullPreviewCloseBtn}
                onPress={() => setPreviewImageUri(null)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              {previewImageUri && (
                <Image
                  source={{ uri: previewImageUri }}
                  style={styles.fullPreviewImage}
                  resizeMode="contain"
                />
              )}
            </SafeAreaView>
          </View>
        </Modal>

        {/* Rename Plan Modal */}
        <Modal
          visible={renameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.renameModalOverlay}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setRenameModalVisible(false)}
            />
            <View style={[styles.renameModalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.renameModalHeader}>
                <Ionicons name="pencil" size={18} color={colors.accent} />
                <Text style={[styles.renameModalTitle, { color: colors.text }]}>Rename Day Plan</Text>
              </View>
              <Text style={[styles.renameModalSubtitle, { color: colors.muted }]}>
                Give this day plan a memorable title for quick recognition.
              </Text>
              <TextInput
                style={[
                  styles.renameInput,
                  {
                    backgroundColor: colors.surface2,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={planTitleInput}
                onChangeText={setPlanTitleInput}
                placeholder={formattedHeaderDate}
                placeholderTextColor={colors.muted}
                maxLength={60}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={async () => {
                  if (onRenamePlan) {
                    await onRenamePlan(planTitleInput.trim());
                  }
                  setRenameModalVisible(false);
                }}
              />
              <View style={styles.renameModalActions}>
                <TouchableOpacity
                  style={[styles.renameModalBtn, { backgroundColor: colors.surface2 }]}
                  onPress={() => setRenameModalVisible(false)}
                >
                  <Text style={[styles.renameModalBtnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameModalBtn, { backgroundColor: colors.accent }]}
                  onPress={async () => {
                    if (onRenamePlan) {
                      await onRenamePlan(planTitleInput.trim());
                    }
                    setRenameModalVisible(false);
                  }}
                >
                  <Text style={[styles.renameModalBtnText, { color: '#FFFFFF', fontWeight: '700' }]}>Save Title</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Themed Alert Modal */}
        <ThemedAlertModal
          visible={alertVisible}
          title={alertTitle}
          message={alertMessage}
          buttons={alertButtons}
          onClose={() => setAlertVisible(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  topBarMiniBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deletePlanBtn: {
    padding: 6,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
  },
  metaTimeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  alarmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 5,
  },
  alarmBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitleCol: {
    flex: 1,
    minWidth: 140,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  progressPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkboxTouch: {
    paddingRight: 10,
    paddingVertical: 2,
  },
  taskText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  taskTextDone: {
    textDecorationLine: 'line-through',
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 6,
  },
  actionIconBtn: {
    padding: 6,
  },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editActionBtn: {
    padding: 8,
    borderRadius: 8,
  },
  editCancelBtn: {
    padding: 6,
  },
  addTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  addTaskInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  clearInputBtn: {
    padding: 6,
    marginLeft: 4,
  },
  addTaskBtn: {
    padding: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  compactPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    gap: 4,
  },
  compactPillBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  selectToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  todoToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    gap: 4,
  },
  todoToolBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  collapsibleLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    gap: 4,
  },
  copyPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rawBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  rawText: {
    fontSize: 14,
    lineHeight: 22,
  },
  micTaskBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  clockAlarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    marginLeft: 4,
  },
  clockAlarmBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recordingIndicatorRow: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  recordingIndicatorText: {
    fontSize: 12,
    color: '#EF4444',
    textAlign: 'center',
    fontWeight: '500',
  },
  attachBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  attachActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  attachActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  imageGridItem: {
    width: 82,
    height: 82,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.25)',
  },
  docGridItem: {
    width: 82,
    height: 82,
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  docIconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  docExtBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 1,
  },
  docExtText: {
    fontSize: 8,
    fontWeight: '800',
  },
  docNameText: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '100%',
  },
  docTapToOpen: {
    fontSize: 8,
    marginTop: 2,
    fontWeight: '500',
  },
  removeAttachBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  gridThumbImage: {
    width: '100%',
    height: '100%',
  },
  zoomIconOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 2,
  },
  emptyAttachBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 6,
  },
  emptyAttachText: {
    fontSize: 12,
    textAlign: 'center',
  },
  fullPreviewOverlay: {
    flex: 1,
    backgroundColor: '#000000FA',
  },
  fullPreviewSafe: {
    flex: 1,
    position: 'relative',
  },
  fullPreviewCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    padding: 8,
  },
  fullPreviewImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  renameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  renameModalBox: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    elevation: 8,
  },
  renameModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  renameModalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  renameModalSubtitle: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 17,
  },
  renameInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  renameModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  renameModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  renameModalBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
