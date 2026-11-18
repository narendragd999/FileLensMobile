/**
 * cacheCleanerService.ts — Scans and clears temporary junk cache.
 *
 * Targets:
 *   - Rendered PDF page image caches
 *   - Camera & scan temporary draft crops
 *   - Temporary export zip buffers & split pages
 *   - Thumbnail cache files
 */

import * as FileSystem from 'expo-file-system/legacy';
import { clearPdfCache, getStorageStats } from 'expo-pdf-to-image';

export interface JunkCacheStats {
  fileCount: number;
  totalBytes: number;
  items: {
    name: string;
    path: string;
    size: number;
  }[];
}

export async function getJunkCacheStats(): Promise<JunkCacheStats> {
  const items: { name: string; path: string; size: number }[] = [];
  let totalBytes = 0;

  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir) {
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      for (const f of files) {
        // Skip critical hidden app database/lock directories if any
        if (f.startsWith('.') || f.includes('sqlite')) continue;

        const fullPath = `${cacheDir}${f}`;
        try {
          const info = await FileSystem.getInfoAsync(fullPath);
          if (info.exists && !info.isDirectory) {
            const sz = info.size || 0;
            totalBytes += sz;
            items.push({
              name: f,
              path: fullPath,
              size: sz,
            });
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[cacheCleaner] getJunkCacheStats warning:', e);
  }

  // Also include native app cache stats if greater
  try {
    const nativeStats = await getStorageStats();
    if (nativeStats.appCacheBytes > totalBytes) {
      totalBytes = nativeStats.appCacheBytes;
    }
  } catch {}

  return {
    fileCount: items.length,
    totalBytes,
    items,
  };
}

export async function cleanJunkCache(): Promise<{ deleted: number; freedBytes: number }> {
  let deleted = 0;
  let freedBytes = 0;

  // 1. Clear native PDF render memory & disk cache
  try {
    await clearPdfCache();
  } catch (e) {
    console.warn('[cacheCleaner] clearPdfCache warning:', e);
  }

  // 2. Clear JavaScript / Expo cacheDirectory files
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir) {
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      for (const f of files) {
        if (f.startsWith('.') || f.includes('sqlite')) continue;
        const fullPath = `${cacheDir}${f}`;
        try {
          const info = await FileSystem.getInfoAsync(fullPath);
          if (info.exists) {
            const sz = info.size || 0;
            await FileSystem.deleteAsync(fullPath, { idempotent: true });
            deleted++;
            freedBytes += sz;
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[cacheCleaner] cleanJunkCache error:', e);
  }

  return { deleted, freedBytes };
}
