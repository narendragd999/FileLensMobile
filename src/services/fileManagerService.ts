/**
 * fileManagerService.ts — Offline File & Folder Management Service.
 *
 * Capabilities:
 *   1. Directory traversal & item inspection (Document Storage & Subdirectories)
 *   2. Indexed Virtual Folder Explorer (Device folders: Download, Camera, Documents, etc.)
 *   3. Open with Native Android Viewers (PDF, Images, Audio, Docs) via IntentLauncher
 *   4. Sharing via Android Share Sheet
 *   5. File operations: Rename, Move, Copy, Delete, and New Folder
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { formatSize, formatDate } from '../utils/format';
import { getDatabase } from './database';
import {
  openFileInNativeViewerNative,
  getExternalStorageVolumes,
  startLanServerNative,
  stopLanServerNative,
  getLanServerStatusNative,
  getDeviceWifiIpNative,
  hasAllFilesPermission,
  LanSharedFile,
  LanServerInfo,
  StorageVolumeInfo,
} from 'expo-pdf-to-image';

export interface StorageItem {
  id?: number;
  uri: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  extension: string;
  mimeType: string;
  itemCount?: number;
  parentUri?: string;
  isVirtualFolder?: boolean;
}

export interface FolderNode {
  name: string;
  path: string;
  fileCount: number;
  totalBytes: number;
  iconName: string;
  isPhysicalPath?: boolean;
  isSdCard?: boolean;
  freeBytes?: number;
}

/**
 * Returns standard MIME type for given file extension
 */
export function getMimeType(extension: string): string {
  const ext = extension.toLowerCase().replace(/^\./, '');
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'txt': return 'text/plain';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'csv': return 'text/csv';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    case 'mp4': return 'video/mp4';
    case 'zip': return 'application/zip';
    default: return '*/*';
  }
}

/**
 * Normalizes any storage path to a valid file URI (file://...) suitable for expo-file-system on Android.
 */
export function normalizeStorageUri(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('content://') || uri.startsWith('asset://')) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('/')) {
    return 'file://' + uri;
  }
  return uri;
}

/**
 * Extracts a human-friendly folder label from a file URI or path, detecting External SD Cards
 */
export { hasAllFilesPermission };

export const STANDARD_FOLDERS: { name: string; paths: string[]; iconName: string }[] = [
  {
    name: 'Internal Storage',
    paths: ['file:///storage/emulated/0', '/storage/emulated/0'],
    iconName: 'phone-portrait',
  },
  {
    name: 'Downloads',
    paths: ['file:///storage/emulated/0/Download', '/storage/emulated/0/Download'],
    iconName: 'download',
  },
  {
    name: 'Documents',
    paths: ['file:///storage/emulated/0/Documents', '/storage/emulated/0/Documents'],
    iconName: 'document-text',
  },
  {
    name: 'Camera Photos',
    paths: ['file:///storage/emulated/0/DCIM/Camera', 'file:///storage/emulated/0/DCIM', '/storage/emulated/0/DCIM/Camera'],
    iconName: 'camera',
  },
  {
    name: 'Pictures',
    paths: ['file:///storage/emulated/0/Pictures', '/storage/emulated/0/Pictures'],
    iconName: 'images',
  },
  {
    name: 'WhatsApp Media',
    paths: [
      'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media',
      'file:///storage/emulated/0/WhatsApp/Media',
      '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media',
      '/storage/emulated/0/WhatsApp/Media',
    ],
    iconName: 'logo-whatsapp',
  },
];

export function getStandardPathForFolder(folderName: string): string | null {
  const match = STANDARD_FOLDERS.find(f => f.name.toLowerCase() === folderName.toLowerCase() || folderName.toLowerCase().includes(f.name.toLowerCase()));
  if (match && match.paths.length > 0) {
    return normalizeStorageUri(match.paths[0]);
  }
  return null;
}

