/**
 * Home Screen â€” File search with indexing + sortable results.
 *
 * Features:
 *   - "Index Files" CTA when 0 files are indexed
 *   - Indexing progress indicator with cancel button
 *   - Search bar at the top (with mode picker)
 *   - Results list below (sortable by Name, Size, Modified, Type, Score)
 *   - Tap a result to see content preview
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  Image,
  AppState,
  Animated,
} from 'react-native';
import { Haptics } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { SafePdfView } from '../components/SafePdfView';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { exportContent, ExportFormat } from '../services/exportService';
import { getAiConfig, acceptAiAgreement, structureOcrText } from '../services/aiService';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useStore } from '../store/useStore';
import { search } from '../services/searchEngine';
import { getIndexStats, addIndexTarget, getIndexTargets, clearIndexTargetsByType, getFileContentById, refreshIndexStats } from '../services/database';
import { startIndexing, indexSingleFile, cancelIndexing, IndexTarget, notifyUserSearchActive, isBatteryOptimizationIgnored, processPendingHeavyFiles, renderPdfPage } from '../services/indexerService';
import { Highlighter } from '../services/highlighter';
import { extractDocxHtml, extractXlsxHtml, extractContent } from '../services/contentExtractor';
import { ocrImage } from '../services/ocrService';
import { addBookmark, saveSearch } from '../services/bookmarksService';
import { formatSize, formatDate } from '../utils/format';
import { SortColumn, SearchMode } from '../models/types';
import { useThemeColors, SIZES, FONTS } from '../utils/theme';
import { ExportModal } from '../components/ExportModal';
import { TutorialModal } from '../components/TutorialModal';
import { FolderSelectionModal } from '../components/FolderSelectionModal';
import { StorageDisclosureModal } from '../components/StorageDisclosureModal';
import { HeaderMenuButton, QuickNavModal } from '../components/QuickNavModal';
import { SearchFilterModal } from '../components/SearchFilterModal';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { FileThumbnail } from '../components/FileThumbnail';
import { ImageCropModal } from '../components/ImageCropModal';
import { TagManagementModal } from '../components/TagManagementModal';
import { BatteryOptimizationModal } from '../components/BatteryOptimizationModal';
import { NativeScaleButton } from '../components/NativeScaleButton';
import Reanimated, { FadeInDown, FadeOutDown, SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated';
import { cardLayoutTransition, getStaggerDelay, MotionTiming } from '../utils/motion';

const SORT_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'modified', label: 'Modified' },
  { key: 'extension', label: 'Type' },
  { key: 'score', label: 'Score' },
];

const IndexingProgressBanner = React.memo(({ 
  onCancel,
  onOpenBatteryModal,
  isBatteryUnrestricted = true,
}: { 
  onCancel: () => void;
  onOpenBatteryModal?: () => void;
  isBatteryUnrestricted?: boolean;
}) => {
  const indexProgress = useStore(s => s.indexProgress);
  const backgroundOcrProgress = useStore(s => s.backgroundOcrProgress);
  const isIndexing = useStore(s => s.isIndexing);
  const COLORS = useThemeColors();
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);

  if (isIndexing && indexProgress) {
    const percent = indexProgress.total > 0
      ? Math.round((indexProgress.indexed / indexProgress.total) * 100)
      : 0;

    return (
      <View style={styles.indexingBanner}>
        <View style={styles.indexingHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.indexingTitle} numberOfLines={1}>
              Indexing {indexProgress.indexed}/{indexProgress.total} ({percent}%)
            </Text>
          </View>
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={COLORS.danger} />
          </TouchableOpacity>
        </View>

        <Text style={styles.indexingPatientNotice}>
          ⏳ Please be patient, indexing large files may take a moment...
        </Text>

        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
        </View>
        {indexProgress.currentFile ? (
          <Text style={styles.indexingFile} numberOfLines={1}>
            {indexProgress.currentFile}
          </Text>
        ) : null}

        {isBatteryUnrestricted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Ionicons name="flash" size={12} color={COLORS.accent} />
            <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600' }}>
              ⚡ Running in background — feel free to minimize or lock screen
            </Text>
          </View>
        ) : onOpenBatteryModal ? (
          <TouchableOpacity 
            onPress={onOpenBatteryModal}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: COLORS.accent + '15',
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
              marginTop: 8,
              gap: 6,
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={13} color={COLORS.accent} />
            <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600', flex: 1 }}>
              Background scan: Tap to select "Unrestricted" / "No restrictions"
            </Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (backgroundOcrProgress) {
    const percent = backgroundOcrProgress.total > 0
      ? Math.round((backgroundOcrProgress.current / backgroundOcrProgress.total) * 100)
      : 0;
    const remaining = Math.max(0, backgroundOcrProgress.total - backgroundOcrProgress.current);

    return (
      <View style={[styles.indexingBanner, { backgroundColor: COLORS.surface, borderColor: COLORS.accent, borderWidth: 1 }]}>
        <View style={styles.indexingHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={[styles.indexingTitle, { color: COLORS.accent, marginLeft: 0 }]} numberOfLines={1}>
              📷 OCRing {backgroundOcrProgress.current.toLocaleString()}/{backgroundOcrProgress.total.toLocaleString()} ({percent}%)
            </Text>
          </View>
          <Text style={[styles.indexingMeta, { color: COLORS.accent, fontWeight: 'bold', fontSize: 11 }]}>
            {remaining > 0 ? `${remaining.toLocaleString()} left` : `${percent}%`}
          </Text>
        </View>

        <Text style={styles.indexingPatientNotice}>
          ⏳ Extracting text in background ({remaining.toLocaleString()} files remaining)...
        </Text>

        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: COLORS.accent }]} />
        </View>
        {backgroundOcrProgress.currentFile ? (
          <Text style={styles.indexingFile} numberOfLines={1}>
            {backgroundOcrProgress.currentFile}
          </Text>
        ) : null}

        {isBatteryUnrestricted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Ionicons name="flash" size={12} color={COLORS.accent} />
            <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600' }}>
              ⚡ Running in background — feel free to minimize or lock screen
            </Text>
          </View>
        ) : onOpenBatteryModal ? (
          <TouchableOpacity 
            onPress={onOpenBatteryModal}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: COLORS.accent + '15',
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
              marginTop: 8,
              gap: 6,
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={13} color={COLORS.accent} />
            <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600', flex: 1 }}>
              Background scan: Tap to select "Unrestricted" / "No restrictions"
            </Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return null;
});

export default function HomeScreen() {
  const COLORS = useThemeColors();
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const {
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    isSearching, setIsSearching,
    searchMode, setSearchMode,
    sortState, setSort,
    activeFilters, setFilters,
    totalFiles, ocrDone, ocrPending, setStats,
    isIndexing, setIsIndexing,
    backgroundOcrProgress,
    setIndexProgress,
  } = useStore();

  const isWorkerActive = isIndexing || backgroundOcrProgress !== null;

  const params = useLocalSearchParams<{ q?: string; search?: string; mode?: string; t?: string }>();
  const lastHandledParamTimestamp = useRef<string>('');

  const [input, setInput] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [indexMetrics, setIndexMetrics] = useState<{ totalFiles: number; indexedFiles: number; cardsCount: number }>({
    totalFiles: 0,
    indexedFiles: 0,
    cardsCount: 0,
  });

  const searchReqIdRef = useRef(0);

// PIN protection removed per user request

  const activeFilterCount = useMemo(() => {
    return (
      (activeFilters?.fileTypes?.length || 0) +
      (activeFilters?.minSize !== undefined || activeFilters?.maxSize !== undefined ? 1 : 0) +
      (activeFilters?.modifiedAfter ? 1 : 0)
    );
  }, [activeFilters]);

  useEffect(() => {
    AsyncStorage.getItem('recent_searches').then(res => {
      if (res) {
        try { setRecentSearches(JSON.parse(res)); } catch (e) {}
      }
    });

    AsyncStorage.getItem('tutorial_shown').then(res => {
      if (!res) {
        setShowTutorialModal(true);
        AsyncStorage.setItem('tutorial_shown', 'true');
      }
    });
  }, []);

  const saveRecentSearch = useCallback(async (query: string) => {
    const term = query.trim();
    if (!term || term.length < 2) return;
    try {
      const raw = await AsyncStorage.getItem('recent_searches');
      let currentList: string[] = [];
      if (raw) {
        try { currentList = JSON.parse(raw); } catch (e) {}
      }
      const updated = [term, ...currentList.filter(s => s.toLowerCase() !== term.toLowerCase())].slice(0, 10);
      setRecentSearches(updated);
      await AsyncStorage.setItem('recent_searches', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save recent search:', e);
    }
  }, []);

  const removeRecentSearch = useCallback(async (termToRemove: string) => {
    try {
      const raw = await AsyncStorage.getItem('recent_searches');
      let currentList: string[] = [];
      if (raw) {
        try { currentList = JSON.parse(raw); } catch (e) {}
      }
      const updated = currentList.filter(s => s.toLowerCase() !== termToRemove.toLowerCase());
      setRecentSearches(updated);
      await AsyncStorage.setItem('recent_searches', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to remove recent search:', e);
    }
  }, []);
  
  // Modal states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [showQuickNavModal, setShowQuickNavModal] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [bookmarkItem, setBookmarkItem] = useState<any>(null);

  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<'text' | 'original'>('text');

  const [selectedFolder, setSelectedFolder] = useState<{ id: string, name: string } | null>(null);
  const [docHtml, setDocHtml] = useState<string>('');

  // Export Modal State
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportContentText, setExportContentText] = useState('');
  const [exportFileName, setExportFileName] = useState('');
  const [exportImageUri, setExportImageUri] = useState<string | null>(null);

  // Image Crop & Border Align State
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [cropTargetImage, setCropTargetImage] = useState<{ uri: string; name: string } | null>(null);

  const [availableTargets, setAvailableTargets] = useState<{type: string; uri?: string}[]>([]);
  const [showStorageDisclosure, setShowStorageDisclosure] = useState(false);
  const [onDisclosureAgree, setOnDisclosureAgree] = useState<(() => void) | null>(null);

  // Battery Optimization State
  const [isBatteryUnrestricted, setIsBatteryUnrestricted] = useState(true);
  const [showBatteryModal, setShowBatteryModal] = useState(false);

  const checkBatteryStatus = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const ignored = await isBatteryOptimizationIgnored();
        setIsBatteryUnrestricted(ignored);
      } catch (e) {}
    }
  }, []);

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

  // Google Play Policy Compliance: Check and show Storage Disclosure on initial launch
  useEffect(() => {
    async function checkInitialStorageDisclosure() {
      try {
        const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
        if (!accepted) {
          setShowStorageDisclosure(true);
        }
      } catch (_) {}
    }
    checkInitialStorageDisclosure();
  }, []);

  // Preview highlighter state
  const highlighterRef = useRef(new Highlighter());
  const [highlightVersion, setHighlightVersion] = useState(0);
  const [inDocSearchQuery, setInDocSearchQuery] = useState('');

  // Sync inDocSearchQuery when preview opens
  useEffect(() => {
    if (previewItem) {
      setInDocSearchQuery(searchQuery || '');
    } else {
      setInDocSearchQuery('');
    }
  }, [previewItem]);

  // Update highlighter when preview opens or when inDocSearchQuery changes
  useEffect(() => {
    if (!previewItem) {
      highlighterRef.current.update('', '');
      return;
    }
    const q = inDocSearchQuery !== undefined && inDocSearchQuery !== '' ? inDocSearchQuery : searchQuery;
    if (!q || !q.trim()) {
      highlighterRef.current.update('', '');
      setHighlightVersion(v => v + 1);
      return;
    }
    const text = previewItem.entry.ocrText || previewItem.entry.contentText || '';
    highlighterRef.current.update(text, q.trim(), { caseSensitive: false, wholeWord: false });
    setHighlightVersion(v => v + 1);

    // Auto-navigate to first match
    if (highlighterRef.current.hasMatches && highlighterRef.current.current) {
      const match = highlighterRef.current.current;
      const targetIndex = Math.max(0, match.line - 1);
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.3,
          });
        } catch (_) {
          flatListRef.current?.scrollToOffset({
            offset: targetIndex * 24,
            animated: true,
          });
        }
      }, 120);
    }
  }, [previewItem, searchQuery, inDocSearchQuery]);

  const scrollRef = useRef<ScrollView>(null);
  const flatListRef = useRef<FlatList>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const gotoMatch = (direction: 1 | -1) => {
    const h = highlighterRef.current;
    if (!h.hasMatches) return;
    if (direction > 0) h.next(true);
    else h.prev(true);
    setHighlightVersion(v => v + 1);
    
    const currentMatch = h.current;
    if (currentMatch && flatListRef.current) {
      const targetIndex = Math.max(0, currentMatch.line - 1);
      try {
        flatListRef.current.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0.3,
        });
      } catch (_) {
        flatListRef.current.scrollToOffset({
          offset: targetIndex * 24,
          animated: true,
        });
      }
    }
  };

  const handleShareDirect = async (item: any) => {
    try {
      let shareUri = item.entry.path;
      if (shareUri.startsWith('content://') || shareUri.startsWith('file:///storage/')) {
        const filename = shareUri.split('/').pop() || `share_${Date.now()}`;
        const cacheUri = FileSystem.cacheDirectory + filename;
        await FileSystem.copyAsync({ from: shareUri, to: cacheUri });
        shareUri = cacheUri;
      }
      await Sharing.shareAsync(shareUri, { dialogTitle: `Share ${item.entry.name}` });
    } catch (e: any) {
      if (e.message && e.message.includes('Another share request is being processed')) {
        return;
      }
      console.warn('Share failed', e);
      showAlert(
        'Share Error',
        'Could not share this file. It might be unavailable or removed.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.danger }
      );
    }
  };

  const handleShare = async (item: any) => {
    const ext = (item?.entry?.extension || item?.entry?.name?.split('.').pop() || '').toLowerCase();
    const isImage = ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i);

    if (isImage) {
      showAlert(
        'Share Image',
        `How would you like to share "${item.entry.name}"?`,
        [
          {
            text: '✂️ Crop & Align Borders',
            style: 'default',
            onPress: () => {
              hideAlert();
              setCropTargetImage({ uri: item.entry.path, name: item.entry.name });
              setCropModalVisible(true);
            },
          },
          {
            text: '⚡ Share Original',
            style: 'default',
            onPress: () => {
              hideAlert();
              handleShareDirect(item);
            },
          },
          { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        ],
        { icon: 'share-social', iconColor: COLORS.accent }
      );
    } else {
      handleShareDirect(item);
    }
  };

  const handleCopyText = async () => {
    if (!previewItem) return;
    const text = previewItem.entry.ocrText || previewItem.entry.contentText || '';
    if (!text) {
      showAlert('No Text', 'There is no text to copy from this file.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
      return;
    }
    
    let textToCopy = text;
    if (textToCopy.length > 100000) {
      textToCopy = textToCopy.substring(0, 100000) + '\n\n[... Text truncated. Please share the file instead.]';
      showAlert('Text Truncated', 'The document is too large. Only the first 100,000 characters were copied.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    } else {
      showAlert('Copied', 'Text copied to clipboard!', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    }
    await Clipboard.setStringAsync(textToCopy);
  };

  const handleShareText = async () => {
    if (!previewItem) return;
    const text = previewItem.entry.ocrText || previewItem.entry.contentText || '';
    if (!text) {
      showAlert('No Text', 'There is no text to share from this file.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
      return;
    }
    
    let textToShare = text;
    if (textToShare.length > 100000) {
      textToShare = textToShare.substring(0, 100000) + '\n\n[... Text truncated. Please share the file instead.]';
      showAlert('Text Truncated', 'The document is too large. Only the first 100,000 characters are being shared.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }

    try {
      await Share.share({
        message: textToShare,
        title: `Text from ${previewItem.entry.name}`,
      });
    } catch (e) {
      console.warn('Share text failed', e);
    }
    };

    const openExportModal = () => {
      let text = '';
      if (previewItem.entry.contentText) text += previewItem.entry.contentText + '\n\n';
      if (previewItem.entry.ocrText) text += previewItem.entry.ocrText;

      if (!text.trim()) {
        showAlert('No Content', 'There is no text to export for this document.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
        return;
      }

      setExportContentText(text);
      setExportFileName(previewItem.entry.name);
      
      // If it's an image, pass the path so the AI can optionally use vision
      const ext = previewItem.entry.extension.toLowerCase();
      if (ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/)) {
        setExportImageUri(previewItem.entry.path);
      } else {
        setExportImageUri(null);
      }

      setExportModalVisible(true);
    };

    const handleExportItem = async (item: any) => {
      let text = '';
      if (item.entry) {
        if (item.entry.contentText) text += item.entry.contentText + '\n\n';
        if (item.entry.ocrText) text += item.entry.ocrText;
        if (!text.trim()) {
          try {
            const content = await getFileContentById(item.entry.id);
            if (content) {
              if (content.contentText) text += content.contentText + '\n\n';
              if (content.ocrText) text += content.ocrText;
            }
          } catch (_) {}
        }
      }
      if (!text.trim() && item.preview) {
        text = item.preview;
      }

      if (!text.trim()) {
        showAlert('No Content', 'There is no text to export for this document.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
        return;
      }

      setExportContentText(text.trim());
      setExportFileName(item?.entry?.name || 'Document.pdf');

      const ext = (item?.entry?.extension || '').toLowerCase();
      if (ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/)) {
        setExportImageUri(item.entry.path);
      } else {
        setExportImageUri(null);
      }

      setExportModalVisible(true);
    };

  useEffect(() => {
    if (previewItem && previewMode === 'original') {
      const ext = previewItem.entry.extension.toLowerCase();
      if (ext === 'docx') {
        extractDocxHtml(previewItem.entry.path).then(setDocHtml);
      } else if (ext === 'xlsx' || ext === 'csv') {
        extractXlsxHtml(previewItem.entry.path).then(setDocHtml);
      } else {
        setDocHtml('');
      }
    }
  }, [previewItem, previewMode]);

  // Light Gallery: Current Result Index in Search Results
  const currentResultIndex = useMemo(() => {
    if (!previewItem || searchResults.length === 0) return -1;
    return searchResults.findIndex(r => 
      (r.entry.id && previewItem.entry.id && r.entry.id === previewItem.entry.id) ||
      (r.entry.path && previewItem.entry.path && r.entry.path === previewItem.entry.path)
    );
  }, [previewItem, searchResults]);

  const handleNavigateResult = useCallback(async (direction: -1 | 1) => {
    if (currentResultIndex === -1 || searchResults.length === 0) return;
    const newIndex = currentResultIndex + direction;
    if (newIndex >= 0 && newIndex < searchResults.length) {
      const nextItem = searchResults[newIndex];
      if (!nextItem?.entry?.contentText && !nextItem?.entry?.ocrText && nextItem?.entry?.id) {
        try {
          const content = await getFileContentById(nextItem.entry.id);
          nextItem.entry.contentText = content.contentText;
          nextItem.entry.ocrText = content.ocrText;
        } catch (e) {}
      }
      setPreviewItem(nextItem);
    }
  }, [currentResultIndex, searchResults]);

  // Load stats on mount and auto-refresh when app returns to foreground
  useEffect(() => {
    let isMounted = true;

    const loadFreshStats = async () => {
      try {
        await refreshIndexStats().catch(() => {});
        const stats = await getIndexStats();
        if (!isMounted) return;
        setStats(stats);
        setIndexMetrics({
          totalFiles: stats.totalFiles,
          indexedFiles: stats.indexedFiles,
          cardsCount: stats.cardsCount,
        });
        const targets = await getIndexTargets();
        if (isMounted) setAvailableTargets(targets);

        if (Platform.OS === 'android') {
          isBatteryOptimizationIgnored().then(ignored => {
            if (isMounted) setIsBatteryUnrestricted(ignored);
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('Failed to load stats:', e);
      }
    };

    loadFreshStats();

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadFreshStats();
      }
    });

    return () => {
      isMounted = false;
      appStateSub.remove();
    };
  }, []);

  const searchModeRef = useRef<SearchMode>(searchMode);
  searchModeRef.current = searchMode;

  const performSearch = useCallback(async (searchString: string, isExplicitSubmit: boolean = false, overrideMode?: SearchMode) => {
    const reqId = ++searchReqIdRef.current;
    if (!searchString.trim()) {
      setSearchResults([]);
      setSearchQuery('');
      setIsSearching(false);
      return;
    }

    if (totalFiles === 0 && !isIndexing) {
      if (isExplicitSubmit) {
        showAlert(
          'No Files Indexed',
          'FileLensPro needs to scan your device or folders before it can find search results.\n\nWould you like to start a scan now?',
          [
            {
              text: 'Scan Entire Device',
              style: 'default',
              onPress: () => {
                hideAlert();
                handleEntireDeviceIndex();
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: hideAlert,
            },
          ],
          { icon: 'search', iconColor: COLORS.accent }
        );
      }
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    notifyUserSearchActive();
    try {
      const effectiveMode = overrideMode || searchModeRef.current;
      const results = await search(
        {
          query: searchString,
          mode: effectiveMode,
          target: 'all',
          caseSensitive: false,
          maxResults: 200,
          filters: activeFilters,
        },
        sortState.column
          ? {
              column: sortState.column === 'matchCount' ? 'score' : sortState.column,
              order: sortState.order,
            }
          : undefined
      );

      // Only apply if this is still the most recent search request
      if (reqId === searchReqIdRef.current) {
        setSearchResults(results);
        setSearchQuery(searchString);
        if (isExplicitSubmit && searchString.trim()) {
          saveRecentSearch(searchString);
        }
      }
    } catch (e) {
      if (reqId === searchReqIdRef.current) {
        console.error('Search failed:', e);
        setSearchResults([]);
      }
    } finally {
      if (reqId === searchReqIdRef.current) {
        setIsSearching(false);
      }
    }
  }, [sortState, activeFilters, totalFiles, isIndexing, COLORS]);

  const handleSelectRecentSearch = useCallback((term: string) => {
    setInput(term);
    saveRecentSearch(term);
    performSearch(term, true);
  }, [saveRecentSearch, performSearch]);

  const handleModeChange = useCallback((newMode: SearchMode) => {
    if (newMode === searchModeRef.current) return;
    searchModeRef.current = newMode;
    setSearchMode(newMode);
    if (input.trim()) {
      setIsSearching(true);
      performSearch(input, false, newMode);
    }
  }, [input, performSearch, setSearchMode]);

  // Debounced search on text input typing (updates search results smoothly)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = input.trim();
      if (!trimmed) {
        performSearch('');
        return;
      }
      performSearch(input, false);
      if (trimmed.length >= 2) {
        saveRecentSearch(trimmed);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [input, sortState, activeFilters, performSearch, saveRecentSearch]);

  // Handle incoming search query params (e.g. from Saved Searches or Scanner)
  useEffect(() => {
    const queryParam = params.q || params.search;
    if (queryParam && params.t && params.t !== lastHandledParamTimestamp.current) {
      lastHandledParamTimestamp.current = params.t;
      const targetQuery = queryParam.trim();
      const targetMode = (params.mode as SearchMode) || searchMode;
      
      if (params.mode && (params.mode as SearchMode) !== searchMode) {
        searchModeRef.current = params.mode as SearchMode;
        setSearchMode(params.mode as SearchMode);
      }
      
      setInput(targetQuery);
      saveRecentSearch(targetQuery);
      performSearch(targetQuery, true, targetMode);
    }
  }, [params.q, params.search, params.mode, params.t, searchMode, saveRecentSearch, performSearch, setSearchMode]);

  // Sync search query and refresh stats when navigating back or coming into focus
  useFocusEffect(
    useCallback(() => {
      refreshIndexStats().then(() => getIndexStats()).then(stats => {
        setStats(stats);
        if (stats.ocrPending > 0) {
          processPendingHeavyFiles(1000).catch(() => {});
        }
      }).catch(() => {});

      const store = useStore.getState();
      if (store.searchQuery) {
        const queryToRun = store.searchQuery;
        const currentMode = store.searchMode;
        // Consume one-shot intent so user can freely edit or clear the searchbox
        store.setSearchQuery('');
        setInput(queryToRun);
        saveRecentSearch(queryToRun);
        performSearch(queryToRun, true, currentMode);
      }
    }, [performSearch, saveRecentSearch, setStats])
  );

  // ——— Indexing ———
  const handleStartIndexing = useCallback(async (
    targets: IndexTarget[] = [{ type: 'all' }],
    options?: { silent?: boolean }
  ) => {
    try {
      const firstTarget = targets.length > 0 ? targets[0] : null;
      const isMedia = firstTarget && (firstTarget.type === 'all' || firstTarget.type === 'album');
      const isDocs = firstTarget && firstTarget.type === 'documents';

      // Bypass full indexer lock for single photos/documents
      if (isDocs && firstTarget.type === 'documents') {
        setIndexProgress({ indexed: 0, total: firstTarget.files.length, currentFile: 'Processing image...' });
        for (const file of firstTarget.files) {
          await indexSingleFile({
            uri: file.uri,
            filename: file.name,
            fileSize: file.size || 0,
            modificationTime: Date.now() / 1000,
            mimeType: file.mimeType,
          } as any, true, (msg) => {
            if (firstTarget.type === 'documents') {
              setIndexProgress({ indexed: 0, total: firstTarget.files.length, currentFile: msg });
            }
          });
        }
        setIndexProgress(null);
        try {
          await refreshIndexStats();
          const stats = await getIndexStats();
          setStats(stats);
        } catch (e) {}
        if (input.trim()) {
          performSearch(input.trim());
        }
        return;
      }

      setIsIndexing(true);
      setIndexProgress({ indexed: 0, total: 0, currentFile: 'Scanning files...' });

      const result = await startIndexing(
        (progress) => {
          setIndexProgress({
            indexed: progress.indexed,
            total: progress.total,
            currentFile: progress.currentPath,
          });
          // Live update stats on the main page every 50 files for smoother 60fps UI
          if (progress.indexed > 0 && progress.indexed % 50 === 0) {
            getIndexStats().then(stats => setStats(stats)).catch(() => {});
          }
        },
        { ocrImages: true, maxFiles: 10000, targets }
      );
      setIsIndexing(false);
      setIndexProgress(null);

      // Refresh stats once after scan finishes
      try {
        const stats = await getIndexStats();
        setStats(stats);
      } catch (e) {}

      if (!options?.silent && result.indexedFiles > 0) {
        setTimeout(() => {
          showAlert(
            'Scan Complete',
            `Indexed ${result.indexedFiles} new files in ${(result.elapsedMs / 1000).toFixed(1)}s`,
            [{ text: 'Done', style: 'default', onPress: () => hideAlert() }],
            { icon: 'checkmark-circle', iconColor: COLORS.success }
          );
        }, 100);
      }
    } catch (e: any) {
      setIsIndexing(false);
      setIndexProgress(null);
      if (!options?.silent) {
        showAlert(
          'Indexing Error',
          e.message || 'Unknown error occurred while indexing files.',
          [{ text: 'OK', style: 'default', onPress: hideAlert }],
          { icon: 'alert-circle', iconColor: COLORS.danger }
        );
      }
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
    }
  }, [COLORS]);

  const handleCancelIndexing = useCallback(() => {
    cancelIndexing();
    setIsIndexing(false);
    setIndexProgress(null);
    // Refresh stats after cancel
    getIndexStats().then((stats) => setStats(stats)).catch(() => {});
  }, []);

  const openSourcePicker = async () => {
    try {
      const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
      if (accepted !== 'true') {
        setOnDisclosureAgree(() => () => setShowSourcePicker(true));
        setShowStorageDisclosure(true);
        return;
      }
    } catch (e) {}
    setShowSourcePicker(true);
  };

  const handleSync = async () => {
    try {
      const saved = await getIndexTargets();
      if (saved.length === 0) {
        showAlert(
          'No Targets Saved',
          'Please add a folder or album first to sync.',
          [{ text: 'Add Source', style: 'default', onPress: () => { hideAlert(); openSourcePicker(); } }, { text: 'Cancel', style: 'cancel', onPress: hideAlert }],
          { icon: 'folder-open', iconColor: COLORS.accent }
        );
      } else {
        const targets: IndexTarget[] = saved.map(s => {
          if (s.type === 'device_root') return { type: 'device_root' };
          if (s.type === 'saf_folder' && s.uri) return { type: 'saf_folder', uri: s.uri };
          if (s.type === 'device_folder' && s.uri) return { type: 'device_folder', uri: s.uri };
          if (s.type === 'album' && s.albumId) return { type: 'album', albumId: s.albumId };
          if (s.type === 'album' && s.uri) return { type: 'album', albumId: s.uri }; // fallback
          return { type: 'all' };
        });
        handleStartIndexing(targets);
      }
    } catch (e) {
      console.warn('Sync failed', e);
    }
  };

  // Silent Auto-Sync on App Launch for Interrupted or Pending Files
  const hasAutoSyncedOnLaunchRef = useRef(false);
  useEffect(() => {
    if (hasAutoSyncedOnLaunchRef.current) return;
    hasAutoSyncedOnLaunchRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
        if (accepted !== 'true') return;

        const saved = await getIndexTargets();
        if (!saved || saved.length === 0) return;

        const store = useStore.getState();
        if (store.isIndexing) return;

        const targets: IndexTarget[] = saved.map(s => {
          if (s.type === 'device_root') return { type: 'device_root' };
          if (s.type === 'saf_folder' && s.uri) return { type: 'saf_folder', uri: s.uri };
          if (s.type === 'device_folder' && s.uri) return { type: 'device_folder', uri: s.uri };
          if (s.type === 'album' && s.albumId) return { type: 'album', albumId: s.albumId };
          if (s.type === 'album' && s.uri) return { type: 'album', albumId: s.uri };
          return { type: 'all' };
        });

        handleStartIndexing(targets, { silent: true });
      } catch (err) {
        console.warn('[SilentAutoSync] Launch check skipped:', err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [handleStartIndexing]);

  const openAlbumPicker = async () => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showAlert(
          'Permission Denied',
          'Cannot access media library to index photos.',
          [{ text: 'OK', style: 'default', onPress: hideAlert }],
          { icon: 'alert-circle', iconColor: COLORS.danger }
        );
        return;
      }
      const fetchedAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      setAlbums(fetchedAlbums);
      setShowAlbumPicker(true);
    } catch (e) {
      console.warn('Failed to fetch albums', e);
    }
  };

  const handleEntireDeviceIndex = async () => {
    try {
      // 1. Prominent Disclosure Check for Google Compliance
      const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
      if (accepted !== 'true') {
        setOnDisclosureAgree(() => () => handleEntireDeviceIndex());
        setShowStorageDisclosure(true);
        return;
      }

      if (Platform.OS === 'android') {
        showAlert(
          'Scan Entire Device',
          'FileLensPro will index and search all documents (PDFs, Word, TXT) and photos across your phone with 100% on-device privacy.',
          [
            {
              text: 'Start Scan',
              style: 'default',
              onPress: async () => {
                hideAlert();

                // Listen for when the user returns to the app from Settings
                let handled = false;
                const onReturn = async (nextState: string) => {
                  if (nextState === 'active' && !handled) {
                    handled = true;
                    subscription.remove();
                    await addIndexTarget('device_root');
                    handleStartIndexing([{ type: 'device_root' }]);
                  }
                };
                const subscription = AppState.addEventListener('change', onReturn);

                try {
                  await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', {
                    data: `package:com.filelenspro.app`
                  });
                } catch (e) {
                  // If opening settings fails, run indexing directly
                  if (!handled) {
                    handled = true;
                    subscription.remove();
                    await addIndexTarget('device_root');
                    handleStartIndexing([{ type: 'device_root' }]);
                  }
                }
              }
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: hideAlert
            }
          ],
          { icon: 'flash', iconColor: COLORS.accent }
        );
      } else {
        await addIndexTarget('all');
        handleStartIndexing([{ type: 'all' }]);
      }
    } catch (e: any) {
      console.warn('Entire device index error:', e);
      handleStartIndexing([{ type: 'all' }]);
    }
  };

  const requestAllFilesAccess = handleEntireDeviceIndex;

  const openDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Documents are not saved to targets since they are explicitly selected one-offs
        handleStartIndexing([{
          type: 'documents',
          files: result.assets.map(a => ({ uri: a.uri, name: a.name, size: a.size || 0, mimeType: a.mimeType }))
        }]);
      }
    } catch (e) {
      console.warn('Doc picker failed', e);
    }
  };

  const openCameraScanner = () => {
    router.push(`/doc-scanner?t=${Date.now()}&initialMode=batch`);
  };

  // ——— Renderers ———

  const renderEmptyState = () => {
    if ((totalFiles === 0 || indexMetrics.indexedFiles === 0) && !isIndexing) return (
      <View style={styles.emptyState}>
        <View style={styles.ctaIconWrap}>
          <Ionicons name="documents" size={48} color={COLORS.accent} />
        </View>
        <Text style={styles.ctaTitle}>Ready to Search</Text>
        <Text style={styles.ctaSubtitle}>
          {indexMetrics.cardsCount > 0
            ? `You have ${indexMetrics.cardsCount} Saved Cards. Index your device to search all PDFs, documents, and photos.`
            : 'FileLensPro needs to index your files before you can search them. You can index your entire photo library, a specific folder, or add one-off documents.'}
        </Text>
        
        <TouchableOpacity onPress={handleEntireDeviceIndex} style={styles.ctaButton}>
          <Ionicons name="flash" size={20} color="#fff" />
          <Text style={styles.ctaButtonText}>Scan Entire Device</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={openSourcePicker} 
          style={styles.ctaSecondaryButton}
        >
          <Ionicons name="folder-open-outline" size={20} color={COLORS.accent} />
          <Text style={[styles.ctaButtonText, { color: COLORS.accent }]}>Choose Specific Folders / Albums</Text>
        </TouchableOpacity>
      </View>
    );

    if (!input) {
      if (recentSearches.length > 0) {
        return (
          <View style={{ paddingHorizontal: 20, paddingTop: 16, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 460, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time" size={16} color={COLORS.muted} />
                <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 }}>RECENT SEARCHES</Text>
              </View>
              <TouchableOpacity onPress={async () => {
                setRecentSearches([]);
                await AsyncStorage.removeItem('recent_searches');
              }} style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
                <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '700' }}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {recentSearches.map(term => (
              <View 
                key={term}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLORS.surface,
                  borderRadius: 14,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: COLORS.surface2,
                  width: '100%',
                  maxWidth: 460,
                  overflow: 'hidden',
                }}
              >
                <TouchableOpacity 
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 }}
                  onPress={() => handleSelectRecentSearch(term)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="search-outline" size={18} color={COLORS.muted} />
                  <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '500', flex: 1 }} numberOfLines={1}>{term}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeRecentSearch(term)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ padding: 14, paddingLeft: 8 }}
                  activeOpacity={0.6}
                >
                  <Ionicons name="close" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );
      }
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={48} color={COLORS.border} />
          <Text style={styles.emptyText}>Search your files</Text>
          <Text style={styles.emptyHint}>
            Type a word to find it in file names, documents, and images.
          </Text>
        </View>
      );
    }

    if (!isSearching && input) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color={COLORS.border} />
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptyHint}>Try a different search query</Text>
        </View>
      );
    }

    return null;
  };

  const renderSortHeader = () => (
    <View style={styles.sortContainer}>
      <Text style={styles.sortTitle}>Sort by:</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortScroll}
      >
        {SORT_COLUMNS.map((col) => {
          const active = sortState.column === col.key;
          return (
            <TouchableOpacity
              key={col.key}
              style={[styles.sortChip, active && styles.sortChipActive]}
              onPress={() => setSort(col.key)}
            >
              <Text style={[styles.sortLabel, active && styles.sortLabelActive]}>
                {col.label}
              </Text>
              {active && (
                <Ionicons 
                  name={sortState.order === 'asc' ? 'arrow-up' : 'arrow-down'} 
                  size={12} 
                  color={COLORS.bg} 
                  style={{ marginLeft: 4 }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const handleLongPress = (item: any) => {
    setBookmarkItem(item);
    setTagInput('');
    setShowTagModal(true);
  };

  const handleOpenPreview = async (item: any) => {
    if (!item?.entry?.contentText && !item?.entry?.ocrText && item?.entry?.id) {
      try {
        const content = await getFileContentById(item.entry.id);
        item.entry.contentText = content.contentText;
        item.entry.ocrText = content.ocrText;
      } catch (e) {}
    }
    const ext = (item?.entry?.extension || '').toLowerCase();
    if (ext === 'pdf' || ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i)) {
      setPreviewMode('original');
    } else {
      setPreviewMode('text');
    }
    setPreviewItem(item);
  };

  const handleAddToCard = (item: any) => {
    if (!item?.entry) return;
    const uri = item.entry.path || item.entry.uri || '';
    const fileId = item.entry.id ? String(item.entry.id) : '';
    const tag = item.entry.customTag || item.entry.custom_tag || '';
    const name = item.entry.name || '';
    router.push({
      pathname: '/create-card',
      params: {
        fileUri: uri,
        fileId: fileId,
        initialTag: tag,
        fileName: name,
      }
    });
  };

  const handleAddToBrain = async (item: any) => {
    if (!item?.entry) return;
    let text = item.entry.ocrText || item.entry.contentText || '';
    const uri = item.entry.path || item.entry.uri || '';
    const name = item.entry.name || 'Document';
    const ext = (item.entry.extension || '').toLowerCase();
    const isImg = ext.match(/^(jpg|jpeg|png|bmp|webp)$/i);

    // If OCR text is missing from DB, extract on-the-fly with high speed
    if (!text && uri) {
      try {
        if (isImg) {
          const ocrRes = await ocrImage(uri);
          text = ocrRes?.text || '';
        } else if (ext === 'pdf') {
          const contentRes = await extractContent(uri);
          text = contentRes?.text || '';
          if (!text) {
            const pageImg = await renderPdfPage(uri, 0);
            if (pageImg) {
              const ocrRes = await ocrImage(pageImg);
              text = ocrRes?.text || '';
            }
          }
        }
      } catch (err) {
        console.warn('[index] Fast on-the-fly OCR extraction failed:', err);
      }
    }

    setPreviewItem(null);
    router.push({
      pathname: '/second-brain',
      params: {
        sharedText: encodeURIComponent(text || name),
        sharedImageUri: isImg ? encodeURIComponent(uri) : undefined,
      },
    });
  };

  const renderResult = ({ item, index }: { item: any; index: number }) => {
    const ext = (item?.entry?.extension || '').toLowerCase();
    const isImage = ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i);
    const uri = item?.entry?.path || item?.entry?.uri || '';
    const imageUri = uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;
    const scoreVal = typeof item?.score === 'number' && !isNaN(item.score) ? item.score.toFixed(0) : '0';

    const isVoiceNote = (item?.entry?.name || '').startsWith('Voice Note') || (item?.entry?.path || '').includes('voice_notes');

    const handleVoiceNoteClick = (resultItem: any) => {
      const fileId = resultItem?.entry?.id;
      const uri = resultItem?.entry?.path || resultItem?.entry?.uri;
      router.push({
        pathname: '/second-brain',
        params: {
          openFileId: fileId ? String(fileId) : undefined,
          openVoiceUri: uri ? String(uri) : undefined,
        },
      });
    };

    return (
      <Reanimated.View
        entering={FadeInDown.delay(getStaggerDelay(index)).springify().damping(18).stiffness(240)}
        layout={cardLayoutTransition}
      >
        <NativeScaleButton 
          style={styles.resultRow}
          onPress={() => {
            if (input.trim()) {
              saveRecentSearch(input.trim());
            }
            if (isVoiceNote) {
              handleVoiceNoteClick(item);
            } else {
              handleOpenPreview(item);
            }
          }}
          onLongPress={() => handleLongPress(item)}
          activeScale={0.98}
          hapticType="light"
        >
          {/* Left Column: Thumbnail + Occurrence Badge below */}
          <View style={styles.resultThumbCol}>
            <View style={[styles.resultIcon, { overflow: 'hidden', padding: 0 }]}>
              <FileThumbnail
                uri={uri}
                name={item?.entry?.name}
                extension={ext}
                isVoiceNote={isVoiceNote}
                style={{ width: '100%', height: '100%' }}
                accentColor={COLORS.accent}
                placeholderBg={COLORS.surface2}
                iconSize={20}
              />
            </View>
            {/* Match Occurrences / Semantic Score Badge moved just below thumbnail */}
            {item?.semanticScore !== undefined ? (
              <View style={[styles.semanticScoreBadge, { marginTop: 4 }]}>
                <Text style={styles.semanticScoreText}>
                  ✨ {Math.round(item.semanticScore * 100)}%
                </Text>
              </View>
            ) : (
              <View style={[styles.matchBadge, { backgroundColor: COLORS.surface2, marginTop: 4 }]}>
                <Ionicons name="search" size={9.5} color={COLORS.accent} />
                <Text style={[styles.matchCountText, { color: COLORS.accent }]}>
                  {item?.matchCount || 1}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.resultInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.resultName, { flex: 1 }]} numberOfLines={1}>
                {item?.entry?.name || 'Untitled'}
              </Text>
            </View>
            <Text style={styles.resultMeta} numberOfLines={1}>
              {formatSize(item?.entry?.size || 0)} | {formatDate(item?.entry?.modified || '')}
            </Text>
            {item?.preview ? (
              <View>
                <Text style={styles.resultPreview} numberOfLines={2}>
                  {item.preview}
                </Text>
                {item.pageNumbers && item.pageNumbers.length > 0 && (
                  <Text style={{ fontSize: 11, color: COLORS.accent, marginTop: 2, fontWeight: 'bold' }}>
                    📄 Found on page{item.pageNumbers.length > 1 ? 's' : ''}: {item.pageNumbers.join(', ')}
                  </Text>
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.resultActionsCol}>
            <View style={styles.resultActionBtnsRow}>
              <NativeScaleButton 
                onPress={(e: any) => { e.stopPropagation(); handleAddToCard(item); }} 
                style={[styles.resultActionBtn, { backgroundColor: COLORS.surface2 }]}
                accessibilityLabel="Add to Card"
                activeScale={0.88}
              >
                <Ionicons name="card-outline" size={20} color={COLORS.accentSoft} />
              </NativeScaleButton>
              <NativeScaleButton 
                onPress={(e: any) => { e.stopPropagation(); handleExportItem(item); }} 
                style={[styles.resultActionBtn, { backgroundColor: COLORS.surface2 }]}
                accessibilityLabel="Export"
                activeScale={0.88}
              >
                <Ionicons name="download-outline" size={20} color={COLORS.accentSoft} />
              </NativeScaleButton>
            </View>
          </View>
        </NativeScaleButton>
      </Reanimated.View>
    );
  };

  const handleSaveSearch = () => {
    if (!input.trim()) return;
    showAlert(
      'Save Search',
      `Save "${input}" for quick access in Saved Searches?`,
      [
        {
          text: 'Save Search',
          style: 'default',
          onPress: async () => {
            hideAlert();
            const name = `Search: ${input}`;
            try {
              await saveSearch(name, input, searchMode);
              showAlert('Saved', 'Search query saved successfully!', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
            } catch (e: any) {
              showAlert('Error', e.message || 'Failed to save search.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
            }
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert }
      ],
      { icon: 'bookmark', iconColor: COLORS.accent }
    );
  };

  const docxWebViewSource = useMemo(() => {
    return {
      html: docHtml ? `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <style>
              body {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: ${COLORS.surface};
                padding: 16px;
                line-height: 1.6;
              }
              * { color: ${COLORS.text} !important; }
              img { max-width: 100%; height: auto; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid ${COLORS.border}; padding: 8px; text-align: left; }
              th { background-color: ${COLORS.surface2}; }
            </style>
          </head>
          <body>${docHtml}</body>
        </html>
      ` : `<div style="padding: 20px; font-family: sans-serif; color: ${COLORS.text};">Loading preview...</div>`
    };
  }, [docHtml, COLORS.surface, COLORS.surface2, COLORS.text, COLORS.border]);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8), paddingBottom: 0 }]}>
      <StatusBar style="light" backgroundColor="transparent" translucent={true} />
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="search-circle" size={26} color={COLORS.accent} />
          <Text style={styles.brandTitle}>FileLensPro</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HeaderMenuButton onPress={() => setShowQuickNavModal(true)} />
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={COLORS.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={
            searchMode === 'similar'
              ? "Search natural language / प्राकृतिक भाषा..."
              : searchMode === 'exact' 
              ? "Type exact phrase..." 
              : searchMode === 'whole_word' 
              ? "Type whole words..." 
              : "Search files, content, OCR..."
          }
          placeholderTextColor={COLORS.muted}
          value={input}
          onChangeText={(text) => {
            setInput(text);
            if (text.trim()) {
              setIsSearching(true);
            } else {
              setIsSearching(false);
              setSearchResults([]);
              useStore.getState().setSearchQuery('');
            }
          }}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (input.trim()) {
              saveRecentSearch(input.trim());
              performSearch(input, true);
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching && (
          <ActivityIndicator 
            size="small" 
            color={searchMode === 'similar' ? '#8B5CF6' : COLORS.accent} 
            style={{ marginRight: 4 }} 
          />
        )}
        {input.length > 0 && !isSearching && (
          <TouchableOpacity 
            onPress={() => { 
              setInput(''); 
              setIsSearching(false); 
              setSearchResults([]); 
              useStore.getState().setSearchQuery(''); 
            }} 
            style={{ padding: 4, marginRight: 4 }}
          >
            <Ionicons name="close-circle" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
        {input.length > 0 && !isSearching && (
          <TouchableOpacity onPress={handleSaveSearch} style={{ padding: 8 }}>
            <Ionicons name="bookmark-outline" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          onPress={() => setShowFilterModal(true)} 
          style={{ padding: 8, paddingRight: 0, position: 'relative' }}
          accessibilityLabel="Search filters and refinement"
        >
          <Ionicons 
            name={activeFilterCount > 0 ? "options" : "options-outline"} 
            size={20} 
            color={activeFilterCount > 0 ? COLORS.accent : COLORS.muted} 
          />
          {activeFilterCount > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: -2,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: COLORS.accent,
              }}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Search Mode Pill Switcher */}
      <View style={{ marginBottom: 4 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modeScrollContainer}
        >
          <TouchableOpacity
            onPress={() => handleModeChange('partial')}
            style={[
              styles.modePill,
              searchMode === 'partial' 
                ? [styles.modePillActive, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]
                : { backgroundColor: COLORS.surface2 + '99', borderColor: COLORS.border }
            ]}
            activeOpacity={0.75}
          >
            <Ionicons 
              name={searchMode === 'partial' ? "flash" : "flash-outline"} 
              size={14} 
              color={searchMode === 'partial' ? '#fff' : COLORS.accent} 
            />
            <Text 
              style={[
                styles.modePillText, 
                { color: searchMode === 'partial' ? '#fff' : COLORS.text },
                searchMode === 'partial' && { fontWeight: '700' }
              ]}
            >
              Quick Search
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleModeChange('similar')}
            style={[
              styles.modePill,
              searchMode === 'similar' 
                ? [styles.modePillActive, { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }]
                : { backgroundColor: '#8B5CF618', borderColor: '#8B5CF644' }
            ]}
            activeOpacity={0.75}
          >
            <Ionicons 
              name="sparkles" 
              size={14} 
              color={searchMode === 'similar' ? '#fff' : '#A78BFA'} 
            />
            <Text 
              style={[
                styles.modePillText, 
                { color: searchMode === 'similar' ? '#fff' : '#A78BFA' },
                searchMode === 'similar' && { fontWeight: '700' }
              ]}
            >
              🧠 Natural Language
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleModeChange('exact')}
            style={[
              styles.modePill,
              searchMode === 'exact' 
                ? [styles.modePillActive, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]
                : { backgroundColor: COLORS.surface2 + '99', borderColor: COLORS.border }
            ]}
            activeOpacity={0.75}
          >
            <Ionicons 
              name={searchMode === 'exact' ? "locate" : "locate-outline"} 
              size={14} 
              color={searchMode === 'exact' ? '#fff' : COLORS.muted} 
            />
            <Text 
              style={[
                styles.modePillText, 
                { color: searchMode === 'exact' ? '#fff' : COLORS.text },
                searchMode === 'exact' && { fontWeight: '700' }
              ]}
            >
              Exact
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleModeChange('whole_word')}
            style={[
              styles.modePill,
              searchMode === 'whole_word' 
                ? [styles.modePillActive, { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]
                : { backgroundColor: COLORS.surface2 + '99', borderColor: COLORS.border }
            ]}
            activeOpacity={0.75}
          >
            <Ionicons 
              name={searchMode === 'whole_word' ? "text" : "text-outline"} 
              size={14} 
              color={searchMode === 'whole_word' ? '#fff' : COLORS.muted} 
            />
            <Text 
              style={[
                styles.modePillText, 
                { color: searchMode === 'whole_word' ? '#fff' : COLORS.text },
                searchMode === 'whole_word' && { fontWeight: '700' }
              ]}
            >
              Whole Word
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statsRow}>
          <Text style={styles.statsText} numberOfLines={1}>
            {indexMetrics.indexedFiles === 0 && indexMetrics.cardsCount > 0
              ? `${indexMetrics.cardsCount} cards • ${ocrDone} OCR'd`
              : `${totalFiles} files • ${ocrDone} OCR'd${ocrPending > 0 ? ` (${ocrPending} pending OCR)` : ''}`}
          </Text>
          {totalFiles > 0 && !isWorkerActive ? (
            <View style={styles.statsActionsRow}>
              {indexMetrics.indexedFiles > 0 && (
                <TouchableOpacity onPress={handleSync} style={styles.reindexBtn}>
                  <Ionicons name="refresh" size={12} color={COLORS.accent} />
                  <Text style={styles.reindexText}>Sync</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={openSourcePicker} style={styles.reindexBtn}>
                <Ionicons name="add" size={13} color={COLORS.accent} />
                <Text style={styles.reindexText}>Add Source</Text>
              </TouchableOpacity>
            </View>
          ) : isWorkerActive ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '700' }}>
                {isIndexing ? 'Indexing...' : 'OCRing...'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Pending OCR / Indexing Encouragement Alert Card (only when idle, never when OCR is already active) */}
      {ocrPending > 0 && !isWorkerActive && (
        <Reanimated.View entering={FadeInDown.springify().damping(16)} style={styles.pendingOcrNoticeCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, marginRight: 8 }}>
            <View style={[styles.pendingAlertIconWrap, { backgroundColor: '#F59E0B22' }]}>
              <Ionicons name="sparkles" size={17} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingAlertTitle, { color: COLORS.text }]}>
                {ocrPending} File{ocrPending > 1 ? 's' : ''} Pending Full-Text OCR
              </Text>
              <Text style={[styles.pendingAlertSubtitle, { color: COLORS.muted }]}>
                Tap "Sync" now to index text & search inside pages!
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.pendingSyncBtn, { backgroundColor: COLORS.accent }]}
            onPress={handleSync}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.pendingSyncBtnText}>Sync</Text>
          </TouchableOpacity>
        </Reanimated.View>
      )}

      {/* Indexing progress banner */}
      <IndexingProgressBanner 
        onCancel={handleCancelIndexing} 
        onOpenBatteryModal={() => setShowBatteryModal(true)}
        isBatteryUnrestricted={isBatteryUnrestricted}
      />

      {/* Sort header (only when results exist) */}
      {searchResults.length > 0 && renderSortHeader()}

      {/* Results */}
      <FlatList
        data={searchResults}
        keyExtractor={(item, index) => `${item?.entry?.id ?? index}_${item?.entry?.path ?? index}_${index}`}
        renderItem={renderResult}
        contentContainerStyle={[styles.resultsList, { paddingBottom: Math.max(insets.bottom, 24) + 84 }]}
        ListEmptyComponent={renderEmptyState()}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={11}
        removeClippedSubviews={false}
        updateCellsBatchingPeriod={30}
      />

      {/* Source Picker Modal */}
      {showSourcePicker && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Source</Text>
              
              <TouchableOpacity 
                style={[styles.modalOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: 10 }]} 
                onPress={async () => { 
                  setShowSourcePicker(false);
                  handleEntireDeviceIndex();
                }}
              >
                <Ionicons name="flash" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.modalOptionText, { color: '#fff', fontWeight: 'bold' }]}>Scan Entire Device</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} 
                onPress={async () => { 
                  setShowSourcePicker(false);
                  openAlbumPicker();
                }}
              >
                <Ionicons name="images-outline" size={20} color={COLORS.accent} style={{ marginRight: 8 }} />
                <Text style={styles.modalOptionText}>Photo Gallery & Media Albums</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} 
                onPress={async () => { 
                  setShowSourcePicker(false);
                  openDocumentPicker();
                }}
              >
                <Ionicons name="document-attach-outline" size={20} color={COLORS.accent} style={{ marginRight: 8 }} />
                <Text style={styles.modalOptionText}>Choose Documents (Multi-Select)</Text>
              </TouchableOpacity>

              {Platform.OS === 'android' && (
                <TouchableOpacity 
                  style={[styles.modalOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} 
                  onPress={async () => { 
                    setShowSourcePicker(false);
                    try {
                      const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
                      if (accepted !== 'true') {
                        setOnDisclosureAgree(() => () => setShowFolderPicker(true));
                        setShowStorageDisclosure(true);
                        return;
                      }
                    } catch (e) {}
                    setShowFolderPicker(true);
                  }}
                >
                  <Ionicons name="folder-open-outline" size={20} color={COLORS.accent} style={{ marginRight: 8 }} />
                  <Text style={styles.modalOptionText}>Choose Specific Folders</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={[styles.modalOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} 
                onPress={async () => {
                  setShowSourcePicker(false);
                  openCameraScanner();
                }}
              >
                <Ionicons name="camera-outline" size={20} color={COLORS.accent} style={{ marginRight: 8 }} />
                <Text style={styles.modalOptionText}>Scan Document (Camera)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalOption, styles.modalCancel]} onPress={() => setShowSourcePicker(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Album Picker Modal */}
      {showAlbumPicker && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '80%', flex: 1 }]}>
            <Text style={styles.modalTitle}>Choose Media Album</Text>
            
            <TouchableOpacity
              style={[styles.modalOption, { backgroundColor: COLORS.accent + '20', borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }]}
              onPress={async () => {
                setShowAlbumPicker(false);
                await addIndexTarget('all');
                handleStartIndexing([{ type: 'all' }]);
              }}
            >
              <Ionicons name="images" size={20} color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.modalOptionText, { color: COLORS.accent, fontWeight: 'bold' }]}>
                All Gallery Photos & Albums
              </Text>
            </TouchableOpacity>

            <FlatList
              data={albums}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.modalOption}
                  onPress={async () => {
                    setShowAlbumPicker(false);
                    await addIndexTarget('album', item.id);
                    handleStartIndexing([{ type: 'album', albumId: item.id }]);
                  }}
                >
                  <Text style={styles.modalOptionText}>{item.title} ({item.assetCount})</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.modalOption, styles.modalCancel]} onPress={() => setShowAlbumPicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 2000, backgroundColor: COLORS.bg }]}>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {/* Clean Top Header: Back + Title + View Mode */}
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={() => { setPreviewItem(null); setPreviewMode('text'); }} style={{ padding: 6, marginRight: 6 }}>
                <Ionicons name="arrow-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              
              <View style={styles.previewTitleContainer}>
                <Ionicons 
                  name={previewItem.entry.extension.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/) ? 'image' : 'document-text'} 
                  size={19} 
                  color={COLORS.accent} 
                />
                <Text style={styles.previewTitle} numberOfLines={1}>{previewItem.entry.name}</Text>
              </View>

              <TouchableOpacity
                onPress={() => setPreviewMode(m => m === 'text' ? 'original' : 'text')}
                style={[styles.previewCloseBtn, { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }]}
              >
                <Ionicons name={previewMode === 'text' ? 'image-outline' : 'document-text-outline'} size={17} color={COLORS.accent} />
                <Text style={{ color: COLORS.accent, marginLeft: 5, fontWeight: '700', fontSize: 12 }}>
                  {previewMode === 'text' ? 'View Original' : 'View Text'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sub-bar: Left Matching Occurrence Navigator | Right Download/Export & Share */}
            <View style={styles.previewSubBar}>
              {highlighterRef.current.hasMatches ? (
                <View style={styles.subBarOccurrenceNav}>
                  <TouchableOpacity onPress={() => gotoMatch(-1)} style={{ padding: 3 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-up" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, color: COLORS.accent, fontWeight: '700', paddingHorizontal: 4 }}>
                    {highlighterRef.current.statusText()}
                  </Text>
                  <TouchableOpacity onPress={() => gotoMatch(1)} style={{ padding: 3 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-down" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="document-outline" size={14} color={COLORS.muted} />
                  <Text style={{ color: COLORS.muted, fontSize: 11.5 }}>
                    {formatSize(previewItem.entry.size)} • {previewItem.entry.extension.toUpperCase()}
                  </Text>
                </View>
              )}

              <View style={styles.subBarActions}>
                <TouchableOpacity
                  onPress={() => openExportModal()}
                  style={styles.subBarActionBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Download or Export"
                >
                  <Ionicons name="download-outline" size={16} color={COLORS.text} />
                  <Text style={[styles.subBarActionBtnText, { color: COLORS.text }]}>Export</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleShare(previewItem)}
                  style={styles.subBarActionBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Share"
                >
                  <Ionicons name="share-outline" size={16} color={COLORS.text} />
                  <Text style={[styles.subBarActionBtnText, { color: COLORS.text }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>

            {previewMode === 'original' ? (
              <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
                {previewItem.entry.extension.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i) ? (
                  <Image 
                    source={{ uri: previewItem.entry.path }} 
                    style={{ flex: 1, resizeMode: 'contain' }} 
                  />
                ) : previewItem.entry.extension.toLowerCase() === 'pdf' ? (
                  <SafePdfView
                    uri={previewItem.entry.path}
                    colors={COLORS}
                  />
                ) : previewItem.entry.extension.match(/^(docx|xlsx|csv)$/i) ? (
                  <WebView 
                    source={docxWebViewSource}
                    style={{ flex: 1, backgroundColor: COLORS.surface }} 
                    originWhitelist={['*']}
                  />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="document-text" size={64} color={COLORS.muted} />
                    <Text style={{ marginTop: 16, color: COLORS.text, fontSize: 16, marginBottom: 24 }}>
                      Document Preview not available natively.
                    </Text>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
                      onPress={async () => {
                         try {
                           if (await Sharing.isAvailableAsync()) {
                             let shareUri = previewItem.entry.path;
                             if (shareUri.startsWith('content://') || shareUri.startsWith('file:///storage/')) {
                               const filename = shareUri.split('/').pop() || `share_${Date.now()}`;
                               const cacheUri = FileSystem.cacheDirectory + filename;
                               await FileSystem.copyAsync({ from: shareUri, to: cacheUri });
                               shareUri = cacheUri;
                             }
                             await Sharing.shareAsync(shareUri);
                           } else {
                             showAlert('Not Available', 'Native sharing is not available on this device', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
                           }
                         } catch(e: any) {
                           if (!e?.message?.includes('Another share request')) {
                             console.warn('Share error:', e);
                           }
                         }
                      }}
                    >
                      <Ionicons name="open-outline" size={20} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 8 }}>Open with Native App</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Floating Side Arrows in Original Mode */}
                {searchResults.length > 1 && currentResultIndex > 0 && (
                  <TouchableOpacity
                    onPress={() => handleNavigateResult(-1)}
                    style={[styles.floatingSideBtn, styles.floatingLeftBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                  </TouchableOpacity>
                )}

                {searchResults.length > 1 && currentResultIndex >= 0 && currentResultIndex < searchResults.length - 1 && (
                  <TouchableOpacity
                    onPress={() => handleNavigateResult(1)}
                    style={[styles.floatingSideBtn, styles.floatingRightBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-forward" size={26} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {/* In-Document Search Bar */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLORS.surface2,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  marginHorizontal: 16,
                  marginTop: 10,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: COLORS.border
                }}>
                  <Ionicons name="search" size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 8 }}
                    placeholder="Search in this document..."
                    placeholderTextColor={COLORS.muted}
                    value={inDocSearchQuery}
                    onChangeText={setInDocSearchQuery}
                    returnKeyType="search"
                  />
                  {inDocSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setInDocSearchQuery('')} style={{ padding: 4, marginRight: 6 }}>
                      <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                    </TouchableOpacity>
                  )}
                  {highlighterRef.current.hasMatches && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderLeftWidth: 1, borderLeftColor: COLORS.border, paddingLeft: 8 }}>
                      <Text style={{ fontSize: 12, color: COLORS.accent, fontWeight: '700' }}>
                        {`${highlighterRef.current.currentIndex + 1}/${highlighterRef.current.count}`}
                      </Text>
                      <TouchableOpacity onPress={() => gotoMatch(-1)} style={{ padding: 2 }}>
                        <Ionicons name="chevron-up" size={20} color={COLORS.text} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => gotoMatch(1)} style={{ padding: 2 }}>
                        <Ionicons name="chevron-down" size={20} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <FlatList 
                  ref={flatListRef}
                  style={styles.previewScroll} 
                  contentContainerStyle={{ padding: 16 }}
                  extraData={highlightVersion}
                  data={(previewItem.entry.ocrText || previewItem.entry.contentText || '').split('\n')}
                  keyExtractor={(_, i) => String(i)}
                  ListEmptyComponent={<Text style={[styles.previewText, { color: COLORS.muted }]}>No content available for preview.</Text>}
                  initialNumToRender={50}
                  windowSize={15}
                renderItem={({ item: line, index }) => {
                  const h = highlighterRef.current;
                  const lineNum = index + 1;
                  const lineMatches = h.hasMatches ? h.matches.filter(m => m.line === lineNum) : [];
                  
                  if (lineMatches.length === 0) {
                    const pageMatch = line.match(/\[Page (\d+)\]/i);
                    if (pageMatch) {
                      return (
                        <View style={{ backgroundColor: COLORS.surface, padding: 8, marginVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'center' }}>
                          <Text style={{ color: COLORS.accent, fontWeight: 'bold', fontSize: 13 }}>
                            📄 Page {pageMatch[1]}
                          </Text>
                        </View>
                      );
                    }
                    // Empty lines need a space to render correct height
                    return <Text style={styles.previewText} selectable>{line || ' '}</Text>;
                  }
                  
                  const segments: React.ReactNode[] = [];
                  let lastCol = 1;
                  lineMatches.forEach((m, i) => {
                    if (m.col > lastCol) {
                      segments.push(
                        <Text key={`t-${i}`} style={styles.previewText}>
                          {line.substring(lastCol - 1, m.col - 1)}
                        </Text>
                      );
                    }
                    const isCurrent = h.matches[h.currentIndex] === m;
                    const localEnd = (m.col - 1) + (m.end - m.start);
                    segments.push(
                      <Text
                        key={`h-${i}`}
                        style={isCurrent ? styles.highlightCurrent : styles.highlight}
                      >
                        {line.substring(m.col - 1, localEnd)}
                      </Text>
                    );
                    lastCol = localEnd + 1;
                  });
                  if (lastCol <= line.length) {
                    segments.push(
                      <Text key="tail" style={styles.previewText}>
                        {line.substring(lastCol - 1)}
                      </Text>
                    );
                  }
                  
                  return <Text style={styles.previewText} selectable>{segments}</Text>;
                }}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 100);
                }}
              />
            </View>
          )}

          {/* Inline Bottom Bar: Add to Card, Add to Brain, Copy, Organizer */}
          <View style={styles.previewBottomBar}>
            <TouchableOpacity
              onPress={() => handleAddToCard(previewItem)}
              style={styles.bottomBarBtn}
              activeOpacity={0.7}
              accessibilityLabel="Add to Card"
            >
              <Ionicons name="card-outline" size={19} color={COLORS.accent} />
              <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]} numberOfLines={1}>
                Add to Card
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAddToBrain(previewItem)}
              style={styles.bottomBarBtn}
              activeOpacity={0.7}
              accessibilityLabel="Add to Brain"
            >
              <Ionicons name="bulb-outline" size={19} color={COLORS.accent} />
              <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]} numberOfLines={1}>
                Add to Brain
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleCopyText()}
              style={styles.bottomBarBtn}
              activeOpacity={0.7}
              accessibilityLabel="Copy Text"
            >
              <Ionicons name="copy-outline" size={19} color={COLORS.accent} />
              <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]} numberOfLines={1}>
                Copy Text
              </Text>
            </TouchableOpacity>

            {previewItem.entry.extension.toLowerCase() === 'pdf' && (
              <TouchableOpacity
                onPress={() => {
                  const p = previewItem.entry.path || (previewItem.entry as any).uri || '';
                  const n = previewItem.entry.name || (previewItem.entry as any).filename || 'document.pdf';
                  setPreviewItem(null);
                  router.push(`/page-organizer?pdfUri=${encodeURIComponent(p)}&fileName=${encodeURIComponent(n)}`);
                }}
                style={styles.bottomBarBtn}
                activeOpacity={0.7}
                accessibilityLabel="Organizer"
              >
                <Ionicons name="layers-outline" size={19} color={COLORS.accent} />
                <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]} numberOfLines={1}>
                  Organizer
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Light Gallery Result Navigation Bar (Works for Both View Text & View Original) */}
          {searchResults.length > 1 && currentResultIndex >= 0 && (
            <View style={[styles.galleryNavBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
              <TouchableOpacity
                onPress={() => handleNavigateResult(-1)}
                disabled={currentResultIndex <= 0}
                style={[
                  styles.galleryNavBtn,
                  { backgroundColor: currentResultIndex <= 0 ? COLORS.surface2 : COLORS.accentSoft + '22' }
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={currentResultIndex <= 0 ? COLORS.muted : COLORS.accent}
                />
                <Text style={[
                  styles.galleryNavBtnText,
                  { color: currentResultIndex <= 0 ? COLORS.muted : COLORS.accent }
                ]}>
                  Prev
                </Text>
              </TouchableOpacity>

              <View style={[styles.galleryIndexBadge, { backgroundColor: COLORS.surface2 }]}>
                <Ionicons name="layers-outline" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
                <Text style={[styles.galleryIndexText, { color: COLORS.text }]}>
                  <Text style={{ fontWeight: 'bold', color: COLORS.accent }}>{currentResultIndex + 1}</Text>
                  <Text style={{ color: COLORS.muted }}> / {searchResults.length}</Text>
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleNavigateResult(1)}
                disabled={currentResultIndex >= searchResults.length - 1}
                style={[
                  styles.galleryNavBtn,
                  { backgroundColor: currentResultIndex >= searchResults.length - 1 ? COLORS.surface2 : COLORS.accentSoft + '22' }
                ]}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.galleryNavBtnText,
                  { color: currentResultIndex >= searchResults.length - 1 ? COLORS.muted : COLORS.accent }
                ]}>
                  Next
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={currentResultIndex >= searchResults.length - 1 ? COLORS.muted : COLORS.accent}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    )}

    {/* Modern Smart Search Filter Modal */}
    <SearchFilterModal
      visible={showFilterModal}
      onClose={() => setShowFilterModal(false)}
      activeFilters={activeFilters}
      onApplyFilters={(newFilters, newMode) => {
        setFilters(newFilters);
        if (newMode && newMode !== searchMode) {
          handleModeChange(newMode);
        }
      }}
      currentSearchMode={searchMode}
      onSelectSearchMode={handleModeChange}
    />

    {/* Smart Tag Management Modal */}
    <TagManagementModal
      visible={showTagModal && !!bookmarkItem}
      fileUri={bookmarkItem?.entry?.path || bookmarkItem?.entry?.uri || ''}
      fileName={bookmarkItem?.entry?.name || ''}
      initialTags={bookmarkItem?.entry?.customTag ? [bookmarkItem.entry.customTag] : []}
      contentText={bookmarkItem?.entry?.contentText}
      ocrText={bookmarkItem?.entry?.ocrText}
      onSave={async (tags) => {
        setShowTagModal(false);
        try {
          await addBookmark(bookmarkItem.entry.path, bookmarkItem.entry.name, tags);
          showAlert('Bookmark Saved', 'Bookmark added successfully with tags!', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
        } catch (e: any) {
          showAlert('Error', e.message || 'Failed to save bookmark.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
        }
      }}
      onClose={() => {
        setShowTagModal(false);
        setBookmarkItem(null);
      }}
    />

      {/* Quick Navigation & Tools Context Modal */}
      <QuickNavModal
        visible={showQuickNavModal}
        onClose={() => setShowQuickNavModal(false)}
      />

      {/* Tutorial Modal */}
      <TutorialModal 
        visible={showTutorialModal} 
        onClose={() => setShowTutorialModal(false)} 
      />

        {/* Floating Action Buttons */}
        {!isSearching && (
          <>
            <TouchableOpacity 
              style={[styles.fabSecondary, { bottom: 20 + insets.bottom + 68 }]} 
              onPress={() => router.push('/scanner')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.8}
            >
              <Ionicons name="qr-code" size={20} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.fab, { bottom: 20 + insets.bottom }]} 
              onPress={openCameraScanner}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={26} color="#fff" />
            </TouchableOpacity>
          </>
        )}

      {/* Export Modal */}
      <ExportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        content={exportContentText}
        defaultFileName={exportFileName}
        imageUri={exportImageUri}
      />

      <FolderSelectionModal
        visible={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSave={async (selectedFolders) => {
          if (selectedFolders.length === 0) return;
          
          await clearIndexTargetsByType('device_folder');
          await clearIndexTargetsByType('saf_folder');
          await clearIndexTargetsByType('all'); // Clear legacy targets
          await clearIndexTargetsByType('album'); // Clear legacy targets
          for (const folderUri of selectedFolders) {
            const type = folderUri.startsWith('content://') ? 'saf_folder' : 'device_folder';
            await addIndexTarget(type, folderUri);
          }
          
          // Trigger indexing with the new folders
          const targets = selectedFolders.map(uri => ({
            type: uri.startsWith('content://') ? 'saf_folder' : 'device_folder',
            uri
          } as IndexTarget));
          handleStartIndexing(targets);
        }}
      />

      <StorageDisclosureModal
        visible={showStorageDisclosure}
        onAgree={async () => {
          setShowStorageDisclosure(false);
          await AsyncStorage.setItem('storage_disclosure_accepted', 'true');
          if (onDisclosureAgree) {
            onDisclosureAgree();
            setOnDisclosureAgree(null);
          }
        }}
        onCancel={() => {
          setShowStorageDisclosure(false);
          setOnDisclosureAgree(null);
        }}
      />

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

      {/* Image Crop & Border Alignment Modal */}
      <ImageCropModal
        visible={cropModalVisible}
        imageUri={cropTargetImage?.uri || null}
        fileName={cropTargetImage?.name}
        onClose={() => setCropModalVisible(false)}
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

  </View>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 500,
  },
  fabSecondary: {
    position: 'absolute',
    bottom: 100, // Above the primary FAB (24 + 60 + 16 gap)
    right: 34, // Centered horizontally with main FAB (60/2 - 40/2 = 10, 24 + 10 = 34)
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.surface2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 500,
  },
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  headerMenuBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  navModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  navModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  navModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    marginBottom: 10,
  },
  navModalHeaderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  navModalSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  navModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navGroupLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  navItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  navItemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  navItemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  navItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  navItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 2,
  },
  headerCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginVertical: 4,
    gap: 8,
  },
  quickAccessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  quickAccessIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessChipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginVertical: 4,
    paddingHorizontal: 10,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.surface2,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13.5,
    paddingVertical: Platform.OS === 'android' ? 4 : 8,
    paddingHorizontal: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: FONTS.regular,
  },
  statsBar: {
    paddingHorizontal: 14,
    paddingVertical: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  statsText: {
    color: COLORS.muted,
    fontSize: 11,
    flex: 1,
    marginRight: 6,
  },
  statsActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reindexBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
    paddingHorizontal: 8,
    height: 25,
    borderRadius: 6,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scanDeviceBtn: {
    backgroundColor: COLORS.accent + '20',
    borderColor: COLORS.accent + '55',
  },
  reindexText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  // ——— Indexing Banner ———
  indexingBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.surface2,
  },
  indexingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  indexingPatientNotice: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  indexingTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
    flex: 1,
  },
  cancelBtn: {
    padding: 2,
  },
  progressBarBg: {
    height: 3.5,
    backgroundColor: COLORS.surface2,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 3,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  indexingMeta: {
    color: COLORS.muted,
    fontSize: 10.5,
  },
  indexingFile: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 1,
    fontStyle: 'italic',
  },
  pendingOcrNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F59E0B40',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
  pendingAlertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingAlertTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  pendingAlertSubtitle: {
    fontSize: 10.5,
    marginTop: 1,
  },
  pendingSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pendingSyncBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // ——— Empty / CTA State ———
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  ctaIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ctaTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  ctaSubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 14,
    width: '100%',
    maxWidth: 320,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 14,
    width: '100%',
    maxWidth: 320,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  emptyText: { color: COLORS.muted, fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyHint: { color: COLORS.muted, fontSize: 13, marginTop: 4, textAlign: 'center' },

  // ——— Sort Header ———
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  sortTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.muted,
    marginRight: 8,
  },
  sortScroll: {
    alignItems: 'center',
    gap: 6,
    paddingRight: 16,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surface2,
  },
  sortChipActive: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.text,
  },
  sortLabel: {
    color: COLORS.muted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  sortLabelActive: {
    color: COLORS.bg,
  },

  // ——— Results ———
  resultsList: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 6 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: COLORS.surface2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1.5,
  },
  resultThumbCol: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginRight: 10,
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: { flex: 1 },
  resultName: { color: COLORS.text, fontSize: 13.5, fontWeight: '600', marginBottom: 1 },
  resultMeta: { color: COLORS.muted, fontSize: 11, marginTop: 0 },
  resultPreview: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 1.5,
    lineHeight: 14.5,
    fontStyle: 'italic',
  },
  resultActionsCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4.5,
    paddingLeft: 6,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  matchCountText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  semanticScoreBadge: {
    backgroundColor: '#8B5CF622',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  semanticScoreText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  resultActionBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ——— Modals ———
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 18,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surface2,
    marginBottom: 10,
  },
  modalOptionText: {
    color: COLORS.text,
    fontSize: 15.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  modalCancelText: {
    color: COLORS.muted,
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  
  // â”€â”€â”€ Preview Modal â”€â”€â”€
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  previewTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 16,
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  previewCloseBtn: {
    padding: 8,
    marginLeft: 4,
  },
  previewNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    marginRight: 8,
  },
  navBtn: {
    padding: 6,
  },
  navText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  previewScroll: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  previewText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
  },
  highlight: {
    backgroundColor: COLORS.warning,
    color: '#000',
  },
  highlightCurrent: {
    backgroundColor: COLORS.accent,
    color: '#fff',
    fontWeight: 'bold',
  },
  shareBtn: {
    padding: 4,
    marginRight: 8,
  },
  modeScrollContainer: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  modePillActive: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.5,
    elevation: 3,
  },
  modePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  galleryNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  galleryNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  galleryNavBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  galleryIndexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  galleryIndexText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewSubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  subBarOccurrenceNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  subBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subBarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subBarActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  previewBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 6,
  },
  bottomBarBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 10,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 52,
  },
  bottomBarBtnText: {
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  floatingSideBtn: {
    position: 'absolute',
    top: '46%',
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  floatingLeftBtn: {
    left: 12,
  },
  floatingRightBtn: {
    right: 12,
  },
});
