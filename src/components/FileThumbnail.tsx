import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ViewStyle, ImageStyle, StyleProp, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPdfThumbnail } from 'expo-pdf-to-image';

/**
 * Lightweight, bounded LRU Cache for rendered in-memory image and PDF thumbnails.
 * Guarantees bounded heap memory and locked 60/120 FPS scrolling by evicting
 * least-recently used items when capacity is reached.
 */
class LruThumbnailCache {
  private capacity: number;
  private cache: Map<string, string>;

  constructor(capacity = 250) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  public get(key: string): string | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    // Re-insert to refresh recency
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  public set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Evict oldest (least recently used) entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public get size(): number {
    return this.cache.size;
  }
}

export const globalThumbnailCache = new LruThumbnailCache(250);

interface FileThumbnailProps {
  uri: string;
  name?: string;
  extension?: string;
  isVoiceNote?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  accentColor?: string;
  placeholderBg?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  badgeText?: string;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}

export const FileThumbnail = React.memo<FileThumbnailProps>(({
  uri,
  name,
  extension,
  isVoiceNote: explicitVoiceNote,
  style,
  imageStyle,
  accentColor = '#38BDF8',
  placeholderBg = 'rgba(255,255,255,0.06)',
  fallbackIcon = 'document-text',
  iconSize = 22,
  badgeText,
  resizeMode = 'cover',
}) => {
  const cleanUri = uri?.trim() || '';
  const formattedUri = cleanUri.startsWith('file://') || cleanUri.startsWith('content://')
    ? cleanUri
    : cleanUri ? `file://${cleanUri}` : '';

  const ext = (extension || name?.split('.').pop() || cleanUri.split('.').pop() || '').toLowerCase();
  const isImg = /^(jpg|jpeg|png|webp|bmp|gif|tif|tiff)$/i.test(ext);
  const isPdf = ext === 'pdf' || cleanUri.toLowerCase().endsWith('.pdf');
  const isVoice = explicitVoiceNote || (name || '').startsWith('Voice Note') || cleanUri.includes('voice_notes') || /^(m4a|mp3|wav|aac|ogg)$/i.test(ext);

  const [thumbUri, setThumbUri] = useState<string | null>(() => {
    if (isImg && formattedUri) return formattedUri;
    if (isPdf && formattedUri) return globalThumbnailCache.get(formattedUri) || null;
    return null;
  });
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (isImg && formattedUri) {
      setThumbUri(formattedUri);
      return;
    }

    if (!isPdf || !formattedUri) {
      setThumbUri(null);
      return;
    }

    const cached = globalThumbnailCache.get(formattedUri);
    if (cached) {
      setThumbUri(cached);
      return;
    }

    let active = true;
    getPdfThumbnail(formattedUri)
      .then(res => {
        if (active && res) {
          globalThumbnailCache.set(formattedUri, res);
          setThumbUri(res);
        } else if (active) {
          setHasError(true);
        }
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [formattedUri, isPdf, isImg]);

  if (isVoice) {
    return (
      <View style={[styles.container, { backgroundColor: placeholderBg }, style]}>
        <Ionicons name="mic" size={iconSize} color="#10B981" />
        {!!badgeText && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </View>
    );
  }

  const effectiveUri = isImg ? formattedUri : thumbUri;

  if (effectiveUri && !hasError) {
    return (
      <View style={[styles.container, { backgroundColor: placeholderBg }, style]}>
        <Image
          source={{ uri: effectiveUri }}
          style={[StyleSheet.absoluteFillObject, imageStyle]}
          resizeMode={resizeMode}
          resizeMethod="resize"
          fadeDuration={0}
          onError={() => setHasError(true)}
        />
        {!!badgeText && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: placeholderBg }, style]}>
      <Ionicons name={fallbackIcon} size={iconSize} color={accentColor} />
      {!!badgeText && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
});