export function extractFolderName(uri: string): string {
  if (!uri) return 'Internal Storage';
  const decoded = decodeURIComponent(uri);

  // Check for external SD Cards & secondary storage mounts
  // Paths like /storage/3A12-1C04/DCIM/Camera/... or /storage/0123-4567/...
  const sdMatch = decoded.match(/\/storage\/([A-Za-z0-9_-]+)\/(.*)/);
  if (sdMatch && sdMatch[1] !== 'emulated' && sdMatch[1] !== 'self') {
    const volId = sdMatch[1];
    const subPath = sdMatch[2] || '';
    if (subPath.includes('DCIM') || subPath.includes('Camera')) return `SD Card: Camera Photos`;
    if (subPath.includes('Download')) return `SD Card: Downloads`;
    if (subPath.includes('Documents')) return `SD Card: Documents`;
    if (subPath.includes('Pictures')) return `SD Card: Pictures`;
    if (subPath.includes('WhatsApp')) return `SD Card: WhatsApp Media`;

    const firstFolder = subPath.split('/')[0];
    if (firstFolder && firstFolder.length > 0 && firstFolder.indexOf('.') === -1) {
      return `SD Card: ${firstFolder}`;
    }
    return `SD Card (${volId})`;
  }

  if (decoded.includes('/DCIM/Camera') || decoded.includes('/Camera')) return 'Camera Photos';
  if (decoded.includes('/Download')) return 'Downloads';
  if (decoded.includes('/Documents')) return 'Documents';
  if (decoded.includes('/WhatsApp')) return 'WhatsApp Media';
  if (decoded.includes('/Pictures')) return 'Pictures';
  if (decoded.includes('/Screenshots')) return 'Screenshots';
  if (decoded.includes(FileSystem.documentDirectory || '')) return 'App Documents';
  if (decoded.includes(FileSystem.cacheDirectory || '')) return 'App Cache';

  // Fallback: extract penultimate path segment
  const parts = decoded.replace(/\/$/, '').split('/');
  if (parts.length >= 2) {
    return parts[parts.length - 2] || 'Storage';
  }
  return 'Storage';
}

/**
 * Loads all indexed device folders grouped by directory name, including External SD Cards
 */
export async function getIndexedFolders(): Promise<FolderNode[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    uri: string;
    size: number;
    name: string;
  }>('SELECT uri, size, name FROM files WHERE size > 0');

  const folderMap = new Map<string, { count: number; bytes: number; path?: string; isPhysical?: boolean; isSd?: boolean; freeBytes?: number }>();

  // Ensure App Documents always appears
  folderMap.set('App Documents', { count: 0, bytes: 0, path: FileSystem.documentDirectory || '', isPhysical: true });

  // Probe standard physical device directories directly (so files & folders show up immediately without indexing)
  for (const std of STANDARD_FOLDERS) {
    for (const p of std.paths) {
      try {
        const normP = normalizeStorageUri(p);
        const info = await FileSystem.getInfoAsync(normP);
        if (info.exists && info.isDirectory) {
          let fileCount = 0;
          try {
            const children = await FileSystem.readDirectoryAsync(normP.endsWith('/') ? normP : normP + '/');
            fileCount = children.filter(c => !c.startsWith('.')).length;
          } catch {}
          folderMap.set(std.name, {
            count: fileCount,
            bytes: 0,
            path: normP,
            isPhysical: true,
          });
          break;
        }
      } catch (_) {}
    }
  }

  // Probe external SD Card / USB OTG hardware volumes
  try {
    const volumes = await getExternalStorageVolumes();
    for (const vol of volumes) {
      if (vol.isRemovable || !vol.isPrimary) {
        const sdLabel = `SD Card (${vol.description || 'Removable'})`;
        const usedBytes = vol.totalBytes > vol.freeBytes ? vol.totalBytes - vol.freeBytes : 0;
        folderMap.set(sdLabel, {
          count: 0,
          bytes: usedBytes,
          freeBytes: vol.freeBytes,
          path: normalizeStorageUri(vol.path),
          isPhysical: true,
          isSd: true,
        });
      }
    }
  } catch (vErr) {
    console.warn('[fileManagerService] Error fetching storage volumes:', vErr);
  }

  // Pre-load all PDFs to compute dedicated PDF Documents stats
  try {
    const pdfs = await getAllPdfStorageItems();
    if (pdfs.length > 0) {
      const pdfBytes = pdfs.reduce((acc, it) => acc + (it.size || 0), 0);
      folderMap.set('PDF Documents', {
        count: pdfs.length,
        bytes: pdfBytes,
        path: 'PDF Documents',
        isPhysical: false,
      });
    }
  } catch (pdfErr) {
    console.warn('[fileManagerService] Error fetching PDF stats for folder list:', pdfErr);
  }

  for (const r of rows) {
    const fName = extractFolderName(r.uri);
    const curr = folderMap.get(fName) || { count: 0, bytes: 0 };
    curr.count = (curr.count || 0) + 1;
    curr.bytes = (curr.bytes || 0) + (r.size || 0);
    if (fName.startsWith('SD Card')) {
      curr.isSd = true;
    }
    folderMap.set(fName, curr);
  }

  const result: FolderNode[] = [];
  for (const [name, stats] of folderMap.entries()) {
    let iconName = 'folder';
    if (name === 'Internal Storage') iconName = 'phone-portrait';
    else if (name === 'PDF Documents') iconName = 'document-text';
    else if (name.startsWith('SD Card')) iconName = 'hardware-chip';
    else if (name.includes('Camera') || name.includes('Photos')) iconName = 'camera';
    else if (name.includes('Downloads')) iconName = 'download';
    else if (name.includes('WhatsApp')) iconName = 'logo-whatsapp';
    else if (name.includes('Documents')) iconName = 'document-text';
    else if (name.includes('App Documents')) iconName = 'folder-open';
    else if (name.includes('Pictures')) iconName = 'images';

    result.push({
      name,
      path: stats.path || name,
      fileCount: stats.count,
      totalBytes: stats.bytes,
      freeBytes: stats.freeBytes,
      iconName,
      isPhysicalPath: stats.isPhysical,
      isSdCard: stats.isSd,
    });
  }

  // Sort: Internal Storage & PDF Documents first, SD Cards, then App Documents / Downloads / Camera, then by size
  result.sort((a, b) => {
    if (a.name === 'Internal Storage') return -1;
    if (b.name === 'Internal Storage') return 1;
    if (a.name === 'PDF Documents') return -1;
    if (b.name === 'PDF Documents') return 1;
    if (a.isSdCard && !b.isSdCard) return -1;
    if (!a.isSdCard && b.isSdCard) return 1;
    return b.totalBytes - a.totalBytes;
  });
  return result;
}

