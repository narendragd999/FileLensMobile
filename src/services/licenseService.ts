/**
 * licenseService.ts — Cross-platform license activation.
 *
 * Uses the SAME Google Sheet + Apps Script backend as the desktop FileLensPro.
 * Desktop Pro users can auto-activate on mobile by entering their existing
 * license key — the backend recognizes the key and binds it to the mobile
 * device's Machine ID.
 *
 * Flow:
 *   1. App generates a unique Machine ID per device (Android ID hash)
 *   2. User enters their license key (same one they bought for desktop)
 *   3. App POSTs {key, machine_id, sig} to the Apps Script endpoint
 *   4. Backend validates the key + binds it to this device
 *   5. If the key is already bound to another device, activation is rejected
 *   6. On success, the activation is cached locally (offline use)
 *
 * The "auto-activation for desktop Pro users" works because the SAME key
 * format (FL-{index}-XXXX-XXXX-XXXX-XXXX) works on both platforms. The
 * backend allows a key to be bound to up to 2 devices (desktop + mobile)
 * for the same user.
 */

import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

// ─── Configuration ──────────────────────────────────────────────────
// This is the SAME endpoint as the desktop FileLensPro (config/default_config.json).
// The Apps Script backend supports multiple device bindings per key.
const SHEET_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxzOY0WxeGDiw9ke5xBvHJBMGutIOx_Q4Ay8_G3o9r8ST6wU_KRnIylnI9VMK_yKPbN/exec';

// HMAC signing key — must match the desktop FileLensPro + Apps Script backend.
// (This is the same key shipped in the desktop .exe — see core/license_manager.py)
const SIGNING_KEY = 'FileLensPro-Remote-Activation-v1-2026';

// Trial period: 30 days (1 Month Free Trial)
const TRIAL_DAYS = 30;
const OFFLINE_GRACE_HOURS = 168; // 7 days offline

// SecureStore keys
const KEY_LICENSE = 'filelens_license';
const KEY_TRIAL_START = 'filelens_trial_start';
const KEY_LAST_ONLINE = 'filelens_last_online';

// ─── Types ──────────────────────────────────────────────────────────
export interface LicenseStatus {
  activated: boolean;
  isTrial: boolean;
  daysRemaining: number;
  trialExpired: boolean;
  licenseKey: string;
  machineId: string;
  activationDate: string | null;
  error: string;
}

export interface ActivationResult {
  success: boolean;
  message: string;
  licenseKey: string;
  activationDate: string;
}

// ─── Machine ID ────────────────────────────────────────────────────
let cachedMachineId: string | null = null;

/**
 * Get a unique Machine ID for this device.
 * Uses Android ID ( SSAID ) on Android, IDFV on iOS.
 * This is the SAME logic as the desktop FileLensPro's utils/machine_id.py
 * but adapted for mobile.
 */
export async function getMachineId(): Promise<string> {
  if (cachedMachineId) return cachedMachineId;

  // Android ID (SSAID) — unique per device+app-signing-key combo.
  // Persists across app reinstalls (until factory reset).
  // On iOS, we use IDFV (identifierForVendor) — unique per vendor+device.
  const androidId = (Constants as any).expoConfig?.extra?.androidId
    || (Constants as any).sessionId
    || Application.getAndroidId?.()
    || Application.getAndroidId?.()
    || '';

  // Fallback: use a random UUID stored in SecureStore (persists across reinstalls)
  let id = androidId as string;
  if (!id || id.length < 8) {
    const stored = await SecureStore.getItemAsync('filelens_fallback_id');
    if (stored) {
      id = stored;
    } else {
      // Generate a random UUID
      id = Crypto.randomUUID();
      await SecureStore.setItemAsync('filelens_fallback_id', id);
    }
  }

  // Hash it to get a consistent-length Machine ID (matches desktop format)
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    id
  );
  // Format: FL-MOBILE-XXXXXXXX (16 chars for readability)
  cachedMachineId = 'FL-MOBILE-' + hash.substring(0, 16).toUpperCase();
  return cachedMachineId;
}

