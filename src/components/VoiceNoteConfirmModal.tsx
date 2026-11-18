/**
 * VoiceNoteConfirmModal.tsx — Pre-Processing Verification & Preview Sheet
 *
 * Allows the user to inspect, edit, and confirm:
 *  - Spoken transcript text (correct spelling/transcription errors)
 *  - Target Date & Time (Calendar DatePicker, 1-minute precision TimePicker, Quick presets)
 *  - If system was not able to read date/time, prompts with DatePicker and TimePicker to select schedule
 *  - Extracted action checklist items
 *  - Exact reminder toggle
 *
 * Prevents "garbage-in, garbage-out" before committing to SQLite.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TemporalExtractionResult } from '../services/temporalExtractionService';
import { AnimatedModalSheet, NativeScaleButton } from '../utils/motion';

interface VoiceNoteConfirmModalProps {
  visible: boolean;
  initialTranscript: string;
  initialExtraction: TemporalExtractionResult;
  colors: any;
  targetPlanTitle?: string;
  attachedImageUri?: string | null;
  onRemoveAttachedImage?: () => void;
  onConfirm: (
    finalTranscript: string,
    overrides: Partial<TemporalExtractionResult>
  ) => void;
  onDiscard: () => void;
}

function toYMD(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function VoiceNoteConfirmModal({
  visible,
  initialTranscript,
  initialExtraction,
  colors,
  targetPlanTitle,
  attachedImageUri,
  onRemoveAttachedImage,
  onConfirm,
  onDiscard,
}: VoiceNoteConfirmModalProps) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [temporalClass, setTemporalClass] = useState<'today' | 'future' | 'historical'>(
    initialExtraction?.temporalClass || 'today'
  );
  const [resolvedDatetime, setResolvedDatetime] = useState<string | null>(
    initialExtraction?.resolvedDatetime || null
  );
  const [isReminderSet, setIsReminderSet] = useState(
    initialExtraction?.isHighConfidenceReminder || false
  );
  const [isEveReminderSet, setIsEveReminderSet] = useState<boolean>(
    initialExtraction?.enableEvePlanningReminder !== false
  );
  const [actionItems, setActionItems] = useState<string[]>(
    initialExtraction?.actionItems || []
  );

  // Date & Time Picker States
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [isUndated, setIsUndated] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [pickerCalendarMonth, setPickerCalendarMonth] = useState<Date>(new Date());
  const [dateNotDetected, setDateNotDetected] = useState<boolean>(false);
  const [selectedTodoIndices, setSelectedTodoIndices] = useState<number[]>([]);

  useEffect(() => {
    if (visible && initialExtraction) {
      setTranscript(initialTranscript);
      setActionItems(initialExtraction.actionItems || []);
      setSelectedTodoIndices([]);

      const hasResolved = !!initialExtraction.resolvedDatetime;
      setDateNotDetected(!hasResolved);

      if (hasResolved) {
        const d = new Date(initialExtraction.resolvedDatetime!);
        setSelectedDate(d);
        setPickerCalendarMonth(new Date(d));
        const h24 = d.getHours();
        setHour(h24 % 12 === 0 ? 12 : h24 % 12);
        setMinute(d.getMinutes());
        setPeriod(h24 >= 12 ? 'PM' : 'AM');
        setIsUndated(false);
        setShowCalendar(false);
        setResolvedDatetime(initialExtraction.resolvedDatetime);
        setTemporalClass(initialExtraction.temporalClass);
        setIsReminderSet(initialExtraction.isHighConfidenceReminder);
        setIsEveReminderSet(initialExtraction.enableEvePlanningReminder !== false);
      } else {
        // System could NOT read date and time from text:
        // Automatically open the Calendar DatePicker for immediate one-tap selection
        const now = new Date();
        const nextHour = (now.getHours() + 1) % 24;
        const initPeriod = nextHour >= 12 ? 'PM' : 'AM';
        const initHour = nextHour % 12 === 0 ? 12 : nextHour % 12;
        const initMin = 0;

        setSelectedDate(now);
        setPickerCalendarMonth(new Date(now));
        setHour(initHour);
        setMinute(initMin);
        setPeriod(initPeriod);
        setIsUndated(false);
        setShowCalendar(true); // Open calendar immediately so user sees and picks date
        setIsReminderSet(true);
        setIsEveReminderSet(true);

        const d = new Date(now);
        let h24 = initHour % 12;
        if (initPeriod === 'PM') h24 += 12;
        d.setHours(h24, initMin, 0, 0);
        setResolvedDatetime(d.toISOString());
        setTemporalClass('today');
      }
    }
  }, [visible, initialTranscript, initialExtraction]);

  const syncSchedule = (newDate: Date, newHour: number, newMin: number, newPeriod: 'AM' | 'PM') => {
    const d = new Date(newDate);
    let h24 = newHour % 12;
    if (newPeriod === 'PM') h24 += 12;
    d.setHours(h24, newMin, 0, 0);
    const iso = d.toISOString();
    setResolvedDatetime(iso);

    const todayStr = toYMD(new Date());
    const dateStr = toYMD(d);
    if (dateStr === todayStr) {
      setTemporalClass('today');
    } else if (dateStr > todayStr) {
      setTemporalClass('future');
    } else {
      setTemporalClass('historical');
    }
    setIsUndated(false);
  };

  const handleQuickDateSelect = (type: 'today' | 'tomorrow' | 'in2days' | 'calendar' | 'historical') => {
    if (type === 'today') {
      const today = new Date();
      setSelectedDate(today);
      setPickerCalendarMonth(new Date(today));
      setShowCalendar(false);
      setIsEveReminderSet(true);
      syncSchedule(today, hour, minute, period);
    } else if (type === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setSelectedDate(tomorrow);
      setPickerCalendarMonth(new Date(tomorrow));
      setShowCalendar(false);
      setIsEveReminderSet(true);
      syncSchedule(tomorrow, hour, minute, period);
    } else if (type === 'in2days') {
      const in2 = new Date();
      in2.setDate(in2.getDate() + 2);
      setSelectedDate(in2);
      setPickerCalendarMonth(new Date(in2));
      setShowCalendar(false);
      setIsEveReminderSet(true);
      syncSchedule(in2, hour, minute, period);
    } else if (type === 'calendar') {
      setShowCalendar((prev) => !prev);
    } else {
      setIsUndated(true);
      setShowCalendar(false);
      setResolvedDatetime(null);
      setTemporalClass('historical');
      setIsReminderSet(false);
      setIsEveReminderSet(false);
    }
  };

  const handleToggleTodoSelection = (index: number) => {
    setSelectedTodoIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleSelectAllTodos = () => {
    if (selectedTodoIndices.length === actionItems.length) {
      setSelectedTodoIndices([]);
    } else {
      setSelectedTodoIndices(actionItems.map((_, i) => i));
    }
  };

  const handleDeleteSelectedTodos = () => {
    if (selectedTodoIndices.length === 0) return;
    const toRemove = new Set(selectedTodoIndices);
    setActionItems((prev) => prev.filter((_, i) => !toRemove.has(i)));
    setSelectedTodoIndices([]);
  };

  const handleClearAllTodos = () => {
    setActionItems([]);
    setSelectedTodoIndices([]);
  };

  const handleRemoveAction = (index: number) => {
    setActionItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedTodoIndices((prev) =>
      prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
    );
  };

  const formattedTargetDate = isUndated || !resolvedDatetime
    ? 'Undated Memo (History)'
    : new Date(resolvedDatetime).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  const isTodayActive = !isUndated && toYMD(selectedDate) === toYMD(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const isTomorrowActive = !isUndated && toYMD(selectedDate) === toYMD(tomorrowDate);
  const in2DaysDate = new Date();
  in2DaysDate.setDate(in2DaysDate.getDate() + 2);
  const isIn2DaysActive = !isUndated && toYMD(selectedDate) === toYMD(in2DaysDate);
  const isCustomDate = !isUndated && !isTodayActive && !isTomorrowActive && !isIn2DaysActive;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDiscard}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AnimatedModalSheet style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Confirm Note & Schedule</Text>
              <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
                Review text, schedule date & time before saving
              </Text>
            </View>
            <NativeScaleButton onPress={onDiscard} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.dim} />
            </NativeScaleButton>
          </View>

          <ScrollView style={{ maxHeight: 500 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Target Plan Notification */}
            {targetPlanTitle ? (
              <View style={[styles.mergeBadge, { backgroundColor: colors.surface2, borderColor: colors.accent }]}>
                <Ionicons name="link" size={14} color={colors.accent} />
                <Text style={[styles.mergeBadgeText, { color: colors.text }]} numberOfLines={1}>
                  Will merge into: <Text style={{ fontWeight: '700', color: colors.accent }}>{targetPlanTitle}</Text>
                </Text>
              </View>
            ) : null}

            {/* Attached Scanned Image Preview (if present) */}
            {attachedImageUri ? (
              <View style={[styles.attachedImageCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <Image source={{ uri: attachedImageUri }} style={styles.attachedImageThumbnail} resizeMode="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="document-text" size={15} color={colors.accent} />
                    <Text style={[styles.attachedImageTitle, { color: colors.text }]}>Attached Card / Document</Text>
                  </View>
                  <Text style={[styles.attachedImageSubtitle, { color: colors.muted }]}>
                    Captured with Google Docs Scanner
                  </Text>
                </View>
                {onRemoveAttachedImage ? (
                  <TouchableOpacity onPress={onRemoveAttachedImage} style={styles.attachedImageRemoveBtn}>
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Editable Transcript Input */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>NOTE / EXTRACTED TEXT (TAP TO EDIT):</Text>
            <TextInput
              style={[
                styles.transcriptInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 },
              ]}
              value={transcript}
              onChangeText={setTranscript}
              multiline
              placeholder="Spoken note, invitation details, or tasks..."
              placeholderTextColor={colors.dim}
            />

            {/* If date was not found in note, show clear helpful notice */}
            {dateNotDetected && !isUndated && (
              <View style={[styles.notDetectedNotice, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '55' }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <Text style={[styles.notDetectedText, { color: colors.text }]}>
                  No date or time found in text. Tap the calendar below to pick your schedule:
                </Text>
              </View>
            )}

            {/* Target Date & Time Section */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 0, marginBottom: 0 }]}>
                SCHEDULE DATE & TIME:
              </Text>
              <TouchableOpacity
                onPress={() => setShowCalendar((prev) => !prev)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name={showCalendar ? 'chevron-up' : 'calendar-outline'} size={13} color={colors.accent} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>
                  {showCalendar ? 'Hide Calendar' : 'Show Calendar'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Prominent Interactive Date Display Card */}
            <NativeScaleButton
              style={[
                styles.datePickerMainBtn,
                {
                  backgroundColor: colors.surface2,
                  borderColor: (showCalendar || isCustomDate) ? colors.accent : colors.border,
                },
              ]}
              onPress={() => {
                if (isUndated) {
                  setIsUndated(false);
                }
                setShowCalendar((prev) => !prev);
              }}
              scaleTo={0.98}
            >
              <View style={[styles.calendarIconBubble, { backgroundColor: colors.accent + '22' }]}>
                <Ionicons name="calendar" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.datePickerMainLabel, { color: colors.muted }]}>
                  {isUndated ? 'DATE SETTING' : 'SELECTED DATE (TAP TO EXPAND CALENDAR)'}
                </Text>
                <Text style={[styles.datePickerMainValue, { color: colors.text }]}>
                  {isUndated
                    ? 'Undated Memo'
                    : selectedDate.toLocaleDateString([], {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                </Text>
              </View>
              <View style={[styles.calendarToggleTag, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.calendarToggleTagText, { color: colors.accent }]}>
                  {showCalendar ? 'Collapse' : 'Pick Date'}
                </Text>
                <Ionicons
                  name={showCalendar ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.accent}
                />
              </View>
            </NativeScaleButton>

            {/* Quick Date Selector Chips */}
            <View style={styles.dateChipsRow}>
              <NativeScaleButton
                style={[
                  styles.dateChip,
                  { borderColor: colors.border, backgroundColor: colors.surface2 },
                  isTodayActive && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => handleQuickDateSelect('today')}
                scaleTo={0.92}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    { color: isTodayActive ? colors.accent : colors.text },
                  ]}
                >
                  Today
                </Text>
              </NativeScaleButton>

              <NativeScaleButton
                style={[
                  styles.dateChip,
                  { borderColor: colors.border, backgroundColor: colors.surface2 },
                  isTomorrowActive && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => handleQuickDateSelect('tomorrow')}
                scaleTo={0.92}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    { color: isTomorrowActive ? colors.accent : colors.text },
                  ]}
                >
                  Tomorrow
                </Text>
              </NativeScaleButton>

              <NativeScaleButton
                style={[
                  styles.dateChip,
                  { borderColor: colors.border, backgroundColor: colors.surface2 },
                  isIn2DaysActive && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => handleQuickDateSelect('in2days')}
                scaleTo={0.92}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    { color: isIn2DaysActive ? colors.accent : colors.text },
                  ]}
                >
                  +2 Days
                </Text>
              </NativeScaleButton>

              <NativeScaleButton
                style={[
                  styles.dateChip,
                  { borderColor: colors.border, backgroundColor: colors.surface2 },
                  (isCustomDate || showCalendar) && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => handleQuickDateSelect('calendar')}
                scaleTo={0.92}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="calendar-outline" size={12} color={(isCustomDate || showCalendar) ? colors.accent : colors.text} />
                  <Text
                    style={[
                      styles.dateChipText,
                      { color: (isCustomDate || showCalendar) ? colors.accent : colors.text },
                    ]}
                  >
                    {isCustomDate ? selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Calendar'}
                  </Text>
                </View>
              </NativeScaleButton>

              <NativeScaleButton
                style={[
                  styles.dateChip,
                  { borderColor: colors.border, backgroundColor: colors.surface2 },
                  isUndated && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => handleQuickDateSelect('historical')}
                scaleTo={0.92}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    { color: isUndated ? colors.accent : colors.muted },
                  ]}
                >
                  Undated
                </Text>
              </NativeScaleButton>
            </View>

            {/* Interactive Month Calendar (if Pick Date is open) */}
            {showCalendar && !isUndated && (
              <View style={[styles.calendarContainer, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                {/* Month Nav */}
                <View style={styles.calendarNavRow}>
                  <TouchableOpacity
                    onPress={() => {
                      const prev = new Date(pickerCalendarMonth);
                      prev.setMonth(prev.getMonth() - 1);
                      setPickerCalendarMonth(prev);
                    }}
                    style={styles.calendarNavBtn}
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.calendarNavMonthText, { color: colors.text }]}>
                    {pickerCalendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const next = new Date(pickerCalendarMonth);
                      next.setMonth(next.getMonth() + 1);
                      setPickerCalendarMonth(next);
                    }}
                    style={styles.calendarNavBtn}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Day of Week Headers */}
                <View style={styles.calendarWeekRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <Text key={i} style={[styles.calendarWeekDayText, { color: colors.muted }]}>
                      {day}
                    </Text>
                  ))}
                </View>

                {/* Days Grid */}
                <View style={styles.calendarGrid}>
                  {(() => {
                    const year = pickerCalendarMonth.getFullYear();
                    const month = pickerCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const cells: React.ReactNode[] = [];

                    for (let b = 0; b < firstDay; b++) {
                      cells.push(<View key={`b-${b}`} style={styles.calendarDayCell} />);
                    }

                    const selectedStr = toYMD(selectedDate);
                    const todayStr = toYMD(new Date());

                    for (let d = 1; d <= daysInMonth; d++) {
                      const cellDate = new Date(year, month, d);
                      const cellDateStr = toYMD(cellDate);
                      const isCellSelected = selectedStr === cellDateStr;
                      const isCellToday = todayStr === cellDateStr;

                      cells.push(
                        <TouchableOpacity
                          key={`d-${d}`}
                          style={[
                            styles.calendarDayCell,
                            isCellSelected && { backgroundColor: colors.accent, borderRadius: 16 },
                            !isCellSelected && isCellToday && { borderWidth: 1, borderColor: colors.accent, borderRadius: 16 },
                          ]}
                          onPress={() => {
                            setSelectedDate(cellDate);
                            syncSchedule(cellDate, hour, minute, period);
                            setShowCalendar(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              {
                                color: isCellSelected ? '#FFFFFF' : isCellToday ? colors.accent : colors.text,
                                fontWeight: isCellSelected || isCellToday ? '700' : '400',
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
              </View>
            )}

            {/* Time Picker Controls (Visible when not undated) */}
            {!isUndated && (
              <View style={{ marginTop: 10 }}>
                {/* Quick Time Presets */}
                <View style={styles.quickTimesRow}>
                  {[
                    { label: '9:00 AM', h: 9, m: 0, p: 'AM' as const },
                    { label: '12:00 PM', h: 12, m: 0, p: 'PM' as const },
                    { label: '1:00 PM', h: 1, m: 0, p: 'PM' as const },
                    { label: '3:00 PM', h: 3, m: 0, p: 'PM' as const },
                    { label: '6:00 PM', h: 6, m: 0, p: 'PM' as const },
                  ].map((preset) => {
                    const isTimeActive =
                      hour === preset.h &&
                      minute === preset.m &&
                      period === preset.p;
                    return (
                      <TouchableOpacity
                        key={preset.label}
                        style={[
                          styles.quickTimeChip,
                          {
                            backgroundColor: isTimeActive ? colors.accent : colors.surface2,
                            borderColor: isTimeActive ? colors.accent : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setHour(preset.h);
                          setMinute(preset.m);
                          setPeriod(preset.p);
                          syncSchedule(selectedDate, preset.h, preset.m, preset.p);
                        }}
                      >
                        <Text
                          style={[
                            styles.quickTimeChipText,
                            { color: isTimeActive ? '#FFFFFF' : colors.text, fontWeight: isTimeActive ? '700' : '500' },
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Steppers: Hour, Minute (1-Minute Step), AM/PM */}
                <View style={[styles.timeStepperBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  {/* Hour Stepper */}
                  <View style={styles.stepperGroup}>
                    <Text style={[styles.stepperLabel, { color: colors.muted }]}>Hour</Text>
                    <View style={styles.stepperControls}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: colors.surface }]}
                        onPress={() => {
                          const newH = hour === 1 ? 12 : hour - 1;
                          setHour(newH);
                          syncSchedule(selectedDate, newH, minute, period);
                        }}
                      >
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={[styles.stepperValText, { color: colors.text }]}>
                        {hour < 10 ? `0${hour}` : hour}
                      </Text>
                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: colors.surface }]}
                        onPress={() => {
                          const newH = hour === 12 ? 1 : hour + 1;
                          setHour(newH);
                          syncSchedule(selectedDate, newH, minute, period);
                        }}
                      >
                        <Ionicons name="add" size={16} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[styles.stepperColon, { color: colors.muted }]}>:</Text>

                  {/* Minute Stepper (Allows EACH Minute 0-59) */}
                  <View style={styles.stepperGroup}>
                    <Text style={[styles.stepperLabel, { color: colors.muted }]}>Minute</Text>
                    <View style={styles.stepperControls}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: colors.surface }]}
                        onPress={() => {
                          const newM = minute <= 0 ? 59 : minute - 1;
                          setMinute(newM);
                          syncSchedule(selectedDate, hour, newM, period);
                        }}
                      >
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={[styles.stepperValText, { color: colors.text }]}>
                        {minute < 10 ? `0${minute}` : minute}
                      </Text>
                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: colors.surface }]}
                        onPress={() => {
                          const newM = minute >= 59 ? 0 : minute + 1;
                          setMinute(newM);
                          syncSchedule(selectedDate, hour, newM, period);
                        }}
                      >
                        <Ionicons name="add" size={16} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* AM/PM Toggle */}
                  <View style={styles.periodToggleGroup}>
                    <TouchableOpacity
                      style={[
                        styles.periodBtn,
                        period === 'AM' && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => {
                        setPeriod('AM');
                        syncSchedule(selectedDate, hour, minute, 'AM');
                      }}
                    >
                      <Text style={[styles.periodBtnText, { color: period === 'AM' ? '#FFFFFF' : colors.text }]}>
                        AM
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.periodBtn,
                        period === 'PM' && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => {
                        setPeriod('PM');
                        syncSchedule(selectedDate, hour, minute, 'PM');
                      }}
                    >
                      <Text style={[styles.periodBtnText, { color: period === 'PM' ? '#FFFFFF' : colors.text }]}>
                        PM
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Current resolved time display badge */}
            <View style={[styles.resolvedBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Ionicons
                name={isUndated ? 'document-text-outline' : 'alarm-outline'}
                size={18}
                color={isUndated ? colors.muted : colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resolvedLabel, { color: colors.muted }]}>
                  {isUndated ? 'NOTE TYPE' : 'SCHEDULED TARGET TIME'}
                </Text>
                <Text style={[styles.resolvedText, { color: isUndated ? colors.muted : colors.text }]}>
                  {formattedTargetDate}
                </Text>
              </View>
            </View>

            {/* Detected Action Items / Commitments with Bulk Selection */}
            {actionItems.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <View style={styles.todoHeaderRow}>
                  <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 0, marginBottom: 0 }]}>
                    TO-DO TASKS ({actionItems.length}):
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {/* Select All / None Toggle */}
                    <TouchableOpacity
                      style={[styles.todoToolBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                      onPress={handleSelectAllTodos}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={selectedTodoIndices.length === actionItems.length ? 'checkbox' : 'square-outline'}
                        size={13}
                        color={colors.accent}
                      />
                      <Text style={[styles.todoToolBtnText, { color: colors.accent }]}>
                        {selectedTodoIndices.length === actionItems.length ? 'Select None' : 'Select All'}
                      </Text>
                    </TouchableOpacity>

                    {/* Delete Selected (only if 1 or more selected) */}
                    {selectedTodoIndices.length > 0 && (
                      <TouchableOpacity
                        style={[styles.todoToolBtn, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}
                        onPress={handleDeleteSelectedTodos}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash" size={13} color="#EF4444" />
                        <Text style={[styles.todoToolBtnText, { color: '#EF4444' }]}>
                          Delete ({selectedTodoIndices.length})
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Clear All Tasks */}
                    {selectedTodoIndices.length === 0 && actionItems.length > 1 && (
                      <TouchableOpacity
                        style={[styles.todoToolBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                        onPress={handleClearAllTodos}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.todoToolBtnText, { color: colors.muted }]}>Clear All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* To-Do Items with selection checkboxes */}
                {actionItems.map((item, idx) => {
                  const isSelected = selectedTodoIndices.includes(idx);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.actionItemRow,
                        {
                          backgroundColor: isSelected ? colors.accent + '15' : colors.surface2,
                          borderColor: isSelected ? colors.accent : 'transparent',
                          borderWidth: 1,
                        },
                      ]}
                      onPress={() => handleToggleTodoSelection(idx)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={17}
                        color={isSelected ? colors.accent : colors.muted}
                      />
                      <Text style={[styles.actionItemText, { color: colors.text }]}>{item}</Text>
                      <TouchableOpacity
                        onPress={(e) => {
                          handleRemoveAction(idx);
                        }}
                        style={{ padding: 4 }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Reminder Toggles (Only when scheduled) */}
            {!isUndated && (
              <>
                {/* Stage 1: 1-Day Before / Eve Planning Preparation Alert */}
                <View style={[styles.reminderRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="calendar-outline" size={20} color={isEveReminderSet ? colors.accent : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reminderTitle, { color: colors.text }]}>1-Day Before Preparation</Text>
                      <Text style={[styles.reminderSubtitle, { color: colors.muted }]}>
                        {isEveReminderSet
                          ? '8:00 PM Eve alert with to-do list to prepare ahead'
                          : 'No advance preparation alert'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isEveReminderSet}
                    onValueChange={setIsEveReminderSet}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Stage 4: Exact Alarm Notification */}
                <View style={[styles.reminderRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="notifications-outline" size={20} color={isReminderSet ? '#10B981' : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reminderTitle, { color: colors.text }]}>Alarm Notification</Text>
                      <Text style={[styles.reminderSubtitle, { color: colors.muted }]}>
                        {isReminderSet ? 'Will alert with sound & banner on scheduled time' : 'No sound alarm'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isReminderSet}
                    onValueChange={setIsReminderSet}
                    trackColor={{ false: colors.border, true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </>
            )}
          </ScrollView>

          {/* Action Buttons: Cancel vs Save */}
          <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
            <NativeScaleButton
              style={[styles.discardBtn, { borderColor: colors.border }]}
              onPress={onDiscard}
              scaleTo={0.96}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} style={{ marginRight: 4 }} />
              <Text style={[styles.discardBtnText, { color: colors.danger }]}>Cancel</Text>
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
              onPress={() =>
                onConfirm(transcript.trim(), {
                  temporalClass,
                  resolvedDatetime,
                  actionItems,
                  isHighConfidenceReminder: isReminderSet,
                  enableEvePlanningReminder: isEveReminderSet,
                })
              }
              scaleTo={0.96}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>Save Schedule</Text>
            </NativeScaleButton>
          </View>

        </AnimatedModalSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  mergeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  mergeBadgeText: {
    fontSize: 12,
    flex: 1,
  },
  notDetectedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  notDetectedText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  attachedImageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  attachedImageThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#00000020',
  },
  attachedImageTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  attachedImageSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  attachedImageRemoveBtn: {
    padding: 6,
  },
  datePickerMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 6,
    marginBottom: 8,
    gap: 10,
  },
  calendarIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerMainLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  datePickerMainValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  calendarToggleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  calendarToggleTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  transcriptInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 65,
    textAlignVertical: 'top',
  },
  dateChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dateChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  calendarContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
  },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  calendarNavBtn: {
    padding: 6,
  },
  calendarNavMonthText: {
    fontSize: 13,
    fontWeight: '700',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  calendarWeekDayText: {
    fontSize: 11,
    fontWeight: '600',
    width: 28,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 1,
  },
  calendarDayText: {
    fontSize: 12,
  },
  quickTimesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
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
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  stepperGroup: {
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 3,
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
  },
  stepperValText: {
    fontSize: 15,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  stepperColon: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
  },
  periodToggleGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
    marginTop: 12,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  resolvedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
  },
  resolvedLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resolvedText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  todoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  todoToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  todoToolBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  actionItemText: {
    fontSize: 13,
    flex: 1,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 1,
  },
  reminderTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  reminderSubtitle: {
    fontSize: 11,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  discardBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 6,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
