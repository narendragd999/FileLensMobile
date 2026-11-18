/**
 * ocrService.ts — OCR service via Native ML Kit (rn-mlkit-ocr).
 *
 * This version uses Google's ML Kit Text Recognition v2 with Devanagari support.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '../store/useStore';
import { OcrLanguage, OcrResult } from '../models/types';
import { recognizeText, DetectorType } from 'rn-mlkit-ocr';
import { extractTextFromImage } from 'expo-pdf-to-image';

let currentLanguage: OcrLanguage = 'eng+hin';

export function setWebViewRef(ref: any) {
  // Deprecated. Kept for backward compatibility.
}

export function handleWebViewMessage(event: any) {
  // Deprecated
}

export async function initOcr(language: OcrLanguage = 'eng+hin'): Promise<void> {
  currentLanguage = language;
  useStore.getState().setTessReady(true);
}

export async function isOcrAvailable(): Promise<boolean> {
  return true;
}

export async function getOcrVersion(): Promise<string> {
  return 'OCR';
}

export async function getInstalledOcrLanguages(): Promise<string[]> {
  return ['eng', 'hin'];
}

/**
 * Intelligently repairs broken Devanagari kerning & interstitial spaces produced by OCR on complex PDFs/images.
 * (e.g. "परि णा म" -> "परिणाम", "परी क्षा" -> "परीक्षा", "शि क्षा" -> "शिक्षा", "मा ध्यमि क" -> "माध्यमिक")
 */
export function normalizeDevanagariOcrText(text: string): string {
  if (!text) return '';

  // 0. Universal Unicode NFC normalization
  let t = text.normalize('NFC');

  // 1. Join split matras, dependent vowel signs, viramas (्), and anusvaras (ा, ि, ी, ु, ू, े, ै, ो, ौ, ं, ँ, ः, ्)
  t = t.replace(/([\u0900-\u097F])\s+([\u093E-\u094F\u0962-\u0963\u0901-\u0903])/g, '$1$2');
  t = t.replace(/([\u093E-\u094F\u0962-\u0963\u0901-\u0903])\s+([\u0900-\u097F])/g, '$1 $2');

  // 2. Remove isolated zero-width characters
  t = t.replace(/[\u200B\uFEFF]/g, '');

  // Common Hindi postpositions / standalone stop words that should NOT be merged with adjacent words
  const STOP_WORDS = new Set([
    'का', 'के', 'की', 'में', 'से', 'ने', 'को', 'पर', 'और', 'या', 'है', 'हैं', 
    'था', 'थी', 'थे', 'भी', 'न', 'तो', 'यह', 'वह', 'इस', 'उस', 'इन', 'उन', 
    'जो', 'हो', 'कर', 'हुए', 'गया', 'गई', 'गए', 'तक', 'द्वारा', 'रूप', 'कुल', 'पास'
  ]);

  // Split into lines
  const lines = t.split('\n');
  const cleanedLines = lines.map(line => {
    const rawTokens = line.split(/\s+/).filter(Boolean);
    if (rawTokens.length <= 1) return line;

    const merged: string[] = [];
    let i = 0;

    while (i < rawTokens.length) {
      const cur = rawTokens[i];
      const isDevCur = /^[\u0900-\u097F]+$/.test(cur);

      if (isDevCur && i + 1 < rawTokens.length) {
        const next = rawTokens[i + 1];
        const isDevNext = /^[\u0900-\u097F]+$/.test(next);

        if (isDevNext && !STOP_WORDS.has(cur) && !STOP_WORDS.has(next)) {
          const curLen = [...cur].length;
          const nextLen = [...next].length;
          
          if (curLen <= 3 || nextLen <= 2 || (curLen <= 4 && nextLen <= 3)) {
            rawTokens[i + 1] = cur + next;
            i++;
            continue;
          }
        }
      }

      merged.push(cur);
      i++;
    }

    return merged.join(' ');
  });

  return cleanedLines.join('\n');
}

export async function ocrImage(
  imageUri: string,
  language?: OcrLanguage,
  knownExt?: string
): Promise<OcrResult> {
  const startTime = Date.now();
  
  try {
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      return { text: '', elapsedMs: 0, status: 'failed', error: 'File not found' };
    }

    const ext = knownExt || imageUri.split('.').pop()?.toLowerCase().split('?')[0] || 'png';
    if (ext === 'pdf') {
       return { text: '', elapsedMs: Date.now() - startTime, status: 'done', error: 'PDF native OCR handled in contentExtractor' };
    }

    // Determine script type based on requested language
    const lang = language || currentLanguage;

    // 1. Prioritize direct native bundled Google ML Kit OCR (sampled 1600px, ~200ms)
    try {
      const nativeOcrText = await extractTextFromImage(imageUri, lang);
      const processedText = nativeOcrText ? normalizeDevanagariOcrText(nativeOcrText.trim()) : '';
      return {
        text: processedText,
        elapsedMs: Date.now() - startTime,
        status: 'done',
        error: '',
      };
    } catch (nativeOcrErr) {
      console.warn('[ocrService] Direct native ML Kit OCR attempt failed, using fallback:', nativeOcrErr);
    }

    const primaryDetector: DetectorType = lang.includes('hin') ? 'devanagari' : 'latin';
    const secondaryDetector: DetectorType = primaryDetector === 'devanagari' ? 'latin' : 'devanagari';

    let text = '';
    try {
      const result = await recognizeText(imageUri, primaryDetector);
      text = result?.blocks?.map(block => block.text).filter(Boolean).join('\n') || result?.text || '';
    } catch (detErr: any) {
      console.warn(`[ocrService] Primary (${primaryDetector}) OCR attempt failed:`, detErr);
    }

    // Bidirectional fallback if primary detector yielded no text
    if (!text || text.trim().length === 0) {
      try {
        const fallbackResult = await recognizeText(imageUri, secondaryDetector);
        text = fallbackResult?.blocks?.map(block => block.text).filter(Boolean).join('\n') || fallbackResult?.text || '';
      } catch (fbErr: any) {
        console.warn(`[ocrService] Fallback (${secondaryDetector}) OCR attempt failed:`, fbErr);
      }
    }
    
    // Normalize and repair Devanagari OCR text (and preserves English words cleanly)
    const processedText = text ? normalizeDevanagariOcrText(text.trim()) : '';

    return {
      text: processedText,
      elapsedMs: Date.now() - startTime,
      status: 'done',
      error: '',
    };
  } catch (e: any) {
    console.warn('[ocrService] ML Kit OCR failed completely:', e);
    return {
      text: '',
      elapsedMs: Date.now() - startTime,
      status: 'failed',
      error: e.message || 'OCR failed',
    };
  }
}

/**
 * Ultra-fast (< 15ms) lightweight text presence check.
 * Uses fast Latin detector to verify if an image contains any text blocks.
 * If 0 text blocks are found, the image is safely identified as a non-text photo.
 */
export async function fastDetectHasText(imageUri: string): Promise<boolean> {
  try {
    const result = await recognizeText(imageUri, 'latin');
    if (!result) return false;
    if (result.blocks && result.blocks.length > 0) return true;
    if (result.text && result.text.trim().length > 0) return true;
    return false;
  } catch {
    // On unexpected error, return true to let primary pipeline handle it safely
    return true;
  }
}

export function setOcrLanguage(language: OcrLanguage): void {
  currentLanguage = language;
}

export function getOcrLanguage(): OcrLanguage {
  return currentLanguage;
}
