import React from 'react';
import { Pressable, StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Haptics } from '../utils/haptics';

interface NativeScaleButtonProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  activeScale?: number;
  scaleTo?: number;
  scaleValue?: number;
  enableHaptic?: boolean;
  hapticType?: 'light' | 'medium' | 'selection' | 'none';
  disabled?: boolean;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number } | number;
  accessibilityLabel?: string;
}

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 320,
  mass: 0.5,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const NativeScaleButton: React.FC<NativeScaleButtonProps> = ({
  children,
  onPress,
  onLongPress,
  style,
  activeScale = 0.95,
  scaleTo,
  scaleValue,
  enableHaptic = true,
  hapticType = 'light',
  disabled = false,
  hitSlop,
  accessibilityLabel,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const effectiveScale = scaleTo ?? scaleValue ?? activeScale;

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(effectiveScale, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (disabled) return;
    if (enableHaptic && hapticType !== 'none') {
      if (hapticType === 'light') Haptics.light();
      else if (hapticType === 'medium') Haptics.medium();
      else if (hapticType === 'selection') Haptics.selection();
    }
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};