/**
 * Loads all indexed PDF documents across device storage and app directories
 */
export async function getAllPdfStorageItems(): Promise<StorageItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: number;
    uri: string;
    name: string;
    extension: string;
    size: number;
    modified: string;
  }>(`
    SELECT id, uri, name, extension, size, modified
    FROM files
    WHERE (LOWER(extension) = 'pdf' OR LOWER(extension) = '.pdf' OR LOWER(name) LIKE '%.pdf' OR LOWER(uri) LIKE '%.pdf')
      AND size > 0
    ORDER BY modified DESC
  `);

  const items: StorageItem[] = [];
  const seenUris = new Set<string>();

  for (const r of rows) {
    if (seenUris.has(r.uri)) continue;
    seenUris.add(r.uri);
    items.push({
      id: r.id,
      uri: r.uri,
      name: r.name,
      isDirectory: false,
      size: r.size || 0,
      modified: r.modified || new Date().toISOString(),
      extension: 'pdf',
      mimeType: 'application/pdf',
      parentUri: 'PDF Documents',
    });
  }

  // Also sweep internal app directories: scans/ and exports/
  try {
    const docDir = FileSystem.documentDirectory || '';
    for (const sub of ['scans', 'exports']) {
      const subDir = `${docDir}${sub}/`;
      const subItems = await getDirectoryItems(subDir);
      for (const it of subItems) {
        if (!it.isDirectory && (it.extension === 'pdf' || it.name.toLowerCase().endsWith('.pdf'))) {
          if (!seenUris.has(it.uri)) {
            seenUris.add(it.uri);
            items.push(it);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[fileManagerService] Error scanning app PDF directories:', err);
  }

  // If 0 PDFs found in SQLite index, sweep standard Downloads & Documents folders for physical PDFs
  if (items.length === 0) {
    for (const folderPath of ['file:///storage/emulated/0/Download', 'file:///storage/emulated/0/Documents']) {
      try {
        const dirFiles = await getDirectoryItems(folderPath);
        for (const it of dirFiles) {
          if (!it.isDirectory && (it.extension === 'pdf' || it.name.toLowerCase().endsWith('.pdf'))) {
            if (!seenUris.has(it.uri)) {
              seenUris.add(it.uri);
              items.push(it);
            }
          }
        }
      } catch (_) {}
    }
  }

  return items;
}

/**
 * Loads all files belonging to a selected indexed folder name
 */
export async function getFilesInIndexedFolder(folderName: string): Promise<StorageItem[]> {
  if (folderName === 'PDF Documents' || folderName === 'All PDFs') {
    return await getAllPdfStorageItems();
  }

  if (folderName === 'Internal Storage') {
    try {
      const internalItems = await getDirectoryItems('file:///storage/emulated/0');
      if (internalItems.length > 0) return internalItems;
    } catch (_) {}
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: number;
    uri: string;
    name: string;
    extension: string;
    size: number;
    modified: string;
  }>('SELECT id, uri, name, extension, size, modified FROM files WHERE size > 0 ORDER BY modified DESC');

  const items: StorageItem[] = [];

  for (const r of rows) {
    const fName = extractFolderName(r.uri);
    if (fName === folderName) {
      const ext = (r.extension || r.name.split('.').pop() || '').toLowerCase().replace(/^\./, '');
      items.push({
        id: r.id,
        uri: r.uri,
        name: r.name,
        isDirectory: false,
        size: r.size || 0,
        modified: r.modified || new Date().toISOString(),
        extension: ext,
        mimeType: getMimeType(ext),
      });
    }
  }

  // CRITICAL FALLBACK: If 0 files found in SQLite index (e.g. user hasn't run full-device indexing yet),
  // read the physical filesystem directory directly!
  if (items.length === 0) {
    const physicalPath = getStandardPathForFolder(folderName);
    if (physicalPath) {
      try {
        const physicalItems = await getDirectoryItems(physicalPath);
        if (physicalItems.length > 0) {
          return physicalItems;
        }
      } catch (err) {
        console.warn('[fileManagerService] Error reading physical folder:', physicalPath, err);
      }
    }
  }

  return items;
}

/**
 * Reads physical filesystem directory (e.g. FileSystem.documentDirectory)
 */
/**
 * Recursively reads all files in a directory up to maxDepth
 */
export async function getDirectoryItemsRecursive(directoryUri: string, maxDepth: number = 2): Promise<StorageItem[]> {
  const allFiles: StorageItem[] = [];

  async function traverse(currUri: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const items = await getDirectoryItems(currUri);
      for (const it of items) {
        if (it.isDirectory) {
          await traverse(it.uri, depth + 1);
        } else {
          allFiles.push(it);
        }
      }
    } catch (_) {}
  }

  await traverse(directoryUri, 1);
  return allFiles;
}

export async function getDirectoryItems(directoryUri: string): Promise<StorageItem[]> {
  const norm = normalizeStorageUri(directoryUri);
  const normalizedUri = norm.endsWith('/') ? norm : norm + '/';
  try {
    const names = await FileSystem.readDirectoryAsync(normalizedUri);
    const items: StorageItem[] = [];

    for (const name of names) {
      if (name.startsWith('.')) continue; // skip hidden
      const itemUri = normalizedUri + name;
      try {
        const info = await FileSystem.getInfoAsync(itemUri);
        if (info.exists) {
          const isDir = info.isDirectory;
          const ext = isDir ? '' : name.split('.').pop()?.toLowerCase() || '';
          let subCount = 0;
          if (isDir) {
            try {
              const children = await FileSystem.readDirectoryAsync(itemUri);
              subCount = children.length;
            } catch {}
          }

          items.push({
            uri: itemUri,
            name,
            isDirectory: isDir,
            size: info.size || 0,
            modified: info.modificationTime
              ? new Date(info.modificationTime * 1000).toISOString()
              : new Date().toISOString(),
            extension: ext,
            mimeType: isDir ? 'folder' : getMimeType(ext),
            itemCount: subCount,
            parentUri: normalizedUri,
          });
        }
      } catch (err) {
        // Skip unreadable files safely
      }
    }

    // Sort: directories first, then alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch (err) {
    console.warn('[fileManagerService] Error reading directory:', err);
    return [];
  }
}

/**
 * Opens a file with default Android native app viewer using Native Intent / FileProvider / IntentLauncher
 */
export async function openFileWithNativeViewer(
  fileUri: string,
  mimeType: string,
  fileName?: string
): Promise<boolean> {
  if (!fileUri) return false;

  // Step 1: Try Native Intent Opener from ExpoPdfToImageModule
  try {
    const nativeRes = await openFileInNativeViewerNative(fileUri, mimeType, fileName);
    if (nativeRes && nativeRes.success) {
      return true;
    }
    if (nativeRes?.error) {
      console.warn('[fileManagerService] Native viewer error:', nativeRes.error);
    }
  } catch (nativeErr) {
    console.warn('[fileManagerService] openFileInNativeViewerNative failed:', nativeErr);
  }

  // Step 2: Safe Cache-copy Fallback using IntentLauncher
  try {
    let targetContentUri: string = fileUri;

    if (Platform.OS === 'android') {
      const isContentUri = fileUri.startsWith('content://');
      const isAppCacheOrDoc =
        (FileSystem.cacheDirectory && fileUri.startsWith(FileSystem.cacheDirectory)) ||
        (FileSystem.documentDirectory && fileUri.startsWith(FileSystem.documentDirectory));

      if (!isContentUri && !isAppCacheOrDoc) {
        // External file (Downloads, Camera, SD Card, etc.)
        // Copy to app cache so FileSystemFileProvider can resolve it 100% cleanly
        const openCacheDir = `${FileSystem.cacheDirectory}open_cache/`;
        const dirInfo = await FileSystem.getInfoAsync(openCacheDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(openCacheDir, { intermediates: true }).catch(() => {});
        }

        const safeName = (fileName || fileUri.split('/').pop() || 'document')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const localCacheUri = `${openCacheDir}${safeName}`;

        await FileSystem.copyAsync({ from: fileUri, to: localCacheUri });
        targetContentUri = await FileSystem.getContentUriAsync(localCacheUri);
      } else if (!isContentUri && isAppCacheOrDoc) {
        targetContentUri = await FileSystem.getContentUriAsync(fileUri);
      }

      // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: targetContentUri,
        type: mimeType || '*/*',
        flags: 1 | 268435456,
      });
      return true;
    } else {
      const supported = await Linking.canOpenURL(fileUri);
      if (supported) {
        await Linking.openURL(fileUri);
        return true;
      }
    }
  } catch (intentErr) {
    console.warn('[fileManagerService] IntentLauncher failed, falling back to Share sheet:', intentErr);
  }

  // Step 3: Final fallback to Sharing sheet ("Open with..." / "Share to...")
  return shareItem(fileUri, mimeType);
}

