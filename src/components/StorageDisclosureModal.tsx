import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';

interface StorageDisclosureModalProps {
  visible: boolean;
  onAgree: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}

export function StorageDisclosureModal({
  visible,
  onAgree,
  onDecline,
  onCancel,
}: StorageDisclosureModalProps) {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(COLORS, insets), [COLORS, insets]);
  const handleClose = onDecline || onCancel || (() => {});

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={36} color={COLORS.accent} />
          </View>

          {/* Title */}
          <Text style={styles.modalTitle}>Device Storage & Privacy</Text>

          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.introText}>
              FileLens is an on-device offline document search engine. To index and search your files, FileLens requires access to your device storage and files.
            </Text>

            {/* Feature Highlights */}
            <View style={styles.featureItem}>
              <Ionicons name="search" size={20} color={COLORS.accent} style={styles.featureIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Full-Text Offline Search</Text>
                <Text style={styles.featureDesc}>
                  Allows FileLens to scan documents (PDF, DOCX, TXT) and photos to build your local search index.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="lock-closed" size={20} color={COLORS.success} style={styles.featureIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>100% Private & On-Device</Text>
                <Text style={styles.featureDesc}>
                  All OCR and text extraction occur strictly on your device. Your files are never uploaded to any cloud server or shared with third parties.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="hand-left" size={20} color={COLORS.warning} style={styles.featureIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>You Control Your Data</Text>
                <Text style={styles.featureDesc}>
                  You can clear indexed targets or remove the search database at any time in Settings.
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.btn, styles.agreeBtn]} 
              onPress={onAgree}
              activeOpacity={0.8}
            >
              <Text style={styles.agreeBtnText}>Agree & Grant Access</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btn, styles.declineBtn]} 
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.declineBtnText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (COLORS: any, insets: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: (insets?.top || 0) + 24,
    paddingBottom: (insets?.bottom || 0) + 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  introText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.surface2,
    marginBottom: 10,
  },
  featureIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  featureTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  buttonRow: {
    width: '100%',
    marginTop: 18,
    gap: 8,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  agreeBtn: {
    backgroundColor: COLORS.accent,
  },
  agreeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  declineBtn: {
    backgroundColor: 'transparent',
  },
  declineBtnText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});