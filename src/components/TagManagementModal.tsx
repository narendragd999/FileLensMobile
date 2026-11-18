import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, LinearTransition } from 'react-native-reanimated';
import { useThemeColors } from '../utils/theme';
import { MotionTiming, cardLayoutTransition } from '../utils/motion';
import { NativeScaleButton } from './NativeScaleButton';
import {
  TAG_CATEGORIES,
  ALL_PRESET_TAGS,
  detectSmartTags,
  TagCategory,
} from '../services/smartTagService';
import { getAllUniqueBookmarkTags } from '../services/bookmarksService';

export interface TagManagementModalProps {
  visible: boolean;
  fileUri: string;
  fileName: string;
  initialTags?: string[];
  contentText?: string | null;
  ocrText?: string | null;
  onSave: (tags: string[]) => Promise<void> | void;
  onClose: () => void;
}

export function TagManagementModal({
  visible,
  fileUri,
  fileName,
  initialTags = [],
  contentText,
  ocrText,
  onSave,
  onClose,
}: TagManagementModalProps) {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('identity');
  const [customHistoryTags, setCustomHistoryTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Initialize tags & fetch custom tag history on open
  useEffect(() => {
    if (visible) {
      setActiveTags(initialTags || []);
      setSearchQuery('');
      setIsSaving(false);
      getAllUniqueBookmarkTags().then(setCustomHistoryTags).catch(() => {});
    }
  }, [visible, initialTags]);

  // Compute smart suggested tags based on document content
  const smartSuggestions = useMemo(() => {
    if (!visible) return [];
    const detected = detectSmartTags(fileName, contentText, ocrText);
    return detected.filter((tag) => !activeTags.includes(tag));
  }, [visible, fileName, contentText, ocrText, activeTags]);

  // Filter preset tags matching search query
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_PRESET_TAGS.filter(
      (tag) => tag.toLowerCase().includes(q) && !activeTags.includes(tag)
    );
  }, [searchQuery, activeTags]);

  // Current category data
  const currentCat = useMemo(() => {
    return TAG_CATEGORIES.find((c) => c.id === selectedCategory) || TAG_CATEGORIES[0];
  }, [selectedCategory]);

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!activeTags.includes(trimmed)) {
      setActiveTags((prev) => [...prev, trimmed]);
    }
    setSearchQuery('');
  };

  const handleRemoveTag = (tag: string) => {
    setActiveTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(activeTags);
      onClose();
    } catch (e) {
      console.warn('Failed to save tags:', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <Animated.View
            entering={SlideInDown.springify().damping(22).stiffness(260)}
            exiting={SlideOutDown.duration(MotionTiming.quick)}
            style={[
              styles.modalCard,
              {
                backgroundColor: COLORS.surface,
                borderColor: COLORS.border,
                paddingBottom: safeBottom,
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
              <View style={styles.headerTitleWrap}>
                <Ionicons name="pricetags" size={20} color={COLORS.accent} />
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Manage Tags</Text>
              </View>
              <NativeScaleButton onPress={onClose} style={styles.closeBtn} activeScale={0.88}>
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </NativeScaleButton>
            </View>

          {/* Document Name Subtitle */}
          <View style={[styles.docSubheader, { backgroundColor: COLORS.surface2 }]}>
            <Ionicons name="document-text-outline" size={14} color={COLORS.accentSoft} />
            <Text style={[styles.docNameText, { color: COLORS.text }]} numberOfLines={1}>
              {fileName}
            </Text>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Active Tags Section */}
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>
                Active Tags ({activeTags.length})
              </Text>
              <View style={styles.activeTagsWrap}>
                {activeTags.length > 0 ? (
                  activeTags.map((tag) => (
                    <View key={tag} style={[styles.activeTagBadge, { backgroundColor: COLORS.accent }]}>
                      <Text style={styles.activeTagText}>#{tag}</Text>
                      <TouchableOpacity onPress={() => handleRemoveTag(tag)} style={styles.removeTagBtn}>
                        <Ionicons name="close-circle" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.noTagsText, { color: COLORS.muted }]}>
                    No tags assigned yet. Tap smart suggestions or categories below.
                  </Text>
                )}
              </View>
            </View>

            {/* Smart Suggestions Section */}
            {smartSuggestions.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Text style={[styles.sectionTitle, { color: '#8B5CF6', marginBottom: 0 }]}>
                    ✨ Smart Suggestions
                  </Text>
                  <Text style={{ fontSize: 10, color: COLORS.muted }}>(detected from content)</Text>
                </View>
                <View style={styles.tagsGrid}>
                  {smartSuggestions.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.suggestedTagChip, { backgroundColor: '#8B5CF622', borderColor: '#8B5CF6' }]}
                      onPress={() => handleAddTag(tag)}
                    >
                      <Ionicons name="sparkles" size={12} color="#8B5CF6" />
                      <Text style={[styles.suggestedTagText, { color: '#8B5CF6' }]}>+ {tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Search & Custom Input */}
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Search 65+ Tags or Create New</Text>
              <View style={[styles.searchBar, { backgroundColor: COLORS.bg, borderColor: COLORS.border }]}>
                <Ionicons name="search" size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: COLORS.text }]}
                  placeholder="e.g. Electricity Bill, ITR, Office..."
                  placeholderTextColor={COLORS.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="words"
                />
                {searchQuery.trim().length > 0 && (
                  <TouchableOpacity onPress={() => handleAddTag(searchQuery)} style={[styles.addCustomBtn, { backgroundColor: COLORS.accent }]}>
                    <Text style={styles.addCustomBtnText}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Search Results (if typing) */}
            {searchQuery.trim().length > 0 ? (
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>
                  Matching Tags ({searchResults.length})
                </Text>
                <View style={styles.tagsGrid}>
                  {searchResults.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagChip, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                      onPress={() => handleAddTag(tag)}
                    >
                      <Text style={[styles.tagChipText, { color: COLORS.text }]}>+ {tag}</Text>
                    </TouchableOpacity>
                  ))}
                  {/* Option to add custom tag */}
                  <TouchableOpacity
                    style={[styles.tagChip, { backgroundColor: COLORS.accentSoft + '22', borderColor: COLORS.accent }]}
                    onPress={() => handleAddTag(searchQuery)}
                  >
                    <Ionicons name="add" size={14} color={COLORS.accent} />
                    <Text style={[styles.tagChipText, { color: COLORS.accent, fontWeight: 'bold' }]}>
                      Create "#{searchQuery.trim()}"
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Category Browser (if not typing) */
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Browse Categories</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabsScroll}>
                  {TAG_CATEGORIES.map((cat) => {
                    const active = selectedCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.catTab,
                          active && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                          !active && { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                        ]}
                        onPress={() => setSelectedCategory(cat.id)}
                      >
                        <Ionicons
                          name={cat.icon as any}
                          size={14}
                          color={active ? '#fff' : COLORS.text}
                          style={{ marginRight: 5 }}
                        />
                        <Text style={[styles.catTabText, { color: active ? '#fff' : COLORS.text }]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Category Tags Grid */}
                <View style={[styles.tagsGrid, { marginTop: 10 }]}>
                  {currentCat.tags.map((tag) => {
                    const isAdded = activeTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[
                          styles.tagChip,
                          isAdded && { backgroundColor: COLORS.accentSoft + '33', borderColor: COLORS.accent },
                          !isAdded && { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                        ]}
                        onPress={() => (isAdded ? handleRemoveTag(tag) : handleAddTag(tag))}
                      >
                        <Ionicons
                          name={isAdded ? 'checkmark' : 'add'}
                          size={13}
                          color={isAdded ? COLORS.accent : COLORS.muted}
                        />
                        <Text style={[styles.tagChipText, { color: isAdded ? COLORS.accent : COLORS.text }]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Custom History Tags (if available) */}
            {customHistoryTags.length > 0 && searchQuery.trim().length === 0 && (
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Your Custom Tags</Text>
                <View style={styles.tagsGrid}>
                  {customHistoryTags.map((tag) => {
                    const isAdded = activeTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[
                          styles.tagChip,
                          isAdded && { backgroundColor: COLORS.accentSoft + '33', borderColor: COLORS.accent },
                          !isAdded && { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                        ]}
                        onPress={() => (isAdded ? handleRemoveTag(tag) : handleAddTag(tag))}
                      >
                        <Text style={[styles.tagChipText, { color: isAdded ? COLORS.accent : COLORS.text }]}>
                          #{tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom Action Buttons */}
          <View style={[styles.footer, { borderTopColor: COLORS.border + '60', backgroundColor: COLORS.surface }]}>
            <NativeScaleButton onPress={onClose} style={[styles.cancelBtn, { borderColor: COLORS.border }]} disabled={isSaving} activeScale={0.95}>
              <Text style={[styles.cancelBtnText, { color: COLORS.muted }]}>Cancel</Text>
            </NativeScaleButton>

            <NativeScaleButton onPress={handleSave} style={[styles.saveBtn, { backgroundColor: COLORS.accent }]} disabled={isSaving} activeScale={0.95} hapticType="medium">
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Save & Apply Tags</Text>
                </>
              )}
            </NativeScaleButton>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  docSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 6,
  },
  docNameText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  scrollContent: {
    flexShrink: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionWrap: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  activeTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 32,
    alignItems: 'center',
  },
  activeTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  activeTagText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  removeTagBtn: {
    padding: 2,
  },
  noTagsText: {
    fontSize: 12.5,
    fontStyle: 'italic',
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestedTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  suggestedTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
  },
  addCustomBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  addCustomBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryTabsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  catTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  catTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});