/**
 * Shares one or more items using Android ShareSheet
 */
export async function shareItem(fileUri: string, mimeType: string): Promise<boolean> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return false;

    await Sharing.shareAsync(fileUri, {
      mimeType: mimeType || '*/*',
      dialogTitle: 'Share with...',
    });
    return true;
  } catch (err) {
    console.warn('[fileManagerService] Share failed:', err);
    return false;
  }
}

/**
 * Renames a file or folder safely
 */
export async function renameItem(
  oldUri: string,
  newName: string,
  isDirectory: boolean
): Promise<{ success: boolean; newUri?: string; error?: string }> {
  try {
    const cleanName = newName.trim();
    if (!cleanName) return { success: false, error: 'Name cannot be empty' };

    const parentDir = oldUri.substring(0, oldUri.lastIndexOf('/') + 1);
    const newUri = parentDir + cleanName;

    const existsCheck = await FileSystem.getInfoAsync(newUri);
    if (existsCheck.exists) {
      return { success: false, error: 'An item with this name already exists' };
    }

    await FileSystem.moveAsync({ from: oldUri, to: newUri });

    // Update SQLite database if file was indexed
    try {
      const database = await getDatabase();
      const ext = isDirectory ? '' : cleanName.split('.').pop()?.toLowerCase() || '';
      await database.runAsync(
        'UPDATE files SET uri = ?, name = ?, extension = ? WHERE uri = ?',
        [newUri, cleanName, ext ? '.' + ext : '', oldUri]
      );
    } catch {}

    return { success: true, newUri };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Rename failed' };
  }
}

