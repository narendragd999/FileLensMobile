/**
 * notificationPermissionService.ts — Android 13+ (API 33+) POST_NOTIFICATIONS runtime management
 */

import { Platform, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Checks whether notification permission is granted.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return granted;
      } catch (_) {
        // Fall back to Expo Notifications API
      }
    }
  }

  try {
    const settings = await Notifications.getPermissionsAsync();
    return (
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    );
  } catch (_) {
    return true;
  }
}

/**
 * Prompts user for notification permission if not yet granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const status = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: 'FileLens Pro Notifications',
          message:
            'FileLens Pro requires notification permission to alert you when alarms fire and background indexing completes.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not Now',
        }
      );
      if (status === PermissionsAndroid.RESULTS.GRANTED) {
        return true;
      }
    } catch (e) {
      console.warn('[notificationPermissionService] Native request failed:', e);
    }
  }

  try {
    const response = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    return (
      response.granted ||
      response.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      response.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    );
  } catch (e) {
    console.warn('[notificationPermissionService] Expo request failed:', e);
    return false;
  }
}
