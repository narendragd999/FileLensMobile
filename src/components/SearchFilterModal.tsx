import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../utils/theme';
import { NativeScaleButton } from './NativeScaleButton';
import { Haptics } from '../utils/haptics';
import { SearchFilters, SearchMode } from '../models/types';

export interface SearchFilterModalProps {
  visible: boolean;
  onClose: () => void;
  activeFilters: SearchFilters;
  onApplyFilters: (filters: SearchFilters, mode?: SearchMode) => void;
  currentSearchMode: SearchMode;
  onSelectSearchMode: (mode: SearchMode) => void;
}

const SEARCH_MODES: { mode: SearchMode; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; badgeColor: string }[] = [
  {
    mode: 'partial',
    label: 'Quick Search',
    desc: 'Instant FTS5 match by words or partial prefixes',
    icon: 'flash',
    badgeColor: '#3B82F6',
  },
  {
    mode: 'similar',
    label: 'Natural Language',
    desc: 'Multilingual semantic concept & meaning search',
    icon: 'sparkles',
    badgeColor: '#8B5CF6',
  },
  {
    mode: 'exact',
    label: 'Exact Match',
    desc: 'Locate files with the verbatim literal phrase',
    icon: 'locate',
    badgeColor: '#10B981',
  },
  {
    mode: 'whole_word',
    label: 'Whole Word',
    desc: 'Standalone words only, no substring fragments',
    icon: 'text',
    badgeColor: '#F59E0B',
  },
];

const FILE_TYPE_OPTIONS: { id: string; label: string; ext: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { id: 'Images', label: 'Images', ext: 'JPG, PNG, WEBP', icon: 'image', color: '#10B981' },
  { id: 'PDFs', label: 'PDF Docs', ext: 'PDF documents', icon: 'document-text', color: '#EF4444' },
  { id: 'Documents', label: 'Office & Text', ext: 'DOCX, TXT, XLSX', icon: 'folder-open', color: '#3B82F6' },
  { id: 'Audio', label: 'Audio', ext: 'MP3, M4A, WAV', icon: 'musical-notes', color: '#8B5CF6' },
  { id: 'Video', label: 'Videos', ext: 'MP4, MKV, MOV', icon: 'videocam', color: '#F59E0B' },
];

const SIZE_PRESETS = [
  { id: 'any', label: 'Any Size', min: undefined, max: undefined },
  { id: 'small', label: '< 1 MB', min: undefined, max: 1024 * 1024 },
  { id: 'medium', label: '1 – 10 MB', min: 1024 * 1024, max: 10 * 1024 * 1024 },
  { id: 'large', label: '10 – 50 MB', min: 10 * 1024 * 1024, max: 50 * 1024 * 1024 },
  { id: 'xlarge', label: '> 50 MB', min: 50 * 1024 * 1024, max: undefined },
];

const DATE_PRESETS = [
  { id: 'any', label: 'Any Time', days: 0 },
  { id: 'today', label: 'Past 24h', days: 1 },
  { id: 'week', label: 'Past 7 days', days: 7 },
  { id: 'month', label: 'Past 30 days', days: 30 },
  { id: 'year', label: 'This Year', days: 365 },
];

