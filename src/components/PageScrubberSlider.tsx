import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Haptics } from '../utils/haptics';
import { NativeScaleButton } from './NativeScaleButton';

interface PageScrubberSliderProps {
  currentPage: number; // 0-indexed
  totalPages: number;
  onPageChange: (pageIndex: number, isFinal?: boolean) => void;
  accentColor?: string;
  isDark?: boolean;
}

export const PageScrubberSlider: React.FC<PageScrubberSliderProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  accentColor = '#2563EB',
  isDark = true,
}) => {
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const trackWidthRef = useRef<number>(0);
  const trackPageXRef = useRef<number>(0);
  const trackViewRef = useRef<View>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragPageIndex, setDragPageIndex] = useState<number>(currentPage);
  const dragPageIndexRef = useRef<number>(currentPage);
  const lastHapticPageRef = useRef<number>(currentPage);

  useEffect(() => {
    if (!isDragging) {
      setDragPageIndex(currentPage);
      dragPageIndexRef.current = currentPage;
      lastHapticPageRef.current = currentPage;
    }
  }, [currentPage, isDragging]);

  const measureTrackPosition = () => {
    trackViewRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (pageX !== undefined && width > 0) {
        trackPageXRef.current = pageX;
        trackWidthRef.current = width;
        setTrackWidth(width);
      }
    });
  };

  const calculatePageFromX = (relX: number, totalW: number) => {
    if (totalW <= 0 || totalPages <= 1) return 0;
    const clampedX = Math.max(0, Math.min(totalW, relX));
    const ratio = clampedX / totalW;
    const page = Math.round(ratio * (totalPages - 1));
    return Math.max(0, Math.min(totalPages - 1, page));
  };

  const handlePageSelect = (page: number, isFinal: boolean = false) => {
    if (page !== lastHapticPageRef.current) {
      Haptics.selection();
      lastHapticPageRef.current = page;
    }
    setDragPageIndex(page);
    dragPageIndexRef.current = page;
    onPageChange(page, isFinal);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsDragging(true);
        measureTrackPosition();
        const touchX = evt.nativeEvent.pageX;
        const relX = trackPageXRef.current > 0 ? touchX - trackPageXRef.current : evt.nativeEvent.locationX;
        const page = calculatePageFromX(relX, trackWidthRef.current || trackWidth);
        handlePageSelect(page, false);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touchX = evt.nativeEvent.pageX;
        const relX = trackPageXRef.current > 0 ? touchX - trackPageXRef.current : evt.nativeEvent.locationX;
        const page = calculatePageFromX(relX, trackWidthRef.current || trackWidth);
        handlePageSelect(page, false);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        handlePageSelect(dragPageIndexRef.current, true);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        handlePageSelect(dragPageIndexRef.current, true);
      },
    })
  ).current;

  if (totalPages <= 1) return null;

  const displayPage = isDragging ? dragPageIndex : currentPage;
  const progressRatio = totalPages > 1 ? displayPage / (totalPages - 1) : 0;
  const thumbLeft = Math.max(0, Math.min(trackWidth - 18, progressRatio * (trackWidth - 18)));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.94)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
        },
      ]}
    >
      {/* Prev Button */}
      <NativeScaleButton
        onPress={() => {
          if (currentPage > 0) {
            onPageChange(currentPage - 1, true);
          }
        }}
        disabled={currentPage === 0}
        activeScale={0.88}
        hapticType="light"
        style={[styles.stepBtn, currentPage === 0 && { opacity: 0.3 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Previous Page"
      >
        <Ionicons name="chevron-back" size={18} color={isDark ? '#FFFFFF' : '#1E293B'} />
      </NativeScaleButton>

      {/* Center Scrubber Track */}
      <View
        ref={trackViewRef}
        style={styles.trackContainer}
        onLayout={(e: LayoutChangeEvent) => {
          setTrackWidth(e.nativeEvent.layout.width);
          trackWidthRef.current = e.nativeEvent.layout.width;
          measureTrackPosition();
        }}
        {...panResponder.panHandlers}
      >
        {/* Inactive Track */}
        <View
          style={[
            styles.trackBg,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)' },
          ]}
        />

        {/* Active Fill Track */}
        <View
          style={[
            styles.trackFill,
            {
              backgroundColor: accentColor,
              width: `${Math.round(progressRatio * 100)}%`,
            },
          ]}
        />

        {/* Draggable Thumb */}
        <View
          style={[
            styles.thumb,
            {
              left: thumbLeft,
              backgroundColor: '#FFFFFF',
              borderColor: accentColor,
            },
            isDragging && styles.thumbDragging,
          ]}
        />
      </View>

      {/* Next Button */}
      <NativeScaleButton
        onPress={() => {
          if (currentPage < totalPages - 1) {
            onPageChange(currentPage + 1, true);
          }
        }}
        disabled={currentPage === totalPages - 1}
        activeScale={0.88}
        hapticType="light"
        style={[styles.stepBtn, currentPage === totalPages - 1 && { opacity: 0.3 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Next Page"
      >
        <Ionicons name="chevron-forward" size={18} color={isDark ? '#FFFFFF' : '#1E293B'} />
      </NativeScaleButton>

      {/* Floating Page Badge */}
      <View style={[styles.badge, { backgroundColor: accentColor }]}>
        <Text style={styles.badgeText}>
          {displayPage + 1} / {totalPages}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: 20,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    position: 'relative',
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackContainer: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    marginHorizontal: 8,
    position: 'relative',
  },
  trackBg: {
    height: 4,
    borderRadius: 2,
    width: '100%',
  },
  trackFill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    left: 0,
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  thumbDragging: {
    transform: [{ scale: 1.25 }],
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
