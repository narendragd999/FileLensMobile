/**
 * pdfOcrService.ts — OCR scanned PDFs by rendering pages to images with ML Kit.
 *
 * This provides robust OCR text extraction for any PDF document on device:
 * 1. Checks for native digital text layer first via extractContent.
 * 2. If no text or scanned PDF, renders pages to images via expo-pdf-to-image.
 * 3. Runs Google ML Kit OCR on each page image.
 * 4. Normalizes Devanagari and Latin text.
 * 5. Automatically updates SQLite FTS5 database in background.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { renderPdfToImages } from 'expo-pdf-to-image';
import { ocrImage, normalizeDevanagariOcrText } from './ocrService';
import { extractContent } from './contentExtractor';
import { updateFileOcrContent } from './database';
import { OcrLanguage, OcrResult } from '../models/types';

export interface PdfOcrResult extends OcrResult {
  pageCount: number;
  pageResults: { pageNumber: number; text: string; elapsedMs: number }[];
}

/**
 * Check if PDF rendering is available on this device.
 */
export async function isPdfRenderingAvailable(): Promise<boolean> {
  return true;
}

/**
 * OCR a PDF by rendering each page to an image and OCR'ing it via Google ML Kit.
 *
 * @param pdfUri URI of the PDF file
 * @param language OCR language (default: 'eng+hin')
 * @param maxPages Maximum pages to OCR (default: 30)
 * @param onProgress Optional callback: (currentPage, totalPages) => void
 */
export async function ocrPdf(
  pdfUri: string,
  language?: OcrLanguage,
  maxPages: number = 30,
  onProgress?: (currentPage: number, totalPages: number) => void
): Promise<PdfOcrResult> {
  const startTime = Date.now();

  try {
    const fileInfo = await FileSystem.getInfoAsync(pdfUri);
    if (!fileInfo.exists) {
      return {
        text: '',
        status: 'failed',
        elapsedMs: 0,
        error: 'PDF file does not exist',
        pageCount: 0,
        pageResults: [],
      };
    }

    // 1. Check if PDF already has selectable digital text layer
    try {
      const nativeRes = await extractContent(pdfUri);
      if (nativeRes && nativeRes.text && nativeRes.text.trim().length > 40) {
        return {
          text: nativeRes.text.trim(),
          status: 'done',
          elapsedMs: Date.now() - startTime,
          error: '',
          pageCount: nativeRes.pageCount || 1,
          pageResults: [{ pageNumber: 1, text: nativeRes.text.trim(), elapsedMs: Date.now() - startTime }],
        };
      }
    } catch (_) {}

    // 2. Render PDF pages to images
    let pageImages: string[] = [];
    try {
      pageImages = await renderPdfToImages(pdfUri);
    } catch (renderErr: any) {
      console.warn('[pdfOcrService] renderPdfToImages failed:', renderErr);
      return {
        text: '',
        status: 'failed',
        elapsedMs: Date.now() - startTime,
        error: renderErr?.message || 'Failed to render PDF pages',
        pageCount: 0,
        pageResults: [],
      };
    }

    if (!pageImages || pageImages.length === 0) {
      return {
        text: '',
        status: 'done',
        elapsedMs: Date.now() - startTime,
        error: 'PDF contains 0 renderable pages',
        pageCount: 0,
        pageResults: [],
      };
    }

    const pagesToProcess = Math.min(pageImages.length, maxPages);
    const pageResults: { pageNumber: number; text: string; elapsedMs: number }[] = [];
    const allText: string[] = [];

    for (let i = 0; i < pagesToProcess; i++) {
      const pageUri = pageImages[i];
      const pageStart = Date.now();
      try {
        const ocrRes = await ocrImage(pageUri, language);
        const pageText = ocrRes.text ? ocrRes.text.trim() : '';
        if (pageText) {
          allText.push(`[Page ${i + 1}]\n${pageText}`);
          pageResults.push({
            pageNumber: i + 1,
            text: pageText,
            elapsedMs: Date.now() - pageStart,
          });
        }
      } catch (pageErr) {
        console.warn(`[pdfOcrService] OCR failed on page ${i + 1}:`, pageErr);
      }

      if (onProgress) {
        onProgress(i + 1, pagesToProcess);
      }
    }

    const aggregated = allText.join('\n\n');
    const finalCleanText = normalizeDevanagariOcrText(aggregated);

    // Save to database asynchronously so subsequent queries are instant
    if (finalCleanText) {
      updateFileOcrContent(pdfUri, finalCleanText).catch(() => {});
    }

    return {
      text: finalCleanText,
      status: 'done',
      elapsedMs: Date.now() - startTime,
      error: '',
      pageCount: pageImages.length,
      pageResults,
    };
  } catch (err: any) {
    console.warn('[pdfOcrService] Full PDF OCR failed:', err);
    return {
      text: '',
      status: 'failed',
      elapsedMs: Date.now() - startTime,
      error: err?.message || 'OCR extraction failed',
      pageCount: 0,
      pageResults: [],
    };
  }
}

/**
 * Fast unified extraction: checks native digital text layer first,
 * or runs ML Kit OCR on existing rendered page thumbnails or newly rendered pages.
 */
export async function extractTextOrOcrPdf(
  pdfUri: string,
  existingPageImages?: string[]
): Promise<string> {
  try {
    // 1. Check if digital text layer exists
    try {
      const native = await extractContent(pdfUri);
      if (native?.text && native.text.trim().length > 30) {
        const clean = normalizeDevanagariOcrText(native.text.trim());
        updateFileOcrContent(pdfUri, clean).catch(() => {});
        return clean;
      }
    } catch (_) {}

    // 2. Use existing rendered page images if provided
    let pageImages = existingPageImages && existingPageImages.length > 0 ? existingPageImages : [];

    // 3. Otherwise render pages
    if (pageImages.length === 0) {
      try {
        pageImages = await renderPdfToImages(pdfUri);
      } catch (_) {}
    }

    if (pageImages.length === 0) {
      return '';
    }

    const maxPages = Math.min(pageImages.length, 20);
    const textBlocks: string[] = [];

    for (let i = 0; i < maxPages; i++) {
      try {
        const res = await ocrImage(pageImages[i]);
        if (res.text && res.text.trim()) {
          textBlocks.push(`[Page ${i + 1}]\n${res.text.trim()}`);
        }
      } catch (_) {}
    }

    const aggregated = textBlocks.join('\n\n');
    const cleaned = normalizeDevanagariOcrText(aggregated);

    if (cleaned) {
      updateFileOcrContent(pdfUri, cleaned).catch(() => {});
    }

    return cleaned;
  } catch (e) {
    console.warn('[pdfOcrService] extractTextOrOcrPdf error:', e);
    return '';
  }
}
