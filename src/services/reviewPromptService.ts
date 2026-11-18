/**
 * reviewPromptService.ts — Milestone-based Google Play Store In-App Review Manager
 *
 * Prompts user gently after positive milestones (e.g. cleaning >100MB junk cache
 * or organizing their 10th document).
 * Strictly honors user choice and never nags if dismissed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

const STORAGE_KEY_REVIEWED = '@flp_has_reviewed_or_dismissed';
const STORAGE_KEY_CLEANED_BYTES = '@flp_cleaned_cache_bytes';
const STORAGE_KEY_ORGANIZED_COUNT = '@flp_organized_docs_count';

const JUNK_CLEANED_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB
const ORGANIZED_DOCS_THRESHOLD = 10;

/**
 * Check if the user has already rated or dismissed the prompt permanently.
 */
export async function isReviewSuppressed(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY_REVIEWED);
    return val === 'true';
  } catch (_) {
    return false;
  }
}

/**
 * Records bytes cleaned in Space Cleaner. Returns true if milestone reached!
 */
export async function recordCleanedBytes(bytes: number): Promise<boolean> {
  if (bytes <= 0) return false;
  if (await isReviewSuppressed()) return false;

  try {
    const currentStr = await AsyncStorage.getItem(STORAGE_KEY_CLEANED_BYTES);
    const current = parseInt(currentStr || '0', 10);
    const updated = current + bytes;
    await AsyncStorage.setItem(STORAGE_KEY_CLEANED_BYTES, updated.toString());

    if (updated >= JUNK_CLEANED_THRESHOLD_BYTES) {
      return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Records an organized or scanned document. Returns true if milestone reached!
 */
export async function recordOrganizedDoc(): Promise<boolean> {
  if (await isReviewSuppressed()) return false;

  try {
    const currentStr = await AsyncStorage.getItem(STORAGE_KEY_ORGANIZED_COUNT);
    const current = parseInt(currentStr || '0', 10);
    const updated = current + 1;
    await AsyncStorage.setItem(STORAGE_KEY_ORGANIZED_COUNT, updated.toString());

    if (updated >= ORGANIZED_DOCS_THRESHOLD) {
      return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Launch Google Play Store for rating
 */
export async function openGooglePlayStore(): Promise<void> {
  const packageName = 'com.filelenspro.app';
  const marketUrl = `market://details?id=${packageName}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${packageName}`;

  try {
    const supported = await Linking.canOpenURL(marketUrl);
    if (supported) {
      await Linking.openURL(marketUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch (_) {
    try {
      await Linking.openURL(webUrl);
    } catch (_) {}
  }
}

/**
 * Marks review prompt as rated or permanently dismissed
 */
export async function dismissReviewPrompt(permanent = true): Promise<void> {
  if (permanent) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_REVIEWED, 'true');
    } catch (_) {}
  }
}
