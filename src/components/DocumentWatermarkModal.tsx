import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';

interface DocumentWatermarkModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (params: { text: string; color: string; opacity: number; applyToAll: boolean }) => void;
}

const PRESET_WATERMARKS = [
  { text: 'CONFIDENTIAL', color: '#EF4444' },
  { text: 'FOR KYC ONLY', color: '#F59E0B' },
  { text: 'COPY', color: '#64748B' },
  { text: 'ORIGINAL', color: '#10B981' },
  { text: 'DRAFT', color: '#6366F1' },
  { text: 'SAMPLE', color: '#EC4899' },
];

const COLOR_OPTIONS = [
  { label: 'Red', hex: '#EF4444' },
  { label: 'Amber', hex: '#F59E0B' },
  { label: 'Slate', hex: '#64748B' },
  { label: 'Emerald', hex: '#10B981' },
  { label: 'Blue', hex: '#3B82F6' },
];

export const DocumentWatermarkModal: React.FC<DocumentWatermarkModalProps> = ({
  visible,
  onClose,
  onApply,
}) => {
  const COLORS = useThemeColors();
  const [selectedText, setSelectedText] = useState<string>('CONFIDENTIAL');
  const [customText, setCustomText] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('#EF4444');
  const [opacity, setOpacity] = useState<number>(0.28);
  const [applyToAll, setApplyToAll] = useState<boolean>(true);

  const activeWatermarkText = customText.trim() ? customText.trim().toUpperCase() : selectedText;

  const handleApply = () => {
    if (!activeWatermarkText) return;
    onApply({
      text: activeWatermarkText,
      color: selectedColor,
      opacity,
      applyToAll,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="shield-checkmark" size={22} color={COLORS.accent} />
              <Text style={[styles.modalTitle, { color: COLORS.text }]}>Add Watermark</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Live Preview Pill */}
            <View style={[styles.previewContainer, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Text
                style={[
                  styles.previewWatermarkText,
                  {
                    color: selectedColor,
                    opacity: Math.max(0.4, opacity + 0.2),
                  },
                ]}
                numberOfLines={1}
              >
                {activeWatermarkText || 'SAMPLE WATERMARK'}
              </Text>
            </View>

            {/* Presets Grid */}
            <Text style={[styles.sectionLabel, { color: COLORS.muted }]}>QUICK PRESETS</Text>
            <View style={styles.presetsGrid}>
              {PRESET_WATERMARKS.map(item => {
                const isSelected = !customText && selectedText === item.text;
                return (
                  <TouchableOpacity
                    key={item.text}
                    style={[
                      styles.presetChip,
                      { backgroundColor: COLORS.surface2, borderColor: isSelected ? item.color : COLORS.border },
                      isSelected && { borderWidth: 2, backgroundColor: item.color + '18' },
                    ]}
                    onPress={() => {
                      setSelectedText(item.text);
                      setSelectedColor(item.color);
                      setCustomText('');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        { color: isSelected ? item.color : COLORS.text, fontWeight: isSelected ? '700' : '500' },
                      ]}
                    >
                      {item.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Watermark Input */}
            <Text style={[styles.sectionLabel, { color: COLORS.muted, marginTop: 14 }]}>CUSTOM TEXT</Text>
            <TextInput
              style={[styles.input, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, color: COLORS.text }]}
              value={customText}
              onChangeText={setCustomText}
              placeholder="e.g. STRICTLY PRIVATE, VERIFIED..."
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
            />

            {/* Color Palette */}
            <Text style={[styles.sectionLabel, { color: COLORS.muted, marginTop: 14 }]}>COLOR</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map(c => {
                const isChosen = selectedColor === c.hex;
                return (
                  <TouchableOpacity
                    key={c.hex}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c.hex },
                      isChosen && styles.colorCircleChosen,
                    ]}
                    onPress={() => setSelectedColor(c.hex)}
                    activeOpacity={0.8}
                  >
                    {isChosen && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Opacity Selector */}
            <Text style={[styles.sectionLabel, { color: COLORS.muted, marginTop: 14 }]}>OPACITY</Text>
            <View style={styles.opacityRow}>
              {[
                { label: 'Subtle (18%)', val: 0.18 },
                { label: 'Standard (28%)', val: 0.28 },
                { label: 'Strong (45%)', val: 0.45 },
              ].map(opt => {
                const isCur = opacity === opt.val;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[
                      styles.opacityBtn,
                      { backgroundColor: COLORS.surface2, borderColor: isCur ? COLORS.accent : COLORS.border },
                      isCur && { backgroundColor: COLORS.accent + '15', borderWidth: 1.5 },
                    ]}
                    onPress={() => setOpacity(opt.val)}
                  >
                    <Text style={[styles.opacityBtnText, { color: isCur ? COLORS.accent : COLORS.muted }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Page Scope Selector: All Pages vs Current Page */}
            <Text style={[styles.sectionLabel, { color: COLORS.muted, marginTop: 14 }]}>APPLY TO PAGES</Text>
            <View style={styles.scopeRow}>
              <TouchableOpacity
                style={[
                  styles.scopeBtn,
                  { backgroundColor: COLORS.surface2, borderColor: applyToAll ? COLORS.accent : COLORS.border },
                  applyToAll && { backgroundColor: COLORS.accent + '15', borderWidth: 1.5 },
                ]}
                onPress={() => setApplyToAll(true)}
              >
                <Ionicons
                  name={applyToAll ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={applyToAll ? COLORS.accent : COLORS.muted}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.scopeBtnText, { color: applyToAll ? COLORS.accent : COLORS.text, fontWeight: applyToAll ? '700' : '500' }]}>
                  All Pages (Recommended)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.scopeBtn,
                  { backgroundColor: COLORS.surface2, borderColor: !applyToAll ? COLORS.accent : COLORS.border },
                  !applyToAll && { backgroundColor: COLORS.accent + '15', borderWidth: 1.5 },
                ]}
                onPress={() => setApplyToAll(false)}
              >
                <Ionicons
                  name={!applyToAll ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={!applyToAll ? COLORS.accent : COLORS.muted}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.scopeBtnText, { color: !applyToAll ? COLORS.accent : COLORS.text, fontWeight: !applyToAll ? '700' : '500' }]}>
                  Current Page Only
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={[styles.footerRow, { borderTopColor: COLORS.border }]}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: COLORS.border }]} onPress={onClose}>
              <Text style={[styles.cancelBtnText, { color: COLORS.muted }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: COLORS.accent }]}
              onPress={handleApply}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.applyBtnText}>Apply Watermark</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  previewContainer: {
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  previewWatermarkText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    transform: [{ rotate: '-8deg' }],
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCircleChosen: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  opacityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  opacityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  opacityBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scopeRow: {
    gap: 8,
    marginTop: 4,
  },
  scopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  scopeBtnText: {
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  applyBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