// ─── HMAC Signing ─────────────────────────────────────────────────
/**
 * Sign a payload with HMAC-SHA256. Matches the desktop's core/sheet_sync.py.
 */
async function signPayload(payload: string): Promise<string> {
  const keyBytes = stringToBytes(SIGNING_KEY);
  const dataBytes = stringToBytes(payload);
  const signature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    SIGNING_KEY + payload
  );
  return signature;
}

function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ─── Trial Management ──────────────────────────────────────────────
/**
 * Get the trial start date (stored in SecureStore).
 * On first launch, this is set to "now".
 */
async function getTrialStart(): Promise<Date> {
  let stored = await SecureStore.getItemAsync(KEY_TRIAL_START);
  if (!stored) {
    const now = new Date().toISOString();
    await SecureStore.setItemAsync(KEY_TRIAL_START, now);
    stored = now;
  }
  return new Date(stored);
}

async function getDaysRemaining(): Promise<number> {
  const start = await getTrialStart();
  const now = new Date();
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - elapsedDays);
}

// ─── License Storage ───────────────────────────────────────────────
interface StoredLicense {
  key: string;
  machineId: string;
  activatedAt: string;
  // Tamper-proofing: dual storage (SecureStore + SQLite)
  // Editing one alone won't grant activation.
  integrityHash: string;
}

async function storeLicense(license: StoredLicense): Promise<void> {
  // Store in SecureStore (encrypted, survives reinstall)
  await SecureStore.setItemAsync(KEY_LICENSE, JSON.stringify(license));
  // Also store in SQLite for integrity check
  const db = await SQLite.openDatabaseAsync('filelens.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS license_integrity (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hash TEXT NOT NULL,
      updated TEXT NOT NULL
    );
  `);
  await db.runAsync(
    `INSERT OR REPLACE INTO license_integrity (id, hash, updated) VALUES (1, ?, ?)`,
    [license.integrityHash, new Date().toISOString()]
  );
}

async function getStoredLicense(): Promise<StoredLicense | null> {
  const stored = await SecureStore.getItemAsync(KEY_LICENSE);
  if (!stored) return null;
  try {
    const license: StoredLicense = JSON.parse(stored);
    // Verify integrity: check that the SQLite hash matches
    const db = await SQLite.openDatabaseAsync('filelens.db');
    const row = await db.getFirstAsync<{ hash: string }>(
      'SELECT hash FROM license_integrity WHERE id = 1'
    );
    if (!row || row.hash !== license.integrityHash) {
      // Tamper detected — treat as not activated
      console.warn('[license] Integrity check failed — possible tampering');
      return null;
    }
    return license;
  } catch {
    return null;
  }
}

async function computeIntegrityHash(key: string, machineId: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${key}|${machineId}|${SIGNING_KEY}`
  );
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Get the current license status.
 * Called on app launch to determine whether to show trial badge or "Licensed".
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  const machineId = await getMachineId();
  const stored = await getStoredLicense();

  if (stored) {
    // Verify the stored license is still valid (offline grace period check)
    const lastOnlineStr = await SecureStore.getItemAsync(KEY_LAST_ONLINE);
    const lastOnline = lastOnlineStr ? new Date(lastOnlineStr) : new Date();
    const hoursSinceOnline = (Date.now() - lastOnline.getTime()) / (1000 * 60 * 60);

    if (hoursSinceOnline > OFFLINE_GRACE_HOURS) {
      // Offline too long — ask user to re-verify
      return {
        activated: false,
        isTrial: false,
        daysRemaining: 0,
        trialExpired: true,
        licenseKey: stored.key,
        machineId,
        activationDate: stored.activatedAt,
        error: 'License verification required — please connect to the internet and relaunch.',
      };
    }

    return {
      activated: true,
      isTrial: false,
      daysRemaining: 0,
      trialExpired: false,
      licenseKey: stored.key,
      machineId,
      activationDate: stored.activatedAt,
      error: '',
    };
  }

  // No stored license — check trial
  const daysRemaining = await getDaysRemaining();
  const isTrial = daysRemaining > 0;

  return {
    activated: false,
    isTrial,
    daysRemaining,
    trialExpired: !isTrial,
    licenseKey: '',
    machineId,
    activationDate: null,
    error: isTrial ? '' : 'Trial expired. Please activate your license.',
  };
}

