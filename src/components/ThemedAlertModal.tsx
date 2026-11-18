import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, ZoomIn, FadeOutDown, BounceIn } from 'react-native-reanimated';
import { useThemeColors } from '../utils/theme';
import { MotionTiming } from '../utils/motion';
import { NativeScaleButton } from './NativeScaleButton';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface ThemedAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  buttons?: AlertButton[];
  onClose?: () => void;
}

export function ThemedAlertModal({
  visible,
  title,
  message,
  icon,
  iconColor,
  buttons = [{ text: 'OK', style: 'default' }],
  onClose,
}: ThemedAlertProps) {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  // Determine icon
  let effectiveIcon: keyof typeof Ionicons.glyphMap = icon || 'information-circle';
  let effectiveIconColor: string = iconColor || COLORS.accent;

  if (!icon) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('error') || lowerTitle.includes('failed') || lowerTitle.includes('denied')) {
      effectiveIcon = 'alert-circle';
      effectiveIconColor = COLORS.danger;
    } else if (lowerTitle.includes('complete') || lowerTitle.includes('success') || lowerTitle.includes('saved')) {
      effectiveIcon = 'checkmark-circle';
      effectiveIconColor = COLORS.success;
    } else if (lowerTitle.includes('scan') || lowerTitle.includes('device') || lowerTitle.includes('permission')) {
      effectiveIcon = 'shield-checkmark';
      effectiveIconColor = COLORS.accent;
    }
  }

  const isMultiButton = buttons.length > 2;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(MotionTiming.quick)}
        exiting={FadeOut.duration(MotionTiming.quick)}
        style={[styles.overlay, { paddingTop: (insets?.top || 0) + 24, paddingBottom: (insets?.bottom || 0) + 24 }]}
      >
        <Animated.View
          entering={ZoomIn.duration(200)}
          exiting={FadeOut.duration(MotionTiming.quick)}
          style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        >
          {/* Glowing Icon Header */}
          <Animated.View
            entering={ZoomIn.duration(220)}
            style={[styles.iconWrap, { backgroundColor: effectiveIconColor + '18' }]}
          >
            <Ionicons name={effectiveIcon} size={38} color={effectiveIconColor} />
          </Animated.View>

          {/* Title */}
          <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>

          {/* Message Body */}
          {!!message && (
            <ScrollView style={styles.messageScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.message, { color: COLORS.muted }]}>{message}</Text>
            </ScrollView>
          )}

          {/* Action Buttons */}
          <View style={isMultiButton ? styles.btnStack : styles.btnRow}>
            {buttons.map((btn, index) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              const isPrimary = !isCancel && !isDestructive;

              let btnBg = COLORS.accent;
              let textColor = '#ffffff';
              let borderColor = 'transparent';

              if (isCancel) {
                btnBg = COLORS.surface2;
                textColor = COLORS.text;
                borderColor = COLORS.border;
              } else if (isDestructive) {
                btnBg = COLORS.danger;
                textColor = '#ffffff';
              }

              return (
                <NativeScaleButton
                  key={`${btn.text}_${index}`}
                  style={[
                    styles.button,
                    isMultiButton ? styles.buttonFull : styles.buttonHalf,
                    { backgroundColor: btnBg, borderColor, borderWidth: isCancel ? 1 : 0 },
                  ]}
                  activeScale={0.96}
                  hapticType="light"
                  onPress={() => {
                    if (onClose) {
                      onClose();
                    }
                    if (btn.onPress) {
                      btn.onPress();
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: textColor, fontWeight: isPrimary ? '700' : '600' },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </NativeScaleButton>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  messageScroll: {
    maxHeight: 220,
    width: '100%',
    marginBottom: 20,
  },
  message: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btnStack: {
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonHalf: {
    flex: 1,
  },
  buttonFull: {
    width: '100%',
  },
  buttonText: {
    fontSize: 15,
    textAlign: 'center',
  },
});