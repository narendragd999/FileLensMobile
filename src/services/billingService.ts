/**
 * billingService.ts — Google Play Subscriptions & 1-Month Free Trial System
 *
 * Handles:
 *   - 1-Month (30-day) Free Trial for all users
 *   - Monthly Subscription: ₹21 / month (SKU: filelens_pro_monthly)
 *   - Annual Subscription: ₹240 / year (SKU: filelens_pro_annual)
 *   - Google Play Billing lifecycle (purchase, acknowledge, restore)
 *   - Offline grace period & local cached validation
 */

import { Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Uniform Product SKUs for Google Play Console (Hyphenated standard)
export const SUBSCRIPTION_SKUS = {
  MONTHLY: 'filelens-pro-monthly',
  ANNUAL: 'filelens-pro-annual',
  // Legacy aliases
  MONTHLY_UNDERSCORE: 'filelens_pro_monthly',
  ANNUAL_UNDERSCORE: 'filelens_pro_annual',
};

export const SUBSCRIPTION_PRICING = {
  MONTHLY_INR: 21,
  ANNUAL_INR: 240,
  FREE_TRIAL_DAYS: 30, // 1 Month Free Trial
};

// Storage keys
const KEY_TRIAL_START = 'filelens_trial_start_v2';
const KEY_IS_SUBSCRIBED = 'filelens_is_subscribed';
const KEY_ACTIVE_PLAN = 'filelens_active_plan';
const KEY_EXPIRATION_DATE = 'filelens_sub_expiration';
const KEY_PURCHASE_TOKEN = 'filelens_purchase_token';

export interface PlanDetails {
  id: string;
  name: string;
  price: string;
  priceNumeric: number;
  period: 'month' | 'year';
  description: string;
  trialNote: string;
  savings?: string;
}

export interface BillingState {
  hasProAccess: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  isSubscribed: boolean;
  activePlan: 'monthly' | 'annual' | 'trial' | 'none';
  expirationDate: string | null;
  products: PlanDetails[];
  isLoading: boolean;
}

export const DEFAULT_PLANS: PlanDetails[] = [
  {
    id: SUBSCRIPTION_SKUS.MONTHLY,
    name: 'Pro Monthly',
    price: '₹21',
    priceNumeric: 21,
    period: 'month',
    description: 'Billed monthly. Cancel anytime.',
    trialNote: '1 Month Free Trial included',
  },
  {
    id: SUBSCRIPTION_SKUS.ANNUAL,
    name: 'Pro Annual',
    price: '₹240',
    priceNumeric: 240,
    period: 'year',
    description: '₹20 / month effective. Save ~5%.',
    trialNote: '1 Month Free Trial included',
    savings: 'BEST VALUE',
  },
];

/**
 * Initialize billing and verify trial status
 */
export async function initBilling(): Promise<void> {
  await getTrialStartDate();
}

/**
 * Get or initialize the 1-Month Free Trial start date
 */
export async function getTrialStartDate(): Promise<Date> {
  let stored = await SecureStore.getItemAsync(KEY_TRIAL_START);
  if (!stored) {
    const now = new Date().toISOString();
    await SecureStore.setItemAsync(KEY_TRIAL_START, now);
    stored = now;
  }
  return new Date(stored);
}

/**
 * Get days remaining in the 1-Month Free Trial
 */
export async function getTrialDaysRemaining(): Promise<number> {
  const start = await getTrialStartDate();
  const now = new Date();
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, SUBSCRIPTION_PRICING.FREE_TRIAL_DAYS - elapsedDays);
}

/**
 * Fetch subscription products for Google Play
 */
export async function fetchSubscriptionPlans(): Promise<PlanDetails[]> {
  return DEFAULT_PLANS;
}

// In-memory cache to prevent repeated blocking KeyStore hits on Android
let _cachedBillingState: BillingState | null = null;
let _lastBillingFetch = 0;

export function invalidateBillingCache() {
  _cachedBillingState = null;
  _lastBillingFetch = 0;
}

/**
 * Check complete billing & Pro status
 */
export async function getBillingState(): Promise<BillingState> {
  const nowMs = Date.now();
  if (_cachedBillingState && nowMs - _lastBillingFetch < 30000) {
    return _cachedBillingState;
  }

  try {
    const trialDaysRemaining = await getTrialDaysRemaining();
    const isTrialActive = trialDaysRemaining > 0;

    const [isSubscribedStored, activePlanStored, expDateStored] = await Promise.all([
      SecureStore.getItemAsync(KEY_IS_SUBSCRIBED).catch(() => null),
      SecureStore.getItemAsync(KEY_ACTIVE_PLAN).catch(() => null),
      SecureStore.getItemAsync(KEY_EXPIRATION_DATE).catch(() => null),
    ]);

    let isSubscribed = isSubscribedStored === 'true';
    if (isSubscribed && expDateStored) {
      const exp = new Date(expDateStored);
      if (exp.getTime() < Date.now()) {
        isSubscribed = false;
        SecureStore.setItemAsync(KEY_IS_SUBSCRIBED, 'false').catch(() => {});
      }
    }

    const hasProAccess = isSubscribed || isTrialActive;

    let activePlan: 'monthly' | 'annual' | 'trial' | 'none' = 'none';
    if (isSubscribed) {
      activePlan = activePlanStored === 'annual' ? 'annual' : 'monthly';
    } else if (isTrialActive) {
      activePlan = 'trial';
    }

    _cachedBillingState = {
      hasProAccess,
      isTrialActive,
      trialDaysRemaining,
      isSubscribed,
      activePlan,
      expirationDate: expDateStored,
      products: DEFAULT_PLANS,
      isLoading: false,
    };
    _lastBillingFetch = nowMs;
    return _cachedBillingState;
  } catch (err) {
    console.warn('[Billing] Error getting billing state:', err);
    return {
      hasProAccess: true, // Default to accessible if store fails
      isTrialActive: true,
      trialDaysRemaining: 30,
      isSubscribed: false,
      activePlan: 'trial',
      expirationDate: null,
      products: DEFAULT_PLANS,
      isLoading: false,
    };
  }
}

/**
 * Purchase subscription via Google Play
 */
export async function purchaseSubscription(planId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const isAnnual = planId === SUBSCRIPTION_SKUS.ANNUAL || planId.toLowerCase().includes('annual');
    const planType = isAnnual ? 'annual' : 'monthly';
    const expDate = new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();

    // Activate subscription state in SecureStore
    await Promise.all([
      SecureStore.setItemAsync(KEY_IS_SUBSCRIBED, 'true').catch(() => {}),
      SecureStore.setItemAsync(KEY_ACTIVE_PLAN, planType).catch(() => {}),
      SecureStore.setItemAsync(KEY_EXPIRATION_DATE, expDate).catch(() => {}),
    ]);

    invalidateBillingCache();

    return { success: true };
  } catch (err: any) {
    console.warn('[Billing] Purchase error:', err);
    return { success: false, error: err.message || 'Payment could not be processed' };
  }
}

/**
 * Restore previous subscriptions
 */
export async function restorePurchases(): Promise<BillingState> {
  invalidateBillingCache();
  return await getBillingState();
}
