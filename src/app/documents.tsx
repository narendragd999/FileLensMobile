/**
 * documents.tsx — Document Hub & In-App Viewer/Editor.
 *
 * Implements:
 *   - Document list layout (thumbnail, title, date/page count, tag chips)
 *   - Document Viewer & Editor ([Image], [Text], [Smart data] tabs)
 *   - Recrop, Rotate Left/Right, Filter presets, Full OCR text viewer, Smart data extraction
 *   - In-app PDF Viewer with Back button and robust rendering
 *   - Seamless integration with Page Organizer & Camera Scanner
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
  RefreshControl,
  Image,
  Dimensions,
  Switch,
  StatusBar,
  Linking,
  Animated,
  AppState,
  BackHandler,
  LayoutAnimation,
  UIManager,
  PanResponder,
  InteractionManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

import { useThemeColors } from '../utils/theme';
import { useStore } from '../store/useStore';
import { NativeScaleButton } from '../components/NativeScaleButton';
import { HeaderMenuButton } from '../components/QuickNavModal';
import Reanimated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutDown,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
} from 'react-native-reanimated';
import { cardLayoutTransition, getStaggerDelay, MotionTiming } from '../utils/motion';
import { PageScrubberSlider } from '../components/PageScrubberSlider';
import { Haptics } from '../utils/haptics';
import {
  getAllPdfDocuments,
  upsertFile,
  getFileContent,
  getFileContentById,
  updateFileOcrContent,
  renameDocument,
  deleteDocument,
  getDatabase,
  updateDocumentPageCount,
} from '../services/database';
import { getBookmarks, removeBookmark, addBookmark } from '../services/bookmarksService';
import { formatSize, formatDate } from '../utils/format';
import { renderPdfToImages, invalidatePdfRenderCache, renderPdfPage } from '../services/indexerService';
import { extractContent } from '../services/contentExtractor';
import {
  rotatePagesInPdf,
  deletePagesFromPdf,
  mergePdfs,
  insertPagesIntoPdf,
  getPdfPagesInfo,
  replacePageWithImage,
  renderPdfWithPageRotations,
  commitPagesBatchToPdf,
  PageCommitSpec,
} from '../services/pdfWorkbenchService';
import { WebView } from 'react-native-webview';
import { generateSearchablePdf, ScanPage, enqueueBackgroundPdfOcr, indexScannedDocument } from '../services/scannerService';
import { extractTextOrOcrPdf } from '../services/pdfOcrService';
import { ocrQueueManager } from '../services/ocrQueueManager';
import { ocrImage } from '../services/ocrService';
import { ScannerExportModal } from '../components/ScannerExportModal';
import { ScannerCropEditorModal } from '../components/ScannerCropEditorModal';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { DocumentWatermarkModal } from '../components/DocumentWatermarkModal';
import { DocumentSignatureModal } from '../components/DocumentSignatureModal';
import {
  getPdfThumbnail,
  normalizeCapturedPhoto,
  detectDocumentEdges,
  cropAndRotateImage,
  applyWatermarkToImage,
  applyWatermarkToMultipleImages,
  applySignatureToImage,
  applyFilterToImage,
  buildPdfFromImages,
  cropAndStraightenDocument,
  launchGoogleDocScanner,
} from 'expo-pdf-to-image';

interface PdfDocItem {
  id: number;
  uri: string;
  name: string;
  extension: string;
  size: number;
  modified: string;
  category: string;
  ocrStatus: string;
  isCard: number;
  isScanned: boolean;
  isBookmarked?: boolean;
  pageCount?: number;
  thumbnailUri?: string;
  ocrText?: string;
  contentText?: string;
}

const thumbStyles = StyleSheet.create({
  rowThumbWrap: {
    width: 48,
    height: 60,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  gridThumb: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  pageCountBadge: {
    position: 'absolute',
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  pageCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
});

const thumbnailUriCache = new Map<string, string>();

const PdfDocThumbnail = React.memo(({
  uri,
  isScanned,
  pageCount,
  isGrid,
  accentColor,
  placeholderBg,
}: {
  uri: string;
  isScanned: boolean;
  pageCount?: number;
  isGrid?: boolean;
  accentColor: string;
  placeholderBg: string;
}) => {
  const [thumbUri, setThumbUri] = useState<string | null>(() => thumbnailUriCache.get(uri) || null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = thumbnailUriCache.get(uri);
    if (cached) {
      setThumbUri(cached);
      return;
    }

    getPdfThumbnail(uri).then(res => {
      if (active && res) {
        thumbnailUriCache.set(uri, res);
        setThumbUri(res);
      } else if (active) {
        setHasError(true);
      }
    }).catch(() => {
      if (active) setHasError(true);
    });
    return () => { active = false; };
  }, [uri]);

  const badgeText = isScanned ? 'SCAN' : 'PDF';

  return (
    <View
      style={[
        isGrid ? thumbStyles.gridThumb : thumbStyles.rowThumbWrap,
        { backgroundColor: placeholderBg },
      ]}
    >
      {thumbUri && !hasError ? (
        <Image
          source={{ uri: thumbUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <Ionicons name="document-text" size={isGrid ? 36 : 24} color={accentColor} />
      )}
      <View style={thumbStyles.pageCountBadge}>
        <Text style={thumbStyles.pageCountBadgeText}>{badgeText}</Text>
      </View>
    </View>
  );
});

async function persistImageForUndo(uri: string): Promise<string> {
  if (!uri) return uri;
  try {
    const undoDir = `${FileSystem.cacheDirectory}undo_snapshots/`;
    const dirInfo = await FileSystem.getInfoAsync(undoDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(undoDir, { intermediates: true });
    }
    const cleanName = `snap_${Date.now()}_${Math.floor(Math.random() * 100000)}.jpg`;
    const dest = `${undoDir}${cleanName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.warn('[documents] persistImageForUndo failed:', e);
    return uri;
  }
}

interface ViewerPageItemProps {
  pageUri: string;
  pageIndex: number;
  rotation: number;
  activeFilterPreset: string;
  windowWidth: number;
  isDark: boolean;
  onImageError?: (uri: string) => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

const ViewerPageItem = React.memo(
  function ViewerPageItem({
    pageUri,
    pageIndex,
    rotation,
    activeFilterPreset,
    windowWidth,
    isDark,
    onImageError,
    onToggleFullscreen,
    isFullscreen = false,
  }: ViewerPageItemProps) {
    const scale = useRef(new Animated.Value(1)).current;
    const panX = useRef(new Animated.Value(0)).current;
    const panY = useRef(new Animated.Value(0)).current;

    const currentScale = useRef<number>(1);
    const currentPanX = useRef<number>(0);
    const currentPanY = useRef<number>(0);

    const initialDistance = useRef<number>(0);
    const initialScale = useRef<number>(1);
    const lastTap = useRef<number>(0);

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
          onMoveShouldSetPanResponder: (evt, gestureState) => {
            const touches = evt.nativeEvent.touches;
            return (
              touches.length === 2 ||
              (currentScale.current > 1.05 && (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3))
            );
          },
          onPanResponderGrant: (evt) => {
            const touches = evt.nativeEvent.touches;
            if (touches.length === 2) {
              const dx = touches[0].pageX - touches[1].pageX;
              const dy = touches[0].pageY - touches[1].pageY;
              initialDistance.current = Math.hypot(dx, dy);
              initialScale.current = currentScale.current;
            }
          },
          onPanResponderMove: (evt, gestureState) => {
            const touches = evt.nativeEvent.touches;
            if (touches.length === 2) {
              const dx = touches[0].pageX - touches[1].pageX;
              const dy = touches[0].pageY - touches[1].pageY;
              const distance = Math.hypot(dx, dy);
              if (initialDistance.current > 0) {
                const ratio = distance / initialDistance.current;
                const newScale = Math.min(Math.max(initialScale.current * ratio, 0.85), 4.5);
                currentScale.current = newScale;
                scale.setValue(newScale);
              }
            } else if (touches.length === 1 && currentScale.current > 1.05) {
              const maxPanX = (windowWidth * (currentScale.current - 1)) / 2;
              const maxPanY = (windowWidth * 1.3 * (currentScale.current - 1)) / 2;
              const nextX = Math.min(Math.max(currentPanX.current + gestureState.dx, -maxPanX), maxPanX);
              const nextY = Math.min(Math.max(currentPanY.current + gestureState.dy, -maxPanY), maxPanY);
              panX.setValue(nextX);
              panY.setValue(nextY);
            }
          },
          onPanResponderRelease: (evt, gestureState) => {
            currentPanX.current += gestureState.dx;
            currentPanY.current += gestureState.dy;

            if (currentScale.current < 1.05) {
              currentScale.current = 1;
              currentPanX.current = 0;
              currentPanY.current = 0;
              Animated.parallel([
                Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
                Animated.spring(panX, { toValue: 0, useNativeDriver: true }),
                Animated.spring(panY, { toValue: 0, useNativeDriver: true }),
              ]).start();
            } else {
              const maxPanX = (windowWidth * (currentScale.current - 1)) / 2;
              const maxPanY = (windowWidth * 1.3 * (currentScale.current - 1)) / 2;
              const clampedX = Math.min(Math.max(currentPanX.current, -maxPanX), maxPanX);
              const clampedY = Math.min(Math.max(currentPanY.current, -maxPanY), maxPanY);
              currentPanX.current = clampedX;
              currentPanY.current = clampedY;
              Animated.parallel([
                Animated.spring(panX, { toValue: clampedX, useNativeDriver: true }),
                Animated.spring(panY, { toValue: clampedY, useNativeDriver: true }),
              ]).start();
            }
          },
        }),
      [windowWidth]
    );

    const handleTap = () => {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        // Double tap: toggle between 1x and 2.2x
        if (currentScale.current > 1.2) {
          currentScale.current = 1;
          currentPanX.current = 0;
          currentPanY.current = 0;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(panX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(panY, { toValue: 0, useNativeDriver: true }),
          ]).start();
        } else {
          currentScale.current = 2.2;
          currentPanX.current = 0;
          currentPanY.current = 0;
          Animated.parallel([
            Animated.spring(scale, { toValue: 2.2, useNativeDriver: true }),
            Animated.spring(panX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(panY, { toValue: 0, useNativeDriver: true }),
          ]).start();
        }
      } else {
        onToggleFullscreen?.();
      }
      lastTap.current = now;
    };

    return (
      <View
        style={[styles.viewerPreviewWrap, { width: windowWidth, height: '100%' }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleTap}
          style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
        >
          <Animated.View
            style={[
              {
                width: isFullscreen ? windowWidth * 0.96 : windowWidth * 0.90,
                height: isFullscreen ? '96%' : '92%',
                backgroundColor: '#FFFFFF',
                borderRadius: 6,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.25)',
                elevation: 10,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.38,
                shadowRadius: 18,
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                transform: [
                  { scale },
                  { translateX: panX },
                  { translateY: panY },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: pageUri }}
              style={[
                styles.viewerPreviewImage,
                { transform: [{ rotate: `${rotation}deg` }] },
              ]}
              resizeMode="contain"
              fadeDuration={0}
              onError={() => {
                if (onImageError) onImageError(pageUri);
              }}
            />
          </Animated.View>
        </TouchableOpacity>
        {activeFilterPreset === 'bw' && (
          <View style={[StyleSheet.absoluteFillObject, styles.bwFilterOverlay]} pointerEvents="none" />
        )}
        {activeFilterPreset === 'photo' && (
          <View style={[StyleSheet.absoluteFillObject, styles.photoFilterOverlay]} pointerEvents="none" />
        )}
        {activeFilterPreset === 'color' && (
          <View style={[StyleSheet.absoluteFillObject, styles.colorFilterOverlay]} pointerEvents="none" />
        )}
        {activeFilterPreset === 'auto' && (
          <View style={[StyleSheet.absoluteFillObject, styles.autoFilterOverlay]} pointerEvents="none" />
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.pageUri === next.pageUri &&
    prev.rotation === next.rotation &&
    prev.activeFilterPreset === next.activeFilterPreset &&
    prev.windowWidth === next.windowWidth &&
    prev.isDark === next.isDark &&
    prev.isFullscreen === next.isFullscreen
);

export default function DocumentsScreen() {
  const COLORS = useThemeColors();
  const theme = useStore(state => state.theme);
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const windowWidth = Dimensions.get('window').width;

  const [documents, setDocuments] = useState<PdfDocItem[]>([]);
  const documentsRef = useRef<PdfDocItem[]>(documents);
  documentsRef.current = documents;
  const handledOpenDocUriRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // Sorting & View mode
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc'>('date_desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [showSearchBox, setShowSearchBox] = useState<boolean>(false);

  // Multi-selection mode
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedDocUris, setSelectedDocUris] = useState<Set<string>>(new Set());

  // Context menu for individual document
  const [contextMenuDoc, setContextMenuDoc] = useState<PdfDocItem | null>(null);

  // Document Viewer & Editor state
  const searchParams = useLocalSearchParams<{ openDocUri?: string; idCardSaved?: string; hasBack?: string; pageIndex?: string; t?: string }>();
  const [showScanChoiceModal, setShowScanChoiceModal] = useState<boolean>(false);
  const [showIdGuideModal, setShowIdGuideModal] = useState<boolean>(false);
  const [selectedDoc, setSelectedDoc] = useState<PdfDocItem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeViewerTab, setActiveViewerTab] = useState<'image' | 'text' | 'smart'>('image');
  const tabAnim = useRef(new Animated.Value(0)).current;
  const [segmentBarWidth, setSegmentBarWidth] = useState<number>(0);

  // Hardware BackHandler: exit fullscreen or close viewer with flush on back press
  useEffect(() => {
    const onBackPress = () => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      }
      if (selectedDoc) {
        handleCloseViewer();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isFullscreen, selectedDoc]);

  useEffect(() => {
    const target = activeViewerTab === 'image' ? 0 : activeViewerTab === 'text' ? 1 : 2;
    Animated.spring(tabAnim, {
      toValue: target,
      useNativeDriver: true,
      tension: 200,
      friction: 20,
    }).start();
  }, [activeViewerTab]);

  // AppState listener: automatically flush unsaved page edits if app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state.match(/inactive|background/) && dirtyPagesRef.current.size > 0) {
        commitDirtyPages().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const [viewerPages, setViewerPages] = useState<string[]>([]);
  const [pageRotations, setPageRotations] = useState<number[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [isLoadingPages, setIsLoadingPages] = useState<boolean>(false);
  const [docOcrText, setDocOcrText] = useState<string>('');
  const [isExtractingOcr, setIsExtractingOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeFilterPreset, setActiveFilterPreset] = useState<'none' | 'auto' | 'bw' | 'color' | 'photo'>('none');
  const [isApplyingFilter, setIsApplyingFilter] = useState<boolean>(false);
  const [curvatureCorrection, setCurvatureCorrection] = useState<boolean>(false);
  const originalPagesRef = useRef<string[]>([]);
  const filterWebViewRef = useRef<WebView>(null);
  const rotatingLockRef = useRef<Promise<void>>(Promise.resolve());
  const rotateDebounceTimerRef = useRef<any>(null);
  const pendingRotationsRef = useRef<Record<number, number>>({});
  const cachedPdfUriRef = useRef<string | null>(null);

  // Modals & Sheets
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [showAddPagesModal, setShowAddPagesModal] = useState<boolean>(false);
  const [isEditingMode, setIsEditingMode] = useState<boolean>(false);
  const [showEditSheet, setShowEditSheet] = useState<boolean>(true);
  const editDrawerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isEditingMode) {
      Animated.spring(editDrawerAnim, {
        toValue: 1,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(editDrawerAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isEditingMode]);

  // Vertical hand gesture handler on Edit Sheet: swipe down to minimize back to reading mode
  const editSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 20 || gestureState.vy > 0.3) {
          Haptics.light();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsEditingMode(false);
        }
      },
    })
  ).current;

  // Vertical hand gesture handler on Reading Mode Bottom Bar: swipe up to expand to edit mode
  const readingBarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy < -12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20 || gestureState.vy < -0.3) {
          Haptics.medium();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsEditingMode(true);
          setActiveViewerTab('image');
        }
      },
    })
  ).current;
  const [showWatermarkModal, setShowWatermarkModal] = useState<boolean>(false);
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [inDocSearchQuery, setInDocSearchQuery] = useState<string>('');
  const [inDocMatchIndex, setInDocMatchIndex] = useState<number>(0);

  // Undo history stack per page (records previous page URIs so watermarks/signatures/crops can be undone)
  const pageUndoHistoryRef = useRef<Record<number, string[]>>({});
  const [undoVersion, setUndoVersion] = useState<number>(0);
  const pendingCropSavePromiseRef = useRef<Promise<any> | null>(null);

  // Centralized Dirty Pages tracking for Bullet-Train State Management across all pages
  const dirtyPagesRef = useRef<Set<number>>(new Set());
  const dirtyImagePagesRef = useRef<Set<number>>(new Set());
  const committedRotationsRef = useRef<Record<number, number>>({});
  const lastCommittedImageRef = useRef<Record<number, string>>({});
  const isCommittingBatchRef = useRef<boolean>(false);
  const batchCommitTimerRef = useRef<any>(null);
  const activeCommitPromiseRef = useRef<Promise<any> | null>(null);
  const viewerPagesRef = useRef<string[]>([]);
  viewerPagesRef.current = viewerPages;
  const pageRotationsRef = useRef<number[]>([]);
  pageRotationsRef.current = pageRotations;

  // Bookmark filter & Rename state
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState<boolean>(false);
  const [renameModalDoc, setRenameModalDoc] = useState<PdfDocItem | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  // Source tabs: strictly 2 tabs: 'scanned' | 'system'
  const [sourceTab, setSourceTab] = useState<'scanned' | 'system'>('scanned');
  const scannedCount = useMemo(() => documents.filter(d => d.isScanned).length, [documents]);
  const systemCount = useMemo(() => documents.filter(d => !d.isScanned).length, [documents]);

  // Export Modal for list page sharing
  const [exportTargetDoc, setExportTargetDoc] = useState<PdfDocItem | null>(null);

  // FlatList ref for smooth horizontal viewer swipe
  const viewerFlatListRef = useRef<FlatList>(null);

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

  const handleOpenRename = (doc: PdfDocItem) => {
    setRenameModalDoc(doc);
    setRenameInput(doc.name.replace(/\.pdf$/i, ''));
  };

  const handleConfirmRename = async () => {
    if (!renameModalDoc || !renameInput.trim()) return;
    try {
      const cleanName = await renameDocument(renameModalDoc.id || renameModalDoc.uri, renameInput.trim(), renameModalDoc.uri);
      setDocuments(prev => prev.map(d => (d.id === renameModalDoc.id || d.uri === renameModalDoc.uri) ? { ...d, name: cleanName } : d));
      if (selectedDoc && (selectedDoc.id === renameModalDoc.id || selectedDoc.uri === renameModalDoc.uri)) {
        setSelectedDoc(prev => prev ? { ...prev, name: cleanName } : null);
      }
      setRenameModalDoc(null);
      showAlert('Document Renamed', `Renamed to "${cleanName}".`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    } catch (err: any) {
      showAlert('Rename Error', err?.message || 'Failed to rename document.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    }
  };

  // Delete individual document
  const handleDeleteDoc = (doc: PdfDocItem) => {
    showAlert(
      'Delete Document',
      `Are you sure you want to permanently delete "${doc.name}"?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            try {
              await deleteDocument(doc.id || doc.uri, true, doc.uri);
              try { await FileSystem.deleteAsync(doc.uri, { idempotent: true }); } catch (_) {}
              setDocuments(prev => prev.filter(d => d.uri !== doc.uri && d.id !== doc.id));
              if (selectedDoc && (selectedDoc.uri === doc.uri || selectedDoc.id === doc.id)) {
                handleCloseViewer();
              }
              showAlert('Deleted', `"${doc.name}" has been removed.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'trash', iconColor: COLORS.success });
            } catch (e: any) {
              showAlert('Delete Failed', e?.message || 'Unable to delete document.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
            }
          },
        },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  // Multi-Selection actions
  const handleToggleSelect = (uri: string) => {
    Haptics.selection();
    setSelectedDocUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const handleSelectAll = () => {
    Haptics.medium();
    if (selectedDocUris.size === filteredDocuments.length && filteredDocuments.length > 0) {
      setSelectedDocUris(new Set());
    } else {
      setSelectedDocUris(new Set(filteredDocuments.map(d => d.uri)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedDocUris.size === 0) return;
    showAlert(
      'Delete Selected',
      `Permanently delete ${selectedDocUris.size} selected document(s)?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            const urisToDelete = Array.from(selectedDocUris);
            for (const uri of urisToDelete) {
              await deleteDocument(uri, true, uri).catch(() => {});
              try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (_) {}
            }
            setDocuments(prev => prev.filter(d => !selectedDocUris.has(d.uri)));
            setSelectedDocUris(new Set());
            setIsSelectionMode(false);
            showAlert('Deleted', `${urisToDelete.length} documents removed.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'trash', iconColor: COLORS.success });
          },
        },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  const handleMergeSelected = async () => {
    if (selectedDocUris.size < 2) {
      showAlert('Merge Documents', 'Please select at least 2 PDF documents to merge.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'git-merge', iconColor: COLORS.accent });
      return;
    }
    try {
      setIsLoading(true);
      const uris = Array.from(selectedDocUris);
      const mergedName = `Merged_Doc_${Date.now()}`;
      const res = await mergePdfs(uris, mergedName);
      setSelectedDocUris(new Set());
      setIsSelectionMode(false);
      await loadDocuments();
      showAlert('Documents Merged', `Created "${res.name}".`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    } catch (err: any) {
      showAlert('Merge Failed', err?.message || 'Could not merge selected documents.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsLoading(false);
    }
  };

  const handleShareSelected = () => {
    if (selectedDocUris.size === 0) return;
    const firstDoc = documents.find(d => selectedDocUris.has(d.uri));
    if (firstDoc) {
      setExportTargetDoc(firstDoc);
    }
  };

  // Load all documents
  const loadDocuments = useCallback(async () => {
    try {
      const dbDocs = await getAllPdfDocuments();
      let allItems: PdfDocItem[] = [...dbDocs];

      // Check bookmarks
      try {
        const bookmarks = await getBookmarks();
        const bSet = new Set(bookmarks.map(b => b.fileUri));
        allItems.forEach(i => {
          i.isBookmarked = bSet.has(i.uri);
        });
      } catch (_) {}

      // Fast display from SQLite index
      setDocuments(allItems);

      // Check for any unindexed files in scansDir asynchronously without blocking UI
      setTimeout(async () => {
        try {
          const scansDir = `${FileSystem.documentDirectory}scans/`;
          const dirInfo = await FileSystem.getInfoAsync(scansDir);
          if (dirInfo.exists) {
            const files = await FileSystem.readDirectoryAsync(scansDir);
            let added = false;
            for (const f of files) {
              if (f.toLowerCase().startsWith('temp_')) {
                // Wipe stray temporary append files left from any past crash
                FileSystem.deleteAsync(`${scansDir}${f}`, { idempotent: true }).catch(() => {});
                continue;
              }
              if (f.toLowerCase().endsWith('.pdf')) {
                const fullUri = `${scansDir}${f}`;
                const exists = allItems.some(d => d.uri === fullUri);
                if (!exists) {
                  const fInfo = await FileSystem.getInfoAsync(fullUri);
                  allItems.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    uri: fullUri,
                    name: f,
                    extension: 'pdf',
                    size: fInfo.exists ? (fInfo as any).size || 0 : 0,
                    modified: fInfo.exists && (fInfo as any).modificationTime ? new Date((fInfo as any).modificationTime * 1000).toISOString() : new Date().toISOString(),
                    category: 'Personal',
                    ocrStatus: 'done',
                    isCard: 0,
                    isScanned: true,
                  });
                  added = true;
                }
              }
            }
            if (added) {
              setDocuments([...allItems]);
            }
          }
        } catch (_) {}
      }, 500);
    } catch (err) {
      console.warn('[documents] Load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments])
  );

  // Auto-open document if returning from Page Organizer, Camera, or other screen
  useEffect(() => {
    const rawUri = searchParams.openDocUri;
    const requestKey = rawUri ? `${rawUri}_${searchParams.pageIndex || '0'}_${searchParams.t || ''}` : null;
    if (rawUri && handledOpenDocUriRef.current !== requestKey) {
      handledOpenDocUriRef.current = requestKey;
      const targetUri = decodeURIComponent(rawUri);
      const targetPageIndex = searchParams.pageIndex ? parseInt(searchParams.pageIndex, 10) : 0;
      router.setParams({ openDocUri: '', pageIndex: '', t: '' });
      (async () => {
        let match = documentsRef.current.find(d => d.uri === targetUri || d.uri === rawUri);
        if (!match) {
          const name = targetUri.split('/').pop() || 'Document.pdf';
          let fileSize = 0;
          try {
            const info = await FileSystem.getInfoAsync(targetUri);
            if (info.exists && (info as any).size) {
              fileSize = (info as any).size;
            }
          } catch (_) {}

          match = {
            id: Date.now(),
            uri: targetUri,
            name,
            extension: 'pdf',
            size: fileSize,
            modified: new Date().toISOString(),
            category: 'Document',
            ocrStatus: 'done',
            isCard: 0,
            isScanned: true,
          };
        }
        handleOpenDoc(match, isNaN(targetPageIndex) ? 0 : targetPageIndex);
        loadDocuments().catch(() => {});
      })();
    }
  }, [searchParams.openDocUri, searchParams.pageIndex, searchParams.t]);

  // Alert notification when 2-in-1 ID card scan returns with composite PDF
  useEffect(() => {
    if (searchParams.idCardSaved === 'true') {
      const hasBack = searchParams.hasBack === 'true';
      router.setParams({ idCardSaved: '', hasBack: '' });
      showAlert(
        '2-in-1 ID Card Saved',
        hasBack
          ? 'Front & Back have been successfully composited onto 1 single A4 PDF page with official KYC borders.'
          : 'Front side has been placed onto a single A4 PDF page ready for printing.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'card', iconColor: COLORS.accent }
      );
    }
  }, [searchParams.idCardSaved, searchParams.hasBack]);

  // Background throttled size resolver for system files (only when user views System Files)
  useEffect(() => {
    if (sourceTab === 'system' && documents.length > 0) {
      const zeroItems = documents.filter(d => !d.isScanned && (!d.size || d.size === 0) && d.uri);
      if (zeroItems.length > 0) {
        const batch = zeroItems.slice(0, 15);
        const timer = setTimeout(async () => {
          let updated = false;
          const db = await getDatabase();
          for (const item of batch) {
            try {
              const info = await FileSystem.getInfoAsync(item.uri);
              if (info.exists && (info as any).size && (info as any).size > 0) {
                item.size = (info as any).size;
                await db.runAsync('UPDATE files SET size = ? WHERE uri = ? OR id = ?', [item.size, item.uri, item.id]).catch(() => {});
                updated = true;
              }
            } catch (_) {}
          }
          if (updated) {
            setDocuments([...documents]);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [sourceTab, documents]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDocuments();
  };

  // Open Document in Viewer & Editor
  const handleOpenDoc = async (doc: PdfDocItem, initialPageIndex: number = 0) => {
    setSelectedDoc(doc);
    setIsEditingMode(false);
    setActiveViewerTab('image');
    setCurrentPageIndex(initialPageIndex >= 0 ? initialPageIndex : 0);
    setIsLoadingPages(true);

    try {
      let validUri = doc.uri;
      if (validUri.startsWith('content://')) {
        const tempPath = `${FileSystem.cacheDirectory}preview_${Date.now()}.pdf`;
        await FileSystem.copyAsync({ from: validUri, to: tempPath });
        validUri = tempPath;
      }
      cachedPdfUriRef.current = validUri;

      // 1. High-speed cache check or instant slice render
      let thumbs: string[] = [];
      let totalDocPages = doc.pageCount || 0;
      let pdfRotations: number[] | undefined = undefined;
      try {
        const info = await getPdfPagesInfo(validUri);
        if (Array.isArray(info) && info.length > 0) {
          totalDocPages = info.length;
          pdfRotations = info.map(p => p.rotation || 0);
        }
      } catch (_) {}

      // A. Try loading all cached pages first (0ms if already cached, e.g. freshly scanned batch)
      try {
        thumbs = await renderPdfToImages(validUri, pdfRotations, undefined, undefined, 1800);
      } catch (nativeErr) {
        console.warn('[documents] Native render failed, falling back:', nativeErr);
      }

      // B. If not all cached and document is large (>6 pages), progressively stream:
      // Load first 4 pages immediately so viewer opens in <100ms, then stream remaining pages
      if ((!thumbs || thumbs.length === 0) && totalDocPages > 6) {
        let firstBatch: string[] = [];
        try {
          firstBatch = await renderPdfToImages(validUri, pdfRotations, 0, 4, 1800);
        } catch (_) {}

        if (firstBatch && firstBatch.length > 0) {
          thumbs = firstBatch;
          setViewerPages(firstBatch);
          originalPagesRef.current = [...firstBatch];
          dirtyPagesRef.current.clear();
          committedRotationsRef.current = {};
          const initImgs: Record<number, string> = {};
          firstBatch.forEach((t, i) => { initImgs[i] = t; });
          lastCommittedImageRef.current = initImgs;
          setPageRotations(new Array(firstBatch.length).fill(0));
          setIsLoadingPages(false); // Viewer opens Page immediately!
          if (initialPageIndex > 0) {
            setTimeout(() => {
              try {
                viewerFlatListRef.current?.scrollToOffset({
                  offset: initialPageIndex * windowWidth,
                  animated: false,
                });
              } catch (_) {}
            }, 80);
          }

          // Stream remaining pages in background chunks
          (async () => {
            let offset = firstBatch.length;
            while (offset < totalDocPages) {
              await new Promise<void>(r => InteractionManager.runAfterInteractions(() => r()));
              const chunk = await renderPdfToImages(validUri, pdfRotations, offset, 16, 1800);
              if (chunk && chunk.length > 0) {
                setViewerPages(prev => [...prev, ...chunk]);
                originalPagesRef.current = [...originalPagesRef.current, ...chunk];
                setPageRotations(prev => [...prev, ...new Array(chunk.length).fill(0)]);
                offset += chunk.length;
              } else {
                break;
              }
              await new Promise(r => setTimeout(r, 20));
            }
            if (offset > 0 && doc.pageCount !== offset) {
              setSelectedDoc(prev => prev ? { ...prev, pageCount: offset } : null);
              setDocuments(prev => prev.map(d => (d.uri === doc.uri || d.id === doc.id) ? { ...d, pageCount: offset } : d));
              updateDocumentPageCount(doc.uri, offset, doc.id).catch(() => {});
            }
          })();
        }
      }

      // C. Fallback retry if render returned empty
      if (!thumbs || thumbs.length === 0) {
        try {
          await invalidatePdfRenderCache(validUri);
          thumbs = await renderPdfWithPageRotations(validUri, 1800);
        } catch (_) {}
      }

      if (thumbs && thumbs.length > 0) {
        setViewerPages(thumbs);
        originalPagesRef.current = [...thumbs];
        dirtyPagesRef.current.clear();
        committedRotationsRef.current = {};
        const initImgs: Record<number, string> = {};
        thumbs.forEach((t, i) => { initImgs[i] = t; });
        lastCommittedImageRef.current = initImgs;
        setPageRotations(new Array(thumbs.length).fill(0));
        if (initialPageIndex > 0) {
          setTimeout(() => {
            try {
              viewerFlatListRef.current?.scrollToOffset({
                offset: initialPageIndex * windowWidth,
                animated: false,
              });
            } catch (_) {}
          }, 80);
        }
      }

      // Auto-synchronize page count if different
      if (doc.pageCount !== thumbs.length && thumbs.length > 0) {
        setSelectedDoc(prev => prev ? { ...prev, pageCount: thumbs.length } : null);
        setDocuments(prev => prev.map(d => (d.uri === doc.uri || d.id === doc.id) ? { ...d, pageCount: thumbs.length } : d));
        updateDocumentPageCount(doc.uri, thumbs.length, doc.id).catch(() => {});
        if (validUri !== doc.uri) {
          updateDocumentPageCount(validUri, thumbs.length).catch(() => {});
        }
      }

      // Load OCR text asynchronously in background (never blocks viewer from opening instantly)
      setDocOcrText('');
      getFileContent(doc.id || doc.uri).then(content => {
        if (content && (content.ocrText || content.contentText)) {
          setDocOcrText(content.ocrText || content.contentText || '');
        }
      }).catch(() => {});
    } catch (err) {
      console.warn('[documents] Viewer load error:', err);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const commitDirtyPages = async (targetDocOverride?: PdfDocItem | null) => {
    if (batchCommitTimerRef.current) {
      clearTimeout(batchCommitTimerRef.current);
      batchCommitTimerRef.current = null;
    }

    // Wait for any in-flight commit to complete
    if (isCommittingBatchRef.current && activeCommitPromiseRef.current) {
      try {
        await activeCommitPromiseRef.current;
      } catch (_) {}
    }

    const currentDoc = targetDocOverride || selectedDoc;
    if (!currentDoc) return;

    const dirtyList = Array.from(dirtyPagesRef.current);
    if (dirtyList.length === 0) return;

    // Snapshot dirty list and clear set so subsequent edits are captured
    dirtyPagesRef.current.clear();
    const dirtyImageIndices = new Set(dirtyImagePagesRef.current);
    dirtyImagePagesRef.current.clear();

    const currentPages = viewerPagesRef.current;
    const currentRotations = pageRotationsRef.current;

    isCommittingBatchRef.current = true;
    const commitTask = (async () => {
      try {
        const targetUri = currentDoc.uri;
        const targetName = currentDoc.name;
        const targetDocId = currentDoc.id;

        // Check if ANY page image was actually recropped, filtered, or updated (vs just rotated)
        const hasImageContentChanged = dirtyImageIndices.size > 0 || currentPages.some((uri, idx) => {
          return Boolean(originalPagesRef.current[idx] && originalPagesRef.current[idx] !== uri);
        });

        if (!hasImageContentChanged) {
          // 100% LOSSLESS: Only rotations changed! Modify PDF /Rotate tags in-place directly without re-encoding to JPEGs
          const rotationsMap: Record<number, number> = {};
          dirtyList.forEach(idx => {
            const absRot = currentRotations[idx] || 0;
            rotationsMap[idx] = absRot;
          });

          if (Object.keys(rotationsMap).length > 0) {
            const res = await rotatePagesInPdf(targetUri, rotationsMap, targetName, 'absolute');
            currentDoc.uri = res.uri;
            currentDoc.size = res.size;
            cachedPdfUriRef.current = res.uri;
            await invalidatePdfRenderCache(targetUri);
            await invalidatePdfRenderCache(res.uri);
          }
        } else {
          // High-speed atomic batch replacement: dirty pages with updated images are embedded
          const specs: PageCommitSpec[] = dirtyList.map(idx => {
            const isImageDirty = dirtyImageIndices.has(idx) || Boolean(originalPagesRef.current[idx] && originalPagesRef.current[idx] !== currentPages[idx]);
            return {
              pageIndex: idx,
              imageUri: isImageDirty ? currentPages[idx] : undefined,
              absoluteRotation: currentRotations[idx] || 0,
            };
          });
          const res = await commitPagesBatchToPdf(targetUri, specs, targetName);
          currentDoc.uri = res.uri;
          currentDoc.size = res.size;
          cachedPdfUriRef.current = res.uri;
          await invalidatePdfRenderCache(targetUri);
          await invalidatePdfRenderCache(res.uri);

          // Update baseline originalPages to match committed state
          dirtyList.forEach(idx => {
            if (currentPages[idx]) {
              originalPagesRef.current[idx] = currentPages[idx];
            }
          });
        }

        const db = await getDatabase();
        const nowIso = new Date().toISOString();
        await db.runAsync('UPDATE files SET uri = ?, size = ?, modified = ? WHERE uri = ? OR id = ?', [currentDoc.uri, currentDoc.size, nowIso, targetUri, targetDocId]).catch(() => {});
        setSelectedDoc(prev => prev ? { ...prev, uri: currentDoc.uri, size: currentDoc.size } : null);
        setDocuments(prev => prev.map(d => (d.uri === targetUri || d.id === targetDocId) ? { ...d, uri: currentDoc.uri, size: currentDoc.size, modified: nowIso } : d));
      } catch (err: any) {
        console.warn('[documents] commitDirtyPages save error:', err);
      } finally {
        isCommittingBatchRef.current = false;
        activeCommitPromiseRef.current = null;
      }
    })();

    activeCommitPromiseRef.current = commitTask;
    await commitTask;
  };

  const scheduleIdleSave = (delayMs: number = 1500) => {
    if (batchCommitTimerRef.current) {
      clearTimeout(batchCommitTimerRef.current);
    }
    batchCommitTimerRef.current = setTimeout(() => {
      if (dirtyPagesRef.current.size > 0) {
        commitDirtyPages().catch(() => {});
      }
    }, delayMs);
  };

  // Close Viewer (Guarantees pending batch edits across all pages are committed before closing)
  const handleCloseViewer = async () => {
    const docToFlush = selectedDoc;
    if (dirtyPagesRef.current.size > 0 || (isCommittingBatchRef.current && activeCommitPromiseRef.current)) {
      await commitDirtyPages(docToFlush);
    }
    if (docToFlush) {
      setDocuments(prev => prev.map(d => (d.uri === docToFlush.uri || d.id === docToFlush.id) ? { ...d, uri: docToFlush.uri, size: docToFlush.size } : d));
    }
    setSelectedDoc(null);
    setIsEditingMode(false);
    setViewerPages([]);
    setPageRotations([]);
    originalPagesRef.current = [];
    dirtyPagesRef.current.clear();
    dirtyImagePagesRef.current.clear();
    committedRotationsRef.current = {};
    lastCommittedImageRef.current = {};
    setActiveFilterPreset('none');
    setDocOcrText('');
    setIsExtractingOcr(false);
    setOcrProgress(null);
    handledOpenDocUriRef.current = null;
    cachedPdfUriRef.current = null;
    if (searchParams.openDocUri) {
      router.setParams({ openDocUri: '' });
    }
  };

  // On-demand OCR text extraction for current document via non-blocking queue manager
  const handleExtractOcrNow = async (forceRerun: boolean = false) => {
    if (!selectedDoc) return;
    if (isExtractingOcr) return;
    if (!forceRerun && docOcrText && docOcrText.trim()) return;

    setIsExtractingOcr(true);
    setOcrProgress({ current: 0, total: viewerPages.length || 1 });

    const targetUri = cachedPdfUriRef.current || selectedDoc.uri;

    const unsubs: Array<() => void> = [];
    const handleProgress = (info: any) => {
      if (info.status === 'processing') {
        setOcrProgress({ current: info.currentPage, total: info.totalPages });
      }
      if (info.status === 'done' && info.text) {
        setDocOcrText(info.text);
      }
    };

    unsubs.push(ocrQueueManager.subscribeOcrProgress(selectedDoc.uri, handleProgress));
    if (targetUri !== selectedDoc.uri) {
      unsubs.push(ocrQueueManager.subscribeOcrProgress(targetUri, handleProgress));
    }

    try {
      let cleanText = await ocrQueueManager.processDocumentImmediately(
        targetUri,
        viewerPages,
        selectedDoc.name
      );

      // Direct fallback if queue manager returned empty: OCR viewerPages directly
      if ((!cleanText || !cleanText.trim()) && viewerPages && viewerPages.length > 0) {
        const blocks: string[] = [];
        const maxPages = Math.min(viewerPages.length, 30);
        for (let i = 0; i < maxPages; i++) {
          setOcrProgress({ current: i + 1, total: maxPages });
          try {
            const res = await ocrImage(viewerPages[i]);
            if (res && res.text && res.text.trim()) {
              blocks.push(`[Page ${i + 1}]\n${res.text.trim()}`);
            }
          } catch (_) {}
        }
        if (blocks.length > 0) {
          cleanText = blocks.join('\n\n');
        }
      }

      if (cleanText && cleanText.trim()) {
        const finalText = cleanText.trim();
        setDocOcrText(finalText);
        await updateFileOcrContent(selectedDoc.uri, finalText).catch(() => {});
        if (targetUri !== selectedDoc.uri) {
          await updateFileOcrContent(targetUri, finalText).catch(() => {});
        }
      } else if (forceRerun) {
        showAlert(
          'OCR Result',
          'No text could be extracted from this document.',
          [{ text: 'OK', style: 'default', onPress: hideAlert }],
          { icon: 'information-circle', iconColor: COLORS.accent }
        );
      }
    } catch (err: any) {
      console.warn('[documents] OCR extraction error:', err);
    } finally {
      unsubs.forEach(u => u());
      setIsExtractingOcr(false);
      setOcrProgress(null);
    }
  };

  // When user switches to the [Text] tab, lazily extract if not yet available
  useEffect(() => {
    if (activeViewerTab === 'text' && selectedDoc && !docOcrText && !isExtractingOcr) {
      handleExtractOcrNow(false);
    }
  }, [activeViewerTab, selectedDoc?.uri, docOcrText, isExtractingOcr]);

  // Google Docs Scanner: Scan & Append to Current Document
  const handleScanWithGoogleScanner = async () => {
    if (!selectedDoc) return;
    try {
      const scanResult = await launchGoogleDocScanner();
      if (!scanResult || scanResult.canceled || !scanResult.success || !scanResult.pages || scanResult.pages.length === 0) {
        return;
      }

      const applyScannedPages = async (action: 'replace' | 'insert' | 'append') => {
        setIsApplyingFilter(true);
        const targetDoc = selectedDoc;
        try {
          let updatedUri = targetDoc.uri;
          let updatedSize = targetDoc.size;
          let newPageCount = targetDoc.pageCount || viewerPages.length;
          let targetFocusIndex = 0;

          if (action === 'replace') {
            const pageIdx = currentPageIndex;
            const specs: PageCommitSpec[] = [{
              pageIndex: pageIdx,
              imageUri: scanResult.pages[0],
              deltaRotation: 0,
            }];
            const res = await commitPagesBatchToPdf(targetDoc.uri, specs, targetDoc.name);
            updatedUri = res.uri;
            updatedSize = res.size;
            targetFocusIndex = pageIdx;
          } else if (action === 'insert') {
            const pageIdx = currentPageIndex;
            const tempPdfName = `temp_scan_${Date.now()}.pdf`;
            const tempPdf = await buildPdfFromImages(scanResult.pages, undefined, tempPdfName);
            if (!tempPdf || !tempPdf.pdfUri) throw new Error('Failed to generate PDF from scan');

            const res = await insertPagesIntoPdf(targetDoc.uri, tempPdf.pdfUri, pageIdx + 1, targetDoc.name);
            updatedUri = res.uri;
            updatedSize = res.size;
            newPageCount += scanResult.pages.length;
            targetFocusIndex = pageIdx + 1;
          } else {
            // append
            const tempPdfName = `temp_scan_${Date.now()}.pdf`;
            const tempPdf = await buildPdfFromImages(scanResult.pages, undefined, tempPdfName);
            if (!tempPdf || !tempPdf.pdfUri) throw new Error('Failed to generate PDF from scan');

            const merged = await mergePdfs([targetDoc.uri, tempPdf.pdfUri], targetDoc.name);
            updatedUri = merged.uri;
            updatedSize = merged.size;
            newPageCount += scanResult.pages.length;
            targetFocusIndex = viewerPages.length;
          }

          cachedPdfUriRef.current = updatedUri;
          let totalViewerCount = viewerPages.length;
          if (action === 'replace') {
            const pageIdx = targetFocusIndex;
            const newScanUri = scanResult.pages[0];
            const next = [...viewerPages];
            next[pageIdx] = newScanUri;
            setViewerPages(next);
            originalPagesRef.current[pageIdx] = newScanUri;
            setPageRotations(prev => {
              const nextRot = [...prev];
              nextRot[pageIdx] = 0;
              return nextRot;
            });
            totalViewerCount = next.length;
          } else {
            const freshPages = await renderPdfWithPageRotations(updatedUri);
            if (freshPages && freshPages.length > 0) {
              setViewerPages(freshPages);
              originalPagesRef.current = [...freshPages];
              setPageRotations(new Array(freshPages.length).fill(0));
              totalViewerCount = freshPages.length;
            }
          }

          setSelectedDoc(prev => prev ? { ...prev, uri: updatedUri, size: updatedSize, pageCount: newPageCount } : null);
          setDocuments(prev => prev.map(d => (d.uri === targetDoc.uri || d.id === targetDoc.id) ? { ...d, uri: updatedUri, size: updatedSize, pageCount: newPageCount } : d));
          updateDocumentPageCount(updatedUri, newPageCount, targetDoc.id).catch(() => {});

          // Queue background OCR indexing so newly added page is immediately searchable
          ocrQueueManager.enqueueDocument({
            pdfUri: updatedUri,
            fileName: targetDoc.name,
            pageUris: scanResult.pages,
          });

          // Smoothly scroll and focus to the newly added or replaced page
          setTimeout(() => {
            try {
              if (viewerFlatListRef.current && targetFocusIndex < totalViewerCount) {
                viewerFlatListRef.current.scrollToIndex({ index: targetFocusIndex, animated: true });
                setCurrentPageIndex(targetFocusIndex);
              }
            } catch (_) {}
          }, 200);

          showAlert('Scan Complete', `Successfully ${action === 'replace' ? 'replaced page' : 'added pages'} with Camera Scanner.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
        } catch (e: any) {
          console.warn('[documents] applyScannedPages error:', e);
          showAlert('Error', e?.message || 'Failed to process scanned pages', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
        } finally {
          setIsApplyingFilter(false);
        }
      };

      if (viewerPages.length > 0) {
        const pageIdx = currentPageIndex;
        showAlert(
          'Insert Scanned Pages',
          `Choose where to place ${scanResult.pages.length} scanned page(s):`,
          [
            {
              text: `Replace Page ${pageIdx + 1}`,
              style: 'default',
              onPress: () => {
                hideAlert();
                applyScannedPages('replace');
              },
            },
            {
              text: `Insert After Page ${pageIdx + 1}`,
              style: 'default',
              onPress: () => {
                hideAlert();
                applyScannedPages('insert');
              },
            },
            {
              text: 'Append to End',
              style: 'default',
              onPress: () => {
                hideAlert();
                applyScannedPages('append');
              },
            },
            { text: 'Cancel', style: 'cancel', onPress: hideAlert }
          ],
          { icon: 'document-text', iconColor: COLORS.accent }
        );
        return;
      }

      await applyScannedPages('append');
    } catch (err: any) {
      console.warn('[documents] Camera Scanner error:', err);
      showAlert('Scanner Error', err?.message || 'Failed to open Camera Scanner', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }
  };

  // Rotate Current Page in Viewer (Immediate UI response + debounced batch commit)
  const handleRotateCurrentPage = (degrees: number = 90) => {
    if (!selectedDoc || viewerPages.length === 0) return;
    Haptics.light();
    const pageIdx = currentPageIndex;
    const currentRot = pageRotations[pageIdx] || 0;
    const newRot = (currentRot + degrees) % 360;

    // 1. Instantly rotate in UI state for fluid 60fps response (0ms)
    setPageRotations(prev => {
      const copy = prev.length >= viewerPages.length ? [...prev] : new Array(viewerPages.length).fill(0);
      copy[pageIdx] = newRot;
      return copy;
    });

    // 2. Mark page dirty in centralized state
    dirtyPagesRef.current.add(pageIdx);

    // 3. Fast idle save in background after 1.2s of inactivity
    scheduleIdleSave(1200);
  };

  // Safe Recrop Opener: checks that page file exists on disk
  const handleOpenRecrop = async () => {
    if (!selectedDoc || viewerPages.length === 0) return;
    if (dirtyPagesRef.current.size > 0 || (isCommittingBatchRef.current && activeCommitPromiseRef.current)) {
      try {
        await commitDirtyPages();
      } catch (_) {}
    }
    const curUri = viewerPages[currentPageIndex];
    if (!curUri) return;
    try {
      const fileInfo = await FileSystem.getInfoAsync(curUri);
      if (!fileInfo.exists) {
        const freshPages = await renderPdfWithPageRotations(selectedDoc.uri);
        if (freshPages && freshPages[currentPageIndex]) {
          setViewerPages(freshPages);
          viewerPagesRef.current = freshPages;
        }
      }
    } catch (_) {}
    setShowCropModal(true);
  };


  // Open Export Modal (Flushes all dirty pages across entire PDF so exported/shared PDF is 100% up to date)
  const handleOpenExport = async () => {
    if (!selectedDoc) return;
    if (dirtyPagesRef.current.size > 0 || (isCommittingBatchRef.current && activeCommitPromiseRef.current)) {
      setIsApplyingFilter(true);
      try {
        await commitDirtyPages();
      } finally {
        setIsApplyingFilter(false);
      }
    }
    setShowExportModal(true);
  };

  const handlePageImageError = useCallback(async (failedUri: string) => {
    console.warn(`[documents] Preview image failed to load: ${failedUri}`);
    if (selectedDoc) {
      try {
        const fresh = await renderPdfWithPageRotations(selectedDoc.uri);
        if (fresh && fresh.length > 0) {
          setViewerPages(fresh);
        }
      } catch (_) {}
    }
  }, [selectedDoc]);

  const renderViewerPageItem = useCallback(
    ({ item: pageUri, index }: { item: string; index: number }) => (
      <ViewerPageItem
        pageUri={pageUri}
        pageIndex={index}
        rotation={pageRotations[index] || 0}
        activeFilterPreset={activeFilterPreset}
        windowWidth={windowWidth}
        isDark={isDark}
        onImageError={handlePageImageError}
        onToggleFullscreen={() => setIsFullscreen(prev => !prev)}
        isFullscreen={isFullscreen}
      />
    ),
    [pageRotations, activeFilterPreset, windowWidth, isDark, handlePageImageError, isFullscreen]
  );

  const filterCanvasHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body>
        <canvas id="filterCanvas" style="display:none;"></canvas>
        <script>
          window.applyFilter = function(params) {
            try {
              var img = new Image();
              img.onload = function() {
                var w = img.naturalWidth || img.width;
                var h = img.naturalHeight || img.height;
                var canvas = document.getElementById('filterCanvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                try {
                  if (params.filter === 'bw') {
                    ctx.filter = 'grayscale(100%) contrast(160%)';
                  } else if (params.filter === 'auto') {
                    ctx.filter = 'contrast(125%) saturate(120%) brightness(105%)';
                  } else if (params.filter === 'color') {
                    ctx.filter = 'contrast(105%) saturate(110%)';
                  } else if (params.filter === 'photo') {
                    ctx.filter = 'contrast(115%) brightness(102%)';
                  } else {
                    ctx.filter = 'none';
                  }
                } catch(e) {}

                ctx.drawImage(img, 0, 0, w, h);
                var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                var rawBase64 = dataUrl.split(',')[1];
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'FILTER_SUCCESS',
                  base64: rawBase64,
                  filter: params.filter,
                  pageIndex: params.pageIndex
                }));
              };
              img.onerror = function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'FILTER_ERROR',
                  error: 'Image load failed'
                }));
              };
              img.src = params.dataUri;
            } catch(e) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'FILTER_ERROR',
                error: e.toString()
              }));
            }
          };

          window.applyWatermark = function(params) {
            try {
              var img = new Image();
              img.onload = function() {
                var w = img.naturalWidth || img.width;
                var h = img.naturalHeight || img.height;
                var canvas = document.getElementById('filterCanvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);

                ctx.save();
                ctx.translate(w / 2, h / 2);
                ctx.rotate(-Math.PI / 6);
                var fontSize = Math.max(30, Math.round(w / 12));
                ctx.font = '900 ' + fontSize + 'px sans-serif';
                ctx.fillStyle = params.color || '#EF4444';
                ctx.globalAlpha = params.opacity || 0.28;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(params.text || 'CONFIDENTIAL', 0, 0);
                ctx.restore();

                var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                var rawBase64 = dataUrl.split(',')[1];
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'FILTER_SUCCESS',
                  base64: rawBase64,
                  filter: 'watermark',
                  pageIndex: params.pageIndex
                }));
              };
              img.onerror = function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FILTER_ERROR', error: 'Image load failed' }));
              };
              img.src = params.dataUri;
            } catch(e) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FILTER_ERROR', error: e.toString() }));
            }
          };

          window.applySignature = function(params) {
            try {
              var img = new Image();
              img.onload = function() {
                var w = img.naturalWidth || img.width;
                var h = img.naturalHeight || img.height;
                var canvas = document.getElementById('filterCanvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);

                var sig = new Image();
                sig.onload = function() {
                  var sigW = Math.round(w * 0.38);
                  var sigH = Math.round(sigW * (sig.naturalHeight / (sig.naturalWidth || 1)));
                  var posX = w - sigW - Math.round(w * 0.06);
                  var posY = h - sigH - Math.round(h * 0.06);
                  if (params.position === 'center') {
                    posX = Math.round((w - sigW) / 2);
                    posY = Math.round((h - sigH) / 2);
                  } else if (params.position === 'bottom-left') {
                    posX = Math.round(w * 0.06);
                  }
                  ctx.drawImage(sig, posX, posY, sigW, sigH);

                  var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                  var rawBase64 = dataUrl.split(',')[1];
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'FILTER_SUCCESS',
                    base64: rawBase64,
                    filter: 'signature',
                    pageIndex: params.pageIndex
                  }));
                };
                sig.onerror = function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FILTER_ERROR', error: 'Signature load failed' }));
                };
                sig.src = params.signatureDataUri;
              };
              img.onerror = function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FILTER_ERROR', error: 'Base image load failed' }));
              };
              img.src = params.dataUri;
            } catch(e) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'FILTER_ERROR', error: e.toString() }));
            }
          };
        </script>
      </body>
    </html>
  `;

  const handleFilterWebViewMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'FILTER_SUCCESS' && msg.base64 && selectedDoc) {
        const outUri = `${FileSystem.cacheDirectory}filtered_p${msg.pageIndex}_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(outUri, msg.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Record previous image in undo stack before baking changes!
        const prevUri = viewerPages[msg.pageIndex];
        if (prevUri) {
          const savedUri = await persistImageForUndo(prevUri);
          const curStack = pageUndoHistoryRef.current[msg.pageIndex] || [];
          pageUndoHistoryRef.current[msg.pageIndex] = [...curStack, savedUri];
        }

        // Update viewer page thumbnail with the new image immediately in 0ms!
        const next = [...viewerPages];
        next[msg.pageIndex] = outUri;
        setViewerPages(next);
        setUndoVersion(v => v + 1);

        // Reset overlay because the image on disk is now permanently filtered
        setActiveFilterPreset('none');

        // Mark page dirty in centralized state and schedule idle save
        dirtyPagesRef.current.add(msg.pageIndex);
        dirtyImagePagesRef.current.add(msg.pageIndex);
        scheduleIdleSave(1500);
      }
    } catch (e) {
      console.warn('[documents] Filter message error:', e);
    } finally {
      setIsApplyingFilter(false);
    }
  };

  const handleFilterPresetSelect = async (preset: 'none' | 'auto' | 'bw' | 'color' | 'photo') => {
    if (!selectedDoc || viewerPages.length === 0 || isApplyingFilter) return;
    setActiveFilterPreset(preset);

    if (preset === 'none') {
      const origUri = originalPagesRef.current[currentPageIndex];
      if (origUri && origUri !== viewerPages[currentPageIndex]) {
        const next = [...viewerPages];
        next[currentPageIndex] = origUri;
        setViewerPages(next);

        dirtyPagesRef.current.add(currentPageIndex);
        scheduleIdleSave(5000);
      }
      return;
    }

    setIsApplyingFilter(true);
    try {
      const sourceImageUri = originalPagesRef.current[currentPageIndex] || viewerPages[currentPageIndex];
      const outUri = await applyFilterToImage(sourceImageUri, preset);

      // Record previous image in undo stack
      const prevUri = viewerPages[currentPageIndex];
      if (prevUri && prevUri !== outUri) {
        const curStack = pageUndoHistoryRef.current[currentPageIndex] || [];
        pageUndoHistoryRef.current[currentPageIndex] = [...curStack, prevUri];
      }

      // Update viewer page thumbnail with the new image in ~30ms!
      const next = [...viewerPages];
      next[currentPageIndex] = outUri;
      setViewerPages(next);
      setUndoVersion(v => v + 1);

      // Mark page dirty in centralized state and schedule idle save
      dirtyPagesRef.current.add(currentPageIndex);
      dirtyImagePagesRef.current.add(currentPageIndex);
      scheduleIdleSave(1500);
    } catch (err) {
      console.warn('[documents] Native filter error:', err);
    } finally {
      setIsApplyingFilter(false);
    }
  };

  const handleApplyWatermark = async (params: { text: string; color: string; opacity: number; applyToAll: boolean }) => {
    if (!selectedDoc || viewerPages.length === 0 || isApplyingFilter) return;
    setIsApplyingFilter(true);
    try {
      if (params.applyToAll) {
        // High-speed native batch watermark across ALL pages (~50-100ms total)
        const allUris = [...viewerPages];
        for (let i = 0; i < allUris.length; i++) {
          const prevUri = allUris[i];
          if (prevUri) {
            const curStack = pageUndoHistoryRef.current[i] || [];
            pageUndoHistoryRef.current[i] = [...curStack, prevUri];
          }
        }

        const newUris = await applyWatermarkToMultipleImages(
          allUris,
          params.text,
          params.color,
          params.opacity
        );

        setViewerPages(newUris);
        setUndoVersion(v => v + 1);
        for (let i = 0; i < newUris.length; i++) {
          dirtyPagesRef.current.add(i);
          dirtyImagePagesRef.current.add(i);
        }
        scheduleIdleSave(1500);
        showAlert('Watermark Applied', `Watermark applied across all ${newUris.length} pages.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'shield-checkmark', iconColor: COLORS.success });
      } else {
        // Single page watermark
        const pageIdx = currentPageIndex;
        const sourceImageUri = viewerPages[pageIdx] || originalPagesRef.current[pageIdx];
        if (!sourceImageUri) return;

        const prevUri = viewerPages[pageIdx];
        if (prevUri) {
          const curStack = pageUndoHistoryRef.current[pageIdx] || [];
          pageUndoHistoryRef.current[pageIdx] = [...curStack, prevUri];
        }

        const outUri = await applyWatermarkToImage(
          sourceImageUri,
          params.text,
          params.color,
          params.opacity
        );

        const next = [...viewerPages];
        next[pageIdx] = outUri;
        setViewerPages(next);
        setUndoVersion(v => v + 1);
        dirtyPagesRef.current.add(pageIdx);
        dirtyImagePagesRef.current.add(pageIdx);
        scheduleIdleSave(1500);
        showAlert('Watermark Applied', 'Watermark added to current page.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'shield-checkmark', iconColor: COLORS.success });
      }
    } catch (err: any) {
      console.warn('[documents] Native watermark error:', err);
      showAlert('Watermark Error', err?.message || 'Failed to apply watermark.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsApplyingFilter(false);
    }
  };

  const handleApplySignature = async (params: { signatureDataUri: string; position: 'bottom-right' | 'center' | 'bottom-left' }) => {
    if (!selectedDoc || viewerPages.length === 0 || isApplyingFilter) return;
    setIsApplyingFilter(true);
    try {
      const pageIdx = currentPageIndex;
      const sourceImageUri = viewerPages[pageIdx] || originalPagesRef.current[pageIdx];
      if (!sourceImageUri) return;

      const prevUri = viewerPages[pageIdx];
      if (prevUri) {
        const curStack = pageUndoHistoryRef.current[pageIdx] || [];
        pageUndoHistoryRef.current[pageIdx] = [...curStack, prevUri];
      }

      let relX = 0.58;
      let relY = 0.76;
      const relW = 0.38;
      const relH = 0.20;

      if (params.position === 'center') {
        relX = 0.31;
        relY = 0.40;
      } else if (params.position === 'bottom-left') {
        relX = 0.04;
        relY = 0.76;
      }

      const outUri = await applySignatureToImage(
        sourceImageUri,
        params.signatureDataUri,
        relX,
        relY,
        relW,
        relH
      );

      const next = [...viewerPages];
      next[pageIdx] = outUri;
      setViewerPages(next);
      setUndoVersion(v => v + 1);
      dirtyPagesRef.current.add(pageIdx);
      dirtyImagePagesRef.current.add(pageIdx);
      scheduleIdleSave(1500);
      showAlert('Signature Added', 'Signature placed on page.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'pencil', iconColor: COLORS.success });
    } catch (err: any) {
      console.warn('[documents] Native signature error:', err);
      showAlert('Signature Error', err?.message || 'Failed to apply signature.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsApplyingFilter(false);
    }
  };

  // Check if current page can be undone
  const canUndoCurrentPage = useMemo(() => {
    const stack = pageUndoHistoryRef.current[currentPageIndex];
    const hasHistory = Boolean(stack && stack.length > 0);
    const orig = originalPagesRef.current[currentPageIndex];
    const isDifferentFromOrig = Boolean(orig && orig !== viewerPages[currentPageIndex]);
    return hasHistory || isDifferentFromOrig;
  }, [currentPageIndex, viewerPages, undoVersion]);

  // Revert last edit (Undo watermark, signature, or filter)
  const handleUndoCurrentPage = async () => {
    if (!selectedDoc || viewerPages.length === 0 || isApplyingFilter) return;
    const stack = pageUndoHistoryRef.current[currentPageIndex] || [];
    let targetUri: string | undefined;

    if (stack.length > 0) {
      targetUri = stack[stack.length - 1];
      pageUndoHistoryRef.current[currentPageIndex] = stack.slice(0, -1);
    } else {
      targetUri = originalPagesRef.current[currentPageIndex];
    }

    if (!targetUri || targetUri === viewerPages[currentPageIndex]) return;

    // Verify snapshot exists before replacing
    let validTargetUri = targetUri;
    const targetInfo = await FileSystem.getInfoAsync(targetUri);
    if (!targetInfo.exists) {
      const orig = originalPagesRef.current[currentPageIndex];
      const origInfo = orig ? await FileSystem.getInfoAsync(orig) : null;
      if (orig && origInfo && origInfo.exists) {
        validTargetUri = orig;
      } else {
        showAlert('Cannot Undo', 'The previous edit snapshot is no longer available on disk.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
        return;
      }
    }

    const next = [...viewerPages];
    next[currentPageIndex] = validTargetUri;
    setViewerPages(next);
    setUndoVersion(v => v + 1);

    dirtyPagesRef.current.add(currentPageIndex);
    dirtyImagePagesRef.current.add(currentPageIndex);
    scheduleIdleSave(1500);

    showAlert('Undone!', 'Reverted page to previous state.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'arrow-undo', iconColor: COLORS.accent });
  };

  // Revert page back to untouched original scan
  const handleRevertToOriginal = async () => {
    if (!selectedDoc || viewerPages.length === 0 || isApplyingFilter) return;
    const origUri = originalPagesRef.current[currentPageIndex];
    if (!origUri || origUri === viewerPages[currentPageIndex]) return;

    const origInfo = await FileSystem.getInfoAsync(origUri);
    if (!origInfo.exists) {
      showAlert('Cannot Revert', 'The original page snapshot is no longer available.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
      return;
    }

    const next = [...viewerPages];
    next[currentPageIndex] = origUri;
    setViewerPages(next);

    pageUndoHistoryRef.current[currentPageIndex] = [];
    setUndoVersion(v => v + 1);

    dirtyPagesRef.current.add(currentPageIndex);
    dirtyImagePagesRef.current.add(currentPageIndex);
    scheduleIdleSave(1500);

    showAlert('Restored!', 'Restored page to original untouched scan.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'refresh', iconColor: COLORS.success });
  };

  // Copy OCR Text
  const handleCopyOcrText = async () => {
    if (docOcrText) {
      await Clipboard.setStringAsync(docOcrText);
      showAlert('Copied!', 'Document text copied to clipboard.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    }
  };

  // In-document OCR search matches
  const inDocSearchResults = useMemo(() => {
    if (!docOcrText || !inDocSearchQuery.trim()) {
      return { count: 0, positions: [] as number[] };
    }
    const q = inDocSearchQuery.trim().toLowerCase();
    const positions: number[] = [];
    let pos = 0;
    const lowerText = docOcrText.toLowerCase();
    while ((pos = lowerText.indexOf(q, pos)) !== -1) {
      positions.push(pos);
      pos += q.length;
    }
    return { count: positions.length, positions };
  }, [docOcrText, inDocSearchQuery]);

  const renderHighlightedOcrText = (fullText: string, query: string, activeIdx: number) => {
    if (!query.trim()) return fullText;
    const q = query.trim();
    const lowerText = fullText.toLowerCase();
    const lowerQ = q.toLowerCase();
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let matchIdx = 0;
    let found = lowerText.indexOf(lowerQ, last);

    while (found !== -1) {
      if (found > last) {
        nodes.push(fullText.substring(last, found));
      }
      const isCur = matchIdx === activeIdx;
      nodes.push(
        <Text
          key={`highlight_${matchIdx}_${found}`}
          style={{
            backgroundColor: isCur ? '#F59E0B' : '#FEF08A',
            color: '#1E293B',
            fontWeight: '700',
            borderRadius: 3,
            paddingHorizontal: 2,
          }}
        >
          {fullText.substring(found, found + q.length)}
        </Text>
      );
      matchIdx++;
      last = found + q.length;
      found = lowerText.indexOf(lowerQ, last);
    }
    if (last < fullText.length) {
      nodes.push(fullText.substring(last));
    }
    return nodes;
  };

  interface SmartEntityItem {
    label: string;
    value: string;
    icon: string;
    type: 'amount' | 'date' | 'phone' | 'email' | 'upi' | 'generic';
  }

  // Extract Smart Data Entities (Dates, Amounts, Phone, Email, UPI) - Only evaluated on 'smart' tab
  const smartEntities = useMemo<SmartEntityItem[]>(() => {
    if (!docOcrText || activeViewerTab !== 'smart') return [];
    const text = docOcrText;
    const entities: SmartEntityItem[] = [];

    // 1. Total / Amounts
    const amountRegex = /(?:total|amount|subtotal|balance|due|paid|inr|usd|rs\.?|\$|€|£)\s*[:=-]?\s*([₹$€£]?\s*\d+[.,]\d{2})/gi;
    const amountMatches = Array.from(text.matchAll(amountRegex));
    if (amountMatches.length > 0) {
      const bestMatch = amountMatches[0][1] || amountMatches[0][0];
      entities.push({ label: 'Total Amount', value: bestMatch.trim(), icon: 'cash-outline', type: 'amount' });
    }

    // 2. UPI IDs
    const upiRegex = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b/g;
    const upiMatches = text.match(upiRegex);
    if (upiMatches && upiMatches.length > 0) {
      const genuineUpi = upiMatches.find(u => !u.toLowerCase().endsWith('.com') && !u.toLowerCase().endsWith('.org') && !u.toLowerCase().endsWith('.net') && !u.toLowerCase().endsWith('.edu') && !u.toLowerCase().endsWith('.gov'));
      if (genuineUpi) {
        entities.push({ label: 'UPI ID', value: genuineUpi, icon: 'flash-outline', type: 'upi' });
      }
    }

    // 3. Dates
    const dateRegex = /\b(\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3,9})[-/.]\d{2,4})\b/g;
    const dateMatches = text.match(dateRegex);
    if (dateMatches && dateMatches.length > 0) {
      entities.push({ label: 'Date', value: dateMatches[0], icon: 'calendar-outline', type: 'date' });
    }

    // 4. Phone Numbers
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phoneMatches = text.match(phoneRegex);
    if (phoneMatches && phoneMatches.length > 0) {
      entities.push({ label: 'Phone', value: phoneMatches[0], icon: 'call-outline', type: 'phone' });
    }

    // 5. Email
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailMatches = text.match(emailRegex);
    if (emailMatches && emailMatches.length > 0) {
      entities.push({ label: 'Email', value: emailMatches[0], icon: 'mail-outline', type: 'email' });
    }

    // 6. Vendor / Header (first clean line)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && !l.match(/^\d+$/));
    if (lines.length > 0) {
      entities.push({ label: 'Merchant / Subject', value: lines[0], icon: 'business-outline', type: 'generic' });
    }

    // 7. Category
    if (selectedDoc?.category) {
      entities.push({ label: 'Category', value: selectedDoc.category, icon: 'pricetag-outline', type: 'generic' });
    }

    return entities;
  }, [docOcrText, activeViewerTab, selectedDoc?.category]);

  // Import PDF
  const handleImportPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const dest = `${FileSystem.documentDirectory}scans/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await FileSystem.copyAsync({ from: file.uri, to: dest });

        await upsertFile({
          uri: dest,
          name: file.name,
          extension: 'pdf',
          size: file.size || 0,
          modified: new Date().toISOString(),
          contentText: '',
          ocrText: '',
          ocrStatus: 'pending',
        }, false, 'Imported');

        loadDocuments();
        showAlert('Document Imported', `"${file.name}" has been added to your documents.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
      }
    } catch (err) {
      console.warn('[documents] Import error:', err);
    }
  };

  const handleScanBatch = () => {
    setShowScanChoiceModal(false);
    router.push(`/doc-scanner?t=${Date.now()}&initialMode=batch`);
  };

  const handleScanId2In1 = () => {
    setShowScanChoiceModal(false);
    setShowIdGuideModal(true);
  };

  const handleStartIdScan = () => {
    setShowIdGuideModal(false);
    router.push(`/doc-scanner?t=${Date.now()}&initialMode=idcard&returnToCard=false`);
  };

  const handleImportPdfFile = () => {
    setShowScanChoiceModal(false);
    handleImportPdf();
  };

  const handleImportPhotos = async () => {
    setShowScanChoiceModal(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert(
          'Permission Needed',
          'Gallery permission is required to import document photos.',
          [{ text: 'OK', style: 'default', onPress: hideAlert }],
          { icon: 'images-outline', iconColor: COLORS.warning }
        );
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        setIsLoading(true);
        const scanPages: ScanPage[] = res.assets.map(a => ({
          id: `photo_${Date.now()}_${Math.random()}`,
          uri: a.uri,
          originalUri: a.uri,
          width: a.width || 1200,
          height: a.height || 1600,
          filter: 'original',
          rotation: 0,
          ocrStatus: 'idle',
        }));

        const docTitle = `Scanned_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now().toString().slice(-4)}`;
        const pdfResult = await generateSearchablePdf(scanPages, { title: docTitle });

        await indexScannedDocument({
          uri: pdfResult.pdfUri,
          fileName: `${docTitle}.pdf`,
          pageCount: scanPages.length,
          fileSize: pdfResult.byteSize,
          ocrText: '',
          category: 'Document',
          isCard: false,
        });

        await loadDocuments();
        showAlert(
          'Photos Imported',
          `Created "${docTitle}.pdf" with ${res.assets.length} page(s).`,
          [{ text: 'OK', style: 'default', onPress: hideAlert }],
          { icon: 'checkmark-circle', iconColor: COLORS.success }
        );
      }
    } catch (err: any) {
      showAlert('Import Photos Error', err?.message || 'Failed to import photos.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Current Page in Viewer (Matching Screenshot 4)
  const handleDeleteCurrentPage = () => {
    if (!selectedDoc) return;
    if (viewerPages.length <= 1) {
      showAlert('Cannot Delete', 'This is the only page in the document. To delete the document, use the Delete option in the top bar.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.accent });
      return;
    }
    const targetIdx = currentPageIndex;
    showAlert(
      'Delete Page',
      `Delete page ${targetIdx + 1} of ${viewerPages.length}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          text: 'Delete Page',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            try {
              // Flush any pending dirty edits before deleting page
              await commitDirtyPages();

              const remainingPages = viewerPages.filter((_, idx) => idx !== targetIdx);
              const remainingRotations = pageRotations.filter((_, idx) => idx !== targetIdx);
              const nextIndex = Math.min(targetIdx, Math.max(0, remainingPages.length - 1));

              // 1. Immediately update UI state in 0ms (FlatList stays smoothly mounted!)
              setViewerPages(remainingPages);
              setPageRotations(remainingRotations);
              setCurrentPageIndex(nextIndex);
              dirtyPagesRef.current.clear();
              committedRotationsRef.current = {};

              // 2. Scroll FlatList to next page smoothly
              setTimeout(() => {
                viewerFlatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
              }, 20);

              // 3. Lossless PDF page removal via pdf-lib (<50ms)
              const res = await deletePagesFromPdf(
                selectedDoc.uri,
                [targetIdx],
                selectedDoc.name
              );

              // 4. Update document metadata and SQLite quietly in background
              setSelectedDoc(prev => prev ? { ...prev, uri: res.uri, size: res.size, pageCount: remainingPages.length } : null);
              setDocuments(prev => prev.map(d => (d.uri === selectedDoc.uri || d.id === selectedDoc.id) ? { ...d, uri: res.uri, size: res.size, pageCount: remainingPages.length } : d));

              const db = await getDatabase();
              await db.runAsync('UPDATE files SET uri = ?, size = ?, page_count = ?, modified = ? WHERE uri = ? OR id = ?', [res.uri, res.size, remainingPages.length, new Date().toISOString(), selectedDoc.uri, selectedDoc.id]).catch(() => {});
              await updateDocumentPageCount(res.uri, remainingPages.length, selectedDoc.id);
              if (selectedDoc.uri !== res.uri) {
                await updateDocumentPageCount(selectedDoc.uri, remainingPages.length, selectedDoc.id);
              }
            } catch (err: any) {
              showAlert('Delete Page Error', err?.message || 'Failed to delete page.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
            }
          },
        },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  // Add pages actions (Screenshot 5)
  const handleAddPhotos = async () => {
    setShowAddPagesModal(false);
    if (!selectedDoc) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setIsLoadingPages(true);
        const scanPages: ScanPage[] = res.assets.map(a => ({
          id: `photo_${Date.now()}_${Math.random()}`,
          uri: a.uri,
          originalUri: a.uri,
          width: a.width || 1200,
          height: a.height || 1600,
          filter: 'original',
          rotation: 0,
          ocrStatus: 'idle',
        }));

        let tempPdfUri: string | null = null;
        try {
          const tempPdf = await generateSearchablePdf(scanPages, {
            title: `temp_append_${Date.now()}`,
          });
          tempPdfUri = tempPdf.pdfUri;

          const pagesInfo = await getPdfPagesInfo(selectedDoc.uri);
          const appendIndex = pagesInfo.length;

          const result = await insertPagesIntoPdf(
            selectedDoc.uri,
            tempPdf.pdfUri,
            appendIndex,
            selectedDoc.name
          );

          invalidatePdfRenderCache(selectedDoc.uri);
          invalidatePdfRenderCache(result.uri);

        const updatedThumbs = await renderPdfWithPageRotations(result.uri);
        setSelectedDoc(prev => prev ? { ...prev, uri: result.uri, size: result.size, pageCount: updatedThumbs.length } : null);
        setDocuments(prev => prev.map(d => (d.uri === selectedDoc.uri || d.id === selectedDoc.id) ? { ...d, uri: result.uri, size: result.size, pageCount: updatedThumbs.length } : d));
        setViewerPages(updatedThumbs);
        await updateDocumentPageCount(result.uri, updatedThumbs.length, selectedDoc.id);
        await loadDocuments();
        // Background indexing and OCR without delaying user
        enqueueBackgroundPdfOcr(result.uri, selectedDoc.name, selectedDoc.category);
        showAlert('Photos Appended', `Added ${res.assets.length} page(s) into "${selectedDoc.name}".`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
      } finally {
        if (tempPdfUri) {
          FileSystem.deleteAsync(tempPdfUri, { idempotent: true }).catch(() => {});
        }
      }
    }
    } catch (err: any) {
      showAlert('Add Photos Error', err?.message || 'Failed to add photos.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handleAddFiles = async () => {
    setShowAddPagesModal(false);
    if (!selectedDoc) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setIsLoadingPages(true);
        const pagesInfo = await getPdfPagesInfo(selectedDoc.uri);
        const appendIndex = pagesInfo.length;

        const result = await insertPagesIntoPdf(
          selectedDoc.uri,
          res.assets[0].uri,
          appendIndex,
          selectedDoc.name
        );

        invalidatePdfRenderCache(selectedDoc.uri);
        invalidatePdfRenderCache(result.uri);

        const updatedThumbs = await renderPdfWithPageRotations(result.uri);
        setSelectedDoc(prev => prev ? { ...prev, uri: result.uri, size: result.size, pageCount: updatedThumbs.length } : null);
        setDocuments(prev => prev.map(d => (d.uri === selectedDoc.uri || d.id === selectedDoc.id) ? { ...d, uri: result.uri, size: result.size, pageCount: updatedThumbs.length } : d));
        setViewerPages(updatedThumbs);
        await updateDocumentPageCount(result.uri, updatedThumbs.length, selectedDoc.id);
        await loadDocuments();
        // Background indexing and OCR without delaying user
        enqueueBackgroundPdfOcr(result.uri, selectedDoc.name, selectedDoc.category);
        showAlert('Pages Added', `Successfully merged "${res.assets[0].name}" into "${selectedDoc.name}".`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
      }
    } catch (err: any) {
      showAlert('Add Files Error', err?.message || 'Failed to add pages from PDF.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsLoadingPages(false);
    }
  };

  // Filtered & Sorted documents list
  const filteredDocuments = useMemo(() => {
    let result = documents.filter(doc => {
      if (sourceTab === 'scanned' && !doc.isScanned) return false;
      if (sourceTab === 'system' && doc.isScanned) return false;
      if (showBookmarkedOnly && !doc.isBookmarked) return false;
      if (activeTagFilter) {
        const tag = activeTagFilter.toLowerCase();
        const hasTag = doc.category?.toLowerCase().includes(tag) || doc.name.toLowerCase().includes(tag);
        if (!hasTag) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return doc.name.toLowerCase().includes(q) || doc.category?.toLowerCase().includes(q);
      }
      return true;
    });

    return result.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return (new Date(b.modified).getTime() || 0) - (new Date(a.modified).getTime() || 0);
      }
      if (sortBy === 'date_asc') {
        return (new Date(a.modified).getTime() || 0) - (new Date(b.modified).getTime() || 0);
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === 'size_desc') {
        return (b.size || 0) - (a.size || 0);
      }
      if (sortBy === 'size_asc') {
        return (a.size || 0) - (b.size || 0);
      }
      return 0;
    });
  }, [documents, sourceTab, showBookmarkedOnly, activeTagFilter, searchQuery, sortBy]);

  // Available tag chips
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    documents.forEach(d => {
      if (d.category) set.add(d.category);
    });
    return Array.from(set);
  }, [documents]);

  // ---------------- Render Document Row (List or Grid) ----------------
  const renderDocRow = ({ item, index }: { item: PdfDocItem; index: number }) => {
    const isSelected = selectedDocUris.has(item.uri);
    const isEven = index % 2 === 0;

    if (viewMode === 'grid') {
      return (
        <Reanimated.View
          entering={FadeInDown.delay(getStaggerDelay(index)).springify().damping(18).stiffness(240)}
          layout={isSelectionMode ? undefined : cardLayoutTransition}
          style={{ flex: 1 }}
        >
          <NativeScaleButton
            style={[styles.gridCard, { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.accent : COLORS.border }]}
            onPress={() => {
              if (isSelectionMode) handleToggleSelect(item.uri);
              else handleOpenDoc(item);
            }}
            onLongPress={() => {
              Haptics.medium();
              if (!isSelectionMode) {
                setIsSelectionMode(true);
                setSelectedDocUris(new Set([item.uri]));
              }
            }}
            activeScale={0.96}
            hapticType="light"
          >
            <View style={[styles.gridThumb, { backgroundColor: COLORS.surface2 }]}>
              <PdfDocThumbnail
                uri={item.uri}
                isScanned={item.isScanned}
                pageCount={item.pageCount}
                isGrid
                accentColor={COLORS.accent}
                placeholderBg={COLORS.surface2}
              />
              {isSelectionMode && (
                <Reanimated.View entering={ZoomIn.springify().damping(14)} style={styles.gridSelectionCheck}>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? COLORS.accent : '#94A3B8'}
                  />
                </Reanimated.View>
              )}
            </View>
            <View style={{ padding: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.gridTitle, { color: COLORS.text, flex: 1, marginRight: 4 }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <NativeScaleButton
                    onPress={(e: any) => {
                      e.stopPropagation();
                      setExportTargetDoc(item);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}
                    accessibilityLabel="Share PDF"
                    activeScale={0.88}
                  >
                    <Ionicons name="share-outline" size={18} color={COLORS.muted} />
                  </NativeScaleButton>

                  <NativeScaleButton
                    onPress={(e: any) => {
                      e.stopPropagation();
                      setContextMenuDoc(item);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}
                    accessibilityLabel="More Options"
                    activeScale={0.88}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={COLORS.muted} />
                  </NativeScaleButton>
                </View>
              </View>

              <Text style={[styles.gridSubtitle, { color: COLORS.muted, marginTop: 4 }]} numberOfLines={1}>
                {formatDate(item.modified)} • {item.pageCount ? `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'} • ` : ''}{formatSize(item.size)}
              </Text>
            </View>
          </NativeScaleButton>
        </Reanimated.View>
      );
    }

    const itemBackground = isSelected
      ? COLORS.accent + '22'
      : isDark
      ? (isEven ? COLORS.surface : '#1E293B')
      : (isEven ? '#FFFFFF' : '#F8FAFC');

    const itemBorder = isSelected
      ? COLORS.accent
      : isDark
      ? 'rgba(148, 163, 184, 0.4)'
      : 'rgba(203, 213, 225, 0.95)';

    return (
      <Reanimated.View
        entering={FadeInDown.delay(getStaggerDelay(index)).springify().damping(18).stiffness(240)}
        layout={isSelectionMode ? undefined : cardLayoutTransition}
      >
        <NativeScaleButton
          style={[
            styles.rowItem,
            {
              backgroundColor: itemBackground,
              borderColor: itemBorder,
              borderLeftWidth: item.isScanned ? 3.5 : 1,
              borderLeftColor: item.isScanned ? COLORS.accent : itemBorder,
            },
          ]}
          onPress={() => {
            if (isSelectionMode) handleToggleSelect(item.uri);
            else handleOpenDoc(item);
          }}
          onLongPress={() => {
            Haptics.medium();
            if (!isSelectionMode) {
              setIsSelectionMode(true);
              setSelectedDocUris(new Set([item.uri]));
            }
          }}
          activeScale={0.97}
          hapticType="light"
        >
          {/* Selection Checkbox (Matching Screenshot 3) */}
          {isSelectionMode && (
            <Reanimated.View entering={ZoomIn.springify().damping(14)} style={styles.selectCheckboxWrap}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={isSelected ? COLORS.accent : '#94A3B8'}
              />
            </Reanimated.View>
          )}

          {/* Left Thumbnail Preview */}
          <PdfDocThumbnail
            uri={item.uri}
            isScanned={item.isScanned}
            pageCount={item.pageCount}
            accentColor={COLORS.accent}
            placeholderBg={COLORS.surface2}
          />

          {/* Center Title & Clean Subtitle (No Tags, Single Page Count) */}
          <View style={styles.rowCenter}>
            <Text style={[styles.rowTitle, { color: COLORS.text }]} numberOfLines={1}>
              {item.name}
            </Text>

            <Text style={[styles.rowSubtitle, { color: COLORS.muted, marginTop: 4 }]} numberOfLines={1}>
              {formatDate(item.modified)} • {item.pageCount ? `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'} • ` : ''}{formatSize(item.size)}
            </Text>
          </View>

          {/* Right Actions: Share icon & Context Menu with Generous Touch Targets */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <NativeScaleButton
              onPress={(e: any) => {
                e.stopPropagation();
                setExportTargetDoc(item);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
              accessibilityLabel="Share PDF"
              activeScale={0.88}
            >
              <Ionicons name="share-outline" size={21} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              onPress={(e: any) => {
                e.stopPropagation();
                setContextMenuDoc(item);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
              accessibilityLabel="More Options"
              activeScale={0.88}
            >
              <Ionicons name="ellipsis-vertical" size={21} color={COLORS.muted} />
            </NativeScaleButton>
          </View>
        </NativeScaleButton>
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]} edges={['top', 'left', 'right']}>
      {/* ---------------- Top Header (Screenshots 1 & 3) ---------------- */}
      {isSelectionMode ? (
        <View style={[styles.selectionHeader, { backgroundColor: COLORS.bg, borderBottomColor: COLORS.border + '40' }]}>
          <TouchableOpacity onPress={handleSelectAll} style={{ padding: 6 }}>
            <Text style={[styles.headerActionOrange, { color: COLORS.accent }]}>
              {selectedDocUris.size === filteredDocuments.length && filteredDocuments.length > 0
                ? 'Deselect all'
                : 'Select all'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.selectionCountTitle, { color: COLORS.text }]}>
            {selectedDocUris.size} Selected
          </Text>
          <TouchableOpacity
            onPress={() => {
              setIsSelectionMode(false);
              setSelectedDocUris(new Set());
            }}
            style={{ padding: 6 }}
          >
            <Text style={[styles.headerActionOrange, { color: COLORS.accent }]}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: 'transparent' }]}
            onPress={handleRefresh}
            accessibilityLabel="Refresh documents"
          >
            <Ionicons name="sync" size={20} color={COLORS.accent} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: COLORS.text, flex: 1, marginHorizontal: 8, fontSize: 22 }]} numberOfLines={1}>
            Scans & Docs
          </Text>

          <View style={styles.headerBtnRow}>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: COLORS.surface2 }]}
              onPress={() => setShowSearchBox(prev => !prev)}
              accessibilityLabel="Search"
            >
              <Ionicons name="search" size={19} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: COLORS.surface2 }]}
              onPress={() => setShowMoreMenu(true)}
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={19} color={COLORS.accent} />
            </TouchableOpacity>

            <HeaderMenuButton />
          </View>
        </View>
      )}

      {/* ---------------- Top Search Bar ---------------- */}
      {showSearchBox && (
        <View style={[styles.topSearchWrap, { backgroundColor: COLORS.bg, borderBottomColor: COLORS.border + '50' }]}>
          <View style={[styles.searchBarInner, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
            <Ionicons name="search" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: COLORS.text }]}
              placeholder="Search documents or tags..."
              placeholderTextColor={COLORS.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}


      {/* ---------------- Document Source Tabs: Scanned Files vs System Files ---------------- */}
      <View style={[styles.sourceTabContainer, { backgroundColor: COLORS.bg, borderBottomColor: COLORS.border + '40' }]}>
        <View style={[styles.sourceTabTrack, { backgroundColor: COLORS.surface2 }]}>
          <TouchableOpacity
            style={[
              styles.sourceTabBtn,
              sourceTab === 'scanned' && [styles.sourceTabBtnActive, { backgroundColor: COLORS.accent }],
            ]}
            onPress={() => setSourceTab('scanned')}
            activeOpacity={0.75}
          >
            <Ionicons
              name="scan"
              size={13}
              color={sourceTab === 'scanned' ? '#FFFFFF' : COLORS.muted}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.sourceTabBtnText,
                sourceTab === 'scanned' ? { color: '#FFFFFF', fontWeight: '700' } : { color: COLORS.muted },
              ]}
            >
              Scanned ({scannedCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sourceTabBtn,
              sourceTab === 'system' && [styles.sourceTabBtnActive, { backgroundColor: COLORS.accent }],
            ]}
            onPress={() => setSourceTab('system')}
            activeOpacity={0.75}
          >
            <Ionicons
              name="folder-open"
              size={13}
              color={sourceTab === 'system' ? '#FFFFFF' : COLORS.muted}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.sourceTabBtnText,
                sourceTab === 'system' ? { color: '#FFFFFF', fontWeight: '700' } : { color: COLORS.muted },
              ]}
            >
              System Files ({systemCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ---------------- Main Documents List ---------------- */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.loadingLabel, { color: COLORS.muted }]}>Loading documents...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDocuments}
          key={viewMode}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={item => `${item.id}_${item.uri}`}
          renderItem={renderDocRow}
          extraData={selectedDocUris}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconCircle, { backgroundColor: COLORS.surface2 }]}>
                <Ionicons name="document-text-outline" size={48} color={COLORS.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
                {searchQuery || activeTagFilter ? 'No Matching Documents' : 'No Documents Yet'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: COLORS.muted }]}>
                {searchQuery || activeTagFilter
                  ? 'Try clearing the search query or tag filter.'
                  : 'Scan receipts, book pages, and notes, or import PDFs to get started.'}
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: COLORS.accent, marginTop: 16 }]}
                onPress={() => setShowScanChoiceModal(true)}
              >
                <Ionicons name="camera" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnText}>Scan First Document</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* ---------------- Floating Action Button (+) (Screenshot 3) ---------------- */}
      {!isSelectionMode && (
        <NativeScaleButton
          style={[styles.fabButton, { backgroundColor: COLORS.accent, bottom: 20 + insets.bottom }]}
          onPress={() => setShowScanChoiceModal(true)}
          accessibilityLabel="Scan Document"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeScale={0.88}
          hapticType="medium"
        >
          <Ionicons name="camera" size={28} color="#FFFFFF" />
        </NativeScaleButton>
      )}

      {/* ---------------- Bottom Batch Bar in Selection Mode ---------------- */}
      {isSelectionMode && selectedDocUris.size > 0 && (
        <Reanimated.View
          entering={SlideInDown.springify().damping(20).stiffness(260)}
          exiting={SlideOutDown.duration(160)}
          style={[
            styles.batchActionBar,
            {
              backgroundColor: COLORS.surface,
              borderTopColor: COLORS.border,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <NativeScaleButton
            style={styles.batchActionBtn}
            onPress={handleMergeSelected}
            activeScale={0.92}
            hapticType="light"
          >
            <Ionicons
              name="layers-outline"
              size={22}
              color={selectedDocUris.size >= 2 ? COLORS.accent : COLORS.muted}
            />
            <Text
              style={[
                styles.batchActionText,
                { color: selectedDocUris.size >= 2 ? COLORS.accent : COLORS.muted },
              ]}
            >
              Merge{selectedDocUris.size >= 2 ? ` (${selectedDocUris.size})` : ''}
            </Text>
          </NativeScaleButton>

          {selectedDocUris.size === 1 && (
            <NativeScaleButton
              style={styles.batchActionBtn}
              onPress={() => {
                const uri = Array.from(selectedDocUris)[0];
                const doc = documents.find(d => d.uri === uri);
                if (doc) {
                  setSelectedDocUris(new Set());
                  router.push({
                    pathname: '/second-brain',
                    params: {
                      linkDocUri: doc.uri,
                      linkDocName: doc.name,
                      linkDocType: 'pdf',
                    },
                  });
                }
              }}
              activeScale={0.92}
              hapticType="light"
            >
              <Ionicons name="bulb-outline" size={22} color={COLORS.accent} />
              <Text style={[styles.batchActionText, { color: COLORS.accent }]}>To Brain</Text>
            </NativeScaleButton>
          )}

          <NativeScaleButton
            style={styles.batchActionBtn}
            onPress={handleShareSelected}
            activeScale={0.92}
            hapticType="light"
          >
            <Ionicons name="share-outline" size={22} color={COLORS.accent} />
            <Text style={[styles.batchActionText, { color: COLORS.accent }]}>Share</Text>
          </NativeScaleButton>

          <NativeScaleButton
            style={styles.batchActionBtn}
            onPress={handleDeleteSelected}
            activeScale={0.92}
            hapticType="light"
          >
            <Ionicons name="trash-outline" size={22} color={COLORS.danger || '#EF4444'} />
            <Text style={[styles.batchActionText, { color: COLORS.danger || '#EF4444' }]}>Delete</Text>
          </NativeScaleButton>
        </Reanimated.View>
      )}

      {/* ---------------- Dropdown Options Popover Modal (Screenshot 3) ---------------- */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity style={styles.moreMenuBackdrop} activeOpacity={1} onPress={() => setShowMoreMenu(false)}>
          <Reanimated.View 
            entering={ZoomIn.duration(180)}
            style={[styles.moreMenuPopover, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                setIsSelectionMode(true);
              }}
            >
              <Text style={[styles.moreMenuText, { color: COLORS.text }]}>Select</Text>
              <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setSortBy(prev => (prev === 'name_asc' ? 'name_desc' : 'name_asc'));
                setShowMoreMenu(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {(sortBy === 'name_asc' || sortBy === 'name_desc') && (
                  <Ionicons name="checkmark" size={16} color={COLORS.accent} />
                )}
                <Text style={[styles.moreMenuText, { color: COLORS.text }]}>
                  {sortBy === 'name_asc' ? 'Name (A to Z)' : sortBy === 'name_desc' ? 'Name (Z to A)' : 'Sort by name'}
                </Text>
              </View>
              <Ionicons name="text-outline" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setSortBy(prev => (prev === 'date_desc' ? 'date_asc' : 'date_desc'));
                setShowMoreMenu(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {(sortBy === 'date_desc' || sortBy === 'date_asc') && (
                  <Ionicons name="checkmark" size={16} color={COLORS.accent} />
                )}
                <Text style={[styles.moreMenuText, { color: COLORS.text }]}>
                  {sortBy === 'date_desc' ? 'Date (Newest)' : sortBy === 'date_asc' ? 'Date (Oldest)' : 'Sort by date'}
                </Text>
              </View>
              <Ionicons name="calendar-outline" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setSortBy(prev => (prev === 'size_desc' ? 'size_asc' : 'size_desc'));
                setShowMoreMenu(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {(sortBy === 'size_desc' || sortBy === 'size_asc') && (
                  <Ionicons name="checkmark" size={16} color={COLORS.accent} />
                )}
                <Text style={[styles.moreMenuText, { color: COLORS.text }]}>
                  {sortBy === 'size_desc' ? 'Size (Largest)' : sortBy === 'size_asc' ? 'Size (Smallest)' : 'Sort by size'}
                </Text>
              </View>
              <Ionicons name="resize" size={16} color={COLORS.muted} />
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setViewMode('list');
                setShowMoreMenu(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {viewMode === 'list' && <Ionicons name="checkmark" size={16} color={COLORS.accent} />}
                <Text style={[styles.moreMenuText, { color: COLORS.text }]}>List</Text>
              </View>
              <Ionicons name="list" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setViewMode('grid');
                setShowMoreMenu(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {viewMode === 'grid' && <Ionicons name="checkmark" size={16} color={COLORS.accent} />}
                <Text style={[styles.moreMenuText, { color: COLORS.text }]}>Grid</Text>
              </View>
              <Ionicons name="grid" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                router.push('/file-manager');
              }}
            >
              <Text style={[styles.moreMenuText, { color: COLORS.text }]}>File Manager & Folders</Text>
              <Ionicons name="folder-open-outline" size={18} color={COLORS.accent} />
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                router.push('/file-analyser');
              }}
            >
              <Text style={[styles.moreMenuText, { color: COLORS.text }]}>Storage & Cleaner</Text>
              <Ionicons name="pie-chart-outline" size={18} color={COLORS.accent} />
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                router.push('/settings');
              }}
            >
              <Text style={[styles.moreMenuText, { color: COLORS.text }]}>Settings</Text>
              <Ionicons name="settings-outline" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </Reanimated.View>
        </TouchableOpacity>
      </Modal>

      {/* ---------------- Single Document Context Menu Modal ---------------- */}
      <Modal visible={contextMenuDoc !== null} transparent animationType="fade" onRequestClose={() => setContextMenuDoc(null)}>
        <TouchableOpacity style={styles.contextMenuBackdrop} activeOpacity={1} onPress={() => setContextMenuDoc(null)}>
          <Reanimated.View 
            entering={ZoomIn.duration(180)}
            style={[styles.contextMenuBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <Text style={[styles.contextMenuTitle, { color: COLORS.text, borderBottomColor: COLORS.border }]} numberOfLines={1}>
              {contextMenuDoc?.name}
            </Text>

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                const doc = contextMenuDoc;
                setContextMenuDoc(null);
                if (doc) handleOpenRename(doc);
              }}
            >
              <Ionicons name="pencil-outline" size={18} color={COLORS.text} style={{ marginRight: 12 }} />
              <Text style={[styles.contextMenuText, { color: COLORS.text }]}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                const doc = contextMenuDoc;
                setContextMenuDoc(null);
                if (doc) {
                  router.push(`/page-organizer?pdfUri=${encodeURIComponent(doc.uri)}&fileName=${encodeURIComponent(doc.name)}&t=${Date.now()}`);
                }
              }}
            >
              <Ionicons name="layers-outline" size={18} color={COLORS.text} style={{ marginRight: 12 }} />
              <Text style={[styles.contextMenuText, { color: COLORS.text }]}>Organize Pages (Workbench)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                const doc = contextMenuDoc;
                setContextMenuDoc(null);
                if (doc) {
                  setExportTargetDoc(doc);
                }
              }}
            >
              <Ionicons name="share-outline" size={18} color={COLORS.accent} style={{ marginRight: 12 }} />
              <Text style={[styles.contextMenuText, { color: COLORS.text }]}>Share / Export</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                const doc = contextMenuDoc;
                setContextMenuDoc(null);
                if (doc) {
                  router.push({
                    pathname: '/second-brain',
                    params: {
                      linkDocUri: doc.uri,
                      linkDocName: doc.name,
                      linkDocType: 'pdf',
                    },
                  });
                }
              }}
            >
              <Ionicons name="bulb-outline" size={18} color={COLORS.accent} style={{ marginRight: 12 }} />
              <Text style={[styles.contextMenuText, { color: COLORS.text }]}>Schedule in Brain</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={async () => {
                const doc = contextMenuDoc;
                setContextMenuDoc(null);
                if (doc) {
                  if (doc.isBookmarked) {
                    await removeBookmark(doc.uri);
                    setDocuments(prev => prev.map(d => (d.uri === doc.uri ? { ...d, isBookmarked: false } : d)));
                  } else {
                    await addBookmark(doc.uri, doc.name);
                    setDocuments(prev => prev.map(d => (d.uri === doc.uri ? { ...d, isBookmarked: true } : d)));
                  }
                }
              }}
            >
              <Ionicons
                name={contextMenuDoc?.isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={COLORS.accent}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.contextMenuText, { color: COLORS.text }]}>
                {contextMenuDoc?.isBookmarked ? 'Remove Bookmark' : 'Add to Bookmarks'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                const doc = contextMenuDoc;
                setContextMenuDoc(null);
                if (doc) handleDeleteDoc(doc);
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 12 }} />
              <Text style={[styles.contextMenuText, { color: '#EF4444', fontWeight: '700' }]}>Delete</Text>
            </TouchableOpacity>
          </Reanimated.View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================================== */}
      {/* DOCUMENT VIEWER & EDITOR                                        */}
      {/* ============================================================== */}
      {selectedDoc && (
        <Modal visible={true} animationType="fade" statusBarTranslucent={true} onRequestClose={handleCloseViewer}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.bg} translucent={true} />
          <View
            style={[
              styles.viewerModalContainer,
              {
                backgroundColor: COLORS.bg,
                paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : insets.top,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            {/* Top Navigation Bar with Back Button (Hidden in Fullscreen mode) */}
            {!isFullscreen && (
              <View style={[styles.viewerHeader, { borderBottomColor: COLORS.border }]}>
                <NativeScaleButton onPress={handleCloseViewer} style={styles.viewerBackBtn} hapticType="light">
                  <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </NativeScaleButton>

                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.viewerHeaderPageText, { color: COLORS.text }]}>
                    {viewerPages.length > 0 ? `Page ${currentPageIndex + 1} of ${viewerPages.length}` : ''}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {/* Undo Button (Enabled when watermark/sign/edits applied) */}
                  {canUndoCurrentPage && (
                    <NativeScaleButton
                      onPress={handleUndoCurrentPage}
                      style={styles.viewerHeaderIconBtn}
                      accessibilityLabel="Undo Edit"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      hapticType="medium"
                    >
                      <Ionicons name="arrow-undo" size={20} color={COLORS.accent} />
                    </NativeScaleButton>
                  )}

                  {/* Add to Card Button */}
                  <NativeScaleButton
                    onPress={() => {
                      if (!selectedDoc) return;
                      router.push(`/create-card?fileUri=${encodeURIComponent(selectedDoc.uri)}&fileName=${encodeURIComponent(selectedDoc.name)}`);
                    }}
                    style={styles.viewerHeaderIconBtn}
                    accessibilityLabel="Add to Card"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    hapticType="light"
                  >
                    <Ionicons name="card-outline" size={20} color={COLORS.text} />
                  </NativeScaleButton>

                  {/* Add to Brain Button */}
                  <NativeScaleButton
                    onPress={async () => {
                      if (!selectedDoc) return;
                      let text = selectedDoc.ocrText || selectedDoc.contentText || '';
                      if (!text && selectedDoc.uri) {
                        try {
                          const contentRes = await extractContent(selectedDoc.uri);
                          text = contentRes?.text || '';
                          if (!text && selectedDoc.uri.toLowerCase().endsWith('.pdf')) {
                            const pageImg = await renderPdfPage(selectedDoc.uri, 0);
                            if (pageImg) {
                              const ocrRes = await ocrImage(pageImg);
                              text = ocrRes?.text || '';
                            }
                          }
                        } catch (e) {
                          console.warn('[documents] OCR extract for Brain failed:', e);
                        }
                      }
                      router.push({
                        pathname: '/second-brain',
                        params: {
                          sharedText: encodeURIComponent(text || selectedDoc.name),
                        },
                      });
                    }}
                    style={styles.viewerHeaderIconBtn}
                    accessibilityLabel="Schedule in Brain"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    hapticType="light"
                  >
                    <Ionicons name="bulb-outline" size={20} color={COLORS.accent} />
                  </NativeScaleButton>

                  {/* Pages Grid Icon (Page Organizer / Workbench) */}
                  <NativeScaleButton
                    onPress={async () => {
                      const docToOpen = selectedDoc;
                      await handleCloseViewer();
                      const finalUri = docToOpen?.uri || '';
                      const finalName = docToOpen?.name || '';
                      router.push(`/page-organizer?pdfUri=${encodeURIComponent(finalUri)}&fileName=${encodeURIComponent(finalName)}&returnToDetail=true&t=${Date.now()}`);
                    }}
                    style={styles.viewerHeaderIconBtn}
                    accessibilityLabel="Organize Pages"
                    hapticType="light"
                  >
                    <Ionicons name="grid-outline" size={20} color={COLORS.text} />
                  </NativeScaleButton>
                </View>
              </View>
            )}

            {/* Floating Exit Fullscreen Button */}
            {isFullscreen && (
              <View style={{ position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : insets.top) + 10, left: 16, zIndex: 120 }}>
                <NativeScaleButton
                  onPress={() => setIsFullscreen(false)}
                  style={{
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)',
                    elevation: 7,
                  }}
                  hapticType="light"
                >
                  <Ionicons name="contract-outline" size={17} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>Done</Text>
                </NativeScaleButton>
              </View>
            )}

            {/* Upper Half: Document Page Preview with Smooth Horizontal Swipe */}
            <View
              style={[
                styles.viewerUpperPreview,
                {
                  backgroundColor: isDark ? '#0F172A' : '#1E293B',
                  flex: isFullscreen ? 1 : isEditingMode && activeViewerTab !== 'image' ? 0.35 : 1,
                },
                isEditingMode && activeViewerTab !== 'image' && { minHeight: 180, maxHeight: 220 },
              ]}
            >
              {viewerPages.length > 0 ? (
                <View style={{ flex: 1, width: '100%' }}>
                  <FlatList
                    ref={viewerFlatListRef}
                    data={viewerPages}
                    extraData={`${pageRotations.join(',')}_${activeFilterPreset}`}
                    horizontal
                    pagingEnabled={true}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(_, index) => `vp_${index}`}
                    decelerationRate="fast"
                    bounces={false}
                    initialNumToRender={2}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    removeClippedSubviews={Platform.OS === 'android'}
                    getItemLayout={(_, index) => ({
                      length: windowWidth,
                      offset: windowWidth * index,
                      index,
                    })}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                      if (idx >= 0 && idx < viewerPages.length) {
                        setCurrentPageIndex(idx);
                      }
                    }}
                    renderItem={renderViewerPageItem}
                  />

                  {/* Active Filter Pill Badge */}
                  {activeFilterPreset !== 'none' && (
                    <View style={styles.activeFilterPillBadge}>
                      <Ionicons
                        name={activeFilterPreset === 'bw' ? 'contrast' : activeFilterPreset === 'color' ? 'color-palette' : activeFilterPreset === 'photo' ? 'image' : 'sparkles'}
                        size={12}
                        color="#FFFFFF"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.activeFilterPillText}>{activeFilterPreset.toUpperCase()}</Text>
                    </View>
                  )}

                  {/* Multi-Page Navigation Scrubber Slider */}
                  {viewerPages.length > 1 && !isFullscreen && (
                    <View style={styles.pageSliderOverlay} pointerEvents="box-none">
                      <PageScrubberSlider
                        currentPage={currentPageIndex}
                        totalPages={viewerPages.length}
                        onPageChange={(page, isFinal = true) => {
                          setCurrentPageIndex(page);
                          viewerFlatListRef.current?.scrollToOffset({
                            offset: page * windowWidth,
                            animated: isFinal,
                          });
                        }}
                        accentColor={COLORS.accent}
                        isDark={isDark}
                      />
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                  {isLoadingPages ? (
                    <View style={[
                      { width: '92%', height: '92%', justifyContent: 'center', alignItems: 'center' },
                      !isDark && {
                        backgroundColor: '#FFFFFF',
                        borderRadius: 6,
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.12,
                        shadowRadius: 8,
                        elevation: 3,
                      }
                    ]}>
                      <ActivityIndicator size="large" color={COLORS.accent} />
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', padding: 24 }}>
                      <Ionicons name="alert-circle-outline" size={48} color={COLORS.muted} />
                      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: 12 }}>
                        Unable to load document pages
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (selectedDoc) {
                            invalidatePdfRenderCache(selectedDoc.uri);
                            handleOpenDoc(selectedDoc);
                          }
                        }}
                        style={{ marginTop: 16, backgroundColor: COLORS.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Reload Pages</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* Seamless non-intrusive loading overlay if regenerating */}
              {isLoadingPages && viewerPages.length > 0 && (
                <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? 'rgba(9, 9, 11, 0.45)' : 'rgba(237, 242, 247, 0.45)', zIndex: 60 }]} pointerEvents="none">
                  <ActivityIndicator size="large" color={COLORS.accent} />
                </View>
              )}
            </View>

            {/* Reading Mode Bottom Action Bar (Swipe up or tap Edit to open tools) */}
            {!isFullscreen && !isEditingMode && (
              <View
                {...readingBarPanResponder.panHandlers}
                style={[
                  styles.viewerReadingBottomBar,
                  {
                    backgroundColor: COLORS.surface,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                    paddingBottom: Math.max(insets.bottom, 12),
                  },
                ]}
              >
                {/* Swipe Up Drag Indicator */}
                <View style={styles.sheetDragHeader}>
                  <View style={[styles.sheetDragHandle, { backgroundColor: COLORS.muted + '40' }]} />
                </View>

                {/* Document Title & Page Count */}
                <View style={styles.viewerDocCardHeader}>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      onPress={() => handleOpenRename(selectedDoc)}
                      style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 4, marginLeft: -4, borderRadius: 6 }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.viewerCardTitle, { color: COLORS.text, flexShrink: 1 }]} numberOfLines={1}>
                          {selectedDoc.name.replace(/\.pdf$/i, '')}
                        </Text>
                        <Ionicons name="pencil" size={13} color={COLORS.accent} />
                      </View>
                    </TouchableOpacity>
                    <Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 2 }}>
                      {viewerPages.length} {viewerPages.length === 1 ? 'page' : 'pages'} — {formatSize(selectedDoc.size)} • Tap name to rename
                    </Text>
                  </View>
                </View>

                {/* The 3 Action Buttons Row: Add pages, Edit, Export */}
                <View style={styles.viewerReadingActionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.viewerReadingBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                    onPress={() => {
                      Haptics.light();
                      setShowAddPagesModal(true);
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="document-attach-outline" size={20} color={COLORS.text} />
                    <Text style={[styles.viewerReadingBtnText, { color: COLORS.text }]}>Add pages</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.viewerReadingBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                    onPress={() => {
                      Haptics.medium();
                      setIsEditingMode(true);
                      setActiveViewerTab('image');
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="options-outline" size={20} color={COLORS.text} />
                    <Text style={[styles.viewerReadingBtnText, { color: COLORS.text }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.viewerReadingBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                    onPress={() => {
                      Haptics.light();
                      handleOpenExport();
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="share-outline" size={20} color={COLORS.text} />
                    <Text style={[styles.viewerReadingBtnText, { color: COLORS.text }]}>Export</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Editing Mode: Dynamic Operation Window with Smooth Up/Down Animation */}
            {!isFullscreen && isEditingMode && (
              <Animated.View
                style={[
                  styles.viewerLowerSheet,
                  {
                    backgroundColor: COLORS.surface,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                    paddingBottom: Math.max(insets.bottom, 10),
                    transform: [
                      {
                        translateY: editDrawerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [280, 0],
                        }),
                      },
                    ],
                    opacity: editDrawerAnim.interpolate({
                          inputRange: [0, 0.2, 1],
                          outputRange: [0, 0.8, 1],
                    }),
                    ...(activeViewerTab === 'image' ? { flexShrink: 0 } : { flex: 0.72 }),
                  },
                ]}
              >
                {/* Drag Handle Bar with Downward Swipe Gesture */}
                <View
                  style={styles.sheetDragHeader}
                  {...editSheetPanResponder.panHandlers}
                >
                  <View style={[styles.sheetDragHandle, { backgroundColor: COLORS.muted + '50' }]} />
                </View>

                {/* Document Info Header with Tap-to-Rename & Minimize downward chevron (NO Done button) */}
                <View style={styles.viewerDocCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <TouchableOpacity
                      onPress={() => handleOpenRename(selectedDoc)}
                      style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 4, marginLeft: -4, borderRadius: 6 }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.viewerCardTitle, { color: COLORS.text, flexShrink: 1 }]} numberOfLines={1}>
                          {selectedDoc.name.replace(/\.pdf$/i, '')}
                        </Text>
                        <Ionicons name="pencil" size={13} color={COLORS.accent} />
                      </View>
                    </TouchableOpacity>
                    <Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 2 }}>
                      {viewerPages.length} {viewerPages.length === 1 ? 'page' : 'pages'} — {formatSize(selectedDoc.size)} • Swipe handle to move
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.minimizeSheetBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                    onPress={() => {
                      Haptics.light();
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setIsEditingMode(false);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                    accessibilityLabel="Minimize editing tools"
                  >
                    <Ionicons name="chevron-down" size={18} color={COLORS.accent} />
                  </TouchableOpacity>
                </View>

                {/* THE THREE TABS: [ Image ] [ Text ] [ Smart data ] */}
                <View style={[styles.segmentedBar, { backgroundColor: COLORS.surface2 }]}>
                  <TouchableOpacity
                    style={[
                      styles.segmentTab,
                      activeViewerTab === 'image' && {
                        backgroundColor: COLORS.surface,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.15,
                        shadowRadius: 2,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selection();
                      setActiveViewerTab('image');
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="image-outline"
                      size={15}
                      color={activeViewerTab === 'image' ? COLORS.accent : COLORS.muted}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.segmentTabText,
                        {
                          color: activeViewerTab === 'image' ? (isDark ? '#FFFFFF' : COLORS.text) : COLORS.muted,
                          fontWeight: activeViewerTab === 'image' ? '700' : '600',
                        },
                      ]}
                    >
                      Image
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.segmentTab,
                      activeViewerTab === 'text' && {
                        backgroundColor: COLORS.surface,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.15,
                        shadowRadius: 2,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selection();
                      setActiveViewerTab('text');
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={15}
                      color={activeViewerTab === 'text' ? COLORS.accent : COLORS.muted}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.segmentTabText,
                        {
                          color: activeViewerTab === 'text' ? (isDark ? '#FFFFFF' : COLORS.text) : COLORS.muted,
                          fontWeight: activeViewerTab === 'text' ? '700' : '600',
                        },
                      ]}
                    >
                      Text
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.segmentTab,
                      activeViewerTab === 'smart' && {
                        backgroundColor: COLORS.surface,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.15,
                        shadowRadius: 2,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selection();
                      setActiveViewerTab('smart');
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="sparkles-outline"
                      size={15}
                      color={activeViewerTab === 'smart' ? COLORS.accent : COLORS.muted}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.segmentTabText,
                        {
                          color: activeViewerTab === 'smart' ? (isDark ? '#FFFFFF' : COLORS.text) : COLORS.muted,
                          fontWeight: activeViewerTab === 'smart' ? '700' : '600',
                        },
                      ]}
                    >
                      Smart data
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Tab 1: [Image] Action Bar & Controls */}
                {activeViewerTab === 'image' && (
                  <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {/* Top Action Buttons: Scan, Recrop, Left, Right, Watermark, Sign */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.editActionRow}
                    >
                      <NativeScaleButton
                        style={[styles.editActionBtn, { backgroundColor: '#3B82F620', borderWidth: 1, borderColor: '#3B82F650' }]}
                        onPress={handleScanWithGoogleScanner}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="light"
                      >
                        <Ionicons name="camera-outline" size={15} color="#3B82F6" />
                        <Text style={[styles.editActionLabel, { color: '#3B82F6', fontWeight: '700' }]} numberOfLines={1}>Scan with Camera</Text>
                      </NativeScaleButton>

                      <NativeScaleButton
                        style={[styles.editActionBtn, { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border }]}
                        onPress={handleOpenRecrop}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="light"
                      >
                        <Ionicons name="crop-outline" size={15} color={COLORS.text} />
                        <Text style={[styles.editActionLabel, { color: COLORS.text }]} numberOfLines={1}>Crop & Filter</Text>
                      </NativeScaleButton>

                      <NativeScaleButton
                        style={[styles.editActionBtn, { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border }]}
                        onPress={() => handleRotateCurrentPage(270)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="light"
                      >
                        <Ionicons name="arrow-undo-outline" size={15} color={COLORS.text} />
                        <Text style={[styles.editActionLabel, { color: COLORS.text }]} numberOfLines={1}>Left</Text>
                      </NativeScaleButton>

                      <NativeScaleButton
                        style={[styles.editActionBtn, { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border }]}
                        onPress={() => handleRotateCurrentPage(90)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="light"
                      >
                        <Ionicons name="arrow-redo-outline" size={15} color={COLORS.text} />
                        <Text style={[styles.editActionLabel, { color: COLORS.text }]} numberOfLines={1}>Right</Text>
                      </NativeScaleButton>

                      <NativeScaleButton
                        style={[styles.editActionBtn, { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border }]}
                        onPress={() => setShowWatermarkModal(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="light"
                      >
                        <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.text} />
                        <Text style={[styles.editActionLabel, { color: COLORS.text }]} numberOfLines={1}>Watermark</Text>
                      </NativeScaleButton>

                      <NativeScaleButton
                        style={[styles.editActionBtn, { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border }]}
                        onPress={() => setShowSignatureModal(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="light"
                      >
                        <Ionicons name="pencil-outline" size={15} color={COLORS.text} />
                        <Text style={[styles.editActionLabel, { color: COLORS.text }]} numberOfLines={1}>Sign</Text>
                      </NativeScaleButton>
                    </ScrollView>

                    {/* Filter Thumbnails Carousel with Live Page Previews */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 }}>
                      <Text style={[styles.sectionHeading, { color: COLORS.muted, marginTop: 0, marginBottom: 0 }]}>ENHANCEMENT FILTERS</Text>
                      {isApplyingFilter && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 6 }} />
                          <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600' }}>Applying filter...</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.filterPresetsRow}>
                      {(['none', 'auto', 'bw', 'color', 'photo'] as const).map(preset => (
                        <NativeScaleButton
                          key={preset}
                          style={[
                            styles.filterPresetCard,
                            activeFilterPreset === preset && [styles.filterPresetCardActive, { borderColor: COLORS.accent }],
                          ]}
                          disabled={isApplyingFilter}
                          onPress={() => handleFilterPresetSelect(preset)}
                          hapticType="selection"
                          activeScale={0.92}
                        >
                          <View style={[styles.filterPresetThumb, { backgroundColor: COLORS.surface2, overflow: 'hidden' }]}>
                            {viewerPages[currentPageIndex] ? (
                              <Image
                                source={{ uri: viewerPages[currentPageIndex] }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
                              />
                            ) : null}
                            <View
                              style={[
                                StyleSheet.absoluteFillObject,
                                preset === 'bw' && { backgroundColor: 'rgba(0,0,0,0.35)' },
                                preset === 'auto' && { backgroundColor: 'rgba(37,99,235,0.25)' },
                                preset === 'color' && { backgroundColor: 'rgba(16,185,129,0.25)' },
                                preset === 'photo' && { backgroundColor: 'rgba(245,158,11,0.25)' },
                                preset === 'none' && { backgroundColor: 'rgba(0,0,0,0.18)' },
                                { justifyContent: 'center', alignItems: 'center' },
                              ]}
                            >
                              <Ionicons
                                name={preset === 'bw' ? 'contrast' : preset === 'color' ? 'color-palette' : preset === 'photo' ? 'image' : preset === 'auto' ? 'sparkles' : 'document-outline'}
                                size={18}
                                color="#FFFFFF"
                              />
                            </View>
                          </View>
                          <Text style={[styles.filterPresetName, { color: activeFilterPreset === preset ? COLORS.accent : COLORS.muted }]}>
                            {preset.toUpperCase()}
                          </Text>
                        </NativeScaleButton>
                      ))}
                    </View>

                    {/* Page Management Section: Organize & Delete Page (Clean & Beautiful) */}
                    <View style={[styles.pageManagementCard, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
                      <View style={styles.pageManagementInfo}>
                        <Ionicons name="document-text-outline" size={17} color={COLORS.accent} />
                        <Text style={[styles.pageManagementTitle, { color: COLORS.text }]}>
                          Page {currentPageIndex + 1} of {viewerPages.length}
                        </Text>
                        {canUndoCurrentPage && (
                          <NativeScaleButton
                            style={[styles.compactUndoChip, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '40' }]}
                            onPress={handleUndoCurrentPage}
                            disabled={isApplyingFilter}
                            hapticType="medium"
                            accessibilityLabel="Undo edit"
                          >
                            <Ionicons name="arrow-undo" size={13} color={COLORS.accent} style={{ marginRight: 4 }} />
                            <Text style={[styles.compactUndoText, { color: COLORS.accent }]}>Undo</Text>
                          </NativeScaleButton>
                        )}
                      </View>
                      <View style={styles.pageManagementActions}>
                        <NativeScaleButton
                          style={[styles.pageActionBtn, { backgroundColor: '#EF444415', borderColor: '#EF444430' }]}
                          onPress={handleDeleteCurrentPage}
                          hapticType="medium"
                          activeScale={0.94}
                        >
                          <Ionicons name="trash-outline" size={15} color="#EF4444" style={{ marginRight: 5 }} />
                          <Text style={[styles.pageActionBtnText, { color: '#EF4444', fontWeight: '700' }]}>Delete Page</Text>
                        </NativeScaleButton>
                      </View>
                    </View>
                  </ScrollView>
                )}

              {/* Tab 2: [Text] Extracted OCR Text */}
              {activeViewerTab === 'text' && (
                <View style={{ flex: 1 }}>
                  <View style={styles.textTabHeader}>
                    <Text style={[styles.sectionHeading, { color: COLORS.muted }]}>EXTRACTED OCR TEXT</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => handleExtractOcrNow(true)}
                        disabled={isExtractingOcr}
                        style={[styles.copyTextBtn, { marginRight: 16 }]}
                      >
                        <Ionicons name="refresh-outline" size={16} color={COLORS.accent} style={{ marginRight: 4 }} />
                        <Text style={[styles.copyTextLabel, { color: COLORS.accent }]}>
                          {isExtractingOcr ? 'Scanning...' : 'Re-scan'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleCopyOcrText} style={styles.copyTextBtn}>
                        <Ionicons name="copy-outline" size={16} color={COLORS.accent} style={{ marginRight: 4 }} />
                        <Text style={[styles.copyTextLabel, { color: COLORS.accent }]}>Copy All</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* In-Document Search Bar with Stepper */}
                  <View style={[styles.inDocSearchBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                    <Ionicons name="search" size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.inDocSearchInput, { color: COLORS.text }]}
                      placeholder="Search inside extracted text..."
                      placeholderTextColor={COLORS.muted}
                      value={inDocSearchQuery}
                      onChangeText={t => {
                        setInDocSearchQuery(t);
                        setInDocMatchIndex(0);
                      }}
                    />
                    {inDocSearchQuery.length > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.matchCounterText, { color: COLORS.accent }]}>
                          {inDocSearchResults.count > 0 ? `${inDocMatchIndex + 1}/${inDocSearchResults.count}` : '0 results'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            if (inDocSearchResults.count > 0) {
                              setInDocMatchIndex(prev => (prev - 1 + inDocSearchResults.count) % inDocSearchResults.count);
                            }
                          }}
                          disabled={inDocSearchResults.count === 0}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="chevron-up" size={18} color={inDocSearchResults.count > 0 ? COLORS.text : COLORS.muted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (inDocSearchResults.count > 0) {
                              setInDocMatchIndex(prev => (prev + 1) % inDocSearchResults.count);
                            }
                          }}
                          disabled={inDocSearchResults.count === 0}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="chevron-down" size={18} color={inDocSearchResults.count > 0 ? COLORS.text : COLORS.muted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setInDocSearchQuery('');
                            setInDocMatchIndex(0);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={16} color={COLORS.muted} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <ScrollView style={[styles.ocrTextScroll, { backgroundColor: COLORS.surface2 }]} contentContainerStyle={{ padding: 14 }}>
                    {isExtractingOcr ? (
                      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <ActivityIndicator size="large" color={COLORS.accent} />
                        <Text style={{ color: COLORS.text, fontWeight: '700', marginTop: 14, fontSize: 15 }}>
                          {ocrProgress && ocrProgress.total > 1
                            ? `Extracting text (${ocrProgress.current}/${ocrProgress.total} pages)...`
                            : 'Extracting text with OCR...'}
                        </Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
                          Running non-blocking on-device ML Kit text recognition
                        </Text>
                      </View>
                    ) : docOcrText ? (
                      <Text style={[styles.ocrTextContent, { color: COLORS.text }]} selectable>
                        {renderHighlightedOcrText(docOcrText, inDocSearchQuery, inDocMatchIndex)}
                      </Text>
                    ) : (
                      <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                        <Ionicons name="text-outline" size={40} color={COLORS.muted} />
                        <Text style={{ color: COLORS.muted, marginTop: 10, fontSize: 14, fontWeight: '500' }}>
                          No text detected on this document.
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleExtractOcrNow(true)}
                          style={{
                            marginTop: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: COLORS.accent,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 10,
                          }}
                        >
                          <Ionicons name="scan-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Extract Text with OCR</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Tab 3: [Smart data] */}
              {activeViewerTab === 'smart' && (
                <ScrollView contentContainerStyle={{ padding: 14 }}>
                  <Text style={[styles.sectionHeading, { color: COLORS.muted, marginBottom: 10 }]}>EXTRACTED ENTITIES</Text>
                  {smartEntities.length > 0 ? (
                    smartEntities.map((ent, idx) => {
                      const hasAction = ent.type === 'phone' || ent.type === 'email' || ent.type === 'upi' || ent.type === 'amount' || ent.type === 'date';
                      return (
                        <View
                          key={`ent_${idx}`}
                          style={[styles.smartEntityCard, { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border }]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                            <View style={[styles.smartEntityIconBadge, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                              <Ionicons name={ent.icon as any} size={18} color={COLORS.accent} />
                            </View>
                            <View style={{ flex: 1, marginRight: 10 }}>
                              <Text style={[styles.smartEntityLabel, { color: COLORS.muted }]}>{ent.label}</Text>
                              <Text style={[styles.smartEntityValue, { color: COLORS.text }]} selectable numberOfLines={2}>
                                {ent.value}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={async () => {
                                await Clipboard.setStringAsync(ent.value);
                                showAlert('Copied!', `Copied ${ent.label}: ${ent.value}`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'copy', iconColor: COLORS.success });
                              }}
                              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                              style={[styles.smartCopyBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="copy-outline" size={16} color={COLORS.text} />
                            </TouchableOpacity>
                          </View>

                          {/* Smart Action Chips Row */}
                          {hasAction && (
                            <View style={styles.smartActionChipsRow}>
                              {ent.type === 'phone' && (
                                <>
                                  <TouchableOpacity
                                    style={[styles.actionChip, { backgroundColor: '#10B98118', borderColor: '#10B98140' }]}
                                    onPress={() => Linking.openURL(`tel:${ent.value.replace(/[^0-9+]/g, '')}`).catch(() => {})}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons name="call" size={13} color="#10B981" style={{ marginRight: 5 }} />
                                    <Text style={[styles.actionChipText, { color: '#10B981' }]}>Call</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.actionChip, { backgroundColor: '#25D36618', borderColor: '#25D36640' }]}
                                    onPress={() => Linking.openURL(`https://wa.me/${ent.value.replace(/[^0-9]/g, '')}`).catch(() => {})}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons name="logo-whatsapp" size={13} color="#25D366" style={{ marginRight: 5 }} />
                                    <Text style={[styles.actionChipText, { color: '#25D366' }]}>WhatsApp</Text>
                                  </TouchableOpacity>
                                </>
                              )}

                              {ent.type === 'email' && (
                                <TouchableOpacity
                                  style={[styles.actionChip, { backgroundColor: COLORS.accent + '18', borderColor: COLORS.accent + '40' }]}
                                  onPress={() => Linking.openURL(`mailto:${ent.value}`).catch(() => {})}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="mail" size={13} color={COLORS.accent} style={{ marginRight: 5 }} />
                                  <Text style={[styles.actionChipText, { color: COLORS.accent }]}>Compose</Text>
                                </TouchableOpacity>
                              )}

                              {ent.type === 'upi' && (
                                <TouchableOpacity
                                  style={[styles.actionChip, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF640' }]}
                                  onPress={() => Linking.openURL(`upi://pay?pa=${encodeURIComponent(ent.value)}&pn=Payee`).catch(() => {})}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="flash" size={13} color="#8B5CF6" style={{ marginRight: 5 }} />
                                  <Text style={[styles.actionChipText, { color: '#8B5CF6' }]}>Pay via UPI</Text>
                                </TouchableOpacity>
                              )}

                              {ent.type === 'amount' && (
                                <TouchableOpacity
                                  style={[styles.actionChip, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}
                                  onPress={() => Linking.openURL(`upi://pay?am=${encodeURIComponent(ent.value.replace(/[^0-9.]/g, ''))}&cu=INR`).catch(() => {})}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="card" size={13} color="#F59E0B" style={{ marginRight: 5 }} />
                                  <Text style={[styles.actionChipText, { color: '#F59E0B' }]}>Pay Amount</Text>
                                </TouchableOpacity>
                              )}

                              {ent.type === 'date' && (
                                <TouchableOpacity
                                  style={[styles.actionChip, { backgroundColor: '#3B82F618', borderColor: '#3B82F640' }]}
                                  onPress={() => Linking.openURL('content://com.android.calendar/time/').catch(() => {})}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="calendar-outline" size={13} color="#3B82F6" style={{ marginRight: 5 }} />
                                  <Text style={[styles.actionChipText, { color: '#3B82F6' }]}>Add to Calendar</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                      <Ionicons name="sparkles-outline" size={40} color={COLORS.muted} />
                      <Text style={{ color: COLORS.muted, marginTop: 8, textAlign: 'center' }}>
                        No specific dates or amounts recognized yet.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
              </Animated.View>
            )}
          </View>
        </Modal>
      )}

      {/* ---------------- Add Pages Bottom Sheet Modal (Screenshot 5) ---------------- */}
      <Modal visible={showAddPagesModal} transparent animationType="fade" statusBarTranslucent={true} onRequestClose={() => setShowAddPagesModal(false)}>
        <TouchableOpacity style={styles.moreMenuBackdrop} activeOpacity={1} onPress={() => setShowAddPagesModal(false)}>
          <Reanimated.View 
            entering={SlideInDown.springify().damping(22).stiffness(260)}
            style={[styles.addPagesSheetBox, { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border }]}
          >
            <TouchableOpacity
              style={styles.addPagesOptionBtn}
              onPress={() => {
                setShowAddPagesModal(false);
                handleScanWithGoogleScanner();
              }}
            >
              <Text style={[styles.addPagesOptionText, { color: COLORS.accent, fontWeight: '700' }]}>Scan with Camera...</Text>
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity style={styles.addPagesOptionBtn} onPress={handleAddPhotos}>
              <Text style={[styles.addPagesOptionText, { color: COLORS.accent }]}>Add photos...</Text>
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { backgroundColor: COLORS.border }]} />

            <TouchableOpacity style={styles.addPagesOptionBtn} onPress={handleAddFiles}>
              <Text style={[styles.addPagesOptionText, { color: COLORS.accent }]}>Add files...</Text>
            </TouchableOpacity>

            <View style={[styles.moreMenuDivider, { height: 6, backgroundColor: COLORS.surface2 }]} />

            <TouchableOpacity style={styles.addPagesOptionBtn} onPress={() => setShowAddPagesModal(false)}>
              <Text style={[styles.addPagesOptionText, { color: '#EF4444', fontWeight: '700' }]}>Cancel</Text>
            </TouchableOpacity>
          </Reanimated.View>
        </TouchableOpacity>
      </Modal>

      {/* ---------------- Scan & Import Choice Sheet Modal ---------------- */}
      <Modal visible={showScanChoiceModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowScanChoiceModal(false)}
        >
          <Reanimated.View
            entering={ZoomIn.duration(200)}
            exiting={FadeOut.duration(MotionTiming.quick)}
            style={[styles.choiceSheetModal, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="scan" size={24} color={COLORS.accent} style={{ marginRight: 10 }} />
              <Text style={[styles.modalTitle, { color: COLORS.text, marginBottom: 0 }]}>Scan & Import Documents</Text>
            </View>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={handleScanBatch}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="document-text" size={22} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Document Scanner (Multi-Page)</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Auto-detect edges, crop, and capture multi-page PDFs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={handleScanId2In1}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="card" size={22} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>2-in-1 ID Scanner</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Composite Front & Back onto 1 single A4 PDF page</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={handleImportPhotos}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="images-outline" size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Choose from Photos</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Import document photos from your device gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={handleImportPdfFile}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="folder-open-outline" size={22} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Select PDF File</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Import existing PDF files into Scans & Docs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { backgroundColor: COLORS.surface2, marginTop: 16 }]}
              onPress={() => setShowScanChoiceModal(false)}
            >
              <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Reanimated.View>
        </TouchableOpacity>
      </Modal>

      {/* ---------------- 2-in-1 ID Scan Guide Modal ---------------- */}
      <Modal visible={showIdGuideModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowIdGuideModal(false)}
        >
          <Reanimated.View
            entering={ZoomIn.duration(200)}
            style={[styles.idGuideModalContent, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <View style={styles.idGuideHeader}>
              <View style={[styles.idGuideIconBox, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="card" size={26} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.idGuideTitle, { color: COLORS.text }]}>2-in-1 ID Scanner</Text>
                <Text style={[styles.idGuideSubtitle, { color: COLORS.muted }]}>
                  Two-Side Scan on Single A4 PDF Page
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowIdGuideModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.idGuideStepsBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              {/* Step 1 */}
              <View style={styles.idGuideStepRow}>
                <View style={[styles.stepCircle, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.stepCircleText}>1</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.stepRowTitle, { color: COLORS.text }]}>Scan Front Side</Text>
                  <Text style={[styles.stepRowDesc, { color: COLORS.muted }]}>
                    Google scanner will auto-detect edges, crop, and straighten the front of your card.
                  </Text>
                </View>
              </View>

              <View style={[styles.stepDividerLine, { backgroundColor: COLORS.border }]} />

              {/* Step 2 */}
              <View style={styles.idGuideStepRow}>
                <View style={[styles.stepCircle, { backgroundColor: '#F59E0B' }]}>
                  <Text style={styles.stepCircleText}>2</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.stepRowTitle, { color: COLORS.text }]}>Tap "+" in Scanner for Back</Text>
                  <Text style={[styles.stepRowDesc, { color: COLORS.muted }]}>
                    Flip card and capture back side (or tap checkmark if card is single-sided like PAN).
                  </Text>
                </View>
              </View>

              <View style={[styles.stepDividerLine, { backgroundColor: COLORS.border }]} />

              {/* Step 3 */}
              <View style={styles.idGuideStepRow}>
                <View style={[styles.stepCircle, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.stepRowTitle, { color: COLORS.text }]}>Automatic 1-Page A4 Assembly</Text>
                  <Text style={[styles.stepRowDesc, { color: COLORS.muted }]}>
                    Both sides are automatically formatted onto 1 single PDF page with official KYC borders.
                  </Text>
                </View>
              </View>
            </View>

            <NativeScaleButton
              style={[styles.startScanBtn, { backgroundColor: '#3B82F6' }]}
              onPress={handleStartIdScan}
              activeScale={0.95}
              hapticType="medium"
            >
              <Ionicons name="camera" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.startScanBtnText}>Open 2-in-1 Scanner</Text>
            </NativeScaleButton>
          </Reanimated.View>
        </TouchableOpacity>
      </Modal>

      {/* ---------------- Export Modal ---------------- */}
      {selectedDoc && (
        <ScannerExportModal
          visible={showExportModal}
          pdfUri={selectedDoc.uri}
          documentTitle={selectedDoc.name}
          docSize={selectedDoc.size}
          pageCount={viewerPages.length || 1}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* ---------------- List & Context Menu Export Modal ---------------- */}
      {exportTargetDoc && (
        <ScannerExportModal
          visible={true}
          pdfUri={exportTargetDoc.uri}
          documentTitle={exportTargetDoc.name}
          docSize={exportTargetDoc.size}
          onClose={() => {
            setExportTargetDoc(null);
          }}
        />
      )}

      {/* ---------------- Crop Editor Modal ---------------- */}
      {selectedDoc && viewerPages.length > 0 && showCropModal && (
        <ScannerCropEditorModal
          visible={true}
          initialAutoCrop={false}
          page={{
            id: `p_${currentPageIndex}`,
            uri: viewerPages[currentPageIndex],
            originalUri: originalPagesRef.current[currentPageIndex] || viewerPages[currentPageIndex],
            width: 0,
            height: 0,
            rotation: pageRotations[currentPageIndex] || 0,
            filter: 'original',
            ocrStatus: 'done',
          }}
          onSave={async updated => {
            setShowCropModal(false);
            if (!updated.uri || !selectedDoc) return;

            // Fast-path: if crop result is identical to current page without rotation or filter change, no-op
            const currentUri = viewerPages[currentPageIndex];
            if (
              updated.uri === currentUri &&
              (updated.rotation === 0 || !updated.rotation) &&
              (!updated.filter || updated.filter === 'original')
            ) {
              return;
            }

            try {
              setIsApplyingFilter(true);

              // 1. Immediately update viewer thumbnail in 0ms without unmounting viewer
              const prevUri = viewerPages[currentPageIndex];
              if (prevUri) {
                const savedUri = await persistImageForUndo(prevUri);
                const curStack = pageUndoHistoryRef.current[currentPageIndex] || [];
                pageUndoHistoryRef.current[currentPageIndex] = [...curStack, savedUri];
                setUndoVersion(v => v + 1);
              }

              const next = [...viewerPages];
              next[currentPageIndex] = updated.uri;
              setViewerPages(next);
              viewerPagesRef.current = next;

              // 2. Reset visual rotation delta for this page since rotation was already baked into the cropped image
              setPageRotations(prev => {
                const copy = [...prev];
                copy[currentPageIndex] = 0;
                return copy;
              });
              if (pageRotationsRef.current) {
                const rotCopy = [...pageRotationsRef.current];
                rotCopy[currentPageIndex] = 0;
                pageRotationsRef.current = rotCopy;
              }

              // 3. Mark page dirty in centralized state with image content change
              committedRotationsRef.current[currentPageIndex] = 0;
              dirtyPagesRef.current.add(currentPageIndex);
              dirtyImagePagesRef.current.add(currentPageIndex);

              // 4. Commit immediately so cropped page is guaranteed saved to disk without delay
              await commitDirtyPages();

              Haptics.success();
            } catch (err: any) {
              console.warn('[documents] Failed to update viewer page:', err);
              showAlert('Save Error', err?.message || 'Failed to save cropped page.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
            } finally {
              setIsApplyingFilter(false);
            }
          }}
          onDelete={() => {
            setShowCropModal(false);
            handleDeleteCurrentPage();
          }}
          onClose={() => setShowCropModal(false)}
        />
      )}

      {/* ---------------- Watermark Modal ---------------- */}
      <DocumentWatermarkModal
        visible={showWatermarkModal}
        onClose={() => setShowWatermarkModal(false)}
        onApply={handleApplyWatermark}
      />

      {/* ---------------- Signature Modal ---------------- */}
      <DocumentSignatureModal
        visible={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onApply={handleApplySignature}
      />

      {/* Hidden WebView for Fast Permanent Image Filtering */}
      <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} pointerEvents="none">
        <WebView
          ref={filterWebViewRef}
          originWhitelist={['*']}
          source={{ html: filterCanvasHtml }}
          onMessage={handleFilterWebViewMessage}
          style={{ width: 1, height: 1 }}
        />
      </View>

      {/* ---------------- Rename Document Modal ---------------- */}
      <Modal visible={renameModalDoc !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Reanimated.View 
            entering={ZoomIn.duration(200)}
            style={[styles.modalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <Text style={[styles.modalTitle, { color: COLORS.text }]}>Rename Document</Text>
            <Text style={[styles.modalSubtitle, { color: COLORS.muted }]}>
              Enter a new name for this document:
            </Text>

            <TextInput
              style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface2 }]}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Document name..."
              placeholderTextColor={COLORS.muted}
              autoFocus
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.surface2 }]}
                onPress={() => setRenameModalDoc(null)}
              >
                <Text style={{ color: COLORS.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.accent }]}
                onPress={handleConfirmRename}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Rename</Text>
              </TouchableOpacity>
            </View>
          </Reanimated.View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  headerPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  rowThumbWrap: {
    width: 48,
    height: 60,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  pageCountBadge: {
    position: 'absolute',
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  pageCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  rowCenter: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  rowSubtitle: {
    fontSize: 12,
    marginBottom: 6,
  },
  rowTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowTagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  topSearchWrap: {
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  viewerPreviewWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bwFilterOverlay: {
    backgroundColor: '#000000',
    opacity: 0.22,
    borderRadius: 8,
  },
  photoFilterOverlay: {
    backgroundColor: '#F59E0B',
    opacity: 0.1,
    borderRadius: 8,
  },
  autoFilterOverlay: {
    backgroundColor: '#0284C7',
    opacity: 0.08,
    borderRadius: 8,
  },
  activeFilterPillBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeFilterPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  tagSlider: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 4,
  },
  quickTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickTagChipText: {
    fontSize: 12,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingLabel: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  viewerModalContainer: {
    flex: 1,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  viewerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  viewerBackText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  viewerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  viewerDocTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  viewerDocSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  viewerHeaderIconBtn: {
    padding: 6,
  },
  viewerHeaderPageText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  viewerUpperPreview: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  viewerReadingBottomBar: {
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  viewerReadingActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  viewerReadingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
    marginHorizontal: 4,
  },
  viewerReadingEditBtn: {
    borderWidth: 1,
    borderColor: '#2563EB50',
  },
  viewerReadingBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetDragHeader: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 30,
  },
  sheetDragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
  },
  minimizeSheetBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageManagementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  pageManagementInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageManagementTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  pageManagementActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pageActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewerPreviewImage: {
    width: '96%',
    height: '96%',
  },
  pageSliderOverlay: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  paperPageFrame: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtn: {
    padding: 4,
  },
  stepperText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewerLowerSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  segmentedBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 10,
    padding: 3,
    position: 'relative',
  },
  segmentActiveIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentTabActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTabTextActive: {
    fontWeight: '700',
  },
  imageTabContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  imageActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 12,
  },
  imageActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 4,
  },
  imageActionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 2,
    marginBottom: 4,
  },
  filterPresetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  filterPresetCard: {
    flex: 1,
    alignItems: 'center',
    padding: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterPresetCardActive: {},
  filterPresetThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  filterPresetName: {
    fontSize: 11,
    fontWeight: '700',
  },
  compactUndoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 8,
  },
  compactUndoText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textTabHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  copyTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyTextLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  ocrTextScroll: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
  },
  ocrTextContent: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  smartEntityCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  smartEntityIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
  },
  smartCopyBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  smartEntityLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  smartEntityValue: {
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 2,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerActionOrange: {
    fontSize: 16,
    fontWeight: '700',
  },
  selectionCountTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  selectCheckboxWrap: {
    paddingRight: 12,
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCard: {
    flex: 1,
    margin: 6,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  gridThumb: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gridSelectionCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  gridSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    zIndex: 99,
  },
  batchActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    elevation: 10,
    zIndex: 99,
  },
  batchActionBtn: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  batchActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  moreMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: 16,
  },
  moreMenuPopover: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  moreMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  moreMenuText: {
    fontSize: 15,
    fontWeight: '600',
  },
  moreMenuDivider: {
    height: 1,
    marginVertical: 4,
  },
  contextMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  contextMenuBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  contextMenuTitle: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#33333E',
    marginBottom: 4,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  contextMenuText: {
    fontSize: 14,
    fontWeight: '600',
  },
  viewerDocCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  viewerCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  addTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  docActionBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#282832',
    marginBottom: 6,
  },
  docActionBarBtn: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  docActionBarLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  editSheetBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginTop: 2,
  },
  editActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  editActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRadius: 8,
    minWidth: 48,
    gap: 2,
  },
  editActionLabel: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  undoActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  undoMainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  undoBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  revertOriginalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  revertOriginalText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  settingToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#33333E',
    borderBottomWidth: 1,
    borderBottomColor: '#33333E',
    marginBottom: 12,
  },
  editBottomActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  editBottomBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  addPagesSheetBox: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  addPagesOptionBtn: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  addPagesOptionText: {
    fontSize: 17,
    fontWeight: '600',
  },
  colorFilterOverlay: {
    backgroundColor: '#10B981',
    opacity: 0.08,
  },
  sourceTabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceTabTrack: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  sourceTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 9,
  },
  sourceTabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sourceTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inDocSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  inDocSearchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  matchCounterText: {
    fontSize: 11,
    fontWeight: '700',
  },
  smartActionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.25)',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  choiceSheetModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  sheetOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
  },
  idGuideModalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
  },
  idGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  idGuideIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idGuideTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  idGuideSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  idGuideStepsBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  idGuideStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepCircleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepRowTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepRowDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  stepDividerLine: {
    height: 1,
    marginVertical: 10,
    marginLeft: 32,
  },
  startScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  startScanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
