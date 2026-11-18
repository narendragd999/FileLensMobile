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
import { requestIgnoreBatteryOptimizations } from '../services/indexerService';

interface BatteryOptimizationModalProps {
  visible: boolean;
  onClose: () => void;
  onAllowed?: () => void;
}

export function BatteryOptimizationModal({
  visible,
  onClose,
  onAllowed,
}: BatteryOptimizationModalProps) {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(COLORS, insets), [COLORS, insets]);

  if (!visible) return null;

  const handleEnable = async () => {
    onClose();
    await requestIgnoreBatteryOptimizations();
    if (onAllowed) {
      onAllowed();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="battery-charging" size={32} color={COLORS.accent} />
          </View>

          {/* Title */}
          <Text style={styles.modalTitle}>Fast Background Indexing</Text>

          <Text style={styles.introText}>
            Android automatically pauses apps when you switch to other apps or lock your screen. Allow background running so FileLensPro finishes scanning uninterrupted.
          </Text>

          {/* Specific Instruction Box for Users */}
          <View style={styles.instructionBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="information-circle" size={18} color={COLORS.accent} />
              <Text style={styles.instructionTitle}>Which option to select on next screen:</Text>
            </View>
            <View style={styles.optionRowGuide}>
              <Ionicons name="checkmark-circle" size={17} color={COLORS.success} style={{ marginTop: 1 }} />
              <Text style={styles.optionTextGuide}>
                Select <Text style={{ fontWeight: 'bold', color: COLORS.success }}>"Unrestricted"</Text> or <Text style={{ fontWeight: 'bold', color: COLORS.success }}>"No restrictions"</Text> (or tap <Text style={{ fontWeight: 'bold', color: COLORS.success }}>"Allow"</Text>)
              </Text>
            </View>
            <View style={styles.optionRowGuide}>
              <Ionicons name="close-circle" size={17} color={COLORS.danger} style={{ marginTop: 1 }} />
              <Text style={[styles.optionTextGuide, { color: COLORS.muted }]}>
                Do NOT select "Optimized" or "Restricted" (those pause indexing)
              </Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            {/* Feature Highlights with Clean Pill Cards */}
            <View style={styles.featureCard}>
              <View style={[styles.featureBadge, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="flash" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Never Pauses in Background</Text>
                <Text style={styles.featureDesc}>
                  Documents and OCR continue scanning smoothly even while you use WhatsApp or lock your phone.
                </Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.featureBadge, { backgroundColor: COLORS.success + '20' }]}>
                <Ionicons name="leaf" size={18} color={COLORS.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Automatic Power Off</Text>
                <Text style={styles.featureDesc}>
                  Background service stops immediately once all files are indexed, saving your battery.
                </Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.featureBadge, { backgroundColor: COLORS.warning + '20' }]}>
                <Ionicons name="options" size={18} color={COLORS.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Select "Unrestricted" / "No restrictions"</Text>
                <Text style={styles.featureDesc}>
                  Tap below, then choose "Unrestricted", "No restrictions", or "Allow" on the system prompt.
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleEnable}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Set "Unrestricted" / Allow (1 Tap)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>Keep Standard / Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(COLORS: any, insets: any) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: (insets?.top || 0) + 16,
      paddingBottom: (insets?.bottom || 0) + 16,
    },
    modalContent: {
      width: '100%',
      maxWidth: 390,
      backgroundColor: COLORS.surface, // Solid opaque background (white in light mode, dark slate in dark mode)
      borderRadius: 24,
      padding: 22,
      borderWidth: 1,
      borderColor: COLORS.border,
      elevation: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
    },
    iconCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: COLORS.surface2,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: COLORS.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    introText: {
      fontSize: 13,
      color: COLORS.muted,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 12,
      paddingHorizontal: 6,
    },
    instructionBox: {
      backgroundColor: COLORS.accent + '12',
      borderWidth: 1.5,
      borderColor: COLORS.accent + '55',
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
    },
    instructionTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: COLORS.text,
    },
    optionRowGuide: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 4,
    },
    optionTextGuide: {
      fontSize: 12,
      color: COLORS.text,
      lineHeight: 16,
      flex: 1,
    },
    featureCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: COLORS.surface2,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    featureBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      marginTop: 1,
    },
    featureTitle: {
      fontSize: 13.5,
      fontWeight: '600',
      color: COLORS.text,
      marginBottom: 2,
    },
    featureDesc: {
      fontSize: 12,
      color: COLORS.muted,
      lineHeight: 16,
    },
    buttonContainer: {
      marginTop: 14,
      gap: 6,
    },
    primaryButton: {
      backgroundColor: COLORS.accent,
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 3,
      shadowColor: COLORS.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryButton: {
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: COLORS.muted,
      fontSize: 13,
      fontWeight: '500',
    },
  });
}
