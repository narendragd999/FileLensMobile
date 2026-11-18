/**
 * pdf-viewer.tsx — Fallback route handler for /pdf-viewer
 *
 * Ensures backward compatibility with any links or intents targeting /pdf-viewer.
 * Automatically forwards to /documents with openDocUri.
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../utils/theme';

export default function PdfViewerFallbackScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ fileUri?: string; fileName?: string; uri?: string }>();

  useEffect(() => {
    const targetUri = params.fileUri || params.uri;
    if (targetUri) {
      router.replace({
        pathname: '/documents',
        params: { openDocUri: targetUri },
      });
    } else {
      router.replace('/documents');
    }
  }, [params.fileUri, params.uri]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.loadingText, { color: colors.muted }]}>Opening Document...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
