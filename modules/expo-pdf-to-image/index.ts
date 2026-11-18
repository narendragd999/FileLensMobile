import { requireNativeModule } from 'expo-modules-core';

const ExpoPdfToImage = requireNativeModule('ExpoPdfToImage');

export async function renderPdfToImages(
  pdfUri: string,
  rotations?: number[],
  offset?: number,
  limit?: number,
  maxDim?: number
): Promise<string[]> {
  return await ExpoPdfToImage.renderPdfToImages(pdfUri, rotations || null, offset ?? null, limit ?? null, maxDim ?? null);
}

export async function renderPdfPage(
  pdfUri: string,
  pageIndex: number,
  rotation?: number
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.renderPdfPage === 'function') {
    return await ExpoPdfToImage.renderPdfPage(pdfUri, pageIndex, rotation ?? 0);
  }
  const pages = await renderPdfToImages(pdfUri, undefined, pageIndex, 1);
  return pages[0] || '';
}

export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.isBatteryOptimizationIgnored === 'function') {
    return await ExpoPdfToImage.isBatteryOptimizationIgnored();
  }
  return true;
}

export async function compressPdf(
  pdfUri: string,
  resolution: 'actual' | 'large' | 'medium' | 'small',
  rotations?: number[]
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.compressPdf === 'function') {
    return await ExpoPdfToImage.compressPdf(pdfUri, resolution, rotations || null);
  }
  return pdfUri;
}

export async function cropAndRotateImage(
  imageUri: string,
  relX: number,
  relY: number,
  relW: number,
  relH: number,
  rotation: number = 0,
  filter: string = 'original',
  skewAngle?: number
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.cropAndRotateImage === 'function') {
    return await ExpoPdfToImage.cropAndRotateImage(imageUri, relX, relY, relW, relH, rotation, filter, skewAngle ?? null);
  }
  throw new Error('Native cropAndRotateImage not available');
}

export interface DocumentCorner {
  x: number;
  y: number;
}

export interface NativePageInfo {
  pageIndex: number;
  rotation: number;
  width: number;
  height: number;
}

export async function getPdfPagesInfo(pdfUri: string): Promise<NativePageInfo[]> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getPdfPagesInfo === 'function') {
    return await ExpoPdfToImage.getPdfPagesInfo(pdfUri);
  }
  return [];
}

export interface ScannedDocumentResult {
  uri: string;
  width: number;
  height: number;
  hasEdges: boolean;
  corners?: DocumentCorner[];
}

export async function cropAndStraightenDocument(
  imageUri: string,
  filter: string = 'magic',
  orientation?: string
): Promise<ScannedDocumentResult> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.cropAndStraightenDocument === 'function') {
    return await ExpoPdfToImage.cropAndStraightenDocument(imageUri, filter, orientation ?? null);
  }
  return { uri: imageUri, width: 1200, height: 1600, hasEdges: false };
}

export interface GoogleDocScannerResult {
  success: boolean;
  pages: string[];
  pdfUri: string;
  pageCount: number;
  canceled: boolean;
}

export async function launchGoogleDocScanner(): Promise<GoogleDocScannerResult> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.launchGoogleDocScanner === 'function') {
    return await ExpoPdfToImage.launchGoogleDocScanner();
  }
  throw new Error('Google Document Scanner is not available on this device');
}

export interface NormalizedPhotoResult {
  uri: string;
  width: number;
  height: number;
}

export async function normalizeCapturedPhoto(imageUri: string): Promise<NormalizedPhotoResult> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.normalizeCapturedPhoto === 'function') {
    return await ExpoPdfToImage.normalizeCapturedPhoto(imageUri);
  }
  return { uri: imageUri, width: 1200, height: 1600 };
}

export interface DetectedDocumentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  hasEdges?: boolean;
  corners?: DocumentCorner[];
}

export async function detectDocumentEdges(imageUri: string): Promise<DetectedDocumentBounds> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.detectDocumentEdges === 'function') {
    return await ExpoPdfToImage.detectDocumentEdges(imageUri);
  }
  return { x: 0, y: 0, width: 1, height: 1, angle: 0, hasEdges: false };
}