/**
 * Copies a file to a destination directory
 */
export async function copyItem(
  sourceUri: string,
  destinationDirUri: string
): Promise<{ success: boolean; newUri?: string; error?: string }> {
  try {
    const normalizedDest = destinationDirUri.endsWith('/') ? destinationDirUri : destinationDirUri + '/';
    const fileName = sourceUri.split('/').pop() || ('copy_' + Date.now());
    let targetUri = normalizedDest + fileName;

    // Handle collision by appending _copy
    let collision = await FileSystem.getInfoAsync(targetUri);
    if (collision.exists) {
      const dotIdx = fileName.lastIndexOf('.');
      if (dotIdx > 0) {
        const base = fileName.substring(0, dotIdx);
        const ext = fileName.substring(dotIdx);
        targetUri = normalizedDest + base + '_copy' + ext;
      } else {
        targetUri = normalizedDest + fileName + '_copy';
      }
    }

    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
    return { success: true, newUri: targetUri };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Copy failed' };
  }
}

/**
 * Moves a file to a destination directory
 */
export async function moveItem(
  sourceUri: string,
  destinationDirUri: string
): Promise<{ success: boolean; newUri?: string; error?: string }> {
  try {
    const normalizedDest = destinationDirUri.endsWith('/') ? destinationDirUri : destinationDirUri + '/';
    const fileName = sourceUri.split('/').pop() || ('file_' + Date.now());
    const targetUri = normalizedDest + fileName;

    await FileSystem.moveAsync({ from: sourceUri, to: targetUri });

    // Update SQLite
    try {
      const database = await getDatabase();
      await database.runAsync('UPDATE files SET uri = ? WHERE uri = ?', [targetUri, sourceUri]);
    } catch {}

    return { success: true, newUri: targetUri };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Move failed' };
  }
}

