import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Haptics } from '../utils/haptics';
import { StorageItem, shareItem } from '../services/fileManagerService';
import {
  startLanSharing,
  stopLanSharing,
  startFtpSharing,
  stopFtpSharing,
  getFtpSharingStatus,
} from '../services/lanShareService';
import { formatStorageSize } from '../services/storageAnalyzerService';
import { NativeScaleButton } from './NativeScaleButton';

interface LanShareModalProps {
  visible: boolean;
  onClose: () => void;
  items: StorageItem[];
  colors: any;
}

export const LanShareModal: React.FC<LanShareModalProps> = ({
  visible,
  onClose,
  items,
  colors,
}) => {
  const [activeMode, setActiveMode] = useState<'web' | 'ftp'>('web');

  // Web Server State
  const [isWebRunning, setIsWebRunning] = useState(false);
  const [webServerUrl, setWebServerUrl] = useState<string>('');
  const [webCopied, setWebCopied] = useState(false);
  const [webLoading, setWebLoading] = useState(false);

  // FTP Server State
  const [isFtpRunning, setIsFtpRunning] = useState(false);
  const [ftpUrl, setFtpUrl] = useState<string>('');
  const [ftpPort, setFtpPort] = useState<number>(2121);
  const [ftpCopied, setFtpCopied] = useState(false);
  const [ftpLoading, setFtpLoading] = useState(false);

  // Initialize and start server when modal opens
  useEffect(() => {
    let isMounted = true;
    if (visible) {
      setWebLoading(true);
      startLanSharing(items, 8088)
        .then(info => {
          if (!isMounted) return;
          setIsWebRunning(info.isRunning);
          setWebServerUrl(info.serverUrl || '');
        })
        .catch(err => {
          console.warn('[LanShareModal] Failed to start LAN sharing:', err);
        })
        .finally(() => {
          if (isMounted) setWebLoading(false);
        });

      // Check existing FTP server status
      getFtpSharingStatus().then(st => {
        if (!isMounted) return;
        setIsFtpRunning(st.isRunning);
        setFtpUrl(st.ftpUrl || '');
        if (st.port) setFtpPort(st.port);
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [visible, items]);

  const handleCopyWebUrl = useCallback(async () => {
    if (!webServerUrl) return;
    await Clipboard.setStringAsync(webServerUrl);
    Haptics.success();
    setWebCopied(true);
    setTimeout(() => setWebCopied(false), 2500);
  }, [webServerUrl]);

  const handleCopyFtpUrl = useCallback(async () => {
    if (!ftpUrl) return;
    await Clipboard.setStringAsync(ftpUrl);
    Haptics.success();
    setFtpCopied(true);
    setTimeout(() => setFtpCopied(false), 2500);
  }, [ftpUrl]);

  const handleToggleWebServer = useCallback(async () => {
    Haptics.medium();
    if (isWebRunning) {
      await stopLanSharing();
      setIsWebRunning(false);
    } else {
      setWebLoading(true);
      try {
        const info = await startLanSharing(items, 8088);
        setIsWebRunning(info.isRunning);
        setWebServerUrl(info.serverUrl || '');
      } finally {
        setWebLoading(false);
      }
    }
  }, [isWebRunning, items]);

  const handleToggleFtpServer = useCallback(async () => {
    Haptics.medium();
    if (isFtpRunning) {
      await stopFtpSharing();
      setIsFtpRunning(false);
    } else {
      setFtpLoading(true);
      try {
        const info = await startFtpSharing(2121);
        setIsFtpRunning(info.isRunning);
        setFtpUrl(info.ftpUrl || '');
        if (info.port) setFtpPort(info.port);
      } finally {
        setFtpLoading(false);
      }
    }
  }, [isFtpRunning]);

  const handleQuickShare = useCallback(async () => {
    Haptics.light();
    if (items.length > 0) {
      await shareItem(items[0].uri, items[0].mimeType);
    }
  }, [items]);

  const totalBytes = items.reduce((sum, it) => sum + (it.size || 0), 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={e => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: colors.accent + '20' }]}>
                <Ionicons name={activeMode === 'web' ? 'wifi' : 'server-outline'} size={22} color={colors.accent} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>
                  {activeMode === 'web' ? 'Share over WiFi / LAN' : 'FTP File Server'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  Direct high-speed transfer · Zero mobile data
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={[styles.modeTabsRow, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.modeTabBtn,
                activeMode === 'web' && { backgroundColor: colors.surface, borderColor: colors.accent },
              ]}
              onPress={() => {
                Haptics.light();
                setActiveMode('web');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="globe-outline" size={16} color={activeMode === 'web' ? colors.accent : colors.muted} />
              <Text style={[styles.modeTabText, { color: activeMode === 'web' ? colors.accent : colors.muted }]}>
                Web Browser
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeTabBtn,
                activeMode === 'ftp' && { backgroundColor: colors.surface, borderColor: colors.accent },
              ]}
              onPress={() => {
                Haptics.light();
                setActiveMode('ftp');
                if (!isFtpRunning && !ftpUrl) {
                  handleToggleFtpServer();
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="desktop-outline" size={16} color={activeMode === 'ftp' ? colors.accent : colors.muted} />
              <Text 
                style={[styles.modeTabText, { color: activeMode === 'ftp' ? colors.accent : colors.muted }]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
              >
                FTP (PC Explorer)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Web Mode Content */}
          {activeMode === 'web' && (
            webLoading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.muted }]}>Starting local LAN web server...</Text>
              </View>
            ) : (
              <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
                {/* Web Server URL Card */}
                <View style={[styles.urlCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <View style={styles.statusRow}>
                    <View style={styles.statusIndicator}>
                      <View style={[styles.statusDot, { backgroundColor: isWebRunning ? '#10B981' : '#EF4444' }]} />
                      <Text style={[styles.statusText, { color: isWebRunning ? '#10B981' : '#EF4444' }]}>
                        {isWebRunning ? 'Web Server Running' : 'Server Stopped'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={handleToggleWebServer} style={styles.toggleBtn}>
                      <Text style={[styles.toggleBtnText, { color: colors.accent }]}>
                        {isWebRunning ? 'Stop' : 'Start'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isWebRunning && webServerUrl ? (
                    <View style={styles.urlBox}>
                      <Text style={[styles.urlLabel, { color: colors.muted }]}>
                        Open this URL on your PC, Mac, or phone browser:
                      </Text>
                      <View style={styles.urlInputRow}>
                        <Text style={[styles.urlText, { color: colors.accent }]} numberOfLines={1} selectable>
                          {webServerUrl}
                        </Text>
                        <TouchableOpacity
                          style={[styles.copyBtn, { backgroundColor: webCopied ? '#10B981' : colors.accent }]}
                          onPress={handleCopyWebUrl}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={webCopied ? 'checkmark' : 'copy-outline'} size={15} color="#FFF" />
                          <Text style={styles.copyBtnText}>{webCopied ? 'Copied!' : 'Copy'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.stoppedText, { color: colors.muted }]}>
                      Web server is stopped. Tap Start to generate a transfer link.
                    </Text>
                  )}
                </View>

                {/* Instructions Guide */}
                <View style={[styles.guideCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.guideTitle, { color: colors.text }]}>How to Download on PC or Phone:</Text>
                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: colors.accent + '25' }]}>
                      <Text style={[styles.stepNumText, { color: colors.accent }]}>1</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Connect your PC / Laptop to the <Text style={{ color: colors.text, fontWeight: '700' }}>same WiFi</Text> (or connect PC to phone's Hotspot).
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: colors.accent + '25' }]}>
                      <Text style={[styles.stepNumText, { color: colors.accent }]}>2</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Open <Text style={{ color: colors.accent, fontWeight: '700' }}>{webServerUrl || 'the link above'}</Text> in Chrome, Safari, Edge, or Firefox.
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: colors.accent + '25' }]}>
                      <Text style={[styles.stepNumText, { color: colors.accent }]}>3</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Click <Text style={{ color: '#10B981', fontWeight: '700' }}>Download All (ZIP)</Text> or view files instantly with zero data usage!
                    </Text>
                  </View>
                </View>

                {/* Files Summary */}
                <View style={[styles.filesCard, { borderColor: colors.border }]}>
                  <View style={styles.filesHeader}>
                    <Text style={[styles.filesTitle, { color: colors.text }]}>
                      Shared Files ({items.length})
                    </Text>
                    <Text style={[styles.filesSize, { color: colors.muted }]}>
                      Total: {formatStorageSize(totalBytes)}
                    </Text>
                  </View>

                  {items.slice(0, 4).map((item, idx) => (
                    <View key={item.uri || idx} style={[styles.fileRow, { borderTopColor: colors.border }]}>
                      <Ionicons
                        name={item.mimeType?.startsWith('image/') ? 'image-outline' : item.mimeType === 'application/pdf' ? 'document-text-outline' : 'folder-outline'}
                        size={18}
                        color={colors.accent}
                      />
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.fileSizeText, { color: colors.muted }]}>
                        {formatStorageSize(item.size || 0)}
                      </Text>
                    </View>
                  ))}
                  {items.length > 4 && (
                    <Text style={[styles.moreFilesText, { color: colors.muted }]}>
                      + {items.length - 4} more file(s)
                    </Text>
                  )}
                </View>

                {/* Alternative Quick Share Button */}
                <TouchableOpacity
                  style={[styles.altShareBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  onPress={handleQuickShare}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-social-outline" size={18} color={colors.accent} />
                  <Text style={[styles.altShareText, { color: colors.text }]}>
                    Or Share via Android Quick Share / Nearby Sheet
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )
          )}

          {/* FTP Mode Content */}
          {activeMode === 'ftp' && (
            ftpLoading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.muted }]}>Starting FTP Server...</Text>
              </View>
            ) : (
              <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
                {/* FTP Server URL Card */}
                <View style={[styles.urlCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <View style={styles.statusRow}>
                    <View style={styles.statusIndicator}>
                      <View style={[styles.statusDot, { backgroundColor: isFtpRunning ? '#10B981' : '#EF4444' }]} />
                      <Text style={[styles.statusText, { color: isFtpRunning ? '#10B981' : '#EF4444' }]}>
                        {isFtpRunning ? `FTP Server Active (Port ${ftpPort})` : 'FTP Server Stopped'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={handleToggleFtpServer} style={styles.toggleBtn}>
                      <Text style={[styles.toggleBtnText, { color: colors.accent }]}>
                        {isFtpRunning ? 'Stop' : 'Start'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isFtpRunning && ftpUrl ? (
                    <View style={styles.urlBox}>
                      <Text style={[styles.urlLabel, { color: colors.muted }]}>
                        Paste this into Windows File Explorer address bar:
                      </Text>
                      <View style={styles.urlInputRow}>
                        <Text style={[styles.urlText, { color: '#10B981' }]} numberOfLines={1} selectable>
                          {ftpUrl}
                        </Text>
                        <TouchableOpacity
                          style={[styles.copyBtn, { backgroundColor: ftpCopied ? '#10B981' : colors.accent }]}
                          onPress={handleCopyFtpUrl}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={ftpCopied ? 'checkmark' : 'copy-outline'} size={15} color="#FFF" />
                          <Text style={styles.copyBtnText}>{ftpCopied ? 'Copied!' : 'Copy'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.stoppedText, { color: colors.muted }]}>
                      FTP server is stopped. Tap Start to enable Windows File Explorer access.
                    </Text>
                  )}
                </View>

                {/* Windows File Explorer Guide */}
                <View style={[styles.guideCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.guideTitle, { color: colors.text }]}>Connect via Windows File Explorer:</Text>
                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: '#10B98125' }]}>
                      <Text style={[styles.stepNumText, { color: '#10B981' }]}>1</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Connect your Windows PC/Laptop to the <Text style={{ color: colors.text, fontWeight: '700' }}>same WiFi</Text>.
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: '#10B98125' }]}>
                      <Text style={[styles.stepNumText, { color: '#10B981' }]}>2</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Open <Text style={{ color: colors.text, fontWeight: '700' }}>This PC / File Explorer</Text> on Windows.
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: '#10B98125' }]}>
                      <Text style={[styles.stepNumText, { color: '#10B981' }]}>3</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Paste <Text style={{ color: '#10B981', fontWeight: '700' }}>{ftpUrl || 'ftp://<IP>:2121'}</Text> into the top address bar and press <Text style={{ color: colors.text, fontWeight: '700' }}>Enter</Text>.
                    </Text>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: '#10B98125' }]}>
                      <Text style={[styles.stepNumText, { color: '#10B981' }]}>4</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.muted }]}>
                      Drag and drop files, photos, and folders between PC and phone like a USB flash drive!
                    </Text>
                  </View>
                </View>

                {/* Features Highlights */}
                <View style={[styles.ftpFeaturesCard, { borderColor: colors.border }]}>
                  <View style={styles.ftpFeatureRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={[styles.ftpFeatureText, { color: colors.text }]}>
                      Full read and write access to phone storage & SD cards
                    </Text>
                  </View>
                  <View style={styles.ftpFeatureRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={[styles.ftpFeatureText, { color: colors.text }]}>
                      Compatible with FileZilla, Total Commander, WinSCP & Cyberduck
                    </Text>
                  </View>
                  <View style={styles.ftpFeatureRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={[styles.ftpFeatureText, { color: colors.text }]}>
                      Anonymous instant login (no password needed)
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )
          )}

          {/* Bottom Close Button */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <NativeScaleButton
              onPress={onClose}
              style={[styles.doneBtn, { backgroundColor: colors.accent }]}
              hapticType="light"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </NativeScaleButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '92%',
    minHeight: 520,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  modeTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  bodyScroll: {
    paddingHorizontal: 20,
  },
  centerLoading: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  urlCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  urlBox: {
    gap: 8,
  },
  urlLabel: {
    fontSize: 12,
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urlText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  copyBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stoppedText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  guideCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  filesCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  filesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filesTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  filesSize: {
    fontSize: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
  },
  fileSizeText: {
    fontSize: 12,
  },
  moreFilesText: {
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 8,
    fontStyle: 'italic',
  },
  ftpFeaturesCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  ftpFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ftpFeatureText: {
    fontSize: 13,
  },
  altShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    marginBottom: 16,
  },
  altShareText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  doneBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
