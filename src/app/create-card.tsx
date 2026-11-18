import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { indexSingleFile } from '../services/indexerService';
import { markFileAsCard } from '../services/database';
import { useThemeColors } from '../utils/theme';
import { formatSize } from '../utils/format';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';

const QUICK_TAGS = [
  { label: '🆔 ID Card', value: 'ID Card' },
  { label: '🧾 Receipt', value: 'Receipt' },
  { label: '💼 Business Card', value: 'Business Card' },
  { label: '📑 Invoice', value: 'Invoice' },
  { label: '🎟️ Pass', value: 'Pass' },
  { label: '🏛️ Govt Doc', value: 'Govt Document' },
  { label: '🏥 Medical', value: 'Medical' },
  { label: '📄 Note', value: 'Note' },
];

export default function CreateCardScreen() {
  const { fileUri, fileId, initialTag, fileName } = useLocalSearchParams<{ 
    fileUri: string; 
    fileId?: string; 
    initialTag?: string;
    fileName?: string;
  }>();
  const router = useRouter();
  const COLORS = useThemeColors();
  
  const [customTag, setCustomTag] = useState(initialTag || '');
  const [tagError, setTagError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [isCard, setIsCard] = useState(true);
  const [fileSize, setFileSize] = useState<number>(0);

  const displayFileName = fileName || (fileUri ? fileUri.split('/').pop() : '') || 'Document';

  // Fetch file size on mount
  useEffect(() => {
    let isMounted = true;
    if (fileUri) {
      FileSystem.getInfoAsync(fileUri)
        .then((info) => {
          if (isMounted && info.exists && info.size) {
            setFileSize(info.size);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [fileUri]);

  // Themed Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    icon?: any;
    iconColor?: string;
    buttons?: AlertButton[];
  }>({
    visible: false,
    title: '',
  });

  const showAlert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { icon?: any; iconColor?: string }
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      buttons: buttons || [
        {
          text: 'OK',
          style: 'default',
          onPress: () => setAlertConfig(c => ({ ...c, visible: false })),
        },
      ],
      icon: options?.icon,
      iconColor: options?.iconColor,
    });
  };

  const hideAlert = () => {
    setAlertConfig(c => ({ ...c, visible: false }));
  };

  const isPdf = fileUri && fileUri.toLowerCase().includes('.pdf');

  const handleSave = async () => {
    if (!fileUri && !fileId) return;

    if (!customTag.trim()) {
      setTagError(true);
      showAlert(
        'Custom Tag Required',
        'Custom Tag is a required field. Please enter a tag name (e.g. Receipt, Invoice, ID Card, Tax 2024).',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.danger }
      );
      return;
    }

    setTagError(false);
    setIsSaving(true);
    try {
      // If file is already in the database, mark it as a card instantly without re-OCR
      if (fileId) {
        const numericId = parseInt(fileId, 10);
        if (!isNaN(numericId) && numericId > 0) {
          await markFileAsCard(numericId, customTag.trim());
          if (isCard) {
            router.replace('/cards');
          } else {
            router.replace('/');
          }
          return;
        }
      }

      const filename = fileName || (fileUri ? fileUri.split('/').pop() : '') || `shared_${Date.now()}`;
      
      let actualSize = 0;
      let actualMod = Date.now() / 1000;
      try {
        const info = await require('expo-file-system/legacy').getInfoAsync(fileUri);
        if (info.exists) {
          actualSize = info.size || 0;
          actualMod = info.modificationTime || actualMod;
        }
      } catch (e) {
        console.warn('Could not get actual file size', e);
      }

      await indexSingleFile(
        {
          uri: fileUri,
          filename: filename,
          fileSize: actualSize,
          modificationTime: actualMod,
          forceIndex: true
        } as any,
        true, // run OCR
        (msg) => setProgress(msg),
        isCard, // dynamically set from the switch
        customTag.trim()
      );
      
      if (isCard) {
        router.replace('/cards');
      } else {
        router.replace('/');
      }
    } catch (err) {
      console.warn('Failed to save file:', err);
      showAlert(
        'Save Failed',
        'Failed to save file to FileLens search database.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.danger }
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isCard ? '/cards' : '/');
    }
  };

  if (!fileUri) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]} edges={['top', 'bottom']}>
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.muted} />
          <Text style={[styles.emptyText, { color: COLORS.text }]}>No file provided.</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: COLORS.accent, marginTop: 16 }]}
            onPress={() => router.replace('/cards')}
          >
            <Text style={styles.primaryButtonText}>Back to Cards</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]} edges={['top', 'bottom']}>
      {/* Compact Minimal Header */}
      <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
        <TouchableOpacity
          onPress={handleCancel}
          style={[styles.headerCloseBtn, { backgroundColor: COLORS.surface2 }]}
          disabled={isSaving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>
            {isCard ? 'Add to Cards' : 'Add File'}
          </Text>
          <Text style={[styles.headerSub, { color: COLORS.muted }]}>
            {isPdf ? 'PDF Document' : 'Card Image'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          style={[styles.headerDoneBtn, { opacity: isSaving ? 0.5 : 1 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Save Card"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Text style={[styles.headerDoneText, { color: COLORS.accent }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Compact Minimal Preview Card */}
          {isPdf ? (
            <View style={[styles.pdfPreviewBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
              <View style={[styles.pdfIconWrap, { backgroundColor: '#EF444418' }]}>
                <Ionicons name="document-text" size={32} color="#EF4444" />
              </View>
              <View style={styles.previewMetaWrap}>
                <Text style={[styles.previewFileName, { color: COLORS.text }]} numberOfLines={1}>
                  {displayFileName}
                </Text>
                <View style={styles.previewBadgeRow}>
                  <View style={[styles.typeBadge, { backgroundColor: '#EF444415', borderColor: '#EF444435' }]}>
                    <Text style={[styles.typeBadgeText, { color: '#EF4444' }]}>PDF</Text>
                  </View>
                  {fileSize > 0 && (
                    <Text style={[styles.fileSizeText, { color: COLORS.muted }]}>
                      {formatSize(fileSize)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.imagePreviewBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Image source={{ uri: fileUri }} style={styles.imagePreview} resizeMode="contain" />
              <View style={styles.imageOverlayStrip}>
                <Ionicons name="image-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.imageOverlayText} numberOfLines={1}>
                  {displayFileName}
                </Text>
                {fileSize > 0 && (
                  <Text style={styles.imageOverlaySub}> • {formatSize(fileSize)}</Text>
                )}
              </View>
            </View>
          )}

          {/* Tag / Category Input Section */}
          <View style={styles.sectionWrap}>
            <View style={styles.inputHeaderRow}>
              <Text style={[styles.sectionLabel, { color: COLORS.text }]}>Card Tag / Category</Text>
              <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '700' }}>* REQUIRED</Text>
            </View>

            <View style={[
              styles.inputWrap,
              { 
                backgroundColor: COLORS.surface, 
                borderColor: tagError && !customTag.trim() ? COLORS.danger : COLORS.border,
              }
            ]}>
              <Ionicons name="pricetag-outline" size={17} color={COLORS.accent} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.inputField, { color: COLORS.text }]}
                placeholder="e.g. ID Card, Receipt, Aadhaar, License..."
                placeholderTextColor={COLORS.muted}
                value={customTag}
                onChangeText={(text) => {
                  setCustomTag(text);
                  if (text.trim()) setTagError(false);
                }}
                editable={!isSaving}
                returnKeyType="done"
              />
              {customTag.length > 0 && !isSaving && (
                <TouchableOpacity
                  onPress={() => setCustomTag('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={17} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>

            {tagError && !customTag.trim() && (
              <Text style={[styles.errorHelperText, { color: COLORS.danger }]}>
                Please enter or select a tag to categorize this card.
              </Text>
            )}

            {/* Quick Tag Suggestion Chips */}
            <View style={styles.quickTagsSection}>
              <Text style={[styles.quickTagsHeading, { color: COLORS.muted }]}>QUICK SUGGESTIONS</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickTagsScroll}
              >
                {QUICK_TAGS.map((tag) => {
                  const isSelected = customTag.trim().toLowerCase() === tag.value.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={tag.value}
                      onPress={() => {
                        setCustomTag(tag.value);
                        setTagError(false);
                      }}
                      style={[
                        styles.quickTagChip,
                        isSelected
                          ? { backgroundColor: COLORS.accent, borderColor: COLORS.accent }
                          : { backgroundColor: COLORS.surface, borderColor: COLORS.border }
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.quickTagChipText,
                          { color: isSelected ? '#FFFFFF' : COLORS.text, fontWeight: isSelected ? '700' : '500' }
                        ]}
                      >
                        {tag.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Save as Card Switch Card */}
          <View style={[styles.switchCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={[styles.switchIconBox, { backgroundColor: COLORS.accent + '15' }]}>
              <Ionicons name="card-outline" size={19} color={COLORS.accent} />
            </View>
            <View style={styles.switchTextWrap}>
              <Text style={[styles.switchTitle, { color: COLORS.text }]}>Save to Cards Tab</Text>
              <Text style={[styles.switchSubtitle, { color: COLORS.muted }]}>
                {isCard ? 'Pin to Cards tab for instant 1-tap access' : 'Save to Search index only (not in Cards tab)'}
              </Text>
            </View>
            <Switch
              value={isCard}
              onValueChange={setIsCard}
              trackColor={{ false: COLORS.border, true: COLORS.accent }}
              thumbColor={isCard ? '#fff' : COLORS.muted}
              disabled={isSaving}
            />
          </View>

          {/* Indexing / OCR Progress Badge */}
          {progress ? (
            <View style={[styles.progressBox, { backgroundColor: COLORS.accent + '12', borderColor: COLORS.accent + '30' }]}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={[styles.progressText, { color: COLORS.accent }]}>{progress}</Text>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <TouchableOpacity 
              style={[styles.primaryButton, { backgroundColor: COLORS.accent, opacity: isSaving ? 0.75 : 1 }]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <View style={styles.buttonInnerRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.primaryButtonText}>Saving Document...</Text>
                </View>
              ) : (
                <View style={styles.buttonInnerRow}>
                  <Ionicons name={isCard ? "card-outline" : "checkmark-circle-outline"} size={19} color="#fff" />
                  <Text style={styles.primaryButtonText}>
                    {isCard ? 'Save to Cards' : 'Save to FileLens'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.secondaryButton, { borderColor: COLORS.accent + '60', opacity: isSaving ? 0.6 : 1 }]}
              onPress={() => {
                if (!fileUri) return;
                router.push({
                  pathname: '/second-brain',
                  params: {
                    sharedText: encodeURIComponent(customTag || displayFileName || 'Document Plan'),
                    sharedImageUri: encodeURIComponent(fileUri),
                  },
                });
              }}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles" size={15} color={COLORS.accent} style={{ marginRight: 6 }} />
              <Text style={[styles.secondaryButtonText, { color: COLORS.accent }]}>
                Schedule in Second Brain
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Themed Alert Modal */}
      <ThemedAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        icon={alertConfig.icon}
        iconColor={alertConfig.iconColor}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerDoneBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerDoneText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 36,
  },
  /* Compact Preview Card */
  pdfPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  pdfIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewMetaWrap: {
    flex: 1,
  },
  previewFileName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  typeBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fileSizeText: {
    fontSize: 11.5,
  },
  imagePreviewBox: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageOverlayStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageOverlayText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
  imageOverlaySub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  /* Input Section */
  sectionWrap: {
    marginBottom: 16,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  inputField: {
    flex: 1,
    fontSize: 14.5,
    paddingVertical: 0,
  },
  errorHelperText: {
    fontSize: 11.5,
    marginTop: 4,
    marginLeft: 2,
  },
  /* Quick Tags */
  quickTagsSection: {
    marginTop: 10,
  },
  quickTagsHeading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 2,
  },
  quickTagsScroll: {
    gap: 6,
    paddingRight: 12,
  },
  quickTagChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  quickTagChipText: {
    fontSize: 11.5,
  },
  /* Switch Card */
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  switchIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  switchTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  switchTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  switchSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  /* Progress */
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 16,
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /* Actions */
  actionSection: {
    marginTop: 6,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
});
