/**
 * indexerService.ts â€” Orchestrates file indexing.
 *
 * Walks the device's MediaStore, extracts text content from each file,
 * OCRs images, and inserts everything into the SQLite + FTS5 database.
 *
 * This mirrors the desktop FileLensPro `indexer/indexer.py` (IndexWorker).
 * On mobile, indexing runs in the foreground with a progress notification
 * (Android's WorkManager constraints make background indexing unreliable).
 */

import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Platform, PermissionsAndroid } from 'react-native';
import {
  getDatabase,
  upsertFile, 
  getIndexStats, 
  addIndexTarget, 
  getIndexTargets, 
  getFileMetadataByUri,
  getFileMetadataByNameAndSize,
  getPendingContentFiles,
  getPendingOcrFiles,
  refreshIndexStats,
  saveFileChunkEmbeddings,
  getFilesMissingEmbeddings
} from './database';
import { extractContent, MAX_DOCUMENT_TEXT_LENGTH } from './contentExtractor';
import { ocrImage, fastDetectHasText } from './ocrService';
import { autoCategorizeFile, autoCategorizeAllIndexedFiles } from '../utils/autoCategorizer';
import { convertKrutiDev, isLikelyKrutiDev } from '../utils/krutiDevConverter';
import { IMAGE_EXTENSIONS, ALL_ACCEPTED_EXTENSIONS, EXCLUDED_CODE_AND_SYSTEM_EXTENSIONS, EXCLUDED_FOLDER_NAMES } from '../utils/constants';
import { useStore } from '../store/useStore';
import { chunkText } from '../utils/textChunker';
import { generateEmbedding } from './embeddingService';
import { learnFromDocumentText, initializeSemanticKnowledge } from './semanticKnowledgeService';
import { requireNativeModule } from 'expo-modules-core';

let expoPdfToImageNative: any = null;
try {
  expoPdfToImageNative = requireNativeModule('ExpoPdfToImage');
} catch (e) {
  console.warn('[indexer] ExpoPdfToImage native module init warning:', e);
}

const pdfRenderCache = new Map<string, string[]>();

export async function renderPdfToImages(
  pdfUri: string,
  rotations?: number[],
  offset?: number,
  limit?: number,
  maxDim?: number
): Promise<string[]> {
  const isRange = offset !== undefined || limit !== undefined;
  const isAllZero = !rotations || rotations.length === 0 || rotations.every(r => (r % 360) === 0);
  const rotKey = isAllZero ? '0' : rotations.map(r => ((r % 360) + 360) % 360).join(',');
  const cacheKey = `${pdfUri}_${rotKey}_${maxDim || 'def'}`;
  if (!isRange && pdfRenderCache.has(cacheKey)) {
    const cached = pdfRenderCache.get(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  if (expoPdfToImageNative && typeof expoPdfToImageNative.renderPdfToImages === 'function') {
    try {
      const results = await expoPdfToImageNative.renderPdfToImages(
        pdfUri,
        rotations || null,
        offset ?? null,
        limit ?? null,
        maxDim ?? null
      );
      if (!isRange && results && results.length > 0) {
        pdfRenderCache.set(cacheKey, results);
      }
      return results || [];
    } catch (e) {
      console.warn('[indexer] renderPdfToImages error:', e);
      return [];
    }
  }
  return [];
}

export async function renderPdfPage(
  pdfUri: string,
  pageIndex: number,
  rotation?: number
): Promise<string> {
  if (expoPdfToImageNative && typeof expoPdfToImageNative.renderPdfPage === 'function') {
    try {
      return await expoPdfToImageNative.renderPdfPage(pdfUri, pageIndex, rotation ?? 0);
    } catch (e) {
      console.warn('[indexer] renderPdfPage error:', e);
    }
  }
  const pages = await renderPdfToImages(pdfUri, undefined, pageIndex, 1);
  return pages[0] || '';
}

export async function invalidatePdfRenderCache(pdfUri?: string, purgeDisk: boolean = false): Promise<void> {
  if (pdfUri) {
    for (const key of Array.from(pdfRenderCache.keys())) {
      if (key.startsWith(pdfUri)) {
        pdfRenderCache.delete(key);
      }
    }
  } else {
    pdfRenderCache.clear();
  }
  if (purgeDisk && expoPdfToImageNative && typeof expoPdfToImageNative.clearPdfCache === 'function') {
    try {
      await expoPdfToImageNative.clearPdfCache(pdfUri || null);
    } catch (_) {}
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      console.warn('[indexer] Failed to request POST_NOTIFICATIONS:', e);
    }
  }
  return true;
}

export async function requestAllIndexingPermissionsUpfront(): Promise<{
  notifications: boolean;
  media: boolean;
}> {
  let notifications = true;
  let media = true;

  if (Platform.OS === 'android') {
    // 1. Ensure POST_NOTIFICATIONS is requested upfront while app is in foreground
    try {
      notifications = await ensureNotificationPermission();
    } catch (_) {}

    // 2. Ensure MediaLibrary permission is requested upfront
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      media = perm.granted;
    } catch (_) {}
  }

  return { notifications, media };
}