export async function exportPdfAsImages(
  pdfUri: string,
  resolution: 'actual' | 'large' | 'medium' | 'small' = 'medium',
  rotations?: number[]
): Promise<string[]> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.exportPdfAsImages === 'function') {
    return await ExpoPdfToImage.exportPdfAsImages(pdfUri, resolution, rotations || null);
  }
  return await renderPdfToImages(pdfUri, rotations);
}

export async function zipFiles(fileUris: string[], zipName: string): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.zipFiles === 'function') {
    return await ExpoPdfToImage.zipFiles(fileUris, zipName);
  }
  throw new Error('Native zipFiles not available');
}

export async function clearPdfCache(pdfUri?: string): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.clearPdfCache === 'function') {
    return await ExpoPdfToImage.clearPdfCache(pdfUri || null);
  }
  return false;
}

export function playShutterSound(): boolean {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.playShutterSound === 'function') {
    return ExpoPdfToImage.playShutterSound();
  }
  return false;
}

export function turnOffTorch(): boolean {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.turnOffTorch === 'function') {
    return ExpoPdfToImage.turnOffTorch();
  }
  return false;
}

export async function getPdfThumbnail(pdfUri: string): Promise<string | null> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getPdfThumbnail === 'function') {
    try {
      const res = await ExpoPdfToImage.getPdfThumbnail(pdfUri);
      if (res) return res;
    } catch {
      // fallback below
    }
  }
  try {
    const page0 = await renderPdfPage(pdfUri, 0);
    if (page0) return page0;
  } catch {
    // ignore
  }
  return null;
}

export interface BuildPdfResult {
  pdfUri: string;
  byteSize: number;
}

export async function buildPdfFromImages(
  imageUris: string[],
  rotations?: number[],
  title?: string,
  outPath?: string
): Promise<BuildPdfResult> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.buildPdfFromImages === 'function') {
    return await ExpoPdfToImage.buildPdfFromImages(
      imageUris,
      rotations || null,
      title || null,
      outPath || null
    );
  }
  throw new Error('Native buildPdfFromImages not available');
}

export async function saveToPublicDocuments(
  filePath: string,
  fileName: string,
  mimeType: string = 'application/pdf'
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.saveToPublicDocuments === 'function') {
    return await ExpoPdfToImage.saveToPublicDocuments(filePath, fileName, mimeType);
  }
  return filePath;
}

export async function applyWatermarkToImage(
  imageUri: string,
  text: string,
  colorHex: string = '#EF4444',
  opacity: number = 0.28
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.applyWatermarkToImage === 'function') {
    return await ExpoPdfToImage.applyWatermarkToImage(imageUri, text, colorHex, opacity);
  }
  return imageUri;
}

export async function applyWatermarkToMultipleImages(
  imageUris: string[],
  text: string,
  colorHex: string = '#EF4444',
  opacity: number = 0.28
): Promise<string[]> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.applyWatermarkToMultipleImages === 'function') {
    return await ExpoPdfToImage.applyWatermarkToMultipleImages(imageUris, text, colorHex, opacity);
  }
  return imageUris;
}

export async function applySignatureToImage(
  imageUri: string,
  signatureUri: string,
  relX: number,
  relY: number,
  relW: number,
  relH: number
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.applySignatureToImage === 'function') {
    return await ExpoPdfToImage.applySignatureToImage(imageUri, signatureUri, relX, relY, relW, relH);
  }
  return imageUri;
}

export async function applyFilterToImage(
  imageUri: string,
  filter: 'none' | 'auto' | 'bw' | 'color' | 'photo' | string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.applyFilterToImage === 'function') {
    return await ExpoPdfToImage.applyFilterToImage(imageUri, filter);
  }
  return imageUri;
}

export async function extractTextFromImage(
  imageUri: string,
  lang: string = 'eng+hin'
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.extractTextFromImage === 'function') {
    return await ExpoPdfToImage.extractTextFromImage(imageUri, lang);
  }
  return '';
}

