/**
 * contentExtractor.ts — Extract text content from various file types.
 *
 * Supports: TXT, MD, CSV, JSON, HTML, code files, PDF (text layer), DOCX, XLSX.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import { Buffer } from 'buffer';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { extractText, getPageCount, extractPageText } from 'react-native-pdf-text-extractor';
import { normalizeDevanagariOcrText } from './ocrService';
import { IMAGE_EXTENSIONS, PDF_EXTENSIONS, WORD_EXTENSIONS, TEXT_EXTENSIONS, EXCEL_EXTENSIONS } from '../utils/constants';

export const MAX_DOCUMENT_TEXT_LENGTH = 150_000; // 150K characters max to prevent SQLite OOM

export interface ExtractResult {
  text: string;
  pageCount: number;
  engine: string;
  isScanned: boolean;
  hasMorePages?: boolean;
}

export async function extractContent(uri: string, fastPass: boolean = true): Promise<ExtractResult> {
  const ext = getExtension(uri);
  let res: ExtractResult = { text: '', pageCount: 0, engine: 'none', isScanned: false, hasMorePages: false };

  if (IMAGE_EXTENSIONS.has(ext)) {
    return res;
  }

  if (PDF_EXTENSIONS.has(ext)) {
    res = await extractPdfText(uri);
  } else if (ext === 'docx') {
    res = await extractDocxText(uri);
  } else if (EXCEL_EXTENSIONS.has(ext)) {
    res = await extractXlsxText(uri, fastPass);
  } else if (ext === 'doc') {
    return res;
  } else if (TEXT_EXTENSIONS.has(ext)) {
    const text = await readTextFile(uri);
    res = { text, pageCount: 0, engine: 'text', isScanned: false };
  }

  // Strictly enforce memory-safe text limit
  if (res.text && res.text.length > MAX_DOCUMENT_TEXT_LENGTH) {
    res.text = res.text.substring(0, MAX_DOCUMENT_TEXT_LENGTH);
  }

  return res;
}

async function extractPdfText(uri: string): Promise<ExtractResult> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size < 50)) {
      return { text: '', pageCount: 0, engine: 'none', isScanned: false };
    }

    let pages = 1;
    try {
      pages = await getPageCount(uri);
    } catch (e) {
      return { text: '', pageCount: 0, engine: 'none', isScanned: true };
    }

    // Extract up to 35 pages of native text in a single fast pass (<20ms)
    const maxPagesToExtract = Math.min(pages, 35);
    const pageTexts: string[] = [];
    let totalChars = 0;

    for (let p = 0; p < maxPagesToExtract; p++) {
      if (totalChars >= MAX_DOCUMENT_TEXT_LENGTH) break;
      try {
        const pt = await extractPageText(uri, p);
        if (pt && pt.trim()) {
          const cleanPageText = pt.trim();
          pageTexts.push(`[Page ${p + 1}]\n${cleanPageText}`);
          totalChars += cleanPageText.length;
        }
      } catch (pageErr) {
        console.warn(`[contentExtractor] Skipping unreadable PDF page ${p + 1}:`, pageErr);
      }
    }

    const text = pageTexts.join('\n\n');
    const cleanedText = normalizeDevanagariOcrText(text);

    return {
      text: cleanedText || '',
      pageCount: pages,
      engine: 'native-pdf',
      isScanned: !cleanedText || cleanedText.trim().length < 30,
      hasMorePages: false,
    };
  } catch (e) {
    console.warn('[contentExtractor] Native PDF extraction failed:', e);
    return { text: '', pageCount: 0, engine: 'none', isScanned: true };
  }
}

async function extractDocxText(uri: string): Promise<ExtractResult> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size > 2.5 * 1024 * 1024)) {
      return { text: '', pageCount: 0, engine: 'none', isScanned: false };
    }

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const buffer = Buffer.from(base64, 'base64');
    const arrayBuffer = new Uint8Array(buffer).buffer;
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value || '', pageCount: 1, engine: 'mammoth', isScanned: !result.value };
  } catch (e) {
    console.warn('[contentExtractor] DOCX extraction failed:', e);
    return { text: '', pageCount: 0, engine: 'none', isScanned: false };
  }
}

export async function extractDocxHtml(uri: string): Promise<string> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size > 4 * 1024 * 1024)) {
      return '<p>Document too large for live preview</p>';
    }
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const buffer = Buffer.from(base64, 'base64');
    const arrayBuffer = new Uint8Array(buffer).buffer;
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value || '';
  } catch (e) {
    console.warn('[contentExtractor] DOCX HTML extraction failed:', e);
    return '';
  }
}

async function extractXlsxText(uri: string, fastPass: boolean = true): Promise<ExtractResult> {
  const fallbackResult: ExtractResult = { text: '', pageCount: 0, engine: 'none', isScanned: false };

  const parsePromise = (async (): Promise<ExtractResult> => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      // Skip massive multi-megabyte Excel files in JS to prevent thread freeze
      if (!fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size > 1.2 * 1024 * 1024)) {
        return fallbackResult;
      }

      if (AppState.currentState === 'active') {
        await new Promise(r => setTimeout(r, 4));
      } else {
        await Promise.resolve();
      }

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      
      // Hyper-fast XLSX parsing: dense 2D array representation, limit sheet rows, disable styles/formulas/HTML
      const workbook = XLSX.read(base64, {
        type: 'base64',
        dense: true,
        sheetRows: fastPass ? 30 : 60,
        bookDeps: false,
        bookFiles: false,
        bookProps: false,
        bookSheets: true,
        cellDates: false,
        cellStyles: false,
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellText: true,
      });

      const texts: string[] = [];
      let currentLength = 0;
      let hasMorePages = false;

      const maxSheets = fastPass ? Math.min(workbook.SheetNames.length, 2) : Math.min(workbook.SheetNames.length, 4);

      for (let s = 0; s < maxSheets; s++) {
        const sheet = workbook.SheetNames[s];
        if (currentLength >= MAX_DOCUMENT_TEXT_LENGTH) {
          if (fastPass) hasMorePages = true;
          break;
        }
        const sheetData = workbook.Sheets[sheet];
        if (!sheetData) continue;

        const csv = XLSX.utils.sheet_to_csv(sheetData, { blankrows: false, FS: ' ', RS: '\n' });
        const cleaned = csv
          .split('\n')
          .slice(0, fastPass ? 30 : 60)
          .map((line) => line.replace(/^,+$/, '').trim())
          .filter(Boolean)
          .join('\n');

        if (cleaned) {
          texts.push(`[Sheet: ${sheet}]\n` + cleaned);
          currentLength += cleaned.length;
        }
      }

      if (fastPass && workbook.SheetNames.length > maxSheets) {
        hasMorePages = true;
      }

      const combined = texts.join('\n\n');
      return {
        text: combined.length > MAX_DOCUMENT_TEXT_LENGTH ? combined.substring(0, MAX_DOCUMENT_TEXT_LENGTH) : combined,
        pageCount: workbook.SheetNames.length,
        engine: 'xlsx',
        isScanned: false,
        hasMorePages: fastPass ? hasMorePages : false,
      };
    } catch (e) {
      console.warn('[contentExtractor] XLSX extraction failed:', e);
      return fallbackResult;
    }
  })();

  if (AppState.currentState !== 'active') {
    return parsePromise;
  }

  const timeoutPromise = new Promise<ExtractResult>((resolve) => {
    setTimeout(() => resolve(fallbackResult), 400);
  });

  return Promise.race([parsePromise, timeoutPromise]);
}

export async function extractXlsxHtml(uri: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const workbook = XLSX.read(base64, { type: 'base64' });
    let html = '';
    workbook.SheetNames.forEach(sheet => {
      html += `<h2>${sheet}</h2>`;
      html += XLSX.utils.sheet_to_html(workbook.Sheets[sheet]);
    });
    return html;
  } catch (e) {
    console.warn('[contentExtractor] XLSX HTML extraction failed:', e);
    return '';
  }
}

async function readTextFile(uri: string): Promise<string> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) return '';

    const maxSize = 2 * 1024 * 1024;
    const size = fileInfo.size || 0;
    if (size > maxSize) {
      return await FileSystem.readAsStringAsync(uri, { length: maxSize, position: 0 });
    }
    return await FileSystem.readAsStringAsync(uri);
  } catch (e) {
    return '';
  }
}

function getExtension(uri: string): string {
  const path = uri.split('?')[0];
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
