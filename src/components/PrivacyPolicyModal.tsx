import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ visible, onClose }: PrivacyPolicyModalProps) {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(COLORS, insets), [COLORS, insets]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleContainer}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.accent} />
              <Text style={styles.modalTitle}>Privacy Policy</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={26} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={true}>
            {/* Highlight Banner */}
            <View style={styles.guaranteeCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="lock-closed" size={20} color="#10B981" />
                <Text style={styles.guaranteeTitle}>100% On-Device & Zero Cloud</Text>
              </View>
              <Text style={styles.guaranteeDesc}>
                FileLens Pro does not collect, track, or upload your files, photos, or extracted text to any external server. All AI, OCR, duplicate detection, and vault storage happen locally on your phone.
              </Text>
            </View>

            {/* Permissions */}
            <Text style={styles.sectionHeader}>Device Permissions</Text>

            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>📁 All Files Access (MANAGE_EXTERNAL_STORAGE)</Text>
              <Text style={styles.itemDesc}>
                Required for the full-featured File Manager and Storage Analyser & Cleaner: browsing directories, detecting junk cache, identifying exact SHA-256 byte duplicates, large file hogs, and managing user files across device storage.
              </Text>
            </View>

            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>🖼️ Media & Photos (READ_MEDIA_IMAGES / VIDEO)</Text>
              <Text style={styles.itemDesc}>
                Discovers document photos, receipts, and images for offline OCR text extraction, visual similarity grouping, burst photo detection, and local search indexing.
              </Text>
            </View>

            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>📷 Camera</Text>
              <Text style={styles.itemDesc}>
                Allows instant scanning of paper documents, bills, and cards to extract text via OCR and store them in the Smart Cards Vault.
              </Text>
            </View>

            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>🔔 Notifications</Text>
              <Text style={styles.itemDesc}>
                Displays foreground service notifications while indexing and running OCR in the background, keeping you informed of exact progress.
              </Text>
            </View>

            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>⚡ Unrestricted Battery</Text>
              <Text style={styles.itemDesc}>
                Prevents the OS from terminating background OCR or indexing workers when your screen locks or when switching between apps.
              </Text>
            </View>

            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>🌐 Local Network & Wi-Fi</Text>
              <Text style={styles.itemDesc}>
                Powers local PC Explorer (FTP / HTTP server) and peer-to-peer Wi-Fi sharing. All file transfers occur strictly across your private local Wi-Fi or hotspot. No data is sent over the Internet.
              </Text>
            </View>

            {/* Smart Cards Wallet */}
            <Text style={styles.sectionHeader}>Smart Card Wallet</Text>
            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>🛡️ 100% On-Device Storage</Text>
              <Text style={styles.itemDesc}>
                Your cards, documents, and notes are processed and stored strictly on your local device with zero cloud tracking. All OCR and categorization occur 100% offline.
              </Text>
            </View>

            {/* On-Device AI & MiniLM */}
            <Text style={styles.sectionHeader}>On-Device AI & MiniLM Intelligence</Text>
            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>🧠 100% Offline MiniLM Embeddings</Text>
              <Text style={styles.itemDesc}>
                FileLens Pro runs a quantized all-MiniLM-L6-v2 neural model locally on your device via ONNX. It computes 384-dimensional mathematical vectors to enable natural semantic search without transmitting any document content or queries to the cloud.
              </Text>
            </View>

            {/* Total Control */}
            <Text style={styles.sectionHeader}>Data Sovereignty</Text>
            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>🗑️ Clear Anytime</Text>
              <Text style={styles.itemDesc}>
                You can wipe the search index, OCR texts, or cached data at any time via Settings &rarr; Clear Index. Uninstalling the app permanently purges all databases and vault data.
              </Text>
            </View>

            {/* External Link */}
            <TouchableOpacity
              style={styles.webLinkBtn}
              onPress={() => Linking.openURL('https://narendragd999.github.io/FileLensScanner/privacy.html')}
            >
              <Ionicons name="globe-outline" size={16} color={COLORS.accent} />
              <Text style={styles.webLinkText}>View Online Privacy Policy</Text>
              <Ionicons name="open-outline" size={14} color={COLORS.accent} />
            </TouchableOpacity>
          </ScrollView>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(COLORS: any, insets: any) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: Math.max(insets.bottom, 20),
      maxHeight: '85%',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: COLORS.text,
    },
    scrollArea: {
      marginVertical: 14,
    },
    guaranteeCard: {
      backgroundColor: '#10B98115',
      borderColor: '#10B98140',
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    guaranteeTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#10B981',
    },
    guaranteeDesc: {
      fontSize: 13,
      color: COLORS.text,
      lineHeight: 18,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.accent,
      marginTop: 10,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    itemCard: {
      backgroundColor: COLORS.surface2 || COLORS.card || '#1F2937',
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    itemTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: COLORS.text,
      marginBottom: 4,
    },
    itemDesc: {
      fontSize: 12.5,
      color: COLORS.muted,
      lineHeight: 17,
    },
    webLinkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      marginVertical: 10,
      backgroundColor: COLORS.accent + '15',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.accent + '30',
    },
    webLinkText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: COLORS.accent,
    },
    closeBtn: {
      backgroundColor: COLORS.accent,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    closeBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
