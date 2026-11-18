/**
 * ScannerExportModal.tsx — Streamlined Single-Screen Share & Export Modal.
 *
 * Implements user specifications:
 *   - Removed: Google Drive, OneNote, Evernote, FTP, WebDAV, Dropbox, Print, Email, Sign, Fax, Expense Report, Business Card.
 *   - Kept: Format selection (PDF / Text), Quality/Size selection (Actual, Large, Medium, Small with dynamic sizes).
 *   - Direct System Share ("Share via other apps") & Save to Files.
 *   - Optional Password protection.
 *   - Theme aligned (COLORS.bg, COLORS.surface, COLORS.surface2, COLORS.accent, COLORS.border, COLORS.text).
 *   - Screen compatible with safe top clearance below status bar/camera notch.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useThemeColors } from '../utils/theme';
import { useStore } from '../store/useStore';
import { ScanPage } from '../services/scannerService';
import {
  exportScannedDocument,
  ExportFormatType,
  QualityPreset,
} from '../services/scannerExportService';
import { saveToPublicDocuments } from '../../modules/expo-pdf-to-image';

export type ResolutionOption = 'actual' | 'large' | 'medium' | 'small';

interface ScannerExportModalProps {
  visible: boolean;
  pages?: ScanPage[];
  pdfUri?: string;
  documentTitle: string;
  pageCount?: number;
  docSize?: number;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScannerExportModal({
  visible,
  pages = [],
  pdfUri,
  documentTitle,
  pageCount: explicitPageCount,
  docSize,
  onClose,
}: ScannerExportModalProps) {
  const COLORS = useThemeColors();
  const theme = useStore(state => state.theme);
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  // Export options state
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'images' | 'text'>('pdf');
  const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>('actual');
  const [password, setPassword] = useState<string>('');
  const [showPasswordDialog, setShowPasswordDialog] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');

  // Processing state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const effectivePageCount = explicitPageCount || (pages.length > 0 ? pages.length : 1);

  // Calculate dynamic sizes for the 4 resolutions
  const baseBytes = useMemo(() => {
    if (docSize && docSize > 0) return docSize;
    if (pages.length > 0) return pages.length * 400 * 1024;
    return 534 * 1024; // Default base ~534 KB
  }, [docSize, pages]);

  const resolutionSizes = useMemo(() => {
    return {
      actual: formatBytes(baseBytes),
      large: formatBytes(Math.round(baseBytes * 0.575)),
      medium: formatBytes(Math.round(baseBytes * 0.33)),
      small: formatBytes(Math.round(baseBytes * 0.16)),
    };
  }, [baseBytes]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExecuteExport = async (destination: 'share' | 'files') => {
    try {
      setIsExporting(true);

      const presetMap: Record<ResolutionOption, QualityPreset> = {
        actual: 'original',
        large: 'standard',
        medium: 'standard',
        small: 'small',
      };

      const formatType: ExportFormatType = selectedFormat === 'text'
        ? 'txt'
        : selectedFormat === 'images'
          ? 'images'
          : selectedResolution === 'small' || selectedResolution === 'medium'
            ? 'compressed_pdf'
            : 'pdf';

      let targetUri = pdfUri;
      if (!targetUri && pages.length > 0) {
        targetUri = pages[0].uri;
      }

      const exportedPath = await exportScannedDocument(pages, targetUri, {
        format: formatType,
        preset: presetMap[selectedResolution],
        resolution: selectedResolution,
        password: password.trim() ? password.trim() : undefined,
        title: documentTitle || 'Document',
        skipShare: true,
      });

      if (destination === 'files') {
        const ext = selectedFormat === 'text'
          ? 'txt'
          : selectedFormat === 'images'
            ? (exportedPath.endsWith('.zip') ? 'zip' : 'jpg')
            : 'pdf';
        const fileName = `${(documentTitle || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
        const isZip = exportedPath.endsWith('.zip');
        const isJpg = exportedPath.endsWith('.jpg') || exportedPath.endsWith('.jpeg');
        const isTxt = selectedFormat === 'text';
        const mimeType = isTxt ? 'text/plain' : isZip ? 'application/zip' : isJpg ? 'image/jpeg' : 'application/pdf';

        try {
          await saveToPublicDocuments(exportedPath, fileName, mimeType);
          showToast(`Saved to Documents/FileLensPro folder!`);
        } catch (saveErr) {
          console.warn('[ScannerExportModal] saveToPublicDocuments failed, falling back to internal storage:', saveErr);
          const destFolder = `${FileSystem.documentDirectory}exports/`;
          const folderInfo = await FileSystem.getInfoAsync(destFolder);
          if (!folderInfo.exists) {
            await FileSystem.makeDirectoryAsync(destFolder, { intermediates: true });
          }
          const savePath = `${destFolder}${fileName}`;
          await FileSystem.copyAsync({ from: exportedPath, to: savePath });
          showToast(`Saved ${fileName} to Documents!`);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // Direct System Share Sheet (Other apps: WhatsApp, Drive, Gmail, Bluetooth, etc.)
        if (await Sharing.isAvailableAsync()) {
          const isZip = exportedPath.endsWith('.zip');
          const isJpg = exportedPath.endsWith('.jpg') || exportedPath.endsWith('.jpeg');
          const isTxt = selectedFormat === 'text';
          const mimeType = isTxt ? 'text/plain' : isZip ? 'application/zip' : isJpg ? 'image/jpeg' : 'application/pdf';

          try {
            await Sharing.shareAsync(exportedPath, {
              dialogTitle: `Share ${documentTitle || 'Document'}`,
              mimeType,
            });
          } catch (shareErr) {
            console.warn('[ScannerExportModal] Share error:', shareErr);
          } finally {
            onClose();
          }
        } else {
          showToast('Sharing is not available on this device.');
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />

        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(260)}
          style={[
            styles.compactSheet,
            {
              backgroundColor: COLORS.surface,
              borderColor: COLORS.border + '60',
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          {/* Top Sheet Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: COLORS.muted + '40' }]} />

          {/* Header Row */}
          <View style={styles.sheetHeaderRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Share & Export</Text>
              <Text style={[styles.sheetSubtitle, { color: COLORS.muted }]} numberOfLines={1}>
                {documentTitle || 'Document'} • {effectivePageCount} {effectivePageCount === 1 ? 'page' : 'pages'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeCircleBtn, { backgroundColor: COLORS.surface2 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* 1. COMPACT FORMAT SELECTOR (PDF, JPEG, TEXT) */}
          <Text style={[styles.fieldLabel, { color: COLORS.muted }]}>FORMAT</Text>
          <View style={[styles.formatSegmentContainer, { backgroundColor: COLORS.surface2, borderColor: COLORS.border + '40' }]}>
            {/* PDF Option */}
            <TouchableOpacity
              style={[
                styles.formatTab,
                selectedFormat === 'pdf' && [styles.formatTabActive, { backgroundColor: COLORS.accent }],
              ]}
              onPress={() => setSelectedFormat('pdf')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="document-text"
                size={16}
                color={selectedFormat === 'pdf' ? '#FFFFFF' : COLORS.text}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.formatTabText,
                  { color: selectedFormat === 'pdf' ? '#FFFFFF' : COLORS.text },
                  selectedFormat === 'pdf' && styles.formatTabTextActive,
                ]}
              >
                PDF
              </Text>
            </TouchableOpacity>

            {/* JPEG Images Option */}
            <TouchableOpacity
              style={[
                styles.formatTab,
                selectedFormat === 'images' && [styles.formatTabActive, { backgroundColor: COLORS.accent }],
              ]}
              onPress={() => setSelectedFormat('images')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="image"
                size={16}
                color={selectedFormat === 'images' ? '#FFFFFF' : COLORS.text}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.formatTabText,
                  { color: selectedFormat === 'images' ? '#FFFFFF' : COLORS.text },
                  selectedFormat === 'images' && styles.formatTabTextActive,
                ]}
              >
                JPEG
              </Text>
            </TouchableOpacity>

            {/* Plain Text Option */}
            <TouchableOpacity
              style={[
                styles.formatTab,
                selectedFormat === 'text' && [styles.formatTabActive, { backgroundColor: COLORS.accent }],
              ]}
              onPress={() => setSelectedFormat('text')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="text"
                size={16}
                color={selectedFormat === 'text' ? '#FFFFFF' : COLORS.text}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.formatTabText,
                  { color: selectedFormat === 'text' ? '#FFFFFF' : COLORS.text },
                  selectedFormat === 'text' && styles.formatTabTextActive,
                ]}
              >
                Text
              </Text>
            </TouchableOpacity>
          </View>

          {/* 2. COMPACT SIZE & RESOLUTION CHIPS (PDF & JPEG) */}
          {selectedFormat !== 'text' ? (
            <View style={{ marginTop: 14 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.fieldLabel, { color: COLORS.muted }]}>SIZE & RESOLUTION</Text>
                <Text style={[styles.estimatedSizeNote, { color: COLORS.accent }]}>
                  Est: {resolutionSizes[selectedResolution]}
                </Text>
              </View>

              <View style={styles.resolutionRow}>
                {(['small', 'medium', 'large', 'actual'] as ResolutionOption[]).map((res) => {
                  const isSelected = selectedResolution === res;
                  const labelMap = {
                    small: 'Small',
                    medium: 'Medium',
                    large: 'Large',
                    actual: 'Actual',
                  };
                  return (
                    <TouchableOpacity
                      key={res}
                      style={[
                        styles.resolutionChip,
                        {
                          backgroundColor: isSelected ? COLORS.accent + '18' : COLORS.surface2,
                          borderColor: isSelected ? COLORS.accent : COLORS.border + '50',
                        },
                      ]}
                      onPress={() => setSelectedResolution(res)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.resolutionChipTitle,
                          { color: isSelected ? COLORS.accent : COLORS.text },
                          isSelected && { fontWeight: '700' },
                        ]}
                      >
                        {labelMap[res]}
                      </Text>
                      <Text
                        style={[
                          styles.resolutionChipSub,
                          { color: isSelected ? COLORS.accent : COLORS.muted },
                        ]}
                      >
                        {resolutionSizes[res]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={[styles.textHintBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border + '40' }]}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
              <Text style={[styles.textHintText, { color: COLORS.muted }]}>
                Extracts raw text content without graphics (~{pages.reduce((acc, p) => acc + (p.ocrText?.length || 0), 0)} chars).
              </Text>
            </View>
          )}

          {/* 3. OPTIONAL PASSWORD ROW */}
          <TouchableOpacity
            style={[
              styles.compactPasswordRow,
              {
                backgroundColor: COLORS.surface2,
                borderColor: COLORS.border + '40',
              },
            ]}
            onPress={() => {
              setPasswordInput(password);
              setShowPasswordDialog(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={password ? 'lock-closed' : 'lock-open-outline'}
                size={16}
                color={password ? COLORS.accent : COLORS.muted}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.passwordLabel, { color: COLORS.text }]}>
                {password ? 'PDF Password Active' : 'PDF Password'}
              </Text>
            </View>
            <View style={[styles.passwordBadge, { backgroundColor: password ? COLORS.accent + '25' : COLORS.surface }]}>
              <Text style={[styles.passwordBadgeText, { color: password ? COLORS.accent : COLORS.muted }]}>
                {password ? '••••••••' : 'Optional'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* 4. COMPACT ACTION BUTTONS (SIDE-BY-SIDE) */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.actionBtnSecondary,
                {
                  backgroundColor: COLORS.surface2,
                  borderColor: COLORS.border + '60',
                },
              ]}
              onPress={() => handleExecuteExport('files')}
              activeOpacity={0.8}
            >
              <Ionicons name="save-outline" size={18} color={COLORS.text} style={{ marginRight: 6 }} />
              <Text style={[styles.actionBtnSecondaryText, { color: COLORS.text }]}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnPrimary, { backgroundColor: COLORS.accent }]}
              onPress={() => handleExecuteExport('share')}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-sharp" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.actionBtnPrimaryText}>Share via Apps</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Loading Overlay */}
        {isExporting && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ color: '#FFFFFF', marginTop: 10, fontWeight: '700', fontSize: 14 }}>
              Compressing & Preparing...
            </Text>
          </View>
        )}

        {/* Toast Popup */}
        {toastMessage && (
          <View style={[styles.toastWrap, { backgroundColor: COLORS.surface, borderColor: COLORS.success }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} style={{ marginRight: 8 }} />
            <Text style={[styles.toastText, { color: COLORS.text }]}>{toastMessage}</Text>
          </View>
        )}

        {/* Password Setup Modal */}
        <Modal visible={showPasswordDialog} transparent animationType="fade">
          <View style={styles.passwordModalOverlay}>
            <Animated.View 
              entering={SlideInDown.springify().damping(18).stiffness(240)}
              style={[styles.passwordModalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            >
              <Text style={[styles.passwordModalTitle, { color: COLORS.text }]}>Set PDF Password</Text>
              <Text style={[styles.passwordModalSubtitle, { color: COLORS.muted }]}>
                Encrypt this document with a custom password.
              </Text>

              <TextInput
                style={[
                  styles.passwordInput,
                  {
                    backgroundColor: COLORS.surface2,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  },
                ]}
                placeholder="Enter password..."
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                value={passwordInput}
                onChangeText={setPasswordInput}
                autoFocus
              />

              <View style={styles.passwordBtnRow}>
                <TouchableOpacity
                  style={[styles.passwordModalBtn, { backgroundColor: COLORS.surface2 }]}
                  onPress={() => {
                    setPassword('');
                    setShowPasswordDialog(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.passwordModalBtn, { backgroundColor: COLORS.accent }]}
                  onPress={() => {
                    setPassword(passwordInput);
                    setShowPasswordDialog(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  compactSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sheetSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  closeCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  estimatedSizeNote: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  formatSegmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  formatTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  formatTabActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  formatTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  formatTabTextActive: {
    fontWeight: '700',
  },
  resolutionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  resolutionChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.2,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolutionChipTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  resolutionChipSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  textHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  textHintText: {
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  compactPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  passwordLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  passwordBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  passwordBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnPrimary: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  toastWrap: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 8,
    zIndex: 1000,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  passwordModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  passwordModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  passwordModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  passwordModalSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    marginBottom: 14,
  },
  passwordBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  passwordModalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
