/**
 * License Screen — Activate / check license status.
 *
 * Desktop Pro users enter their SAME license key here — the backend
 * recognizes it and binds to the mobile device automatically.
 *
 * Shows:
 *   - Current status (trial / licensed / expired)
 *   - Machine ID (for support)
 *   - Activate key input
 *   - Release device binding button
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import {
  getLicenseStatus,
  activateLicense,
  releaseLicense,
  LicenseStatus,
} from '../services/licenseService';

import { useThemeColors, SIZES, FONTS } from '../utils/theme';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';

export default function LicenseScreen() {
  const COLORS = useThemeColors();
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);

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

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getLicenseStatus();
      setStatus(s);
    } catch (e) {
      console.error('License status failed:', e);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleActivate = async () => {
    if (!keyInput.trim()) {
      showAlert('Empty Key', 'Please enter your license key.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
      return;
    }
    setActivating(true);
    try {
      const result = await activateLicense(keyInput);
      if (result.success) {
        showAlert('✓ Activated!', result.message, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
        setKeyInput('');
        await refreshStatus();
      } else {
        showAlert('Activation Failed', result.message, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'Activation failed.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setActivating(false);
    }
  };

  const handleRelease = () => {
    showAlert(
      'Release License?',
      'This will unbind the license from this device. You can activate it on another device afterwards.',
      [
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            const result = await releaseLicense();
            showAlert(result.success ? 'Done' : 'Failed', result.message, [{ text: 'OK', style: 'default', onPress: hideAlert }], {
              icon: result.success ? 'checkmark-circle' : 'alert-circle',
              iconColor: result.success ? COLORS.success : COLORS.danger,
            });
            await refreshStatus();
          },
        },
      ],
      { icon: 'log-out-outline', iconColor: COLORS.danger }
    );
  };

  const copyMachineId = async () => {
    if (status?.machineId) {
      await Clipboard.setStringAsync(status.machineId);
      showAlert('Copied', 'Machine ID copied to clipboard.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    }
  };

  if (!status) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.loading}>
          <Text style={styles.mutedText}>Checking license…</Text>
        </View>
      </View>
    );
  }

  const isActivated = status.activated;
  const isTrial = status.isTrial;
  const isExpired = status.trialExpired;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Status banner */}
        <View
          style={[
            styles.statusBanner,
            isActivated && { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: COLORS.success },
            isTrial && { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: COLORS.accent },
            isExpired && { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: COLORS.danger },
          ]}
        >
          {isActivated ? (
            <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
          ) : isTrial ? (
            <Ionicons name="time" size={32} color={COLORS.accent} />
          ) : (
            <Ionicons name="close-circle" size={32} color={COLORS.danger} />
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.statusText}>
              {isActivated ? 'Licensed' : isTrial ? `${status.daysRemaining} days left in trial` : 'Trial expired'}
            </Text>
            <Text style={styles.statusSub}>
              {isActivated
                ? `Activated on ${new Date(status.activationDate!).toLocaleDateString()}`
                : isTrial
                ? 'All features unlocked during trial'
                : 'Activate your license to continue using all features'}
            </Text>
          </View>
        </View>

        {/* Machine ID */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Machine ID</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="shield-checkmark" size={18} color={COLORS.muted} />
              <Text style={styles.machineId}>{status.machineId}</Text>
              <TouchableOpacity onPress={copyMachineId} style={styles.copyBtn}>
                <Ionicons name="copy" size={16} color={COLORS.accentSoft} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              If you already hold an active FileLensPro Desktop license, enter your key below to sync your Pro features on this device.
            </Text>
          </View>
        </View>

        {/* Activate */}
        {!isActivated && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activate License</Text>
            <View style={styles.card}>
              <View style={styles.inputRow}>
                <Ionicons name="key" size={18} color={COLORS.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="FL-XXXX-XXXX-XXXX-XXXX"
                  placeholderTextColor={COLORS.dim}
                  value={keyInput}
                  onChangeText={setKeyInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!activating}
                />
              </View>
              <TouchableOpacity
                style={[styles.activateBtn, activating && styles.btnDisabled]}
                onPress={handleActivate}
                disabled={activating}
              >
                <Text style={styles.activateBtnText}>
                  {activating ? 'Activating…' : 'Activate'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Release (if activated) */}
        {isActivated && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.releaseBtn} onPress={handleRelease}>
              <Ionicons name="log-out" size={16} color={COLORS.danger} />
              <Text style={styles.releaseBtnText}>Release Device Binding</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle" size={16} color={COLORS.muted} />
              <Text style={styles.infoText}>
                Same key works on desktop + mobile (up to 2 devices per key)
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle" size={16} color={COLORS.muted} />
              <Text style={styles.infoText}>
                7-day free trial — all features unlocked
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle" size={16} color={COLORS.muted} />
              <Text style={styles.infoText}>
                Works offline after first activation (7-day grace period)
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle" size={16} color={COLORS.muted} />
              <Text style={styles.infoText}>
                Cross-platform sync: activate your existing desktop license on up to 2 devices.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: COLORS.muted, fontSize: 14 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 24,
  },
  statusText: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  statusSub: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  machineId: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: 'monospace',
    flex: 1,
    fontWeight: '600',
  },
  copyBtn: { padding: 4 },
  hint: { color: COLORS.dim, fontSize: 11, marginTop: 12, lineHeight: 16 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  inputIcon: { marginLeft: 12 },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: 'monospace',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  activateBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  activateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  releaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  releaseBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  infoText: { color: COLORS.muted, fontSize: 13, flex: 1, lineHeight: 18 },
});
