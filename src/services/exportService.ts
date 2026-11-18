import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Buffer } from 'buffer';

export type ExportFormat = 'docx' | 'xlsx' | 'csv';

/**
 * Generate a .docx file from plain text or markdown (simplified).
 */
async function generateDocx(text: string, filePath: string) {
  // Simple heuristic: split by newlines into paragraphs
  const paragraphs = text.split('\n').map(line => 
    new Paragraph({
      children: [
        new TextRun(line)
      ]
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });

  const base64Str = await Packer.toBase64String(doc);
  await FileSystem.writeAsStringAsync(filePath, base64Str, {
    encoding: FileSystem.EncodingType.Base64
  });
}

/**
 * Generate .xlsx or .csv from text.
 * If text is CSV structured, we parse it using PapaParse.
 * Otherwise, we fall back to splitting by newlines for a single-column approach.
 */
async function generateSpreadsheet(text: string, format: 'xlsx' | 'csv', filePath: string) {
  let aoa: any[][] = [];
  
  // Try to parse as CSV if it looks structured
  if (text.includes(',')) {
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    if (parsed.errors.length === 0 && parsed.data.length > 0) {
      aoa = parsed.data as any[][];
    } else {
      // Fallback: line by line
      aoa = text.split('\n').filter(Boolean).map(line => [line]);
    }
  } else {
    // Fallback: line by line
    aoa = text.split('\n').filter(Boolean).map(line => [line]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Export');

  if (format === 'csv') {
    const csvStr = XLSX.utils.sheet_to_csv(ws);
    await FileSystem.writeAsStringAsync(filePath, csvStr, { encoding: FileSystem.EncodingType.UTF8 });
  } else {
    const base64Str = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await FileSystem.writeAsStringAsync(filePath, base64Str, { encoding: FileSystem.EncodingType.Base64 });
  }
}

/**
 * Main export function. Generates file and opens Share sheet.
 */
export async function exportContent(text: string, format: ExportFormat, title: string = 'export'): Promise<void> {
  try {
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeTitle}_${Date.now()}.${format}`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    if (format === 'docx') {
      await generateDocx(text, filePath);
    } else {
      await generateSpreadsheet(text, format, filePath);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, { dialogTitle: `Export ${format.toUpperCase()}` });
    } else {
      console.warn('[exportService] Native sharing is not available on this device');
    }
  } catch (err: any) {
    console.error('[exportService] Failed to export:', err);
    throw new Error(err?.message || 'There was an error generating the export file.');
  }
}
