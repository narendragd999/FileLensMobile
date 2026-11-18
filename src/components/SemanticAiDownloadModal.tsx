import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  isModelDownloaded,
  isAiEnabled,
  setAiEnabled,
  downloadModel,
  deleteModel,
  getModelSizeMb,
  ModelDownloadProgress,
} from '../services/semanticAiModelService';

interface Props {
  visible: boolean;
  onClose: () => void;
  colors: {
    surface: string;
    surface2: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    danger: string;
  };
}

export function SemanticAiDownloadModal({ visible, onClose, colors }: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [modelSize, setModelSize] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);

  useEffect(() => {
    if (visible) {
      checkStatus();
    }
  }, [visible]);

  const checkStatus = async () => {
    const isDl = await isModelDownloaded();
    const isEn = await isAiEnabled();
    const size = await getModelSizeMb();
    setDownloaded(isDl);
    setEnabled(isEn);
    setModelSize(size);
  };

  const handleStartDownload = async () => {
    setDownloading(true);
    setProgress({
      totalBytes: 118308126,
      downloadedBytes: 0,
      percent: 0,
      status: 'downloading',
    });

    const success = await downloadModel((p) => {
      setProgress(p);
    });

    setDownloading(false);
    if (success) {
      await checkStatus();
      Alert.alert(
        'Offline AI Model Ready',
        'paraphrase-multilingual-MiniLM has been downloaded to local app storage. Semantic extraction and AI search are now active!'
      );
    } else {
      Alert.alert('Download Error', 'Could not complete model download. Please check internet connection.');
    }
  };

  const handleDeleteModel = () => {
    Alert.alert(
      'Delete & Revert AI Model',
      'This will remove the 118 MB model files from device storage and restore the standard hybrid extractor. You can redownload it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Revert',
          style: 'destructive',
          onPress: async () => {
            await deleteModel();
            await checkStatus();
            Alert.alert('Model Removed', 'Model deleted and storage freed.');
          },
        },
      ]
    );
  };

  const handleToggleEnable = async () => {
    const nextVal = !enabled;
    await setAiEnabled(nextVal);
    setEnabled(nextVal);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.iconWrap, { backgroundColor: colors.accent + '20' }]}>
                <Ionicons name="sparkles" size={18} color={colors.accent} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Multilingual Semantic AI</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  paraphrase-multilingual-MiniLM
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <View style={[styles.infoBanner, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
              <Text style={[styles.infoBannerText, { color: colors.text }]}>
                <Text style={{ fontWeight: '700' }}>Zero APK Size Impact: </Text>
                Model is stored in local app storage and can be reverted anytime with 1 tap.
              </Text>
            </View>

            <Text style={[styles.desc, { color: colors.muted }]}>
              Understands deep semantic intent across Hindi, Hinglish, and English without keyword constraints. Extracts clean to-do items from bureaucratic notices, WhatsApp circulars, and memos while filtering noise.
            </Text>

            {downloading ? (
              <View style={[styles.downloadBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[styles.dlLabel, { color: colors.text }]}>Downloading Model Weights...</Text>
                  <Text style={[styles.dlPercent, { color: colors.accent }]}>
                    {progress?.percent || 0}%
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progress?.percent || 0}%`,
                        backgroundColor: colors.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.dlSub, { color: colors.muted }]}>
                  {progress?.downloadedBytes
                    ? `${Math.round(progress.downloadedBytes / (1024 * 1024))} MB / 118 MB`
                    : 'Connecting to server...'}
                </Text>
              </View>
            ) : downloaded ? (
              <View style={[styles.statusBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                    <View>
                      <Text style={[styles.statusTitle, { color: colors.text }]}>Offline AI Model Ready</Text>
                      <Text style={[styles.statusSubtitle, { color: colors.muted }]}>
                        Size: {modelSize} MB • 100% Local & Private
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      { backgroundColor: enabled ? colors.accent : colors.border },
                    ]}
                    onPress={handleToggleEnable}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                      {enabled ? 'Active' : 'Disabled'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.deleteBtn, { borderColor: colors.danger }]}
                  onPress={handleDeleteModel}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
                    Delete Model & Revert Storage
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.actionBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
                  <Text style={[styles.actionBoxTitle, { color: colors.text }]}>
                    One-Time Download Required (118 MB)
                  </Text>
                </View>
                <Text style={[styles.actionBoxSub, { color: colors.muted }]}>
                  Once downloaded, operates entirely offline on-device without internet access or ongoing server fees.
                </Text>

                <TouchableOpacity
                  style={[styles.startDlBtn, { backgroundColor: colors.accent }]}
                  onPress={handleStartDownload}
                  activeOpacity={0.8}
                >
                  <Ionicons name="download" size={16} color="#FFFFFF" />
                  <Text style={styles.startDlBtnText}>Download Multilingual AI Model</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  body: {
    padding: 18,
    gap: 12,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoBannerText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
  },
  downloadBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  dlLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  dlPercent: {
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  dlSub: {
    fontSize: 11,
    textAlign: 'right',
  },
  statusBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginTop: 4,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  actionBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionBoxSub: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  startDlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  startDlBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
