/**
 * exporter.ts â€” Export search results as CSV / JSON / share-sheet text.
 *
 * Mirrors the desktop FileLensPro `utils/exporter.py`.
 */

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { SearchResult } from '../models/types';
import { formatSize, formatDate } from '../utils/format';

export type ExportFormat = 'csv' | 'json' | 'txt';

/**
 * Export search results to a file and share it.
 */
export async function exportResults(
  results: SearchResult[],
  format: ExportFormat,
  query: string
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `filelens_${query.replace(/\s+/g, '_')}_${timestamp}`;
  let content: string;
  let mimeType: string;
  let fileExt: string;

  switch (format) {
    case 'csv':
      content = resultsToCsv(results);
      mimeType = 'text/csv';
      fileExt = 'csv';
      break;
    case 'json':
      content = resultsToJson(results);
      mimeType = 'application/json';
      fileExt = 'json';
      break;
    case 'txt':
      content = resultsToText(results);
      mimeType = 'text/plain';
      fileExt = 'txt';
      break;
  }

  const fileUri = `${FileSystem.cacheDirectory}${fileName}.${fileExt}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: 'Export search results',
    });
  }
}

function resultsToCsv(results: SearchResult[]): string {
  const header = 'Name,Path,Type,Size,Modified,Matches,Score,Preview';
  const rows = results.map((r) => {
    const name = csvEscape(r.entry.name);
    const path = csvEscape(r.entry.path);
    const type = csvEscape(r.entry.extension.toUpperCase());
    const size = r.entry.size;
    const modified = csvEscape(formatDate(r.entry.modified));
    const matches = r.matchCount;
    const score = r.score.toFixed(2);
    const preview = csvEscape((r.preview || '').substring(0, 200));
    return `${name},${path},${type},${size},${modified},${matches},${score},${preview}`;
  });
  return [header, ...rows].join('\n');
}

function resultsToJson(results: SearchResult[]): string {
  return JSON.stringify(
    results.map((r) => ({
      name: r.entry.name,
      path: r.entry.path,
      extension: r.entry.extension,
      size: r.entry.size,
      modified: r.entry.modified,
      matchCount: r.matchCount,
      score: r.score,
      preview: r.preview,
    })),
    null,
    2
  );
}

function resultsToText(results: SearchResult[]): string {
  const lines = [
    `FileLensPro Search Results`,
    `Exported: ${new Date().toISOString()}`,
    `Total: ${results.length} files`,
    '',
    'â”€'.repeat(60),
    '',
  ];
  for (const r of results) {
    lines.push(`ðŸ“„ ${r.entry.name}`);
    lines.push(`   Path: ${r.entry.path}`);
    lines.push(`   Size: ${formatSize(r.entry.size)} | Modified: ${formatDate(r.entry.modified)}`);
    lines.push(`   Score: ${r.score.toFixed(0)} | Matches: ${r.matchCount}`);
    if (r.preview) lines.push(`   Preview: ${r.preview.substring(0, 150)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