/**
 * Deletes a file or directory safely
 */
export async function deleteStorageItem(
  uri: string,
  fileId?: number
): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    if (fileId && fileId < 1_000_000) {
      const database = await getDatabase();
      await database.runAsync('DELETE FROM files WHERE id = ?', [fileId]).catch(() => {});
    }
    return true;
  } catch (err) {
    console.warn('[fileManagerService] Delete item failed:', err);
    return false;
  }
}

/**
 * Creates a new directory inside parent
 */
export async function createNewFolder(
  parentDirUri: string,
  folderName: string
): Promise<{ success: boolean; dirUri?: string; error?: string }> {
  try {
    const cleanName = folderName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '_');
    if (!cleanName) return { success: false, error: 'Invalid folder name' };

    const normalizedParent = parentDirUri.endsWith('/') ? parentDirUri : parentDirUri + '/';
    const targetUri = normalizedParent + cleanName;

    const info = await FileSystem.getInfoAsync(targetUri);
    if (info.exists) {
      return { success: false, error: 'Folder already exists' };
    }

    await FileSystem.makeDirectoryAsync(targetUri, { intermediates: true });
    return { success: true, dirUri: targetUri };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Create folder failed' };
  }
}

export interface FileDetailInfo {
  name: string;
  uri: string;
  size: number;
  formattedSize: string;
  modified: string;
  formattedDate: string;
  isDirectory: boolean;
  mimeType: string;
  extension: string;
  parentDir: string;
  canWrite: boolean;
}

/**
 * Batch copies a list of file URIs into a target destination directory
 */
export async function batchCopyItems(
  sourceUris: string[],
  destinationDirUri: string
): Promise<{ successCount: number; failedCount: number; errors: string[] }> {
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const src of sourceUris) {
    const res = await copyItem(src, destinationDirUri);
    if (res.success) {
      successCount++;
    } else {
      failedCount++;
      if (res.error) errors.push(res.error);
    }
  }

  return { successCount, failedCount, errors };
}

/**
 * Batch moves a list of file URIs into a target destination directory
 */
export async function batchMoveItems(
  sourceUris: string[],
  destinationDirUri: string
): Promise<{ successCount: number; failedCount: number; errors: string[] }> {
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const src of sourceUris) {
    const res = await moveItem(src, destinationDirUri);
    if (res.success) {
      successCount++;
    } else {
      failedCount++;
      if (res.error) errors.push(res.error);
    }
  }

  return { successCount, failedCount, errors };
}

/**
 * Retrieves detailed file metadata including permissions and timestamps
 */
export async function getFileDetails(item: StorageItem): Promise<FileDetailInfo> {
  const uri = item.uri;
  let size = item.size || 0;
  let modified = item.modified || new Date().toISOString();
  let isDir = item.isDirectory;

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      size = info.size || size;
      if (info.modificationTime) {
        modified = new Date(info.modificationTime * 1000).toISOString();
      }
      isDir = info.isDirectory;
    }
  } catch (err) {
    console.warn('[fileManagerService] Error getting detailed info for', uri, err);
  }

  const cleanName = item.name || uri.split('/').pop() || 'Unknown';
  const parent = uri.substring(0, uri.lastIndexOf('/'));
  const ext = isDir ? '' : (item.extension || cleanName.split('.').pop() || '').toLowerCase();

  return {
    name: cleanName,
    uri,
    size,
    formattedSize: isDir ? `${item.itemCount || 0} items` : formatSize(size),
    modified,
    formattedDate: formatDate(modified),
    isDirectory: isDir,
    mimeType: isDir ? 'folder' : item.mimeType || getMimeType(ext),
    extension: ext,
    parentDir: parent,
    canWrite: !uri.startsWith('content://'),
  };
}
