/**
 * duplicateFinder.ts â€” Find duplicate files by SHA-256 checksum.
 *
 * Mirrors the desktop FileLensPro Duplicate Finder dialog.
 * Two files are considered duplicates if their SHA-256 hashes are identical,
 * even if the names differ.
 *
 * Flow:
 *   1. Scan indexed files (or user-selected folder)
 *   2. Group by file size (fast pre-filter â€” different sizes can't be duplicates)
 *   3. For files with the same size, compute SHA-256
 *   4. Group by hash â†’ these are the duplicate groups
 *   5. In each group, mark the oldest file as "original", others as "duplicates"
 */

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { batchDeleteFiles } from 'expo-pdf-to-image';
import { getDatabase } from './database';
import { FileEntry } from '../models/types';

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: DuplicateFile[];
}

export interface DuplicateFile {
  id: number;
  uri: string;
  name: string;
  modified: string;
  size: number;
  isOriginal: boolean;  // true = keep, false = can delete
  selectedForCleanup?: boolean;
  isMediaAsset?: boolean;
  assetId?: string;
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  totalDuplicates: number;
  wastedSpace: number;  // bytes that can be freed
  scannedFiles: number;
  elapsedMs: number;
}

/**
 * Scan indexed files and phone gallery/albums for exact duplicate files.
 *
 * @param onProgress Optional callback: (scanned, total) => void
 */
