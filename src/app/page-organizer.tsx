/**
 * page-organizer.tsx — Professional PDF Page Management Workbench.
 *
 * Implements:
 *   - Multi-page thumbnail grid with round checkmark badges
 *   - Back button with proper navigation fallback
 *   - Empty/No-PDF state with instant file picker and recent PDF list
 *   - Robust page rendering with native engine + pdf-lib fallback
 *   - Split, Extract, Merge, Insert (+Scan), Delete, Reorder, and Rotate
 *   - Atomic SQLite FTS5 re-indexing
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, { LinearTransition, ZoomIn, FadeIn } from 'react-native-reanimated';
import { NativeScaleButton } from '../components/NativeScaleButton';
import { FileThumbnail } from '../components/FileThumbnail';
import { Haptics } from '../utils/haptics';
import { useThemeColors } from '../utils/theme';
import { renderPdfToImages, renderPdfPage, invalidatePdfRenderCache } from '../services/indexerService';
import { getAllPdfDocuments, renameDocument, updateDocumentPageCount } from '../services/database';
import {
  getPdfPagesInfo,
  renderPdfWithPageRotations,
  splitPdf,
  extractPages,
  mergePdfs,
  insertPagesIntoPdf,
  deletePagesFromPdf,
  reorderPagesInPdf,
  rotatePagesInPdf,
  copyOrMovePagesToPdf,
  PageInfo,
  commitPagesBatchToPdf,
  PageCommitSpec,
} from '../services/pdfWorkbenchService';
import {
  normalizeCapturedPhoto,
  detectDocumentEdges,
  cropAndRotateImage,
  buildPdfFromImages,
  cropAndStraightenDocument,
  launchGoogleDocScanner,
} from 'expo-pdf-to-image';
import { formatSize, formatDate } from '../utils/format';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { ScannerCropEditorModal } from '../components/ScannerCropEditorModal';
import { ReviewPromptModal } from '../components/ReviewPromptModal';
import { recordOrganizedDoc } from '../services/reviewPromptService';
import { ocrQueueManager } from '../services/ocrQueueManager';

// ---------------- Memoized Page Organizer Grid Card ----------------
interface PageOrganizerCardProps {
  thumbUri: string;
  index: number;
  isSelected: boolean;
  isDraggingThis: boolean;
  isTarget: boolean;
  rot: number;
  totalCount: number;
  hasAnySelection: boolean;
  singleSelected: boolean;
  onToggleSelect: (index: number) => void;
  onOpenEditor: (index: number) => void;
  onLongPress: (index: number, e: any) => void;
  onMovePage: (from: number, to: number) => void;
  COLORS: any;
}

const PageOrganizerCard = React.memo(
  function PageOrganizerCard({
    thumbUri,
    index,
    isSelected,
    isDraggingThis,
    isTarget,
    rot,
    totalCount,
    hasAnySelection,
    singleSelected,
    onToggleSelect,
    onOpenEditor,
    onLongPress,
    onMovePage,
    COLORS,
  }: PageOrganizerCardProps) {
    const isLandscapeAngle = rot === 90 || rot === 270;

    return (
      <View style={{ flex: 1 / 3 }}>
        <NativeScaleButton
          activeScale={0.94}
          enableHaptic={false}
          style={[
            styles.pageCard,
            { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.accent : COLORS.border },
            isDraggingThis && { opacity: 0.3, borderColor: COLORS.accent, borderStyle: 'dashed' },
            isTarget && { borderColor: '#10B981', borderWidth: 2.5, transform: [{ scale: 1.05 }] },
          ]}
          onPress={() => {
            if (hasAnySelection) {
              onToggleSelect(index);
            } else {
              onOpenEditor(index);
            }
          }}
          onLongPress={(e) => onLongPress(index, e)}
        >
          {thumbUri ? (
            <Image
              source={{ uri: thumbUri }}
              style={[
                styles.thumbnailImage,
                rot !== 0 && {
                  transform: [
                    { rotate: `${rot}deg` },
                    ...(isLandscapeAngle ? [{ scale: 0.72 }] : []),
                  ],
                },
              ]}
              resizeMode="contain"
              fadeDuration={0}
            />
          ) : (
            <View style={[styles.placeholderCard, { backgroundColor: COLORS.surface2 }]}>
              <Ionicons name="document-text-outline" size={28} color={COLORS.muted} />
              <Text style={[styles.placeholderPageNum, { color: COLORS.muted, marginTop: 6, fontSize: 11 }]}>
                Page {index + 1}
              </Text>
            </View>
          )}

          {/* Round Checkmark Badge in Top Right */}
          <TouchableOpacity
            style={[
              styles.roundCheckmarkBadge,
              isSelected
                ? { backgroundColor: COLORS.accent, borderColor: COLORS.accent }
                : { borderColor: 'rgba(0,0,0,0.25)', backgroundColor: 'rgba(255,255,255,0.7)' },
            ]}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            onPress={() => onToggleSelect(index)}
            activeOpacity={0.7}
          >
            {isSelected && (
              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
            )}
          </TouchableOpacity>

          {/* Page Number Label */}
          <View style={[styles.pageNumberBadge, { backgroundColor: isTarget ? '#10B981' : COLORS.surface2 }]}>
            <Text style={[styles.pageNumberText, { color: isTarget ? '#FFFFFF' : COLORS.text }]}>{index + 1}</Text>
          </View>

          {/* Target Drop Badge Indicator */}
          {isTarget && (
            <View style={styles.dropIndicatorBadge}>
              <Ionicons name="arrow-down-circle" size={16} color="#FFFFFF" />
              <Text style={styles.dropIndicatorText}>Drop here</Text>
            </View>
          )}

          {/* Quick Reorder Arrows on Selected Card (only when exactly 1 card selected) */}
          {isSelected && singleSelected && !isDraggingThis && (
            <View style={styles.cardReorderOverlay} pointerEvents="box-none">
              {index > 0 && (
                <TouchableOpacity
                  style={[styles.cardReorderBtn, { left: 4 }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMovePage(index, index - 1);
                  }}
                  accessibilityLabel="Move Left"
                >
                  <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {index < totalCount - 1 && (
                <TouchableOpacity
                  style={[styles.cardReorderBtn, { right: 4 }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMovePage(index, index + 1);
                  }}
                  accessibilityLabel="Move Right"
                >
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </NativeScaleButton>
      </View>
    );
  },
  (prev, next) => {
    return (
      prev.thumbUri === next.thumbUri &&
      prev.index === next.index &&
      prev.isSelected === next.isSelected &&
      prev.isDraggingThis === next.isDraggingThis &&
      prev.isTarget === next.isTarget &&
      prev.rot === next.rot &&
      prev.singleSelected === next.singleSelected &&
      prev.totalCount === next.totalCount &&
      prev.COLORS === next.COLORS
    );
  }
);

export default function PageOrganizerScreen() {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pdfUri: string; fileName?: string; returnToDetail?: string; t?: string }>();

  const [activePdfUri, setActivePdfUri] = useState<string | null>(params.pdfUri ? decodeURIComponent(params.pdfUri) : null);
  const activePdfUriRef = useRef<string | null>(activePdfUri);
  activePdfUriRef.current = activePdfUri;
  const initialLoadedKeyRef = useRef<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>(params.fileName ? decodeURIComponent(params.fileName) : 'document.pdf');
  const activeFileNameRef = useRef<string>(activeFileName);
  activeFileNameRef.current = activeFileName;

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Rendering page thumbnails...');
  const [pageThumbnails, setPageThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const pendingRotationsRef = useRef<Record<number, number>>({});
  const rotationTimerRef = useRef<any>(null);
  const isCommittingRotationRef = useRef<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitStatusMessage, setCommitStatusMessage] = useState<string>('');
  const schedulePdfRotationCommitRef = useRef<any>(null);
  const isBusy = isLoading; // Decoupled: background disk commits never lock toolbar UI
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  // Debounced Reordering state
  const pendingReorderTimerRef = useRef<any>(null);
  const reorderOrderRef = useRef<number[] | null>(null);

  // Drag and Drop reordering state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridLayoutRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });
  const scrollOffsetRef = useRef<number>(0);

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

  // Protect page organizer performance: Gatekeeper ensures OCR is 100% paused while organizer is open
  useEffect(() => {
    ocrQueueManager.setOrganizerActive(true);
    return () => {
      ocrQueueManager.setOrganizerActive(false);
    };
  }, []);

  // Recent PDFs for empty picker
  const [recentDocs, setRecentDocs] = useState<Array<{ id: number; uri: string; name: string; size: number; modified: string }>>([]);

  // Split dialog state
  const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
  const [splitPointInput, setSplitPointInput] = useState<string>('');

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [renameInput, setRenameInput] = useState<string>('');

  // Copy / Move & App document picker state
  const [showMergeChoiceModal, setShowMergeChoiceModal] = useState<boolean>(false);
  const [showAppDocPickerModal, setShowAppDocPickerModal] = useState<boolean>(false);
  const [appDocPickerPurpose, setAppDocPickerPurpose] = useState<'merge' | 'copymove'>('merge');
  const [allAppDocs, setAllAppDocs] = useState<Array<{ id: number; uri: string; name: string; size: number; modified: string; isScanned: boolean }>>([]);
  const [appDocTab, setAppDocTab] = useState<'scanned' | 'system'>('scanned');
  const [appDocSearch, setAppDocSearch] = useState<string>('');

  // Crop & Filter editor modal state
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [cropPageIndex, setCropPageIndex] = useState<number | null>(null);

  const handleOpenCropModal = () => {
    if (selectedPages.size !== 1) return;
    const pageIdx = Array.from(selectedPages)[0];
    setCropPageIndex(pageIdx);
    setShowCropModal(true);
  };

  // Load recent docs if no PDF specified
  useEffect(() => {
    if (!activePdfUri) {
      getAllPdfDocuments().then(docs => setRecentDocs(docs.slice(0, 10))).catch(() => {});
    }
  }, [activePdfUri]);

  const lastLoadedKeyRef = useRef<string | null>(null);

  const loadThumbnails = useCallback(async (targetUri?: string, forceRefresh: boolean = false) => {
    const uri = targetUri || activePdfUriRef.current;
    if (!uri) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setStatusMessage('Rendering page thumbnails...');
    setPageRotations({});
    pendingRotationsRef.current = {};

    try {
      let resolvedUri = uri;
      if (resolvedUri.startsWith('content://')) {
        const cleanHash = Math.abs(resolvedUri.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
        const tempCache = `${FileSystem.cacheDirectory}content_${cleanHash}.pdf`;
        const fileInfo = await FileSystem.getInfoAsync(tempCache);
        if (!fileInfo.exists || forceRefresh) {
          await FileSystem.copyAsync({ from: resolvedUri, to: tempCache });
        }
        resolvedUri = tempCache;
      }

      if (forceRefresh) {
        invalidatePdfRenderCache(uri);
        invalidatePdfRenderCache(resolvedUri);
      }

      // Fast page count & rotation lookup (<5ms)
      let totalPages = 0;
      let pdfRotations: number[] | undefined = undefined;
      try {
        const info = await getPdfPagesInfo(resolvedUri);
        totalPages = Array.isArray(info) ? info.length : (info as any)?.pageCount || 0;
        if (Array.isArray(info) && info.length > 0) {
          pdfRotations = info.map(p => p.rotation || 0);
        }
      } catch (_) {}

      // 1. High-speed cache check: if all pages are already cached (e.g. freshly scanned batch), load in 0ms!
      let allCached: string[] = [];
      try {
        allCached = await renderPdfToImages(resolvedUri, pdfRotations, undefined, undefined, 600);
      } catch (_) {}

      if (allCached && allCached.length === totalPages && totalPages > 0) {
        setPageThumbnails(allCached);
        setSelectedPages(new Set());
        setIsLoading(false);
        return;
      }

      // 2. Pre-allocate placeholder slots immediately so user never sees a blank loading screen
      if (totalPages > 0) {
        const placeholderSlots: string[] = new Array(totalPages).fill('');
        if (allCached && allCached.length > 0) {
          for (let i = 0; i < allCached.length; i++) {
            placeholderSlots[i] = allCached[i];
          }
        }
        setPageThumbnails(placeholderSlots);
        setSelectedPages(new Set());
        setIsLoading(false);
      }

      // 3. Progressive streaming for large documents (100+ pages):
      // Render first screen in <100ms with 600px lightweight thumbnails, then stream cooperatively
      if (totalPages > 18) {
        let firstBatch: string[] = [];
        try {
          firstBatch = await renderPdfToImages(resolvedUri, pdfRotations, 0, 18, 600);
        } catch (_) {}

        if (firstBatch && firstBatch.length > 0) {
          setPageThumbnails(prev => {
            const next = [...prev];
            for (let i = 0; i < firstBatch.length; i++) {
              next[i] = firstBatch[i];
            }
            return next;
          });

          // Stream remaining pages cooperatively in the background
          (async () => {
            let offset = firstBatch.length;
            while (offset < totalPages) {
              await new Promise<void>(r => InteractionManager.runAfterInteractions(() => r()));
              const chunk = await renderPdfToImages(resolvedUri, pdfRotations, offset, 18, 600);
              if (chunk && chunk.length > 0) {
                setPageThumbnails(prev => {
                  const next = [...prev];
                  for (let c = 0; c < chunk.length; c++) {
                    next[offset + c] = chunk[c];
                  }
                  return next;
                });
                offset += chunk.length;
              } else {
                break;
              }
              await new Promise(r => setTimeout(r, 20));
            }
            await updateDocumentPageCount(resolvedUri, offset);
          })();
          return;
        }
      }

      // 3. Direct fast thumbnail rendering for documents <= 18 pages (600px max dimension)
      let thumbs: string[] = [];
      try {
        thumbs = await renderPdfToImages(resolvedUri, pdfRotations, undefined, undefined, 600);
      } catch (nativeErr) {
        console.warn('[pageOrganizer] Native thumbnail render failed, trying fallback:', nativeErr);
      }

      // 4. Retry with cache invalidation if render returned empty
      if (!thumbs || thumbs.length === 0) {
        try {
          invalidatePdfRenderCache(uri);
          invalidatePdfRenderCache(resolvedUri);
          thumbs = await renderPdfToImages(resolvedUri, pdfRotations, undefined, undefined, 600);
        } catch (_) {}
      }

      if (thumbs && thumbs.length > 0) {
        setPageThumbnails(thumbs);
        await updateDocumentPageCount(resolvedUri, thumbs.length);
        if (uri !== resolvedUri) {
          await updateDocumentPageCount(uri, thumbs.length);
        }
      } else {
        setPageThumbnails([]);
      }
      setSelectedPages(new Set());
    } catch (err: any) {
      console.warn('[pageOrganizer] Error reading PDF pages:', err);
      setPageThumbnails([]);
      setSelectedPages(new Set());
      showAlert('Unable to load PDF', 'Could not parse the pages of this document.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsLoading(false);
    }
  }, [COLORS]);

  // Sync active PDF cleanly when navigated or when route params change
  useFocusEffect(
    useCallback(() => {
      if (params.pdfUri) {
        const targetUri = decodeURIComponent(params.pdfUri);
        const loadKey = `${targetUri}_${params.t || ''}`;
        if (initialLoadedKeyRef.current === loadKey) {
          return;
        }
        initialLoadedKeyRef.current = loadKey;

        setActivePdfUri(targetUri);
        if (params.fileName) {
          setActiveFileName(decodeURIComponent(params.fileName));
        }
        loadThumbnails(targetUri, false);
      }
    }, [params.pdfUri, params.fileName, params.t, loadThumbnails])
  );

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const f = res.assets[0];
        setActivePdfUri(f.uri);
        setActiveFileName(f.name);
        lastLoadedKeyRef.current = f.uri;
        await loadThumbnails(f.uri, false);
      }
    } catch (err) {
      console.warn('[pageOrganizer] Document pick error:', err);
    }
  };

  const togglePageSelect = (index: number) => {
    Haptics.selection();
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectAll = useCallback(() => {
    Haptics.selection();
    if (selectedPages.size === pageThumbnails.length) {
      setSelectedPages(new Set());
    } else {
      const all = new Set<number>();
      for (let i = 0; i < pageThumbnails.length; i++) {
        all.add(i);
      }
      setSelectedPages(all);
    }
  }, [selectedPages.size, pageThumbnails.length]);

  // 9.0 Cooperative Debounced Commits & Non-Blocking Flush
  const isCommittingReorderRef = useRef<boolean>(false);

  const flushPendingRotations = useCallback(async () => {
    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }
    const currentUri = activePdfUriRef.current;
    if (!currentUri || isCommittingRotationRef.current) return;
    const toCommit = { ...pendingRotationsRef.current };
    const filteredCommit: Record<number, number> = {};
    for (const [k, v] of Object.entries(toCommit)) {
      if (v % 360 !== 0) {
        filteredCommit[parseInt(k, 10)] = v % 360;
      }
    }
    if (Object.keys(filteredCommit).length === 0) {
      setIsCommitting(false);
      setCommitStatusMessage('');
      return;
    }

    for (const k of Object.keys(filteredCommit)) {
      delete pendingRotationsRef.current[parseInt(k, 10)];
    }

    isCommittingRotationRef.current = true;
    try {
      await rotatePagesInPdf(currentUri, filteredCommit, activeFileNameRef.current);
      // In-place commit successful without UI stutter or focus disruption
    } catch (err: any) {
      console.warn('[pageOrganizer] Background PDF rotation commit failed:', err);
    } finally {
      isCommittingRotationRef.current = false;
      // If user tapped more while commit was running, trigger the next pass
      if (Object.values(pendingRotationsRef.current).some(v => v % 360 !== 0)) {
        if (schedulePdfRotationCommitRef.current) {
          schedulePdfRotationCommitRef.current({});
        }
      }
    }
  }, []);

  const schedulePdfRotationCommit = useCallback((deltas: Record<number, number>) => {
    if (!activePdfUriRef.current) return;

    for (const [idxStr, deg] of Object.entries(deltas)) {
      const idx = parseInt(idxStr, 10);
      pendingRotationsRef.current[idx] = ((pendingRotationsRef.current[idx] || 0) + deg) % 360;
    }

    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current);
    }

    // Cooperative background commit: wait 1200ms for user to finish rotations
    rotationTimerRef.current = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        flushPendingRotations();
      });
    }, 1200);
  }, [flushPendingRotations]);
  schedulePdfRotationCommitRef.current = schedulePdfRotationCommit;

  const handleRotateSelected = useCallback((degrees: number = 90) => {
    if (!activePdfUriRef.current) return;
    if (selectedPages.size === 0) {
      showAlert('No Pages Selected', 'Please select the pages you want to rotate.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'refresh', iconColor: COLORS.accent });
      return;
    }

    Haptics.selection();
    const targetIndices = Array.from(selectedPages);
    const rotationsDelta: Record<number, number> = {};
    for (const idx of targetIndices) {
      rotationsDelta[idx] = degrees;
    }

    // 1. Instantly update visual GPU rotation angles in 0ms
    setPageRotations(prev => {
      const next = { ...prev };
      for (const idx of targetIndices) {
        next[idx] = ((next[idx] || 0) + degrees) % 360;
      }
      return next;
    });

    // 2. Queue non-blocking PDF rotation commit in background
    schedulePdfRotationCommit(rotationsDelta);
  }, [selectedPages, COLORS.accent, schedulePdfRotationCommit]);

  const flushPendingReorder = useCallback(async () => {
    if (pendingReorderTimerRef.current) {
      clearTimeout(pendingReorderTimerRef.current);
      pendingReorderTimerRef.current = null;
    }
    const currentUri = activePdfUriRef.current;
    if (!currentUri || !reorderOrderRef.current || isCommittingReorderRef.current) return;
    const orderToCommit = [...reorderOrderRef.current];
    reorderOrderRef.current = null;

    const isIdentity = orderToCommit.every((origIdx, curIdx) => origIdx === curIdx);
    if (isIdentity) return;

    isCommittingReorderRef.current = true;
    setIsCommitting(true);
    setCommitStatusMessage('Saving page order...');
    await new Promise(r => setTimeout(r, 40));

    try {
      await reorderPagesInPdf(currentUri, orderToCommit, activeFileNameRef.current);
    } catch (err: any) {
      console.warn('[pageOrganizer] Reorder commit error:', err);
    } finally {
      isCommittingReorderRef.current = false;
      setIsCommitting(false);
      setCommitStatusMessage('');
    }
  }, []);

  const schedulePdfReorder = useCallback((fromIndex: number, toIndex: number, totalCount: number) => {
    if (!reorderOrderRef.current) {
      reorderOrderRef.current = Array.from({ length: totalCount }, (_, i) => i);
    }
    const order = reorderOrderRef.current;
    const moved = order.splice(fromIndex, 1)[0];
    order.splice(toIndex, 0, moved);

    if (pendingReorderTimerRef.current) {
      clearTimeout(pendingReorderTimerRef.current);
    }
    pendingReorderTimerRef.current = setTimeout(() => {
      flushPendingReorder();
    }, 800);
  }, [flushPendingReorder]);

  const flushAllPendingOperations = useCallback(async () => {
    await flushPendingRotations();
    await flushPendingReorder();
    while (isCommittingRotationRef.current || isCommittingReorderRef.current) {
      await new Promise(r => setTimeout(r, 40));
    }
  }, [flushPendingRotations, flushPendingReorder]);

  // 9.1 Extract
  const handleExtract = async () => {
    if (!activePdfUri) return;
    if (selectedPages.size === 0) {
      showAlert('No Pages Selected', 'Please select at least one page to extract.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'copy-outline', iconColor: COLORS.accent });
      return;
    }

    await flushAllPendingOperations();

    try {
      setIsLoading(true);
      setStatusMessage('Extracting pages...');
      const sorted = Array.from(selectedPages).sort((a, b) => a - b);
      const baseName = activeFileName.replace(/\.pdf$/i, '');
      const isAll = sorted.length === pageThumbnails.length;
      const outName = isAll
        ? `${baseName}_export.pdf`
        : sorted.length > 3
          ? `${baseName}_p${sorted[0] + 1}-${sorted[sorted.length - 1] + 1}.pdf`
          : `${baseName}_p${sorted.map(p => p + 1).join('-')}.pdf`;

      const result = await extractPages(activePdfUri, sorted, outName);
      setIsLoading(false);
      showAlert(
        'Pages Extracted!',
        `Successfully extracted ${sorted.length} pages into:\n${result.name}`,
        [
          {
            text: 'OK',
            style: 'default',
            onPress: hideAlert,
          },
          {
            text: 'View in Documents',
            style: 'cancel',
            onPress: () => {
              hideAlert();
              router.replace(`/documents?openDocUri=${encodeURIComponent(result.uri)}&t=${Date.now()}`);
            },
          },
        ],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
      recordOrganizedDoc().then(prompt => {
        if (prompt) {
          setTimeout(() => setShowReviewModal(true), 1200);
        }
      }).catch(() => {});
    } catch (err: any) {
      setIsLoading(false);
      showAlert('Extract Failed', err.message || 'Error extracting pages.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    }
  };

  // 9.2 Split
  const handleOpenSplit = () => {
    if (pageThumbnails.length <= 1) {
      showAlert('Cannot Split', 'A document must have at least 2 pages to be split.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'cut-outline', iconColor: COLORS.accent });
      return;
    }
    const defaultSplit = selectedPages.size > 0 ? Array.from(selectedPages)[0] + 1 : Math.ceil(pageThumbnails.length / 2);
    setSplitPointInput(defaultSplit.toString());
    setShowSplitModal(true);
  };

  const handleConfirmSplit = async () => {
    if (!activePdfUri) return;
    const splitIndex = parseInt(splitPointInput, 10);
    if (isNaN(splitIndex) || splitIndex < 1 || splitIndex >= pageThumbnails.length) {
      showAlert('Invalid Page Number', `Please enter a page number between 1 and ${pageThumbnails.length - 1}.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
      return;
    }

    setShowSplitModal(false);
    await flushAllPendingOperations();

    try {
      setIsLoading(true);
      setStatusMessage('Splitting PDF document...');
      const baseName = activeFileName.replace(/\.pdf$/i, '');
      const results = await splitPdf(activePdfUri, [splitIndex], baseName);
      setIsLoading(false);
      showAlert(
        'PDF Split Successfully!',
        `Created 2 documents:\n1. ${results[0].name}\n2. ${results[1].name}`,
        [
          {
            text: 'Stay in Organizer',
            style: 'default',
            onPress: hideAlert,
          },
          {
            text: 'Go to Documents',
            style: 'cancel',
            onPress: () => {
              hideAlert();
              router.replace(`/documents?openDocUri=${encodeURIComponent(results[0].uri)}&t=${Date.now()}`);
            },
          },
        ],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    } catch (err: any) {
      setIsLoading(false);
      showAlert('Split Failed', err.message || 'Error splitting PDF document.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    }
  };

  // 9.3.2 Google Docs Scanner: Scan & Add / Replace / Insert Pages — 0ms Instant Optimistic Updates
  const appendScannedPages = async (pageUris: string[]) => {
    if (!activePdfUri || pageUris.length === 0) return;
    await flushAllPendingOperations();

    // 1. Instant 0ms optimistic grid update (zero waiting!)
    setPageThumbnails(prev => [...prev, ...pageUris]);
    setSelectedPages(new Set());

    // 2. Non-blocking background PDF generation & merge
    setIsCommitting(true);
    setCommitStatusMessage('Adding scanned pages...');
    await new Promise(r => setTimeout(r, 40));

    try {
      const tempPdfName = `temp_scan_${Date.now()}.pdf`;
      const tempPdf = await buildPdfFromImages(pageUris, undefined, tempPdfName);
      if (!tempPdf || !tempPdf.pdfUri) throw new Error('Failed to generate PDF from scan');

      const baseName = activeFileName.replace(/\.pdf$/i, '');
      const outName = `${baseName}.pdf`;
      const merged = await mergePdfs([activePdfUri, tempPdf.pdfUri], outName);
      lastLoadedKeyRef.current = `${merged.uri}_${Date.now()}`;
      setActivePdfUri(merged.uri);
      setActiveFileName(merged.name);
      await updateDocumentPageCount(merged.uri, pageThumbnails.length + pageUris.length);
      showAlert('Pages Added', `Successfully added ${pageUris.length} page(s) to this document.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    } catch (err: any) {
      console.warn('[page-organizer] appendScannedPages error:', err);
      showAlert('Error', err?.message || 'Failed to add pages', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    } finally {
      setIsCommitting(false);
      setCommitStatusMessage('');
    }
  };

  const insertScannedPages = async (pageUris: string[], atIndex: number) => {
    if (!activePdfUri || pageUris.length === 0) return;
    await flushAllPendingOperations();

    // 1. Instant 0ms optimistic grid update
    setPageThumbnails(prev => {
      const next = [...prev];
      next.splice(atIndex, 0, ...pageUris);
      return next;
    });
    setSelectedPages(new Set());

    // 2. Non-blocking background PDF generation & insertion
    setIsCommitting(true);
    setCommitStatusMessage('Inserting scanned pages...');
    await new Promise(r => setTimeout(r, 40));

    try {
      const tempPdfName = `temp_scan_${Date.now()}.pdf`;
      const tempPdf = await buildPdfFromImages(pageUris, undefined, tempPdfName);
      if (!tempPdf || !tempPdf.pdfUri) throw new Error('Failed to generate PDF from scan');

      const baseName = activeFileName.replace(/\.pdf$/i, '');
      const outName = `${baseName}.pdf`;
      const res = await insertPagesIntoPdf(activePdfUri, tempPdf.pdfUri, atIndex, outName);
      lastLoadedKeyRef.current = `${res.uri}_${Date.now()}`;
      setActivePdfUri(res.uri);
      setActiveFileName(res.name);
      await updateDocumentPageCount(res.uri, pageThumbnails.length + pageUris.length);
      showAlert('Pages Inserted', `Successfully inserted ${pageUris.length} page(s) after page ${atIndex}.`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    } catch (err: any) {
      console.warn('[page-organizer] insertScannedPages error:', err);
      showAlert('Error', err?.message || 'Failed to insert pages', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    } finally {
      setIsCommitting(false);
      setCommitStatusMessage('');
    }
  };

  const handleScanWithGoogleScanner = async () => {
    if (!activePdfUri) return;
    try {
      const scanResult = await launchGoogleDocScanner();
      if (!scanResult || scanResult.canceled || !scanResult.success || !scanResult.pages || scanResult.pages.length === 0) {
        return;
      }

      // Contextual Insertion: When exactly 1 page is selected, give 3 fluid options
      if (selectedPages.size === 1) {
        const targetIdx = Array.from(selectedPages)[0];
        showAlert(
          'Insert Scanned Pages',
          `Choose where to place ${scanResult.pages.length} scanned page(s):`,
          [
            {
              text: `Replace Page ${targetIdx + 1}`,
              style: 'default',
              onPress: async () => {
                hideAlert();
                await flushAllPendingOperations();

                const newScanUri = scanResult.pages[0];
                // 1. Instant 0ms optimistic thumbnail update (zero waiting!)
                setPageThumbnails(prev => {
                  const next = [...prev];
                  next[targetIdx] = newScanUri;
                  return next;
                });
                setPageRotations(prev => {
                  const next = { ...prev };
                  delete next[targetIdx];
                  return next;
                });
                setSelectedPages(new Set());

                // 2. Non-blocking background commit with subtle indicator
                setIsCommitting(true);
                setCommitStatusMessage('Replacing page with scan...');
                await new Promise(r => setTimeout(r, 40));

                try {
                  const specs: PageCommitSpec[] = [{
                    pageIndex: targetIdx,
                    imageUri: newScanUri,
                    deltaRotation: 0,
                  }];
                  const res = await commitPagesBatchToPdf(activePdfUri, specs, activeFileName);
                  lastLoadedKeyRef.current = `${res.uri}_${Date.now()}`;
                  setActivePdfUri(res.uri);
                  invalidatePdfRenderCache(activePdfUri);
                  invalidatePdfRenderCache(res.uri);
                  showAlert('Page Replaced', 'Page successfully updated with high-resolution camera scan.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
                } catch (e: any) {
                  showAlert('Error', e.message || 'Failed to replace page', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
                } finally {
                  setIsCommitting(false);
                  setCommitStatusMessage('');
                }
              },
            },
            {
              text: `Insert After Page ${targetIdx + 1}`,
              style: 'default',
              onPress: async () => {
                hideAlert();
                await insertScannedPages(scanResult.pages, targetIdx + 1);
              },
            },
            {
              text: 'Append to End',
              style: 'default',
              onPress: async () => {
                hideAlert();
                await appendScannedPages(scanResult.pages);
              },
            },
            { text: 'Cancel', style: 'cancel', onPress: hideAlert }
          ],
          { icon: 'document-text', iconColor: COLORS.accent }
        );
        return;
      }

      await appendScannedPages(scanResult.pages);
    } catch (err: any) {
      console.warn('[page-organizer] Camera Scanner error:', err);
      showAlert('Scanner Error', err?.message || 'Failed to open Camera Scanner', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }
  };

  // 9.4 Delete Selected — 0ms Instant Optimistic Removal with Non-blocking Commit
  const handleDeleteSelected = () => {
    if (!activePdfUri) return;
    if (selectedPages.size === 0) {
      showAlert('No Pages Selected', 'Please select the pages you want to delete.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'trash-outline', iconColor: COLORS.accent });
      return;
    }

    if (selectedPages.size >= pageThumbnails.length) {
      showAlert('Cannot Delete All', 'A document must contain at least 1 page. Delete the entire file from the documents list if no longer needed.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.accent });
      return;
    }

    showAlert(
      'Delete Selected Pages',
      `Are you sure you want to permanently remove ${selectedPages.size} page(s) from this document?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          text: 'Delete Pages',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            await flushAllPendingOperations();
            try {
              const sorted = Array.from(selectedPages);
              const toDeleteSet = new Set(selectedPages);

              // 1. Instantly update UI thumbnails in 0ms (pages vanish immediately with native fluidity)
              const nextThumbnails = pageThumbnails.filter((_, idx) => !toDeleteSet.has(idx));
              setPageThumbnails(nextThumbnails);
              setSelectedPages(new Set());
              setPageRotations(prev => {
                const nextRot: Record<number, number> = {};
                let targetIdx = 0;
                for (let oldIdx = 0; oldIdx < pageThumbnails.length; oldIdx++) {
                  if (!toDeleteSet.has(oldIdx)) {
                    if (prev[oldIdx]) {
                      nextRot[targetIdx] = prev[oldIdx];
                    }
                    targetIdx++;
                  }
                }
                return nextRot;
              });

              // 2. Non-blocking background PDF page removal via pdf-lib
              setIsCommitting(true);
              setCommitStatusMessage('Deleting selected page(s)...');
              await new Promise(r => setTimeout(r, 40));

              const oldUri = activePdfUri;
              const res = await deletePagesFromPdf(oldUri, sorted, activeFileName);
              lastLoadedKeyRef.current = `${res.uri}_${Date.now()}`;
              setActivePdfUri(res.uri);
              await updateDocumentPageCount(res.uri, nextThumbnails.length);
              if (oldUri !== res.uri) {
                await updateDocumentPageCount(oldUri, nextThumbnails.length);
              }
            } catch (err: any) {
              showAlert('Delete Failed', err.message || 'Error deleting pages.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
            } finally {
              setIsCommitting(false);
              setCommitStatusMessage('');
            }
          },
        },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  // 9.5 Rename Document
  const handleConfirmRename = async () => {
    if (!renameInput.trim() || !activePdfUri) return;
    try {
      const cleanName = await renameDocument(activePdfUri, renameInput.trim());
      setActiveFileName(cleanName);
      setShowRenameModal(false);
    } catch (err: any) {
      showAlert('Rename Error', err?.message || 'Failed to rename document.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    }
  };

  // 9.5 Merge
  const handleMergeOtherPdf = async () => {
    if (!activePdfUri) return;
    try {
      const picker = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (picker.canceled || !picker.assets || picker.assets.length === 0) return;

      await flushAllPendingOperations();
      setIsLoading(true);
      setStatusMessage('Merging PDF documents...');
      const otherUri = picker.assets[0].uri;
      const baseName = activeFileName.replace(/\.pdf$/i, '');
      const outName = `${baseName}_merged_${Date.now()}.pdf`;

      const result = await mergePdfs([activePdfUri, otherUri], outName);
      setActivePdfUri(result.uri);
      setActiveFileName(result.name);
      await loadThumbnails(result.uri);
      showAlert(
        'Merge Complete',
        `Successfully merged into "${result.name}".`,
        [
          {
            text: 'OK',
            style: 'default',
            onPress: hideAlert,
          },
        ],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    } catch (err: any) {
      setIsLoading(false);
      showAlert('Merge Failed', err.message || 'Error merging documents.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    }
  };

  // 9.6 Page Reordering (Move Left / Move Right & Drag and Drop) — 0ms Instant UI with Debounced Atomic Commit
  const handleMovePage = (fromIndex: number, toIndex: number) => {
    if (!activePdfUri) return;
    if (toIndex < 0 || toIndex >= pageThumbnails.length || fromIndex === toIndex) return;

    try {
      // 1. Instant 0ms optimistic visual reordering
      const newThumbs = [...pageThumbnails];
      const movedItem = newThumbs.splice(fromIndex, 1)[0];
      newThumbs.splice(toIndex, 0, movedItem);
      setPageThumbnails(newThumbs);
      setSelectedPages(new Set([toIndex]));
      setPageRotations(prev => {
        const arr = pageThumbnails.map((_, i) => prev[i] || 0);
        const movedDeg = arr.splice(fromIndex, 1)[0];
        arr.splice(toIndex, 0, movedDeg);
        const nextRot: Record<number, number> = {};
        arr.forEach((deg, i) => {
          if (deg) nextRot[i] = deg;
        });
        return nextRot;
      });

      // Update pending rotations indices if any were queued
      const curPending = { ...pendingRotationsRef.current };
      if (Object.keys(curPending).length > 0) {
        const arr = pageThumbnails.map((_, i) => curPending[i] || 0);
        const movedDeg = arr.splice(fromIndex, 1)[0];
        arr.splice(toIndex, 0, movedDeg);
        const nextPending: Record<number, number> = {};
        arr.forEach((deg, i) => {
          if (deg) nextPending[i] = deg;
        });
        pendingRotationsRef.current = nextPending;
      }

      // 2. Schedule debounced atomic PDF reorder (800ms idle, zero UI blocking)
      schedulePdfReorder(fromIndex, toIndex, pageThumbnails.length);
    } catch (err: any) {
      console.warn('[pageOrganizer] Reorder failed:', err);
    }
  };

  // 9.7 Load all app documents for Copy/Move or Merge
  const loadAppDocs = async () => {
    try {
      const dbDocs = await getAllPdfDocuments();
      const scansDir = `${FileSystem.documentDirectory}scans/`;
      const dirInfo = await FileSystem.getInfoAsync(scansDir);
      let localScanItems: any[] = [];

      if (dirInfo.exists) {
        try {
          const files = await FileSystem.readDirectoryAsync(scansDir);
          for (const f of files) {
            if (f.toLowerCase().startsWith('temp_')) {
              FileSystem.deleteAsync(`${scansDir}${f}`, { idempotent: true }).catch(() => {});
              continue;
            }
            if (f.toLowerCase().endsWith('.pdf')) {
              const fullUri = `${scansDir}${f}`;
              const existsInDb = dbDocs.some(d => d.uri === fullUri);
              if (!existsInDb) {
                const fInfo = await FileSystem.getInfoAsync(fullUri);
                localScanItems.push({
                  id: Date.now() + Math.floor(Math.random() * 1000),
                  uri: fullUri,
                  name: f,
                  size: fInfo.exists ? (fInfo as any).size || 0 : 0,
                  modified: new Date().toISOString(),
                  isScanned: true,
                });
              }
            }
          }
        } catch (_) {}
      }

      const combined = [...localScanItems, ...dbDocs].filter(d => d.uri !== activePdfUri);
      setAllAppDocs(combined);
    } catch (e) {
      console.warn('[pageOrganizer] loadAppDocs error:', e);
    }
  };

  // 9.8 Copy / Move Pages
  const handleOpenCopyMove = async () => {
    if (selectedPages.size === 0) {
      showAlert('No Pages Selected', 'Please select at least one page to copy or move.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'layers-outline', iconColor: COLORS.accent });
      return;
    }
    await loadAppDocs();
    setAppDocPickerPurpose('copymove');
    setAppDocSearch('');
    setShowAppDocPickerModal(true);
  };

  const handleSelectDocForCopyMove = (targetDoc: any) => {
    setShowAppDocPickerModal(false);
    const count = selectedPages.size;
    showAlert(
      `Copy or Move ${count} Page(s)?`,
      `Target: "${targetDoc.name}"\n\nChoose whether to copy the page(s) (leaving original intact) or move them (removing from this PDF).`,
      [
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          text: `Copy ${count} Page(s)`,
          style: 'default',
          onPress: async () => {
            hideAlert();
            executeCopyOrMove(targetDoc, false);
          },
        },
        {
          text: `Move ${count} Page(s)`,
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            executeCopyOrMove(targetDoc, true);
          },
        },
      ],
      { icon: 'copy-outline', iconColor: COLORS.accent }
    );
  };

  const executeCopyOrMove = async (targetDoc: any, isMove: boolean) => {
    if (!activePdfUri) return;
    await flushAllPendingOperations();
    try {
      setIsLoading(true);
      setStatusMessage(isMove ? 'Moving pages...' : 'Copying pages...');
      const sorted = Array.from(selectedPages).sort((a, b) => a - b);
      const res = await copyOrMovePagesToPdf(activePdfUri, targetDoc.uri, sorted, isMove);
      if (isMove && res.sourceResult) {
        setActivePdfUri(res.sourceResult.uri);
        setActiveFileName(res.sourceResult.name);
        await loadThumbnails(res.sourceResult.uri);
      } else {
        setSelectedPages(new Set());
      }
      showAlert(
        isMove ? 'Pages Moved!' : 'Pages Copied!',
        `Successfully ${isMove ? 'moved' : 'copied'} ${sorted.length} page(s) into "${targetDoc.name}".`,
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    } catch (err: any) {
      showAlert('Operation Failed', err?.message || 'Failed to copy or move pages.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsLoading(false);
    }
  };

  // 9.9 Merge Options
  const handleOpenMergeMenu = () => {
    setShowMergeChoiceModal(true);
  };

  const handleMergeFromAppDocs = async (filterType: 'scanned' | 'system') => {
    setShowMergeChoiceModal(false);
    await loadAppDocs();
    setAppDocTab(filterType);
    setAppDocPickerPurpose('merge');
    setAppDocSearch('');
    setShowAppDocPickerModal(true);
  };

  const handleSelectDocForMerge = async (doc: any) => {
    setShowAppDocPickerModal(false);
    if (!activePdfUri) return;
    await flushAllPendingOperations();
    try {
      setIsLoading(true);
      setStatusMessage(`Merging with "${doc.name}"...`);
      const baseName = activeFileName.replace(/\.pdf$/i, '');
      const outName = `${baseName}_merged_${Date.now()}.pdf`;
      const res = await mergePdfs([activePdfUri, doc.uri], outName);
      setActivePdfUri(res.uri);
      setActiveFileName(res.name);
      await loadThumbnails(res.uri);
      showAlert('Merged Successfully', `Combined with "${doc.name}" into "${res.name}".`, [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    } catch (err: any) {
      showAlert('Merge Failed', err?.message || 'Failed to merge documents.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate back safely to PDF Edit page
  const handleGoBack = useCallback(async (pageIdx: number = 0) => {
    setIsCommitting(true);
    setCommitStatusMessage('Saving changes before closing...');
    await flushAllPendingOperations();
    setIsCommitting(false);
    setCommitStatusMessage('');

    const targetUri = activePdfUri;
    if (targetUri) {
      invalidatePdfRenderCache(targetUri);
      router.replace({
        pathname: '/documents',
        params: {
          openDocUri: encodeURIComponent(targetUri),
          pageIndex: String(pageIdx),
          t: String(Date.now()),
        },
      } as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/documents');
    }
  }, [activePdfUri, flushAllPendingOperations, router]);

  const onOpenEditorCard = useCallback((idx: number) => {
    if (draggingIndex === null) {
      handleGoBack(idx);
    }
  }, [draggingIndex, handleGoBack]);

  const onToggleSelectCard = useCallback((idx: number) => {
    if (draggingIndex === null) togglePageSelect(idx);
  }, [draggingIndex]);

  const onLongPressCard = useCallback((idx: number, e: any) => {
    Haptics.medium();
    const touch = e.nativeEvent;
    setDraggingIndex(idx);
    setDragOverIndex(idx);
    setDragPos({ x: touch.pageX, y: touch.pageY });
  }, []);

  const onMovePageCard = useCallback((from: number, to: number) => {
    handleMovePage(from, to);
  }, [handleMovePage]);

  // ---------------- Render Empty State if no PDF selected ----------------
  if (!activePdfUri) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]}>
        <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <TouchableOpacity onPress={() => handleGoBack(0)} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            <Text style={[styles.headerBackLabel, { color: COLORS.text }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerCenterTitle, { color: COLORS.text }]}>PDF Workbench</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: COLORS.surface2 }]}>
            <Ionicons name="layers-outline" size={54} color={COLORS.accent} />
          </View>
          <Text style={[styles.emptyHeaderTitle, { color: COLORS.text }]}>Select a PDF to Organize</Text>
          <Text style={[styles.emptyHeaderDesc, { color: COLORS.muted }]}>
            Choose a PDF document to split, extract pages, rotate, reorder, or merge.
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity
              style={[styles.primaryEmptyBtn, { backgroundColor: COLORS.accent }]}
              onPress={handlePickDocument}
            >
              <Ionicons name="folder-open" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.primaryEmptyBtnText}>Select PDF from Storage</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryEmptyBtn, { backgroundColor: COLORS.surface2 }]}
              onPress={() => router.push(`/doc-scanner?t=${Date.now()}&initialMode=batch`)}
            >
              <Ionicons name="camera" size={18} color={COLORS.text} style={{ marginRight: 6 }} />
              <Text style={[styles.secondaryEmptyBtnText, { color: COLORS.text }]}>Scan New</Text>
            </TouchableOpacity>
          </View>

          {/* Recent PDFs list */}
          {recentDocs.length > 0 && (
            <View style={{ width: '100%', marginTop: 36 }}>
              <Text style={[styles.recentSectionTitle, { color: COLORS.muted }]}>RECENT DOCUMENTS</Text>
              <View style={[styles.recentListWrap, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                {recentDocs.map((doc, idx) => (
                  <TouchableOpacity
                    key={`${doc.id}_${idx}`}
                    style={[styles.recentRow, idx > 0 && { borderTopWidth: 1, borderTopColor: COLORS.border + '60' }]}
                    onPress={() => {
                      setActivePdfUri(doc.uri);
                      setActiveFileName(doc.name);
                    }}
                  >
                    <Ionicons name="document-text" size={24} color={COLORS.accent} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recentRowTitle, { color: COLORS.text }]} numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <Text style={[styles.recentRowSubtitle, { color: COLORS.muted }]}>
                        {formatSize(doc.size)} • {formatDate(doc.modified)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
        <ThemedAlertModal {...alertConfig} onClose={hideAlert} />
      </SafeAreaView>
    );
  }

  // ---------------- Render Multi-Page Grid ----------------
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]}>
      {/* Top Header (Matching Image 4: Select All, X Selected, Close) */}
      <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
        <TouchableOpacity onPress={handleSelectAll} style={styles.headerBtn} accessibilityLabel="Select All">
          <Ionicons
            name={selectedPages.size === pageThumbnails.length && pageThumbnails.length > 0 ? 'checkbox' : 'checkbox-outline'}
            size={22}
            color={COLORS.accent}
          />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>
            {selectedPages.size > 0 ? `${selectedPages.size} Selected` : activeFileName}
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: isCommitting ? COLORS.accent : COLORS.muted }]}
            numberOfLines={1}
          >
            {isCommitting
              ? commitStatusMessage || 'Saving changes...'
              : `${pageThumbnails.length} ${pageThumbnails.length === 1 ? 'Page' : 'Pages'}`}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={handleScanWithGoogleScanner}
            style={[styles.headerBtn, { backgroundColor: '#3B82F618', borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            accessibilityLabel="Scan with Camera"
          >
            <Ionicons name="camera" size={17} color="#3B82F6" />
            <Text style={{ color: '#3B82F6', fontWeight: '700', fontSize: 13 }}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleGoBack(0)} style={styles.headerBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Page Thumbnails Grid with Hand Drag-and-Drop */}
      {isLoading && pageThumbnails.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.loadingText, { color: COLORS.text }]}>{statusMessage}</Text>
        </View>
      ) : pageThumbnails.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.muted} />
          <Text style={[styles.loadingText, { color: COLORS.text, marginTop: 12 }]}>Unable to load page thumbnails</Text>
          <TouchableOpacity
            onPress={() => loadThumbnails(activePdfUri, true)}
            style={{ marginTop: 16, backgroundColor: COLORS.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Reload Pages</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={{ flex: 1 }}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            gridLayoutRef.current = { x, y, width, height };
          }}
        >
          {/* Non-Blocking Floating Pill Feedback */}
          {(isLoading || isCommitting) && (
            <Animated.View
              entering={FadeIn.duration(180)}
              style={[
                styles.floatingStatusPill,
                { backgroundColor: COLORS.surface2, borderColor: COLORS.accent + '55' },
              ]}
              pointerEvents="none"
            >
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.floatingStatusText, { color: COLORS.text }]}>
                {isCommitting
                  ? commitStatusMessage || 'Saving changes...'
                  : statusMessage || 'Saving changes...'}
              </Text>
            </Animated.View>
          )}

          <FlatList
            data={pageThumbnails}
            extraData={[selectedPages, pageRotations, draggingIndex, dragOverIndex]}
            keyExtractor={(_, index) => `page_${index}`}
            numColumns={3}
            scrollEnabled={draggingIndex === null}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            removeClippedSubviews={true}
            getItemLayout={(_, index) => {
              const screenW = gridLayoutRef.current.width || Dimensions.get('window').width;
              const colW = Math.max(80, (screenW - 20) / 3);
              const rowH = colW / 0.72 + 10;
              return {
                length: rowH,
                offset: rowH * Math.floor(index / 3),
                index,
              };
            }}
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item: thumbUri, index }) => (
              <PageOrganizerCard
                thumbUri={thumbUri}
                index={index}
                isSelected={selectedPages.has(index)}
                isDraggingThis={draggingIndex === index}
                isTarget={dragOverIndex === index && draggingIndex !== null && draggingIndex !== index}
                rot={pageRotations[index] || 0}
                totalCount={pageThumbnails.length}
                hasAnySelection={selectedPages.size > 0}
                singleSelected={selectedPages.size === 1}
                onToggleSelect={onToggleSelectCard}
                onOpenEditor={onOpenEditorCard}
                onLongPress={onLongPressCard}
                onMovePage={onMovePageCard}
                COLORS={COLORS}
              />
            )}
          />

          {/* Active Hand Drag & Drop Full-Screen Touch Interceptor */}
          {draggingIndex !== null && (
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents="box-only"
              onTouchMove={(e) => {
                const touch = e.nativeEvent;
                setDragPos({ x: touch.pageX, y: touch.pageY });

                const gl = gridLayoutRef.current;
                const relX = touch.pageX - (gl.x || 0);
                const relY = touch.pageY - (gl.y || 0) + scrollOffsetRef.current;
                const colW = Math.max(80, ((gl.width || Dimensions.get('window').width) - 20) / 3);
                const rowH = colW / 0.72 + 10;

                const col = Math.min(2, Math.max(0, Math.floor((relX - 10) / colW)));
                const row = Math.max(0, Math.floor(relY / rowH));
                const target = Math.min(pageThumbnails.length - 1, Math.max(0, row * 3 + col));
                setDragOverIndex(target);
              }}
              onTouchEnd={() => {
                if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
                  handleMovePage(draggingIndex, dragOverIndex);
                }
                setDraggingIndex(null);
                setDragOverIndex(null);
              }}
              onTouchCancel={() => {
                setDraggingIndex(null);
                setDragOverIndex(null);
              }}
            >
              {/* Floating Card Following User's Hand */}
              <View
                style={[
                  styles.floatingDragCard,
                  {
                    left: dragPos.x - 45,
                    top: dragPos.y - 65,
                    borderColor: COLORS.accent,
                    backgroundColor: COLORS.surface,
                  },
                ]}
              >
                {pageThumbnails[draggingIndex] ? (
                  <Image
                    source={{ uri: pageThumbnails[draggingIndex] }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="document-text" size={32} color={COLORS.accent} />
                )}
                <View style={[styles.pageNumberBadge, { backgroundColor: COLORS.accent }]}>
                  <Text style={[styles.pageNumberText, { color: '#FFFFFF' }]}>{draggingIndex + 1}</Text>
                </View>
                <View style={[styles.draggingHandBadge, { backgroundColor: COLORS.accent }]}>
                  <Ionicons name="hand-right" size={14} color="#FFFFFF" />
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Bottom Action Workbench Toolbar - Spacious Horizontal Tool Dock */}
      <View style={[styles.toolbar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
        {/* Selection Status & Fast Select/Deselect Bar */}
        <View style={styles.selectionStatusBar}>
          <Text style={[styles.selectionStatusText, { color: selectedPages.size > 0 ? COLORS.accent : COLORS.muted }]}>
            {selectedPages.size > 0
              ? `${selectedPages.size} of ${pageThumbnails.length} page${selectedPages.size > 1 ? 's' : ''} selected`
              : `${pageThumbnails.length} pages total • Tap to select`}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (selectedPages.size === pageThumbnails.length && pageThumbnails.length > 0) {
                setSelectedPages(new Set());
              } else {
                setSelectedPages(new Set(Array.from({ length: pageThumbnails.length }, (_, i) => i)));
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.selectAllChip, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
          >
            <Ionicons
              name={selectedPages.size === pageThumbnails.length && pageThumbnails.length > 0 ? 'close-circle-outline' : 'checkmark-circle-outline'}
              size={14}
              color={COLORS.text}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.selectAllChipText, { color: COLORS.text }]}>
              {selectedPages.size === pageThumbnails.length && pageThumbnails.length > 0 ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spacious Horizontal Tool Bar - Never Squeezed, Never Overlapping */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarScrollRow}
        >
          {/* Google Docs Scanner */}
          <NativeScaleButton
            onPress={handleScanWithGoogleScanner}
            style={[styles.toolCard, isBusy && { opacity: 0.4 }]}
            disabled={isBusy}
            hapticType="medium"
          >
            <View style={[styles.toolIconBox, { backgroundColor: '#3B82F622', borderColor: '#3B82F666' }]}>
              <Ionicons name="scan" size={22} color="#3B82F6" />
            </View>
            <Text style={[styles.toolText, { color: '#3B82F6', fontWeight: '700' }]} numberOfLines={1}>
              Google Scan
            </Text>
          </NativeScaleButton>

          {/* Edit Page in Full PDF Editor */}
          <NativeScaleButton
            onPress={() => {
              const targetIdx = selectedPages.size === 1 ? Array.from(selectedPages)[0] : (selectedPages.size > 0 ? Array.from(selectedPages)[0] : 0);
              handleGoBack(targetIdx);
            }}
            style={[styles.toolCard, isBusy && { opacity: 0.4 }]}
            disabled={isBusy}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: '#10B98122', borderColor: '#10B98166' }]}>
              <Ionicons name="create-outline" size={22} color="#10B981" />
            </View>
            <Text style={[styles.toolText, { color: '#10B981', fontWeight: '700' }]} numberOfLines={1}>
              Edit Page
            </Text>
          </NativeScaleButton>

          {/* Rotate 90° — Instantaneous 0ms GPU accumulation */}
          <NativeScaleButton
            onPress={() => handleRotateSelected(90)}
            style={[styles.toolCard, selectedPages.size === 0 && { opacity: 0.4 }]}
            disabled={selectedPages.size === 0}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="arrow-redo-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Rotate 90°</Text>
          </NativeScaleButton>


          {/* Crop & Filter (Interactive 4-Corner Draggable Quad + Presets) */}
          <NativeScaleButton
            onPress={handleOpenCropModal}
            style={[styles.toolCard, (isBusy || selectedPages.size !== 1) && { opacity: 0.4 }]}
            disabled={isBusy || selectedPages.size !== 1}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="crop-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Crop & Filter</Text>
          </NativeScaleButton>

          {/* Delete Pages */}
          <NativeScaleButton
            onPress={handleDeleteSelected}
            style={[styles.toolCard, (isBusy || selectedPages.size === 0) && { opacity: 0.4 }]}
            disabled={isBusy || selectedPages.size === 0}
            hapticType="medium"
          >
            <View style={[styles.toolIconBox, { backgroundColor: '#EF444418', borderColor: '#EF444444' }]}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </View>
            <Text style={[styles.toolText, { color: '#EF4444', fontWeight: '700' }]} numberOfLines={1}>
              {selectedPages.size > 0 ? `Delete (${selectedPages.size})` : 'Delete'}
            </Text>
          </NativeScaleButton>

          {/* Extract */}
          <NativeScaleButton
            onPress={handleExtract}
            style={[styles.toolCard, (isBusy || selectedPages.size === 0) && { opacity: 0.4 }]}
            disabled={isBusy || selectedPages.size === 0}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="copy-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Extract</Text>
          </NativeScaleButton>

          {/* Split */}
          <NativeScaleButton
            onPress={handleOpenSplit}
            style={[styles.toolCard, isBusy && { opacity: 0.4 }]}
            disabled={isBusy}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="cut-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Split</Text>
          </NativeScaleButton>

          {/* Merge */}
          <NativeScaleButton
            onPress={handleOpenMergeMenu}
            style={[styles.toolCard, isBusy && { opacity: 0.4 }]}
            disabled={isBusy}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="git-merge-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Merge</Text>
          </NativeScaleButton>

          {/* Copy / Move to another PDF */}
          <NativeScaleButton
            onPress={handleOpenCopyMove}
            style={[styles.toolCard, (isBusy || selectedPages.size === 0) && { opacity: 0.4 }]}
            disabled={isBusy || selectedPages.size === 0}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="duplicate-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Copy/Move</Text>
          </NativeScaleButton>

          {/* Move Left */}
          <NativeScaleButton
            onPress={() => {
              if (selectedPages.size === 1) {
                const idx = Array.from(selectedPages)[0];
                if (idx > 0) handleMovePage(idx, idx - 1);
              }
            }}
            disabled={isBusy || selectedPages.size !== 1 || Array.from(selectedPages)[0] === 0}
            style={[
              styles.toolCard,
              (isBusy || selectedPages.size !== 1 || Array.from(selectedPages)[0] === 0) && { opacity: 0.35 },
            ]}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="arrow-back-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Move Left</Text>
          </NativeScaleButton>

          {/* Move Right */}
          <NativeScaleButton
            onPress={() => {
              if (selectedPages.size === 1) {
                const idx = Array.from(selectedPages)[0];
                if (idx < pageThumbnails.length - 1) handleMovePage(idx, idx + 1);
              }
            }}
            disabled={isBusy || selectedPages.size !== 1 || Array.from(selectedPages)[0] >= pageThumbnails.length - 1}
            style={[
              styles.toolCard,
              (isBusy || selectedPages.size !== 1 || Array.from(selectedPages)[0] >= pageThumbnails.length - 1) && { opacity: 0.35 },
            ]}
            hapticType="light"
          >
            <View style={[styles.toolIconBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              <Ionicons name="arrow-forward-outline" size={22} color={COLORS.text} />
            </View>
            <Text style={[styles.toolText, { color: COLORS.text }]} numberOfLines={1}>Move Right</Text>
          </NativeScaleButton>
        </ScrollView>
      </View>

      {/* Split Dialog Modal */}
      <Modal visible={showSplitModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View 
            entering={ZoomIn.duration(200)}
            style={[styles.modalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <Text style={[styles.modalTitle, { color: COLORS.text }]}>Split Document</Text>
            <Text style={[styles.modalSubtitle, { color: COLORS.muted }]}>
              Enter the page number to split after (1 to {pageThumbnails.length - 1}):
            </Text>

            <TextInput
              style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface2 }]}
              value={splitPointInput}
              onChangeText={setSplitPointInput}
              keyboardType="number-pad"
              placeholder="e.g. 2"
              placeholderTextColor={COLORS.muted}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.surface2 }]}
                onPress={() => setShowSplitModal(false)}
              >
                <Text style={{ color: COLORS.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.accent }]}
                onPress={handleConfirmSplit}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Split PDF</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>



      {/* Merge Options Modal */}
      <Modal visible={showMergeChoiceModal} transparent animationType="fade" onRequestClose={() => setShowMergeChoiceModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMergeChoiceModal(false)}>
          <Animated.View 
            entering={ZoomIn.duration(200)}
            style={[styles.modalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="git-merge" size={22} color={COLORS.accent} style={{ marginRight: 10 }} />
              <Text style={[styles.modalTitle, { color: COLORS.text, marginBottom: 0 }]}>Merge with PDF</Text>
            </View>

            <TouchableOpacity
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={() => handleMergeFromAppDocs('scanned')}
            >
              <Ionicons name="scan" size={20} color={COLORS.accent} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>From Scanned Documents</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Select a document scanned in this app</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={() => handleMergeFromAppDocs('system')}
            >
              <Ionicons name="folder-open-outline" size={20} color="#38BDF8" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>From System Files</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Select from device indexed files</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={() => {
                setShowMergeChoiceModal(false);
                handleMergeOtherPdf();
              }}
            >
              <Ionicons name="document-attach-outline" size={20} color="#A78BFA" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Browse Device Storage</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Pick any PDF from storage picker</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: COLORS.surface2, marginTop: 16 }]}
              onPress={() => setShowMergeChoiceModal(false)}
            >
              <Text style={{ color: COLORS.danger, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* App Documents Picker Modal */}
      <Modal visible={showAppDocPickerModal} animationType="slide" onRequestClose={() => setShowAppDocPickerModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
            <TouchableOpacity onPress={() => setShowAppDocPickerModal(false)} style={styles.headerBackBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
              <Text style={[styles.headerBackLabel, { color: COLORS.text }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.headerCenterTitle, { color: COLORS.text }]}>
              {appDocPickerPurpose === 'merge' ? 'Merge with Document' : 'Copy / Move to Document'}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          {/* Search Bar */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginBottom: 0 }]}>
              <Ionicons name="search" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, color: COLORS.text, fontSize: 15 }}
                value={appDocSearch}
                onChangeText={setAppDocSearch}
                placeholder="Search documents by name..."
                placeholderTextColor={COLORS.muted}
              />
              {appDocSearch.trim().length > 0 && (
                <TouchableOpacity onPress={() => setAppDocSearch('')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Scanned vs System Segmented Bar */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10, gap: 10 }}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                appDocTab === 'scanned' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
              ]}
              onPress={() => setAppDocTab('scanned')}
            >
              <Text style={[styles.segmentBtnText, { color: COLORS.muted }, appDocTab === 'scanned' && { color: '#FFFFFF', fontWeight: '700' }]}>
                📸 Scanned ({allAppDocs.filter(d => d.isScanned).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                appDocTab === 'system' && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
              ]}
              onPress={() => setAppDocTab('system')}
            >
              <Text style={[styles.segmentBtnText, { color: COLORS.muted }, appDocTab === 'system' && { color: '#FFFFFF', fontWeight: '700' }]}>
                📁 System Files ({allAppDocs.filter(d => !d.isScanned).length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Document List */}
          <FlatList
            data={allAppDocs.filter(d => {
              if (appDocTab === 'scanned' && !d.isScanned) return false;
              if (appDocTab === 'system' && d.isScanned) return false;
              if (appDocSearch.trim()) {
                return d.name.toLowerCase().includes(appDocSearch.trim().toLowerCase());
              }
              return true;
            })}
            keyExtractor={item => `${item.id}_${item.uri}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerDocCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                onPress={() => {
                  if (appDocPickerPurpose === 'merge') {
                    handleSelectDocForMerge(item);
                  } else {
                    handleSelectDocForCopyMove(item);
                  }
                }}
              >
                <View style={[styles.pickerDocIcon, { backgroundColor: item.isScanned ? '#F59E0B20' : '#38BDF820', overflow: 'hidden' }]}>
                  <FileThumbnail
                    uri={item.uri}
                    name={item.name}
                    style={{ width: '100%', height: '100%' }}
                    accentColor={item.isScanned ? '#F59E0B' : '#38BDF8'}
                    placeholderBg="transparent"
                    fallbackIcon={item.isScanned ? 'scan' : 'document-text'}
                    iconSize={22}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 3 }}>
                    {formatDate(item.modified)} • {formatSize(item.size)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="folder-open-outline" size={44} color={COLORS.muted} />
                <Text style={{ color: COLORS.muted, marginTop: 10, fontSize: 14 }}>No documents found in this section</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {showCropModal && cropPageIndex !== null && pageThumbnails[cropPageIndex] && (
        <ScannerCropEditorModal
          visible={true}
          initialAutoCrop={false}
          page={{
            id: `organizer_p_${cropPageIndex}`,
            uri: pageThumbnails[cropPageIndex],
            originalUri: pageThumbnails[cropPageIndex],
            width: 0,
            height: 0,
            rotation: pageRotations[cropPageIndex] || 0,
            filter: 'original',
            ocrStatus: 'done',
          }}
          onSave={async updated => {
            setShowCropModal(false);
            if (!updated.uri || !activePdfUri) return;
            await flushAllPendingOperations();

            const pIdx = cropPageIndex;
            const updatedUri = updated.uri;

            // 1. Instant 0ms optimistic thumbnail update
            setPageThumbnails(prev => {
              const next = [...prev];
              next[pIdx] = updatedUri;
              return next;
            });
            setPageRotations(prev => {
              const next = { ...prev };
              delete next[pIdx];
              return next;
            });
            setSelectedPages(new Set());

            // 2. Non-blocking background commit (no modal spinner!)
            setIsCommitting(true);
            setCommitStatusMessage('Applying filter & saving...');
            await new Promise(r => setTimeout(r, 40));

            try {
              const specs: PageCommitSpec[] = [{
                pageIndex: pIdx,
                imageUri: updatedUri,
                absoluteRotation: updated.rotation || 0,
              }];
              const res = await commitPagesBatchToPdf(activePdfUri, specs, activeFileName);
              lastLoadedKeyRef.current = `${res.uri}_${Date.now()}`;
              setActivePdfUri(res.uri);
              invalidatePdfRenderCache(activePdfUri);
              invalidatePdfRenderCache(res.uri);
              Haptics.success();
            } catch (err: any) {
              console.warn('[page-organizer] Crop save error:', err);
              showAlert('Save Error', err?.message || 'Failed to save cropped page.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
            } finally {
              setIsCommitting(false);
              setCommitStatusMessage('');
            }
          }}
          onDelete={() => {
            setShowCropModal(false);
          }}
          onClose={() => {
            setShowCropModal(false);
          }}
        />
      )}

      <ReviewPromptModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        milestoneTitle="Document Organized!"
        milestoneDescription="You've organized your PDF pages seamlessly with 100% on-device privacy. Would you like to leave a quick rating on Google Play?"
      />

      <ThemedAlertModal {...alertConfig} onClose={hideAlert} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    padding: 6,
  },
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  headerBackLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  headerCenterTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  gridContainer: {
    padding: 10,
    paddingBottom: 24,
    gap: 10,
  },
  pageCard: {
    flex: 1,
    margin: 4,
    aspectRatio: 0.72,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderPageNum: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  roundCheckmarkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pageNumberBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 10,
  },
  pageNumberText: {
    fontSize: 10,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  toolbar: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 8,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  selectionStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  selectionStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectAllChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  selectAllChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  toolbarScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 8,
  },
  toolCard: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  toolIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  toolText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 48,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHeaderDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  primaryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  primaryEmptyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  secondaryEmptyBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  recentSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  recentListWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  recentRowTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  recentRowSubtitle: {
    fontSize: 11,
    marginTop: 3,
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
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  modalInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 18,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardReorderOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  cardReorderBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sheetOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#33333E',
    backgroundColor: '#22222A',
    alignItems: 'center',
  },
  segmentBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  pickerDocCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  pickerDocIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropIndicatorBadge: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 20,
    elevation: 4,
  },
  dropIndicatorText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  floatingDragCard: {
    position: 'absolute',
    width: 90,
    height: 125,
    borderRadius: 10,
    borderWidth: 2,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    overflow: 'hidden',
    zIndex: 9999,
  },
  draggingHandBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingStatusPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  floatingStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
