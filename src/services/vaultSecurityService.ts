/**
 * vaultSecurityService.ts — Smart Card Wallet Security Service (PIN Protection Removed).
 *
 * All PIN protection has been completely removed per user request:
 * - Smart Cards and documents are always accessible without any lock screen or PIN prompts.
 * - Legacy PIN configurations are automatically wiped from secure storage.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_KEY_PIN_HASH = 'flp_smart_cards_pin_hash';
const SECURE_KEY_ENABLED = 'flp_smart_cards_pin_enabled';

// Clean any legacy PIN keys asynchronously
(async () => {
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY_PIN_HASH).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEY_ENABLED).catch(() => {});
    await AsyncStorage.removeItem(SECURE_KEY_PIN_HASH).catch(() => {});
    await AsyncStorage.removeItem(SECURE_KEY_ENABLED).catch(() => {});
  } catch (_) {}
})();

/**
 * Checks if the user has set up a PIN for the Smart Card Vault (always false).
 */
export async function isVaultPinConfigured(): Promise<boolean> {
  return false;
}

/**
 * Returns true as cards are always accessible without PIN.
 */
export function isVaultUnlocked(): boolean {
  return true;
}

/**
 * No-op. Session is always unlocked.
 */
export function unlockVaultSession(): void {
  // Always unlocked
}

/**
 * No-op. Vault is never locked.
 */
export function lockVault(): void {
  // Always unlocked
}

/**
 * Always returns true.
 */
export async function unlockVaultWithPin(_pin: string): Promise<boolean> {
  return true;
}

/**
 * No-op.
 */
export async function setupVaultPin(_newPin: string): Promise<boolean> {
  return true;
}

/**
 * No-op.
 */
export async function changeVaultPin(_oldPin: string, _newPin: string): Promise<boolean> {
  return true;
}

/**
 * No-op.
 */
export async function removeVaultPin(_currentPin?: string): Promise<boolean> {
  return true;
}
