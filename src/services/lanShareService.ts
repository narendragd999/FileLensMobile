/**
 * lanShareService.ts — Offline WiFi & Local Area Network File Sharing Service.
 *
 * Capabilities:
 *   1. Starts embedded high-speed HTTP file server on device's local WiFi IP
 *   2. Generates easy access URL (e.g. http://192.168.1.15:8088)
 *   3. Allows any PC, Mac, Linux, iPhone, or Android device on same WiFi to view & download files
 *   4. Zero cloud, 100% offline, consumes 0 MB internet data
 */

import {
  startLanServerNative,
  stopLanServerNative,
  getLanServerStatusNative,
  getDeviceWifiIpNative,
  startFtpServerNative,
  stopFtpServerNative,
  getFtpServerStatusNative,
  LanSharedFile,
  LanServerInfo,
  FtpServerInfo,
} from 'expo-pdf-to-image';
import * as FileSystem from 'expo-file-system/legacy';
import {
  StorageItem,
  getDirectoryItemsRecursive,
  getAllPdfStorageItems,
  getDirectoryItems,
} from './fileManagerService';

export interface LanShareState {
  isRunning: boolean;
  serverUrl: string;
  ip: string;
  port: number;
  files: LanSharedFile[];
}

/**
 * Starts the LAN/WiFi file server for selected storage items
 */
export async function startLanSharing(
  items: StorageItem[],
  port: number = 8088
): Promise<LanServerInfo> {
  let targetItems = items;

  // If no items were selected, automatically share available files from App Documents / Downloads
  if (targetItems.length === 0) {
    try {
      const pdfs = await getAllPdfStorageItems();
      if (pdfs.length > 0) {
        targetItems = pdfs;
      } else {
        const appDocs = await getDirectoryItems(FileSystem.documentDirectory || '');
        if (appDocs.length > 0) {
          targetItems = appDocs;
        } else {
          const dlItems = await getDirectoryItems('/storage/emulated/0/Download');
          if (dlItems.length > 0) targetItems = dlItems;
        }
      }
    } catch (_) {}
  }

  // If any item is a directory, expand its child files recursively
  const expandedFiles: StorageItem[] = [];
  for (const item of targetItems) {
    if (item.isDirectory) {
      try {
        const childItems = await getDirectoryItemsRecursive(item.uri);
        if (childItems.length > 0) {
          expandedFiles.push(...childItems);
        } else {
          expandedFiles.push(item);
        }
      } catch (_) {
        expandedFiles.push(item);
      }
    } else {
      expandedFiles.push(item);
    }
  }

  const lanFiles: LanSharedFile[] = expandedFiles.map((item, index) => ({
    id: item.id?.toString() || `${index}_${item.name}`,
    name: item.name,
    uri: item.uri,
    size: item.size || 0,
    mimeType: item.mimeType || '*/*',
  }));

  return await startLanServerNative(lanFiles, port);
}

/**
 * Stops the LAN/WiFi file server
 */
export async function stopLanSharing(): Promise<boolean> {
  return await stopLanServerNative();
}

/**
 * Gets the current status of the LAN file server
 */
export async function getLanSharingStatus(): Promise<LanServerInfo> {
  return await getLanServerStatusNative();
}

/**
 * Starts the built-in FTP server for full PC File Explorer access
 */
export async function startFtpSharing(
  port: number = 2121,
  rootPath?: string
): Promise<FtpServerInfo> {
  return await startFtpServerNative(port, rootPath);
}

/**
 * Stops the FTP server
 */
export async function stopFtpSharing(): Promise<boolean> {
  return await stopFtpServerNative();
}

/**
 * Gets current FTP server status
 */
export async function getFtpSharingStatus(): Promise<FtpServerInfo> {
  return await getFtpServerStatusNative();
}

/**
 * Gets the device's local WiFi IP address
 */
export async function getDeviceWifiIp(): Promise<string | null> {
  return await getDeviceWifiIpNative();
}

export type { FtpServerInfo, LanServerInfo };