export const SearchFilterModal: React.FC<SearchFilterModalProps> = ({
  visible,
  onClose,
  activeFilters,
  onApplyFilters,
  currentSearchMode,
  onSelectSearchMode,
}) => {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();

  // Local draft state so user can configure and then tap Apply
  const [selectedMode, setSelectedMode] = useState<SearchMode>(currentSearchMode);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(activeFilters?.fileTypes || []);
  const [selectedSizePreset, setSelectedSizePreset] = useState<string>('any');
  const [selectedDatePreset, setSelectedDatePreset] = useState<string>('any');

  // Sync state whenever modal opens
  useEffect(() => {
    if (visible) {
      setSelectedMode(currentSearchMode);
      setSelectedTypes(activeFilters?.fileTypes || []);

      // Determine size preset
      if (activeFilters?.minSize === undefined && activeFilters?.maxSize === undefined) {
        setSelectedSizePreset('any');
      } else if (activeFilters?.maxSize === 1024 * 1024) {
        setSelectedSizePreset('small');
      } else if (activeFilters?.minSize === 1024 * 1024 && activeFilters?.maxSize === 10 * 1024 * 1024) {
        setSelectedSizePreset('medium');
      } else if (activeFilters?.minSize === 10 * 1024 * 1024 && activeFilters?.maxSize === 50 * 1024 * 1024) {
        setSelectedSizePreset('large');
      } else if (activeFilters?.minSize === 50 * 1024 * 1024) {
        setSelectedSizePreset('xlarge');
      } else {
        setSelectedSizePreset('any');
      }

      // Determine date preset
      if (!activeFilters?.modifiedAfter) {
        setSelectedDatePreset('any');
      } else {
        const diffDays = Math.round((Date.now() - new Date(activeFilters.modifiedAfter).getTime()) / (86400 * 1000));
        if (diffDays <= 2) setSelectedDatePreset('today');
        else if (diffDays <= 8) setSelectedDatePreset('week');
        else if (diffDays <= 35) setSelectedDatePreset('month');
        else setSelectedDatePreset('year');
      }
    }
  }, [visible, activeFilters, currentSearchMode]);

  const toggleFileType = (typeId: string) => {
    Haptics.light();
    setSelectedTypes(prev => {
      if (prev.includes(typeId)) {
        return prev.filter(t => t !== typeId);
      }
      return [...prev, typeId];
    });
  };

  const handleReset = () => {
    Haptics.medium();
    setSelectedMode('partial');
    setSelectedTypes([]);
    setSelectedSizePreset('any');
    setSelectedDatePreset('any');
    onSelectSearchMode('partial');
    onApplyFilters({}, 'partial');
    onClose();
  };

  const handleApply = () => {
    Haptics.medium();
    const sizeConfig = SIZE_PRESETS.find(p => p.id === selectedSizePreset);
    const dateConfig = DATE_PRESETS.find(p => p.id === selectedDatePreset);

    let modifiedAfter: string | undefined = undefined;
    if (dateConfig && dateConfig.days > 0) {
      modifiedAfter = new Date(Date.now() - dateConfig.days * 86400 * 1000).toISOString();
    }

    const nextFilters: SearchFilters = {
      fileTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
      minSize: sizeConfig?.min,
      maxSize: sizeConfig?.max,
      modifiedAfter,
    };

    onSelectSearchMode(selectedMode);
    onApplyFilters(nextFilters, selectedMode);
    onClose();
  };

  // Compute active count
  const activeCount =
    (selectedTypes.length > 0 ? selectedTypes.length : 0) +
    (selectedSizePreset !== 'any' ? 1 : 0) +
    (selectedDatePreset !== 'any' ? 1 : 0) +
    (selectedMode !== 'partial' ? 1 : 0);

  // Guarantee comfortable bottom clearance for 3-button navigation
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: COLORS.surface,
              borderColor: COLORS.border,
              paddingBottom: safeBottom + 8,
            },
          ]}
        >
          {/* Top Drag Indicator */}
          <View style={styles.dragHandleWrap}>
            <View style={[styles.dragHandle, { backgroundColor: COLORS.muted + '40' }]} />
          </View>

          {/* Modal Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.headerIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="options" size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.title, { color: COLORS.text }]}>Search Refinements</Text>
                  {activeCount > 0 && (
                    <View style={[styles.activeBadge, { backgroundColor: COLORS.accent }]}>
                      <Text style={styles.activeBadgeText}>{activeCount} active</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.subtitle, { color: COLORS.muted }]}>
                  Filter by intelligence mode, category, size & date
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.closeBtn, { backgroundColor: COLORS.surface2 }]}
              accessibilityLabel="Close filter dialog"
            >
              <Ionicons name="close" size={19} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Filters Content */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* --- Section 1: Search Intelligence Mode --- */}
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="bulb-outline" size={14} color={COLORS.accent} />
              <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>SEARCH INTELLIGENCE & MODE</Text>
            </View>

            <View style={styles.modeGrid}>
              {SEARCH_MODES.map((item) => {
                const isSelected = selectedMode === item.mode;
                return (
                  <NativeScaleButton
                    key={item.mode}
                    onPress={() => {
                      Haptics.light();
                      setSelectedMode(item.mode);
                    }}
                    style={[
                      styles.modeCard,
                      {
                        backgroundColor: isSelected ? item.badgeColor + '18' : COLORS.surface2,
                        borderColor: isSelected ? item.badgeColor : COLORS.border,
                      },
                    ]}
                    activeScale={0.97}
                    hapticType="light"
                  >
                    <View style={styles.modeCardHeader}>
                      <View style={[styles.modeIconCircle, { backgroundColor: item.badgeColor + '25' }]}>
                        <Ionicons name={item.icon} size={16} color={item.badgeColor} />
                      </View>
                      {isSelected ? (
                        <View style={[styles.modeCheckDot, { backgroundColor: item.badgeColor }]}>
                          <Ionicons name="checkmark" size={12} color="#FFF" />
                        </View>
                      ) : (
                        <View style={[styles.modeEmptyDot, { borderColor: COLORS.border }]} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.modeTitle,
                        { color: isSelected ? COLORS.text : COLORS.textSecondary },
                        isSelected && { fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    <Text style={[styles.modeDesc, { color: COLORS.muted }]} numberOfLines={2}>
                      {item.desc}
                    </Text>
                  </NativeScaleButton>
                );
              })}
            </View>

            {/* --- Section 2: File Categories --- */}
            <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
              <Ionicons name="folder-outline" size={14} color={COLORS.accent} />
              <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>FILE CATEGORIES</Text>
            </View>

            <View style={styles.categoriesWrap}>
              {FILE_TYPE_OPTIONS.map((item) => {
                const isSelected = selectedTypes.includes(item.id);
                return (
                  <NativeScaleButton
                    key={item.id}
                    onPress={() => toggleFileType(item.id)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected ? item.color + '20' : COLORS.surface2,
                        borderColor: isSelected ? item.color : COLORS.border,
                      },
                    ]}
                    activeScale={0.96}
                    hapticType="light"
                  >
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={isSelected ? item.color : COLORS.muted}
                      style={{ marginRight: 6 }}
                    />
                    <View style={{ flexShrink: 1 }}>
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: isSelected ? COLORS.text : COLORS.textSecondary },
                          isSelected && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={item.color}
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </NativeScaleButton>
                );
              })}
            </View>

            {/* --- Section 3: File Size Presets --- */}
            <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
              <Ionicons name="hardware-chip-outline" size={14} color={COLORS.accent} />
              <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>FILE SIZE</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalChipsRow}
            >
              {SIZE_PRESETS.map((p) => {
                const isSelected = selectedSizePreset === p.id;
                return (
                  <NativeScaleButton
                    key={p.id}
                    onPress={() => {
                      Haptics.light();
                      setSelectedSizePreset(p.id);
                    }}
                    style={[
                      styles.pillChip,
                      {
                        backgroundColor: isSelected ? COLORS.accent + '22' : COLORS.surface2,
                        borderColor: isSelected ? COLORS.accent : COLORS.border,
                      },
                    ]}
                    activeScale={0.95}
                    hapticType="light"
                  >
                    <Text
                      style={[
                        styles.pillChipText,
                        { color: isSelected ? COLORS.accent : COLORS.textSecondary },
                        isSelected && { fontWeight: '700' },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </NativeScaleButton>
                );
              })}
            </ScrollView>

            {/* --- Section 4: Date Modified Presets --- */}
            <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.accent} />
              <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>MODIFIED DATE</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalChipsRow}
            >
              {DATE_PRESETS.map((d) => {
                const isSelected = selectedDatePreset === d.id;
                return (
                  <NativeScaleButton
                    key={d.id}
                    onPress={() => {
                      Haptics.light();
                      setSelectedDatePreset(d.id);
                    }}
                    style={[
                      styles.pillChip,
                      {
                        backgroundColor: isSelected ? COLORS.accent + '22' : COLORS.surface2,
                        borderColor: isSelected ? COLORS.accent : COLORS.border,
                      },
                    ]}
                    activeScale={0.95}
                    hapticType="light"
                  >
                    <Text
                      style={[
                        styles.pillChipText,
                        { color: isSelected ? COLORS.accent : COLORS.textSecondary },
                        isSelected && { fontWeight: '700' },
                      ]}
                    >
                      {d.label}
                    </Text>
                  </NativeScaleButton>
                );
              })}
            </ScrollView>
          </ScrollView>

          {/* Bottom Action Footer */}
          <View style={[styles.footer, { borderTopColor: COLORS.border + '60' }]}>
            <NativeScaleButton
              onPress={handleReset}
              style={[styles.resetBtn, { borderColor: COLORS.border, backgroundColor: COLORS.surface2 }]}
              activeScale={0.96}
              hapticType="light"
            >
              <Ionicons name="refresh-outline" size={16} color={COLORS.danger} style={{ marginRight: 5 }} />
              <Text style={[styles.resetBtnText, { color: COLORS.danger }]}>Reset All</Text>
            </NativeScaleButton>

            <NativeScaleButton
              onPress={handleApply}
              style={[styles.applyBtn, { backgroundColor: COLORS.accent }]}
              activeScale={0.96}
              hapticType="medium"
            >
              <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.applyBtnText}>
                {activeCount > 0 ? `Apply (${activeCount})` : 'Apply Filters'}
              </Text>
            </NativeScaleButton>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '86%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    maxHeight: 460,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeCard: {
    width: '48.5%',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  modeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modeIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCheckDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeEmptyDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  modeTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  modeDesc: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  horizontalChipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  pillChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
