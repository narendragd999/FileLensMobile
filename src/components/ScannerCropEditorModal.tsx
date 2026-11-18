/**
 * ScannerCropEditorModal.tsx — Perspective & Enhancement Editor for Scanned Pages.
 *
 * Provides:
 *   - 4-corner draggable quad overlay for manual crop correction
 *   - Rotation controls (90° increments)
 *   - Filter mode switcher: Original, Color, Grayscale, B&W, Magic Enhance
 *   - Full-resolution preview
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  PanResponder,
  LayoutChangeEvent,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { cropAndRotateImage, detectDocumentEdges } from 'expo-pdf-to-image';
import { useThemeColors } from '../utils/theme';
import { Haptics } from '../utils/haptics';
import { FilterMode, ScanPage } from '../services/scannerService';

interface ScannerCropEditorModalProps {
  visible: boolean;
  page: ScanPage | null;
  onSave: (updated: Partial<ScanPage>) => void;
  onDelete: () => void;
  onClose: () => void;
  initialAutoCrop?: boolean;
}

const FILTER_PRESETS: Array<{ key: FilterMode; label: string; icon: string }> = [
  { key: 'original', label: 'Original', icon: 'image-outline' },
  { key: 'color', label: 'Color', icon: 'color-palette-outline' },
  { key: 'grayscale', label: 'Grayscale', icon: 'contrast-outline' },
  { key: 'bw', label: 'B & W', icon: 'document-text-outline' },
  { key: 'magic', label: 'Magic', icon: 'sparkles-outline' },
];

export function ScannerCropEditorModal({
  visible,
  page,
  onSave,
  onDelete,
  onClose,
  initialAutoCrop = false,
}: ScannerCropEditorModalProps) {
  const COLORS = useThemeColors();
  const [activeFilter, setActiveFilter] = useState<FilterMode>(page?.filter || 'color');
  const [rotation, setRotation] = useState<number>(page?.rotation || 0);
  const [activeImageUri, setActiveImageUri] = useState<string>(page?.uri || '');

  const webViewRef = useRef<WebView>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [autoCrop, setAutoCrop] = useState<boolean>(initialAutoCrop);
  const [showManualNudge, setShowManualNudge] = useState<boolean>(false);
  const [selectedHandle, setSelectedHandle] = useState<string>('box');
  const [nudgeStep, setNudgeStep] = useState<number>(5);

  const [origImageSize, setOrigImageSize] = useState<{ width: number; height: number }>({
    width: page?.width || 1200,
    height: page?.height || 1600,
  });

  // Container dimensions
  const [containerSize, setContainerSize] = useState({ width: 340, height: 460 });

  // Crop Box { x, y, width, height } in container coordinates
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [activeDragHandle, setActiveDragHandle] = useState<string | null>(null);

  const activeHandleRef = useRef<string | null>(null);
  const initialDragRef = useRef<{ box: typeof cropBox; touchX: number; touchY: number }>({
    box: { x: 0, y: 0, width: 0, height: 0 },
    touchX: 0,
    touchY: 0,
  });

  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;

  const rafIdRef = useRef<number | null>(null);
  const pendingCropBoxRef = useRef<typeof cropBox | null>(null);
  const lastSnappedEdgeRef = useRef<string | null>(null);
  const [loupeState, setLoupeState] = useState<{
    visible: boolean;
    targetX: number;
    targetY: number;
  } | null>(null);
  const pendingLoupeRef = useRef<{ visible: boolean; targetX: number; targetY: number } | null>(null);

  // Calculate displayed image bounds strictly inside the container
  const displayedImageBounds = useMemo(() => {
    const origW = origImageSize.width || page?.width || 1200;
    const origH = origImageSize.height || page?.height || 1600;
    if (origW === 0 || origH === 0 || containerSize.width === 0 || containerSize.height === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const isRotated = rotation === 90 || rotation === 270;
    const imgW = isRotated ? origH : origW;
    const imgH = isRotated ? origW : origH;

    const scale = Math.min(containerSize.width / imgW, containerSize.height / imgH);
    const width = Math.round(imgW * scale);
    const height = Math.round(imgH * scale);
    const x = Math.round((containerSize.width - width) / 2);
    const y = Math.round((containerSize.height - height) / 2);

    return { x, y, width, height };
  }, [origImageSize, page?.width, page?.height, containerSize, rotation]);

  const displayedImageBoundsRef = useRef(displayedImageBounds);
  displayedImageBoundsRef.current = displayedImageBounds;

  // Load image dimensions on mount/change
  useEffect(() => {
    if (visible && page?.uri) {
      setActiveFilter(page.filter || 'color');
      setRotation(page.rotation || 0);
      setIsProcessing(false);
      setShowManualNudge(false);
      setAutoCrop(initialAutoCrop);

      const formatted = page.uri.startsWith('file://') || page.uri.startsWith('content://') || page.uri.startsWith('http')
        ? page.uri
        : `file://${page.uri}`;
      setActiveImageUri(formatted);

      Image.getSize(
        formatted,
        (w, h) => {
          if (w > 0 && h > 0) {
            setOrigImageSize({ width: w, height: h });
          }
        },
        () => {
          // If formatted fails, check page.originalUri
          if (page.originalUri && page.originalUri !== formatted) {
            const origFormatted = page.originalUri.startsWith('file://') || page.originalUri.startsWith('content://') || page.originalUri.startsWith('http')
              ? page.originalUri
              : `file://${page.originalUri}`;
            Image.getSize(
              origFormatted,
              (w, h) => {
                if (w > 0 && h > 0) {
                  setOrigImageSize({ width: w, height: h });
                  setActiveImageUri(origFormatted);
                }
              },
              () => {
                setOrigImageSize({
                  width: page.width || 1200,
                  height: page.height || 1600,
                });
              }
            );
          } else {
            setOrigImageSize({
              width: page.width || 1200,
              height: page.height || 1600,
            });
          }
        }
      );
    }
  }, [visible, page?.uri, page?.originalUri, page?.width, page?.height, page?.filter, page?.rotation]);

  // Set initial cropBox when bounds become available
  useEffect(() => {
    if (displayedImageBounds.width > 0 && displayedImageBounds.height > 0) {
      if (autoCrop) {
        if (page?.cropBounds && page.cropBounds.width > 0.1 && page.cropBounds.height > 0.1) {
          const b = displayedImageBounds;
          setCropBox({
            x: Math.round(b.x + page.cropBounds.x * b.width),
            y: Math.round(b.y + page.cropBounds.y * b.height),
            width: Math.round(page.cropBounds.width * b.width),
            height: Math.round(page.cropBounds.height * b.height),
          });
        } else if (page?.uri) {
          detectDocumentEdges(page.uri).then((detected) => {
            if (detected && detected.width > 0.1 && detected.height > 0.1) {
              const b = displayedImageBounds;
              setCropBox({
                x: Math.round(b.x + detected.x * b.width),
                y: Math.round(b.y + detected.y * b.height),
                width: Math.round(detected.width * b.width),
                height: Math.round(detected.height * b.height),
              });
            } else {
              const marginX = Math.max(1, Math.round(displayedImageBounds.width * 0.02));
              const marginY = Math.max(1, Math.round(displayedImageBounds.height * 0.02));
              setCropBox({
                x: displayedImageBounds.x + marginX,
                y: displayedImageBounds.y + marginY,
                width: displayedImageBounds.width - marginX * 2,
                height: displayedImageBounds.height - marginY * 2,
              });
            }
          }).catch(() => {
            const marginX = Math.max(1, Math.round(displayedImageBounds.width * 0.02));
            const marginY = Math.max(1, Math.round(displayedImageBounds.height * 0.02));
            setCropBox({
              x: displayedImageBounds.x + marginX,
              y: displayedImageBounds.y + marginY,
              width: displayedImageBounds.width - marginX * 2,
              height: displayedImageBounds.height - marginY * 2,
            });
          });
        }
      } else {
        // Full frame
        setCropBox({
          x: displayedImageBounds.x,
          y: displayedImageBounds.y,
          width: displayedImageBounds.width,
          height: displayedImageBounds.height,
        });
      }
    }
  }, [displayedImageBounds, autoCrop, page?.cropBounds, page?.uri]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 50 && height > 50) {
      setContainerSize({ width, height });
    }
  };

  // --- PanResponders for 1:1 Pixel-Accurate Manipulation (Fluid 60FPS RAF-Throttled) ---
  const makeHandlePanResponder = useCallback((handle: 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'box') => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt, gestureState) => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        activeHandleRef.current = handle;
        setActiveDragHandle(handle);
        setSelectedHandle(handle);
        initialDragRef.current = {
          box: { ...cropBoxRef.current },
          touchX: gestureState.x0,
          touchY: gestureState.y0,
        };
      },
      onPanResponderMove: (evt, gestureState) => {
        const bounds = displayedImageBoundsRef.current;
        const initial = initialDragRef.current;
        if (bounds.width === 0 || bounds.height === 0) return;

        const dx = gestureState.dx;
        const dy = gestureState.dy;
        const minSize = 25;

        let nextBox = { ...cropBoxRef.current };

        if (handle === 'box') {
          const newX = Math.max(bounds.x, Math.min(bounds.x + bounds.width - initial.box.width, initial.box.x + dx));
          const newY = Math.max(bounds.y, Math.min(bounds.y + bounds.height - initial.box.height, initial.box.y + dy));
          nextBox = { ...initial.box, x: newX, y: newY };
        } else if (handle === 'top') {
          const newY = Math.max(bounds.y, Math.min(initial.box.y + initial.box.height - minSize, initial.box.y + dy));
          const newH = initial.box.height - (newY - initial.box.y);
          nextBox = { ...initial.box, y: newY, height: newH };
        } else if (handle === 'bottom') {
          const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - initial.box.y, initial.box.height + dy));
          nextBox = { ...initial.box, height: newH };
        } else if (handle === 'left') {
          const newX = Math.max(bounds.x, Math.min(initial.box.x + initial.box.width - minSize, initial.box.x + dx));
          const newW = initial.box.width - (newX - initial.box.x);
          nextBox = { ...initial.box, x: newX, width: newW };
        } else if (handle === 'right') {
          const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - initial.box.x, initial.box.width + dx));
          nextBox = { ...initial.box, width: newW };
        } else if (handle === 'tl') {
          const newX = Math.max(bounds.x, Math.min(initial.box.x + initial.box.width - minSize, initial.box.x + dx));
          const newY = Math.max(bounds.y, Math.min(initial.box.y + initial.box.height - minSize, initial.box.y + dy));
          const newW = initial.box.width - (newX - initial.box.x);
          const newH = initial.box.height - (newY - initial.box.y);
          nextBox = { x: newX, y: newY, width: newW, height: newH };
        } else if (handle === 'tr') {
          const newY = Math.max(bounds.y, Math.min(initial.box.y + initial.box.height - minSize, initial.box.y + dy));
          const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - initial.box.x, initial.box.width + dx));
          const newH = initial.box.height - (newY - initial.box.y);
          nextBox = { x: initial.box.x, y: newY, width: newW, height: newH };
        } else if (handle === 'bl') {
          const newX = Math.max(bounds.x, Math.min(initial.box.x + initial.box.width - minSize, initial.box.x + dx));
          const newW = initial.box.width - (newX - initial.box.x);
          const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - initial.box.y, initial.box.height + dy));
          nextBox = { x: newX, y: initial.box.y, width: initial.box.width - (newX - initial.box.x), height: newH };
        } else if (handle === 'br') {
          const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - initial.box.x, initial.box.width + dx));
          const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - initial.box.y, initial.box.height + dy));
          nextBox = { ...initial.box, width: newW, height: newH };
        }

        // --- Magnetic boundary snap (2.5% boundary margin protection) ---
        const snapX = Math.max(16, bounds.width * 0.025);
        const snapY = Math.max(16, bounds.height * 0.025);
        let snappedEdge: string | null = null;

        if (handle === 'tl' || handle === 'left' || handle === 'bl') {
          if (Math.abs(nextBox.x - bounds.x) < snapX) {
            nextBox.width += (nextBox.x - bounds.x);
            nextBox.x = bounds.x;
            snappedEdge = 'left';
          }
        }
        if (handle === 'tl' || handle === 'top' || handle === 'tr') {
          if (Math.abs(nextBox.y - bounds.y) < snapY) {
            nextBox.height += (nextBox.y - bounds.y);
            nextBox.y = bounds.y;
            snappedEdge = 'top';
          }
        }
        if (handle === 'tr' || handle === 'right' || handle === 'br') {
          const rightEdge = nextBox.x + nextBox.width;
          if (Math.abs(rightEdge - (bounds.x + bounds.width)) < snapX) {
            nextBox.width = (bounds.x + bounds.width) - nextBox.x;
            snappedEdge = 'right';
          }
        }
        if (handle === 'bl' || handle === 'bottom' || handle === 'br') {
          const bottomEdge = nextBox.y + nextBox.height;
          if (Math.abs(bottomEdge - (bounds.y + bounds.height)) < snapY) {
            nextBox.height = (bounds.y + bounds.height) - nextBox.y;
            snappedEdge = 'bottom';
          }
        }

        if (snappedEdge) {
          if (lastSnappedEdgeRef.current !== snappedEdge) {
            lastSnappedEdgeRef.current = snappedEdge;
            Haptics.selection();
          }
        } else {
          lastSnappedEdgeRef.current = null;
        }

        // --- 60 FPS Magnifier Loupe target coordinates ---
        if (handle !== 'box') {
          let tx = nextBox.x;
          let ty = nextBox.y;
          if (handle === 'tr') { tx += nextBox.width; }
          else if (handle === 'bl') { ty += nextBox.height; }
          else if (handle === 'br') { tx += nextBox.width; ty += nextBox.height; }
          else if (handle === 'top') { tx += nextBox.width / 2; }
          else if (handle === 'bottom') { tx += nextBox.width / 2; ty += nextBox.height; }
          else if (handle === 'left') { ty += nextBox.height / 2; }
          else if (handle === 'right') { tx += nextBox.width; ty += nextBox.height / 2; }

          pendingLoupeRef.current = { visible: true, targetX: tx, targetY: ty };
        } else {
          pendingLoupeRef.current = null;
        }

        cropBoxRef.current = nextBox;
        pendingCropBoxRef.current = nextBox;

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            if (pendingCropBoxRef.current) {
              setCropBox(pendingCropBoxRef.current);
            }
            setLoupeState(pendingLoupeRef.current);
          });
        }
      },
      onPanResponderRelease: () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (pendingCropBoxRef.current) {
          setCropBox(pendingCropBoxRef.current);
          pendingCropBoxRef.current = null;
        }
        activeHandleRef.current = null;
        setActiveDragHandle(null);
        pendingLoupeRef.current = null;
        setLoupeState(null);
        lastSnappedEdgeRef.current = null;
      },
      onPanResponderTerminate: () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (pendingCropBoxRef.current) {
          setCropBox(pendingCropBoxRef.current);
          pendingCropBoxRef.current = null;
        }
        activeHandleRef.current = null;
        setActiveDragHandle(null);
        pendingLoupeRef.current = null;
        setLoupeState(null);
        lastSnappedEdgeRef.current = null;
      },
    });
  }, []);

  const responders = useMemo(() => ({
    tl: makeHandlePanResponder('tl'),
    tr: makeHandlePanResponder('tr'),
    bl: makeHandlePanResponder('bl'),
    br: makeHandlePanResponder('br'),
    top: makeHandlePanResponder('top'),
    bottom: makeHandlePanResponder('bottom'),
    left: makeHandlePanResponder('left'),
    right: makeHandlePanResponder('right'),
    box: makeHandlePanResponder('box'),
  }), [makeHandlePanResponder]);

  // Micro-nudge adjustments for sub-millimeter precision
  const handleNudge = (direction: 'up' | 'down' | 'left' | 'right') => {
    const step = nudgeStep;
    const bounds = displayedImageBounds;
    if (bounds.width === 0 || bounds.height === 0) return;

    const minSize = 25;
    let dx = 0;
    let dy = 0;
    if (direction === 'left') dx = -step;
    if (direction === 'right') dx = step;
    if (direction === 'up') dy = -step;
    if (direction === 'down') dy = step;

    setCropBox((prev) => {
      if (selectedHandle === 'box') {
        const newX = Math.max(bounds.x, Math.min(bounds.x + bounds.width - prev.width, prev.x + dx));
        const newY = Math.max(bounds.y, Math.min(bounds.y + bounds.height - prev.height, prev.y + dy));
        return { ...prev, x: newX, y: newY };
      } else if (selectedHandle === 'top') {
        const newY = Math.max(bounds.y, Math.min(prev.y + prev.height - minSize, prev.y + dy));
        const newH = prev.height - (newY - prev.y);
        return { ...prev, y: newY, height: newH };
      } else if (selectedHandle === 'bottom') {
        const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - prev.y, prev.height + dy));
        return { ...prev, height: newH };
      } else if (selectedHandle === 'left') {
        const newX = Math.max(bounds.x, Math.min(prev.x + prev.width - minSize, prev.x + dx));
        const newW = prev.width - (newX - prev.x);
        return { ...prev, x: newX, width: newW };
      } else if (selectedHandle === 'right') {
        const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - prev.x, prev.width + dx));
        return { ...prev, width: newW };
      } else if (selectedHandle === 'tl') {
        const newX = Math.max(bounds.x, Math.min(prev.x + prev.width - minSize, prev.x + dx));
        const newY = Math.max(bounds.y, Math.min(prev.y + prev.height - minSize, prev.y + dy));
        return { x: newX, y: newY, width: prev.width - (newX - prev.x), height: prev.height - (newY - prev.y) };
      } else if (selectedHandle === 'tr') {
        const newY = Math.max(bounds.y, Math.min(prev.y + prev.height - minSize, prev.y + dy));
        const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - prev.x, prev.width + dx));
        return { ...prev, y: newY, width: newW, height: prev.height - (newY - prev.y) };
      } else if (selectedHandle === 'bl') {
        const newX = Math.max(bounds.x, Math.min(prev.x + prev.width - minSize, prev.x + dx));
        const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - prev.y, prev.height + dy));
        return { x: newX, y: prev.y, width: prev.width - (newX - prev.x), height: newH };
      } else if (selectedHandle === 'br') {
        const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - prev.x, prev.width + dx));
        const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - prev.y, prev.height + dy));
        return { ...prev, width: newW, height: newH };
      }
      return prev;
    });
  };

  const runAutoEdgeDetection = async () => {
    if (!page?.uri || displayedImageBounds.width === 0 || displayedImageBounds.height === 0) return;
    try {
      const detected = await detectDocumentEdges(page.uri);
      if (detected && detected.width > 0.1 && detected.height > 0.1) {
        const b = displayedImageBounds;
        setCropBox({
          x: Math.round(b.x + detected.x * b.width),
          y: Math.round(b.y + detected.y * b.height),
          width: Math.round(detected.width * b.width),
          height: Math.round(detected.height * b.height),
        });
        setAutoCrop(true);
      }
    } catch (e) {
      console.warn('[ScannerCrop] Auto edge detection failed:', e);
    }
  };

  const handleRotateLeft = () => {
    setRotation(prev => (prev - 90 + 360) % 360);
  };

  const handleRotateRight = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleResetCrop = () => {
    if (displayedImageBounds.width > 0 && displayedImageBounds.height > 0) {
      setCropBox({
        x: displayedImageBounds.x,
        y: displayedImageBounds.y,
        width: displayedImageBounds.width,
        height: displayedImageBounds.height,
      });
    }
  };

  const handleApply = async () => {
    if (!page?.uri || displayedImageBounds.width === 0 || cropBox.width === 0) {
      onClose();
      return;
    }

    const bounds = displayedImageBounds;
    const relX = Math.max(0, (cropBox.x - bounds.x) / bounds.width);
    const relY = Math.max(0, (cropBox.y - bounds.y) / bounds.height);
    const relW = Math.max(0.01, Math.min(1 - relX, cropBox.width / bounds.width));
    const relH = Math.max(0.01, Math.min(1 - relY, cropBox.height / bounds.height));

    // Snap to 100% full boundary if user hasn't explicitly cropped inward (prevents cutting margin text)
    const isNearFullBoundary = relX <= 0.025 && relY <= 0.025 && relW >= 0.975 && relH >= 0.975;
    const finalRelX = isNearFullBoundary ? 0 : relX;
    const finalRelY = isNearFullBoundary ? 0 : relY;
    const finalRelW = isNearFullBoundary ? 1.0 : relW;
    const finalRelH = isNearFullBoundary ? 1.0 : relH;

    // If full frame, no rotation, and original filter, save directly without re-encoding
    if (isNearFullBoundary && rotation === 0 && activeFilter === 'original') {
      onSave({
        uri: page.uri,
        filter: activeFilter,
        rotation: 0,
      });
      onClose();
      return;
    }

    setIsProcessing(true);

    // Fast native path: executes in ~20ms directly on CPU/GPU without large base64 overhead
    try {
      const nativeOutUri = await cropAndRotateImage(
        page.uri,
        finalRelX,
        finalRelY,
        finalRelW,
        finalRelH,
        rotation,
        activeFilter
      );
      if (nativeOutUri) {
        setIsProcessing(false);
        onSave({
          uri: nativeOutUri,
          width: Math.round(displayedImageBounds.width * finalRelW),
          height: Math.round(displayedImageBounds.height * finalRelH),
          filter: activeFilter,
          rotation: 0,
        });
        onClose();
        return;
      }
    } catch (nativeErr) {
      console.warn('[ScannerCrop] Native crop fast-path failed, falling back to webview:', nativeErr);
    }

    try {
      let readUri = page.uri;
      if (readUri.startsWith('content://') || readUri.startsWith('file:///storage/')) {
        const tempCopy = `${FileSystem.cacheDirectory}crop_in_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: readUri, to: tempCopy });
        readUri = tempCopy;
      }

      const base64Data = await FileSystem.readAsStringAsync(readUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mimeType = readUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      const payload = JSON.stringify({
        dataUri,
        relX,
        relY,
        relW,
        relH,
        rotation,
        filter: activeFilter,
      });

      webViewRef.current?.injectJavaScript(`
        window.processCrop(${payload});
        true;
      `);
    } catch (e: any) {
      console.warn('[ScannerCrop] Crop processing failed:', e);
      setIsProcessing(false);
      onSave({ uri: page.uri, filter: activeFilter, rotation });
      onClose();
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SUCCESS' && msg.base64) {
        const outUri = `${FileSystem.cacheDirectory}scan_cropped_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(outUri, msg.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        setIsProcessing(false);
        onSave({
          uri: outUri,
          width: msg.width || origImageSize.width,
          height: msg.height || origImageSize.height,
          filter: activeFilter,
          rotation: 0, // rotation is baked directly into the cropped image!
        });
        onClose();
      } else {
        console.warn('[ScannerCrop] Canvas error:', msg.error);
        setIsProcessing(false);
        onSave({ uri: page?.uri, filter: activeFilter, rotation });
        onClose();
      }
    } catch (e) {
      console.warn('[ScannerCrop] Message parse error:', e);
      setIsProcessing(false);
      onSave({ uri: page?.uri, filter: activeFilter, rotation });
      onClose();
    }
  };

  const canvasHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <canvas id="cropCanvas" style="display:none;"></canvas>
        <script>
          window.processCrop = function(params) {
            try {
              var img = new Image();
              img.onload = function() {
                var origW = img.naturalWidth || img.width;
                var origH = img.naturalHeight || img.height;

                var isRot = params.rotation === 90 || params.rotation === 270;
                var rotatedW = isRot ? origH : origW;
                var rotatedH = isRot ? origW : origH;

                var rotCanvas = document.createElement('canvas');
                rotCanvas.width = rotatedW;
                rotCanvas.height = rotatedH;
                var rotCtx = rotCanvas.getContext('2d');
                rotCtx.imageSmoothingEnabled = true;
                rotCtx.imageSmoothingQuality = 'high';

                try {
                  if (params.filter === 'grayscale') {
                    rotCtx.filter = 'grayscale(100%)';
                  } else if (params.filter === 'bw') {
                    rotCtx.filter = 'grayscale(100%) contrast(160%)';
                  } else if (params.filter === 'magic') {
                    rotCtx.filter = 'contrast(125%) saturate(120%) brightness(105%)';
                  } else if (params.filter === 'color') {
                    rotCtx.filter = 'contrast(105%) saturate(110%)';
                  } else {
                    rotCtx.filter = 'none';
                  }
                } catch(fErr) {}

                rotCtx.save();
                if (params.rotation === 90) {
                  rotCtx.translate(rotatedW, 0);
                  rotCtx.rotate(Math.PI / 2);
                } else if (params.rotation === 180) {
                  rotCtx.translate(rotatedW, rotatedH);
                  rotCtx.rotate(Math.PI);
                } else if (params.rotation === 270) {
                  rotCtx.translate(0, rotatedH);
                  rotCtx.rotate((3 * Math.PI) / 2);
                }
                rotCtx.drawImage(img, 0, 0);
                rotCtx.restore();

                var clampedRelX = Math.max(0, Math.min(1, params.relX || 0));
                var clampedRelY = Math.max(0, Math.min(1, params.relY || 0));
                var clampedRelW = Math.max(0.01, Math.min(1 - clampedRelX, params.relW || 1));
                var clampedRelH = Math.max(0.01, Math.min(1 - clampedRelY, params.relH || 1));

                if (clampedRelX <= 0.02) clampedRelX = 0;
                if (clampedRelY <= 0.02) clampedRelY = 0;
                if (clampedRelX + clampedRelW >= 0.98) clampedRelW = 1 - clampedRelX;
                if (clampedRelY + clampedRelH >= 0.98) clampedRelH = 1 - clampedRelY;

                var cropPxX = Math.max(0, Math.round(clampedRelX * rotatedW));
                var cropPxY = Math.max(0, Math.round(clampedRelY * rotatedH));
                var cropPxW = Math.max(1, Math.min(rotatedW - cropPxX, Math.round(clampedRelW * rotatedW)));
                var cropPxH = Math.max(1, Math.min(rotatedH - cropPxY, Math.round(clampedRelH * rotatedH)));

                var finalCanvas = document.getElementById('cropCanvas');
                finalCanvas.width = cropPxW;
                finalCanvas.height = cropPxH;
                var finalCtx = finalCanvas.getContext('2d');
                finalCtx.imageSmoothingEnabled = true;
                finalCtx.imageSmoothingQuality = 'high';

                finalCtx.drawImage(
                  rotCanvas,
                  cropPxX, cropPxY, cropPxW, cropPxH,
                  0, 0, cropPxW, cropPxH
                );

                var dataUrl = finalCanvas.toDataURL('image/jpeg', 0.92);
                var rawBase64 = dataUrl.split(',')[1];
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SUCCESS',
                  base64: rawBase64,
                  width: cropPxW,
                  height: cropPxH
                }));
              };
              img.onerror = function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'ERROR',
                  error: 'Image load failed'
                }));
              };
              img.src = params.dataUri;
            } catch(ex) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'ERROR',
                error: ex.message
              }));
            }
          };
        </script>
      </body>
    </html>
  `;

  if (!visible || !page) return null;

  const formattedUri = page.uri.startsWith('file://') || page.uri.startsWith('content://') || page.uri.startsWith('http')
    ? page.uri
    : `file://${page.uri}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: COLORS.border, backgroundColor: COLORS.surface }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} disabled={isProcessing}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Ionicons name="crop" size={18} color={COLORS.accent} style={{ marginRight: 6 }} />
            <Text style={[styles.headerTitle, { color: COLORS.text }]}>Crop & Align</Text>
          </View>
          <TouchableOpacity
            onPress={handleApply}
            style={[styles.doneBtn, { backgroundColor: COLORS.accent }]}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.doneBtnText}>Done</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Page Preview Container with Image & Highlighted Quad Overlay */}
        <View style={styles.previewContainer} onLayout={handleLayout}>
          {/* Main Image strictly framed inside displayedImageBounds */}
          {displayedImageBounds.width > 0 && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: displayedImageBounds.x,
                top: displayedImageBounds.y,
                width: displayedImageBounds.width,
                height: displayedImageBounds.height,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Image
                source={{ uri: activeImageUri || formattedUri }}
                style={{
                  width: (rotation === 90 || rotation === 270) ? displayedImageBounds.height : displayedImageBounds.width,
                  height: (rotation === 90 || rotation === 270) ? displayedImageBounds.width : displayedImageBounds.height,
                  transform: [{ rotate: `${rotation}deg` }],
                }}
                resizeMode="contain"
                onError={() => {
                  console.warn('[ScannerCrop] Image failed to load, falling back to originalUri');
                  if (page.originalUri && page.originalUri !== activeImageUri) {
                    setActiveImageUri(page.originalUri);
                  }
                }}
              />
              {/* Live Filter Overlays */}
              {activeFilter === 'bw' && (
                <View style={[StyleSheet.absoluteFillObject, styles.bwFilterOverlay]} pointerEvents="none" />
              )}
              {activeFilter === 'grayscale' && (
                <View style={[StyleSheet.absoluteFillObject, styles.grayscaleFilterOverlay]} pointerEvents="none" />
              )}
              {activeFilter === 'magic' && (
                <View style={[StyleSheet.absoluteFillObject, styles.magicFilterOverlay]} pointerEvents="none" />
              )}
              {activeFilter === 'color' && (
                <View style={[StyleSheet.absoluteFillObject, styles.colorFilterOverlay]} pointerEvents="none" />
              )}
            </View>
          )}

          {/* Top Control Bar: Active Filter Badge & Auto Crop Suggestion Pill cleanly separated */}
          <View style={styles.topInfoBar} pointerEvents="box-none">
            <View style={styles.activeBadge}>
              <Ionicons
                name={activeFilter === 'bw' ? 'contrast' : activeFilter === 'magic' ? 'sparkles' : activeFilter === 'grayscale' ? 'contrast-outline' : 'color-palette'}
                size={12}
                color="#FFFFFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.activeBadgeText}>{activeFilter.toUpperCase()}</Text>
            </View>

            <View
              pointerEvents="none"
              style={[
                styles.suggestPill,
                {
                  backgroundColor: 'rgba(15, 23, 42, 0.88)',
                  borderColor: activeDragHandle ? COLORS.accent : COLORS.border + '80',
                },
              ]}
            >
              <Ionicons
                name={activeDragHandle ? "hand-right" : "sparkles"}
                size={12}
                color={COLORS.accent}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.suggestPillText} numberOfLines={1}>
                {activeDragHandle
                  ? `${activeDragHandle.toUpperCase()} edge`
                  : 'Drag edges to adjust'}
              </Text>
            </View>
          </View>

          {/* 4 Shaded Dimming Backdrop Masks (Outside Crop Rectangle, inside image bounds) */}
          {displayedImageBounds.width > 0 && cropBox.width > 0 && (
            <>
              {/* Top Mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.dimMask,
                  {
                    left: displayedImageBounds.x,
                    top: displayedImageBounds.y,
                    width: displayedImageBounds.width,
                    height: Math.max(0, cropBox.y - displayedImageBounds.y),
                  },
                ]}
              />
              {/* Bottom Mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.dimMask,
                  {
                    left: displayedImageBounds.x,
                    top: cropBox.y + cropBox.height,
                    width: displayedImageBounds.width,
                    height: Math.max(0, displayedImageBounds.y + displayedImageBounds.height - (cropBox.y + cropBox.height)),
                  },
                ]}
              />
              {/* Left Mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.dimMask,
                  {
                    left: displayedImageBounds.x,
                    top: cropBox.y,
                    width: Math.max(0, cropBox.x - displayedImageBounds.x),
                    height: cropBox.height,
                  },
                ]}
              />
              {/* Right Mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.dimMask,
                  {
                    left: cropBox.x + cropBox.width,
                    top: cropBox.y,
                    width: Math.max(0, displayedImageBounds.x + displayedImageBounds.width - (cropBox.x + cropBox.width)),
                    height: cropBox.height,
                  },
                ]}
              />

              {/* Interactive Crop Boundary Box */}
              <View
                style={[
                  styles.cropBox,
                  {
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.width,
                    height: cropBox.height,
                    borderColor: COLORS.accent,
                    borderTopWidth: activeDragHandle === 'top' ? 3.5 : 2,
                    borderBottomWidth: activeDragHandle === 'bottom' ? 3.5 : 2,
                    borderLeftWidth: activeDragHandle === 'left' ? 3.5 : 2,
                    borderRightWidth: activeDragHandle === 'right' ? 3.5 : 2,
                  },
                ]}
              >
                {/* Inner Document Highlight Tint */}
                <View style={[StyleSheet.absoluteFillObject, styles.pageHighlight]} pointerEvents="none" />

                {/* Rule of Thirds Grid Lines */}
                <View style={styles.gridLineH1} pointerEvents="none" />
                <View style={styles.gridLineH2} pointerEvents="none" />
                <View style={styles.gridLineV1} pointerEvents="none" />
                <View style={styles.gridLineV2} pointerEvents="none" />

                {/* Center Box Drag Zone */}
                <View
                  style={styles.touchBoxCenter}
                  {...responders.box.panHandlers}
                >
                  <View style={styles.centerMoveIndicator} pointerEvents="none">
                    <Ionicons name="move" size={18} color="rgba(255,255,255,0.8)" />
                  </View>
                </View>

                {/* --- 4 Edge Touch Zones & Grip Bars --- */}
                <View style={styles.topEdgeTouch} {...responders.top.panHandlers}>
                  <View style={[styles.edgePillH, { backgroundColor: COLORS.accent }, activeDragHandle === 'top' && styles.edgeActiveH]} pointerEvents="none" />
                </View>
                <View style={styles.bottomEdgeTouch} {...responders.bottom.panHandlers}>
                  <View style={[styles.edgePillH, { backgroundColor: COLORS.accent }, activeDragHandle === 'bottom' && styles.edgeActiveH]} pointerEvents="none" />
                </View>
                <View style={styles.leftEdgeTouch} {...responders.left.panHandlers}>
                  <View style={[styles.edgePillV, { backgroundColor: COLORS.accent }, activeDragHandle === 'left' && styles.edgeActiveV]} pointerEvents="none" />
                </View>
                <View style={styles.rightEdgeTouch} {...responders.right.panHandlers}>
                  <View style={[styles.edgePillV, { backgroundColor: COLORS.accent }, activeDragHandle === 'right' && styles.edgeActiveV]} pointerEvents="none" />
                </View>

                {/* --- 4 Corner Handles with Glowing Target Rings --- */}
                {/* Top-Left */}
                <View style={[styles.cornerTouch, styles.cornerTL]} {...responders.tl.panHandlers}>
                  <View style={[styles.targetRing, { borderColor: COLORS.accent }, activeDragHandle === 'tl' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.targetDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>

                {/* Top-Right */}
                <View style={[styles.cornerTouch, styles.cornerTR]} {...responders.tr.panHandlers}>
                  <View style={[styles.targetRing, { borderColor: COLORS.accent }, activeDragHandle === 'tr' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.targetDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>

                {/* Bottom-Left */}
                <View style={[styles.cornerTouch, styles.cornerBL]} {...responders.bl.panHandlers}>
                  <View style={[styles.targetRing, { borderColor: COLORS.accent }, activeDragHandle === 'bl' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.targetDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>

                {/* Bottom-Right */}
                <View style={[styles.cornerTouch, styles.cornerBR]} {...responders.br.panHandlers}>
                  <View style={[styles.targetRing, { borderColor: COLORS.accent }, activeDragHandle === 'br' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.targetDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>
              </View>

              {/* 60 FPS Precision Magnifier Loupe Lens */}
              {loupeState && loupeState.visible && displayedImageBounds.width > 0 && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.loupeLensContainer,
                    {
                      left: Math.max(12, Math.min(containerSize.width - 112, loupeState.targetX - 50)),
                      top: loupeState.targetY > 130 ? loupeState.targetY - 125 : loupeState.targetY + 40,
                      borderColor: COLORS.accent,
                    },
                  ]}
                >
                  <View
                    style={{
                      position: 'absolute',
                      width: displayedImageBounds.width * 2.2,
                      height: displayedImageBounds.height * 2.2,
                      left: 50 - (loupeState.targetX - displayedImageBounds.x) * 2.2,
                      top: 50 - (loupeState.targetY - displayedImageBounds.y) * 2.2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Image
                      source={{ uri: activeImageUri || formattedUri }}
                      style={{
                        width: (rotation === 90 || rotation === 270) ? displayedImageBounds.height * 2.2 : displayedImageBounds.width * 2.2,
                        height: (rotation === 90 || rotation === 270) ? displayedImageBounds.width * 2.2 : displayedImageBounds.height * 2.2,
                        transform: [{ rotate: `${rotation}deg` }],
                      }}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Precision Crosshair Guides */}
                  <View style={[styles.loupeCrossH, { backgroundColor: COLORS.accent }]} />
                  <View style={[styles.loupeCrossV, { backgroundColor: COLORS.accent }]} />
                  <View style={[styles.loupeCenterRing, { borderColor: '#FFFFFF', backgroundColor: COLORS.accent }]} />

                  {/* Zoom Indicator Badge */}
                  <View style={styles.loupeZoomBadge}>
                    <Text style={styles.loupeZoomText}>2.2x</Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* Micro-Nudge Precision D-Pad Popup */}
          {showManualNudge && (
            <View style={[styles.nudgeContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
              <View style={styles.nudgeHeaderRow}>
                <Text style={[styles.nudgeHeaderTitle, { color: COLORS.text }]}>
                  Micro-Nudge: <Text style={{ color: COLORS.accent, fontWeight: 'bold' }}>{selectedHandle.toUpperCase()}</Text>
                </Text>
                <View style={styles.nudgeStepGroup}>
                  {[1, 5, 10].map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setNudgeStep(s)}
                      style={[styles.stepBtn, nudgeStep === s && { backgroundColor: COLORS.accent }]}
                    >
                      <Text style={[styles.stepBtnText, { color: nudgeStep === s ? '#FFFFFF' : COLORS.muted }]}>{s}px</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.dpadCenterWrap}>
                <TouchableOpacity onPress={() => handleNudge('up')} style={[styles.dpadBtn, { backgroundColor: COLORS.surface2 }]}>
                  <Ionicons name="chevron-up" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View style={styles.dpadMiddleRow}>
                  <TouchableOpacity onPress={() => handleNudge('left')} style={[styles.dpadBtn, { backgroundColor: COLORS.surface2 }]}>
                    <Ionicons name="chevron-back" size={20} color={COLORS.text} />
                  </TouchableOpacity>
                  <View style={styles.dpadCenterPill}>
                    <Text style={[styles.dpadStepLabel, { color: COLORS.accent }]}>{nudgeStep}px</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleNudge('right')} style={[styles.dpadBtn, { backgroundColor: COLORS.surface2 }]}>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => handleNudge('down')} style={[styles.dpadBtn, { backgroundColor: COLORS.surface2 }]}>
                  <Ionicons name="chevron-down" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Bottom Toolbar: Quick Actions & Live Enhancement Filters */}
        <View style={[styles.bottomBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
          {/* Quick Actions: Auto Crop (Toggle), Micro Nudge, Rotate, Full Page, Delete */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsScroll}
          >
            {/* Auto Edge Crop Toggle */}
            <TouchableOpacity
              onPress={() => {
                const next = !autoCrop;
                setAutoCrop(next);
                if (next) {
                  runAutoEdgeDetection();
                } else {
                  handleResetCrop();
                }
              }}
              style={[
                styles.actionBtn,
                { backgroundColor: autoCrop ? COLORS.accent + '25' : COLORS.surface2 },
                autoCrop && { borderColor: COLORS.accent, borderWidth: 1 }
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name={autoCrop ? "sparkles" : "sparkles-outline"} size={17} color={autoCrop ? COLORS.accent : COLORS.text} />
              <Text style={[styles.actionBtnText, { color: autoCrop ? COLORS.accent : COLORS.text, fontWeight: autoCrop ? '700' : '500' }]}>
                Auto Edge: {autoCrop ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>

            {/* Rotate Left 90° */}
            <TouchableOpacity onPress={handleRotateLeft} style={[styles.actionBtn, { backgroundColor: COLORS.surface2 }]} activeOpacity={0.7}>
              <Ionicons name="arrow-undo-outline" size={17} color={COLORS.text} />
              <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Rotate Left</Text>
            </TouchableOpacity>

            {/* Rotate Right 90° */}
            <TouchableOpacity onPress={handleRotateRight} style={[styles.actionBtn, { backgroundColor: COLORS.surface2 }]} activeOpacity={0.7}>
              <Ionicons name="arrow-redo-outline" size={17} color={COLORS.text} />
              <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Rotate Right</Text>
            </TouchableOpacity>

            {/* Full Page Reset */}
            <TouchableOpacity
              onPress={() => {
                setAutoCrop(false);
                handleResetCrop();
              }}
              style={[styles.actionBtn, { backgroundColor: COLORS.surface2 }]}
              activeOpacity={0.7}
            >
              <Ionicons name="scan-outline" size={17} color={COLORS.text} />
              <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Full Page</Text>
            </TouchableOpacity>

            {/* Micro Nudge Precision Pad Toggle */}
            <TouchableOpacity
              onPress={() => setShowManualNudge(prev => !prev)}
              style={[
                styles.actionBtn,
                { backgroundColor: showManualNudge ? COLORS.accent + '25' : COLORS.surface2 },
                showManualNudge && { borderColor: COLORS.accent, borderWidth: 1 }
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="game-controller-outline" size={17} color={showManualNudge ? COLORS.accent : COLORS.text} />
              <Text style={[styles.actionBtnText, { color: showManualNudge ? COLORS.accent : COLORS.text }]}>
                Nudge
              </Text>
            </TouchableOpacity>

            {/* Delete Page */}
            {onDelete && (
              <TouchableOpacity
                onPress={onDelete}
                style={[styles.actionBtn, { backgroundColor: '#EF444420', borderColor: '#EF444450', borderWidth: 1 }]}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                <Text style={[styles.actionBtnText, { color: COLORS.danger, fontWeight: '700' }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Filter Pills */}
          <Text style={[styles.filterTitle, { color: COLORS.muted }]}>LIVE ENHANCEMENT FILTERS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTER_PRESETS.map(preset => {
              const active = activeFilter === preset.key;
              return (
                <TouchableOpacity
                  key={preset.key}
                  onPress={() => setActiveFilter(preset.key)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? COLORS.accent : COLORS.surface2,
                      borderColor: active ? COLORS.accent : COLORS.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={preset.icon as any}
                    size={15}
                    color={active ? '#FFFFFF' : COLORS.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : COLORS.text }]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Hidden Canvas Worker for High-Resolution Crop & Rotation */}
        <View style={{ height: 0, width: 0, opacity: 0, position: 'absolute' }}>
          <WebView
            ref={webViewRef}
            source={{ html: canvasHtml }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
          />
        </View>

        {/* Processing Loading Overlay */}
        {isProcessing && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ color: '#FFFFFF', marginTop: 12, fontSize: 15, fontWeight: '600' }}>
              Applying crop & enhancements...
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
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
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  imageWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  bwFilterOverlay: {
    backgroundColor: '#000000',
    opacity: 0.24,
  },
  grayscaleFilterOverlay: {
    backgroundColor: '#374151',
    opacity: 0.28,
  },
  magicFilterOverlay: {
    backgroundColor: '#0284C7',
    opacity: 0.1,
  },
  colorFilterOverlay: {
    backgroundColor: '#10B981',
    opacity: 0.05,
  },
  topInfoBar: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 90,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Dimming Masks outside the crop boundary
  dimMask: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    zIndex: 40,
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 2.5,
    zIndex: 50,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  // Document Highlight
  pageHighlight: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  touchBoxCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerMoveIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Corner Touch Zones & Rings
  cornerTouch: {
    position: 'absolute',
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  cornerTL: { top: -30, left: -30 },
  cornerTR: { top: -30, right: -30 },
  cornerBL: { bottom: -30, left: -30 },
  cornerBR: { bottom: -30, right: -30 },
  targetRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    backgroundColor: '#1E1E24',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 8,
  },
  handleActive: {
    transform: [{ scale: 1.25 }],
    backgroundColor: '#FFFFFF',
  },
  targetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  // Edge Touch Zones & Grip Pills (Enlarged 48px hit areas for easy edge dragging)
  suggestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  suggestPillText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  topEdgeTouch: {
    position: 'absolute',
    top: -24,
    left: 36,
    right: 36,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 65,
  },
  bottomEdgeTouch: {
    position: 'absolute',
    bottom: -24,
    left: 36,
    right: 36,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 65,
  },
  leftEdgeTouch: {
    position: 'absolute',
    left: -24,
    top: 36,
    bottom: 36,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 65,
  },
  rightEdgeTouch: {
    position: 'absolute',
    right: -24,
    top: 36,
    bottom: 36,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 65,
  },
  edgePillH: {
    width: 50,
    height: 7,
    borderRadius: 3.5,
  },
  edgeActiveH: {
    height: 11,
    width: 60,
    backgroundColor: '#FFFFFF',
  },
  edgePillV: {
    width: 7,
    height: 50,
    borderRadius: 3.5,
  },
  edgeActiveV: {
    width: 11,
    height: 60,
    backgroundColor: '#FFFFFF',
  },
  // Nudge Control Overlay
  nudgeContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
    alignItems: 'center',
  },
  nudgeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 150,
    marginBottom: 8,
  },
  nudgeHeaderTitle: {
    fontSize: 11,
  },
  nudgeStepGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  stepBtn: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stepBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dpadCenterWrap: {
    alignItems: 'center',
    gap: 4,
  },
  dpadMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dpadBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadCenterPill: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadStepLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  bottomBar: {
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  quickActionsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loupeLensContainer: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    backgroundColor: '#000000',
    overflow: 'hidden',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 16,
  },
  loupeCrossH: {
    position: 'absolute',
    top: 49,
    left: 0,
    right: 0,
    height: 1.5,
    opacity: 0.85,
  },
  loupeCrossV: {
    position: 'absolute',
    left: 49,
    top: 0,
    bottom: 0,
    width: 1.5,
    opacity: 0.85,
  },
  loupeCenterRing: {
    position: 'absolute',
    top: 45,
    left: 45,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  loupeZoomBadge: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  loupeZoomText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
