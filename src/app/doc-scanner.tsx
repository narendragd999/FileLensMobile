/**
 * doc-scanner.tsx — Dedicated Google ML Kit Document Scanner for FileLensPro.
 *
 * Exclusively launches Google's ML Kit Document Scanner:
 *   - Real-time "Position document in the frame" edge detection
 *   - Live contour border tracing & corner detection
 *   - Automatic desk, table, and shadow exclusion mask
 *   - Dynamic 3D perspective correction & paper whitening
 *   - Multi-page batch mode (default), single mode, & 2-in-1 ID card mode
 *   - 50ms ultra-fast direct searchable PDF indexing & background OCR
 *   - Zero in-app camera viewfinder — only Google Document Scanner is presented!
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useThemeColors } from '../utils/theme';
import {
  ScanPage,
  generateSearchablePdf,
  generateIdCard2In1Pdf,
  indexScannedDocument,
  runBackgroundOcrForScan,
} from '../services/scannerService';
import { insertPagesIntoPdf, getPdfPagesInfo } from '../services/pdfWorkbenchService';
import { invalidatePdfRenderCache } from '../services/indexerService';
import { updateDocumentPageCount } from '../services/database';
import { launchGoogleDocScanner } from 'expo-pdf-to-image';
import { ocrQueueManager } from '../services/ocrQueueManager';

function getAutoScanName(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;
}

export default function DocScannerScreen() {
  const COLORS = useThemeColors();
  const router = useRouter();

  const params = useLocalSearchParams<{
    targetPdfUri?: string;
    targetFileName?: string;
    appendMode?: string;
    returnToOrganizer?: string;
    returnToCard?: string;
    sessionKey?: string;
    initialMode?: string;
    t?: string;
  }>();

  const targetPdfUri = params.targetPdfUri ? decodeURIComponent(params.targetPdfUri) : null;
  const targetFileName = params.targetFileName ? decodeURIComponent(params.targetFileName) : 'Document.pdf';
  const isAppendMode = params.appendMode === 'true' && !!targetPdfUri;
  const scanMode = params.initialMode === 'idcard' ? 'idcard' : (params.initialMode === 'single' ? 'single' : 'batch');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Opening Live Edge Document Scanner...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isScannerInFlightRef = useRef<boolean>(false);
  const lastHandledTRef = useRef<string | null>(null);

  // Pause background OCR while scanning
  useEffect(() => {
    ocrQueueManager.setCameraActive(true);
    return () => {
      ocrQueueManager.setCameraActive(false);
    };
  }, []);

  const handleExit = useCallback(() => {
    isScannerInFlightRef.current = false;
    setIsProcessing(false);
    setStatusMessage('Opening Live Edge Document Scanner...');
    if (params.returnToCard === 'true') {
      router.replace('/cards');
    } else if (params.returnToOrganizer === 'true' && targetPdfUri) {
      router.replace(
        `/page-organizer?pdfUri=${encodeURIComponent(targetPdfUri)}&fileName=${encodeURIComponent(
          targetFileName || 'document.pdf'
        )}&t=${Date.now()}`
      );
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/documents');
    }
  }, [router, params.returnToCard, params.returnToOrganizer, targetPdfUri, targetFileName]);

  // Core save handler
  const handleCommitSave = useCallback(
    async (processedPages: ScanPage[]) => {
      setIsProcessing(true);
      setStatusMessage('Saving PDF document...');

      try {
        if (processedPages.length === 0) {
          handleExit();
          return;
        }

        // 1. Append Mode
        if (isAppendMode && targetPdfUri) {
          let tempPdfUri: string | null = null;
          try {
            const tempPdf = await generateSearchablePdf(processedPages, {
              title: `temp_append_${Date.now()}`,
            });
            tempPdfUri = tempPdf.pdfUri;

            const pagesInfo = await getPdfPagesInfo(targetPdfUri);
            const appendPos = pagesInfo.length;

            const result = await insertPagesIntoPdf(
              targetPdfUri,
              tempPdf.pdfUri,
              appendPos,
              targetFileName || undefined
            );

            invalidatePdfRenderCache(targetPdfUri);
            invalidatePdfRenderCache(result.uri);

            await updateDocumentPageCount(result.uri, appendPos + processedPages.length).catch(() => {});

            runBackgroundOcrForScan(result.uri, targetFileName || 'Document.pdf', processedPages, 'Document');

            setIsProcessing(false);
            setStatusMessage('Opening Live Edge Document Scanner...');

            if (params.returnToOrganizer === 'true') {
              router.replace(
                `/page-organizer?pdfUri=${encodeURIComponent(result.uri)}&fileName=${encodeURIComponent(
                  targetFileName || 'document.pdf'
                )}&t=${Date.now()}`
              );
            } else {
              router.replace(`/documents?openDocUri=${encodeURIComponent(result.uri)}`);
            }
            return;
          } finally {
            if (tempPdfUri) {
              FileSystem.deleteAsync(tempPdfUri, { idempotent: true }).catch(() => {});
            }
          }
        }

        // 2. ID Card Mode (2-in-1 format)
        if (scanMode === 'idcard') {
          try {
            setStatusMessage(processedPages.length > 1 ? 'Assembling Front & Back onto 1 Single PDF Page...' : 'Assembling ID Card PDF...');
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const displayTitle = processedPages.length > 1 ? 'IDENTITY CARD (2-IN-1)' : 'IDENTITY CARD';
            const finalFileName = `ID_Card_${dateStr}_${Date.now()}.pdf`;

            const frontPage = processedPages[0];
            const backPage = processedPages.length > 1 ? processedPages[1] : undefined;
            const { pdfUri, byteSize } = await generateIdCard2In1Pdf(frontPage, backPage, { title: displayTitle });

            await indexScannedDocument({
              uri: pdfUri,
              fileName: finalFileName,
              fileSize: byteSize,
              ocrText: '',
              category: params.returnToCard === 'true' ? 'Cards' : 'Document',
              pageCount: 1,
              isCard: true,
            });

            runBackgroundOcrForScan(pdfUri, finalFileName, processedPages, params.returnToCard === 'true' ? 'Cards' : 'Document');

            setIsProcessing(false);
            setStatusMessage('Opening Live Edge Document Scanner...');

            if (params.returnToCard === 'true') {
              router.replace({ pathname: '/cards', params: { idCardSaved: 'true', hasBack: backPage ? 'true' : 'false' } } as any);
            } else {
              router.replace({ pathname: '/documents', params: { openDocUri: pdfUri, idCardSaved: 'true', hasBack: backPage ? 'true' : 'false' } } as any);
            }
            return;
          } catch (idErr) {
            console.warn('[doc-scanner] ID Card format error:', idErr);
          }
        }

        // 2.5 Single Card Mode (Camera Scanner returning to Card Wallet)
        if (params.returnToCard === 'true') {
          setIsProcessing(false);
          setStatusMessage('Opening Live Edge Document Scanner...');
          if (processedPages.length > 0 && processedPages[0].uri) {
            router.replace(`/create-card?fileUri=${encodeURIComponent(processedPages[0].uri)}`);
          } else {
            router.replace('/cards');
          }
          return;
        }

        // 3. Standard Multi-Page Document Mode
        const autoName = getAutoScanName();
        const finalFileName = `${autoName}.pdf`;

        setStatusMessage('Assembling PDF...');
        const { pdfUri, byteSize } = await generateSearchablePdf(processedPages, {
          title: autoName,
        });

        await indexScannedDocument({
          uri: pdfUri,
          fileName: finalFileName,
          fileSize: byteSize,
          ocrText: '',
          category: 'Document',
          bookmark: false,
          pageCount: processedPages.length,
        });

        runBackgroundOcrForScan(pdfUri, finalFileName, processedPages, 'Document');

        setIsProcessing(false);
        setStatusMessage('Opening Live Edge Document Scanner...');

        router.replace(`/documents?openDocUri=${encodeURIComponent(pdfUri)}`);
      } catch (err: any) {
        console.warn('[doc-scanner] Save failed:', err);
        setErrorMessage(err?.message || 'Failed to save document.');
        setIsProcessing(false);
      }
    },
    [isAppendMode, targetPdfUri, targetFileName, params.returnToOrganizer, params.returnToCard, scanMode, router, handleExit]
  );

  // Launch Google Document Scanner
  const runGoogleScanner = useCallback(async () => {
    if (isScannerInFlightRef.current) return;
    isScannerInFlightRef.current = true;
    setErrorMessage(null);
    setIsProcessing(true);
    setStatusMessage('Opening Live Edge Document Scanner...');

    try {
      const result = await launchGoogleDocScanner();

      // If user canceled or pressed Back in Google Scanner, immediately navigate back!
      if (result.canceled || !result.success) {
        setIsProcessing(false);
        handleExit();
        return;
      }

      // If user captured pages
      if (result.pages && result.pages.length > 0) {
        setStatusMessage('Saving scanned document...');
        const processedPages: ScanPage[] = [];
        for (let idx = 0; idx < result.pages.length; idx++) {
          const rawUri = result.pages[idx];
          processedPages.push({
            id: `page_google_${Date.now()}_${idx}`,
            uri: rawUri,
            originalUri: rawUri,
            width: 1200,
            height: 1600,
            filter: 'magic',
            rotation: 0,
            ocrStatus: 'idle',
          });
        }

        // Fast path: If Google scanner produced ready PDF and not in append/idcard/card mode, commit in 50ms!
        if (result.pdfUri && !isAppendMode && scanMode !== 'idcard' && params.returnToCard !== 'true') {
          try {
            const autoName = getAutoScanName();
            const finalFileName = `${autoName}.pdf`;
            const destFolder = `${FileSystem.documentDirectory}scans/`;
            const dirInfo = await FileSystem.getInfoAsync(destFolder);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(destFolder, { intermediates: true });
            }
            const finalPath = `${destFolder}${finalFileName}`;
            await FileSystem.copyAsync({ from: result.pdfUri, to: finalPath });
            const fileInfo = await FileSystem.getInfoAsync(finalPath);
            const size = fileInfo.exists ? fileInfo.size : 0;

            await indexScannedDocument({
              uri: finalPath,
              fileName: finalFileName,
              fileSize: size,
              ocrText: '',
              category: 'Document',
              bookmark: false,
              pageCount: result.pages.length,
            });

            runBackgroundOcrForScan(finalPath, finalFileName, processedPages, 'Document');

            setIsProcessing(false);
            setStatusMessage('Opening Live Edge Document Scanner...');

            router.replace(`/documents?openDocUri=${encodeURIComponent(finalPath)}`);
            return;
          } catch (pdfFastErr) {
            console.warn('[doc-scanner] Fast PDF copy error, falling back to standard commit:', pdfFastErr);
          }
        }

        await handleCommitSave(processedPages);
        return;
      }

      // No pages returned and not canceled
      setIsProcessing(false);
      handleExit();
    } catch (err: any) {
      console.warn('[doc-scanner] Google scanner error:', err);
      setErrorMessage(err?.message || 'Unable to open Google Document Scanner.');
      setIsProcessing(false);
    } finally {
      isScannerInFlightRef.current = false;
    }
  }, [handleExit, handleCommitSave, isAppendMode, scanMode, router]);

  // Auto-launch Google Document Scanner on screen focus / re-entry
  useFocusEffect(
    useCallback(() => {
      if (isScannerInFlightRef.current) return;

      // Reset state for a fresh scan
      setIsProcessing(false);
      setStatusMessage('Opening Live Edge Document Scanner...');
      setErrorMessage(null);

      const timer = setTimeout(() => {
        runGoogleScanner();
      }, 80);
      return () => clearTimeout(timer);
    }, [runGoogleScanner])
  );

  // Auto-launch whenever params.t changes (new scan requested from any screen)
  useEffect(() => {
    if (params.t && params.t !== lastHandledTRef.current) {
      lastHandledTRef.current = params.t;
      if (isScannerInFlightRef.current) return;

      setIsProcessing(false);
      setStatusMessage('Opening Live Edge Document Scanner...');
      setErrorMessage(null);
      const timer = setTimeout(() => {
        runGoogleScanner();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [params.t, runGoogleScanner]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0B0F19' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />

      <View style={styles.centerContent}>
        {/* Scanner Radar Icon */}
        <View style={styles.iconWrapper}>
          <View style={styles.iconCircle}>
            <Ionicons name="scan" size={48} color="#FF6B00" />
          </View>
        </View>

        <Text style={styles.scannerTitle}>Document Scanner</Text>
        <Text style={styles.scannerSubtitle}>
          Position document in the frame • Live edge detection active
        </Text>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={24} color="#EF4444" style={{ marginBottom: 8 }} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={runGoogleScanner} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF6B00" style={{ marginBottom: 14 }} />
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}
      </View>

      {/* Bottom Dismiss / Cancel Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleExit} activeOpacity={0.75}>
          <Ionicons name="close" size={18} color="rgba(255, 255, 255, 0.7)" style={{ marginRight: 6 }} />
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  iconWrapper: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255, 107, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  scannerSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 32,
  },
  loadingBox: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    color: '#FF6B00',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginTop: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#FF6B00',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    paddingBottom: 24,
    width: '100%',
    alignItems: 'center',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
});