export async function startNativeBackgroundWorker(title: string = 'FileLensPro', message: string = 'Indexing & OCR in progress...'): Promise<void> {
  await ensureNotificationPermission().catch(() => {});
  if (expoPdfToImageNative && typeof expoPdfToImageNative.startBackgroundService === 'function') {
    try {
      await expoPdfToImageNative.startBackgroundService(title, message);
    } catch (e) {
      console.warn('[indexer] Failed to start native background service:', e);
    }
  }
}

export async function updateNativeBackgroundWorker(
  title: string = 'FileLensPro', 
  message: string, 
  progress: number = -1, 
  max: number = -1
): Promise<void> {
  if (expoPdfToImageNative && typeof expoPdfToImageNative.updateBackgroundService === 'function') {
    try {
      await expoPdfToImageNative.updateBackgroundService(title, message, progress, max);
    } catch (e) {
      console.warn('[indexer] Failed to update native background service:', e);
    }
  }
}

export async function backgroundSafeSleep(ms: number): Promise<void> {
  if (ms <= 0 || AppState.currentState !== 'active') return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function stopNativeBackgroundWorker(): Promise<void> {
  if (expoPdfToImageNative && typeof expoPdfToImageNative.stopBackgroundService === 'function') {
    try {
      await expoPdfToImageNative.stopBackgroundService();
    } catch (e) {
      console.warn('[indexer] Failed to stop native background service:', e);
    }
  }
}

export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (expoPdfToImageNative && typeof expoPdfToImageNative.isBatteryOptimizationIgnored === 'function') {
    try {
      return await expoPdfToImageNative.isBatteryOptimizationIgnored();
    } catch (e) {
      console.warn('[indexer] Failed to check battery optimization:', e);
      return true;
    }
  }
  return true;
}

export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (expoPdfToImageNative && typeof expoPdfToImageNative.requestIgnoreBatteryOptimizations === 'function') {
    try {
      return await expoPdfToImageNative.requestIgnoreBatteryOptimizations();
    } catch (e) {
      console.warn('[indexer] Failed to request ignore battery optimizations:', e);
      return false;
    }
  }
  return false;
}

let lastUserSearchTimestamp = 0;

export function notifyUserSearchActive(): void {
  lastUserSearchTimestamp = Date.now();
}

export type IndexTarget = 
  | { type: 'all' } 
  | { type: 'album'; albumId: string } 
  | { type: 'saf_folder'; uri: string }
  | { type: 'device_root' }
  | { type: 'device_folder'; uri: string }
  | { type: 'documents'; files: { uri: string; name: string; size?: number; mimeType?: string }[] };

export interface IndexProgress {
  indexed: number;
  total: number;
  currentPath: string;
  currentFile: string;
  ocrDone: number;
  ocrPending: number;
  errors: number;
}

export interface IndexResult {
  totalFiles: number;
  indexedFiles: number;
  ocrDone: number;
  errors: number;
  elapsedMs: number;
}

let isIndexing = false;
let shouldCancel = false;

export function isCurrentlyIndexing(): boolean {
  return isIndexing;
}

export function cancelIndexing(): void {
  shouldCancel = true;
  stopNativeBackgroundWorker().catch(() => {});
}

/**
 * Helper to execute asynchronous tasks with controlled concurrency and zero UI blocking.
 */
async function runConcurrentPool<T, R>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<R>,
  onItemDone?: (result: R, index: number) => void
): Promise<void> {
  let currentIndex = 0;
  const workers: Promise<void>[] = [];
  const total = items.length;

  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (currentIndex < total && !shouldCancel) {
          const idx = currentIndex++;
          if (idx >= total) break;
          const item = items[idx];
          try {
            const res = await workerFn(item, idx);
            if (onItemDone) onItemDone(res, idx);
          } catch (err) {
            console.warn('[indexer] Worker error on item', idx, err);
          }
          // Micro cooperative yield when active in foreground so UI thread stays buttery smooth; in background run directly
          if (AppState.currentState === 'active') {
            await new Promise(resolve => setTimeout(resolve, 8));
          }
        }
      })()
    );
  }

  await Promise.all(workers);
}

async function gatherSafAssets(
  uri: string,
  maxDepth = 15,
  currentDepth = 0
): Promise<Array<{ uri: string, filename: string, fileSize: number, modificationTime: number }>> {
  if (currentDepth > maxDepth) {
    return [];
  }
  let assets: Array<{ uri: string, filename: string, fileSize: number, modificationTime: number }> = [];
  try {
    const children = await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    for (const childUri of children) {
      if (shouldCancel) break;
      const filename = decodeURIComponent(childUri.split('%2F').pop() || childUri.split(':').pop() || '');
      
      // Skip hidden files & folders
      if (filename.startsWith('.')) continue;

      // Skip excluded junk/system/cache folders
      if (EXCLUDED_FOLDER_NAMES.has(filename.toLowerCase())) continue;

      // Test if child is a subfolder by reading it directly
      let isDirectory = false;
      try {
        await FileSystem.StorageAccessFramework.readDirectoryAsync(childUri);
        isDirectory = true;
      } catch (e) {
        isDirectory = false;
      }

      if (isDirectory) {
        const childAssets = await gatherSafAssets(childUri, maxDepth, currentDepth + 1);
        assets = assets.concat(childAssets);
      } else {
        const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() || '' : '';
        // Strictly exclude code, markup, config, and system extensions
        if (EXCLUDED_CODE_AND_SYSTEM_EXTENSIONS.has(ext)) continue;

        if (ALL_ACCEPTED_EXTENSIONS.has(ext)) {
          assets.push({
            uri: childUri,
            filename: filename,
            fileSize: 0,
            modificationTime: Date.now() / 1000
          });
        }
      }
    }
  } catch (e) {
    console.warn('[indexer] Failed to read SAF directory:', uri, e);
  }
  return assets;
}

