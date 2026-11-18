/**
 * file-manager.tsx — Dedicated, Modern, Ready-to-Use File Manager for FileLens Pro Mobile.
 *
 * Core Capabilities:
 *   1. Storage & Drive Hub: Internal Storage, SD Card, USB OTG, App Storage with visual meters.
 *   2. Dual View Modes: Compact List View & Rich 2-Column Grid View with live previews.
 *   3. Full Clipboard Engine: Copy, Cut/Move, and floating "Paste Here" bottom bar.
 *   4. Batch Multi-Select: 2-tier non-overflowing bar with Copy, Move, Share, WiFi transfer, and Delete.
 *   5. Dual PDF Viewer: Open in FileLens Pro built-in viewer or system default Android viewer.
 *   6. File Properties Inspector: Full path, exact bytes, MIME type, timestamps, and path copy.
 *   7. Advanced Sorting & Filtering: Filter chips (PDF, Images, Docs, Audio) and Asc/Desc sorting.
 *   8. Quick Categories: Direct shortcuts to PDFs, Camera Photos, Downloads, WhatsApp, and Documents.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  RefreshControl,
  AppState,
  Linking,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';

import { useThemeColors } from '../utils/theme';
import { useStore } from '../store/useStore';
import { Haptics } from '../utils/haptics';
import { formatSize, formatDate } from '../utils/format';
import { NativeScaleButton } from '../components/NativeScaleButton';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { FileThumbnail } from '../components/FileThumbnail';
import { LanShareModal } from '../components/LanShareModal';
import { ScheduleBrainModal } from '../components/ScheduleBrainModal';
import { HeaderMenuButton } from '../components/QuickNavModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageDisclosureModal } from '../components/StorageDisclosureModal';

import {
  hasAllFilesPermission,
  getIndexedFolders,
  getFilesInIndexedFolder,
  getAllPdfStorageItems,
  getDirectoryItems,
  openFileWithNativeViewer,
  shareItem,
  renameItem,
  deleteStorageItem,
  createNewFolder,
  batchCopyItems,
  batchMoveItems,
  getFileDetails,
  StorageItem,
  FolderNode,
  FileDetailInfo,
} from '../services/fileManagerService';
import { addFileToCards, batchAddFilesToCards } from '../services/fileToBrainService';
import { analyzeStorage, formatStorageSize, StorageAnalysisResult } from '../services/storageAnalyzerService';

const SCREEN_WIDTH = Dimensions.get('window').width;

type ViewMode = 'list' | 'grid';
type FilterType = 'all' | 'pdf' | 'image' | 'doc' | 'audio';
type SortField = 'date' | 'name' | 'size' | 'type';
type SortOrder = 'asc' | 'desc';

interface ClipboardState {
  items: StorageItem[];
  mode: 'copy' | 'move';
}

const AnimatedLoadingProgressBar = ({ color }: { color: string }) => {
  const translateX = useSharedValue(-SCREEN_WIDTH * 0.45);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SCREEN_WIDTH, { duration: 1100, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      -1,
      false
    );
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.topLoadingBarTrack}>
      <Animated.View
        style={[
          styles.topLoadingBarIndicator,
          { backgroundColor: color },
          animatedStyle,
        ]}
      />
    </View>
  );
};

const EnhancedScanningCard = ({
  title = 'Indexing & Reading Storage...',
  subtitle = 'Scanning folders and calculating file sizes...',
  colors,
}: {
  title?: string;
  subtitle?: string;
  colors: any;
}) => {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.35);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 850, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 850, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulseScale, pulseOpacity]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.centerLoading}>
      <View style={styles.scanningRadarWrap}>
        <Animated.View
          style={[
            styles.scanningRadarRing,
            { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
            animatedPulseStyle,
          ]}
        />
        <View style={[styles.scanningIconCircle, { backgroundColor: colors.accent + '25' }]}>
          <Ionicons name="folder-open" size={26} color={colors.accent} />
        </View>
      </View>

      <Text style={[styles.scanningTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.loadingSub, { color: colors.muted }]}>{subtitle}</Text>

      <View style={[styles.embeddedBarTrack, { backgroundColor: colors.surface2 || 'rgba(255,255,255,0.06)' }]}>
        <AnimatedLoadingProgressBar color={colors.accent} />
      </View>
    </Animated.View>
  );
};

export default function FileManagerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const COLORS = useThemeColors();

  // ----------------------------------------------------
  // Root & Navigation State
  // ----------------------------------------------------
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderNode | null>(null);
  const [subDirPath, setSubDirPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path?: string }[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [showDisclosureModal, setShowDisclosureModal] = useState<boolean>(false);

  const checkStorageAccess = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = hasAllFilesPermission();
        setHasPermission(granted);
        return granted;
      } catch (_) {
        return true;
      }
    }
    return true;
  }, []);

  const openStorageSettings = useCallback(async () => {
    try {
      await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', {
        data: 'package:com.filelenspro.app',
      });
    } catch (e) {
      try {
        await Linking.openSettings();
      } catch (_) {}
    }
  }, []);

  const handleRequestStoragePermission = useCallback(async () => {
    Haptics.medium();
    try {
      const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
      if (!accepted) {
        setShowDisclosureModal(true);
        return;
      }
      await openStorageSettings();
    } catch (e) {
      await openStorageSettings();
    }
  }, [openStorageSettings]);

  // Storage breakdown info
  const [storageResult, setStorageResult] = useState<StorageAnalysisResult | null>(null);

  // ----------------------------------------------------
  // View, Search, Filter & Sort State
  // ----------------------------------------------------
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);

  // ----------------------------------------------------
  // Selection & Clipboard State
  // ----------------------------------------------------
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  // ----------------------------------------------------
  // Modals & Action Sheet State
  // ----------------------------------------------------
  const [actionItem, setActionItem] = useState<StorageItem | null>(null);
  const [detailItem, setDetailItem] = useState<FileDetailInfo | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [lanShareModalVisible, setLanShareModalVisible] = useState(false);
  const [lanShareItems, setLanShareItems] = useState<StorageItem[]>([]);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleTargetItem, setScheduleTargetItem] = useState<StorageItem | null>(null);

  // Themed Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    buttons?: AlertButton[];
  }>({
    visible: false,
    title: '',
  });

  const showAlert = useCallback(
    (
      title: string,
      message?: string,
      buttons?: AlertButton[],
      iconProps?: { icon?: keyof typeof Ionicons.glyphMap; iconColor?: string }
    ) => {
      setAlertConfig({
        visible: true,
        title,
        message,
        buttons: buttons || [{ text: 'OK', style: 'default' }],
        icon: iconProps?.icon,
        iconColor: iconProps?.iconColor,
      });
    },
    []
  );

  // ----------------------------------------------------
  // Initial Data Loading
  // ----------------------------------------------------
  const loadRootFolders = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fList, sRes] = await Promise.all([
        getIndexedFolders(),
        analyzeStorage().catch(() => null),
      ]);
      setFolders(fList);
      if (sRes) setStorageResult(sRes);
    } catch (err) {
      console.warn('[FileManager] Failed to load root folders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStorageAccess();
    loadRootFolders();

    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        checkStorageAccess().then(granted => {
          if (granted) {
            loadRootFolders();
          }
        });
      }
    });

    return () => sub.remove();
  }, [checkStorageAccess, loadRootFolders]);

  // ----------------------------------------------------
  // Folder Navigation Handlers
  // ----------------------------------------------------
  const openFolder = useCallback(async (folder: FolderNode) => {
    Haptics.light();
    setIsLoading(true);
    setCurrentFolder(folder);
    setSubDirPath(null);
    setBreadcrumbs([{ name: 'Storage' }, { name: folder.name }]);
    setSelectedUris(new Set());
    setSearchQuery('');
    try {
      let fItems: StorageItem[] = [];
      if (folder.name === 'PDF Documents' || folder.name === 'All PDFs') {
        fItems = await getAllPdfStorageItems();
      } else if (folder.name === 'App Documents') {
        const docDir = FileSystem.documentDirectory || '';
        const [rootItems, scansItems, exportsItems] = await Promise.all([
          getDirectoryItems(docDir),
          getDirectoryItems(`${docDir}scans/`),
          getDirectoryItems(`${docDir}exports/`),
        ]);
        const seen = new Set<string>();
        fItems = [];
        for (const it of [...rootItems, ...scansItems, ...exportsItems]) {
          if (!seen.has(it.uri)) {
            seen.add(it.uri);
            fItems.push(it);
          }
        }
      } else if (folder.isPhysicalPath && folder.path && (folder.path.startsWith('/') || folder.path.startsWith('file://'))) {
        fItems = await getDirectoryItems(folder.path);
        if (fItems.length === 0) {
          fItems = await getFilesInIndexedFolder(folder.name);
        }
      } else {
        fItems = await getFilesInIndexedFolder(folder.name);
      }
      setItems(fItems);
    } catch (err) {
      console.warn('[FileManager] Error opening folder:', err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openSubDir = useCallback(async (dirItem: StorageItem) => {
    Haptics.light();
    setIsLoading(true);
    setSubDirPath(dirItem.uri);
    setBreadcrumbs(prev => [...prev, { name: dirItem.name, path: dirItem.uri }]);
    setSelectedUris(new Set());
    setSearchQuery('');
    try {
      const subItems = await getDirectoryItems(dirItem.uri);
      setItems(subItems);
    } catch (err) {
      console.warn('[FileManager] Error opening sub-directory:', err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const navigateBreadcrumb = useCallback(
    async (index: number) => {
      Haptics.light();
      if (index === 0) {
        // Back to Root drives
        setCurrentFolder(null);
        setSubDirPath(null);
        setBreadcrumbs([]);
        setItems([]);
        setSelectedUris(new Set());
        await loadRootFolders();
      } else if (index === 1 && currentFolder) {
        // Back to root of current folder
        await openFolder(currentFolder);
      } else if (index > 1) {
        const target = breadcrumbs[index];
        if (target?.path) {
          setIsLoading(true);
          setSubDirPath(target.path);
          setBreadcrumbs(prev => prev.slice(0, index + 1));
          setSelectedUris(new Set());
          try {
            const subItems = await getDirectoryItems(target.path);
            setItems(subItems);
          } catch (err) {
            console.warn('[FileManager] Error navigating breadcrumb:', err);
          } finally {
            setIsLoading(false);
          }
        }
      }
    },
    [breadcrumbs, currentFolder, loadRootFolders, openFolder]
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.light();
    try {
      if (!currentFolder) {
        await loadRootFolders();
      } else if (subDirPath) {
        const subItems = await getDirectoryItems(subDirPath);
        setItems(subItems);
      } else {
        await openFolder(currentFolder);
      }
    } catch (err) {
      console.warn('[FileManager] Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentFolder, subDirPath, loadRootFolders, openFolder]);

  // ----------------------------------------------------
  // File Action Handlers
  // ----------------------------------------------------
  const handleOpenFile = useCallback(
    async (item: StorageItem) => {
      if (item.isDirectory) {
        await openSubDir(item);
        return;
      }

      Haptics.light();
      const ext = (item.extension || item.name.split('.').pop() || '').toLowerCase();
      const isPdf = ext === 'pdf' || item.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        // Open PDF directly in FileLens Pro Document Hub
        router.push({
          pathname: '/documents',
          params: { openDocUri: item.uri, docTitle: item.name },
        });
      } else {
        await openFileWithNativeViewer(item.uri, item.mimeType, item.name);
      }
    },
    [openSubDir, router]
  );

  const handleOpenExternal = useCallback(async (item: StorageItem) => {
    Haptics.light();
    await openFileWithNativeViewer(item.uri, item.mimeType, item.name);
  }, []);

  const handleOpenInAppPdf = useCallback(
    (item: StorageItem) => {
      Haptics.light();
      router.push({
        pathname: '/documents',
        params: { openDocUri: item.uri, docTitle: item.name },
      });
    },
    [router]
  );

  const handleInspectDetails = useCallback(async (item: StorageItem) => {
    Haptics.light();
    setIsDetailLoading(true);
    try {
      const details = await getFileDetails(item);
      setDetailItem(details);
    } catch (err) {
      console.warn('[FileManager] Failed to inspect details:', err);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  const handleCopyPath = useCallback(async (pathStr: string) => {
    Haptics.medium();
    await Clipboard.setStringAsync(pathStr);
    showAlert('Path Copied', 'The file path has been copied to your clipboard.', undefined, {
      icon: 'copy-outline',
      iconColor: COLORS.accent,
    });
  }, [COLORS.accent, showAlert]);

  // ----------------------------------------------------
  // Clipboard Operations (Copy & Move / Paste)
  // ----------------------------------------------------
  const handleInitiateClipboard = useCallback((mode: 'copy' | 'move', targetItems: StorageItem[]) => {
    Haptics.medium();
    setClipboard({
      items: targetItems,
      mode,
    });
    setSelectedUris(new Set());
    setActionItem(null);
  }, []);

  const getCurrentDestinationDir = useCallback((): string | null => {
    if (subDirPath) return subDirPath;
    if (currentFolder?.path && currentFolder.path.startsWith('/')) return currentFolder.path;
    if (currentFolder?.name === 'App Documents') return FileSystem.documentDirectory || null;
    return null;
  }, [subDirPath, currentFolder]);

  const handleExecutePaste = useCallback(async () => {
    if (!clipboard || clipboard.items.length === 0) return;
    const destDir = getCurrentDestinationDir();
    if (!destDir) {
      showAlert('Cannot Paste Here', 'Please navigate into a physical folder (like App Documents or a subdirectory) to paste files.');
      return;
    }

    Haptics.medium();
    setIsPasting(true);
    try {
      const uris = clipboard.items.map(it => it.uri);
      let res: { successCount: number; failedCount: number; errors: string[] };

      if (clipboard.mode === 'copy') {
        res = await batchCopyItems(uris, destDir);
      } else {
        res = await batchMoveItems(uris, destDir);
      }

      Haptics.success();
      setClipboard(null);
      await handleRefresh();

      if (res.failedCount === 0) {
        showAlert('Success', `Successfully ${clipboard.mode === 'copy' ? 'copied' : 'moved'} ${res.successCount} item(s)!`, undefined, {
          icon: 'checkmark-circle-outline',
          iconColor: COLORS.success,
        });
      } else {
        showAlert('Completed with warnings', `Processed ${res.successCount} file(s). ${res.failedCount} file(s) could not be transferred.`);
      }
    } catch (err: any) {
      console.warn('[FileManager] Paste error:', err);
      showAlert('Paste Failed', err?.message || 'Failed to paste items.');
    } finally {
      setIsPasting(false);
    }
  }, [clipboard, getCurrentDestinationDir, handleRefresh, showAlert, COLORS.success]);

  // ----------------------------------------------------
  // Rename & Delete Handlers
  // ----------------------------------------------------
  const handleRenameConfirm = useCallback(async () => {
    if (!actionItem) return;
    const clean = renameText.trim();
    if (!clean || clean === actionItem.name) {
      setRenameModalVisible(false);
      return;
    }

    Haptics.medium();
    const res = await renameItem(actionItem.uri, clean, actionItem.isDirectory);
    setRenameModalVisible(false);

    if (res.success && res.newUri) {
      Haptics.success();
      setItems(prev =>
        prev.map(it => (it.uri === actionItem.uri ? { ...it, uri: res.newUri!, name: clean } : it))
      );
    } else {
      showAlert('Rename Failed', res.error || 'Could not rename file.');
    }
  }, [actionItem, renameText, showAlert]);

  const handleDeleteItem = useCallback((item: StorageItem) => {
    Haptics.medium();
    showAlert(
      `Delete ${item.isDirectory ? 'Folder' : 'File'}?`,
      `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.medium();
            const success = await deleteStorageItem(item.uri, item.id);
            if (success) {
              Haptics.success();
              setItems(prev => prev.filter(f => f.uri !== item.uri));
              setSelectedUris(prev => {
                const copy = new Set(prev);
                copy.delete(item.uri);
                return copy;
              });
            } else {
              showAlert('Delete Failed', 'Could not delete item. It might be read-only or in use.');
            }
          },
        },
      ],
      { icon: 'trash', iconColor: COLORS.danger }
    );
  }, [showAlert, COLORS.danger]);

  const handleBatchDelete = useCallback(() => {
    if (selectedUris.size === 0) return;
    Haptics.medium();
    showAlert(
      `Delete ${selectedUris.size} Items?`,
      `Are you sure you want to delete ${selectedUris.size} selected item(s)? This will permanently remove them from storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            Haptics.medium();
            for (const uri of Array.from(selectedUris)) {
              const item = items.find(f => f.uri === uri);
              await deleteStorageItem(uri, item?.id);
            }
            setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
            setSelectedUris(new Set());
            Haptics.success();
            loadRootFolders();
          },
        },
      ],
      { icon: 'trash', iconColor: COLORS.danger }
    );
  }, [selectedUris, showAlert, COLORS.danger, items, loadRootFolders]);

  const handleCreateFolder = useCallback(async () => {
    const parentDir = getCurrentDestinationDir() || FileSystem.documentDirectory;
    if (!parentDir) {
      showAlert('Cannot Create Folder', 'Select a directory to create a sub-folder.');
      return;
    }
    const clean = newFolderName.trim();
    if (!clean) return;

    Haptics.medium();
    const res = await createNewFolder(parentDir, clean);
    setNewFolderModalVisible(false);
    setNewFolderName('');

    if (res.success) {
      Haptics.success();
      await handleRefresh();
    } else {
      showAlert('Folder Creation Failed', res.error || 'Could not create folder.');
    }
  }, [getCurrentDestinationDir, newFolderName, handleRefresh, showAlert]);

  // ----------------------------------------------------
  // Multi-Selection Handlers
  // ----------------------------------------------------
  const toggleSelect = useCallback((uri: string) => {
    Haptics.light();
    setSelectedUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  // ----------------------------------------------------
  // Filtered & Sorted File Items
  // ----------------------------------------------------
  const filteredItems = useMemo(() => {
    let list = [...items];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }

    // Filter by type
    if (filterType !== 'all') {
      list = list.filter(f => {
        if (f.isDirectory) return false;
        const ext = (f.extension || f.name.split('.').pop() || '').toLowerCase().replace(/^\./, '');
        const mime = (f.mimeType || '').toLowerCase();

        if (filterType === 'pdf') {
          return ext === 'pdf' || f.name.toLowerCase().endsWith('.pdf') || mime === 'application/pdf';
        }
        if (filterType === 'image') {
          return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext) || mime.startsWith('image/');
        }
        if (filterType === 'doc') {
          return ['doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext) ||
            mime.includes('document') || mime.includes('text') || mime.includes('spreadsheet');
        }
        if (filterType === 'audio') {
          return ['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(ext) || mime.startsWith('audio/');
        }
        return true;
      });
    }

    // Sort items (Directories always bubble to the top)
    list.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'type') {
        comparison = (a.extension || '').localeCompare(b.extension || '');
      } else {
        // Date
        const timeA = new Date(a.modified).getTime() || 0;
        const timeB = new Date(b.modified).getTime() || 0;
        comparison = timeA - timeB;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [items, searchQuery, filterType, sortField, sortOrder]);

  // ----------------------------------------------------
  // Storage Calculations (for Gauge)
  // ----------------------------------------------------
  const totalDev = storageResult?.totalDeviceBytes || 1;
  const usedDev = storageResult?.usedDeviceBytes || 0;
  const freeDev = storageResult?.freeDeviceBytes || 0;
  const usedPct = Math.min(100, Math.round((usedDev / totalDev) * 100));

  // ----------------------------------------------------
  // UI Render Components
  // ----------------------------------------------------

  // 1. Storage Header Card (shown at root)
  const renderStorageOverviewCard = () => (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.storageCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      <View style={styles.storageCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <View style={[styles.storageIconCircle, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="hardware-chip-outline" size={20} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.storageCardTitle, { color: COLORS.text }]} numberOfLines={1}>
              Device Storage
            </Text>
            <Text style={[styles.storageCardSub, { color: COLORS.muted }]} numberOfLines={1}>
              {formatStorageSize(freeDev)} free of {formatStorageSize(totalDev)}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <View style={[styles.storagePctBadge, { backgroundColor: COLORS.accent + '15' }]}>
            <Text style={[styles.storagePctText, { color: COLORS.accent }]}>{usedPct}% Used</Text>
          </View>
          <TouchableOpacity
            style={[styles.storageRefreshIconBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
            onPress={handleRefresh}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="sync-outline" size={14} color={COLORS.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Usage Progress Bar */}
      <View style={[styles.storageProgressBarBg, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
        <View
          style={[
            styles.storageProgressBarFill,
            {
              width: `${usedPct}%`,
              backgroundColor: usedPct > 90 ? COLORS.danger : usedPct > 75 ? COLORS.warning : COLORS.accent,
            },
          ]}
        />
      </View>

      {/* Quick Action Tools Bar - 3 balanced buttons */}
      <View style={styles.storageActionRow}>
        <TouchableOpacity
          style={[styles.quickToolBtn, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '30' }]}
          onPress={() => {
            setNewFolderName('');
            setNewFolderModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="folder-outline" size={15} color={COLORS.accent} />
          <Text style={[styles.quickToolText, { color: COLORS.accent }]} numberOfLines={1}>
            + Folder
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickToolBtn, { backgroundColor: '#6366F115', borderColor: '#6366F130' }]}
          onPress={() => {
            setLanShareItems([]);
            setLanShareModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="wifi-outline" size={15} color="#6366F1" />
          <Text style={[styles.quickToolText, { color: '#6366F1' }]} numberOfLines={1}>
            WiFi / FTP
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickToolBtn, { backgroundColor: '#10B98115', borderColor: '#10B98130' }]}
          onPress={() => router.push('/doc-scanner')}
          activeOpacity={0.7}
        >
          <Ionicons name="camera-outline" size={15} color="#10B981" />
          <Text style={[styles.quickToolText, { color: '#10B981' }]} numberOfLines={1}>
            Scan Doc
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // 2. Quick Categories Strip
  const renderQuickCategories = () => (
    <View style={{ marginBottom: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
          onPress={loadRootFolders}
        >
          <Ionicons name="folder" size={14} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={[styles.categoryChipText, { color: '#FFF', fontWeight: '700' }]} numberOfLines={1}>All Folders</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          onPress={() => {
            openFolder({
              name: 'PDF Documents',
              path: 'PDF Documents',
              fileCount: 0,
              totalBytes: 0,
              iconName: 'document-text',
            });
          }}
        >
          <Ionicons name="document-text" size={14} color="#EC4899" style={{ marginRight: 6 }} />
          <Text style={[styles.categoryChipText, { color: COLORS.text, fontWeight: '600' }]} numberOfLines={1}>PDFs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          onPress={() => {
            const cam = folders.find(f => f.name.includes('Camera') || f.name.includes('Photos') || f.name.includes('Pictures'));
            if (cam) openFolder(cam);
          }}
        >
          <Ionicons name="images" size={14} color="#3B82F6" style={{ marginRight: 6 }} />
          <Text style={[styles.categoryChipText, { color: COLORS.text, fontWeight: '600' }]} numberOfLines={1}>Photos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          onPress={() => {
            const doc = folders.find(f => f.name === 'Documents' || f.name === 'App Documents');
            if (doc) openFolder(doc);
          }}
        >
          <Ionicons name="reader" size={14} color="#8B5CF6" style={{ marginRight: 6 }} />
          <Text style={[styles.categoryChipText, { color: COLORS.text, fontWeight: '600' }]} numberOfLines={1}>Documents</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          onPress={() => {
            const dl = folders.find(f => f.name.includes('Downloads') || f.name.includes('Download'));
            if (dl) openFolder(dl);
          }}
        >
          <Ionicons name="download" size={14} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={[styles.categoryChipText, { color: COLORS.text, fontWeight: '600' }]} numberOfLines={1}>Downloads</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          onPress={() => {
            const wa = folders.find(f => f.name.includes('WhatsApp'));
            if (wa) openFolder(wa);
          }}
        >
          <Ionicons name="logo-whatsapp" size={14} color="#22C55E" style={{ marginRight: 6 }} />
          <Text style={[styles.categoryChipText, { color: COLORS.text, fontWeight: '600' }]} numberOfLines={1}>WhatsApp</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // 3. Root Drives List
  const renderRootDrives = () => (
    <ScrollView
      style={styles.scrollBody}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 120 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />}
    >
      {renderStorageOverviewCard()}

      {isLoading && folders.length === 0 ? (
        <EnhancedScanningCard
          title="Indexing Storage & Drives..."
          subtitle="Scanning internal storage, SD card, and indexed folders..."
          colors={COLORS}
        />
      ) : (
        <>
          {/* All Files Access Permission Notice Banner */}
          {!hasPermission && (
            <View style={[styles.permissionBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
              <View style={styles.permissionBannerTop}>
                <View style={[styles.permissionIconCircle, { backgroundColor: '#F59E0B25' }]}>
                  <Ionicons name="folder-open" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.permissionBannerTitle, { color: COLORS.text }]} numberOfLines={1}>
                    All Files Access Required
                  </Text>
                  <Text style={[styles.permissionBannerSub, { color: COLORS.muted }]}>
                    Android requires All Files Access permission to browse downloads, photos, and SD card files in File Manager.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.permissionBannerBtn, { backgroundColor: '#F59E0B' }]}
                onPress={handleRequestStoragePermission}
                activeOpacity={0.8}
              >
                <Ionicons name="key-outline" size={15} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.permissionBannerBtnText} numberOfLines={1}>Grant Storage Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          {renderQuickCategories()}

          <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Indexed Directories & Drives</Text>
          <View style={styles.folderGrid}>
            {folders.map(folder => {
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
                iconColor = '#22C55E';
                iconBg = 'rgba(34, 197, 94, 0.15)';
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
                  style={[styles.driveCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                  onPress={() => openFolder(folder)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.driveIconWrap, { backgroundColor: iconBg }]}>
                    <Ionicons name={(folder.iconName as any) || 'folder'} size={24} color={iconColor} />
                  </View>
                  <View style={styles.driveInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.driveName, { color: COLORS.text }]} numberOfLines={1}>
                        {folder.name}
                      </Text>
                      {folder.isSdCard && (
                        <View style={styles.sdCardBadge}>
                          <Text style={styles.sdCardBadgeText}>SD CARD</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.driveStats, { color: COLORS.muted }]} numberOfLines={1}>
                      {folder.fileCount > 0 ? `${folder.fileCount} files · ` : ''}
                      {formatStorageSize(folder.totalBytes)}
                      {folder.freeBytes && folder.freeBytes > 0 ? ` · ${formatStorageSize(folder.freeBytes)} free` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );

  // 4. In-Folder Explorer (Breadcrumbs + Toolbar + List/Grid)
  const renderFolderExplorer = () => (
    <View style={{ flex: 1 }}>
      {/* Breadcrumb Path Bar */}
      <View style={[styles.breadcrumbsBar, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
        <TouchableOpacity
          style={styles.breadcrumbBackBtn}
          onPress={() => navigateBreadcrumb(Math.max(0, breadcrumbs.length - 2))}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.text} />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbsScroll}>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => navigateBreadcrumb(idx)}
                  disabled={isLast}
                  style={[styles.crumbPill, isLast && { backgroundColor: COLORS.accent + '20' }]}
                >
                  {idx === 0 ? (
                    <Ionicons name="folder-outline" size={13} color={isLast ? COLORS.accent : COLORS.muted} style={{ marginRight: 4 }} />
                  ) : null}
                  <Text style={[styles.crumbText, { color: isLast ? COLORS.accent : COLORS.muted, fontWeight: isLast ? '700' : '500' }]} numberOfLines={1}>
                    {crumb.name}
                  </Text>
                </TouchableOpacity>
                {!isLast && <Ionicons name="chevron-forward" size={13} color={COLORS.muted} style={{ marginHorizontal: 2 }} />}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Toolbar: Search input (if open) + Filter Chips & View Mode / Sort */}
      <View style={[styles.toolbarContainer, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
        {isSearchVisible && (
          <View style={[styles.searchBox, { backgroundColor: COLORS.bg, borderColor: COLORS.border }]}>
            <Ionicons name="search-outline" size={16} color={COLORS.muted} />
            <TextInput
              style={[styles.searchInput, { color: COLORS.text }]}
              placeholder="Search files in folder..."
              placeholderTextColor={COLORS.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={styles.filterBarRow}>
          {/* File Type Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
            {(['all', 'pdf', 'image', 'doc', 'audio'] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filterType === type ? COLORS.accent : COLORS.bg,
                    borderColor: filterType === type ? COLORS.accent : COLORS.border,
                  },
                ]}
                onPress={() => setFilterType(type)}
              >
                <Text style={[styles.filterChipText, { color: filterType === type ? '#FFF' : COLORS.muted }]} numberOfLines={1}>
                  {type === 'all' ? 'All' : type === 'pdf' ? 'PDFs' : type === 'image' ? 'Images' : type === 'doc' ? 'Docs' : 'Audio'}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={{ width: 1, height: 16, backgroundColor: COLORS.border, marginHorizontal: 4 }} />

            {/* Sort Button */}
            <TouchableOpacity
              style={[styles.toolPill, { borderColor: COLORS.border, backgroundColor: COLORS.bg }]}
              onPress={() => setIsSortModalVisible(true)}
            >
              <Ionicons name="swap-vertical" size={13} color={COLORS.accent} />
              <Text style={[styles.toolPillText, { color: COLORS.accent }]} numberOfLines={1}>
                {sortField === 'date' ? 'Date' : sortField === 'name' ? 'Name' : sortField === 'size' ? 'Size' : 'Type'}{' '}
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Text>
            </TouchableOpacity>

            {/* New Folder Button */}
            <TouchableOpacity
              style={[styles.toolPill, { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '15' }]}
              onPress={() => {
                setNewFolderName('');
                setNewFolderModalVisible(true);
              }}
            >
              <Ionicons name="add" size={14} color={COLORS.accent} />
              <Text style={[styles.toolPillText, { color: COLORS.accent }]} numberOfLines={1}>Folder</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      {/* Items Count & Select All Bar */}
      <View style={[styles.listHeaderBar, { backgroundColor: COLORS.bg }]}>
        <Text style={[styles.listHeaderCount, { color: COLORS.muted }]}>
          {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => {
              if (selectedUris.size === filteredItems.length && filteredItems.length > 0) {
                setSelectedUris(new Set());
              } else {
                setSelectedUris(new Set(filteredItems.map(f => f.uri)));
              }
            }}
          >
            <Text style={[styles.listSelectAllText, { color: COLORS.accent }]}>
              {selectedUris.size === filteredItems.length && filteredItems.length > 0 ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* File & Subdirectory List / Grid */}
      {isLoading ? (
        <EnhancedScanningCard
          title={
            breadcrumbs.length > 1
              ? `Opening ${breadcrumbs[breadcrumbs.length - 1].name}...`
              : 'Reading Directory Items...'
          }
          subtitle="Loading files, calculating sizes, and indexing..."
          colors={COLORS}
        />
      ) : (
        <FlatList
          key={viewMode}
          data={filteredItems}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={item => item.uri}
          contentContainerStyle={{ padding: 12, paddingBottom: Math.max(insets.bottom, 24) + 140 }}
          initialNumToRender={14}
          maxToRenderPerBatch={14}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="folder-open-outline" size={54} color={COLORS.muted} />
              <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Files Found</Text>
              <Text style={[styles.emptySub, { color: COLORS.muted }]}>
                {searchQuery ? 'No items match your search query.' : 'This directory is currently empty.'}
              </Text>
              <NativeScaleButton
                onPress={() => {
                  setNewFolderName('');
                  setNewFolderModalVisible(true);
                }}
                style={[styles.emptyActionBtn, { backgroundColor: COLORS.accent }]}
                activeScale={0.95}
                hapticType="light"
              >
                <Ionicons name="add" size={16} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionText}>Create New Folder</Text>
              </NativeScaleButton>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selectedUris.has(item.uri);
            const ext = (item.extension || '').toUpperCase();

            // RENDER GRID VIEW ITEM
            if (viewMode === 'grid') {
              return (
                <TouchableOpacity
                  style={[
                    styles.gridCard,
                    { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.accent : COLORS.border },
                  ]}
                  onPress={() => handleOpenFile(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.gridThumbWrap}>
                    {item.isDirectory ? (
                      <View style={[styles.gridDirIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                        <Ionicons name="folder" size={38} color="#F59E0B" />
                      </View>
                    ) : (
                      <FileThumbnail
                        uri={item.uri}
                        name={item.name}
                        extension={item.extension}
                        style={styles.gridThumbnail}
                        resizeMode="cover"
                      />
                    )}

                    {/* Checkbox overlay */}
                    <TouchableOpacity
                      style={styles.gridCheckboxTouch}
                      onPress={() => toggleSelect(item.uri)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <View style={[styles.checkboxCircle, isSelected && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}>
                        {isSelected && <Ionicons name="checkmark" size={13} color="#FFF" />}
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.gridMetaWrap}>
                    <Text style={[styles.gridTitle, { color: COLORS.text }]} numberOfLines={1} ellipsizeMode="middle">
                      {item.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={[styles.gridSub, { color: COLORS.muted }]} numberOfLines={1}>
                        {item.isDirectory ? (item.itemCount !== undefined ? `${item.itemCount} items` : 'Folder') : formatSize(item.size)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setActionItem(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }

            // RENDER LIST VIEW ITEM
            if (item.isDirectory) {
              return (
                <TouchableOpacity
                  style={[styles.itemRow, { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.accent : COLORS.border }]}
                  onPress={() => handleOpenFile(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.dirIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <Ionicons name="folder" size={24} color="#F59E0B" />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: COLORS.text }]} numberOfLines={1} ellipsizeMode="middle">
                      {item.name}
                    </Text>
                    <Text style={[styles.itemMeta, { color: COLORS.muted }]} numberOfLines={1}>
                      {item.itemCount !== undefined ? `${item.itemCount} items · ` : ''}Folder
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.checkboxTouch} onPress={() => toggleSelect(item.uri)}>
                    <View style={[styles.checkboxCircle, isSelected && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.moreBtn} onPress={() => setActionItem(item)}>
                    <Ionicons name="ellipsis-vertical" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                style={[styles.itemRow, { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.accent : COLORS.border }]}
                onPress={() => handleOpenFile(item)}
                activeOpacity={0.7}
              >
                <FileThumbnail uri={item.uri} name={item.name} extension={item.extension} style={styles.listThumbnail} />
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: COLORS.text }]} numberOfLines={1} ellipsizeMode="middle">
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    {ext ? (
                      <View style={[styles.extBadge, { backgroundColor: COLORS.accent + '20' }]}>
                        <Text style={[styles.extBadgeText, { color: COLORS.accent }]} numberOfLines={1}>{ext}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.itemMeta, { color: COLORS.muted }]} numberOfLines={1}>
                      {formatSize(item.size)} · {formatDate(item.modified)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.checkboxTouch} onPress={() => toggleSelect(item.uri)}>
                  <View style={[styles.checkboxCircle, isSelected && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.moreBtn} onPress={() => setActionItem(item)}>
                  <Ionicons name="ellipsis-vertical" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg, paddingTop: insets.top }]}>
      {/* ---------------- App Header ---------------- */}
      <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
        <NativeScaleButton
          onPress={() => {
            if (breadcrumbs.length > 0) {
              navigateBreadcrumb(Math.max(0, breadcrumbs.length - 2));
            } else {
              router.back();
            }
          }}
          style={styles.headerBackBtn}
          hapticType="light"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </NativeScaleButton>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1} ellipsizeMode="middle">
            {currentFolder ? currentFolder.name : 'File Manager'}
          </Text>
          <Text style={[styles.headerSub, { color: COLORS.muted }]} numberOfLines={1}>
            {currentFolder ? `${items.length} files in folder` : `${folders.length} storage drives available`}
          </Text>
        </View>

        {/* Header Right Actions */}
        <View style={styles.headerActionRow}>
          {currentFolder && (
            <>
              {/* Search Toggle */}
              <NativeScaleButton
                onPress={() => setIsSearchVisible(prev => !prev)}
                style={[styles.headerIconBtn, isSearchVisible && { backgroundColor: COLORS.accent + '25' }]}
                hapticType="light"
              >
                <Ionicons name="search-outline" size={19} color={isSearchVisible ? COLORS.accent : COLORS.text} />
              </NativeScaleButton>

              {/* View Mode Toggle: List <-> Grid */}
              <NativeScaleButton
                onPress={() => {
                  Haptics.light();
                  setViewMode(prev => (prev === 'list' ? 'grid' : 'list'));
                }}
                style={styles.headerIconBtn}
                hapticType="light"
              >
                <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={19} color={COLORS.text} />
              </NativeScaleButton>
            </>
          )}

          {/* Refresh */}
          <NativeScaleButton onPress={handleRefresh} style={styles.headerIconBtn} hapticType="light">
            <Ionicons name="refresh-outline" size={19} color={COLORS.accent} />
          </NativeScaleButton>

          <HeaderMenuButton />
        </View>
      </View>

      {/* Sleek Animated Indeterminate Progress Bar */}
      {(isLoading || isRefreshing) && (
        <AnimatedLoadingProgressBar color={COLORS.accent} />
      )}

      {/* ---------------- Main Content Body ---------------- */}
      {!currentFolder ? renderRootDrives() : renderFolderExplorer()}

      {/* ---------------- Floating Bottom Paste Bar ---------------- */}
      {clipboard && (
        <Animated.View
          entering={SlideInDown.duration(200)}
          exiting={SlideOutDown.duration(180)}
          style={[styles.pasteBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: Math.max(insets.bottom, 24) }]}
        >
          <View style={styles.pasteInfoWrap}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={clipboard.mode === 'copy' ? 'copy' : 'cut'} size={15} color={COLORS.accent} />
              <Text style={[styles.pasteBarTitle, { color: COLORS.text }]} numberOfLines={1}>
                {clipboard.mode === 'copy' ? 'Copy' : 'Move'} {clipboard.items.length} item(s)
              </Text>
            </View>
            <Text style={[styles.pasteBarSub, { color: COLORS.muted }]} numberOfLines={1} ellipsizeMode="middle">
              Target: {currentFolder ? currentFolder.name : 'Choose folder'}
            </Text>
          </View>

          <View style={styles.pasteButtonsRow}>
            <TouchableOpacity style={[styles.pasteCancelBtn, { borderColor: COLORS.border }]} onPress={() => setClipboard(null)}>
              <Text style={[styles.pasteCancelText, { color: COLORS.muted }]} numberOfLines={1}>Cancel</Text>
            </TouchableOpacity>

            <NativeScaleButton
              onPress={handleExecutePaste}
              style={[styles.pasteExecBtn, { backgroundColor: COLORS.accent }]}
              disabled={isPasting}
              hapticType="medium"
            >
              {isPasting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="clipboard-outline" size={15} color="#FFF" />
                  <Text style={styles.pasteExecText} numberOfLines={1}>Paste Here</Text>
                </View>
              )}
            </NativeScaleButton>
          </View>
        </Animated.View>
      )}

      {/* ---------------- Floating Bottom Multi-Select Action Bar (2-Tier Balanced Layout) ---------------- */}
      {!clipboard && selectedUris.size > 0 && (
        <Animated.View
          entering={SlideInDown.duration(200)}
          exiting={SlideOutDown.duration(180)}
          style={[
            styles.selectionBar,
            {
              backgroundColor: COLORS.surface,
              borderTopColor: COLORS.border,
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
        >
          {/* Top selection info bar */}
          <View style={styles.selectionTopBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <View style={[styles.selectionBadge, { backgroundColor: COLORS.accent + '25' }]}>
                <Text style={[styles.selectionBadgeText, { color: COLORS.accent }]}>{selectedUris.size}</Text>
              </View>
              <Text style={[styles.selectionCountText, { color: COLORS.text }]} numberOfLines={1}>
                {selectedUris.size === 1 ? '1 item selected' : `${selectedUris.size} items selected`}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  if (selectedUris.size === filteredItems.length && filteredItems.length > 0) {
                    setSelectedUris(new Set());
                  } else {
                    setSelectedUris(new Set(filteredItems.map(f => f.uri)));
                  }
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.selectAllLinkText, { color: COLORS.accent }]}>
                  {selectedUris.size === filteredItems.length && filteredItems.length > 0 ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSelectedUris(new Set())}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Action Buttons Row - Equal width 4 buttons */}
          <View style={styles.selectionTileRow}>
            {/* Copy */}
            <TouchableOpacity
              onPress={() => {
                const targetItems = items.filter(f => selectedUris.has(f.uri));
                handleInitiateClipboard('copy', targetItems);
              }}
              style={[styles.actionTile, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={16} color={COLORS.text} />
              <Text style={[styles.actionTileText, { color: COLORS.text }]} numberOfLines={1}>
                Copy
              </Text>
            </TouchableOpacity>

            {/* Move */}
            <TouchableOpacity
              onPress={() => {
                const targetItems = items.filter(f => selectedUris.has(f.uri));
                handleInitiateClipboard('move', targetItems);
              }}
              style={[styles.actionTile, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              activeOpacity={0.7}
            >
              <Ionicons name="cut-outline" size={16} color={COLORS.text} />
              <Text style={[styles.actionTileText, { color: COLORS.text }]} numberOfLines={1}>
                Move
              </Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              onPress={async () => {
                const firstUri = Array.from(selectedUris)[0];
                const it = items.find(f => f.uri === firstUri);
                if (it) await shareItem(it.uri, it.mimeType);
              }}
              style={[styles.actionTile, { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent + '40' }]}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social-outline" size={16} color={COLORS.accent} />
              <Text style={[styles.actionTileText, { color: COLORS.accent }]} numberOfLines={1}>
                Share
              </Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              onPress={handleBatchDelete}
              style={[styles.actionTile, { backgroundColor: COLORS.danger + '20', borderColor: COLORS.danger + '40' }]}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              <Text style={[styles.actionTileText, { color: COLORS.danger }]} numberOfLines={1}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ---------------- File Action Sheet Modal ---------------- */}
      <Modal visible={!!actionItem && !renameModalVisible} transparent animationType="fade" onRequestClose={() => setActionItem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setActionItem(null)}>
          <View style={[styles.actionSheet, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={styles.actionSheetHeader}>
              <Text style={[styles.actionSheetTitle, { color: COLORS.text }]} numberOfLines={1} ellipsizeMode="middle">
                {actionItem?.name}
              </Text>
              <Text style={[styles.actionSheetSub, { color: COLORS.muted }]} numberOfLines={1}>
                {actionItem?.isDirectory ? 'Folder' : `${formatSize(actionItem?.size || 0)} · ${actionItem?.extension?.toUpperCase() || 'FILE'}`}
              </Text>
            </View>

            {/* Open Options */}
            {actionItem?.name.toLowerCase().endsWith('.pdf') ? (
              <>
                <TouchableOpacity
                  style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
                  onPress={() => {
                    const it = actionItem;
                    setActionItem(null);
                    if (it) handleOpenInAppPdf(it);
                  }}
                >
                  <Ionicons name="reader-outline" size={20} color={COLORS.accent} />
                  <Text style={[styles.sheetRowText, { color: COLORS.accent, fontWeight: '700' }]} numberOfLines={1}>
                    Open in FileLens Pro Viewer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
                  onPress={() => {
                    const it = actionItem;
                    setActionItem(null);
                    if (it) handleOpenExternal(it);
                  }}
                >
                  <Ionicons name="open-outline" size={20} color={COLORS.text} />
                  <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Open with External App</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
                onPress={() => {
                  const it = actionItem;
                  setActionItem(null);
                  if (it) handleOpenFile(it);
                }}
              >
                <Ionicons name="open-outline" size={20} color={COLORS.accent} />
                <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>
                  {actionItem?.isDirectory ? 'Open Folder' : 'Open in Default App'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Clipboard: Copy & Move */}
            <TouchableOpacity
              style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                if (actionItem) handleInitiateClipboard('copy', [actionItem]);
              }}
            >
              <Ionicons name="copy-outline" size={20} color={COLORS.text} />
              <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Copy to...</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                if (actionItem) handleInitiateClipboard('move', [actionItem]);
              }}
            >
              <Ionicons name="cut-outline" size={20} color={COLORS.text} />
              <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Move to...</Text>
            </TouchableOpacity>

            {/* Share & LAN Transfer */}
            {!actionItem?.isDirectory && (
              <>
                <TouchableOpacity
                  style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
                  onPress={() => {
                    const it = actionItem;
                    setActionItem(null);
                    if (it) {
                      setLanShareItems([it]);
                      setLanShareModalVisible(true);
                    }
                  }}
                >
                  <Ionicons name="wifi-outline" size={20} color="#6366F1" />
                  <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Share over WiFi / LAN</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
                  onPress={() => {
                    const it = actionItem;
                    setActionItem(null);
                    if (it) shareItem(it.uri, it.mimeType);
                  }}
                >
                  <Ionicons name="share-social-outline" size={20} color={COLORS.text} />
                  <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Share via System</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
                  onPress={async () => {
                    const it = actionItem;
                    setActionItem(null);
                    if (it) {
                      const res = await addFileToCards(it);
                      if (res.success) {
                        showAlert('Added to Cards', `"${it.name}" is now in Smart Cards!`, undefined, {
                          icon: 'card',
                          iconColor: '#EC4899',
                        });
                      }
                    }
                  }}
                >
                  <Ionicons name="card-outline" size={20} color="#EC4899" />
                  <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Add to Smart Cards</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Rename */}
            <TouchableOpacity
              style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                if (actionItem) {
                  setRenameText(actionItem.name);
                  setRenameModalVisible(true);
                }
              }}
            >
              <Ionicons name="pencil-outline" size={20} color={COLORS.text} />
              <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Rename</Text>
            </TouchableOpacity>

            {/* Properties & Details */}
            <TouchableOpacity
              style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                const it = actionItem;
                setActionItem(null);
                if (it) handleInspectDetails(it);
              }}
            >
              <Ionicons name="information-circle-outline" size={20} color={COLORS.text} />
              <Text style={[styles.sheetRowText, { color: COLORS.text }]} numberOfLines={1}>Details & Properties</Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              style={[styles.sheetRow, { borderTopColor: COLORS.border }]}
              onPress={() => {
                const it = actionItem;
                setActionItem(null);
                if (it) handleDeleteItem(it);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
              <Text style={[styles.sheetRowText, { color: COLORS.danger }]} numberOfLines={1}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ---------------- File Details Modal ---------------- */}
      <Modal visible={!!detailItem} transparent animationType="fade" onRequestClose={() => setDetailItem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDetailItem(null)}>
          <View style={[styles.detailModalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={styles.detailHeader}>
              <Ionicons name="information-circle" size={22} color={COLORS.accent} />
              <Text style={[styles.detailHeaderTitle, { color: COLORS.text }]}>File Properties</Text>
            </View>

            {detailItem && (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                <View style={styles.detailPropRow}>
                  <Text style={[styles.detailPropLabel, { color: COLORS.muted }]}>Name:</Text>
                  <Text style={[styles.detailPropVal, { color: COLORS.text }]}>{detailItem.name}</Text>
                </View>

                <View style={styles.detailPropRow}>
                  <Text style={[styles.detailPropLabel, { color: COLORS.muted }]}>Size:</Text>
                  <Text style={[styles.detailPropVal, { color: COLORS.text }]}>
                    {detailItem.formattedSize} {detailItem.size > 0 ? `(${detailItem.size.toLocaleString()} bytes)` : ''}
                  </Text>
                </View>

                <View style={styles.detailPropRow}>
                  <Text style={[styles.detailPropLabel, { color: COLORS.muted }]}>Type:</Text>
                  <Text style={[styles.detailPropVal, { color: COLORS.text }]}>{detailItem.mimeType}</Text>
                </View>

                <View style={styles.detailPropRow}>
                  <Text style={[styles.detailPropLabel, { color: COLORS.muted }]}>Modified:</Text>
                  <Text style={[styles.detailPropVal, { color: COLORS.text }]}>{detailItem.formattedDate}</Text>
                </View>

                <View style={styles.detailPropRow}>
                  <Text style={[styles.detailPropLabel, { color: COLORS.muted }]}>Location:</Text>
                  <Text style={[styles.detailPropVal, { color: COLORS.text }]} numberOfLines={3}>
                    {detailItem.uri}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.copyPathBtn, { borderColor: COLORS.border, backgroundColor: COLORS.bg }]}
                  onPress={() => handleCopyPath(detailItem.uri)}
                >
                  <Ionicons name="copy-outline" size={15} color={COLORS.accent} />
                  <Text style={[styles.copyPathText, { color: COLORS.accent }]}>Copy Path to Clipboard</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            <NativeScaleButton
              onPress={() => setDetailItem(null)}
              style={[styles.detailCloseBtn, { backgroundColor: COLORS.accent }]}
              hapticType="light"
            >
              <Text style={styles.detailCloseText}>Done</Text>
            </NativeScaleButton>
          </View>
        </Pressable>
      </Modal>

      {/* ---------------- Sort Direction & Field Modal ---------------- */}
      <Modal visible={isSortModalVisible} transparent animationType="fade" onRequestClose={() => setIsSortModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsSortModalVisible(false)}>
          <View style={[styles.sortModalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Text style={[styles.sortModalTitle, { color: COLORS.text }]}>Sort Files By</Text>

            {(['date', 'name', 'size', 'type'] as const).map(field => (
              <TouchableOpacity
                key={field}
                style={[styles.sortOptionRow, { borderTopColor: COLORS.border }]}
                onPress={() => {
                  Haptics.light();
                  if (sortField === field) {
                    setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortField(field);
                  }
                  setIsSortModalVisible(false);
                }}
              >
                <Text style={[styles.sortOptionText, { color: sortField === field ? COLORS.accent : COLORS.text }]}>
                  {field === 'date' ? 'Date Modified' : field === 'name' ? 'Name (A-Z)' : field === 'size' ? 'File Size' : 'File Extension'}
                </Text>
                {sortField === field && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '700' }}>
                      {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    </Text>
                    <Ionicons name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={15} color={COLORS.accent} />
                  </View>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.sortCloseBtn} onPress={() => setIsSortModalVisible(false)}>
              <Text style={[styles.sortCloseText, { color: COLORS.muted }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ---------------- Rename Dialog ---------------- */}
      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRenameModalVisible(false)}>
          <View style={[styles.dialogCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Text style={[styles.dialogTitle, { color: COLORS.text }]}>Rename Item</Text>
            <TextInput
              style={[styles.dialogInput, { backgroundColor: COLORS.bg, borderColor: COLORS.border, color: COLORS.text }]}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.dialogBtnRow}>
              <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setRenameModalVisible(false)}>
                <Text style={[styles.dialogCancelText, { color: COLORS.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <NativeScaleButton onPress={handleRenameConfirm} style={[styles.dialogConfirmBtn, { backgroundColor: COLORS.accent }]}>
                <Text style={styles.dialogConfirmText}>Save</Text>
              </NativeScaleButton>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ---------------- New Folder Dialog ---------------- */}
      <Modal visible={newFolderModalVisible} transparent animationType="fade" onRequestClose={() => setNewFolderModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNewFolderModalVisible(false)}>
          <View style={[styles.dialogCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Text style={[styles.dialogTitle, { color: COLORS.text }]}>Create New Folder</Text>
            <TextInput
              style={[styles.dialogInput, { backgroundColor: COLORS.bg, borderColor: COLORS.border, color: COLORS.text }]}
              placeholder="Folder Name"
              placeholderTextColor={COLORS.muted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.dialogBtnRow}>
              <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setNewFolderModalVisible(false)}>
                <Text style={[styles.dialogCancelText, { color: COLORS.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <NativeScaleButton onPress={handleCreateFolder} style={[styles.dialogConfirmBtn, { backgroundColor: COLORS.accent }]}>
                <Text style={styles.dialogConfirmText}>Create</Text>
              </NativeScaleButton>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ---------------- Shared Modals ---------------- */}
      <LanShareModal visible={lanShareModalVisible} onClose={() => setLanShareModalVisible(false)} items={lanShareItems} colors={COLORS} />
      {scheduleTargetItem && (
        <ScheduleBrainModal
          visible={scheduleModalVisible}
          onClose={() => {
            setScheduleModalVisible(false);
            setScheduleTargetItem(null);
          }}
          item={scheduleTargetItem}
          colors={COLORS}
        />
      )}

      {/* ---------------- Storage Disclosure Modal ---------------- */}
      <StorageDisclosureModal
        visible={showDisclosureModal}
        onAgree={async () => {
          setShowDisclosureModal(false);
          await AsyncStorage.setItem('storage_disclosure_accepted', 'true');
          openStorageSettings();
        }}
        onCancel={() => setShowDisclosureModal(false)}
      />

      {/* ---------------- Themed Alert Modal ---------------- */}
      <ThemedAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        icon={alertConfig.icon}
        iconColor={alertConfig.iconColor}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(c => ({ ...c, visible: false }))}
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
  headerBackBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 12,
    marginTop: 8,
  },

  // Storage Card
  storageCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  storageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  storageIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storageCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  storageCardSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  storagePctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  storagePctText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  storageRefreshIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  storageProgressBarBg: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  storageProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  storageActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickToolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  quickToolText: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Category Strip
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
  },

  // Drive Cards Grid
  folderGrid: {
    gap: 10,
  },
  driveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  driveIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  driveInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  driveName: {
    fontSize: 15,
    fontWeight: '700',
  },
  driveStats: {
    fontSize: 12,
    marginTop: 3,
  },
  sdCardBadge: {
    backgroundColor: '#10B98125',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sdCardBadgeText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '800',
  },

  // Permission Banner
  permissionBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  permissionBannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  permissionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  permissionBannerSub: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  permissionBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  permissionBannerBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Breadcrumbs Bar
  breadcrumbsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  breadcrumbBackBtn: {
    padding: 4,
    marginRight: 6,
  },
  breadcrumbsScroll: {
    alignItems: 'center',
  },
  crumbPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  crumbText: {
    fontSize: 13,
  },

  // Toolbar
  toolbarContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  toolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  toolPillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // List Header
  listHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  listHeaderCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  listSelectAllText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // List Item Row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  dirIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  listThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 11,
  },
  extBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  extBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  checkboxTouch: {
    padding: 6,
    flexShrink: 0,
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    padding: 6,
    marginLeft: 4,
    flexShrink: 0,
  },

  // Grid View Items
  gridCard: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gridThumbWrap: {
    width: '100%',
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
  },
  gridDirIconWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCheckboxTouch: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  gridMetaWrap: {
    padding: 8,
  },
  gridTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  gridSub: {
    fontSize: 10,
    flex: 1,
    marginRight: 4,
  },

  // Loading & Empty States
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 260,
  },
  loadingSub: {
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  topLoadingBarTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  topLoadingBarIndicator: {
    height: '100%',
    width: '45%',
    borderRadius: 2,
  },
  scanningRadarWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  scanningRadarRing: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
  },
  scanningIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  embeddedBarTrack: {
    width: 180,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 18,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
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
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
  },
  emptyActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Floating Bottom Paste Bar
  pasteBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  pasteInfoWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  pasteBarTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  pasteBarSub: {
    fontSize: 11,
    marginTop: 2,
  },
  pasteButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  pasteCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteCancelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pasteExecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  pasteExecText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Floating Bottom Multi-Select Bar (2-Tier Balanced Layout)
  selectionBar: {
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
  selectionTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectionBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  selectionCountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectAllLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectionTileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    paddingHorizontal: 4,
  },
  actionTileText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Modals & Action Sheets
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  actionSheetHeader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  actionSheetSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  sheetRowText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Details Modal
  detailModalCard: {
    margin: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  detailHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  detailPropRow: {
    marginBottom: 12,
  },
  detailPropLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailPropVal: {
    fontSize: 13,
    fontWeight: '500',
  },
  copyPathBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginTop: 8,
    marginBottom: 14,
  },
  copyPathText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailCloseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
  },
  detailCloseText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Sort Modal
  sortModalCard: {
    margin: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderTopWidth: 1,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sortCloseBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 10,
  },
  sortCloseText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Dialog Card (Rename / New Folder)
  dialogCard: {
    margin: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  dialogInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  dialogBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dialogCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dialogConfirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  dialogConfirmText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
