/**
 * SubscriptionModal.tsx — Google Play Subscription & 1-Month Free Trial Paywall
 *
 * Offers:
 *  - 1 Month Free Trial for new users
 *  - Monthly Plan: ₹21 / month
 *  - Annual Plan: ₹240 / year (Best Value)
 *  - Instant Google Play Billing checkout & restore
 *  - 100% responsive, zero hang, native touch delivery
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';
import { ThemedAlertModal, AlertButton } from './ThemedAlertModal';
import {
  fetchSubscriptionPlans,
  purchaseSubscription,
  restorePurchases,
  getBillingState,
  BillingState,
  PlanDetails,
  SUBSCRIPTION_SKUS,
  DEFAULT_PLANS,
} from '../services/billingService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SubscriptionModal({
  visible,
  onClose,
  onSuccess,
}: Props) {
  const COLORS = useThemeColors();

  // Initialize with DEFAULT_PLANS immediately so plan cards are always present
  const [plans, setPlans] = useState<PlanDetails[]>(DEFAULT_PLANS);
  const [selectedPlan, setSelectedPlan] = useState<string>(SUBSCRIPTION_SKUS.ANNUAL);
  const [loading, setLoading] = useState(false);
  const [billingState, setBillingState] = useState<BillingState | null>(null);

  // Themed Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    icon?: any;
    iconColor?: string;
    buttons?: AlertButton[];
  }>({ visible: false, title: '' });

  const showAlert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { icon?: any; iconColor?: string }
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      buttons: buttons || [{ text: 'OK', style: 'default', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }],
      icon: options?.icon || 'information-circle',
      iconColor: options?.iconColor || COLORS.accent,
    });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    try {
      const [fetchedPlans, state] = await Promise.all([
        fetchSubscriptionPlans().catch(() => DEFAULT_PLANS),
        getBillingState().catch(() => null),
      ]);
      if (fetchedPlans && fetchedPlans.length > 0) {
        setPlans(fetchedPlans);
      }
      if (state) {
        setBillingState(state);
      }
    } catch (e) {
      console.warn('Failed to load subscription plans:', e);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await purchaseSubscription(selectedPlan);
      if (res.success) {
        if (onSuccess) onSuccess();
        onClose();
        showAlert(
          'Welcome to Pro! 🎉',
          'Your 1-Month Free Trial is active. Voice-First Second Brain, offline notes, and smart reminders are fully unlocked!',
          [{ text: 'Awesome!', style: 'default', onPress: hideAlert }],
          { icon: 'checkmark-circle', iconColor: COLORS.success }
        );
      } else {
        showAlert('Purchase Notice', res.error || 'Payment could not be completed.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
      }
    } catch (e: any) {
      showAlert('Notice', e.message || 'Payment could not be completed.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const state = await restorePurchases();
      setBillingState(state);
      if (state.isSubscribed) {
        if (onSuccess) onSuccess();
        onClose();
        showAlert('Purchases Restored', 'Your active Pro subscription has been restored!', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
      } else {
        showAlert('Restore Purchases', 'No prior Google Play subscription was found.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'information-circle', iconColor: COLORS.accent });
      }
    } catch (e) {
      showAlert('Restore Purchases', 'Unable to reach Google Play Store right now.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Top backdrop touchable to dismiss - strictly sits ABOVE container, never overlaps */}
        <TouchableOpacity
          style={styles.backdropTop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={[styles.container, { backgroundColor: COLORS.surface }]}>
          {/* Top Drag Indicator */}
          <View style={styles.dragBarContainer}>
            <View style={[styles.dragBar, { backgroundColor: COLORS.border }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: '#FF8C00' }]}>
                <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                <Text style={styles.badgeText}>FILELENSPRO PRO</Text>
              </View>
              {billingState?.isTrialActive && (
                <View style={[styles.badge, { backgroundColor: '#10B981', marginLeft: 8 }]}>
                  <Ionicons name="time-outline" size={11} color="#FFFFFF" />
                  <Text style={styles.badgeText}>
                    {billingState.trialDaysRemaining > 0
                      ? `${billingState.trialDaysRemaining} Days Free Left`
                      : 'Free Trial'}
                  </Text>
                </View>
              )}
            </View>

            {/* Direct Close Button */}
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: COLORS.surface2 }]}
              hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
              activeOpacity={0.6}
              delayPressIn={0}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            bounces={false}
          >
            {/* Value Proposition */}
            <Text style={[styles.title, { color: COLORS.text }]}>
              FileLens Pro: Second Brain & Space Cleaner
            </Text>
            <Text style={[styles.subtitle, { color: COLORS.muted }]}>
              Voice-First Second Brain, AI visual photo cleaner, exact duplicate remover, and 100% offline private search.
            </Text>

            {/* Trial Banner */}
            <View style={[styles.trialBanner, { backgroundColor: COLORS.surface2, borderColor: '#10B981', borderWidth: 1 }]}>
              <View style={styles.trialIconBox}>
                <Ionicons name="gift" size={24} color="#10B981" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[styles.trialTitle, { color: COLORS.text }]}>1 Month Free Trial Included</Text>
                <Text style={[styles.trialDesc, { color: COLORS.muted }]}>
                  Try all Pro features free for 30 days. No charge today. Cancel anytime on Google Play.
                </Text>
              </View>
            </View>

            {/* Features List */}
            <View style={styles.features}>
              <FeatureItem
                icon="pie-chart"
                title="Space Cleaner & Storage Optimizer"
                desc="AI Same Posture & burst photo clustering, duplicate cleaner & junk cache wiper"
                colors={COLORS}
              />
              <FeatureItem
                icon="mic"
                title="Voice-First Second Brain"
                desc="Offline speech-to-text in English, Hindi & Hinglish"
                colors={COLORS}
              />
              <FeatureItem
                icon="calendar-outline"
                title="Temporal Structuring"
                desc="Auto-sorts into Today's Plan, Upcoming & History"
                colors={COLORS}
              />
              <FeatureItem
                icon="notifications-outline"
                title="Smart Reminders & Alarms"
                desc="Exact device alarm scheduling for actionable tasks"
                colors={COLORS}
              />
              <FeatureItem
                icon="search"
                title="Unified Semantic Recall"
                desc="Instant 384-dimensional vector search across notes & files"
                colors={COLORS}
              />
              <FeatureItem
                icon="shield-checkmark-outline"
                title="100% On-Device Privacy"
                desc="Zero cloud tracking — your notes and photos stay strictly on your phone"
                colors={COLORS}
              />
            </View>

            {/* Plan Selector Header */}
            <View style={styles.planHeaderRow}>
              <Text style={[styles.selectPlanLabel, { color: COLORS.text }]}>Select Your Plan</Text>
              <Text style={[styles.planSubHeader, { color: COLORS.muted }]}>30 days free included</Text>
            </View>

            {/* Interactive Plan Cards */}
            <View style={styles.planContainer}>
              {plans.map((plan) => {
                const isSelected = selectedPlan === plan.id;
                const isAnnual = plan.period === 'year';
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.planCard,
                      {
                        borderColor: isSelected ? COLORS.accent : COLORS.border,
                        backgroundColor: isSelected ? (COLORS.accent + '16') : COLORS.surface2,
                        borderWidth: isSelected ? 2.5 : 1,
                      },
                    ]}
                    onPress={() => setSelectedPlan(plan.id)}
                    activeOpacity={0.7}
                    delayPressIn={0}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    {plan.savings && (
                      <View style={styles.savingsTag}>
                        <Ionicons name="flash" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
                        <Text style={styles.savingsText}>{plan.savings}</Text>
                      </View>
                    )}

                    <View style={styles.planRow}>
                      {/* Visual Radio Button */}
                      <View style={styles.radioBox}>
                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                          size={22}
                          color={isSelected ? COLORS.accent : COLORS.muted}
                        />
                      </View>

                      {/* Plan Info */}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            style={[
                              styles.planName,
                              { color: COLORS.text, fontWeight: isSelected ? '800' : '700' },
                            ]}
                          >
                            {plan.name}
                          </Text>
                          {isAnnual && (
                            <View style={styles.bestValuePill}>
                              <Text style={styles.bestValueText}>SAVE ~5%</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.planDesc, { color: COLORS.muted }]}>
                          {isAnnual
                            ? '₹20 / month effective • Billed annually'
                            : 'Flexible monthly billing • Cancel anytime'}
                        </Text>
                        <View style={styles.trialTagRow}>
                          <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                          <Text style={styles.trialTagText}>1 Month Free Trial</Text>
                        </View>
                      </View>

                      {/* Plan Price */}
                      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                        <Text
                          style={[
                            styles.planPrice,
                            { color: isSelected ? COLORS.accent : COLORS.text },
                          ]}
                        >
                          {plan.price}
                        </Text>
                        <Text style={[styles.planPeriod, { color: COLORS.muted }]}>
                          /{plan.period === 'month' ? 'mo' : 'yr'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              style={[
                styles.ctaButton,
                {
                  backgroundColor: COLORS.accent,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleSubscribe}
              disabled={loading}
              activeOpacity={0.8}
              delayPressIn={0}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.ctaText}>
                    Start 1-Month Free Trial
                  </Text>
                  <Text style={styles.ctaSubtext}>
                    {selectedPlan === SUBSCRIPTION_SKUS.ANNUAL
                      ? '30 days free, then ₹240/year (₹20/mo) • Cancel anytime'
                      : '30 days free, then ₹21/month • Cancel anytime'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Maybe Later button */}
            <TouchableOpacity
              onPress={onClose}
              style={styles.maybeLaterBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              delayPressIn={0}
            >
              <Text style={[styles.maybeLaterText, { color: COLORS.muted }]}>
                Maybe Later
              </Text>
            </TouchableOpacity>

            {/* Secondary action: Restore Purchases */}
            <View style={[styles.footerRow, { borderTopColor: COLORS.border }]}>
              <TouchableOpacity
                onPress={handleRestore}
                style={styles.textBtn}
                activeOpacity={0.7}
                delayPressIn={0}
              >
                <Ionicons name="refresh-outline" size={15} color={COLORS.muted} style={{ marginRight: 6 }} />
                <Text style={[styles.textBtnLabel, { color: COLORS.muted }]}>Restore Purchases</Text>
              </TouchableOpacity>
            </View>

            {/* Legal Notice */}
            <Text style={[styles.legalText, { color: COLORS.muted }]}>
              Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current trial or billing period via Google Play Store subscriptions settings.
            </Text>
          </ScrollView>
        </View>
      </View>

      {/* Themed Alert Modal */}
      <ThemedAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        icon={alertConfig.icon}
        iconColor={alertConfig.iconColor}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </Modal>
  );
}

function FeatureItem({
  icon,
  title,
  desc,
  colors,
}: {
  icon: any;
  title: string;
  desc: string;
  colors: any;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureIconBox, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.featureDesc, { color: colors.muted }]}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdropTop: {
    flex: 1,
  },
  container: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 16,
    elevation: 20,
    zIndex: 10,
  },
  dragBarContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginTop: 14,
  },
  trialIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B98118',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trialTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  trialDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  features: {
    marginTop: 16,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  featureDesc: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 15,
  },
  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 22,
    marginBottom: 10,
  },
  selectPlanLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  planSubHeader: {
    fontSize: 12,
    fontWeight: '500',
  },
  planContainer: {
    gap: 12,
  },
  planCard: {
    borderRadius: 16,
    padding: 14,
    position: 'relative',
  },
  savingsTag: {
    position: 'absolute',
    top: -9,
    right: 14,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  savingsText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioBox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  planName: {
    fontSize: 15,
  },
  bestValuePill: {
    backgroundColor: '#10B98120',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bestValueText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '800',
  },
  planDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  trialTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trialTagText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '800',
  },
  planPeriod: {
    fontSize: 11,
  },
  ctaButton: {
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ctaSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  maybeLaterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  maybeLaterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  textBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  textBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  legalText: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 14,
    opacity: 0.8,
  },
});