export interface ImageHashAndSharpness {
  hash: string;
  sharpness: number;
}

export async function computeImageHashAndSharpness(imageUri: string): Promise<ImageHashAndSharpness> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.computeImageHashAndSharpness === 'function') {
    try {
      return await ExpoPdfToImage.computeImageHashAndSharpness(imageUri);
    } catch (e) {
      console.warn('[ExpoPdfToImage] computeImageHashAndSharpness error:', e);
    }
  }
  return { hash: '', sharpness: 0 };
}

export interface StorageStatsResult {
  totalBytes: number;
  availableBytes: number;
  appCacheBytes: number;
}

export async function getStorageStats(): Promise<StorageStatsResult> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getStorageStats === 'function') {
    try {
      return await ExpoPdfToImage.getStorageStats();
    } catch (e) {
      console.warn('[ExpoPdfToImage] getStorageStats error:', e);
    }
  }
  return { totalBytes: 0, availableBytes: 0, appCacheBytes: 0 };
}

export interface BatchDeleteResult {
  deleted: number;
  freedBytes: number;
  failed: number;
}

export async function batchDeleteFiles(uris: string[]): Promise<BatchDeleteResult> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.batchDeleteFiles === 'function') {
    try {
      return await ExpoPdfToImage.batchDeleteFiles(uris);
    } catch (e) {
      console.warn('[ExpoPdfToImage] batchDeleteFiles error:', e);
    }
  }
  return { deleted: 0, freedBytes: 0, failed: 0 };
}

export async function rotatePdfPagesNative(
  pdfUri: string,
  rotations: Record<number, number>,
  outPath?: string,
  mode: 'delta' | 'absolute' = 'delta'
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.rotatePdfPages === 'function') {
    const rotMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(rotations)) {
      rotMap[k.toString()] = v;
    }
    return await ExpoPdfToImage.rotatePdfPages(pdfUri, rotMap, outPath || null, mode);
  }
  throw new Error('Native rotatePdfPages not available');
}

export interface PageReplacementNativeSpec {
  pageIndex: number;
  imageUri?: string;
  rotation?: number;
}

export async function replacePdfPagesNative(
  pdfUri: string,
  replacements: PageReplacementNativeSpec[],
  outPath?: string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.replacePdfPages === 'function') {
    return await ExpoPdfToImage.replacePdfPages(pdfUri, replacements, outPath || null);
  }
  throw new Error('Native replacePdfPages not available');
}

export async function deletePdfPagesNative(
  pdfUri: string,
  pageIndices: number[],
  outPath?: string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.deletePdfPages === 'function') {
    return await ExpoPdfToImage.deletePdfPages(pdfUri, pageIndices, outPath || null);
  }
  throw new Error('Native deletePdfPages not available');
}

export async function reorderPdfPagesNative(
  pdfUri: string,
  newPageOrder: number[],
  outPath?: string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.reorderPdfPages === 'function') {
    return await ExpoPdfToImage.reorderPdfPages(pdfUri, newPageOrder, outPath || null);
  }
  throw new Error('Native reorderPdfPages not available');
}

export async function extractPdfPagesNative(
  pdfUri: string,
  pageIndices: number[],
  outPath: string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.extractPdfPages === 'function') {
    return await ExpoPdfToImage.extractPdfPages(pdfUri, pageIndices, outPath);
  }
  throw new Error('Native extractPdfPages not available');
}

export async function mergePdfFilesNative(
  pdfUris: string[],
  outPath: string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.mergePdfFiles === 'function') {
    return await ExpoPdfToImage.mergePdfFiles(pdfUris, outPath);
  }
  throw new Error('Native mergePdfFiles not available');
}

export async function insertPdfPagesNative(
  targetPdfUri: string,
  insertPdfUri: string,
  atIndex: number,
  outPath?: string
): Promise<string> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.insertPdfPages === 'function') {
    return await ExpoPdfToImage.insertPdfPages(targetPdfUri, insertPdfUri, atIndex, outPath || null);
  }
  throw new Error('Native insertPdfPages not available');
}

