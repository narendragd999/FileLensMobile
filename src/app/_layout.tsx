/**
 * _layout.tsx — Root navigation layout.
 *
 * Sets up the bottom tab navigator and applies the global dark theme.
 */

import React from 'react';
import { Buffer } from 'buffer';

// Ensure Buffer is globally accessible across all services & components
if (typeof (global as any).Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme, View, Text, AppState, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { NativeScaleButton } from '../components/NativeScaleButton';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';


import { useThemeColors } from '../utils/theme';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { MotionSpring } from '../utils/motion';
import { useStore } from '../store/useStore';
import { initOcr, ocrImage } from '../services/ocrService';
import { initializeSemanticKnowledge } from '../services/semanticKnowledgeService';
import { useShareIntent } from 'expo-share-intent';
import { addIndexTarget, getIndexStats, refreshIndexStats } from '../services/database';
import { startIndexing, indexSingleFile, cancelIndexing, processPendingHeavyFiles, renderPdfPage } from '../services/indexerService';
import { extractContent } from '../services/contentExtractor';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { triggerAutoDownloadIfMissing } from '../services/semanticAiModelService';
import { classifyIncomingIntent } from '../services/semanticExtensionsService';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { getDatabase } from '../services/database';

// Hold the splash screen visible until SQLite database and stats are ready
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function prepare() {
      try {
        await getDatabase();
        await refreshIndexStats().catch(() => {});
      } catch (e) {
        console.warn('[RootLayout] Error during database prep:', e);
      } finally {
        if (active) {
          setAppIsReady(true);
          await SplashScreen.hideAsync().catch(() => {});
        }
      }
    }

    // Safety fallback: guarantee splash screen hides within 1.5s
    const fallbackTimer = setTimeout(() => {
      if (active) {
        setAppIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 1500);

    prepare();

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
    };
  }, []);

  return (
    <AppErrorBoundary>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <RootLayoutInner />
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

function AnimatedTabIcon({
  name,
  size,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  focused: boolean;
}) {
  const scale = useSharedValue(focused ? 1.12 : 1.0);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1.0, MotionSpring.bouncy);
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

function RootLayoutInner() {
  const router = useRouter();
  const theme = useStore(state => state.theme);
  const setIsIndexing = useStore(state => state.setIsIndexing);
  const setIndexProgress = useStore(state => state.setIndexProgress);
  const isDark = theme === 'dark';
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  // Safe bottom clearance: if insets.bottom is reported (e.g. 48 on 3-button, 20-34 on gesture/iOS), use it.
  // If insets.bottom is 0 or small on Android, guarantee a safe floor of 24dp so 3-button nav never covers content.
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 0);

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    scheme: 'filelenspro',
    resetOnBackground: false,
  });

  // Themed Alert State for Shared Intent choices
  const [shareAlertConfig, setShareAlertConfig] = React.useState<{
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

  const handledIntentKeyRef = React.useRef<string>('');
  const isProcessingIntentRef = React.useRef<boolean>(false);

  const clearCurrentShareIntent = React.useCallback(() => {
    handledIntentKeyRef.current = '';
    isProcessingIntentRef.current = false;
    resetShareIntent();
  }, [resetShareIntent]);

  React.useEffect(() => {
    // Initialize OCR engine quietly in background
    initOcr().catch(e => console.warn('Failed to init OCR:', e));

    // Auto-download multilingual semantic AI model quietly in background on app launch
    triggerAutoDownloadIfMissing().catch(e => console.warn('[SemanticAI] Auto-download defer:', e));

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // When app returns to foreground, sync stats quietly
        setTimeout(async () => {
          try {
            await refreshIndexStats();
            const stats = await getIndexStats();
            useStore.getState().setStats({
              totalFiles: stats.totalFiles,
              ocrDone: stats.ocrDone,
              ocrPending: stats.ocrPending,
            });
          } catch (e) {
            console.warn('[layout] Foreground stats sync failed:', e);
          }
        }, 1200);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Cold-start share intent safety check:
  // If FileLens Pro was closed when shared into, trigger native module query
  // to ensure any pending intent is delivered once the UI tree is ready.
  React.useEffect(() => {
    const t1 = setTimeout(() => {
      try {
        const mod = require('expo-share-intent/build/ExpoShareIntentModule')?.default;
        mod?.getShareIntent?.('');
      } catch (e) {}
    }, 350);

    const t2 = setTimeout(() => {
      try {
        const mod = require('expo-share-intent/build/ExpoShareIntentModule')?.default;
        mod?.getShareIntent?.('');
      } catch (e) {}
    }, 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  React.useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;

    const hasFiles = Array.isArray(shareIntent.files) && shareIntent.files.length > 0;
    const hasText = !!(shareIntent.text || shareIntent.webUrl);

    // If native module is still reading the intent data asynchronously, wait for it!
    if (!hasFiles && !hasText) {
      return;
    }

    const currentKey = hasFiles
      ? (shareIntent.files![0]?.path || (shareIntent.files![0] as any)?.contentUri || (shareIntent.files![0] as any)?.filePath || shareIntent.files![0]?.fileName || '')
      : (shareIntent.text || shareIntent.webUrl || '');

    if (!currentKey || handledIntentKeyRef.current === currentKey || isProcessingIntentRef.current) {
      return;
    }

    handledIntentKeyRef.current = currentKey;
    isProcessingIntentRef.current = true;

    (async () => {
      try {
        if (hasFiles) {
          const file = shareIntent.files![0] as any;
          const rawPath = file?.contentUri || file?.filePath || file?.path;
          if (!rawPath) {
            console.warn('[layout] No path found in shareIntent file:', file);
            clearCurrentShareIntent();
            return;
          }

          const fileUri = rawPath.startsWith('file://') || rawPath.startsWith('content://')
            ? rawPath
            : `file://${rawPath}`;

          let ext = '';
          if (file.fileName && file.fileName.includes('.')) {
            ext = file.fileName.split('.').pop()?.toLowerCase() || '';
          }
          if (!ext && file.mimeType) {
            const mime = file.mimeType.toLowerCase();
            if (mime.includes('pdf')) ext = 'pdf';
            else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
            else if (mime.includes('png')) ext = 'png';
            else if (mime.includes('image/')) ext = 'jpg';
            else if (mime.includes('text/')) ext = 'txt';
          }
          if (!ext) ext = 'pdf';

          let baseName = file.fileName || 'shared_file';
          if (ext && baseName.toLowerCase().endsWith(`.${ext}`)) {
            baseName = baseName.substring(0, baseName.lastIndexOf('.'));
          }

          const safeFileName = `${baseName.replace(/[^a-zA-Z0-9.\-]/g, '_')}.${ext}`;
          let localUri = `${FileSystem.documentDirectory}share_${Date.now()}_${safeFileName}`;

          try {
            await FileSystem.copyAsync({ from: fileUri, to: localUri });
          } catch (copyErr) {
            console.warn('[layout] copyAsync failed, trying base64 fallback:', copyErr);
            try {
              const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
              await FileSystem.writeAsStringAsync(localUri, b64, { encoding: FileSystem.EncodingType.Base64 });
            } catch (fallbackErr) {
              console.warn('[layout] base64 fallback failed, using direct fileUri:', fallbackErr);
              localUri = fileUri;
            }
          }

          const fileDisplayName = file.fileName || safeFileName;
          const multipleCountText = (shareIntent.files?.length || 0) > 1 ? ` (and ${shareIntent.files!.length - 1} more)` : '';
          const isImg = ext === 'jpg' || ext === 'jpeg' || ext === 'png';

          let fileIntentRec: { target: 'brain' | 'card'; confidence: number; suggestedTitle: string } | null = null;
          try {
            fileIntentRec = await classifyIncomingIntent(fileDisplayName, isImg || ext === 'pdf');
          } catch {}

          const isCardRec = fileIntentRec ? fileIntentRec.target === 'card' : true;
          const isBrainRec = fileIntentRec ? fileIntentRec.target === 'brain' : false;

          const cancelBtn: AlertButton = {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setShareAlertConfig(c => ({ ...c, visible: false }));
              clearCurrentShareIntent();
            },
          };

          const cardBtn: AlertButton = {
            text: isCardRec ? '📄 Add to Card ⭐ (Recommended)' : '📄 Add to Card',
            style: 'default',
            onPress: () => {
              setShareAlertConfig(c => ({ ...c, visible: false }));
              clearCurrentShareIntent();
              router.push(`/create-card?fileUri=${encodeURIComponent(localUri)}&fileName=${encodeURIComponent(safeFileName)}`);
            },
          };

          const brainBtn: AlertButton = {
            text: isBrainRec ? '🧠 Schedule in Brain ⭐ (Recommended)' : '🧠 Schedule in Brain',
            style: 'default',
            onPress: async () => {
              setShareAlertConfig(c => ({ ...c, visible: false }));
              clearCurrentShareIntent();
              let extracted = '';
              if (isImg) {
                try {
                  const ocrRes = await ocrImage(localUri);
                  extracted = ocrRes?.text || '';
                } catch (ocrErr) {
                  console.warn('[layout] OCR on shared image failed:', ocrErr);
                }
              } else if (ext === 'pdf') {
                try {
                  const contentRes = await extractContent(localUri);
                  extracted = contentRes?.text || '';
                  if (!extracted) {
                    const pageImg = await renderPdfPage(localUri, 0);
                    if (pageImg) {
                      const ocrRes = await ocrImage(pageImg);
                      extracted = ocrRes?.text || '';
                    }
                  }
                } catch (pdfErr) {
                  console.warn('[layout] Text extract on shared PDF failed:', pdfErr);
                }
              } else {
                try {
                  const contentRes = await extractContent(localUri);
                  extracted = contentRes?.text || '';
                } catch (cErr) {
                  console.warn('[layout] Extract on shared file failed:', cErr);
                }
              }
              router.push({
                pathname: '/second-brain',
                params: {
                  sharedText: encodeURIComponent(extracted || safeFileName),
                  sharedImageUri: isImg ? encodeURIComponent(localUri) : undefined,
                },
              });
            },
          };

          const fileActionButtons: AlertButton[] = isBrainRec
            ? [cancelBtn, brainBtn, cardBtn]
            : [cancelBtn, cardBtn, brainBtn];

          setShareAlertConfig({
            visible: true,
            title: 'Shared File Received',
            message: `Choose how to use "${fileDisplayName}"${multipleCountText} in FileLens Pro:`,
            icon: 'document-text',
            iconColor: '#3B82F6',
            buttons: fileActionButtons,
          });
        } else if (hasText) {
          const rawText = shareIntent.text || '';
          const rawUrl = shareIntent.webUrl || '';
          let fullSharedText = rawText.trim();
          if (rawUrl && !fullSharedText.includes(rawUrl)) {
            fullSharedText = fullSharedText ? `${fullSharedText}\n${rawUrl}` : rawUrl;
          }

          if (!fullSharedText) {
            clearCurrentShareIntent();
            return;
          }

          const previewSnippet = fullSharedText.length > 90
            ? `${fullSharedText.substring(0, 90)}...`
            : fullSharedText;

          let textIntentRec: { target: 'brain' | 'card'; confidence: number; suggestedTitle: string } | null = null;
          try {
            textIntentRec = await classifyIncomingIntent(fullSharedText, false);
          } catch {}

          const isTextBrainRec = textIntentRec ? textIntentRec.target === 'brain' : true;
          const isTextCardRec = textIntentRec ? textIntentRec.target === 'card' : false;

          const textCancelBtn: AlertButton = {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setShareAlertConfig(c => ({ ...c, visible: false }));
              clearCurrentShareIntent();
            },
          };

          const textCardBtn: AlertButton = {
            text: isTextCardRec ? '📄 Add to Card ⭐ (Recommended)' : '📄 Add to Card',
            style: 'default',
            onPress: async () => {
              setShareAlertConfig(c => ({ ...c, visible: false }));
              clearCurrentShareIntent();
              try {
                const noteFileUri = `${FileSystem.documentDirectory}shared_note_${Date.now()}.txt`;
                await FileSystem.writeAsStringAsync(noteFileUri, fullSharedText);
                router.push(`/create-card?fileUri=${encodeURIComponent(noteFileUri)}&fileName=${encodeURIComponent('Shared Note')}`);
              } catch (noteErr) {
                router.push('/create-card');
              }
            },
          };

          const textBrainBtn: AlertButton = {
            text: isTextBrainRec ? '🧠 Schedule in Brain ⭐ (Recommended)' : '🧠 Schedule in Brain',
            style: 'default',
            onPress: () => {
              setShareAlertConfig(c => ({ ...c, visible: false }));
              clearCurrentShareIntent();
              router.push({
                pathname: '/second-brain',
                params: {
                  sharedText: encodeURIComponent(fullSharedText),
                },
              });
            },
          };

          const textActionButtons: AlertButton[] = isTextCardRec
            ? [textCancelBtn, textCardBtn, textBrainBtn]
            : [textCancelBtn, textBrainBtn, textCardBtn];

          setShareAlertConfig({
            visible: true,
            title: 'Shared Content Received',
            message: `"${previewSnippet}"\n\nChoose how you want to use this in FileLens Pro:`,
            icon: 'share-social',
            iconColor: '#3B82F6',
            buttons: textActionButtons,
          });
        }
      } catch (err) {
        console.warn('[layout] Error handling share intent:', err);
        clearCurrentShareIntent();
      }
    })();
  }, [hasShareIntent, shareIntent]);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" backgroundColor="transparent" translucent={true} />
      {/* Hidden WebView for OCR — loaded once, runs OCR engine in background */}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: COLORS.surface,
            borderTopWidth: 0,
            borderTopColor: 'transparent',
            elevation: 0,
            shadowOpacity: 0,
            height: 54 + safeBottom,
            paddingBottom: Math.max(safeBottom, 6),
            paddingTop: 4,
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
        }}
      >
        <Tabs.Screen
          name="documents"
          options={{
            title: 'Scans & Docs',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon name="documents-outline" size={size} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="second-brain"
          options={{
            title: 'Brain',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon name="mic-circle" size={size} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Search',
            tabBarButton: (props) => (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
                <NativeScaleButton
                  onPress={props.onPress}
                  activeScale={0.88}
                  hapticType="medium"
                  style={{
                    top: -18,
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: COLORS.accent,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 3,
                    borderColor: COLORS.surface,
                    elevation: 8,
                    shadowColor: COLORS.accent,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.45,
                    shadowRadius: 8,
                  }}
                  accessibilityLabel="Search Files and Documents"
                >
                  <Ionicons name="search" size={24} color="#FFFFFF" />
                </NativeScaleButton>
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '700',
                    color: props.accessibilityState?.selected ? COLORS.accent : COLORS.muted,
                    marginTop: -11,
                  }}
                >
                  Search
                </Text>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: 'Cards',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon name="card" size={size} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon name="settings" size={size} color={color} focused={focused} />
            ),
          }}
        />
        {/* Hidden sub-screens & modals — NOT in the tab bar */}
        <Tabs.Screen
          name="saved-searches"
          options={{
            title: 'Saved Searches',
            href: null,
          }}
        />
        <Tabs.Screen
          name="bookmarks"
          options={{
            title: 'Bookmarks',
            href: null,
          }}
        />
        <Tabs.Screen
          name="doc-scanner"
          options={{
            title: 'Scanner',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="page-organizer"
          options={{
            title: 'Page Organizer',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="create-card"
          options={{
            title: 'Create Card',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="pdf-viewer"
          options={{
            title: 'PDF Viewer',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />

        <Tabs.Screen
          name="scanner"
          options={{
            title: 'Scanner',
            href: null,
          }}
        />
        <Tabs.Screen
          name="file-manager"
          options={{
            title: 'File Manager',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="file-analyser"
          options={{
            title: 'File Analyser',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="license"
          options={{
            title: 'License',
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>

      {/* Persistent Cold-Start Safe Intent Share Action Dialog */}
      <ThemedAlertModal
        visible={shareAlertConfig.visible}
        title={shareAlertConfig.title}
        message={shareAlertConfig.message}
        icon={shareAlertConfig.icon}
        iconColor={shareAlertConfig.iconColor}
        buttons={shareAlertConfig.buttons}
        onClose={() => {
          setShareAlertConfig(c => ({ ...c, visible: false }));
          clearCurrentShareIntent();
        }}
      />
    </ThemeProvider>
  );
}
