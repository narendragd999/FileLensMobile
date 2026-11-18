import React from 'react';
import { ViewStyle, StyleProp, Pressable, GestureResponderEvent, View } from 'react-native';
import Animated, {
  LinearTransition,
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutDown,
  ZoomIn,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Haptics } from './haptics';
export { NativeScaleButton } from '../components/NativeScaleButton';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Standardized Spring Physics Configurations for UI-thread animations.
 */
export const MotionSpring = {
  // Snappy: Default for buttons, chips, actionable rows, cards
  snappy: { damping: 18, stiffness: 320, mass: 0.5 },
  // Bouncy: For badges, FAB, checkmarks, floating tags
  bouncy: { damping: 12, stiffness: 220, mass: 0.6 },
  // Gentle: For bottom sheets, dialogs, drawers
  gentle: { damping: 24, stiffness: 200, mass: 0.8 },
  // Subtle: Minimal overshoot for dense list interactions
  subtle: { damping: 22, stiffness: 380, mass: 0.4 },
};

/**
 * Timing durations (ms) for fade and backdrop animations.
 */
export const MotionTiming = {
  quick: 180,
  standard: 250,
  modal: 300,
};

/**
 * Common Reanimated layout transition for grids, lists, and reordering.
 */
export const cardLayoutTransition = LinearTransition.springify().damping(18).stiffness(280);

/**
 * Calculate capped stagger delay to prevent animation delays on 50+ items.
 */
export function getStaggerDelay(index: number, maxDelay = 240, step = 30): number {
  return Math.min(Math.max(0, index) * step, maxDelay);
}

/**
 * AnimatedCard: Wraps list/grid items with entrance stagger & spring press scale.
 */
interface AnimatedCardProps {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  activeScale?: number;
  enableHaptic?: boolean;
  disabled?: boolean;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  index = 0,
  style,
  onPress,
  onLongPress,
  activeScale = 0.96,
  enableHaptic = true,
  disabled = false,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled || !onPress) return;
    scale.value = withSpring(activeScale, MotionSpring.snappy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, MotionSpring.snappy);
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (disabled || !onPress) return;
    if (enableHaptic) Haptics.light();
    onPress(e);
  };

  const entranceAnim = FadeInDown.delay(getStaggerDelay(index)).springify().damping(18).stiffness(240);

  if (onPress || onLongPress) {
    return (
      <AnimatedPressable
        entering={entranceAnim}
        layout={cardLayoutTransition}
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[style, animatedStyle]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <Animated.View entering={entranceAnim} layout={cardLayoutTransition} style={style}>
      {children}
    </Animated.View>
  );
};

/**
 * AnimatedModalBackdrop: Dimmed backdrop with smooth fade in/out.
 */
export const AnimatedModalBackdrop: React.FC<{
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}> = ({ style, children }) => (
  <Animated.View
    entering={FadeIn.duration(MotionTiming.quick)}
    exiting={FadeOut.duration(MotionTiming.quick)}
    style={style}
  >
    {children}
  </Animated.View>
);

/**
 * AnimatedModalDialog: Center alert/card with spring pop in/out.
 */
export const AnimatedModalDialog: React.FC<{
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ style, children }) => (
  <Animated.View
    entering={ZoomIn.duration(200)}
    exiting={FadeOut.duration(MotionTiming.quick)}
    style={style}
  >
    {children}
  </Animated.View>
);

/**
 * AnimatedModalSheet: Bottom sheet with smooth spring glide in/out.
 */
export const AnimatedModalSheet: React.FC<{
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ style, children }) => (
  <Animated.View
    entering={SlideInDown.springify().damping(22).stiffness(260)}
    exiting={SlideOutDown.duration(MotionTiming.quick)}
    style={style}
  >
    {children}
  </Animated.View>
);
