import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Vibration,
  ScrollView,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { addIndexTarget } from '../services/database';
import { indexSingleFile } from '../services/indexerService';
import { useThemeColors } from '../utils/theme';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';

export default function ScannerScreen() {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);

  // Themed Alert State
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

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: COLORS.bg }]} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <View style={[styles.permIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
          <Ionicons name="camera-outline" size={48} color={COLORS.accent} />
        </View>
        <Text style={[styles.permTitle, { color: COLORS.text }]}>Camera Access Required</Text>
        <Text style={[styles.permDesc, { color: COLORS.muted }]}>
          FileLensPro needs camera access to scan QR codes, barcodes, and document codes.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: COLORS.accent }]}
          onPress={requestPermission}
          activeOpacity={0.8}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: COLORS.border, backgroundColor: COLORS.surface2 }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryBtnText, { color: COLORS.text }]}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scannedData === data) return;
    Vibration.vibrate(100);
    setScannedData(data);
  };

  const handleCopy = async () => {
    if (!scannedData) return;
    await Clipboard.setStringAsync(scannedData);
    showAlert('Copied to Clipboard', 'Scanned content copied to clipboard.', undefined, {
      icon: 'checkmark-circle',
      iconColor: COLORS.success,
    });
  };

  const handleOpenLink = () => {
    if (!scannedData) return;
    Linking.openURL(scannedData).catch(() => {
      showAlert('Could Not Open URL', 'The link could not be opened in a browser.', undefined, {
        icon: 'alert-circle',
        iconColor: COLORS.danger,
      });
    });
  };

  const handleSaveToDatabase = async () => {
    if (!scannedData) return;
    try {
      const safeName = `Barcode_Scan_${Date.now()}.txt`;
      const localUri = `${FileSystem.documentDirectory}${safeName}`;
      await FileSystem.writeAsStringAsync(localUri, scannedData);

      await addIndexTarget('file', localUri);
      await indexSingleFile({
        uri: localUri,
        filename: safeName,
        fileSize: scannedData.length,
        modificationTime: Date.now() / 1000,
        mimeType: 'text/plain',
      });

      showAlert(
        'Saved & Indexed!',
        'Scanned content has been saved and is now searchable in FileLensPro.',
        [
          {
            text: 'View in App',
            style: 'default',
            onPress: () => {
              hideAlert();
              router.push({
                pathname: '/',
                params: { search: scannedData.substring(0, 30) },
              });
            },
          },
          {
            text: 'Scan More',
            style: 'cancel',
            onPress: () => {
              hideAlert();
              setScannedData(null);
            },
          },
        ],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    } catch (error: any) {
      showAlert('Save Error', error.message || 'Failed to save scanned data', undefined, {
        icon: 'alert-circle',
        iconColor: COLORS.danger,
      });
    }
  };

  const isUrl = scannedData && (scannedData.startsWith('http://') || scannedData.startsWith('https://'));

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      {/* Camera Preview */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        onBarcodeScanned={scannedData ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'pdf417', 'upc_e', 'upc_a', 'code39'],
        }}
      />

      {/* Viewfinder Reticle Overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={[styles.reticle, { borderColor: COLORS.accent + '40' }]}>
          <View style={[styles.corner, styles.topLeft, { borderColor: COLORS.accent }]} />
          <View style={[styles.corner, styles.topRight, { borderColor: COLORS.accent }]} />
          <View style={[styles.corner, styles.bottomLeft, { borderColor: COLORS.accent }]} />
          <View style={[styles.corner, styles.bottomRight, { borderColor: COLORS.accent }]} />
        </View>
        <View style={[styles.hintBadge, { backgroundColor: 'rgba(0,0,0,0.65)', borderColor: COLORS.border }]}>
          <Ionicons name="scan-outline" size={16} color={COLORS.accent} />
          <Text style={[styles.overlayText, { color: '#fff' }]}>Align QR code or Barcode inside frame</Text>
        </View>
      </View>

      {/* Top Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Scan Barcode / QR</Text>

        <TouchableOpacity
          onPress={() => setTorch(t => !t)}
          style={[
            styles.headerBtn,
            { backgroundColor: torch ? COLORS.accent : 'rgba(0,0,0,0.55)' },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons
            name={torch ? 'flash' : 'flash-outline'}
            size={22}
            color={torch ? '#fff' : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet Card for Scanned Result */}
      {scannedData && (
        <View
          style={[
            styles.resultContainer,
            {
              backgroundColor: COLORS.surface,
              borderColor: COLORS.border,
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.resultHeader}>
            <View style={[styles.resultIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
              <Ionicons name={isUrl ? 'globe-outline' : 'qr-code-outline'} size={24} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: COLORS.text }]}>Scanned Content</Text>
              <Text style={[styles.resultMeta, { color: COLORS.muted }]}>
                {isUrl ? 'Web Link' : 'Text / Barcode Data'}
              </Text>
            </View>
          </View>

          <View style={[styles.resultDataBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
            <ScrollView style={{ maxHeight: 110 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.resultDataText, { color: COLORS.text }]}>{scannedData}</Text>
            </ScrollView>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={handleCopy}
              activeOpacity={0.75}
            >
              <Ionicons name="copy-outline" size={20} color={COLORS.accent} />
              <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Copy</Text>
            </TouchableOpacity>

            {isUrl && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                onPress={handleOpenLink}
                activeOpacity={0.75}
              >
                <Ionicons name="globe-outline" size={20} color={COLORS.accent} />
                <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Open</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.accent }]}
              onPress={handleSaveToDatabase}
              activeOpacity={0.75}
            >
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={[styles.actionBtnText, { color: '#fff', fontWeight: 'bold' }]}>Save & Index</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.scanAgainBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
            onPress={() => setScannedData(null)}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh" size={18} color={COLORS.muted} />
            <Text style={[styles.scanAgainText, { color: COLORS.muted }]}>Scan Another Code</Text>
          </TouchableOpacity>
        </View>
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  reticle: {
    width: 260,
    height: 260,
    position: 'relative',
    borderRadius: 24,
    borderWidth: 1,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderWidth: 4,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 18,
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 18,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 18,
  },
  hintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  overlayText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resultContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#88888844',
    alignSelf: 'center',
    marginBottom: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  resultIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  resultMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  resultDataBox: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  resultDataText: {
    fontSize: 14.5,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scanAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  scanAgainText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  permIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  permDesc: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 300,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 280,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    maxWidth: 280,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});