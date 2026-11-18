import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';
import { openGooglePlayStore, dismissReviewPrompt } from '../services/reviewPromptService';

interface ReviewPromptModalProps {
  visible: boolean;
  onClose: () => void;
  milestoneTitle?: string;
  milestoneDescription?: string;
}

export function ReviewPromptModal({
  visible,
  onClose,
  milestoneTitle = 'Enjoying FileLens Pro?',
  milestoneDescription = "You've organized your files and freed up storage with 100% offline privacy. If you find FileLens Pro helpful, a quick rating on Google Play helps us tremendously!",
}: ReviewPromptModalProps) {
  const COLORS = useThemeColors();

  if (!visible) return null;

  const handleRate = async () => {
    onClose();
    await dismissReviewPrompt(true);
    await openGooglePlayStore();
  };

  const handleMaybeLater = () => {
    onClose();
  };

  const handleDontAskAgain = async () => {
    onClose();
    await dismissReviewPrompt(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={handleMaybeLater}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          onPress={e => e.stopPropagation()}
        >
          {/* Top Star Badge */}
          <View style={styles.starCircle}>
            <Ionicons name="star" size={32} color="#F59E0B" />
          </View>

          <Text style={[styles.title, { color: COLORS.text }]}>{milestoneTitle}</Text>
          <Text style={[styles.description, { color: COLORS.muted }]}>
            {milestoneDescription}
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {/* Primary Rate Button */}
            <TouchableOpacity
              style={[styles.button, styles.rateButton]}
              onPress={handleRate}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-google-playstore" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.rateButtonText}>Rate on Google Play</Text>
            </TouchableOpacity>

            {/* Maybe Later */}
            <TouchableOpacity
              style={[styles.button, styles.laterButton, { borderColor: COLORS.border }]}
              onPress={handleMaybeLater}
              activeOpacity={0.7}
            >
              <Text style={[styles.laterButtonText, { color: COLORS.text }]}>Maybe Later</Text>
            </TouchableOpacity>

            {/* Don't Ask Again */}
            <TouchableOpacity
              style={styles.neverButton}
              onPress={handleDontAskAgain}
              activeOpacity={0.7}
            >
              <Text style={styles.neverButtonText}>Don't Ask Again</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  starCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateButton: {
    backgroundColor: '#0284C7',
  },
  rateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  laterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  laterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  neverButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  neverButtonText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
});
