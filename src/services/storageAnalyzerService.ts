/**
 * storageAnalyzerService.ts — Analyzes device and indexed document storage.
 *
 * Categorizes documents (PDFs, Images, Office Docs, Audio, Large Files),
 * checks total/free system storage, and detects storage hogs and dormant files.
 */

import { getDatabase } from './database';
import { getStorageStats } from 'expo-pdf-to-image';

export interface StorageCategoryBreakdown {
  key: string;
  label: string;
  icon: string;
  color: string;
  totalBytes: number;
  fileCount: number;
}

export interface LargeFileInfo {
  id: number;
  uri: string;
  name: string;
  size: number;
  extension: string;
  modified: string;
}

export interface StorageAnalysisResult {
  totalDeviceBytes: number;
  freeDeviceBytes: number;
  usedDeviceBytes: number;
  appCacheBytes: number;
  indexedFilesBytes: number;
  indexedFilesCount: number;
  categories: StorageCategoryBreakdown[];
  largeFiles: LargeFileInfo[];
  staleFiles: LargeFileInfo[];
}

export async function analyzeStorage(): Promise<StorageAnalysisResult> {
  const [deviceStats, database] = await Promise.all([
    getStorageStats(),
    getDatabase(),
  ]);

  // Query category aggregations
  const rows = await database.getAllAsync<{
    id: number;
    uri: string;
    name: string;
    extension: string;
    size: number;
    modified: string;
    is_card: number;
  }>(`SELECT id, uri, name, extension, size, modified, is_card FROM files WHERE size > 0 ORDER BY size DESC`);

  let pdfBytes = 0;
  let pdfCount = 0;
  let imageBytes = 0;
  let imageCount = 0;
  let docBytes = 0;
  let docCount = 0;
  let audioBytes = 0;
  let audioCount = 0;
  let cardBytes = 0;
  let cardCount = 0;
  let otherBytes = 0;
  let otherCount = 0;

  const largeFiles: LargeFileInfo[] = [];
  const staleFiles: LargeFileInfo[] = [];

  const now = Date.now();
  const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
  const LARGE_FILE_THRESHOLD = 25 * 1024 * 1024; // 25 MB

  let totalIndexedBytes = 0;

  for (const f of rows) {
    const sz = f.size || 0;
    totalIndexedBytes += sz;
    const ext = (f.extension || '').toLowerCase().replace(/^\./, '');

    if (f.is_card === 1) {
      cardBytes += sz;
      cardCount++;
    } else if (ext === 'pdf') {
      pdfBytes += sz;
      pdfCount++;
    } else if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif'].includes(ext)) {
      imageBytes += sz;
      imageCount++;
    } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf'].includes(ext)) {
      docBytes += sz;
      docCount++;
    } else if (['m4a', 'mp3', 'wav', 'aac', 'ogg', 'flac'].includes(ext)) {
      audioBytes += sz;
      audioCount++;
    } else {
      otherBytes += sz;
      otherCount++;
    }

    if (sz >= LARGE_FILE_THRESHOLD) {
      largeFiles.push({
        id: f.id,
        uri: f.uri,
        name: f.name,
        size: sz,
        extension: ext,
        modified: f.modified,
      });
    }

    const modTime = new Date(f.modified).getTime();
    if (!isNaN(modTime) && modTime < sixMonthsAgo && sz >= 5 * 1024 * 1024) {
      staleFiles.push({
        id: f.id,
        uri: f.uri,
        name: f.name,
        size: sz,
        extension: ext,
        modified: f.modified,
      });
    }
  }

  const categories: StorageCategoryBreakdown[] = [
    {
      key: 'pdf',
      label: 'PDF Documents',
      icon: 'document-text',
      color: '#EF4444',
      totalBytes: pdfBytes,
      fileCount: pdfCount,
    },
    {
      key: 'images',
      label: 'Photos & Scans',
      icon: 'image',
      color: '#3B82F6',
      totalBytes: imageBytes,
      fileCount: imageCount,
    },
    {
      key: 'documents',
      label: 'Office & Text',
      icon: 'document',
      color: '#10B981',
      totalBytes: docBytes,
      fileCount: docCount,
    },
    {
      key: 'cards',
      label: 'Smart Cards & IDs',
      icon: 'card',
      color: '#F59E0B',
      totalBytes: cardBytes,
      fileCount: cardCount,
    },
    {
      key: 'audio',
      label: 'Voice Notes & Audio',
      icon: 'mic',
      color: '#8B5CF6',
      totalBytes: audioBytes,
      fileCount: audioCount,
    },
    {
      key: 'other',
      label: 'Other Files',
      icon: 'folder',
      color: '#6B7280',
      totalBytes: otherBytes,
      fileCount: otherCount,
    },
  ].filter(c => c.totalBytes > 0 || c.fileCount > 0);

  const totalDev = deviceStats.totalBytes > 0 ? deviceStats.totalBytes : 128 * 1024 * 1024 * 1024;
  const freeDev = deviceStats.availableBytes > 0 ? deviceStats.availableBytes : 32 * 1024 * 1024 * 1024;
  const usedDev = Math.max(0, totalDev - freeDev);

  return {
    totalDeviceBytes: totalDev,
    freeDeviceBytes: freeDev,
    usedDeviceBytes: usedDev,
    appCacheBytes: deviceStats.appCacheBytes || 0,
    indexedFilesBytes: totalIndexedBytes,
    indexedFilesCount: rows.length,
    categories,
    largeFiles: largeFiles.slice(0, 50),
    staleFiles: staleFiles.slice(0, 50),
  };
}

export function formatStorageSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