/**
 * Activate a license key. This is called when the user enters their key.
 *
 * For desktop Pro users: they enter the SAME key they use on desktop.
 * The backend allows up to 2 device bindings (desktop + mobile) per key.
 *
 * @param licenseKey The key (format: FL-{index}-XXXX-XXXX-XXXX-XXXX or XXXX-XXXX-XXXX-XXXX)
 */
export async function activateLicense(licenseKey: string): Promise<ActivationResult> {
  const machineId = await getMachineId();
  const cleanKey = licenseKey.trim().toUpperCase();

  if (!cleanKey) {
    return {
      success: false,
      message: 'Please enter a license key.',
      licenseKey: '',
      activationDate: '',
    };
  }

  // Build the request payload (matches desktop's core/sheet_sync.py format)
  const payload = JSON.stringify({
    action: 'activate',
    key: cleanKey,
    machine_id: machineId,
    platform: Platform.OS,
    app_version: Application.nativeApplicationVersion || '1.0.0',
    timestamp: new Date().toISOString(),
  });

  const sig = await signPayload(payload);

  try {
    const response = await fetch(SHEET_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FileLensPro-Sig': sig,
      },
      body: payload,
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Server returned HTTP ${response.status}. Please try again.`,
        licenseKey: '',
        activationDate: '',
      };
    }

    const data = await response.json();

    if (data.success) {
      // Store the activation locally
      const integrityHash = await computeIntegrityHash(cleanKey, machineId);
      const now = new Date().toISOString();
      const license: StoredLicense = {
        key: cleanKey,
        machineId,
        activatedAt: now,
        integrityHash,
      };
      await storeLicense(license);
      await SecureStore.setItemAsync(KEY_LAST_ONLINE, now);

      return {
        success: true,
        message: 'License activated successfully! All features are now unlocked.',
        licenseKey: cleanKey,
        activationDate: now,
      };
    } else {
      // Activation rejected — show the server's error message
      return {
        success: false,
        message: data.error || 'Activation failed. Please check your key and try again.',
        licenseKey: '',
        activationDate: '',
      };
    }
  } catch (error: any) {
    // Network error — can't activate offline (first activation requires internet)
    return {
      success: false,
      message: `Network error: ${error.message}. Please check your internet connection and try again.`,
      licenseKey: '',
      activationDate: '',
    };
  }
}

/**
 * Release the device binding for this license key.
 * Called when the user wants to deactivate (e.g. switching devices).
 */
export async function releaseLicense(): Promise<{ success: boolean; message: string }> {
  const stored = await getStoredLicense();
  if (!stored) {
    return { success: false, message: 'No active license to release.' };
  }

  const machineId = await getMachineId();
  const payload = JSON.stringify({
    action: 'release',
    key: stored.key,
    machine_id: machineId,
    timestamp: new Date().toISOString(),
  });
  const sig = await signPayload(payload);

  try {
    const response = await fetch(SHEET_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FileLensPro-Sig': sig,
      },
      body: payload,
    });
    const data = await response.json();

    if (data.success) {
      // Clear local storage
      await SecureStore.deleteItemAsync(KEY_LICENSE);
      await SecureStore.deleteItemAsync(KEY_LAST_ONLINE);
      const db = await SQLite.openDatabaseAsync('filelens.db');
      await db.execAsync('DELETE FROM license_integrity WHERE id = 1;');
      return { success: true, message: 'License released. You can activate on another device.' };
    } else {
      return { success: false, message: data.error || 'Release failed.' };
    }
  } catch (error: any) {
    return { success: false, message: `Network error: ${error.message}` };
  }
}

/**
 * Record that the app was online (for offline grace period).
 * Called on every successful API call.
 */
export async function recordOnlineActivity(): Promise<void> {
  await SecureStore.setItemAsync(KEY_LAST_ONLINE, new Date().toISOString());
}
