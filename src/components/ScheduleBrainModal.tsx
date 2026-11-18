import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Haptics } from '../utils/haptics';
import { StorageItem } from '../services/fileManagerService';
import { scheduleFileToBrain } from '../services/fileToBrainService';
import { formatStorageSize } from '../services/storageAnalyzerService';
import { FileThumbnail } from './FileThumbnail';
import { NativeScaleButton } from './NativeScaleButton';

interface ScheduleBrainModalProps {
  visible: boolean;
  onClose: () => void;
  item: StorageItem | null;
  onSuccess?: () => void;
  colors: any;
}

export const ScheduleBrainModal: React.FC<ScheduleBrainModalProps> = ({
  visible,
  onClose,
  item,
  onSuccess,
  colors,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set initial title when item changes
  useEffect(() => {
    if (item) {
      setTitle(`Review ${item.name}`);
      setNotes('');
      setSelectedPreset(1); // Default: Tomorrow Morning
    }
  }, [item]);

  // Compute preset dates
  const presets = useMemo(() => {
    const now = new Date();

    // Today Evening 6:00 PM
    const todayEve = new Date(now);
    todayEve.setHours(18, 0, 0, 0);
    if (todayEve.getTime() <= now.getTime()) {
      todayEve.setHours(now.getHours() + 2, 0, 0, 0);
    }

    // Tomorrow Morning 9:00 AM
    const tmrwMorn = new Date(now);
    tmrwMorn.setDate(tmrwMorn.getDate() + 1);
    tmrwMorn.setHours(9, 0, 0, 0);

    // Tomorrow Evening 6:00 PM
    const tmrwEve = new Date(now);
    tmrwEve.setDate(tmrwEve.getDate() + 1);
    tmrwEve.setHours(18, 0, 0, 0);

    // In 2 Days 10:00 AM
    const twoDays = new Date(now);
    twoDays.setDate(twoDays.getDate() + 2);
    twoDays.setHours(10, 0, 0, 0);

    // Next Week 9:00 AM
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);

    return [
      { id: 0, label: 'Today Evening', timeStr: '6:00 PM', date: todayEve, icon: 'moon-outline' },
      { id: 1, label: 'Tomorrow Morning', timeStr: '9:00 AM', date: tmrwMorn, icon: 'sunny-outline' },
      { id: 2, label: 'Tomorrow Evening', timeStr: '6:00 PM', date: tmrwEve, icon: 'partly-sunny-outline' },
      { id: 3, label: 'In 2 Days', timeStr: '10:00 AM', date: twoDays, icon: 'calendar-outline' },
      { id: 4, label: 'In 1 Week', timeStr: '9:00 AM', date: nextWeek, icon: 'time-outline' },
    ];
  }, []);

  const handleScheduleSubmit = async () => {
    if (!item || !title.trim()) return;
    setIsSubmitting(true);
    Haptics.medium();

    const targetDate = presets[selectedPreset]?.date || new Date(Date.now() + 86400000);
    const res = await scheduleFileToBrain(item, targetDate, title.trim(), notes.trim());

    setIsSubmitting(false);
    if (res.success) {
      Haptics.success();
      onClose();
      if (onSuccess) onSuccess();
    }
  };

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={e => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: '#8B5CF625' }]}>
                <Ionicons name="bulb-outline" size={22} color="#8B5CF6" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Schedule to Second Brain</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  Automated reminders with document attached
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Attached File Preview Card */}
            <View style={[styles.itemCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <FileThumbnail uri={item.uri} name={item.name} style={styles.thumb} />
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.itemSub, { color: colors.muted }]}>
                  {item.extension.toUpperCase()} · {formatStorageSize(item.size || 0)}
                </Text>
              </View>
              <View style={[styles.attachedBadge, { backgroundColor: colors.accent + '20' }]}>
                <Text style={[styles.attachedText, { color: colors.accent }]}>Attached</Text>
              </View>
            </View>

            {/* Task Title Input */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Task or Reminder Title</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
              value={title}
              onChangeText={setTitle}
              placeholder="What do you need to do with this file?"
              placeholderTextColor={colors.muted}
            />

            {/* Reminder Date & Time Selection */}
            <Text style={[styles.inputLabel, { color: colors.text, marginTop: 16 }]}>
              When should FileLens remind you?
            </Text>
            <View style={styles.presetsGrid}>
              {presets.map(p => {
                const isSelected = selectedPreset === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.presetCard,
                      { backgroundColor: colors.bg, borderColor: isSelected ? colors.accent : colors.border },
                      isSelected && { backgroundColor: colors.accent + '15' },
                    ]}
                    onPress={() => {
                      Haptics.light();
                      setSelectedPreset(p.id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={p.icon as any}
                      size={18}
                      color={isSelected ? colors.accent : colors.muted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.presetLabel, { color: isSelected ? colors.accent : colors.text }]}>
                        {p.label}
                      </Text>
                      <Text style={[styles.presetTime, { color: colors.muted }]}>
                        {p.timeStr}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notes / Subtasks */}
            <Text style={[styles.inputLabel, { color: colors.text, marginTop: 16 }]}>
              Notes or Checklist (Optional)
            </Text>
            <TextInput
              style={[styles.notesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add key notes, page numbers, or action items..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
            />
          </ScrollView>

          {/* Submit Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <NativeScaleButton
              onPress={handleScheduleSubmit}
              style={[styles.submitBtn, { backgroundColor: '#8B5CF6' }]}
              disabled={isSubmitting || !title.trim()}
              hapticType="medium"
            >
              <Ionicons name="alarm-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Scheduling...' : 'Set Reminder in Second Brain'}
              </Text>
            </NativeScaleButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '90%',
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    paddingHorizontal: 20,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  attachedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  attachedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  presetsGrid: {
    gap: 8,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetTime: {
    fontSize: 11,
    marginTop: 1,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