async function gatherDeviceAssets(
  dirUri: string,
  maxDepth = 15,
  currentDepth = 0,
  onScanStep?: (name: string) => void
): Promise<Array<{ uri: string, filename: string, fileSize: number, modificationTime: number }>> {
  if (currentDepth > maxDepth) {
    return [];
  }
  const cleanDirUri = dirUri.endsWith('/') ? dirUri : dirUri + '/';
  let assets: Array<{ uri: string, filename: string, fileSize: number, modificationTime: number }> = [];
  try {
    const children = await FileSystem.readDirectoryAsync(cleanDirUri);

    for (let i = 0; i < children.length; i++) {
      const childName = children[i];
      if (shouldCancel) break;

      // Skip hidden folders or files
      if (childName.startsWith('.')) continue;

      // Skip junk, code repositories, system, and cache folders
      if (EXCLUDED_FOLDER_NAMES.has(childName.toLowerCase())) continue;

      // Skip restricted Android system folders (allow Android/media for WhatsApp)
      if (cleanDirUri.endsWith('Android/') && (childName === 'data' || childName === 'obb')) {
        continue;
      }

      const childUri = `${cleanDirUri}${childName}`;
      
      // Test if child is a subfolder by attempting to read it directly
      let isSubDir = false;
      try {
        await FileSystem.readDirectoryAsync(childUri + '/');
        isSubDir = true;
      } catch (notDirErr) {
        isSubDir = false;
      }

      if (isSubDir) {
        if (onScanStep) onScanStep(childName);
        if (AppState.currentState === 'active') {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        const subAssets = await gatherDeviceAssets(childUri + '/', maxDepth, currentDepth + 1, onScanStep);
        assets = assets.concat(subAssets);
      } else {
        const ext = childName.includes('.') ? childName.split('.').pop()?.toLowerCase() || '' : '';
        // Strictly exclude code, markup, config, and system extensions
        if (EXCLUDED_CODE_AND_SYSTEM_EXTENSIONS.has(ext)) continue;

        if (ALL_ACCEPTED_EXTENSIONS.has(ext)) {
          assets.push({
            uri: childUri,
            filename: childName,
            fileSize: 0,
            modificationTime: Date.now() / 1000,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[indexer] Failed to read device directory:', cleanDirUri, e);
  }
  return assets;
}

/**
 * Index all supported files from the MediaStore.
 *
 * @param onProgress Called periodically with progress info
 * @param options.ocrImages Whether to OCR images (default: true)
 * @param options.maxFiles Safety cap on total files (default: 10000)
 * @param options.target What to index (default: { type: 'all' })
 */
export async function startIndexing(
  onProgress?: (progress: IndexProgress) => void,
  options?: { ocrImages?: boolean; maxFiles?: number; targets?: IndexTarget[] }
): Promise<IndexResult> {
  if (isIndexing) {
    console.warn('[indexer] Indexing is already running, ignoring duplicate request.');
    const { getIndexStats } = require('./database');
    const stats = await getIndexStats();
    return {
      totalFiles: stats.totalFiles,
      indexedFiles: 0,
      ocrDone: stats.ocrDone,
      errors: 0,
      elapsedMs: 0,
    };
  }

  isIndexing = true;
  shouldCancel = false;
  await startNativeBackgroundWorker('FileLensPro', 'Scanning and indexing files...').catch(() => {});
  const startTime = Date.now();
  const ocrImages = options?.ocrImages ?? true;
  const maxFiles = options?.maxFiles ?? 10000;
  
  let targets = options?.targets;
  if (!targets) {
    const { getIndexTargets } = require('./database');
    const dbTargets = await getIndexTargets();
    if (dbTargets.length === 0) {
      isIndexing = false;
      return { totalFiles: 0, indexedFiles: 0, ocrDone: 0, errors: 0, elapsedMs: 0 };
    }
    targets = dbTargets as IndexTarget[];
  }

  try {
    let allAssets: Array<{ uri: string, filename: string, fileSize: number, modificationTime: number, mediaType?: string, mimeType?: string }> = [];

    const reportScanStep = (name: string) => {
      if (onProgress) {
        onProgress({
          indexed: 0,
          total: 0,
          currentPath: `Scanning: ${name}`,
          currentFile: `Scanning: ${name}`,
          ocrDone: 0,
          ocrPending: 0,
          errors: 0,
        });
      }
    };

    for (const target of targets) {
      if (allAssets.length >= maxFiles) break;

      if (target.type === 'saf_folder') {
        reportScanStep('Folder');
        let safAssets = await gatherSafAssets(target.uri);
        safAssets = safAssets.map(a => ({ ...a, forceIndex: true }));
        allAssets = allAssets.concat(safAssets);
      } else if (target.type === 'device_root') {
        let rootPaths = new Set(['file:///storage/emulated/0/']);
        
        try {
          const perm = await MediaLibrary.requestPermissionsAsync();
          if (perm.granted) {
            // Fast SD card discovery: sample 10 recent assets directly
            const sampleAssets = await MediaLibrary.getAssetsAsync({ first: 10 });
            for (const asset of sampleAssets.assets) {
              const match = asset.uri.match(/^file:\/\/\/storage\/[^\/]+\//);
              if (match) {
                let rootPath = match[0];
                if (rootPath === 'file:///storage/emulated/') {
                  rootPath = 'file:///storage/emulated/0/';
                }
                rootPaths.add(rootPath);
              }
            }
          }
        } catch (e) {
          console.warn('[indexer] SD card discovery fallback:', e);
        }

        for (const rootPath of rootPaths) {
          reportScanStep(rootPath.replace('file:///storage/', ''));
          let deviceAssets = await gatherDeviceAssets(rootPath, 10, 0, reportScanStep);
          allAssets = allAssets.concat(deviceAssets);
        }
      } else if (target.type === 'device_folder') {
        const folderUri = target.uri.endsWith('/') ? target.uri : target.uri + '/';
        reportScanStep(folderUri.split('/').filter(Boolean).pop() || 'Folder');
        let deviceAssets = await gatherDeviceAssets(folderUri, 10, 0, reportScanStep);
        deviceAssets = deviceAssets.map(a => ({ ...a, forceIndex: true }));
        allAssets = allAssets.concat(deviceAssets);
      } else if (target.type === 'documents') {
        const docAssets = target.files.map(f => ({
          uri: f.uri,
          filename: f.name,
          fileSize: f.size || 0,
          modificationTime: Date.now() / 1000,
          mimeType: f.mimeType,
          forceIndex: true
        }));
        allAssets = allAssets.concat(docAssets);
      } else {
        reportScanStep('Media Library');
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) {
          throw new Error('Media library permission denied. Cannot index files.');
        }

        let hasNextPage = true;
        let after: string | undefined;
        const mediaOptions: MediaLibrary.AssetsOptions = {
          mediaType: [MediaLibrary.MediaType.photo],
          first: 500, // 500 items per batch for 5x faster discovery
        };
        if (target.type !== 'album') {
          mediaOptions.sortBy = [MediaLibrary.SortBy.modificationTime];
        }

        if (target.type === 'album' && target.albumId) {
          try {
            const albumObj = await MediaLibrary.getAlbumAsync(target.albumId);
            if (albumObj) {
              mediaOptions.album = albumObj;
            } else {
              mediaOptions.album = target.albumId;
            }
          } catch (e) {
            mediaOptions.album = target.albumId;
          }
        }

        while (hasNextPage) {
          const result = await MediaLibrary.getAssetsAsync({
            ...mediaOptions,
            after,
          });
          const supported = result.assets.filter((asset) => {
            if (asset.mediaType === 'video') return false;
            const ext = asset.filename.includes('.') ? asset.filename.split('.').pop()?.toLowerCase() || '' : '';
            return ext === '' || IMAGE_EXTENSIONS.has(ext) || ext === 'pdf';
          }).map(asset => {
            let filename = asset.filename;
            if (!filename.includes('.')) {
              filename += '.jpg';
            }
            return {
              uri: asset.uri,
              filename: filename,
              fileSize: (asset as any).size || 0,
              modificationTime: asset.modificationTime || (Date.now() / 1000),
              mediaType: asset.mediaType
            };
          });
          
          allAssets = allAssets.concat(supported);
          hasNextPage = result.hasNextPage;
          after = result.endCursor;
          if (allAssets.length >= maxFiles) break;
        }
      }
    }

    // 2.4 Deduplicate in-memory by URI
    const seenUris = new Set<string>();
    allAssets = allAssets.filter(a => {
      if (seenUris.has(a.uri)) return false;
      seenUris.add(a.uri);
      return true;
    });

    // 2.5 Sort assets: Documents before Images, Newer before Older
    allAssets.sort((a, b) => {
      const extA = a.filename.split('.').pop()?.toLowerCase() || '';
      const extB = b.filename.split('.').pop()?.toLowerCase() || '';
      
      const docExts = ['pdf', 'docx', 'xlsx', 'txt'];
      const isDocA = docExts.includes(extA) ? 1 : 0;
      const isDocB = docExts.includes(extB) ? 1 : 0;
      
      if (isDocA !== isDocB) {
        return isDocB - isDocA; 
      }
      return b.modificationTime - a.modificationTime;
    });

    // 2.6 Pre-filter assets that have already been processed
    const db = await getDatabase();
    const existingFiles = await db.getAllAsync<{ uri: string, name: string, size: number }>(
      "SELECT uri, name, size FROM files"
    );
    
    const existingUris = new Set(existingFiles.map(f => f.uri));
    const existingNameSize = new Set(existingFiles.filter(f => f.size > 0).map(f => `${f.name}_${f.size}`));
    const existingNameZeroSize = new Set(existingFiles.filter(f => f.size === 0).map(f => f.name));

    const totalExisting = existingFiles.length;

    allAssets = allAssets.filter(asset => {
      if (existingUris.has(asset.uri)) return false;
      if (asset.fileSize > 0 && existingNameSize.has(`${asset.filename}_${asset.fileSize}`)) return false;
      if (existingNameZeroSize.has(asset.filename)) return false;
      return true;
    });

    if (allAssets.length > maxFiles) {
      allAssets = allAssets.slice(0, maxFiles);
    }

    const pendingNewCount = allAssets.length;
    const totalGlobal = totalExisting + pendingNewCount;
    let indexed = 0;
    let ocrDone = 0;
    let errors = 0;

    if (pendingNewCount === 0) {
      if (onProgress) {
        onProgress({
          indexed: totalGlobal,
          total: totalGlobal,
          currentPath: 'All files are up to date!',
          currentFile: 'All files are up to date!',
          ocrDone: 0,
          ocrPending: 0,
          errors: 0,
        });
      }
    }

    let lastProgressTime = 0;
    const CONCURRENCY_DISCOVERY = 4;

    await runConcurrentPool(
      allAssets,
      CONCURRENCY_DISCOVERY,
      async (asset) => {
        try {
          return await indexSingleFile(asset, false);
        } catch (e) {
          console.warn('[indexer] Failed to index file:', asset.filename, e);
          errors++;
          return 'skipped' as const;
        }
      },
      (res, i) => {
        indexed++;
        if (res === 'ocr_done') {
          ocrDone++;
        }

        const now = Date.now();
        const currentGlobal = totalExisting + indexed;
        if (onProgress && (now - lastProgressTime > 150 || indexed === pendingNewCount)) {
          lastProgressTime = now;
          const currentFilename = allAssets[i]?.filename || 'Processing...';
          updateNativeBackgroundWorker('FileLensPro', `Indexing ${currentGlobal}/${totalGlobal} files...`, currentGlobal, totalGlobal).catch(() => {});
          onProgress({
            indexed: currentGlobal,
            total: totalGlobal,
            currentPath: currentFilename,
            currentFile: currentFilename,
            ocrDone,
            ocrPending: 0,
            errors,
          });
        }
      }
    );

    // 4. Auto-categorize and refresh stats once at the end
    await autoCategorizeAllIndexedFiles().catch(() => {});
    await refreshIndexStats();
    const stats = await getIndexStats();
    
    // 5. Seamlessly transition to Background OCR Pass if there are pending files (keep native service alive!)
    if (stats.ocrPending > 0) {
      processPendingHeavyFiles(0).catch(e => console.warn('[indexer] Background processing failed', e));
    }

    return {
      totalFiles: stats.totalFiles,
      indexedFiles: indexed,
      ocrDone,
      errors,
      elapsedMs: Date.now() - startTime,
    };
  } finally {
    isIndexing = false;
    // Only stop background service if there are NO pending files waiting to be OCR'd
    try {
      const statsCheck = await getIndexStats();
      if (statsCheck.ocrPending > 0) {
        processPendingHeavyFiles(0).catch(() => {});
      } else if (!isBackgroundOcrRunning) {
        stopNativeBackgroundWorker().catch(() => {});
      }
    } catch (_) {
      if (!isBackgroundOcrRunning) {
        stopNativeBackgroundWorker().catch(() => {});
      }
    }
  }
}

export async function indexSingleFile(
  asset: { uri: string, filename: string, fileSize: number, modificationTime: number, mediaType?: string, mimeType?: string },
  ocrImages: boolean = true,
  onProgress?: (msg: string) => void,
  isCard: boolean = false,
  customTag: string = ''
): Promise<'skipped' | 'indexed' | 'ocr_done'> {
  let ext = asset.filename.includes('.') ? asset.filename.split('.').pop()?.toLowerCase() || '' : '';
  if (!ext && asset.mimeType?.startsWith('image/')) {
    ext = 'jpg'; // Fallback for extensionless images
  } else if (!ext && asset.uri.match(/\.(jpg|jpeg|png)$/i)) {
    ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
  }
  // Force treat as image if we know it's a photo from MediaLibrary
  const isImage = ext === '' || IMAGE_EXTENSIONS.has(ext) || asset.mediaType === 'photo';
  const uri = asset.uri;
  const name = asset.filename;
  let size = asset.fileSize || 0;
  if (!size || size <= 0) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && (info as any).size) {
        size = (info as any).size;
      }
    } catch (_) {}
  }
  const forceIndex = (asset as any).forceIndex || false;
  const modified = asset.modificationTime
    ? new Date(asset.modificationTime * 1000).toISOString()
    : new Date().toISOString();

  // 1. Try to find by exact URI first
  let existingData: { modified: string; size?: number; ocr_status: string } | null = await getFileMetadataByUri(uri);
  
  // 2. If not found by URI, try to find by Name + Size 
  // (Crucial for deduplicating files found by MediaStore vs FileSystem which use completely different URI formats)
  if (!existingData) {
    if (size > 0) {
      existingData = await getFileMetadataByNameAndSize(name, size);
    }
    
    // 3. Fallback for older MediaStore records which were inserted with size = 0
    if (!existingData) {
      existingData = await getFileMetadataByNameAndSize(name, 0);
      // If we found a match with size 0, we can optionally update the DB size here, 
      // but for now just returning it will correctly skip the OCR!
    }
  }

  // Check if file is already indexed and unmodified (or if name+size matched)
  if (existingData && !isCard && !forceIndex) {
    if (existingData.ocr_status === 'done' || existingData.ocr_status === 'skipped' || existingData.ocr_status === 'failed') {
      const existingMod = new Date(existingData.modified).getTime();
      const currentMod = asset.modificationTime ? (asset.modificationTime * 1000) : 0;
      // Skip if unmodified and not a PDF needing fresh OCR
      const isPdf = ext === 'pdf';
      if (!isPdf && (!currentMod || currentMod <= existingMod + 1000 || existingData.ocr_status === 'done')) {
        return existingData.ocr_status === 'done' ? 'ocr_done' : 'skipped';
      }
    }
  }

  let contentText: string | null = null;
  let ocrText: string | null = null;
  let ocrStatus = isImage ? 'pending' : 'skipped';
  let isOcrCompleted = false;
  
  // Copy to local file if it's a content:// URI to ensure native modules can read it
  let localUri = uri;
  let isTempFile = false;
  if (uri.startsWith('content://')) {
    localUri = FileSystem.cacheDirectory + 'temp_' + Date.now() + (ext ? `.${ext}` : '.pdf');
    await FileSystem.copyAsync({ from: uri, to: localUri });
    isTempFile = true;
  }

  try {
    let isScannedPdf = false;
    if (!isImage) {
      const isFastPass = !forceIndex;
      const extracted = await extractContent(localUri, isFastPass);
      contentText = extracted.text || null;
      if (contentText && contentText.length > MAX_DOCUMENT_TEXT_LENGTH) {
        contentText = contentText.substring(0, MAX_DOCUMENT_TEXT_LENGTH);
      }
      
      // Attempt KrutiDev / DevLys detection and decoding
      if (contentText && isLikelyKrutiDev(contentText)) {
        const decoded = convertKrutiDev(contentText);
        if (decoded && decoded !== contentText) {
          contentText += '\n\n--- Decoded Legacy Hindi ---\n' + decoded;
          if (contentText.length > MAX_DOCUMENT_TEXT_LENGTH) {
            contentText = contentText.substring(0, MAX_DOCUMENT_TEXT_LENGTH);
          }
        }
      }

      if (extracted.hasMorePages) {
        ocrStatus = 'pending_content';
      } else if (ext === 'pdf') {
        // If PDF already has native text extracted (e.g. digital books/docs), mark it done!
        if (contentText && contentText.trim().length > 30) {
          ocrStatus = 'done';
          isOcrCompleted = true;
        } else {
          // Pure scanned image PDF (no text layer) -> queue for visual OCR
          isScannedPdf = true;
          ocrStatus = 'pending';
        }
      } else {
        ocrStatus = contentText ? 'done' : 'skipped';
        isOcrCompleted = true;
      }
    }

    // OCR images and scanned PDFs (if enabled)
    if (ocrImages && (isImage || isScannedPdf) && ocrStatus !== 'pending_content') {
      if (!isOcrCompleted) {
        ocrStatus = 'pending';
        
        let imagesToOcr: string[] = [];
        if (isImage) {
          imagesToOcr = [localUri];
        } else if (isScannedPdf) {
          let pdfRenderUri = localUri;
          let tempPdfCreated = false;
          try {
            // If URI has non-ASCII characters or spaces, copy to ASCII-safe cache file
            if (/[^\x00-\x7F\w\.\/\:\-]/.test(localUri) || localUri.includes(' ') || localUri.includes('%')) {
              const safeTempUri = `${FileSystem.cacheDirectory}render_${Date.now()}.pdf`;
              await FileSystem.copyAsync({ from: localUri, to: safeTempUri });
              pdfRenderUri = safeTempUri;
              tempPdfCreated = true;
            }
            const allRendered: string[] = await renderPdfToImages(pdfRenderUri);
            imagesToOcr = allRendered.slice(0, 5); // Safety limit to first 5 pages to prevent OOM
            // Immediately delete any excess pages from disk
            for (let k = 5; k < allRendered.length; k++) {
              await FileSystem.deleteAsync(allRendered[k], { idempotent: true }).catch(() => {});
            }
          } catch (e) {
            console.warn(`[indexer] Failed to render PDF to images:`, e);
          } finally {
            if (tempPdfCreated) {
              await FileSystem.deleteAsync(pdfRenderUri, { idempotent: true }).catch(() => {});
            }
          }
        }

        try {
          let combinedOcrText = '';
          const imagesToProcess = imagesToOcr;
          let pageNum = 1;
          for (const imgUri of imagesToProcess) {
            if (onProgress && imagesToProcess.length > 1) {
              onProgress(`Processing image ${pageNum} of ${imagesToProcess.length}...`);
            }
            
            const result = await ocrImage(imgUri, undefined, isImage ? ext : 'jpg');

            if (result.text) {
              if (imagesToProcess.length > 1) {
                combinedOcrText += `\n[Page ${pageNum}]\n`;
              }
              combinedOcrText += result.text + '\n\n';
            }

            if (isScannedPdf) {
              await FileSystem.deleteAsync(imgUri, { idempotent: true }).catch(() => {});
            }
            pageNum++;
          }
          
          if (combinedOcrText.trim()) {
            // Attempt KrutiDev / DevLys detection and decoding on OCR text as well
            if (isLikelyKrutiDev(combinedOcrText)) {
              const decoded = convertKrutiDev(combinedOcrText);
              if (decoded && decoded !== combinedOcrText) {
                combinedOcrText += '\n\n--- Decoded Legacy Hindi ---\n' + decoded;
              }
            }

            ocrText = combinedOcrText.trim();
            ocrStatus = 'done';
            isOcrCompleted = true;
          } else {
            // Processed successfully but image contains no recognizable text
            ocrText = '';
            ocrStatus = 'done';
            isOcrCompleted = true;
          }
        } catch (e) {
          console.warn(`[indexer] OCR failed for ${name}:`, e);
          ocrStatus = 'failed';
        } finally {
          if (isScannedPdf) {
            for (const imgUri of imagesToOcr) {
              await FileSystem.deleteAsync(imgUri, { idempotent: true }).catch(() => {});
            }
          }
        }
      }
    }
  } finally {
    if (isTempFile) {
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    }
  }

  // Append custom tag to content so it is indexed in FTS and Semantic Search
  if (isCard) {
    const tagToUse = customTag ? customTag : 'Card';
    const tagString = `[Card Tag: ${tagToUse}]`;
    if (contentText) {
      contentText = `${tagString}\n\n${contentText}`;
    } else {
      contentText = tagString;
    }
  }

  // Insert into database
  const fileId = await upsertFile({
    uri,
    name,
    extension: ext,
    size,
    modified,
    contentText,
    ocrText,
    ocrStatus,
  }, isCard, customTag);

  // Generate and save semantic vector chunks (capped to top 20 chunks for max performance)
  const fullTextToEmbed = [contentText, ocrText].filter(Boolean).join('\n\n').trim();
  if (fullTextToEmbed) {
    try {
      const chunks = chunkText(fullTextToEmbed, 350, 60);
      const chunksToEmbed = chunks.slice(0, 20);
      if (chunksToEmbed.length > 0) {
        const chunkEmbeddings: Array<{ text: string; pageNumber: number; vector: Float32Array }> = [];
        for (const chunk of chunksToEmbed) {
          const vector = await generateEmbedding(chunk.text);
          chunkEmbeddings.push({
            text: chunk.text,
            pageNumber: chunk.pageNumber,
            vector,
          });
        }
        await saveFileChunkEmbeddings(fileId, chunkEmbeddings);
      }
    } catch (embErr) {
      console.warn(`[indexer] Failed to generate semantic embeddings for ${name}:`, embErr);
    }
  }

  // Run auto-categorizer & continuous semantic learning
  const textToAnalyze = ocrText || contentText || '';
  if (textToAnalyze) {
    await autoCategorizeFile(uri, name, textToAnalyze);
    learnFromDocumentText(textToAnalyze, name).catch(() => {});
  }

  return isOcrCompleted ? 'ocr_done' : 'indexed';
}

let isBackgroundOcrRunning = false;

export async function processPendingHeavyFiles(delayMs: number = 1500): Promise<void> {
  if (isBackgroundOcrRunning) {
    return;
  }
  isBackgroundOcrRunning = true;
  shouldCancel = false;

  try {
    // Grace period so UI dialogs, animations, and dismissal complete with 60fps buttery smoothness
    // ONLY delay if in foreground. If already in background, start immediately without delay!
    if (delayMs > 0 && AppState.currentState === 'active') {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    if (shouldCancel) return;

    // 1. Query the true total pending OCR files at the start of background pass
    const db = await getDatabase();
    const pendingRow = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM files WHERE ocr_status = 'pending' OR ocr_status = 'pending_content'"
    );
    const initialStats = await getIndexStats();
    const pendingTarget = Math.max(pendingRow?.cnt || 0, initialStats.ocrPending || 0);

    if (pendingTarget === 0) {
      console.log('[indexer] No pending OCR files to process.');
      return;
    }

    const ocrAlreadyDone = initialStats.ocrDone || 0;
    const globalTotalOcr = ocrAlreadyDone + pendingTarget;

    await startNativeBackgroundWorker('FileLensPro', `Processing ${pendingTarget} files in background...`);
    updateNativeBackgroundWorker('FileLensPro', `Processing OCR (${ocrAlreadyDone}/${globalTotalOcr})...`, ocrAlreadyDone, globalTotalOcr).catch(() => {});
    let processedCount = 0;
    const processedUris = new Set<string>();
    let lastOcrTime = 0;

    console.log(`[indexer] Starting continuous background OCR for ${pendingTarget} pending files (${ocrAlreadyDone}/${globalTotalOcr} done)...`);

    while (!shouldCancel) {
      const batch = await getPendingOcrFiles(200);
      if (!batch || batch.length === 0) break;

      const newItems = batch.filter(item => !processedUris.has(item.uri));
      if (newItems.length === 0) {
        // All items in current batch were already attempted in this session
        break;
      }

      for (const item of newItems) {
        processedUris.add(item.uri);
      }

      const CONCURRENCY_OCR = 1;
      await runConcurrentPool(
        newItems,
        CONCURRENCY_OCR,
        async (asset) => {
          try {
            await indexSingleFile({
              uri: asset.uri,
              filename: asset.name,
              fileSize: asset.size || 0,
              modificationTime: new Date(asset.modified).getTime() / 1000,
            } as any, true);
            // Cooperative pause in foreground so UI and JS threads remain smooth; in background run directly
            if (AppState.currentState === 'active') {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            return true;
          } catch (e) {
            console.warn(`[indexer] Failed to background process ${asset.name}`, e);
            try {
              const database = await getDatabase();
              await database.runAsync("UPDATE files SET ocr_status = 'failed' WHERE uri = ?", [asset.uri]);
            } catch (dbErr) {}
            return false;
          }
        },
        (success, i) => {
          processedCount++;
          const now = Date.now();
          const currentCumulative = Math.min(ocrAlreadyDone + processedCount, globalTotalOcr);
          const percent = globalTotalOcr > 0 ? Math.min(100, Math.round((currentCumulative / globalTotalOcr) * 100)) : 100;
          const remainingCount = Math.max(0, globalTotalOcr - currentCumulative);
          const currentName = newItems[i]?.name || 'Processing...';

          if (now - lastOcrTime > 150 || processedCount === 1 || currentCumulative >= globalTotalOcr) {
            lastOcrTime = now;
            updateNativeBackgroundWorker(
              'FileLensPro',
              `OCRing ${currentCumulative}/${globalTotalOcr} (${percent}%) • ${remainingCount} left`,
              currentCumulative,
              globalTotalOcr
            ).catch(() => {});
            useStore.getState().setBackgroundOcrProgress({
              current: currentCumulative,
              total: globalTotalOcr,
              currentFile: currentName
            });
          }

          if (processedCount % 10 === 0 || currentCumulative >= globalTotalOcr) {
            refreshIndexStats().then(async () => {
              const stats = await getIndexStats();
              useStore.getState().setStats({
                totalFiles: stats.totalFiles,
                ocrDone: stats.ocrDone,
                ocrPending: stats.ocrPending,
              });
            }).catch(() => {});
          }
        }
      );
    }

    // 2. Process missing embeddings pass in continuous batches
    try {
      const CONCURRENCY_EMBED = 3;
      while (!shouldCancel) {
        const missingEmbeddingFiles = await getFilesMissingEmbeddings();
        if (!missingEmbeddingFiles || missingEmbeddingFiles.length === 0) break;
        
        let batchProcessed = 0;
        await runConcurrentPool(
          missingEmbeddingFiles,
          CONCURRENCY_EMBED,
          async (file) => {
            const text = [file.content_text, file.ocr_text].filter(Boolean).join('\n\n').trim();
            if (text) {
              const chunks = chunkText(text, 350, 60);
              const chunkEmbeddings: Array<{ text: string; pageNumber: number; vector: Float32Array }> = [];
              for (const chunk of chunks) {
                const vector = await generateEmbedding(chunk.text);
                chunkEmbeddings.push({
                  text: chunk.text,
                  pageNumber: chunk.pageNumber,
                  vector,
                });
              }
              await saveFileChunkEmbeddings(file.id, chunkEmbeddings);
              return true;
            }
            return false;
          },
          (didEmbed) => {
            if (didEmbed) batchProcessed++;
          }
        );

        if (batchProcessed === 0) break;
      }
    } catch (e) {
      console.warn('[indexer] Background semantic embedding pass failed:', e);
    }
  } finally {
    isBackgroundOcrRunning = false;
    useStore.getState().setBackgroundOcrProgress(null);
    if (!isIndexing) {
      stopNativeBackgroundWorker().catch(() => {});
    }
    await autoCategorizeAllIndexedFiles().catch(() => {});
    await refreshIndexStats();
    const finalStats = await getIndexStats();
    useStore.getState().setStats({
      totalFiles: finalStats.totalFiles,
      ocrDone: finalStats.ocrDone,
      ocrPending: finalStats.ocrPending,
    });
    console.log(`[indexer] Background processing complete.`);
  }
}