export async function splitPdfNative(
  pdfUri: string,
  splitBoundaries: number[],
  baseName: string
): Promise<string[]> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.splitPdf === 'function') {
    return await ExpoPdfToImage.splitPdf(pdfUri, splitBoundaries, baseName);
  }
  throw new Error('Native splitPdf not available');
}

export interface StorageVolumeInfo {
  description: string;
  path: string;
  isPrimary: boolean;
  isRemovable: boolean;
  state: string;
  totalBytes: number;
  freeBytes: number;
}

export async function getExternalStorageVolumes(): Promise<StorageVolumeInfo[]> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getExternalStorageVolumes === 'function') {
    return await ExpoPdfToImage.getExternalStorageVolumes();
  }
  return [];
}

export async function openFileInNativeViewerNative(
  fileUri: string,
  mimeType: string,
  fileName?: string
): Promise<{ success: boolean; error?: string }> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.openFileInNativeViewer === 'function') {
    return await ExpoPdfToImage.openFileInNativeViewer(fileUri, mimeType, fileName || null);
  }
  return { success: false, error: 'Native openFileInNativeViewer not available' };
}

export interface LanSharedFile {
  id?: string;
  name: string;
  uri: string;
  size: number;
  mimeType: string;
}

export interface LanServerInfo {
  isRunning: boolean;
  serverUrl?: string;
  ip?: string;
  port?: number;
  fileCount: number;
}

export async function startLanServerNative(
  files: LanSharedFile[],
  port?: number
): Promise<LanServerInfo> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.startLanServer === 'function') {
    return await ExpoPdfToImage.startLanServer(files, port || null);
  }
  return { isRunning: false, fileCount: 0 };
}

export async function stopLanServerNative(): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.stopLanServer === 'function') {
    return await ExpoPdfToImage.stopLanServer();
  }
  return false;
}

export async function getLanServerStatusNative(): Promise<LanServerInfo> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getLanServerStatus === 'function') {
    return await ExpoPdfToImage.getLanServerStatus();
  }
  return { isRunning: false, fileCount: 0 };
}

export async function getDeviceWifiIpNative(): Promise<string | null> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getDeviceWifiIp === 'function') {
    return await ExpoPdfToImage.getDeviceWifiIp();
  }
  return null;
}

export interface FtpServerInfo {
  isRunning: boolean;
  ftpUrl?: string;
  ip?: string;
  port?: number;
  rootPath?: string;
  activeConnections?: number;
}

export async function startFtpServerNative(
  port?: number,
  rootPath?: string
): Promise<FtpServerInfo> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.startFtpServer === 'function') {
    return await ExpoPdfToImage.startFtpServer(port || null, rootPath || null);
  }
  return { isRunning: false };
}

export async function stopFtpServerNative(): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.stopFtpServer === 'function') {
    return await ExpoPdfToImage.stopFtpServer();
  }
  return false;
}

export async function getFtpServerStatusNative(): Promise<FtpServerInfo> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.getFtpServerStatus === 'function') {
    return await ExpoPdfToImage.getFtpServerStatus();
  }
  return { isRunning: false };
}

export function hasAllFilesPermission(): boolean {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.hasAllFilesPermission === 'function') {
    return ExpoPdfToImage.hasAllFilesPermission();
  }
  return true;
}

export async function startBackgroundServiceNative(title?: string, message?: string): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.startBackgroundService === 'function') {
    return await ExpoPdfToImage.startBackgroundService(title || null, message || null);
  }
  return false;
}

export async function updateBackgroundServiceNative(
  title?: string,
  message?: string,
  progress?: number,
  max?: number
): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.updateBackgroundService === 'function') {
    return await ExpoPdfToImage.updateBackgroundService(title || null, message || null, progress ?? -1, max ?? -1);
  }
  return false;
}

export async function stopBackgroundServiceNative(): Promise<boolean> {
  if (ExpoPdfToImage && typeof ExpoPdfToImage.stopBackgroundService === 'function') {
    return await ExpoPdfToImage.stopBackgroundService();
  }
  return false;
}
