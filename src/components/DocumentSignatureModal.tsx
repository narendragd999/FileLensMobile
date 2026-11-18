import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';

interface DocumentSignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (params: { signatureDataUri: string; position: 'bottom-right' | 'center' | 'bottom-left' }) => void;
}

const PEN_COLORS = [
  { label: 'Black', hex: '#000000' },
  { label: 'Blue', hex: '#1D4ED8' },
  { label: 'Emerald', hex: '#059669' },
];

export const DocumentSignatureModal: React.FC<DocumentSignatureModalProps> = ({
  visible,
  onClose,
  onApply,
}) => {
  const COLORS = useThemeColors();
  const webViewRef = useRef<WebView>(null);
  const [selectedColor, setSelectedColor] = useState<string>('#000000');
  const [position, setPosition] = useState<'bottom-right' | 'center' | 'bottom-left'>('bottom-right');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Guarantee clean state whenever modal opens or closes
  useEffect(() => {
    if (visible) {
      setIsExporting(false);
      // Give WebView a tick to clear previous signature
      setTimeout(() => {
        webViewRef.current?.injectJavaScript('if (window.clearCanvas) window.clearCanvas(); true;');
      }, 150);
    } else {
      setIsExporting(false);
    }
  }, [visible]);

  const signatureHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body, html { width: 100%; height: 100%; overflow: hidden; background: #FFFFFF; }
          #pad { width: 100%; height: 100%; display: block; touch-action: none; }
        </style>
      </head>
      <body>
        <canvas id="pad"></canvas>
        <script>
          var canvas = document.getElementById('pad');
          var ctx = canvas.getContext('2d');
          var drawing = false;
          var strokes = [];
          var currentStroke = [];
          var penColor = '${selectedColor}';
          var strokeWidth = 3.5;

          function resize() {
            var ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = window.innerWidth * ratio;
            canvas.height = window.innerHeight * ratio;
            ctx.scale(ratio, ratio);
            redraw();
          }
          window.addEventListener('resize', resize);
          resize();

          function redraw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < strokes.length; i++) {
              var s = strokes[i];
              if (s.points.length < 2) continue;
              ctx.strokeStyle = s.color;
              ctx.lineWidth = s.width;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.beginPath();
              ctx.moveTo(s.points[0].x, s.points[0].y);
              for (var j = 1; j < s.points.length; j++) {
                ctx.lineTo(s.points[j].x, s.points[j].y);
              }
              ctx.stroke();
            }
          }

          function getPos(e) {
            var rect = canvas.getBoundingClientRect();
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { x: clientX - rect.left, y: clientY - rect.top };
          }

          canvas.addEventListener('pointerdown', function(e) {
            drawing = true;
            currentStroke = [getPos(e)];
          });
          canvas.addEventListener('pointermove', function(e) {
            if (!drawing) return;
            var pos = getPos(e);
            currentStroke.push(pos);
            ctx.strokeStyle = penColor;
            ctx.lineWidth = strokeWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            var prev = currentStroke[currentStroke.length - 2];
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
          });
          canvas.addEventListener('pointerup', function(e) {
            if (!drawing) return;
            drawing = false;
            if (currentStroke.length > 0) {
              strokes.push({ color: penColor, width: strokeWidth, points: currentStroke });
            }
            currentStroke = [];
          });

          window.clearCanvas = function() {
            strokes = [];
            currentStroke = [];
            redraw();
          };

          window.undoStroke = function() {
            strokes.pop();
            redraw();
          };

          window.setPenColor = function(color) {
            penColor = color;
          };

          window.exportSignature = function() {
            if (strokes.length === 0) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'EMPTY' }));
              return;
            }
            var dataUrl = canvas.toDataURL('image/png');
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SIGNATURE_EXPORT',
              dataUri: dataUrl
            }));
          };
        </script>
      </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SIGNATURE_EXPORT' && data.dataUri) {
        setIsExporting(false);
        onApply({ signatureDataUri: data.dataUri, position });
        onClose();
      } else if (data.type === 'EMPTY') {
        setIsExporting(false);
        Alert.alert('Empty Signature', 'Please draw your signature before placing.');
      } else {
        setIsExporting(false);
      }
    } catch (e) {
      console.warn('[signature] message error:', e);
      setIsExporting(false);
    }
  };

  const handleClear = () => {
    webViewRef.current?.injectJavaScript('window.clearCanvas(); true;');
  };

  const handleUndo = () => {
    webViewRef.current?.injectJavaScript('window.undoStroke(); true;');
  };

  const handleSelectColor = (color: string) => {
    setSelectedColor(color);
    webViewRef.current?.injectJavaScript(`window.setPenColor('${color}'); true;`);
  };

  const handleDone = () => {
    setIsExporting(true);
    webViewRef.current?.injectJavaScript('window.exportSignature(); true;');
    // Safety fallback timeout in case WebView bridge stalls
    setTimeout(() => {
      setIsExporting(false);
    }, 2500);
  };

  const handleSafeClose = () => {
    setIsExporting(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleSafeClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="pencil" size={20} color={COLORS.accent} />
              <Text style={[styles.modalTitle, { color: COLORS.text }]}>Draw Signature</Text>
            </View>
            <TouchableOpacity onPress={handleSafeClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          {/* Color & Undo Toolbar */}
          <View style={[styles.toolbarRow, { backgroundColor: COLORS.surface2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {PEN_COLORS.map(c => {
                const isSelected = selectedColor === c.hex;
                return (
                  <TouchableOpacity
                    key={c.hex}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c.hex },
                      isSelected && styles.colorDotSelected,
                    ]}
                    onPress={() => handleSelectColor(c.hex)}
                  />
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={handleUndo} style={styles.toolBtn}>
                <Ionicons name="arrow-undo-outline" size={18} color={COLORS.text} style={{ marginRight: 4 }} />
                <Text style={[styles.toolBtnText, { color: COLORS.text }]}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClear} style={styles.toolBtn}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 4 }} />
                <Text style={[styles.toolBtnText, { color: '#EF4444' }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Signature Canvas Pad */}
          <View style={styles.canvasWrapper}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: signatureHtml }}
              onMessage={handleMessage}
              scrollEnabled={false}
              style={styles.webView}
            />
            <View style={styles.signLine} pointerEvents="none" />
            <Text style={styles.signHint} pointerEvents="none">Sign on line above</Text>
          </View>

          {/* Placement Selector */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
            <Text style={[styles.sectionLabel, { color: COLORS.muted }]}>PLACEMENT ON PAGE</Text>
          </View>
          <View style={styles.placementRow}>
            {[
              { id: 'bottom-right', label: 'Bottom Right' },
              { id: 'center', label: 'Center' },
              { id: 'bottom-left', label: 'Bottom Left' },
            ].map(p => {
              const isCur = position === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.placementBtn,
                    { backgroundColor: COLORS.surface2, borderColor: isCur ? COLORS.accent : COLORS.border },
                    isCur && { borderWidth: 1.5, backgroundColor: COLORS.accent + '15' },
                  ]}
                  onPress={() => setPosition(p.id as any)}
                >
                  <Text style={[styles.placementText, { color: isCur ? COLORS.accent : COLORS.text }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer Actions */}
          <View style={[styles.footerRow, { borderTopColor: COLORS.border }]}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: COLORS.border }]} onPress={handleSafeClose}>
              <Text style={[styles.cancelBtnText, { color: COLORS.muted }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: COLORS.accent }]}
              onPress={handleDone}
              disabled={isExporting}
              activeOpacity={0.85}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.applyBtnText}>Place Signature</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  colorDotSelected: {
    borderWidth: 2.5,
    borderColor: '#3B82F6',
    transform: [{ scale: 1.2 }],
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toolBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  canvasWrapper: {
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  signLine: {
    position: 'absolute',
    bottom: 36,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  signHint: {
    position: 'absolute',
    bottom: 16,
    right: 24,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  placementRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  placementBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  placementText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  applyBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