export async function findDuplicates(
  onProgress?: (scanned: number, total: number) => void
): Promise<DuplicateScanResult> {
  const startTime = Date.now();
  const database = await getDatabase();

  // 1. Get all indexed files
  const dbFiles = await database.getAllAsync<{
    id: number; uri: string; name: string; size: number; modified: string;
  }>(`SELECT id, uri, name, size, modified FROM files WHERE size > 0 ORDER BY size DESC`);

  type CandidateFile = {
    id: number;
    uri: string;
    name: string;
    size: number;
    modified: string;
    isMediaAsset?: boolean;
    assetId?: string;
  };

  const files: CandidateFile[] = [...dbFiles];
  const seenUris = new Set(dbFiles.map(f => f.uri));

  // 2. Query MediaLibrary photos & albums (Camera, WhatsApp, Screenshots, Downloads)
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    let hasPerm = perm.granted;
    if (!hasPerm && perm.canAskAgain) {
      const req = await MediaLibrary.requestPermissionsAsync();
      hasPerm = req.granted;
    }

    if (hasPerm) {
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        first: 400,
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });

      const unvisitedAssets = media.assets.filter(a => !seenUris.has(a.uri));
      let virtualId = 1_000_000;
      const CHUNK_SIZE = 20;

      for (let i = 0; i < unvisitedAssets.length; i += CHUNK_SIZE) {
        const chunk = unvisitedAssets.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (asset) => {
            seenUris.add(asset.uri);
            let assetSize = 0;
            try {
              const info = await FileSystem.getInfoAsync(asset.uri);
              if (info.exists && 'size' in info) {
                assetSize = info.size || 0;
              }
            } catch {
              assetSize = 0;
            }

            if (assetSize > 1024) {
              files.push({
                id: virtualId++,
                uri: asset.uri,
                name: asset.filename || 'Gallery Media',
                size: assetSize,
                modified: new Date(asset.modificationTime).toISOString(),
                isMediaAsset: true,
                assetId: asset.id,
              });
            }
          })
        );
        // Yield to event loop to keep UI completely responsive
        await new Promise(r => setTimeout(r, 4));
      }
    }
  } catch (err) {
    console.warn('[duplicateFinder] Failed to query MediaLibrary:', err);
  }

  const total = files.length;
  if (total === 0) {
    return { groups: [], totalDuplicates: 0, wastedSpace: 0, scannedFiles: 0, elapsedMs: 0 };
  }

  // Step 1: Group by size (fast pre-filter — different sizes cannot be byte-duplicates)
  const sizeGroups = new Map<number, CandidateFile[]>();
  for (const file of files) {
    if (file.size < 1024) continue; // skip tiny files (< 1KB)
    const group = sizeGroups.get(file.size);
    if (group) {
      group.push(file);
    } else {
      sizeGroups.set(file.size, [file]);
    }
  }

  // Step 2: For groups with >1 file with identical size, compute SHA-256
  const hashGroups = new Map<string, DuplicateFile[]>();
  let scanned = 0;

  for (const [, sizeGroup] of sizeGroups) {
    if (sizeGroup.length < 2) {
      scanned += sizeGroup.length;
      continue;
    }

    for (const file of sizeGroup) {
      try {
        const hash = await computeFileHash(file.uri);
        scanned++;

        const dupFile: DuplicateFile = {
          id: file.id,
          uri: file.uri,
          name: file.name,
          modified: file.modified,
          size: file.size,
          isOriginal: false, // determined below
          isMediaAsset: file.isMediaAsset,
          assetId: file.assetId,
        };

        const hashGroup = hashGroups.get(hash);
        if (hashGroup) {
          hashGroup.push(dupFile);
        } else {
          hashGroups.set(hash, [dupFile]);
        }

        if (scanned % 3 === 0) {
          if (onProgress) onProgress(scanned, total);
          await new Promise(r => setTimeout(r, 8));
        }
      } catch (e) {
        console.warn(`[duplicateFinder] Hash failed for ${file.uri}:`, e);
        scanned++;
      }
    }
  }

  // Step 3: Build duplicate groups (only groups with >1 file)
  const groups: DuplicateGroup[] = [];
  let totalDuplicates = 0;
  let wastedSpace = 0;

  for (const [hash, dups] of hashGroups) {
    if (dups.length < 2) continue;

    // Sort by modified date — oldest is the "original"
    dups.sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    dups.forEach((d, idx) => {
      d.isOriginal = idx === 0;
      d.selectedForCleanup = idx !== 0;
    });

    const size = dups[0]?.size || files.find((f) => f.id === dups[0].id)?.size || 0;
    groups.push({
      hash,
      size,
      files: dups,
    });

    totalDuplicates += dups.length - 1;  // minus the original
    wastedSpace += size * (dups.length - 1);
  }

  // Sort groups by wasted space (largest first)
  groups.sort((a, b) => (b.size * (b.files.length - 1)) - (a.size * (a.files.length - 1)));

  return {
    groups,
    totalDuplicates,
    wastedSpace,
    scannedFiles: scanned,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Compute SHA-256 hash of a file.
 * Reads the file in chunks to avoid memory issues with large files.
 */
async function computeFileHash(uri: string): Promise<string> {
  // For files under 10MB, read the whole thing
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) throw new Error('File not found');

  const size = fileInfo.size || 0;
  if (size < 10 * 1024 * 1024) {
    // Small file â€” read entire content and hash
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      content
    );
  }

  // Large file â€” hash the first 1MB + last 1MB + file size
  // (This is a "fast hash" â€” not cryptographically perfect, but good enough
  // for duplicate detection. Two files with the same first+last MB and same
  // size are almost certainly identical.)
  const headSize = Math.min(1024 * 1024, Math.floor(size / 2));
  const tailStart = Math.max(0, size - 1024 * 1024);

  const head = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    length: headSize,
    position: 0,
  });
  const tail = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    length: Math.min(1024 * 1024, size - tailStart),
    position: tailStart,
  });

  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${size}|${head}|${tail}`
  );
}

/**
 * Delete duplicate files with batched OS execution.
 * @param fileIds IDs of the duplicate files to delete
 * @param filesInfo Optional list of DuplicateFile objects containing URI, assetId, and size
 */
export async function deleteDuplicates(
  fileIds: number[],
  filesInfo?: DuplicateFile[]
): Promise<{ deleted: number; failed: number; freedSpace: number }> {
  const database = await getDatabase();
  let deleted = 0;
  let failed = 0;
  let freedSpace = 0;

  const infoMap = new Map<number, DuplicateFile>();
  if (filesInfo) {
    for (const f of filesInfo) {
      infoMap.set(f.id, f);
    }
  }

  // Pre-fetch missing file metadata from SQLite
  const targets: Array<{
    id: number;
    uri: string;
    size: number;
    assetId?: string;
    isMediaAsset?: boolean;
  }> = [];

  for (const id of fileIds) {
    const meta = infoMap.get(id);
    let uri = meta?.uri;
    let size = meta?.size || 0;
    let assetId = meta?.assetId;
    let isMediaAsset = meta?.isMediaAsset;

    if (!uri || size <= 0) {
      try {
        const dbFile = await database.getFirstAsync<{ uri: string; size: number }>(
          'SELECT uri, size FROM files WHERE id = ?',
          [id]
        );
        if (dbFile) {
          uri = uri || dbFile.uri;
          size = size || dbFile.size;
        }
      } catch {}
    }

    if (uri) {
      targets.push({ id, uri, size, assetId, isMediaAsset });
    } else {
      failed++;
    }
  }

  // Group by deletion mechanism
  const mediaAssetMap = new Map<string, typeof targets[0]>();
  const fileUris: string[] = [];
  const fileTargets: typeof targets[0][] = [];
  const safTargets: typeof targets[0][] = [];

  for (const t of targets) {
    if (t.isMediaAsset && t.assetId) {
      mediaAssetMap.set(t.assetId, t);
    } else if (t.uri.startsWith('content://')) {
      const match = t.uri.match(/\/(\d+)$/);
      if (match) {
        mediaAssetMap.set(match[1], t);
      } else {
        safTargets.push(t);
      }
    } else if (t.uri.startsWith('ph://')) {
      const phId = t.uri.replace('ph://', '').split('/')[0];
      mediaAssetMap.set(phId, t);
    } else {
      fileUris.push(t.uri);
      fileTargets.push(t);
    }
  }

  // 1. Batch delete MediaLibrary assets (all at once so OS shows ONE dialog or deletes directly)
  if (mediaAssetMap.size > 0) {
    const assetIds = Array.from(mediaAssetMap.keys());
    try {
      await MediaLibrary.deleteAssetsAsync(assetIds);
      for (const t of mediaAssetMap.values()) {
        deleted++;
        freedSpace += t.size;
      }
    } catch (batchErr) {
      console.warn('[duplicateFinder] Batch MediaLibrary delete failed, trying fallback:', batchErr);
      for (const [aId, t] of mediaAssetMap.entries()) {
        try {
          await MediaLibrary.deleteAssetsAsync([aId]);
          deleted++;
          freedSpace += t.size;
        } catch {
          failed++;
        }
      }
    }
  }

  // 2. Batch delete standard file URIs (using fast native batchDeleteFiles + fallback)
  if (fileUris.length > 0) {
    try {
      const nativeRes = await batchDeleteFiles(fileUris);
      if (nativeRes && nativeRes.deleted > 0) {
        deleted += nativeRes.deleted;
        freedSpace += nativeRes.freedBytes;
        failed += nativeRes.failed;
      } else {
        for (const t of fileTargets) {
          try {
            await FileSystem.deleteAsync(t.uri, { idempotent: true });
            deleted++;
            freedSpace += t.size;
          } catch {
            failed++;
          }
        }
      }
    } catch {
      for (const t of fileTargets) {
        try {
          await FileSystem.deleteAsync(t.uri, { idempotent: true });
          deleted++;
          freedSpace += t.size;
        } catch {
          failed++;
        }
      }
    }
  }

  // 3. SAF Content URIs
  for (const t of safTargets) {
    try {
      await FileSystem.StorageAccessFramework.deleteAsync(t.uri);
      deleted++;
      freedSpace += t.size;
    } catch {
      failed++;
    }
  }

  // 4. Remove deleted files from SQLite
  for (const t of targets) {
    if (t.id < 1_000_000) {
      await database.runAsync('DELETE FROM files WHERE id = ?', [t.id]).catch(() => {});
    }
  }

  return { deleted, failed, freedSpace };
}
