/**
 * Settings Screen — App configuration.
 *
 * Shows:
 *   - OCR version + status
 *   - Installed language packs
 *   - Default OCR language picker
 *   - Theme toggle
 *   - Index stats (total files, OCR done)
 *   - Clear index button
 *   - About / version
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Share,
  TextInput,
  Linking,
  Platform,
  AppState,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { getOcrVersion, getInstalledOcrLanguages } from '../services/ocrService';
import { getIndexStats, clearIndex } from '../services/database';
import { cancelIndexing, isBatteryOptimizationIgnored } from '../services/indexerService';
import { getAiConfig, saveAiConfig, DEFAULT_AI_URL, DEFAULT_AI_MODEL, AI_PRESETS } from '../services/aiService';
import { LANGUAGE_PRESETS } from '../utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TutorialModal } from '../components/TutorialModal';
import { HeaderMenuButton } from '../components/QuickNavModal';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { StorageDisclosureModal } from '../components/StorageDisclosureModal';
import { BatteryOptimizationModal } from '../components/BatteryOptimizationModal';
import { PrivacyPolicyModal } from '../components/PrivacyPolicyModal';
import SubscriptionModal from '../components/SubscriptionModal';
import { getBillingState, BillingState } from '../services/billingService';
import { exportOfflineBackup, restoreOfflineBackup } from '../services/offlineBackupService';
import { shareAppWithFriends } from '../utils/shareUtils';

import { useThemeColors, SIZES, FONTS } from '../utils/theme';

export default function SettingsScreen() {
  const COLORS = useThemeColors();
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const [showTutorialModal, setShowTutorialModal] = useState(false);

  type SettingsTab = 'general' | 'ocr' | 'pro' | 'about';
  const SETTINGS_TABS: { key: SettingsTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'general', label: 'General', icon: 'options-outline' },
    { key: 'ocr', label: 'OCR & Index', icon: 'scan-outline' },
    { key: 'pro', label: 'AI & Pro', icon: 'sparkles-outline' },
    { key: 'about', label: 'About & Help', icon: 'information-circle-outline' },
  ];
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const {
    theme, toggleTheme,
    ocrLanguage, setOcrLanguage,
    totalFiles, ocrDone, ocrPending, setStats,
    tessReady, tessVersion, setTessVersion,
  } = useStore();

  const [installedLangs, setInstalledLangs] = useState<string[]>([]);
  
  // AI Config State
  const [aiUrl, setAiUrl] = useState(DEFAULT_AI_URL);
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);

  // Subscription State
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Storage Disclosure State
  const [showStorageDisclosure, setShowStorageDisclosure] = useState(false);

  // Privacy Policy Modal State
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Clear Index Processing State
  const [isClearingIndex, setIsClearingIndex] = useState(false);
  const [clearProgress, setClearProgress] = useState(0);
  const [clearStatus, setClearStatus] = useState('');

  // Themed Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    icon?: any;
    iconColor?: string;
    buttons?: AlertButton[];
  }>({
    visible: false,
    title: '',
  });

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
      buttons: buttons || [
        {
          text: 'OK',
          style: 'default',
          onPress: () => setAlertConfig(c => ({ ...c, visible: false })),
        },
      ],
      icon: options?.icon,
      iconColor: options?.iconColor,
    });
  };

  const hideAlert = () => {
    setAlertConfig(c => ({ ...c, visible: false }));
  };

  // Battery Optimization State
  const [isBatteryUnrestricted, setIsBatteryUnrestricted] = useState<boolean>(true);
  const [showBatteryModal, setShowBatteryModal] = useState<boolean>(false);

  const checkBatteryStatus = async () => {
    if (Platform.OS === 'android') {
      try {
        const ignored = await isBatteryOptimizationIgnored();
        setIsBatteryUnrestricted(ignored);
      } catch (e) {}
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const version = await getOcrVersion();
        setTessVersion(version);
        const langs = await getInstalledOcrLanguages();
        setInstalledLangs(langs);
        const stats = await getIndexStats();
        setStats(stats);
        
        const aiConf = await getAiConfig();
        setAiUrl(aiConf.url);
        setAiKey(aiConf.key);
        setAiModel(aiConf.model);

        const bState = await getBillingState();
        setBillingState(bState);

        await checkBatteryStatus();
      } catch (e) {
        console.warn('Settings init failed:', e);
      }
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkBatteryStatus();
      }
    });

    return () => {
      appSub.remove();
    };
  }, []);

  const handleSaveAiConfig = async () => {
    try {
      await saveAiConfig(aiUrl, aiKey, aiModel);
      showAlert(
        'Configuration Saved',
        'AI Export configuration has been updated successfully.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    } catch (e) {
      showAlert(
        'Save Failed',
        'Failed to save AI configuration.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.danger }
      );
    }
  };

  const handleClearIndex = () => {
    showAlert(
      'Clear Search Index?',
      'This will remove all indexed files from the search database. Your original files on your device are 100% safe and untouched.',
      [
        {
          text: 'Clear Index',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            setIsClearingIndex(true);
            setClearProgress(0.12);
            setClearStatus('Cancelling active indexing...');

            try {
              cancelIndexing(); // Stop background job
              await clearIndex(true, (step, prog) => {
                setClearStatus(step);
                setClearProgress(prog);
              });

              setClearProgress(1.0);
              setClearStatus('Index cleared successfully');

              const updatedStats = await getIndexStats();
              setStats(updatedStats);
              // Also sync the global store to remove the indexing banner
              useStore.getState().setIsIndexing(false);
              useStore.getState().setIndexProgress(null);

              setIsClearingIndex(false);

              // Immediately show success alert without delay
              showAlert(
                'Index Cleared',
                updatedStats.cardsCount > 0 
                  ? `Search index has been reset (${updatedStats.cardsCount} Cards preserved). You can scan new folders or your entire device anytime.`
                  : 'Search index has been reset successfully. You can scan new folders anytime.',
                [{ text: 'Done', style: 'default', onPress: hideAlert }],
                { icon: 'checkmark-circle', iconColor: COLORS.success }
              );
            } catch (e) {
              setIsClearingIndex(false);
              showAlert(
                'Clear Failed',
                `Could not clear index: ${e}`,
                [{ text: 'OK', style: 'default', onPress: hideAlert }],
                { icon: 'alert-circle', iconColor: COLORS.danger }
              );
            }
          },
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  const handleGrantAccessPress = () => {
    setShowStorageDisclosure(true);
  };

  const launchAllFilesSettings = async () => {
    try {
      const IntentLauncher = require('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', {
        data: `package:com.filelenspro.app`
      });
    } catch (e) {
      showAlert(
        'Permissions',
        'Could not open settings automatically. Please enable All Files Access in Android Settings > Apps > FileLensPro > Permissions.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.danger }
      );
    }
  };

  const handleDisclosureAgree = async () => {
    setShowStorageDisclosure(false);
    try {
      await AsyncStorage.setItem('storage_disclosure_accepted', 'true');
    } catch (e) {}
    launchAllFilesSettings();
  };

  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const handleExportBackup = async () => {
    setIsExportingBackup(true);
    try {
      const res = await exportOfflineBackup();
      if (res.success) {
        showAlert(
          'Backup Exported',
          'Your encrypted .flpbackup archive is ready. You can save or share it anywhere.',
          undefined,
          { icon: 'shield-checkmark', iconColor: '#10B981' }
        );
      } else if (res.error !== 'Cancelled') {
        showAlert('Backup Error', res.error || 'Could not export backup.', undefined, { icon: 'alert-circle', iconColor: '#EF4444' });
      }
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRestoreBackup = async () => {
    showAlert(
      'Restore Offline Backup',
      'Select a .flpbackup file to restore your Bookmarks, Saved Searches, Smart Cards, and Alarms. Existing items will be safely merged.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Choose File',
          style: 'default',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            setIsRestoringBackup(true);
            try {
              const res = await restoreOfflineBackup();
              if (res.success) {
                showAlert(
                  'Restore Complete',
                  `Successfully restored:\n• ${res.bookmarksCount} Bookmarks\n• ${res.savedSearchesCount} Saved Searches\n• ${res.cardsCount} Smart Cards\n• ${res.voiceNotesCount} Notes\n• ${res.alarmsRescheduled} Alarms Rescheduled`,
                  undefined,
                  { icon: 'checkmark-done-circle', iconColor: '#10B981' }
                );
              } else if (res.error !== 'Cancelled') {
                showAlert('Restore Failed', res.error || 'Could not restore backup.', undefined, { icon: 'alert-circle', iconColor: '#EF4444' });
              }
            } finally {
              setIsRestoringBackup(false);
            }
          },
        },
      ],
      { icon: 'cloud-download', iconColor: '#38BDF8' }
    );
  };

  const handleShareApp = async () => {
    await shareAppWithFriends();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Settings</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>Preferences, OCR Engine & Storage</Text>
        </View>
        <HeaderMenuButton />
      </View>

      {/* Category Tabs */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  isActive && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? '#FFFFFF' : COLORS.muted}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    isActive && { color: '#FFFFFF', fontWeight: '700' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 24) + 80 }}>
        {/* TAB 1: GENERAL */}
        {activeTab === 'general' && (
          <>
            {/* Appearance */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Appearance</Text>
              <View style={styles.card}>
                <TouchableOpacity style={styles.optionRow} onPress={toggleTheme}>
                  {theme === 'dark' ? (
                    <Ionicons name="moon" size={18} color={COLORS.accentSoft} />
                  ) : (
                    <Ionicons name="sunny" size={18} color={COLORS.accentSoft} />
                  )}
                  <Text style={styles.optionText}>
                    {theme === 'dark' ? 'Dark theme' : 'Light theme'}
                  </Text>
                  <View style={{
                    backgroundColor: COLORS.surface2,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}>
                    <Text style={{ fontSize: 12, color: COLORS.accent, fontWeight: '700' }}>
                      {theme === 'dark' ? 'Dark' : 'Light'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Storage Optimizer & Space Cleaner */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Storage & Space Cleaner</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={[styles.optionRow, { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}
                  onPress={() => router.push('/file-manager')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="folder-open-outline" size={18} color="#3B82F6" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.optionText}>File Manager & Folders</Text>
                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                      Explore device drives, SD cards, and app storage with copy & move
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => router.push('/file-analyser')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pie-chart-outline" size={18} color={COLORS.accentSoft} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.optionText}>Storage Analyser & Cleaner</Text>
                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                      Duplicates, same posture photos, junk cache & large files
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Data Safety & Offline Backup */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Data Safety & Offline Backup</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={[styles.optionRow, { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}
                  onPress={handleExportBackup}
                  disabled={isExportingBackup}
                  activeOpacity={0.7}
                >
                  <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.optionText}>
                      {isExportingBackup ? 'Creating Backup...' : '1-Tap Encrypted Backup (.flpbackup)'}
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                      Export Bookmarks, Saved Searches, Smart Cards & Alarms
                    </Text>
                  </View>
                  {isExportingBackup ? (
                    <ActivityIndicator size="small" color="#10B981" />
                  ) : (
                    <Ionicons name="share-outline" size={16} color={COLORS.muted} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={handleRestoreBackup}
                  disabled={isRestoringBackup}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-circle-outline" size={18} color="#38BDF8" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.optionText}>
                      {isRestoringBackup ? 'Restoring Records...' : 'Restore Backup File'}
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                      Restore your metadata and alarms from another device offline
                    </Text>
                  </View>
                  {isRestoringBackup ? (
                    <ActivityIndicator size="small" color="#38BDF8" />
                  ) : (
                    <Ionicons name="folder-outline" size={16} color={COLORS.muted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Permissions & System */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Permissions & System</Text>
              <View style={styles.card}>
                {Platform.OS === 'android' && (
                  <>
                    <TouchableOpacity style={styles.optionRow} onPress={handleGrantAccessPress}>
                      <Ionicons name="folder-open-outline" size={18} color={COLORS.accentSoft} />
                      <Text style={[styles.optionText, { flex: 1 }]}>Manage All Files Access</Text>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => setShowBatteryModal(true)}
                    >
                      <Ionicons
                        name="battery-charging"
                        size={18}
                        color={isBatteryUnrestricted ? COLORS.success : COLORS.accent}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionText}>Background Running</Text>
                        <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                          {isBatteryUnrestricted
                            ? 'Unrestricted — running smoothly in background'
                            : 'Restricted — tap to set Unrestricted'}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor: isBatteryUnrestricted ? COLORS.success + '20' : COLORS.warning + '20',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          marginRight: 6,
                        }}
                      >
                        <Ionicons
                          name={isBatteryUnrestricted ? 'checkmark-circle' : 'flash'}
                          size={12}
                          color={isBatteryUnrestricted ? COLORS.success : COLORS.warning}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: isBatteryUnrestricted ? COLORS.success : COLORS.warning,
                          }}
                        >
                          {isBatteryUnrestricted ? 'Unrestricted' : 'Set "Unrestricted"'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {/* Quick Actions & Help */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Help & Sharing</Text>
              <View style={styles.card}>
                <TouchableOpacity style={styles.optionRow} onPress={() => setShowTutorialModal(true)}>
                  <Ionicons name="book-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>How to use FileLensPro</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow} onPress={handleShareApp}>
                  <Ionicons name="share-social-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>Share FileLensPro</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* TAB 2: OCR & INDEX */}
        {activeTab === 'ocr' && (
          <>
            {/* Default OCR language */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Default OCR Language</Text>
              <View style={styles.card}>
                {LANGUAGE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.value}
                    style={[
                      styles.optionRow,
                      ocrLanguage === preset.value && styles.optionRowActive,
                    ]}
                    onPress={() => setOcrLanguage(preset.value as any)}
                  >
                    <Ionicons name="language" size={18} color={COLORS.muted} />
                    <Text style={styles.optionText}>{preset.label}</Text>
                    {ocrLanguage === preset.value && (
                      <Text style={styles.checkMark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* OCR Natural */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>OCR Natural</Text>
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Engine</Text>
                  <Text style={[styles.cardValue, { color: COLORS.accent, fontWeight: '700' }]}>
                    OCR Natural
                  </Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Status</Text>
                  <Text style={[styles.cardValue, { color: tessReady ? COLORS.success : COLORS.danger }]}>
                    {tessReady ? '✓ Ready (100% Offline)' : '⏳ Initializing…'}
                  </Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Installed Language Packs</Text>
                  <Text style={styles.cardValue}>
                    {installedLangs.length > 0 ? installedLangs.join(', ') : 'English, Hindi'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Index stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Search Database & Index</Text>
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Ionicons name="server-outline" size={16} color={COLORS.muted} />
                  <Text style={styles.cardLabel}>Total files indexed</Text>
                  <Text style={styles.cardValue}>{totalFiles.toLocaleString()}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Ionicons name="checkmark-done-circle-outline" size={16} color={COLORS.success} />
                  <Text style={styles.cardLabel}>OCR completed</Text>
                  <Text style={styles.cardValue}>{ocrDone.toLocaleString()}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                  <Text style={styles.cardLabel}>OCR pending</Text>
                  <Text style={styles.cardValue}>{ocrPending.toLocaleString()}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.dangerBtn, { marginTop: 12 }, isClearingIndex && { opacity: 0.65 }]}
                  onPress={handleClearIndex}
                  disabled={isClearingIndex}
                  activeOpacity={0.75}
                >
                  {isClearingIndex ? (
                    <ActivityIndicator size="small" color="#fff" style={{ marginRight: 4 }} />
                  ) : (
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.dangerBtnText}>
                    {isClearingIndex ? 'Clearing Index...' : 'Clear Search Index'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* TAB 3: PRO & AI */}
        {activeTab === 'pro' && (
          <>
            {/* Pro Subscription & Free Trial */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pro Subscription & Features</Text>
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color={billingState?.isSubscribed || billingState?.isTrialActive ? COLORS.accent : COLORS.muted}
                  />
                  <Text style={styles.cardLabel}>Membership Status</Text>
                  <Text
                    style={[
                      styles.cardValue,
                      {
                        color: billingState?.isSubscribed
                          ? COLORS.success
                          : billingState?.isTrialActive
                          ? COLORS.accent
                          : COLORS.danger,
                      },
                    ]}
                  >
                    {billingState?.isSubscribed
                      ? `${billingState.activePlan === 'annual' ? 'Annual Pro (₹240/yr)' : 'Monthly Pro (₹21/mo)'}`
                      : billingState?.isTrialActive
                      ? `Free Trial (${billingState.trialDaysRemaining} days left)`
                      : 'Expired / Free'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => setShowSubscriptionModal(true)}
                >
                  <Ionicons name="card-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>
                    {billingState?.isSubscribed ? 'Manage Subscription' : 'Upgrade to Pro / View Plans'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* AI Configuration */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Export Configuration (Optional)</Text>
              <View style={styles.card}>
                {/* Privacy Notice */}
                <View
                  style={{
                    padding: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                    backgroundColor: COLORS.surface2,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name="shield-checkmark" size={20} color={COLORS.success} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 14, marginBottom: 4 }}>
                        Privacy First & Optional
                      </Text>
                      <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                        Your files are indexed and stored entirely locally. FileLensPro does not use or read your files with AI without your explicit consent. AI processing is strictly limited to the specific documents you manually choose to allow during the export process.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Presets */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={styles.cardLabel}>Quick Presets</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {AI_PRESETS.map((preset, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={{
                          backgroundColor: COLORS.bg,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 16,
                          marginRight: 8,
                        }}
                        onPress={() => {
                          setAiUrl(preset.url);
                          setAiModel(preset.model);
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontSize: 13 }}>{preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={styles.cardLabel}>AI Provider URL</Text>
                  <TextInput
                    style={{
                      color: COLORS.text,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                      paddingVertical: 8,
                      fontSize: 14,
                    }}
                    value={aiUrl}
                    onChangeText={setAiUrl}
                    placeholder="https://integrate.api.nvidia.com/v1"
                    placeholderTextColor={COLORS.muted}
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={styles.cardLabel}>API Key</Text>
                  <TextInput
                    style={{
                      color: COLORS.text,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                      paddingVertical: 8,
                      fontSize: 14,
                    }}
                    value={aiKey}
                    onChangeText={setAiKey}
                    placeholder="sk-..."
                    placeholderTextColor={COLORS.muted}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={styles.cardLabel}>Model</Text>
                  <TextInput
                    style={{
                      color: COLORS.text,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                      paddingVertical: 8,
                      fontSize: 14,
                    }}
                    value={aiModel}
                    onChangeText={setAiModel}
                    placeholder="nvidia/nemotron-4-340b-instruct"
                    placeholderTextColor={COLORS.muted}
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.optionRow, { justifyContent: 'center' }]}
                  onPress={handleSaveAiConfig}
                >
                  <Text style={{ color: COLORS.accent, fontWeight: 'bold' }}>Save AI Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* TAB 4: ABOUT & HELP */}
        {activeTab === 'about' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About FileLensPro</Text>
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Ionicons name="information-circle-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={styles.cardLabel}>App version</Text>
                  <Text style={styles.cardValue}>1.0.0 (Release Build)</Text>
                </View>

                <View style={styles.cardRow}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.success} />
                  <Text style={styles.cardLabel}>Security & Privacy</Text>
                  <Text style={[styles.cardValue, { color: COLORS.success }]}>100% Offline Vault</Text>
                </View>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => setShowPrivacyModal(true)}
                >
                  <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>Privacy Policy</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow} onPress={handleGrantAccessPress}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>Storage Access Disclosures</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow} onPress={() => setShowTutorialModal(true)}>
                  <Ionicons name="book-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>Interactive Tutorial</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow} onPress={handleShareApp}>
                  <Ionicons name="share-social-outline" size={18} color={COLORS.accentSoft} />
                  <Text style={[styles.optionText, { flex: 1 }]}>Share App with Friends</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Offline Privacy Guarantee Card */}
            <View style={[styles.card, { padding: 16, backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <Ionicons name="lock-closed" size={18} color={COLORS.accent} />
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>
                  Zero-Cloud Guarantee
                </Text>
              </View>
              <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
                FileLensPro processes all OCR, PDF rendering, document search, and database storage entirely on your device. Your documents, photos, and voice notes never leave your phone.
              </Text>
            </View>

            <Text style={styles.footerText}>
              FileLensPro v1.0 • High-Performance Offline Document Intelligence
            </Text>
          </>
        )}
      </ScrollView>

      {/* In-App Full Privacy Policy Modal */}
      <PrivacyPolicyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* Prominent Storage Disclosure Modal */}
      <StorageDisclosureModal
        visible={showStorageDisclosure}
        onAgree={handleDisclosureAgree}
        onDecline={() => setShowStorageDisclosure(false)}
      />

      {/* Battery Optimization 1-Tap Modal */}
      <BatteryOptimizationModal
        visible={showBatteryModal}
        onClose={() => {
          setShowBatteryModal(false);
          checkBatteryStatus();
        }}
        onAllowed={checkBatteryStatus}
      />

      {/* Tutorial Modal */}
      <TutorialModal 
        visible={showTutorialModal} 
        onClose={() => setShowTutorialModal(false)} 
      />

      {/* Subscription & Billing Modal */}
      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSuccess={async () => {
          const bState = await getBillingState();
          setBillingState(bState);
          setShowSubscriptionModal(false);
          showAlert('Subscription Active', 'Thank you! Voice-First Second Brain and Pro features are fully unlocked.', undefined, { icon: 'checkmark-circle', iconColor: COLORS.success });
        }}
      />

      {/* Clear Index Progress Modal */}
      <Modal
        visible={isClearingIndex}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
      >
        <View style={styles.clearingOverlay}>
          <View style={[styles.clearingCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={[styles.clearingIconWrap, { backgroundColor: COLORS.danger + '20' }]}>
              <Ionicons name="trash" size={28} color={COLORS.danger} />
            </View>
            <Text style={[styles.clearingTitle, { color: COLORS.text }]}>Clearing Search Index</Text>
            <Text style={[styles.clearingSubtitle, { color: COLORS.muted }]}>
              {clearStatus || 'Processing database...'}
            </Text>

            {/* Progress Bar Track */}
            <View style={[styles.progressTrack, { backgroundColor: COLORS.surface2 }]}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    backgroundColor: COLORS.danger, 
                    width: `${Math.round(Math.max(0.08, clearProgress) * 100)}%` 
                  }
                ]} 
              />
            </View>
            <Text style={[styles.progressPercent, { color: COLORS.muted }]}>
              {Math.round(clearProgress * 100)}%
            </Text>
          </View>
        </View>
      </Modal>

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
    </View>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingBottom: 8,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cardLabel: { color: COLORS.muted, fontSize: 14, flex: 1 },
  cardValue: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionRowActive: { backgroundColor: COLORS.surface2 },
  optionText: { color: COLORS.text, fontSize: 14, flex: 1 },
  checkMark: { color: COLORS.accent, fontSize: 18, fontWeight: '700' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
  },
  dangerBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  footerText: {
    color: COLORS.dim,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
  clearingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  clearingCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  clearingIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  clearingTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  clearingSubtitle: {
    fontSize: 13,
    marginBottom: 18,
    textAlign: 'center',
    minHeight: 18,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
});
