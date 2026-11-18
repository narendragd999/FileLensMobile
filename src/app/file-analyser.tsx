/**
 * file-analyser.tsx — 100% Offline Storage Optimizer & Space Cleaner.
 *
 * Capabilities:
 *   1. Storage Breakdown & Health Gauge (Device Used/Free + App Documents by Category)
 *   2. One-Tap Junk Cache Cleaner (PDF renders, draft crops, temp exports)
 *   3. Exact Duplicate Finder (SHA-256 byte clones with original preservation)
 *   4. Same Posture & Burst Photos (dHash perceptual similarity + "Best Shot" detection)
 *   5. Large File Hogs (>25MB) & Inactive Dormant Files
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Haptics } from '../utils/haptics';

import { useThemeColors } from '../utils/theme';
import { useStore } from '../store/useStore';
import { NativeScaleButton } from '../components/NativeScaleButton';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { FileThumbnail } from '../components/FileThumbnail';
import { ReviewPromptModal } from '../components/ReviewPromptModal';
import { recordCleanedBytes } from '../services/reviewPromptService';

import {
  analyzeStorage,
  formatStorageSize,
  StorageAnalysisResult,
  LargeFileInfo,
} from '../services/storageAnalyzerService';
import {
  getJunkCacheStats,
  cleanJunkCache,
  JunkCacheStats,
} from '../services/cacheCleanerService';
import {
  findDuplicates,
  deleteDuplicates,
  DuplicateScanResult,
  DuplicateGroup,
  DuplicateFile,
} from '../services/duplicateFinder';
import {
  findSimilarImages,
  clusterProcessedPhotos,
  SimilarityThresholdLevel,
  VisualSimilarityScanResult,
  VisualSimilarityCluster,
  SimilarImageItem,
} from '../services/visualSimilarityService';
import * as MediaLibrary from 'expo-media-library';
import { batchDeleteFiles } from 'expo-pdf-to-image';
import { getDatabase } from '../services/database';
import { getBillingState, BillingState } from '../services/billingService';
import SubscriptionModal from '../components/SubscriptionModal';
import { HeaderMenuButton } from '../components/QuickNavModal';
import { findSemanticDuplicates, SemanticDuplicateGroup } from '../services/semanticExtensionsService';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getIndexedFolders,
  getFilesInIndexedFolder,
  getAllPdfStorageItems,
  getDirectoryItems,
  openFileWithNativeViewer,
  shareItem,
  renameItem,
  deleteStorageItem,
  createNewFolder,
  StorageItem,
  FolderNode,
} from '../services/fileManagerService';
import { LanShareModal } from '../components/LanShareModal';
import { addFileToCards, batchAddFilesToCards } from '../services/fileToBrainService';
import { ScheduleBrainModal } from '../components/ScheduleBrainModal';

type ActiveTab = 'overview' | 'cache' | 'duplicates' | 'similar' | 'semantic' | 'large';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Memoized Card for Duplicate File Group
interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  onToggleDuplicate: (hash: string, fileId: number) => void;
  colors: any;
}

const DuplicateGroupCard = React.memo<DuplicateGroupCardProps>(({ group, onToggleDuplicate, colors }) => {
  return (
    <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition} style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.groupHeader}>
        <Text style={[styles.groupSizeBadge, { color: colors.accent }]}>
          Size: {formatStorageSize(group.size)}
        </Text>
        <Text style={[styles.groupCountBadge, { color: colors.muted }]}>
          {group.files.length} Copies
        </Text>
      </View>

      {group.files.map(file => (
        <TouchableOpacity
          key={file.id}
          style={[styles.duplicateItemRow, { borderTopColor: colors.border }]}
          onPress={() => onToggleDuplicate(group.hash, file.id)}
          activeOpacity={file.isOriginal ? 1 : 0.7}
        >
          <FileThumbnail uri={file.uri} name={file.name} style={styles.itemThumb} />
          <View style={styles.itemInfo}>
            <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={[styles.itemDate, { color: colors.muted }]}>
              {new Date(file.modified).toLocaleDateString()}
            </Text>
          </View>

          {file.isOriginal ? (
            <View style={[styles.badgeOriginal, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="shield-checkmark" size={12} color="#10B981" />
              <Text style={[styles.badgeOriginalText, { color: '#10B981' }]}>Original (Keep)</Text>
            </View>
          ) : (
            <View style={[styles.checkboxWrap, file.selectedForCleanup && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              {file.selectedForCleanup && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
          )}
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
});

// Memoized Card for Visual Similarity / Same Posture Cluster
interface ClusterCardProps {
  cluster: VisualSimilarityCluster;
  onToggleImage: (clusterId: string, imageId: number) => void;
  colors: any;
}

const ClusterCard = React.memo<ClusterCardProps>(({ cluster, onToggleImage, colors }) => {
  return (
    <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition} style={[styles.clusterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.clusterHeader}>
        <View style={styles.clusterHeaderLeft}>
          <Ionicons name="images" size={16} color={colors.accent} />
          <Text style={[styles.clusterTitle, { color: colors.text }]}>
            {cluster.images.length} Near-Identical Shots
          </Text>
        </View>
        <Text style={[styles.clusterWasted, { color: colors.accent }]}>
          Freed: {formatStorageSize(cluster.wastedBytes)}
        </Text>
      </View>

      {/* Horizontal Grid of Photos */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clusterImagesScroll}>
        {cluster.images.map(img => (
          <TouchableOpacity
            key={img.id}
            style={[
              styles.clusterImgBox,
              { borderColor: img.isBestShot ? '#10B981' : img.selectedForCleanup ? colors.accent : colors.border },
            ]}
            onPress={() => onToggleImage(cluster.clusterId, img.id)}
            activeOpacity={img.isBestShot ? 1 : 0.7}
          >
            <FileThumbnail uri={img.uri} style={styles.clusterThumb} />

            {img.isBestShot ? (
              <View style={styles.bestShotBadge}>
                <Ionicons name="star" size={10} color="#FFF" />
                <Text style={styles.bestShotBadgeText}>Best Shot</Text>
              </View>
            ) : (
              <View style={[styles.imgSelectCheckbox, img.selectedForCleanup && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                {img.selectedForCleanup && <Ionicons name="checkmark" size={12} color="#FFF" />}
              </View>
            )}

            <Text style={[styles.clusterImgSize, { color: colors.muted }]}>
              {formatStorageSize(img.size)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );
});

// Memoized Card for Large Storage Hog File
interface LargeFileCardProps {
  file: LargeFileInfo;
  isSelected: boolean;
  onToggle: (fileId: number) => void;
  colors: any;
}

const LargeFileCard = React.memo<LargeFileCardProps>(({ file, isSelected, onToggle, colors }) => {
  return (
    <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition}>
      <TouchableOpacity
        style={[styles.largeFileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => onToggle(file.id)}
        activeOpacity={0.7}
      >
        <FileThumbnail uri={file.uri} name={file.name} extension={file.extension} style={styles.itemThumb} />
        <View style={styles.itemInfo}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={[styles.itemDate, { color: colors.muted }]}>
            {new Date(file.modified).toLocaleDateString()}
          </Text>
        </View>
        <Text style={[styles.largeFileSize, { color: colors.accent }]}>
          {formatStorageSize(file.size)}
        </Text>
        <View style={[styles.checkboxWrap, isSelected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function FileAnalyserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const COLORS = useThemeColors();
  const theme = useStore(state => state.theme);
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Loading States
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [isScanningSimilar, setIsScanningSimilar] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  // Scan Progress
  const [dupProgress, setDupProgress] = useState<{ current: number; total: number } | null>(null);
  const [similarProgress, setSimilarProgress] = useState<{ current: number; total: number } | null>(null);

  // Data States
  const [storageData, setStorageData] = useState<StorageAnalysisResult | null>(null);
  const [cacheStats, setCacheStats] = useState<JunkCacheStats | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateScanResult | null>(null);
  const [similarResult, setSimilarResult] = useState<VisualSimilarityScanResult | null>(null);
  const [semanticGroups, setSemanticGroups] = useState<SemanticDuplicateGroup[] | null>(null);
  const [isScanningSemantic, setIsScanningSemantic] = useState(false);
  const [selectedSemanticIds, setSelectedSemanticIds] = useState<Set<number>>(new Set());
  const [thresholdLevel, setThresholdLevel] = useState<SimilarityThresholdLevel>('strict');
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Pro status: Active if subscribed or within 30-day free trial period
  const isProActive = useMemo(() => {
    if (!billingState) return true; // optimistic while loading
    return billingState.hasProAccess;
  }, [billingState]);

  const cancellationTokenRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });

  // Selected Large Files for Cleanup
  const [selectedLargeFiles, setSelectedLargeFiles] = useState<Set<number>>(new Set());

  // Alert State
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
      buttons: buttons || [{ text: 'OK', style: 'default', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) }],
      icon: options?.icon,
      iconColor: options?.iconColor,
    });
  };

  const loadInitialData = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const [storage, cache, billing] = await Promise.all([
        analyzeStorage(),
        getJunkCacheStats(),
        getBillingState().catch(() => null),
      ]);
      setStorageData(storage);
      setCacheStats(cache);
      if (billing) setBillingState(billing);
    } catch (e) {
      console.warn('[FileAnalyser] loadInitialData error:', e);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Scan Duplicates
  const handleScanDuplicates = async () => {
    setIsScanningDuplicates(true);
    setDupProgress({ current: 0, total: 100 });
    let lastUpdate = 0;
    try {
      const result = await findDuplicates((scanned, total) => {
        const now = Date.now();
        if (now - lastUpdate > 80 || scanned === total) {
          lastUpdate = now;
          setDupProgress({ current: scanned, total });
        }
      });
      setDuplicateResult(result);
      Haptics.success();
    } catch (e) {
      console.warn('[FileAnalyser] handleScanDuplicates error:', e);
      showAlert('Scan Failed', 'Unable to complete duplicate scan.');
    } finally {
      setIsScanningDuplicates(false);
      setDupProgress(null);
    }
  };

  // Scan Meaning / Semantic Duplicates (AI Cosine Similarity >= 0.90)
  const handleScanSemanticDuplicates = async () => {
    setIsScanningSemantic(true);
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        id: number;
        name: string;
        uri: string;
        size: number;
        ocr_text: string | null;
        content_text: string | null;
        modified: string;
      }>(
        "SELECT id, name, uri, size, ocr_text, content_text, modified FROM files WHERE (length(ocr_text) > 25 OR length(content_text) > 25) ORDER BY id ASC LIMIT 250"
      );

      const items = rows.map(r => ({
        id: r.id,
        name: r.name,
        uri: r.uri,
        size: r.size,
        ocr_text: r.ocr_text || undefined,
        content_text: r.content_text || undefined,
        modified: r.modified,
      }));

      const groups = await findSemanticDuplicates(items, 0.90);
      setSemanticGroups(groups);

      const defaultSelected = new Set<number>();
      for (const g of groups) {
        for (const d of g.duplicates) {
          defaultSelected.add(Number(d.id));
        }
      }
      setSelectedSemanticIds(defaultSelected);
      Haptics.success();
    } catch (e) {
      console.warn('[FileAnalyser] handleScanSemanticDuplicates error:', e);
      showAlert('Scan Notice', 'Unable to complete semantic duplicate scan.');
    } finally {
      setIsScanningSemantic(false);
    }
  };

  // Scan Similar Images
  const handleScanSimilar = async (forcedThreshold?: SimilarityThresholdLevel) => {
    const levelToUse = forcedThreshold || thresholdLevel;
    setIsScanningSimilar(true);
    setSimilarProgress({ current: 0, total: 100 });
    cancellationTokenRef.current = { isCancelled: false };
    let lastUpdate = 0;
    try {
      const result = await findSimilarImages(
        (scanned, total) => {
          const now = Date.now();
          if (now - lastUpdate > 80 || scanned === total) {
            lastUpdate = now;
            setSimilarProgress({ current: scanned, total });
          }
        },
        cancellationTokenRef.current,
        400,
        levelToUse
      );
      if (!cancellationTokenRef.current.isCancelled) {
        setSimilarResult(result);
        Haptics.success();
      }
    } catch (e) {
      console.warn('[FileAnalyser] handleScanSimilar error:', e);
      showAlert('Scan Failed', 'Unable to complete visual similarity scan.');
    } finally {
      setIsScanningSimilar(false);
      setSimilarProgress(null);
    }
  };

  // Instant threshold change: re-clusters in <2ms without re-scanning bitmaps
  const handleThresholdChange = (newLevel: SimilarityThresholdLevel) => {
    if (newLevel === thresholdLevel) return;
    setThresholdLevel(newLevel);
    Haptics.selection();

    if (similarResult?.processedPhotos && similarResult.processedPhotos.length > 0) {
      const newClusters = clusterProcessedPhotos(similarResult.processedPhotos, newLevel);
      const totalSimilar = newClusters.reduce((sum, c) => sum + c.images.length, 0);
      const wasted = newClusters.reduce((sum, c) => sum + c.wastedBytes, 0);
      setSimilarResult({
        ...similarResult,
        clusters: newClusters,
        totalSimilarImages: totalSimilar,
        wastedBytes: wasted,
      });
    } else if (!isScanningSimilar) {
      handleScanSimilar(newLevel);
    }
  };

  // Select All / Deselect All Handlers
  const handleSelectAllDuplicates = (select: boolean) => {
    if (!duplicateResult) return;
    Haptics.medium();
    const updatedGroups = duplicateResult.groups.map(group => ({
      ...group,
      files: group.files.map(f => (f.isOriginal ? f : { ...f, selectedForCleanup: select })),
    }));
    setDuplicateResult({ ...duplicateResult, groups: updatedGroups });
  };

  const handleSelectAllSimilar = (select: boolean) => {
    if (!similarResult) return;
    Haptics.medium();
    const updatedClusters = similarResult.clusters.map(cluster => ({
      ...cluster,
      images: cluster.images.map(img => (img.isBestShot ? img : { ...img, selectedForCleanup: select })),
    }));
    setSimilarResult({ ...similarResult, clusters: updatedClusters });
  };

  const handleSelectAllLarge = (select: boolean) => {
    if (!storageData) return;
    Haptics.medium();
    if (select) {
      setSelectedLargeFiles(new Set(storageData.largeFiles.map(f => f.id)));
    } else {
      setSelectedLargeFiles(new Set());
    }
  };

  const handleSelectAllSemantic = (select: boolean) => {
    if (!semanticGroups) return;
    Haptics.medium();
    if (select) {
      const allIds = new Set<number>();
      for (const g of semanticGroups) {
        for (const d of g.duplicates) {
          allIds.add(Number(d.id));
        }
      }
      setSelectedSemanticIds(allIds);
    } else {
      setSelectedSemanticIds(new Set());
    }
  };

  const handleCancelScanSimilar = () => {
    cancellationTokenRef.current.isCancelled = true;
    setIsScanningSimilar(false);
    setSimilarProgress(null);
    Haptics.light();
  };

  // One-Tap Cache Clean
  const handleCleanCache = async () => {
    showAlert(
      'Clean Junk Cache',
      `Clear ${formatStorageSize(cacheStats?.totalBytes || 0)} of safe temporary cache and render files? Your documents and photos will remain completely untouched.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Clean Now',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            setIsCleaning(true);
            try {
              const res = await cleanJunkCache();
              await loadInitialData();
              Haptics.success();
              showAlert('Cache Cleaned', `Successfully freed ${formatStorageSize(res.freedBytes)} of space!`, undefined, {
                icon: 'checkmark-circle',
                iconColor: COLORS.success,
              });
              if (res.freedBytes > 0) {
                recordCleanedBytes(res.freedBytes).then(prompt => {
                  if (prompt) {
                    setTimeout(() => setShowReviewModal(true), 1200);
                  }
                }).catch(() => {});
              }
            } catch (e) {
              showAlert('Error', 'Failed to clear cache.');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
      { icon: 'trash-bin', iconColor: COLORS.accent }
    );
  };

  // Toggle Duplicate Item Selection
  const toggleDuplicateSelection = useCallback((groupHash: string, fileId: number) => {
    Haptics.light();
    setDuplicateResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map(group => {
          if (group.hash !== groupHash) return group;
          return {
            ...group,
            files: group.files.map(f => {
              if (f.id === fileId && !f.isOriginal) {
                return { ...f, selectedForCleanup: !f.selectedForCleanup };
              }
              return f;
            }),
          };
        }),
      };
    });
  }, []);

  // Toggle Similar Item Selection
  const toggleSimilarSelection = useCallback((clusterId: string, imageId: number) => {
    Haptics.light();
    setSimilarResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        clusters: prev.clusters.map(cluster => {
          if (cluster.clusterId !== clusterId) return cluster;
          return {
            ...cluster,
            images: cluster.images.map(img => {
              if (img.id === imageId && !img.isBestShot) {
                return { ...img, selectedForCleanup: !img.selectedForCleanup };
              }
              return img;
            }),
          };
        }),
      };
    });
  }, []);

  // Toggle Large File Selection
  const toggleLargeFileSelection = useCallback((id: number) => {
    Haptics.light();
    setSelectedLargeFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Calculate Selected Duplicates Count & Bytes
  const selectedDuplicateStats = useMemo(() => {
    if (!duplicateResult) return { count: 0, bytes: 0, ids: [] as number[] };
    let count = 0;
    let bytes = 0;
    const ids: number[] = [];
    for (const g of duplicateResult.groups) {
      for (const f of g.files) {
        if (!f.isOriginal && f.selectedForCleanup) {
          count++;
          bytes += g.size;
          ids.push(f.id);
        }
      }
    }
    return { count, bytes, ids };
  }, [duplicateResult]);

  // Calculate Selected Similar Images Count & Bytes
  const selectedSimilarStats = useMemo(() => {
    if (!similarResult) return { count: 0, bytes: 0, uris: [] as string[], ids: [] as number[] };
    let count = 0;
    let bytes = 0;
    const uris: string[] = [];
    const ids: number[] = [];
    for (const c of similarResult.clusters) {
      for (const img of c.images) {
        if (!img.isBestShot && img.selectedForCleanup) {
          count++;
          bytes += img.size;
          uris.push(img.uri);
          ids.push(img.id);
        }
      }
    }
    return { count, bytes, uris, ids };
  }, [similarResult]);

  // Calculate Selected Large Files Stats
  const selectedLargeStats = useMemo(() => {
    if (!storageData) return { count: 0, bytes: 0, uris: [] as string[], ids: [] as number[] };
    let count = 0;
    let bytes = 0;
    const uris: string[] = [];
    const ids: number[] = [];
    for (const f of storageData.largeFiles) {
      if (selectedLargeFiles.has(f.id)) {
        count++;
        bytes += f.size;
        uris.push(f.uri);
        ids.push(f.id);
      }
    }
    return { count, bytes, uris, ids };
  }, [storageData, selectedLargeFiles]);

  // Execute Duplicate Deletion
  const handleDeleteDuplicates = async () => {
    if (selectedDuplicateStats.count === 0) return;
    showAlert(
      'Delete Duplicate Files?',
      `Delete ${selectedDuplicateStats.count} duplicate files to reclaim ${formatStorageSize(selectedDuplicateStats.bytes)}?\n\nOriginal files are safe and preserved.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            setIsCleaning(true);
            try {
              const selectedFiles = duplicateResult?.groups
                .flatMap(g => g.files)
                .filter(f => !f.isOriginal && f.selectedForCleanup) || [];
              const res = await deleteDuplicates(selectedDuplicateStats.ids, selectedFiles);

              // Instantly update local duplicate groups so deleted items vanish smoothly
              if (duplicateResult) {
                const deletedSet = new Set(selectedDuplicateStats.ids);
                const updatedGroups = duplicateResult.groups
                  .map(g => ({
                    ...g,
                    files: g.files.filter(f => !deletedSet.has(f.id)),
                  }))
                  .filter(g => g.files.length > 1);

                setDuplicateResult(prev => prev ? {
                  ...prev,
                  groups: updatedGroups,
                  totalDuplicates: updatedGroups.reduce((acc, g) => acc + (g.files.length - 1), 0),
                  wastedSpace: updatedGroups.reduce((acc, g) => acc + (g.size * (g.files.length - 1)), 0),
                } : null);
              }

              await loadInitialData();
              Haptics.success();
              const displayCount = res.deleted > 0 ? res.deleted : selectedDuplicateStats.count;
              const displaySpace = res.freedSpace > 0 ? res.freedSpace : selectedDuplicateStats.bytes;
              showAlert('Success', `Cleaned ${displayCount} duplicate files. Freed ${formatStorageSize(displaySpace)}!`, undefined, {
                icon: 'checkmark-circle',
                iconColor: COLORS.success,
              });
            } catch (e) {
              showAlert('Error', 'Failed to delete duplicates.');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
      { icon: 'copy-outline', iconColor: COLORS.accent }
    );
  };

  // Execute Similar Images Deletion
  const handleDeleteSimilar = async () => {
    if (selectedSimilarStats.count === 0) return;
    showAlert(
      'Delete Redundant Photos?',
      `Delete ${selectedSimilarStats.count} redundant same-posture photos to reclaim ${formatStorageSize(selectedSimilarStats.bytes)}?\n\nAll "⭐ Best Shots" are preserved.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            setIsCleaning(true);
            try {
              const res = await batchDeleteFiles(selectedSimilarStats.uris);

              // Also delete from MediaLibrary if applicable
              try {
                for (const uri of selectedSimilarStats.uris) {
                  const match = uri.match(/\/(\d+)$/);
                  if (match) {
                    await MediaLibrary.deleteAssetsAsync([match[1]]).catch(() => {});
                  } else if (uri.startsWith('ph://')) {
                    const phId = uri.replace('ph://', '').split('/')[0];
                    await MediaLibrary.deleteAssetsAsync([phId]).catch(() => {});
                  }
                }
              } catch (err) {
                console.warn('[FileAnalyser] MediaLibrary delete batch error:', err);
              }

              // Clean SQLite records
              const database = await getDatabase();
              for (const id of selectedSimilarStats.ids) {
                await database.runAsync('DELETE FROM files WHERE id = ?', [id]).catch(() => {});
              }
              await loadInitialData();
              handleScanSimilar();
              Haptics.success();
              showAlert('Success', `Cleaned ${res.deleted} redundant photos. Freed ${formatStorageSize(res.freedBytes)}!`, undefined, {
                icon: 'checkmark-circle',
                iconColor: COLORS.success,
              });
            } catch (e) {
              showAlert('Error', 'Failed to delete photos.');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
      { icon: 'images-outline', iconColor: COLORS.accent }
    );
  };

  // Execute Large Files Deletion
  const handleDeleteLargeFiles = async () => {
    if (selectedLargeStats.count === 0) return;
    showAlert(
      'Delete Selected Large Files?',
      `Delete ${selectedLargeStats.count} selected files to reclaim ${formatStorageSize(selectedLargeStats.bytes)}?\n\nThis will permanently delete the selected files.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            setIsCleaning(true);
            try {
              const res = await batchDeleteFiles(selectedLargeStats.uris);
              const database = await getDatabase();
              for (const id of selectedLargeStats.ids) {
                await database.runAsync('DELETE FROM files WHERE id = ?', [id]);
              }
              setSelectedLargeFiles(new Set());
              await loadInitialData();
              Haptics.success();
              showAlert('Success', `Cleaned ${res.deleted} files. Freed ${formatStorageSize(res.freedBytes)}!`, undefined, {
                icon: 'checkmark-circle',
                iconColor: COLORS.success,
              });
            } catch (e) {
              showAlert('Error', 'Failed to delete files.');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  // Toggle Semantic Duplicate Selection
  const toggleSemanticSelection = useCallback((id: number) => {
    Haptics.light();
    setSelectedSemanticIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Calculate Selected Semantic Duplicates Stats
  const selectedSemanticStats = useMemo(() => {
    if (!semanticGroups) return { count: 0, bytes: 0, items: [] as any[] };
    let count = 0;
    let bytes = 0;
    const items: any[] = [];
    for (const g of semanticGroups) {
      for (const d of g.duplicates) {
        if (selectedSemanticIds.has(Number(d.id))) {
          count++;
          bytes += d.size || 0;
          items.push(d);
        }
      }
    }
    return { count, bytes, items };
  }, [semanticGroups, selectedSemanticIds]);

  // Execute Semantic Duplicates Deletion
  const handleDeleteSemanticDuplicates = async () => {
    if (selectedSemanticStats.count === 0 || !semanticGroups) return;
    showAlert(
      'Clean Meaning Duplicates?',
      `Delete ${selectedSemanticStats.count} duplicate copies to reclaim ~${formatStorageSize(selectedSemanticStats.bytes)}?\n\nOriginal documents remain safe and intact.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Clean Now',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            setIsCleaning(true);
            try {
              const res = await deleteDuplicates(
                selectedSemanticStats.items.map(f => Number(f.id)),
                selectedSemanticStats.items.map(f => ({
                  id: Number(f.id),
                  uri: f.uri,
                  size: f.size || 0,
                  name: f.name,
                  modified: f.modified || new Date().toISOString(),
                  isOriginal: false,
                }))
              );

              const deletedSet = selectedSemanticIds;
              const updatedGroups = semanticGroups
                .map(g => ({
                  ...g,
                  duplicates: g.duplicates.filter(d => !deletedSet.has(Number(d.id))),
                }))
                .filter(g => g.duplicates.length > 0);

              setSemanticGroups(updatedGroups);
              setSelectedSemanticIds(new Set());
              await loadInitialData();
              Haptics.success();
              showAlert('Success', `Cleaned ${res.deleted || selectedSemanticStats.count} semantic copies. Freed ${formatStorageSize(res.freedSpace || selectedSemanticStats.bytes)}!`, undefined, {
                icon: 'checkmark-circle',
                iconColor: COLORS.success,
              });
            } catch (e) {
              showAlert('Error', 'Failed to delete semantic duplicates.');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
      { icon: 'sparkles-outline', iconColor: '#10B981' }
    );
  };

  // ==========================================
  // FILE MANAGER STATE & HANDLERS
  // ==========================================
  const [fmFolders, setFmFolders] = useState<FolderNode[]>([]);
  const [fmCurrentFolder, setFmCurrentFolder] = useState<FolderNode | null>(null);
  const [fmSubDirPath, setFmSubDirPath] = useState<string | null>(null);
  const [fmBreadcrumbs, setFmBreadcrumbs] = useState<{ name: string; path?: string }[]>([]);
  const [fmItems, setFmItems] = useState<StorageItem[]>([]);
  const [isFmLoading, setIsFmLoading] = useState(false);
  const [fmSearch, setFmSearch] = useState('');
  const [fmFilterType, setFmFilterType] = useState<'all' | 'pdf' | 'image' | 'doc'>('all');
  const [fmSort, setFmSort] = useState<'date' | 'name' | 'size'>('date');
  const [selectedFmUris, setSelectedFmUris] = useState<Set<string>>(new Set());
  const [fmActionItem, setFmActionItem] = useState<StorageItem | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [lanShareModalVisible, setLanShareModalVisible] = useState(false);
  const [lanShareItems, setLanShareItems] = useState<StorageItem[]>([]);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleTargetItem, setScheduleTargetItem] = useState<StorageItem | null>(null);

  const loadFmFolders = useCallback(async () => {
    setIsFmLoading(true);
    try {
      const folders = await getIndexedFolders();
      setFmFolders(folders);
    } catch (err) {
      console.warn('[FileManager] Failed to load folders:', err);
    } finally {
      setIsFmLoading(false);
    }
  }, []);

  const openFmFolder = useCallback(async (folder: FolderNode) => {
    Haptics.light();
    setIsFmLoading(true);
    setFmCurrentFolder(folder);
    setFmSubDirPath(null);
    setFmBreadcrumbs([{ name: 'Storage' }, { name: folder.name }]);
    setSelectedFmUris(new Set());
    setFmSearch('');
    try {
      let items: StorageItem[] = [];
      if (folder.name === 'PDF Documents' || folder.name === 'All PDFs') {
        items = await getAllPdfStorageItems();
      } else if (folder.name === 'App Documents') {
        const docDir = FileSystem.documentDirectory || '';
        const rootItems = await getDirectoryItems(docDir);
        const scansItems = await getDirectoryItems(`${docDir}scans/`);
        const exportsItems = await getDirectoryItems(`${docDir}exports/`);
        const seen = new Set<string>();
        items = [];
        for (const it of [...rootItems, ...scansItems, ...exportsItems]) {
          if (!seen.has(it.uri)) {
            seen.add(it.uri);
            items.push(it);
          }
        }
      } else if (folder.isPhysicalPath && folder.path && folder.path.startsWith('/')) {
        items = await getDirectoryItems(folder.path);
        if (items.length === 0) {
          items = await getFilesInIndexedFolder(folder.name);
        }
      } else {
        items = await getFilesInIndexedFolder(folder.name);
      }
      setFmItems(items);
    } catch (err) {
      console.warn('[FileManager] Error opening folder:', err);
      setFmItems([]);
    } finally {
      setIsFmLoading(false);
    }
  }, []);

  const openFmSubDir = useCallback(async (dirItem: StorageItem) => {
    Haptics.light();
    setIsFmLoading(true);
    setFmSubDirPath(dirItem.uri);
    setFmBreadcrumbs(prev => [...prev, { name: dirItem.name, path: dirItem.uri }]);
    setSelectedFmUris(new Set());
    setFmSearch('');
    try {
      const items = await getDirectoryItems(dirItem.uri);
      setFmItems(items);
    } catch (err) {
      console.warn('[FileManager] Error opening sub-directory:', err);
      setFmItems([]);
    } finally {
      setIsFmLoading(false);
    }
  }, []);

  const navigateFmBreadcrumb = useCallback(async (index: number) => {
    Haptics.light();
    if (index === 0) {
      // Return to Root folders
      setFmCurrentFolder(null);
      setFmSubDirPath(null);
      setFmBreadcrumbs([]);
      setFmItems([]);
      setSelectedFmUris(new Set());
      await loadFmFolders();
    } else if (index === 1 && fmCurrentFolder) {
      // Return to root of current folder
      await openFmFolder(fmCurrentFolder);
    } else if (index > 1) {
      const target = fmBreadcrumbs[index];
      if (target?.path) {
        setIsFmLoading(true);
        setFmSubDirPath(target.path);
        setFmBreadcrumbs(prev => prev.slice(0, index + 1));
        setSelectedFmUris(new Set());
        try {
          const items = await getDirectoryItems(target.path);
          setFmItems(items);
        } catch (err) {
          console.warn('[FileManager] Error navigating breadcrumb:', err);
        } finally {
          setIsFmLoading(false);
        }
      }
    }
  }, [fmCurrentFolder, fmBreadcrumbs, loadFmFolders, openFmFolder]);

  const handleFmOpenFile = useCallback(async (item: StorageItem) => {
    if (item.isDirectory) {
      await openFmSubDir(item);
    } else {
      Haptics.light();
      await openFileWithNativeViewer(item.uri, item.mimeType, item.name);
    }
  }, [openFmSubDir]);

  const handleShareOverLan = useCallback((item: StorageItem) => {
    Haptics.light();
    setLanShareItems([item]);
    setLanShareModalVisible(true);
  }, []);

  const handleBatchShareLan = useCallback(() => {
    Haptics.light();
    const selected = fmItems.filter(f => selectedFmUris.has(f.uri));
    if (selected.length > 0) {
      setLanShareItems(selected);
      setLanShareModalVisible(true);
    }
  }, [fmItems, selectedFmUris]);

  const handleAddToCards = useCallback(async (item: StorageItem) => {
    Haptics.medium();
    const res = await addFileToCards(item);
    if (res.success) {
      Haptics.success();
      showAlert('Added to Cards', `"${item.name}" is now available in your Smart Cards!`, undefined, {
        icon: 'card',
        iconColor: '#EC4899',
      });
    } else {
      showAlert('Error', res.error || 'Failed to add card');
    }
  }, []);

  const handleBatchAddToCards = useCallback(async () => {
    const selected = fmItems.filter(f => selectedFmUris.has(f.uri));
    if (selected.length === 0) return;
    Haptics.medium();
    const res = await batchAddFilesToCards(selected);
    setSelectedFmUris(new Set());
    Haptics.success();
    showAlert('Cards Created', `Added ${res.addedCount} file(s) to your Smart Cards!`, undefined, {
      icon: 'card',
      iconColor: '#EC4899',
    });
  }, [fmItems, selectedFmUris]);

  const handleOpenScheduleBrain = useCallback((item: StorageItem) => {
    Haptics.light();
    setScheduleTargetItem(item);
    setScheduleModalVisible(true);
  }, []);

  const handleFmShare = useCallback(async (item: StorageItem) => {
    Haptics.light();
    await shareItem(item.uri, item.mimeType);
  }, []);

  const handleFmDeletePrompt = useCallback((item: StorageItem) => {
    showAlert(
      item.isDirectory ? 'Delete Folder?' : 'Delete File?',
      `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            Haptics.medium();
            const ok = await deleteStorageItem(item.uri, item.id);
            if (ok) {
              setFmItems(prev => prev.filter(f => f.uri !== item.uri));
              setSelectedFmUris(prev => {
                const n = new Set(prev);
                n.delete(item.uri);
                return n;
              });
              Haptics.success();
              loadFmFolders();
            } else {
              showAlert('Error', 'Could not delete item. File may be read-only or in use.');
            }
          },
        },
      ],
      { icon: 'trash', iconColor: COLORS.danger }
    );
  }, [COLORS.danger, loadFmFolders]);

  const handleFmRenameSubmit = async () => {
    if (!fmActionItem || !renameText.trim()) return;
    Haptics.medium();
    const res = await renameItem(fmActionItem.uri, renameText.trim(), fmActionItem.isDirectory);
    setRenameModalVisible(false);
    if (res.success && res.newUri) {
      setFmItems(prev =>
        prev.map(f => (f.uri === fmActionItem.uri ? { ...f, uri: res.newUri!, name: renameText.trim() } : f))
      );
      Haptics.success();
    } else {
      showAlert('Rename Failed', res.error || 'Unable to rename item.');
    }
  };

  const handleFmCreateFolderSubmit = async () => {
    if (!newFolderName.trim()) return;
    Haptics.medium();
    const targetDir = fmSubDirPath || FileSystem.documentDirectory || '';
    const res = await createNewFolder(targetDir, newFolderName.trim());
    setNewFolderModalVisible(false);
    setNewFolderName('');
    if (res.success && res.dirUri) {
      Haptics.success();
      // Reload current directory
      const refreshed = await getDirectoryItems(targetDir);
      setFmItems(refreshed);
      loadFmFolders();
    } else {
      showAlert('Error', res.error || 'Could not create folder.');
    }
  };

  const toggleSelectFmItem = useCallback((uri: string) => {
    Haptics.light();
    setSelectedFmUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  const handleBatchDeleteFm = async () => {
    if (selectedFmUris.size === 0) return;
    showAlert(
      'Delete Selected Items?',
      `Permanently delete ${selectedFmUris.size} selected file(s)?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setAlertConfig(c => ({ ...c, visible: false })) },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setAlertConfig(c => ({ ...c, visible: false }));
            Haptics.medium();
            for (const uri of Array.from(selectedFmUris)) {
              const item = fmItems.find(f => f.uri === uri);
              await deleteStorageItem(uri, item?.id);
            }
            setFmItems(prev => prev.filter(f => !selectedFmUris.has(f.uri)));
            setSelectedFmUris(new Set());
            Haptics.success();
            loadFmFolders();
          },
        },
      ],
      { icon: 'trash', iconColor: COLORS.danger }
    );
  };

  const handleBatchShareFm = async () => {
    if (selectedFmUris.size === 0) return;
    const firstUri = Array.from(selectedFmUris)[0];
    const item = fmItems.find(f => f.uri === firstUri);
    if (item) {
      await shareItem(item.uri, item.mimeType);
    }
  };

  // Filter and sort items
  const filteredFmItems = useMemo(() => {
    let list = [...fmItems];
    if (fmSearch.trim()) {
      const q = fmSearch.trim().toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    if (fmFilterType !== 'all') {
      list = list.filter(f => {
        if (f.isDirectory) return false;
        const ext = (f.extension || f.name.split('.').pop() || '').toLowerCase().replace(/^\./, '');
        const isPdf = ext === 'pdf' || f.name.toLowerCase().endsWith('.pdf') || f.mimeType === 'application/pdf';
        const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext) || f.mimeType?.startsWith('image/');
        const isDoc = ['doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext) || f.mimeType?.includes('document') || f.mimeType?.includes('text');

        if (fmFilterType === 'pdf') return isPdf;
        if (fmFilterType === 'image') return isImg;
        if (fmFilterType === 'doc') return isDoc;
        return true;
      });
    }
    list.sort((a, b) => {
      // Directories always on top
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (fmSort === 'name') return a.name.localeCompare(b.name);
      if (fmSort === 'size') return b.size - a.size;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    });
    return list;
  }, [fmItems, fmSearch, fmFilterType, fmSort]);

  // Storage Gauge calculations
  const totalDev = storageData?.totalDeviceBytes || 1;
  const usedDev = storageData?.usedDeviceBytes || 0;
  const freeDev = storageData?.freeDeviceBytes || 0;
  const usedPct = Math.min(100, Math.round((usedDev / totalDev) * 100));

  const reclaimableEst = (cacheStats?.totalBytes || 0) +
    (duplicateResult?.wastedSpace || 0) +
    (similarResult?.wastedBytes || 0);

  // Render Overview Tab
  const renderOverview = () => (
    <Animated.View entering={FadeIn.duration(200)}>
      {/* Storage Gauge Card */}
      <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
        <View style={styles.gaugeHeader}>
          <Text style={[styles.cardTitle, { color: COLORS.text }]}>Device Storage</Text>
          <Text style={[styles.gaugePct, { color: COLORS.accent }]}>{usedPct}% Used</Text>
        </View>

        {/* Visual Bar */}
        <View style={[styles.progressBarBg, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={[styles.progressBarFill, { width: `${usedPct}%`, backgroundColor: COLORS.accent }]} />
        </View>

        <View style={styles.gaugeStatsRow}>
          <View style={styles.gaugeStatItem}>
            <Text style={[styles.gaugeStatLabel, { color: COLORS.muted }]}>Used Space</Text>
            <Text style={[styles.gaugeStatVal, { color: COLORS.text }]}>{formatStorageSize(usedDev)}</Text>
          </View>
          <View style={styles.gaugeStatItem}>
            <Text style={[styles.gaugeStatLabel, { color: COLORS.muted }]}>Free Space</Text>
            <Text style={[styles.gaugeStatVal, { color: COLORS.success }]}>{formatStorageSize(freeDev)}</Text>
          </View>
          <View style={styles.gaugeStatItem}>
            <Text style={[styles.gaugeStatLabel, { color: COLORS.muted }]}>Total</Text>
            <Text style={[styles.gaugeStatVal, { color: COLORS.text }]}>{formatStorageSize(totalDev)}</Text>
          </View>
        </View>
      </View>

      {/* Pro Optimizer Reclaimable Banner */}
      {reclaimableEst > 0 && (
        <View style={[styles.optimizerBanner, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '35' }]}>
          <View style={[styles.optimizerBannerIcon, { backgroundColor: COLORS.accent + '25' }]}>
            <Ionicons name="sparkles" size={20} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optimizerBannerTitle, { color: COLORS.text }]}>
              Reclaim ~{formatStorageSize(reclaimableEst)}
            </Text>
            <Text style={[styles.optimizerBannerSub, { color: COLORS.muted }]}>
              Safe temporary cache, duplicate byte clones & redundant burst photos detected.
            </Text>
          </View>
        </View>
      )}

      {/* Quick Clean Recommendations */}
      <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Quick Clean Recommendations</Text>

      {/* Junk Cache Card */}
      <TouchableOpacity
        style={[styles.recCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        onPress={() => setActiveTab('cache')}
      >
        <View style={[styles.recIconWrap, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
          <Ionicons name="trash-bin" size={24} color="#8B5CF6" />
        </View>
        <View style={styles.recInfo}>
          <Text style={[styles.recTitle, { color: COLORS.text }]}>Junk & Temp Cache</Text>
          <Text style={[styles.recSub, { color: COLORS.muted }]}>
            {cacheStats?.totalBytes ? `${formatStorageSize(cacheStats.totalBytes)} safe to clean` : 'Clean temporary files'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
      </TouchableOpacity>

      {/* Exact Duplicates Card */}
      <TouchableOpacity
        style={[styles.recCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        onPress={() => {
          setActiveTab('duplicates');
          if (!duplicateResult && !isScanningDuplicates) handleScanDuplicates();
        }}
      >
        <View style={[styles.recIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
          <Ionicons name="copy" size={24} color="#EF4444" />
        </View>
        <View style={styles.recInfo}>
          <Text style={[styles.recTitle, { color: COLORS.text }]}>Exact File Duplicates</Text>
          <Text style={[styles.recSub, { color: COLORS.muted }]}>
            {duplicateResult ? `${duplicateResult.totalDuplicates} duplicate files (${formatStorageSize(duplicateResult.wastedSpace)})` : 'Find identical byte clones'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
      </TouchableOpacity>

      {/* Same Posture / Burst Photos Card */}
      <TouchableOpacity
        style={[styles.recCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        onPress={() => {
          setActiveTab('similar');
          if (!similarResult && !isScanningSimilar) handleScanSimilar();
        }}
      >
        <View style={[styles.recIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
          <Ionicons name="images" size={24} color="#3B82F6" />
        </View>
        <View style={styles.recInfo}>
          <Text style={[styles.recTitle, { color: COLORS.text }]}>Same Posture & Burst Photos</Text>
          <Text style={[styles.recSub, { color: COLORS.muted }]}>
            {similarResult ? `${similarResult.totalSimilarImages} redundant photos (${formatStorageSize(similarResult.wastedBytes)})` : 'Find burst shots & near-identical photos'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
      </TouchableOpacity>

      {/* Semantic Meaning Duplicates Card */}
      <TouchableOpacity
        style={[styles.recCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        onPress={() => {
          setActiveTab('semantic');
          if (!semanticGroups && !isScanningSemantic) handleScanSemanticDuplicates();
        }}
      >
        <View style={[styles.recIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
          <Ionicons name="sparkles" size={24} color="#10B981" />
        </View>
        <View style={styles.recInfo}>
          <Text style={[styles.recTitle, { color: COLORS.text }]}>AI Meaning Duplicates</Text>
          <Text style={[styles.recSub, { color: COLORS.muted }]}>
            {semanticGroups ? `${semanticGroups.length} duplicate sets found` : 'Find documents with identical content (≥90% match)'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
      </TouchableOpacity>

      {/* File Manager Exploration Card */}
      <TouchableOpacity
        style={[styles.recCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        onPress={() => {
          Haptics.light();
          router.push('/file-manager');
        }}
      >
        <View style={[styles.recIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
          <Ionicons name="folder-open" size={24} color="#F59E0B" />
        </View>
        <View style={styles.recInfo}>
          <Text style={[styles.recTitle, { color: COLORS.text }]}>Browse Files & Folders</Text>
          <Text style={[styles.recSub, { color: COLORS.muted }]}>
            Direct folder explorer: Downloads, Camera, Documents & App Storage
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
      </TouchableOpacity>

      {/* Indexed Files Category Breakdown */}
      <Text style={[styles.sectionTitle, { color: COLORS.text, marginTop: 24 }]}>Indexed Documents Breakdown</Text>
      <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
        {storageData?.categories.map((cat, idx) => (
          <View
            key={cat.key}
            style={[
              styles.categoryRow,
              idx < storageData.categories.length - 1 && { borderBottomWidth: 1, borderBottomColor: COLORS.border },
            ]}
          >
            <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}20` }]}>
              <Ionicons name={cat.icon as any} size={18} color={cat.color} />
            </View>
            <View style={styles.catInfo}>
              <Text style={[styles.catLabel, { color: COLORS.text }]}>{cat.label}</Text>
              <Text style={[styles.catCount, { color: COLORS.muted }]}>{cat.fileCount} files</Text>
            </View>
            <Text style={[styles.catBytes, { color: COLORS.text }]}>{formatStorageSize(cat.totalBytes)}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );

  // Render Junk Cache Tab
  const renderCache = () => (
    <Animated.View entering={FadeIn.duration(200)}>
      <View style={[styles.cleanHeroCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
        <Ionicons name="trash-bin-outline" size={48} color={COLORS.accent} />
        <Text style={[styles.heroVal, { color: COLORS.text }]}>
          {formatStorageSize(cacheStats?.totalBytes || 0)}
        </Text>
        <Text style={[styles.heroSub, { color: COLORS.muted }]}>
          Safe temporary files, PDF page render cache, and camera scratch drafts.
        </Text>

        <NativeScaleButton
          onPress={handleCleanCache}
          disabled={!cacheStats?.totalBytes || cacheStats.totalBytes === 0 || isCleaning}
          style={[
            styles.primaryActionBtn,
            { backgroundColor: COLORS.accent },
            (!cacheStats?.totalBytes || cacheStats.totalBytes === 0) && { opacity: 0.5 },
          ]}
          hapticType="medium"
        >
          {isCleaning ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="flash-outline" size={18} color="#FFF" />
              <Text style={styles.primaryActionBtnText}>Clean Cache Now</Text>
            </>
          )}
        </NativeScaleButton>
      </View>

      {cacheStats && cacheStats.items.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Temporary Cache Files ({cacheStats.items.length})</Text>
          {cacheStats.items.slice(0, 20).map((item, idx) => (
            <View key={idx} style={[styles.cacheFileRow, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
              <Ionicons name="document-outline" size={16} color={COLORS.muted} />
              <Text style={[styles.cacheFileName, { color: COLORS.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.cacheFileSize, { color: COLORS.muted }]}>
                {formatStorageSize(item.size)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );

  // Render Duplicates Tab (Virtualized with FlatList)
  const renderDuplicates = () => {
    if (isScanningDuplicates) {
      return (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.loadingText, { color: COLORS.muted }]}>
            Scanning system albums and indexed files for exact byte clones...
          </Text>
          {dupProgress && (
            <Text style={[styles.progressCount, { color: COLORS.accent }]}>
              {dupProgress.current} / {dupProgress.total}
            </Text>
          )}
        </View>
      );
    }

    if (!duplicateResult || duplicateResult.groups.length === 0) {
      return (
        <View style={styles.emptyStateWrap}>
          <Ionicons name="checkmark-circle-outline" size={54} color={COLORS.success} />
          <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Duplicate Files Found</Text>
          <Text style={[styles.emptySub, { color: COLORS.muted }]}>
            All documents and scanned media on your device are unique.
          </Text>
          <NativeScaleButton onPress={handleScanDuplicates} style={[styles.scanActionBtn, { backgroundColor: COLORS.accent }]} hapticType="medium">
            <Ionicons name="scan-outline" size={18} color="#FFF" />
            <Text style={styles.scanActionBtnText}>Scan Albums & Files</Text>
          </NativeScaleButton>
        </View>
      );
    }

    return (
      <FlatList
        data={duplicateResult.groups}
        keyExtractor={item => item.hash}
        renderItem={({ item }) => (
          <DuplicateGroupCard group={item} onToggleDuplicate={toggleDuplicateSelection} colors={COLORS} />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 2 }]}>
                  Found {duplicateResult.groups.length} Duplicate Groups
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.muted }}>
                  Oldest original preserved · Clones marked for cleanup
                </Text>
              </View>
              <NativeScaleButton onPress={handleScanDuplicates} style={styles.rescanBtn} hapticType="light">
                <Ionicons name="refresh" size={14} color={COLORS.accent} />
                <Text style={[styles.rescanText, { color: COLORS.accent }]}>Rescan</Text>
              </NativeScaleButton>
            </View>

            {/* Select All / Deselect All Toolbar */}
            <View style={styles.selectionToolbar}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllDuplicates(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done-circle-outline" size={15} color={COLORS.accent} />
                <Text style={[styles.toolBtnText, { color: COLORS.text }]}>Select All Duplicates</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllDuplicates(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={15} color={COLORS.muted} />
                <Text style={[styles.toolBtnText, { color: COLORS.muted }]}>Deselect All</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />
    );
  };

  // Render Threshold Control Card
  const renderThresholdCard = () => (
    <View style={[styles.thresholdCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      <View style={styles.thresholdHeaderRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="options-outline" size={16} color={COLORS.accent} />
          <Text style={[styles.thresholdLabel, { color: COLORS.text }]}>Posture Similarity Accuracy</Text>
        </View>
        <View style={[styles.accuracyBadge, { backgroundColor: thresholdLevel === 'strict' ? '#10B98120' : '#3B82F620' }]}>
          <Text style={[styles.accuracyBadgeText, { color: thresholdLevel === 'strict' ? '#10B981' : '#3B82F6' }]}>
            {thresholdLevel === 'strict' ? '🎯 99% Strict' : thresholdLevel === 'balanced' ? '⚖️ 95% Balanced' : '🔍 90% Relaxed'}
          </Text>
        </View>
      </View>

      <View style={styles.thresholdPillRow}>
        <TouchableOpacity
          style={[
            styles.thresholdPill,
            { borderColor: COLORS.border },
            thresholdLevel === 'strict' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
          ]}
          onPress={() => handleThresholdChange('strict')}
          activeOpacity={0.8}
        >
          <Text style={[styles.thresholdPillText, { color: thresholdLevel === 'strict' ? '#FFF' : COLORS.text }]}>
            🎯 Strict (99%)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.thresholdPill,
            { borderColor: COLORS.border },
            thresholdLevel === 'balanced' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
          ]}
          onPress={() => handleThresholdChange('balanced')}
          activeOpacity={0.8}
        >
          <Text style={[styles.thresholdPillText, { color: thresholdLevel === 'balanced' ? '#FFF' : COLORS.text }]}>
            ⚖️ Balanced (95%)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.thresholdPill,
            { borderColor: COLORS.border },
            thresholdLevel === 'relaxed' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
          ]}
          onPress={() => handleThresholdChange('relaxed')}
          activeOpacity={0.8}
        >
          <Text style={[styles.thresholdPillText, { color: thresholdLevel === 'relaxed' ? '#FFF' : COLORS.text }]}>
            🔍 Relaxed (90%)
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.thresholdDesc, { color: COLORS.muted }]}>
        {thresholdLevel === 'strict'
          ? '🎯 99% Accuracy: Same exact posture, face angle & zoom within 15 min. No false positives.'
          : thresholdLevel === 'balanced'
          ? '⚖️ 95% Accuracy: Groups similar takes, angles, and burst shots within 20 min.'
          : '🔍 90% Accuracy: Wider scene & burst clustering within 30 min.'}
      </Text>
    </View>
  );

  // Render Similar Photos Tab (Virtualized with FlatList)
  const renderSimilar = () => {
    if (isScanningSimilar) {
      return (
        <View style={{ flex: 1, padding: 16 }}>
          {renderThresholdCard()}
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={[styles.loadingText, { color: COLORS.muted }]}>
              Analyzing albums with downsampled perceptual dHash & sharpness...
            </Text>
            {similarProgress && (
              <View style={{ width: '80%', alignItems: 'center', marginTop: 12 }}>
                <Text style={[styles.progressCount, { color: COLORS.accent, marginBottom: 8 }]}>
                  {similarProgress.current} / {similarProgress.total} ({Math.round((similarProgress.current / Math.max(similarProgress.total, 1)) * 100)}%)
                </Text>
                <View style={{ width: '100%', height: 6, backgroundColor: isDark ? '#333' : '#E0E0E0', borderRadius: 3, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.min(100, Math.round((similarProgress.current / Math.max(similarProgress.total, 1)) * 100))}%`,
                      height: '100%',
                      backgroundColor: COLORS.accent,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            )}
            <NativeScaleButton
              onPress={handleCancelScanSimilar}
              style={{
                marginTop: 20,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: isDark ? '#3A2020' : '#FFEBEE',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
              hapticType="light"
            >
              <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Cancel Scan</Text>
            </NativeScaleButton>
          </View>
        </View>
      );
    }

    if (!similarResult || similarResult.clusters.length === 0) {
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {renderThresholdCard()}
          <View style={styles.emptyStateWrap}>
            <Ionicons name="camera-outline" size={54} color={COLORS.success} />
            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Redundant Photos Found</Text>
            <Text style={[styles.emptySub, { color: COLORS.muted }]}>
              No repeat takes or burst photos with the same posture were detected under {thresholdLevel} mode.
            </Text>
            <NativeScaleButton onPress={() => handleScanSimilar()} style={[styles.scanActionBtn, { backgroundColor: COLORS.accent }]} hapticType="medium">
              <Ionicons name="scan-outline" size={18} color="#FFF" />
              <Text style={styles.scanActionBtnText}>Scan Phone Gallery & Albums</Text>
            </NativeScaleButton>
          </View>
        </ScrollView>
      );
    }

    return (
      <FlatList
        data={similarResult.clusters}
        keyExtractor={item => item.clusterId}
        renderItem={({ item }) => (
          <ClusterCard cluster={item} onToggleImage={toggleSimilarSelection} colors={COLORS} />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            {renderThresholdCard()}
            <View style={[styles.sectionHeaderRow, { marginTop: 12 }]}>
              <View>
                <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 2 }]}>
                  {similarResult.clusters.length} Same Posture Clusters
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.muted }}>
                  Best shot preserved · Redundant copies marked
                </Text>
              </View>
              <NativeScaleButton onPress={() => handleScanSimilar()} style={styles.rescanBtn} hapticType="light">
                <Ionicons name="refresh" size={14} color={COLORS.accent} />
                <Text style={[styles.rescanText, { color: COLORS.accent }]}>Rescan</Text>
              </NativeScaleButton>
            </View>

            {/* Select All / Deselect All Toolbar */}
            <View style={styles.selectionToolbar}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllSimilar(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done-circle-outline" size={15} color={COLORS.accent} />
                <Text style={[styles.toolBtnText, { color: COLORS.text }]}>Select All Redundant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllSimilar(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={15} color={COLORS.muted} />
                <Text style={[styles.toolBtnText, { color: COLORS.muted }]}>Deselect All</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />
    );
  };

  // Render Large Files Tab (Virtualized with FlatList)
  const renderLarge = () => {
    if (!storageData || storageData.largeFiles.length === 0) {
      return (
        <View style={styles.emptyStateWrap}>
          <Ionicons name="checkmark-circle-outline" size={54} color={COLORS.success} />
          <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Large Files Found</Text>
          <Text style={[styles.emptySub, { color: COLORS.muted }]}>
            No files larger than 25 MB were found on your device.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={storageData.largeFiles}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <LargeFileCard
            file={item}
            isSelected={selectedLargeFiles.has(item.id)}
            onToggle={toggleLargeFileSelection}
            colors={COLORS}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 0 }]}>
                Files larger than 25 MB ({storageData.largeFiles.length})
              </Text>
            </View>

            {/* Select All / Deselect All Toolbar */}
            <View style={styles.selectionToolbar}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllLarge(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done-circle-outline" size={15} color={COLORS.accent} />
                <Text style={[styles.toolBtnText, { color: COLORS.text }]}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllLarge(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={15} color={COLORS.muted} />
                <Text style={[styles.toolBtnText, { color: COLORS.muted }]}>Deselect All</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />
    );
  };

  // Render Semantic Meaning Duplicates Tab
  const renderSemanticDuplicates = () => {
    if (isScanningSemantic) {
      return (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={[styles.loadingText, { color: COLORS.muted }]}>
            Analyzing document contents with on-device MiniLM embeddings...
          </Text>
        </View>
      );
    }

    if (!semanticGroups || semanticGroups.length === 0) {
      return (
        <View style={styles.emptyStateWrap}>
          <Ionicons name="sparkles-outline" size={54} color={COLORS.success} />
          <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Meaning Duplicates Found</Text>
          <Text style={[styles.emptySub, { color: COLORS.muted }]}>
            All documents have unique contents. No redundant text or bill copies found.
          </Text>
          <NativeScaleButton
            onPress={handleScanSemanticDuplicates}
            style={[styles.scanActionBtn, { backgroundColor: '#10B981' }]}
            hapticType="medium"
          >
            <Ionicons name="sparkles" size={18} color="#FFF" />
            <Text style={styles.scanActionBtnText}>Scan Document Contents</Text>
          </NativeScaleButton>
        </View>
      );
    }

    return (
      <FlatList
        data={semanticGroups}
        keyExtractor={item => String(item.primary.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 2 }]}>
                  Found {semanticGroups.length} Meaning Duplicate Sets
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.muted }}>
                  Original retained · Clones with ≥90% text meaning marked for cleanup
                </Text>
              </View>
              <NativeScaleButton onPress={handleScanSemanticDuplicates} style={styles.rescanBtn} hapticType="light">
                <Ionicons name="refresh" size={14} color={COLORS.accent} />
                <Text style={[styles.rescanText, { color: COLORS.accent }]}>Rescan</Text>
              </NativeScaleButton>
            </View>

            {/* Select All / None Toolbar */}
            <View style={styles.selectionToolbar}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllSemantic(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done-circle-outline" size={15} color={COLORS.accent} />
                <Text style={[styles.toolBtnText, { color: COLORS.text }]}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => handleSelectAllSemantic(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={15} color={COLORS.muted} />
                <Text style={[styles.toolBtnText, { color: COLORS.muted }]}>None</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition} style={[styles.groupCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            {/* Primary Original */}
            <View style={styles.groupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={[styles.groupSizeBadge, { color: '#10B981' }]}>
                  Original Preserved
                </Text>
              </View>
              <Text style={[styles.groupCountBadge, { color: COLORS.muted }]}>
                {item.duplicates.length} duplicate copy(ies)
              </Text>
            </View>

            <View style={[styles.duplicateItemRow, { borderTopColor: COLORS.border }]}>
              <FileThumbnail uri={item.primary.uri} name={item.primary.name} style={styles.itemThumb} />
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: COLORS.text }]} numberOfLines={1}>
                  {item.primary.name}
                </Text>
                <Text style={[styles.itemDate, { color: COLORS.muted }]}>
                  {item.primary.size ? formatStorageSize(item.primary.size) : 'Original'}
                </Text>
              </View>
              <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>ORIGINAL</Text>
              </View>
            </View>

            {/* Duplicate Copies */}
            {item.duplicates.map(dup => {
              const isSelected = selectedSemanticIds.has(Number(dup.id));
              const matchPercent = Math.round(dup.similarity * 100);
              return (
                <TouchableOpacity
                  key={dup.id}
                  style={[styles.duplicateItemRow, { borderTopColor: COLORS.border }]}
                  onPress={() => toggleSemanticSelection(Number(dup.id))}
                  activeOpacity={0.7}
                >
                  <FileThumbnail uri={dup.uri} name={dup.name} style={styles.itemThumb} />
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: COLORS.text }]} numberOfLines={1}>
                      {dup.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={[styles.itemDate, { color: COLORS.accent }]}>
                        {matchPercent}% Meaning Match
                      </Text>
                      {dup.size ? (
                        <Text style={[styles.itemDate, { color: COLORS.muted }]}>
                          · {formatStorageSize(dup.size)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.checkboxWrap, isSelected && { backgroundColor: COLORS.danger, borderColor: COLORS.danger }]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
      />
    );
  };

  // Render File Manager Tab
  const renderFileManager = () => {
    if (isFmLoading && fmFolders.length === 0 && !fmCurrentFolder) {
      return (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.loadingText, { color: COLORS.muted }]}>Reading folder hierarchy...</Text>
        </View>
      );
    }

    // 1. ROOT VIEW: Device & App Folders
    if (!fmCurrentFolder) {
      return (
        <ScrollView style={styles.scrollBody} contentContainerStyle={{ paddingBottom: 110 }}>
          {/* Action Header Card */}
          <View style={[styles.fmHeaderCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={styles.fmHeaderTopRow}>
              <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <Text style={[styles.fmHeaderTitle, { color: COLORS.text }]} numberOfLines={1}>Device & App Folders</Text>
                <Text style={[styles.fmHeaderSub, { color: COLORS.muted }]} numberOfLines={1}>
                  {fmFolders.length} indexed directories available
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.fmHeaderRefreshBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                onPress={loadFmFolders}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="refresh-outline" size={16} color={COLORS.accent} />
              </TouchableOpacity>
            </View>

            {/* Quick Action Tools Row - 2 balanced buttons */}
            <View style={styles.fmHeaderActionRow}>
              <TouchableOpacity
                style={[styles.fmQuickToolBtn, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '30' }]}
                onPress={() => {
                  setNewFolderName('');
                  setNewFolderModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="folder-outline" size={15} color={COLORS.accent} />
                <Text style={[styles.fmQuickToolText, { color: COLORS.accent }]} numberOfLines={1}>
                  + Folder
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fmQuickToolBtn, { backgroundColor: '#6366F115', borderColor: '#6366F130' }]}
                onPress={() => {
                  setLanShareItems([]);
                  setLanShareModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="wifi-outline" size={15} color="#6366F1" />
                <Text style={[styles.fmQuickToolText, { color: '#6366F1' }]} numberOfLines={1}>
                  WiFi / FTP
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Categories Bar */}
          <View style={{ marginBottom: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
              <TouchableOpacity
                style={[styles.fmChip, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                onPress={() => {
                  loadFmFolders();
                }}
              >
                <Ionicons name="folder-outline" size={14} color="#FFF" style={{ marginRight: 4 }} />
                <Text style={[styles.fmChipText, { color: '#FFF', fontWeight: '700' }]}>All Folders</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fmChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => {
                  openFmFolder({
                    name: 'PDF Documents',
                    path: 'PDF Documents',
                    fileCount: 0,
                    totalBytes: 0,
                    iconName: 'document-text',
                  });
                }}
              >
                <Ionicons name="document-text-outline" size={14} color="#EC4899" style={{ marginRight: 4 }} />
                <Text style={[styles.fmChipText, { color: COLORS.text, fontWeight: '700' }]}>📄 All PDFs</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fmChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => {
                  const camFolder = fmFolders.find(f => f.name.includes('Camera') || f.name.includes('Photos') || f.name.includes('Pictures'));
                  if (camFolder) openFmFolder(camFolder);
                }}
              >
                <Ionicons name="images-outline" size={14} color="#3B82F6" style={{ marginRight: 4 }} />
                <Text style={[styles.fmChipText, { color: COLORS.text }]}>🖼️ Photos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fmChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => {
                  const docFolder = fmFolders.find(f => f.name === 'Documents' || f.name === 'App Documents');
                  if (docFolder) openFmFolder(docFolder);
                }}
              >
                <Ionicons name="reader-outline" size={14} color="#8B5CF6" style={{ marginRight: 4 }} />
                <Text style={[styles.fmChipText, { color: COLORS.text }]}>📝 Documents</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Folder Grid */}
          <View style={styles.fmGrid}>
            {fmFolders.map((folder) => {
              let iconColor = COLORS.accent;
              let iconBg = COLORS.accent + '20';
              if (folder.isSdCard || folder.name.startsWith('SD Card')) {
                iconColor = '#10B981';
                iconBg = 'rgba(16, 185, 129, 0.15)';
              } else if (folder.name.includes('Downloads')) {
                iconColor = '#3B82F6';
                iconBg = 'rgba(59, 130, 246, 0.15)';
              } else if (folder.name.includes('Camera')) {
                iconColor = '#F59E0B';
                iconBg = 'rgba(245, 158, 11, 0.15)';
              } else if (folder.name.includes('WhatsApp')) {
                iconColor = '#10B981';
                iconBg = 'rgba(16, 185, 129, 0.15)';
              } else if (folder.name.includes('Documents')) {
                iconColor = '#8B5CF6';
                iconBg = 'rgba(139, 92, 246, 0.15)';
              } else if (folder.name.includes('App Documents')) {
                iconColor = '#EC4899';
                iconBg = 'rgba(236, 72, 153, 0.15)';
              }

              return (
                <TouchableOpacity
                  key={folder.name}
                  style={[styles.fmFolderCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                  onPress={() => openFmFolder(folder)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.fmFolderIconWrap, { backgroundColor: iconBg }]}>
                    <Ionicons name={(folder.iconName as any) || 'folder'} size={28} color={iconColor} />
                  </View>
                  <View style={styles.fmFolderInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.fmFolderName, { color: COLORS.text, flexShrink: 1 }]} numberOfLines={1}>
                        {folder.name}
                      </Text>
                      {folder.isSdCard && (
                        <View style={{ backgroundColor: '#10B98125', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: '#10B981', fontSize: 9, fontWeight: '800' }}>SD CARD</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.fmFolderStats, { color: COLORS.muted }]}>
                      {folder.fileCount > 0 ? `${folder.fileCount} files · ` : ''}{formatStorageSize(folder.totalBytes)}{folder.freeBytes && folder.freeBytes > 0 ? ` · ${formatStorageSize(folder.freeBytes)} free` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      );
    }

    // 2. FOLDER DETAIL VIEW: Files & Subdirectories
    return (
      <View style={{ flex: 1 }}>
        {/* Breadcrumb Path Bar */}
        <View style={[styles.fmBreadcrumbsBar, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
          <TouchableOpacity
            style={styles.fmBreadcrumbBackBtn}
            onPress={() => navigateFmBreadcrumb(Math.max(0, fmBreadcrumbs.length - 2))}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={18} color={COLORS.text} />
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fmBreadcrumbsScroll}>
            {fmBreadcrumbs.map((crumb, idx) => {
              const isLast = idx === fmBreadcrumbs.length - 1;
              return (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => navigateFmBreadcrumb(idx)}
                    disabled={isLast}
                    style={[styles.fmCrumbPill, isLast && { backgroundColor: COLORS.accent + '20' }]}
                  >
                    {idx === 0 ? (
                      <Ionicons name="folder-outline" size={14} color={isLast ? COLORS.accent : COLORS.muted} style={{ marginRight: 4 }} />
                    ) : null}
                    <Text style={[styles.fmCrumbText, { color: isLast ? COLORS.accent : COLORS.muted, fontWeight: isLast ? '700' : '500' }]}>
                      {crumb.name}
                    </Text>
                  </TouchableOpacity>
                  {!isLast && (
                    <Ionicons name="chevron-forward" size={14} color={COLORS.muted} style={{ marginHorizontal: 2 }} />
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Search, Filter & Sort Bar */}
        <View style={[styles.fmToolbar, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
          {/* Search Box */}
          <View style={[styles.fmSearchBox, { backgroundColor: COLORS.bg, borderColor: COLORS.border }]}>
            <Ionicons name="search-outline" size={16} color={COLORS.muted} />
            <TextInput
              style={[styles.fmSearchInput, { color: COLORS.text }]}
              placeholder="Search files in folder..."
              placeholderTextColor={COLORS.muted}
              value={fmSearch}
              onChangeText={setFmSearch}
            />
            {fmSearch ? (
              <TouchableOpacity onPress={() => setFmSearch('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Chips & Sort Selector Row */}
          <View style={styles.fmFilterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
              {(['all', 'pdf', 'image', 'doc'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.fmChip,
                    { backgroundColor: fmFilterType === type ? COLORS.accent : COLORS.bg, borderColor: fmFilterType === type ? COLORS.accent : COLORS.border }
                  ]}
                  onPress={() => setFmFilterType(type)}
                >
                  <Text style={[styles.fmChipText, { color: fmFilterType === type ? '#FFF' : COLORS.muted }]}>
                    {type === 'all' ? 'All' : type === 'pdf' ? 'PDFs' : type === 'image' ? 'Images' : 'Docs'}
                  </Text>
                </TouchableOpacity>
              ))}

              <View style={{ width: 1, height: 16, backgroundColor: COLORS.border, marginHorizontal: 4 }} />

              {/* Sort pills */}
              <TouchableOpacity
                style={[styles.fmSortPill, { borderColor: COLORS.border }]}
                onPress={() => {
                  if (fmSort === 'date') setFmSort('name');
                  else if (fmSort === 'name') setFmSort('size');
                  else setFmSort('date');
                }}
              >
                <Ionicons name="swap-vertical" size={13} color={COLORS.accent} />
                <Text style={[styles.fmSortText, { color: COLORS.accent }]}>
                  {fmSort === 'date' ? 'Date' : fmSort === 'name' ? 'Name' : 'Size'}
                </Text>
              </TouchableOpacity>

              {/* New Folder Button inside folder */}
              <TouchableOpacity
                style={[styles.fmSortPill, { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '15' }]}
                onPress={() => {
                  setNewFolderName('');
                  setNewFolderModalVisible(true);
                }}
              >
                <Ionicons name="add" size={14} color={COLORS.accent} />
                <Text style={[styles.fmSortText, { color: COLORS.accent }]}>Folder</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {/* File / Subdirectory List */}
        {isFmLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="small" color={COLORS.accent} />
          </View>
        ) : (
          <FlatList
            data={filteredFmItems}
            keyExtractor={item => item.uri}
            contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            ListEmptyComponent={
              <View style={styles.emptyStateWrap}>
                <Ionicons name="folder-open-outline" size={48} color={COLORS.muted} />
                <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Files Found</Text>
                <Text style={[styles.emptySub, { color: COLORS.muted }]}>
                  {fmSearch ? 'No files match your search query.' : 'This folder is currently empty.'}
                </Text>
              </View>
            }
            ListHeaderComponent={
              filteredFmItems.length > 0 ? (
                <View style={styles.fmListHeader}>
                  <Text style={[styles.fmListHeaderCount, { color: COLORS.muted }]}>
                    {filteredFmItems.length} item{filteredFmItems.length === 1 ? '' : 's'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (selectedFmUris.size === filteredFmItems.length) {
                        setSelectedFmUris(new Set());
                      } else {
                        setSelectedFmUris(new Set(filteredFmItems.map(f => f.uri)));
                      }
                    }}
                  >
                    <Text style={[styles.fmSelectAllText, { color: COLORS.accent }]}>
                      {selectedFmUris.size === filteredFmItems.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isSelected = selectedFmUris.has(item.uri);
              if (item.isDirectory) {
                return (
                  <TouchableOpacity
                    style={[styles.fmItemRow, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                    onPress={() => handleFmOpenFile(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fmDirIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Ionicons name="folder" size={24} color="#F59E0B" />
                    </View>
                    <View style={styles.fmItemInfo}>
                      <Text style={[styles.fmItemName, { color: COLORS.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.fmItemMeta, { color: COLORS.muted }]}>
                        {item.itemCount !== undefined ? `${item.itemCount} items · ` : ''}Folder
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.fmMoreBtn}
                      onPress={() => {
                        setFmActionItem(item);
                      }}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={COLORS.muted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }

              const ext = (item.extension || '').toUpperCase();
              return (
                <TouchableOpacity
                  style={[styles.fmItemRow, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                  onPress={() => handleFmOpenFile(item)}
                  activeOpacity={0.7}
                >
                  <FileThumbnail
                    uri={item.uri}
                    name={item.name}
                    extension={item.extension}
                    style={styles.fmThumbnail}
                  />
                  <View style={styles.fmItemInfo}>
                    <Text style={[styles.fmItemName, { color: COLORS.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {ext ? (
                        <View style={[styles.fmExtBadge, { backgroundColor: COLORS.accent + '20' }]}>
                          <Text style={[styles.fmExtBadgeText, { color: COLORS.accent }]}>{ext}</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.fmItemMeta, { color: COLORS.muted }]}>
                        {formatStorageSize(item.size)} · {new Date(item.modified).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.fmCheckboxTouch}
                    onPress={() => toggleSelectFmItem(item.uri)}
                  >
                    <View style={[styles.checkboxWrap, isSelected && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.fmMoreBtn}
                    onPress={() => {
                      setFmActionItem(item);
                    }}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
        <NativeScaleButton
          onPress={() => router.back()}
          style={styles.backBtn}
          hapticType="light"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </NativeScaleButton>
        <View style={[styles.headerTitleWrap, { minWidth: 0, marginRight: 8, flex: 1 }]}>
          <Text style={[styles.headerTitle, { color: COLORS.text, fontSize: 16 }]} numberOfLines={1}>File Analyser & Cleaner</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {billingState?.isSubscribed ? (
              <View style={[styles.proBadge, { backgroundColor: '#10B98125', borderColor: '#10B98150', flexShrink: 0 }]}>
                <Text style={{ color: '#10B981', fontSize: 9.5, fontWeight: '800' }}>👑 PRO</Text>
              </View>
            ) : billingState?.isTrialActive ? (
              <TouchableOpacity onPress={() => setShowSubscriptionModal(true)} style={[styles.proBadge, { backgroundColor: '#F59E0B25', borderColor: '#F59E0B50', flexShrink: 0 }]}>
                <Text style={{ color: '#F59E0B', fontSize: 9.5, fontWeight: '800' }}>👑 TRIAL ({billingState.trialDaysRemaining}d)</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setShowSubscriptionModal(true)} style={[styles.proBadge, { backgroundColor: '#EF444425', borderColor: '#EF444450', flexShrink: 0 }]}>
                <Text style={{ color: '#EF4444', fontSize: 9.5, fontWeight: '800' }}>👑 UPGRADE</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.headerSub, { color: COLORS.muted, flex: 1, marginTop: 0 }]} numberOfLines={1}>100% Offline Storage Optimizer</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <NativeScaleButton
            onPress={loadInitialData}
            style={styles.refreshBtn}
            hapticType="light"
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.accent} />
          </NativeScaleButton>
          <HeaderMenuButton />
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsBar, { borderBottomColor: COLORS.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'overview' && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('overview')}
          >
            <Ionicons name="pie-chart-outline" size={16} color={activeTab === 'overview' ? COLORS.accent : COLORS.muted} />
            <Text style={[styles.tabText, { color: activeTab === 'overview' ? COLORS.accent : COLORS.muted }]}>Overview</Text>
          </TouchableOpacity>


          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'cache' && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('cache')}
          >
            <Ionicons name="trash-bin-outline" size={16} color={activeTab === 'cache' ? COLORS.accent : COLORS.muted} />
            <Text style={[styles.tabText, { color: activeTab === 'cache' ? COLORS.accent : COLORS.muted }]}>
              Junk Cache {cacheStats?.totalBytes ? `(${formatStorageSize(cacheStats.totalBytes)})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'duplicates' && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            onPress={() => {
              setActiveTab('duplicates');
              if (!duplicateResult && !isScanningDuplicates) handleScanDuplicates();
            }}
          >
            <Ionicons name="copy-outline" size={16} color={activeTab === 'duplicates' ? COLORS.accent : COLORS.muted} />
            <Text style={[styles.tabText, { color: activeTab === 'duplicates' ? COLORS.accent : COLORS.muted }]}>
              Duplicates {duplicateResult ? `(${duplicateResult.totalDuplicates})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'similar' && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            onPress={() => {
              setActiveTab('similar');
              if (!similarResult && !isScanningSimilar) handleScanSimilar();
            }}
          >
            <Ionicons name="images-outline" size={16} color={activeTab === 'similar' ? COLORS.accent : COLORS.muted} />
            <Text style={[styles.tabText, { color: activeTab === 'similar' ? COLORS.accent : COLORS.muted }]}>
              Same Posture {similarResult ? `(${similarResult.totalSimilarImages})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'semantic' && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            onPress={() => {
              setActiveTab('semantic');
              if (!semanticGroups && !isScanningSemantic) handleScanSemanticDuplicates();
            }}
          >
            <Ionicons name="sparkles-outline" size={16} color={activeTab === 'semantic' ? COLORS.accent : COLORS.muted} />
            <Text style={[styles.tabText, { color: activeTab === 'semantic' ? COLORS.accent : COLORS.muted }]}>
              Meaning Clones {semanticGroups ? `(${semanticGroups.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'large' && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('large')}
          >
            <Ionicons name="albums-outline" size={16} color={activeTab === 'large' ? COLORS.accent : COLORS.muted} />
            <Text style={[styles.tabText, { color: activeTab === 'large' ? COLORS.accent : COLORS.muted }]}>
              Large Files ({storageData?.largeFiles.length || 0})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Content Body */}
      {isAnalyzing && !storageData ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.loadingText, { color: COLORS.muted }]}>Analyzing storage structure...</Text>
        </View>
      ) : !isProActive ? (
        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.paywallContainer}>
          <View style={[styles.paywallCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={[styles.paywallIconCircle, { backgroundColor: COLORS.accent + '20' }]}>
              <Ionicons name="pie-chart" size={44} color={COLORS.accent} />
            </View>
            <Text style={[styles.paywallTitle, { color: COLORS.text }]}>FileLens Pro Cleaner</Text>
            <Text style={[styles.paywallDesc, { color: COLORS.muted }]}>
              Your 30-day free trial has expired. Activate FileLens Pro to continue using AI visual duplicate detection, burst photo removal, junk cache cleaning, and storage optimization.
            </Text>
            <View style={styles.paywallFeatureList}>
              <View style={styles.paywallFeatureRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={[styles.paywallFeatureText, { color: COLORS.text }]}>Same Posture & Burst photo grouping</Text>
              </View>
              <View style={styles.paywallFeatureRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={[styles.paywallFeatureText, { color: COLORS.text }]}>Exact duplicate SHA-256 byte clone finder</Text>
              </View>
              <View style={styles.paywallFeatureRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={[styles.paywallFeatureText, { color: COLORS.text }]}>1-tap safe junk & temp cache removal</Text>
              </View>
              <View style={styles.paywallFeatureRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={[styles.paywallFeatureText, { color: COLORS.text }]}>Large file hogs scanner & storage breakdown</Text>
              </View>
            </View>
            <NativeScaleButton
              onPress={() => setShowSubscriptionModal(true)}
              style={[styles.paywallBtn, { backgroundColor: COLORS.accent }]}
              activeScale={0.95}
              hapticType="medium"
            >
              <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.paywallBtnText}>Subscribe to Pro (₹21/mo or ₹240/yr)</Text>
            </NativeScaleButton>
          </View>
        </ScrollView>
      ) : activeTab === 'overview' ? (
        <ScrollView style={styles.scrollBody} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 100 }}>
          {renderOverview()}
        </ScrollView>
      ) : activeTab === 'cache' ? (
        <ScrollView style={styles.scrollBody} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 100 }}>
          {renderCache()}
        </ScrollView>
      ) : activeTab === 'duplicates' ? (
        renderDuplicates()
      ) : activeTab === 'similar' ? (
        renderSimilar()
      ) : activeTab === 'semantic' ? (
        renderSemanticDuplicates()
      ) : (
        renderLarge()
      )}

      {/* Floating Bottom Clean Bar */}
      {activeTab === 'duplicates' && selectedDuplicateStats.count > 0 && (
        <View style={[styles.bottomActionBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View>
            <Text style={[styles.bottomActionCount, { color: COLORS.text }]}>
              {selectedDuplicateStats.count} Duplicates Selected
            </Text>
            <Text style={[styles.bottomActionFreed, { color: COLORS.accent }]}>
              Reclaim {formatStorageSize(selectedDuplicateStats.bytes)}
            </Text>
          </View>

          <NativeScaleButton
            onPress={handleDeleteDuplicates}
            style={[styles.bottomActionBtn, { backgroundColor: COLORS.danger }]}
            hapticType="medium"
          >
            <Ionicons name="trash-outline" size={18} color="#FFF" />
            <Text style={styles.bottomActionBtnText}>Clean Selected</Text>
          </NativeScaleButton>
        </View>
      )}

      {activeTab === 'similar' && selectedSimilarStats.count > 0 && (
        <View style={[styles.bottomActionBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View>
            <Text style={[styles.bottomActionCount, { color: COLORS.text }]}>
              {selectedSimilarStats.count} Photos Selected
            </Text>
            <Text style={[styles.bottomActionFreed, { color: COLORS.accent }]}>
              Reclaim {formatStorageSize(selectedSimilarStats.bytes)}
            </Text>
          </View>

          <NativeScaleButton
            onPress={handleDeleteSimilar}
            style={[styles.bottomActionBtn, { backgroundColor: COLORS.danger }]}
            hapticType="medium"
          >
            <Ionicons name="trash-outline" size={18} color="#FFF" />
            <Text style={styles.bottomActionBtnText}>Clean Redundant</Text>
          </NativeScaleButton>
        </View>
      )}

      {activeTab === 'large' && selectedLargeStats.count > 0 && (
        <View style={[styles.bottomActionBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View>
            <Text style={[styles.bottomActionCount, { color: COLORS.text }]}>
              {selectedLargeStats.count} Files Selected
            </Text>
            <Text style={[styles.bottomActionFreed, { color: COLORS.danger }]}>
              Free {formatStorageSize(selectedLargeStats.bytes)}
            </Text>
          </View>

          <NativeScaleButton
            onPress={handleDeleteLargeFiles}
            style={[styles.bottomActionBtn, { backgroundColor: COLORS.danger }]}
            hapticType="medium"
          >
            <Ionicons name="trash-outline" size={18} color="#FFF" />
            <Text style={styles.bottomActionBtnText}>Delete Files</Text>
          </NativeScaleButton>
        </View>
      )}

      {activeTab === 'semantic' && selectedSemanticStats.count > 0 && (
        <View style={[styles.bottomActionBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View>
            <Text style={[styles.bottomActionCount, { color: COLORS.text }]}>
              {selectedSemanticStats.count} Copies Selected
            </Text>
            <Text style={[styles.bottomActionFreed, { color: '#10B981' }]}>
              Reclaim ~{formatStorageSize(selectedSemanticStats.bytes)}
            </Text>
          </View>

          <NativeScaleButton
            onPress={handleDeleteSemanticDuplicates}
            style={[styles.bottomActionBtn, { backgroundColor: COLORS.danger }]}
            hapticType="medium"
          >
            <Ionicons name="trash-outline" size={18} color="#FFF" />
            <Text style={styles.bottomActionBtnText}>Clean Meaning Copies</Text>
          </NativeScaleButton>
        </View>
      )}



      {/* File Action Sheet Modal */}
      <Modal
        visible={!!fmActionItem && !renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFmActionItem(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFmActionItem(null)}>
          <View style={[styles.actionSheetContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={styles.actionSheetHeader}>
              <Text style={[styles.actionSheetTitle, { color: COLORS.text }]} numberOfLines={1}>
                {fmActionItem?.name}
              </Text>
              <Text style={[styles.actionSheetSub, { color: COLORS.muted }]}>
                {fmActionItem?.isDirectory ? 'Folder' : `${formatStorageSize(fmActionItem?.size || 0)}`}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                const it = fmActionItem;
                setFmActionItem(null);
                if (it) handleFmOpenFile(it);
              }}
            >
              <Ionicons name="open-outline" size={20} color={COLORS.accent} />
              <Text style={[styles.actionSheetRowText, { color: COLORS.text }]}>Open in Native App</Text>
            </TouchableOpacity>

            {!fmActionItem?.isDirectory && (
              <TouchableOpacity
                style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
                onPress={() => {
                  const it = fmActionItem;
                  setFmActionItem(null);
                  if (it) handleShareOverLan(it);
                }}
              >
                <Ionicons name="wifi-outline" size={20} color="#6366F1" />
                <Text style={[styles.actionSheetRowText, { color: COLORS.text }]}>Share over WiFi / LAN</Text>
              </TouchableOpacity>
            )}

            {!fmActionItem?.isDirectory && (
              <TouchableOpacity
                style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
                onPress={() => {
                  const it = fmActionItem;
                  setFmActionItem(null);
                  if (it) handleAddToCards(it);
                }}
              >
                <Ionicons name="card-outline" size={20} color="#EC4899" />
                <Text style={[styles.actionSheetRowText, { color: COLORS.text }]}>Add to Smart Cards</Text>
              </TouchableOpacity>
            )}

            {!fmActionItem?.isDirectory && (
              <TouchableOpacity
                style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
                onPress={() => {
                  const it = fmActionItem;
                  setFmActionItem(null);
                  if (it) handleOpenScheduleBrain(it);
                }}
              >
                <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
                <Text style={[styles.actionSheetRowText, { color: COLORS.text }]}>Schedule to Second Brain</Text>
              </TouchableOpacity>
            )}

            {!fmActionItem?.isDirectory && (
              <TouchableOpacity
                style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
                onPress={() => {
                  const it = fmActionItem;
                  setFmActionItem(null);
                  if (it) handleFmShare(it);
                }}
              >
                <Ionicons name="share-social-outline" size={20} color={COLORS.accent} />
                <Text style={[styles.actionSheetRowText, { color: COLORS.text }]}>Share via ShareSheet</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                if (fmActionItem) {
                  setRenameText(fmActionItem.name);
                  setRenameModalVisible(true);
                }
              }}
            >
              <Ionicons name="pencil-outline" size={20} color={COLORS.text} />
              <Text style={[styles.actionSheetRowText, { color: COLORS.text }]}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionSheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                const it = fmActionItem;
                setFmActionItem(null);
                if (it) handleFmDeletePrompt(it);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
              <Text style={[styles.actionSheetRowText, { color: COLORS.danger }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionSheetCancelBtn, { backgroundColor: COLORS.bg, borderTopColor: COLORS.border }]}
              onPress={() => setFmActionItem(null)}
            >
              <Text style={[styles.actionSheetCancelText, { color: COLORS.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Rename Prompt Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRenameModalVisible(false)}>
          <View style={[styles.promptModalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Text style={[styles.promptModalTitle, { color: COLORS.text }]}>Rename Item</Text>
            <TextInput
              style={[styles.promptModalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.bg }]}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.promptModalButtons}>
              <TouchableOpacity
                style={[styles.promptBtn, { borderColor: COLORS.border }]}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={{ color: COLORS.muted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptBtn, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                onPress={handleFmRenameSubmit}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* New Folder Modal */}
      <Modal
        visible={newFolderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewFolderModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setNewFolderModalVisible(false)}>
          <View style={[styles.promptModalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Text style={[styles.promptModalTitle, { color: COLORS.text }]}>New Folder</Text>
            <TextInput
              style={[styles.promptModalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.bg }]}
              placeholder="Enter folder name"
              placeholderTextColor={COLORS.muted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.promptModalButtons}>
              <TouchableOpacity
                style={[styles.promptBtn, { borderColor: COLORS.border }]}
                onPress={() => setNewFolderModalVisible(false)}
              >
                <Text style={{ color: COLORS.muted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptBtn, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                onPress={handleFmCreateFolderSubmit}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Themed Alert Modal */}
      <ThemedAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        icon={alertConfig.icon}
        iconColor={alertConfig.iconColor}
        onClose={() => setAlertConfig(c => ({ ...c, visible: false }))}
      />

      {/* Subscription Modal for Pro Plan */}
      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSuccess={loadInitialData}
      />

      {/* Google Play In-App Review Modal */}
      <ReviewPromptModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        milestoneTitle="Storage Space Freed!"
        milestoneDescription="You've successfully cleaned and optimized your device storage with 100% offline privacy. Would you like to leave a quick rating on Google Play?"
      />

      {/* LAN / WiFi File Transfer Modal */}
      <LanShareModal
        visible={lanShareModalVisible}
        onClose={() => setLanShareModalVisible(false)}
        items={lanShareItems}
        colors={COLORS}
      />

      {/* Schedule to Second Brain Modal */}
      <ScheduleBrainModal
        visible={scheduleModalVisible}
        onClose={() => setScheduleModalVisible(false)}
        item={scheduleTargetItem}
        onSuccess={() => {
          showAlert('Scheduled to Brain', 'Reminder and plan successfully scheduled to your Second Brain!', undefined, {
            icon: 'calendar',
            iconColor: '#F59E0B',
          });
        }}
        colors={COLORS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsBar: {
    borderBottomWidth: 1,
  },
  tabsScroll: {
    paddingHorizontal: 12,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  scrollBody: {
    flex: 1,
    padding: 16,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 12,
  },
  progressCount: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gaugePct: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  gaugeStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gaugeStatItem: {
    alignItems: 'center',
  },
  gaugeStatLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  gaugeStatVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  optimizerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  optimizerBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optimizerBannerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  optimizerBannerSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  recIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recInfo: {
    flex: 1,
  },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  recSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  catInfo: {
    flex: 1,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  catCount: {
    fontSize: 11,
    marginTop: 1,
  },
  catBytes: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  cleanHeroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  heroVal: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 10,
  },
  heroSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
  },
  primaryActionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cacheFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  cacheFileName: {
    flex: 1,
    fontSize: 12,
    marginLeft: 8,
  },
  cacheFileSize: {
    fontSize: 11,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  rescanText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  toolBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  thresholdCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  thresholdHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  thresholdLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  accuracyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  accuracyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  thresholdPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  thresholdPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  thresholdDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  groupSizeBadge: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  groupCountBadge: {
    fontSize: 11,
  },
  duplicateItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
  },
  itemThumb: {
    width: 38,
    height: 38,
    borderRadius: 6,
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 11,
    marginTop: 2,
  },
  badgeOriginal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeOriginalText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  checkboxWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyStateWrap: {
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
  },
  scanActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  scanActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  clusterCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  clusterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clusterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clusterTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  clusterWasted: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  clusterImagesScroll: {
    gap: 10,
  },
  clusterImgBox: {
    width: 100,
    height: 120,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  clusterThumb: {
    width: '100%',
    height: '100%',
  },
  bestShotBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bestShotBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
  imgSelectCheckbox: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clusterImgSize: {
    position: 'absolute',
    bottom: 2,
    fontSize: 9.5,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  largeFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  largeFileSize: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  bottomActionCount: {
    fontSize: 13,
    fontWeight: '700',
  },
  bottomActionFreed: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  bottomActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  bottomActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  proBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  paywallContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 450,
  },
  paywallCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  paywallIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  paywallTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  paywallDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  paywallFeatureList: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  paywallFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paywallFeatureText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  paywallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 4,
  },
  paywallBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  fmHeaderCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  fmHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fmHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  fmHeaderSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  fmHeaderRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  fmHeaderActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fmQuickToolBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
  },
  fmQuickToolText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  fmSelectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  fmSelectionTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fmSelectionBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fmSelectionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  fmSelectionCountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fmSelectAllLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fmSelectionTileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fmActionTile: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 2,
  },
  fmActionTileText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  fmGrid: {
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 10,
  },
  fmFolderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  fmFolderIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fmFolderInfo: {
    flex: 1,
  },
  fmFolderName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  fmFolderStats: {
    fontSize: 12,
    marginTop: 3,
  },
  fmBreadcrumbsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  fmBreadcrumbBackBtn: {
    padding: 6,
    marginRight: 4,
  },
  fmBreadcrumbsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fmCrumbPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fmCrumbText: {
    fontSize: 13,
  },
  fmToolbar: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  fmSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  fmSearchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  fmFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fmChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  fmChipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  fmSortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  fmSortText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  fmListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  fmListHeaderCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  fmSelectAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fmItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  fmThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 10,
  },
  fmDirIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  fmItemInfo: {
    flex: 1,
  },
  fmItemName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  fmItemMeta: {
    fontSize: 11.5,
  },
  fmExtBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  fmExtBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  fmCheckboxTouch: {
    padding: 6,
  },
  fmMoreBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheetContainer: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 8,
  },
  actionSheetHeader: {
    padding: 16,
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  actionSheetSub: {
    fontSize: 12,
    marginTop: 2,
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  actionSheetRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionSheetCancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  actionSheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  promptModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    elevation: 8,
  },
  promptModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  promptModalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 18,
  },
  promptModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  promptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
});
