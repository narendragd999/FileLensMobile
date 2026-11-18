import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useThemeColors } from '../utils/theme';
import { renderPdfToImages } from '../services/indexerService';

interface SafePdfViewProps {
  uri: string;
  style?: any;
  colors?: any;
  horizontal?: boolean;
  showOpenButton?: boolean;
  onOpenFull?: () => void;
  maxPagesToLoad?: number;
}

export function SafePdfView({
  uri,
  style,
  colors: customColors,
  horizontal = false,
  showOpenButton = true,
  onOpenFull,
  maxPagesToLoad = 20,
}: SafePdfViewProps) {
  const themeColors = useThemeColors();
  const colors = customColors || themeColors;
  const router = useRouter();

  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get('window').width);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    let localCacheCopy: string | null = null;

    const loadPages = async () => {
      if (!uri) {
        setError('No PDF file provided');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPages([]);

      try {
        let finalUri = uri;
        if (finalUri.startsWith('content://')) {
          const cleanHash = Math.abs(finalUri.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
          const cachePath = `${FileSystem.cacheDirectory}pdf_preview_${cleanHash}.pdf`;
          const info = await FileSystem.getInfoAsync(cachePath);
          if (!info.exists) {
            await FileSystem.copyAsync({ from: finalUri, to: cachePath });
          }
          finalUri = cachePath;
          localCacheCopy = cachePath;
        }

        // Render first batch of pages using native Android OS PdfRenderer
        const rendered = await renderPdfToImages(finalUri, undefined, 0, maxPagesToLoad, 1800);
        if (!isMountedRef.current) return;

        if (rendered && rendered.length > 0) {
          setPages(rendered);
        } else {
          setError('Unable to load document pages.');
        }
      } catch (err: any) {
        if (isMountedRef.current) {
          console.warn('[SafePdfView] Error rendering PDF:', err);
          setError(err?.message || 'Failed to render PDF preview');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadPages();

    return () => {
      isMountedRef.current = false;
    };
  }, [uri, maxPagesToLoad]);

  const handleOpenInEditor = () => {
    if (onOpenFull) {
      onOpenFull();
      return;
    }
    router.push({
      pathname: '/documents',
      params: {
        openDocUri: encodeURIComponent(uri),
        t: String(Date.now()),
      },
    } as any);
  };

  const handleShareExternal = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (_) {}
  };

  if (loading) {
    return (
      <View style={[styles.centerBox, { backgroundColor: colors.surface }, style]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Loading Document Preview...</Text>
      </View>
    );
  }

  if (error || pages.length === 0) {
    return (
      <View style={[styles.centerBox, { backgroundColor: colors.surface, padding: 24 }, style]}>
        <Ionicons name="document-text-outline" size={54} color={colors.muted} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>PDF Preview</Text>
        <Text style={[styles.errorSubtitle, { color: colors.muted }]}>
          {error || 'Tap below to view full document.'}
        </Text>
        <View style={styles.actionBtnRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            onPress={handleOpenInEditor}
            activeOpacity={0.8}
          >
            <Ionicons name="eye-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.primaryBtnText}>Open Document</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            onPress={handleShareExternal}
            activeOpacity={0.8}
          >
            <Ionicons name="share-outline" size={18} color={colors.text} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Open With</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.bg }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setContainerWidth(w);
      }}
    >
      <FlatList
        data={pages}
        keyExtractor={(_, index) => `safe_pdf_p_${index}`}
        horizontal={horizontal}
        pagingEnabled={horizontal}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={true}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        contentContainerStyle={styles.listContent}
        onMomentumScrollEnd={(e) => {
          if (horizontal) {
            const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
            setCurrentPage(idx + 1);
          }
        }}
        renderItem={({ item: pageUri, index }) => (
          <View style={[styles.pageWrapper, { width: containerWidth }]}>
            <Image
              source={{ uri: pageUri }}
              style={styles.pageImage}
              resizeMode="contain"
              fadeDuration={0}
            />
            {!horizontal && pages.length > 1 && (
              <View style={[styles.pageIndexBadge, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.pageIndexText, { color: colors.muted }]}>
                  Page {index + 1} of {pages.length}
                </Text>
              </View>
            )}
          </View>
        )}
      />

      {/* Floating Toolbar with Full Screen / Open and Page Indicator */}
      <View style={styles.floatingTopBar} pointerEvents="box-none">
        {pages.length > 1 && horizontal && (
          <View style={[styles.floatingPagePill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <Text style={styles.floatingPageText}>
              {currentPage} / {pages.length}
            </Text>
          </View>
        )}

        {showOpenButton && (
          <TouchableOpacity
            style={[styles.floatingOpenBtn, { backgroundColor: colors.accent }]}
            onPress={handleOpenInEditor}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="expand-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
            <Text style={styles.floatingOpenBtnText}>Open Document</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  centerBox: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  pageWrapper: {
    flex: 1,
    minHeight: 400,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  pageImage: {
    width: '95%',
    height: '100%',
    minHeight: 380,
  },
  pageIndexBadge: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
  },
  pageIndexText: {
    fontSize: 11,
    fontWeight: '600',
  },
  floatingTopBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  floatingPagePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  floatingPageText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  floatingOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  floatingOpenBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
