import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  ActivityIndicator,
  PanResponder,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useThemeColors } from '../utils/theme';

export interface ImageCropModalProps {
  visible: boolean;
  imageUri: string | null;
  fileName?: string;
  onClose: () => void;
}

type AspectRatioMode = 'free' | 'small_doc' | 'medium_doc' | '1:1' | '3:2' | '4:3' | '16:9' | 'a4';
type BorderFrameMode = 'none' | 'white_3' | 'frame_6' | 'dark_4';

export function ImageCropModal({
  visible,
  imageUri,
  fileName,
  onClose,
}: ImageCropModalProps) {
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  const [origImageSize, setOrigImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('free');
  const [borderFrame, setBorderFrame] = useState<BorderFrameMode>('none');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Manual Precision State
  const [showManualControls, setShowManualControls] = useState<boolean>(false);
  const [selectedHandle, setSelectedHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'box'>('box');
  const [nudgeStep, setNudgeStep] = useState<number>(5);

  // Crop rectangle relative to displayed image: { x, y, width, height }
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const activeHandleRef = useRef<string | null>(null);
  const initialDragRef = useRef<{ box: typeof cropBox; touchX: number; touchY: number }>({
    box: { x: 0, y: 0, width: 0, height: 0 },
    touchX: 0,
    touchY: 0,
  });

  // Calculate displayed image bounds inside the container
  const displayedImageBounds = useMemo(() => {
    if (origImageSize.width === 0 || origImageSize.height === 0 || containerSize.width === 0 || containerSize.height === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const isRotated = rotation === 90 || rotation === 270;
    const imgW = isRotated ? origImageSize.height : origImageSize.width;
    const imgH = isRotated ? origImageSize.width : origImageSize.height;

    const scale = Math.min(containerSize.width / imgW, containerSize.height / imgH);
    const width = imgW * scale;
    const height = imgH * scale;
    const x = (containerSize.width - width) / 2;
    const y = (containerSize.height - height) / 2;

    return { x, y, width, height };
  }, [origImageSize, containerSize, rotation]);

  // Load original image dimensions
  useEffect(() => {
    if (visible && imageUri) {
      setRotation(0);
      setAspectMode('free');
      setBorderFrame('none');
      setShowManualControls(false);
      setSelectedHandle('box');
      setIsProcessing(false);
      
      const formatted = imageUri.startsWith('file://') || imageUri.startsWith('content://') || imageUri.startsWith('http')
        ? imageUri
        : `file://${imageUri}`;

      Image.getSize(
        formatted,
        (w, h) => {
          setOrigImageSize({ width: w, height: h });
        },
        (err) => {
          console.warn('Failed to get image size for crop:', err);
          // Fallback dimensions
          setOrigImageSize({ width: 1080, height: 1920 });
        }
      );
    }
  }, [visible, imageUri]);

  // Initialize crop box to full image or requested aspect ratio
  useEffect(() => {
    if (displayedImageBounds.width > 0 && displayedImageBounds.height > 0) {
      applyAspectRatio(aspectMode, displayedImageBounds);
    }
  }, [displayedImageBounds, aspectMode]);

  const applyAspectRatio = (mode: AspectRatioMode, bounds: typeof displayedImageBounds) => {
    let targetW = bounds.width;
    let targetH = bounds.height;

    if (mode === 'small_doc') {
      targetW = bounds.width * 0.38;
      targetH = bounds.height * 0.38;
    } else if (mode === 'medium_doc') {
      targetW = bounds.width * 0.65;
      targetH = bounds.height * 0.65;
    } else {
      let targetRatio = 0;
      if (mode === '1:1') targetRatio = 1;
      else if (mode === '3:2') targetRatio = 3 / 2;
      else if (mode === '4:3') targetRatio = 4 / 3;
      else if (mode === '16:9') targetRatio = 16 / 9;
      else if (mode === 'a4') targetRatio = 1 / 1.414;

      if (targetRatio > 0) {
        const currentRatio = bounds.width / bounds.height;
        if (currentRatio > targetRatio) {
          targetW = bounds.height * targetRatio;
          targetH = bounds.height;
        } else {
          targetW = bounds.width;
          targetH = bounds.width / targetRatio;
        }
      }
    }

    const x = bounds.x + (bounds.width - targetW) / 2;
    const y = bounds.y + (bounds.height - targetH) / 2;

    setCropBox({
      x: Math.max(bounds.x, x),
      y: Math.max(bounds.y, y),
      width: Math.min(bounds.width, targetW),
      height: Math.min(bounds.height, targetH),
    });
  };

  const handleNudge = (direction: 'up' | 'down' | 'left' | 'right', customStep?: number) => {
    const step = customStep || nudgeStep;
    const bounds = displayedImageBounds;
    if (bounds.width === 0) return;

    const minSize = 20;
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
        const newW = prev.width - (newX - prev.x);
        const newH = prev.height - (newY - prev.y);
        return { x: newX, y: newY, width: newW, height: newH };
      } else if (selectedHandle === 'tr') {
        const newY = Math.max(bounds.y, Math.min(prev.y + prev.height - minSize, prev.y + dy));
        const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - prev.x, prev.width + dx));
        const newH = prev.height - (newY - prev.y);
        return { ...prev, y: newY, width: newW, height: newH };
      } else if (selectedHandle === 'bl') {
        const newX = Math.max(bounds.x, Math.min(prev.x + prev.width - minSize, prev.x + dx));
        const newW = prev.width - (newX - prev.x);
        const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - prev.y, prev.height + dy));
        return { x: newX, y: prev.y, width: newW, height: newH };
      } else if (selectedHandle === 'br') {
        const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - prev.x, prev.width + dx));
        const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - prev.y, prev.height + dy));
        return { ...prev, width: newW, height: newH };
      }
      return prev;
    });
  };

  const handleEdgeStep = (edge: 'top' | 'bottom' | 'left' | 'right', delta: number) => {
    const bounds = displayedImageBounds;
    if (bounds.width === 0) return;
    const minSize = 20;

    setCropBox((prev) => {
      if (edge === 'top') {
        const newY = Math.max(bounds.x, Math.min(prev.y + prev.height - minSize, prev.y - delta));
        const newH = prev.height + (prev.y - newY);
        return { ...prev, y: newY, height: newH };
      } else if (edge === 'bottom') {
        const newH = Math.max(minSize, Math.min(bounds.y + bounds.height - prev.y, prev.height + delta));
        return { ...prev, height: newH };
      } else if (edge === 'left') {
        const newX = Math.max(bounds.x, Math.min(prev.x + prev.width - minSize, prev.x - delta));
        const newW = prev.width + (prev.x - newX);
        return { ...prev, x: newX, width: newW };
      } else if (edge === 'right') {
        const newW = Math.max(minSize, Math.min(bounds.x + bounds.width - prev.x, prev.width + delta));
        return { ...prev, width: newW };
      }
      return prev;
    });
  };

  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;

  const displayedImageBoundsRef = useRef(displayedImageBounds);
  displayedImageBoundsRef.current = displayedImageBounds;

  const [activeDragHandle, setActiveDragHandle] = useState<string | null>(null);

  const makeHandlePanResponder = (handle: 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'box') => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
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
        if (bounds.width === 0) return;

        const dx = gestureState.dx;
        const dy = gestureState.dy;
        const minSize = 25;

        if (handle === 'box') {
          let newX = Math.max(bounds.x, Math.min(bounds.x + bounds.width - initial.box.width, initial.box.x + dx));
          let newY = Math.max(bounds.y, Math.min(bounds.y + bounds.height - initial.box.height, initial.box.y + dy));
          setCropBox(b => ({ ...b, x: newX, y: newY }));
        } else if (handle === 'top') {
          let newY = Math.max(bounds.y, Math.min(initial.box.y + initial.box.height - minSize, initial.box.y + dy));
          let newH = initial.box.height - (newY - initial.box.y);
          setCropBox(b => ({ ...b, y: newY, height: newH }));
        } else if (handle === 'bottom') {
          let newH = Math.max(minSize, Math.min(bounds.y + bounds.height - initial.box.y, initial.box.height + dy));
          setCropBox(b => ({ ...b, height: newH }));
        } else if (handle === 'left') {
          let newX = Math.max(bounds.x, Math.min(initial.box.x + initial.box.width - minSize, initial.box.x + dx));
          let newW = initial.box.width - (newX - initial.box.x);
          setCropBox(b => ({ ...b, x: newX, width: newW }));
        } else if (handle === 'right') {
          let newW = Math.max(minSize, Math.min(bounds.x + bounds.width - initial.box.x, initial.box.width + dx));
          setCropBox(b => ({ ...b, width: newW }));
        } else if (handle === 'tl') {
          let newX = Math.max(bounds.x, Math.min(initial.box.x + initial.box.width - minSize, initial.box.x + dx));
          let newY = Math.max(bounds.y, Math.min(initial.box.y + initial.box.height - minSize, initial.box.y + dy));
          let newW = initial.box.width - (newX - initial.box.x);
          let newH = initial.box.height - (newY - initial.box.y);
          setCropBox({ x: newX, y: newY, width: newW, height: newH });
        } else if (handle === 'tr') {
          let newY = Math.max(bounds.y, Math.min(initial.box.y + initial.box.height - minSize, initial.box.y + dy));
          let newW = Math.max(minSize, Math.min(bounds.x + bounds.width - initial.box.x, initial.box.width + dx));
          let newH = initial.box.height - (newY - initial.box.y);
          setCropBox({ x: initial.box.x, y: newY, width: newW, height: newH });
        } else if (handle === 'bl') {
          let newX = Math.max(bounds.x, Math.min(initial.box.x + initial.box.width - minSize, initial.box.x + dx));
          let newW = initial.box.width - (newX - initial.box.x);
          let newH = Math.max(minSize, Math.min(bounds.y + bounds.height - initial.box.y, initial.box.height + dy));
          setCropBox({ x: newX, y: initial.box.y, width: newW, height: newH });
        } else if (handle === 'br') {
          let newW = Math.max(minSize, Math.min(bounds.x + bounds.width - initial.box.x, initial.box.width + dx));
          let newH = Math.max(minSize, Math.min(bounds.y + bounds.height - initial.box.y, initial.box.height + dy));
          setCropBox(b => ({ ...b, width: newW, height: newH }));
        }
      },
      onPanResponderRelease: () => {
        activeHandleRef.current = null;
        setActiveDragHandle(null);
      },
      onPanResponderTerminate: () => {
        activeHandleRef.current = null;
        setActiveDragHandle(null);
      },
    });
  };

  const responders = useRef({
    tl: makeHandlePanResponder('tl'),
    tr: makeHandlePanResponder('tr'),
    bl: makeHandlePanResponder('bl'),
    br: makeHandlePanResponder('br'),
    top: makeHandlePanResponder('top'),
    bottom: makeHandlePanResponder('bottom'),
    left: makeHandlePanResponder('left'),
    right: makeHandlePanResponder('right'),
    box: makeHandlePanResponder('box'),
  }).current;

  // Execute high-resolution crop and share
  const handleExecuteShare = async () => {
    if (!imageUri || displayedImageBounds.width === 0 || cropBox.width === 0) return;

    setIsProcessing(true);
    setProcessingStatus('Processing image & aligning borders...');

    try {
      // Calculate normalized relative crop coordinates [0..1]
      const relX = (cropBox.x - displayedImageBounds.x) / displayedImageBounds.width;
      const relY = (cropBox.y - displayedImageBounds.y) / displayedImageBounds.height;
      const relW = cropBox.width / displayedImageBounds.width;
      const relH = cropBox.height / displayedImageBounds.height;

      // Read image as base64
      let readUri = imageUri;
      if (readUri.startsWith('content://') || readUri.startsWith('file:///storage/')) {
        const filename = readUri.split('/').pop() || `temp_${Date.now()}`;
        const cacheCopy = FileSystem.cacheDirectory + filename;
        await FileSystem.copyAsync({ from: readUri, to: cacheCopy });
        readUri = cacheCopy;
      }

      const base64Data = await FileSystem.readAsStringAsync(readUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const mimeType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      // Send payload to WebView Canvas for pixel-perfect render
      const payload = JSON.stringify({
        dataUri,
        relX,
        relY,
        relW,
        relH,
        rotation,
        borderFrame,
      });

      webViewRef.current?.injectJavaScript(`
        window.processCrop(${payload});
        true;
      `);
    } catch (err: any) {
      console.warn('Crop processing error:', err);
      setIsProcessing(false);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SUCCESS' && msg.base64) {
        setProcessingStatus('Preparing share sheet...');
        const outFileName = `cropped_${fileName || 'shared'}_${Date.now()}.jpg`;
        const outUri = `${FileSystem.cacheDirectory}${outFileName}`;

        await FileSystem.writeAsStringAsync(outUri, msg.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        setIsProcessing(false);
        onClose();

        // Trigger native share
        await Sharing.shareAsync(outUri, {
          dialogTitle: `Share ${fileName || 'Cropped Image'}`,
          mimeType: 'image/jpeg',
        });
      } else if (msg.type === 'ERROR') {
        console.warn('Canvas Error:', msg.error);
        setIsProcessing(false);
      }
    } catch (e) {
      console.warn('Message parsing error:', e);
      setIsProcessing(false);
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

                // Handle rotation
                var isRot = params.rotation === 90 || params.rotation === 270;
                var rotatedW = isRot ? origH : origW;
                var rotatedH = isRot ? origW : origH;

                // Step 1: Draw full rotated image to temp canvas
                var rotCanvas = document.createElement('canvas');
                rotCanvas.width = rotatedW;
                rotCanvas.height = rotatedH;
                var rotCtx = rotCanvas.getContext('2d');
                rotCtx.imageSmoothingEnabled = true;
                rotCtx.imageSmoothingQuality = 'high';

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

                // Step 2: Compute pixel crop rectangle with edge-preserving clamping
                var clampedRelX = Math.max(0, Math.min(1, params.relX || 0));
                var clampedRelY = Math.max(0, Math.min(1, params.relY || 0));
                var clampedRelW = Math.max(0.01, Math.min(1 - clampedRelX, params.relW || 1));
                var clampedRelH = Math.max(0.01, Math.min(1 - clampedRelY, params.relH || 1));

                // If user selection is within 2% of the edge, snap to outer border to avoid trimming content
                if (clampedRelX <= 0.02) clampedRelX = 0;
                if (clampedRelY <= 0.02) clampedRelY = 0;
                if (clampedRelX + clampedRelW >= 0.98) clampedRelW = 1 - clampedRelX;
                if (clampedRelY + clampedRelH >= 0.98) clampedRelH = 1 - clampedRelY;

                var cropPxX = Math.max(0, Math.round(clampedRelX * rotatedW));
                var cropPxY = Math.max(0, Math.round(clampedRelY * rotatedH));
                var cropPxW = Math.max(1, Math.min(rotatedW - cropPxX, Math.round(clampedRelW * rotatedW)));
                var cropPxH = Math.max(1, Math.min(rotatedH - cropPxY, Math.round(clampedRelH * rotatedH)));

                // Step 3: Calculate border framing margin
                var marginPct = 0;
                var marginColor = '#FFFFFF';
                if (params.borderFrame === 'white_3') {
                  marginPct = 0.03;
                  marginColor = '#FFFFFF';
                } else if (params.borderFrame === 'frame_6') {
                  marginPct = 0.06;
                  marginColor = '#FFFFFF';
                } else if (params.borderFrame === 'dark_4') {
                  marginPct = 0.04;
                  marginColor = '#1E293B';
                }

                var marginX = Math.round(cropPxW * marginPct);
                var marginY = Math.round(cropPxH * marginPct);

                var finalW = cropPxW + (marginX * 2);
                var finalH = cropPxH + (marginY * 2);

                var finalCanvas = document.getElementById('cropCanvas');
                finalCanvas.width = finalW;
                finalCanvas.height = finalH;
                var finalCtx = finalCanvas.getContext('2d');
                finalCtx.imageSmoothingEnabled = true;
                finalCtx.imageSmoothingQuality = 'high';

                // Fill background / border framing
                if (marginPct > 0) {
                  finalCtx.fillStyle = marginColor;
                  finalCtx.fillRect(0, 0, finalW, finalH);

                  // Optional delicate shadow / inner border for clean document alignment
                  finalCtx.strokeStyle = 'rgba(0,0,0,0.12)';
                  finalCtx.lineWidth = 1;
                  finalCtx.strokeRect(marginX, marginY, cropPxW, cropPxH);
                }

                // Draw cropped region
                finalCtx.drawImage(
                  rotCanvas,
                  cropPxX, cropPxY, cropPxW, cropPxH,
                  marginX, marginY, cropPxW, cropPxH
                );

                var dataUrl = finalCanvas.toDataURL('image/jpeg', 0.95);
                var rawBase64 = dataUrl.split(',')[1];
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SUCCESS',
                  base64: rawBase64
                }));
              };
              img.onerror = function(err) {
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

  if (!visible || !imageUri) return null;

  const formattedUri = imageUri.startsWith('file://') || imageUri.startsWith('content://') || imageUri.startsWith('http')
    ? imageUri
    : `file://${imageUri}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]} edges={['top', 'bottom']}>
        {/* Hidden Canvas Worker */}
        <View style={{ height: 0, width: 0, opacity: 0 }}>
          <WebView
            ref={webViewRef}
            source={{ html: canvasHtml }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
          />
        </View>

        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: COLORS.border, backgroundColor: COLORS.surface }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} disabled={isProcessing}>
            <Ionicons name="close" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Ionicons name="crop" size={20} color={COLORS.accent} />
            <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>
              Crop & Align Borders
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleExecuteShare}
            style={[styles.shareActionBtn, { backgroundColor: COLORS.accent }]}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={styles.shareActionBtnText}>Share</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Image Cropping Canvas Area */}
        <View
          style={styles.cropCanvasArea}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setContainerSize({ width, height });
          }}
        >
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
                source={{ uri: formattedUri }}
                style={{
                  width: (rotation === 90 || rotation === 270) ? displayedImageBounds.height : displayedImageBounds.width,
                  height: (rotation === 90 || rotation === 270) ? displayedImageBounds.width : displayedImageBounds.height,
                  transform: [{ rotate: `${rotation}deg` }],
                }}
                resizeMode="cover"
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source;
                  if (width && height && (origImageSize.width !== width || origImageSize.height !== height)) {
                    setOrigImageSize({ width, height });
                  }
                }}
              />
            </View>
          )}

          {/* Dark Overlay Outside Crop Area */}
          {displayedImageBounds.width > 0 && (
            <>
              {/* Top mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.maskBlock,
                  {
                    left: displayedImageBounds.x,
                    top: displayedImageBounds.y,
                    width: displayedImageBounds.width,
                    height: Math.max(0, cropBox.y - displayedImageBounds.y),
                  },
                ]}
              />
              {/* Bottom mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.maskBlock,
                  {
                    left: displayedImageBounds.x,
                    top: cropBox.y + cropBox.height,
                    width: displayedImageBounds.width,
                    height: Math.max(0, displayedImageBounds.y + displayedImageBounds.height - (cropBox.y + cropBox.height)),
                  },
                ]}
              />
              {/* Left mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.maskBlock,
                  {
                    left: displayedImageBounds.x,
                    top: cropBox.y,
                    width: Math.max(0, cropBox.x - displayedImageBounds.x),
                    height: cropBox.height,
                  },
                ]}
              />
              {/* Right mask */}
              <View
                pointerEvents="none"
                style={[
                  styles.maskBlock,
                  {
                    left: cropBox.x + cropBox.width,
                    top: cropBox.y,
                    width: Math.max(0, displayedImageBounds.x + displayedImageBounds.width - (cropBox.x + cropBox.width)),
                    height: cropBox.height,
                  },
                ]}
              />

              {/* Interactive Crop Rectangle */}
              <View
                style={[
                  styles.cropBox,
                  {
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.width,
                    height: cropBox.height,
                    borderColor: COLORS.accent,
                    borderTopWidth: activeDragHandle === 'top' ? 3.5 : 1.5,
                    borderBottomWidth: activeDragHandle === 'bottom' ? 3.5 : 1.5,
                    borderLeftWidth: activeDragHandle === 'left' ? 3.5 : 1.5,
                    borderRightWidth: activeDragHandle === 'right' ? 3.5 : 1.5,
                  },
                ]}
              >
                {/* 3x3 Grid Lines */}
                <View style={styles.gridH1} pointerEvents="none" />
                <View style={styles.gridH2} pointerEvents="none" />
                <View style={styles.gridV1} pointerEvents="none" />
                <View style={styles.gridV2} pointerEvents="none" />

                {/* Center Box Drag Zone */}
                <View 
                  style={styles.touchBoxCenter} 
                  {...responders.box.panHandlers} 
                />

                {/* 4 Edge Touch Zones & Grip Bars */}
                <View 
                  style={styles.touchEdgeTop} 
                  {...responders.top.panHandlers}
                >
                  <View style={[styles.edgeHandleH, { backgroundColor: COLORS.accent }, activeDragHandle === 'top' && styles.edgeActiveH]} pointerEvents="none" />
                </View>

                <View 
                  style={styles.touchEdgeBottom} 
                  {...responders.bottom.panHandlers}
                >
                  <View style={[styles.edgeHandleH, { backgroundColor: COLORS.accent }, activeDragHandle === 'bottom' && styles.edgeActiveH]} pointerEvents="none" />
                </View>

                <View 
                  style={styles.touchEdgeLeft} 
                  {...responders.left.panHandlers}
                >
                  <View style={[styles.edgeHandleV, { backgroundColor: COLORS.accent }, activeDragHandle === 'left' && styles.edgeActiveV]} pointerEvents="none" />
                </View>

                <View 
                  style={styles.touchEdgeRight} 
                  {...responders.right.panHandlers}
                >
                  <View style={[styles.edgeHandleV, { backgroundColor: COLORS.accent }, activeDragHandle === 'right' && styles.edgeActiveV]} pointerEvents="none" />
                </View>

                {/* 4 Corner Touch Zones & Scanner Nodes */}
                <View 
                  style={styles.touchCornerTL} 
                  {...responders.tl.panHandlers}
                >
                  <View style={[styles.handleCorner, { borderColor: COLORS.accent }, activeDragHandle === 'tl' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.handleCenterDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>

                <View 
                  style={styles.touchCornerTR} 
                  {...responders.tr.panHandlers}
                >
                  <View style={[styles.handleCorner, { borderColor: COLORS.accent }, activeDragHandle === 'tr' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.handleCenterDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>

                <View 
                  style={styles.touchCornerBL} 
                  {...responders.bl.panHandlers}
                >
                  <View style={[styles.handleCorner, { borderColor: COLORS.accent }, activeDragHandle === 'bl' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.handleCenterDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>

                <View 
                  style={styles.touchCornerBR} 
                  {...responders.br.panHandlers}
                >
                  <View style={[styles.handleCorner, { borderColor: COLORS.accent }, activeDragHandle === 'br' && styles.handleActive]} pointerEvents="none">
                    <View style={[styles.handleCenterDot, { backgroundColor: COLORS.accent }]} />
                  </View>
                </View>
              </View>

              {/* Live Dimensions Badge */}
              <View style={[styles.dimBadge, { backgroundColor: 'rgba(0,0,0,0.75)' }]} pointerEvents="none">
                <Ionicons name="scan-outline" size={13} color={COLORS.accent} />
                <Text style={styles.dimBadgeText}>
                  {Math.round(cropBox.width)} × {Math.round(cropBox.height)} px
                </Text>
              </View>
            </>
          )}

          {/* Loading Indicator when executing */}
          {isProcessing && (
            <View style={[StyleSheet.absoluteFill, styles.processingOverlay]}>
              <View style={[styles.processingCard, { backgroundColor: COLORS.surface }]}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={[styles.processingText, { color: COLORS.text }]}>{processingStatus}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom Toolbars (Aspect Ratios, Border Framing, Rotation & Manual D-Pad) */}
        <View style={[styles.controlsPanel, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
          {/* Toggle Header: Presets vs Manual Fine-Tune */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              onPress={() => setShowManualControls(false)}
              style={[styles.modeTab, !showManualControls && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            >
              <Ionicons name="grid-outline" size={15} color={!showManualControls ? COLORS.accent : COLORS.muted} />
              <Text style={[styles.modeTabText, { color: !showManualControls ? COLORS.accent : COLORS.muted }]}>
                Standard Presets
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowManualControls(true)}
              style={[styles.modeTab, showManualControls && { borderBottomColor: COLORS.accent, borderBottomWidth: 2 }]}
            >
              <Ionicons name="finger-print-outline" size={15} color={showManualControls ? COLORS.accent : COLORS.muted} />
              <Text style={[styles.modeTabText, { color: showManualControls ? COLORS.accent : COLORS.muted }]}>
                🎯 Manual & Small Doc
              </Text>
            </TouchableOpacity>
          </View>

          {!showManualControls ? (
            <>
              {/* Aspect Ratio Row */}
              <Text style={[styles.panelSectionTitle, { color: COLORS.muted }]}>Presets & Small Doc</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                {[
                  { key: 'free', label: 'Free' },
                  { key: 'small_doc', label: '🤏 Small Doc (38%)' },
                  { key: 'medium_doc', label: '📄 Medium (65%)' },
                  { key: '3:2', label: 'ID / Card (3:2)' },
                  { key: '4:3', label: 'Doc (4:3)' },
                  { key: 'a4', label: 'A4 Page' },
                  { key: '1:1', label: 'Square (1:1)' },
                  { key: '16:9', label: '16:9' },
                ].map((item) => {
                  const active = aspectMode === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.controlChip, active && { backgroundColor: COLORS.accentSoft + '33', borderColor: COLORS.accent }]}
                      onPress={() => setAspectMode(item.key as AspectRatioMode)}
                    >
                      <Text style={[styles.controlChipText, { color: active ? COLORS.accent : COLORS.muted }]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Bottom Framing & Tools Row */}
              <View style={styles.framingAndToolsRow}>
                {/* Border Framing Mode */}
                <View style={styles.framingScrollWrap}>
                  <Text style={[styles.panelSectionTitle, { color: COLORS.muted }]}>Framing Border</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                    {[
                      { key: 'none', label: 'No Frame' },
                      { key: 'thin_black', label: 'Thin Black' },
                      { key: 'card_slate', label: 'Slate Frame' },
                      { key: 'clean_white', label: 'Clean White' },
                      { key: 'doc_shadow', label: 'Doc Shadow' },
                    ].map((frame) => {
                      const active = borderFrame === frame.key;
                      return (
                        <TouchableOpacity
                          key={frame.key}
                          style={[styles.controlChip, active && { backgroundColor: COLORS.accentSoft + '33', borderColor: COLORS.accent }]}
                          onPress={() => setBorderFrame(frame.key as BorderFrameMode)}
                        >
                          <Text style={[styles.controlChipText, { color: active ? COLORS.accent : COLORS.muted }]}>
                            {frame.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Quick Rotate & Reset Buttons */}
                <View style={styles.quickToolsWrap}>
                  <TouchableOpacity
                    onPress={() => setRotation((r) => (r + 90) % 360)}
                    style={[styles.toolCircleBtn, { backgroundColor: COLORS.surface2 }]}
                  >
                    <Ionicons name="reload" size={19} color={COLORS.accent} />
                    <Text style={[styles.toolCircleText, { color: COLORS.text }]}>Rotate</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setRotation(0);
                      setAspectMode('free');
                      setBorderFrame('none');
                      if (displayedImageBounds.width > 0) {
                        setCropBox({
                          x: displayedImageBounds.x,
                          y: displayedImageBounds.y,
                          width: displayedImageBounds.width,
                          height: displayedImageBounds.height,
                        });
                      }
                    }}
                    style={[styles.toolCircleBtn, { backgroundColor: COLORS.surface2 }]}
                  >
                    <Ionicons name="refresh-outline" size={19} color={COLORS.muted} />
                    <Text style={[styles.toolCircleText, { color: COLORS.muted }]}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            /* Manual Precision Controls Panel */
            <View style={styles.manualControlsWrap}>
              {/* Target Handle Selector */}
              <View style={styles.handleSelectRow}>
                <Text style={[styles.panelSectionTitle, { color: COLORS.muted, marginBottom: 0 }]}>Target:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { key: 'box', label: '✥ Move Box' },
                    { key: 'top', label: '⬆ Top Border' },
                    { key: 'bottom', label: '⬇ Bot Border' },
                    { key: 'left', label: '⬅ Left Border' },
                    { key: 'right', label: '➡ Right Border' },
                    { key: 'tl', label: '↖ Top-Left' },
                    { key: 'tr', label: '↗ Top-Right' },
                    { key: 'bl', label: '↙ Bot-Left' },
                    { key: 'br', label: '↘ Bot-Right' },
                  ].map((h) => {
                    const active = selectedHandle === h.key;
                    return (
                      <TouchableOpacity
                        key={h.key}
                        style={[styles.miniHandleChip, active && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
                        onPress={() => setSelectedHandle(h.key as any)}
                      >
                        <Text style={[styles.miniHandleText, { color: active ? '#fff' : COLORS.text }]}>
                          {h.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* D-Pad and Inset Steppers in Two Columns */}
              <View style={styles.nudgeAndInsetsRow}>
                {/* Left: Directional D-Pad */}
                <View style={styles.dpadContainer}>
                  <TouchableOpacity
                    style={[styles.dpadBtn, styles.dpadUp, { backgroundColor: COLORS.surface2 }]}
                    onPress={() => handleNudge('up')}
                  >
                    <Ionicons name="chevron-up" size={20} color={COLORS.accent} />
                  </TouchableOpacity>
                  <View style={styles.dpadMiddleRow}>
                    <TouchableOpacity
                      style={[styles.dpadBtn, styles.dpadLeft, { backgroundColor: COLORS.surface2 }]}
                      onPress={() => handleNudge('left')}
                    >
                      <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
                    </TouchableOpacity>
                    <View style={[styles.dpadCenter, { backgroundColor: COLORS.accentSoft + '22' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.accent }}>{nudgeStep}px</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.dpadBtn, styles.dpadRight, { backgroundColor: COLORS.surface2 }]}
                      onPress={() => handleNudge('right')}
                    >
                      <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.dpadBtn, styles.dpadDown, { backgroundColor: COLORS.surface2 }]}
                    onPress={() => handleNudge('down')}
                  >
                    <Ionicons name="chevron-down" size={20} color={COLORS.accent} />
                  </TouchableOpacity>
                </View>

                {/* Right: Edge Margins & Step Size */}
                <View style={styles.insetsContainer}>
                  <View style={styles.insetRow}>
                    <Text style={[styles.insetText, { color: COLORS.text }]}>Top / Bot</Text>
                    <TouchableOpacity style={[styles.insetBtn, { backgroundColor: COLORS.surface2 }]} onPress={() => handleEdgeStep('top', -nudgeStep)}>
                      <Text style={[styles.insetBtnText, { color: COLORS.text }]}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.insetBtn, { backgroundColor: COLORS.surface2 }]} onPress={() => handleEdgeStep('top', nudgeStep)}>
                      <Text style={[styles.insetBtnText, { color: COLORS.text }]}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.insetRow}>
                    <Text style={[styles.insetText, { color: COLORS.text }]}>Left / Rgt</Text>
                    <TouchableOpacity style={[styles.insetBtn, { backgroundColor: COLORS.surface2 }]} onPress={() => handleEdgeStep('left', -nudgeStep)}>
                      <Text style={[styles.insetBtnText, { color: COLORS.text }]}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.insetBtn, { backgroundColor: COLORS.surface2 }]} onPress={() => handleEdgeStep('left', nudgeStep)}>
                      <Text style={[styles.insetBtnText, { color: COLORS.text }]}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Step Selector */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: COLORS.muted }}>Step:</Text>
                    {[2, 5, 15].map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.stepChip, nudgeStep === s && { backgroundColor: COLORS.accent }]}
                        onPress={() => setNudgeStep(s)}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: nudgeStep === s ? '#fff' : COLORS.text }}>
                          {s}px
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
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
    gap: 8,
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  shareActionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  cropCanvasArea: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  maskBlock: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
  },
  gridH1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  gridH2: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '66.66%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  gridV1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  gridV2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  touchBoxCenter: {
    position: 'absolute',
    top: 25,
    bottom: 25,
    left: 25,
    right: 25,
    zIndex: 1,
  },
  touchEdgeTop: {
    position: 'absolute',
    top: -22,
    left: 30,
    right: 30,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  touchEdgeBottom: {
    position: 'absolute',
    bottom: -22,
    left: 30,
    right: 30,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  touchEdgeLeft: {
    position: 'absolute',
    left: -22,
    top: 30,
    bottom: 30,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  touchEdgeRight: {
    position: 'absolute',
    right: -22,
    top: 30,
    bottom: 30,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  touchCornerTL: {
    position: 'absolute',
    top: -26,
    left: -26,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  touchCornerTR: {
    position: 'absolute',
    top: -26,
    right: -26,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  touchCornerBL: {
    position: 'absolute',
    bottom: -26,
    left: -26,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  touchCornerBR: {
    position: 'absolute',
    bottom: -26,
    right: -26,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderRadius: 14,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  handleActive: {
    transform: [{ scale: 1.25 }],
    backgroundColor: '#FEF08A',
  },
  handleCenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  handleTL: {
    top: -14,
    left: -14,
  },
  handleTR: {
    top: -14,
    right: -14,
  },
  handleBL: {
    bottom: -14,
    left: -14,
  },
  handleBR: {
    bottom: -14,
    right: -14,
  },
  edgeHandleH: {
    position: 'absolute',
    width: 48,
    height: 7,
    borderRadius: 3.5,
    left: '50%',
    marginLeft: -24,
    zIndex: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  edgeActiveH: {
    height: 10,
    marginTop: -1.5,
    backgroundColor: '#38BDF8',
  },
  edgeHandleTop: {
    top: -3.5,
  },
  edgeHandleBottom: {
    bottom: -3.5,
  },
  edgeHandleV: {
    position: 'absolute',
    width: 7,
    height: 48,
    borderRadius: 3.5,
    top: '50%',
    marginTop: -24,
    zIndex: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  edgeActiveV: {
    width: 10,
    marginLeft: -1.5,
    backgroundColor: '#38BDF8',
  },
  edgeHandleLeft: {
    left: -3.5,
  },
  edgeHandleRight: {
    right: -3.5,
  },
  dimBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
    zIndex: 30,
  },
  dimBadgeText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  processingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  processingCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    maxWidth: 280,
  },
  processingText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlsPanel: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 1,
  },
  modeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  modeTabText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  panelSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingBottom: 4,
  },
  controlChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'transparent',
  },
  controlChipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  borderAndToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  framingAndToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  framingScrollWrap: {
    flex: 1,
  },
  quickToolsWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 18,
  },
  toolCircleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 2,
  },
  toolCircleText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  manualControlsWrap: {
    paddingTop: 4,
  },
  handleSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  miniHandleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
  },
  miniHandleText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  nudgeAndInsetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  dpadContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginVertical: 4,
  },
  dpadBtn: {
    width: 38,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadUp: {},
  dpadDown: {},
  dpadLeft: {},
  dpadRight: {},
  dpadCenter: {
    width: 38,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insetsContainer: {
    flex: 1,
    gap: 6,
  },
  insetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  insetText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  insetBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insetBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
});