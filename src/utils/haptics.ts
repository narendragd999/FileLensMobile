import { Platform, Vibration } from 'react-native';

/**
 * Lightweight, zero-overhead haptic feedback helper.
 * Provides subtle tactile confirmation on button presses, selections, and operations.
 */
class HapticsService {
  /**
   * Subtle tick for standard button presses, card taps, and tab switches (~8-10ms).
   */
  public light(): void {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(10);
      } catch (_) {}
    }
  }

  /**
   * Slightly firmer pulse for toggle switches, page selections, and action confirmations.
   */
  public medium(): void {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(20);
      } catch (_) {}
    }
  }

  /**
   * Distinct double-pulse for successful operations (e.g., save, export, batch complete).
   */
  public success(): void {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate([0, 15, 60, 20]);
      } catch (_) {}
    }
  }

  /**
   * Subtle click for page drag, reorder, or list item selection.
   */
  public selection(): void {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(8);
      } catch (_) {}
    }
  }

  /**
   * Alert pulse for errors or invalid PIN input.
   */
  public error(): void {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate([0, 40, 60, 40]);
      } catch (_) {}
    }
  }
}

export const Haptics = new HapticsService();
