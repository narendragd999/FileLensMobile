import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useThemeColors } from '../utils/theme';
import { MotionTiming } from '../utils/motion';
import { NativeScaleButton } from './NativeScaleButton';
import { ExportFormat, exportContent } from '../services/exportService';
import { structureOcrText, AI_PRESETS, getAiConfig, acceptAiAgreement } from '../services/aiService';
import { ThemedAlertModal, AlertButton } from './ThemedAlertModal';

interface ExportModalProps {
  visible: boolean;
  onClose: () => void;
  content: string;
  defaultFileName: string;
  imageUri?: string | null;
}

type ExportMethod = 'raw' | 'ai';

export const ExportModal: React.FC<ExportModalProps> = ({ visible, onClose, content, defaultFileName, imageUri }) => {
  const COLORS = useThemeColors();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [format, setFormat] = useState<ExportFormat>('docx');
  const [method, setMethod] = useState<ExportMethod>('raw');
  const [presetIndex, setPresetIndex] = useState<number>(0);
  const [isExporting, setIsExporting] = useState(false);
  const [includeVision, setIncludeVision] = useState(false);

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
      buttons: buttons || [{ text: 'OK', style: 'default', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }],
      icon: options?.icon || 'information-circle',
      iconColor: options?.iconColor || COLORS.accent,
    });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let finalOutput = content;

      if (method === 'ai') {
        const config = await getAiConfig();
        
        // Ensure they have agreed to privacy
        if (!config.agreed) {
          const agreed = await new Promise<boolean>((resolve) => {
            showAlert(
              'Privacy Agreement',
              'AI-Powered export sends your document text to a third-party AI provider to structure it. This means your text leaves the device. Do you agree to proceed?',
              [
                { text: 'Decline', style: 'cancel', onPress: () => { hideAlert(); resolve(false); } },
                { text: 'I Agree', style: 'destructive', onPress: async () => {
                    hideAlert();
                    await acceptAiAgreement();
                    resolve(true);
                }}
              ],
              { icon: 'shield-checkmark', iconColor: COLORS.accent }
            );
          });
          
          if (!agreed) {
            setIsExporting(false);
            return;
          }
        }

        const aiFormat = format === 'docx' ? 'markdown' : 'csv';
        const overrideConfig = {
          url: AI_PRESETS[presetIndex].url,
          model: AI_PRESETS[presetIndex].model,
        };

        finalOutput = await structureOcrText(content, aiFormat, overrideConfig, includeVision ? (imageUri || undefined) : undefined);
      }

      await exportContent(finalOutput, format, defaultFileName);
      onClose();
    } catch (e: any) {
      showAlert('Export Failed', e.message || 'Unknown error occurred.', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'alert-circle', iconColor: COLORS.danger });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(MotionTiming.quick)}
        exiting={FadeOut.duration(MotionTiming.quick)}
        style={styles.modalOverlay}
      >
        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(260)}
          exiting={SlideOutDown.duration(MotionTiming.quick)}
          style={styles.modalContent}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Export Options</Text>
            <NativeScaleButton onPress={onClose} disabled={isExporting} activeScale={0.88}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </NativeScaleButton>
          </View>

          {/* Format Selection */}
          <Text style={styles.sectionTitle}>1. Choose Format</Text>
          <View style={styles.row}>
            {(['docx', 'xlsx', 'csv'] as ExportFormat[]).map((fmt) => (
              <NativeScaleButton
                key={fmt}
                style={[styles.choiceBtn, format === fmt && styles.choiceBtnActive]}
                activeScale={0.93}
                onPress={() => setFormat(fmt)}
              >
                <Text style={[styles.choiceText, format === fmt && styles.choiceTextActive]}>
                  {fmt.toUpperCase()}
                </Text>
              </NativeScaleButton>
            ))}
          </View>

          {/* Method Selection */}
          <Text style={styles.sectionTitle}>2. Processing Method</Text>
          <View style={styles.row}>
            <NativeScaleButton
              style={[styles.choiceBtn, method === 'raw' && styles.choiceBtnActive]}
              activeScale={0.93}
              onPress={() => setMethod('raw')}
            >
              <Text style={[styles.choiceText, method === 'raw' && styles.choiceTextActive]}>
                Raw (As-Is)
              </Text>
            </NativeScaleButton>
            <NativeScaleButton
              style={[styles.choiceBtn, method === 'ai' && styles.choiceBtnActive]}
              activeScale={0.93}
              onPress={() => setMethod('ai')}
            >
              <Text style={[styles.choiceText, method === 'ai' && styles.choiceTextActive]}>
                Structured (AI)
              </Text>
            </NativeScaleButton>
          </View>

          {/* AI Model Selection */}
          {method === 'ai' && (
            <>
              <Text style={styles.sectionTitle}>3. AI Model (for this export)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
                {AI_PRESETS.map((preset, idx) => (
                  <NativeScaleButton
                    key={idx}
                    style={[styles.presetBtn, presetIndex === idx && styles.choiceBtnActive]}
                    activeScale={0.93}
                    onPress={() => setPresetIndex(idx)}
                  >
                    <Text style={[styles.presetText, presetIndex === idx && styles.choiceTextActive]}>
                      {preset.name}
                    </Text>
                  </NativeScaleButton>
                ))}
              </ScrollView>
              <Text style={styles.hintText}>
                The AI will attempt to extract tabular data for Excel/CSV, or nicely format the document for Word.
              </Text>
              
              {imageUri && (
                <NativeScaleButton 
                  style={styles.toggleRow} 
                  onPress={() => setIncludeVision(!includeVision)}
                  activeScale={0.97}
                >
                  <Ionicons 
                    name={includeVision ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={includeVision ? COLORS.accent : COLORS.muted} 
                  />
                  <Text style={[styles.toggleText, includeVision && { color: COLORS.text }]}>
                    🖼️ Include original image for precise layout (Requires Vision model)
                  </Text>
                </NativeScaleButton>
              )}
            </>
          )}

          <NativeScaleButton
            style={styles.exportActionBtn}
            onPress={handleExport}
            disabled={isExporting}
            activeScale={0.95}
            hapticType="medium"
          >
            {isExporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.exportActionText}>Export Document</Text>
            )}
          </NativeScaleButton>
        </Animated.View>
      </Animated.View>

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
    </Modal>
  );
};

const getStyles = (COLORS: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 12,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  choiceBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  choiceBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  choiceText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  choiceTextActive: {
    color: '#fff',
  },
  presetScroll: {
    marginTop: 8,
    marginBottom: 8,
  },
  presetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: 8,
  },
  presetText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  hintText: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  exportActionBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  exportActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
});
