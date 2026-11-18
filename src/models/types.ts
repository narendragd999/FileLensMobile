/**
 * types.ts — Shared TypeScript types for FileLensPro Mobile
 */

export type OcrLanguage = string;

export interface UploadedFile {
  id: string;
  uri: string;          // content:// or file:// URI
  name: string;
  extension: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped';
  text: string;
  error: string;
  elapsedMs: number;
  pageCount: number;
  isScanned: boolean;
  ocrEngine: string;
}

export interface FileEntry {
  id: number;
  path: string;
  name: string;
  extension: string;
  fileType: string;
  size: number;
  modified: string;  // ISO date
  contentText: string | null;
  ocrText: string | null;
  ocrStatus: string;
  isCard?: boolean;
  customTag?: string;
}

export interface SearchResult {
  entry: FileEntry;
  score: number;
  matchedField: string;
  preview: string;
  matchCount: number;
  pageNumbers: number[];
  semanticScore?: number;
}

export type SearchMode =
  | 'partial'
  | 'similar'
  | 'exact'
  | 'whole_word'
  | 'wildcard'
  | 'regex'
  | 'fuzzy'
  | 'boolean';

export type SearchTarget =
  | 'all'
  | 'filename'
  | 'folder'
  | 'content'
  | 'extension'
  | 'ocr_text';

export interface SearchFilters {
  fileTypes?: string[]; // e.g. ['jpg', 'png', 'pdf']
  folderUri?: string;   // specific source folder/album URI
  minSize?: number;     // in bytes
  maxSize?: number;
  modifiedAfter?: string; // ISO date
  modifiedBefore?: string; // ISO date
}

export interface SearchQuery {
  query: string;
  mode: SearchMode;
  target: SearchTarget;
  caseSensitive: boolean;
  maxResults: number;
  filters?: SearchFilters;
}

export interface Match {
  start: number;
  end: number;
  line: number;
  col: number;
  snippet: string;
}

export type SortColumn =
  | 'name'
  | 'size'
  | 'modified'
  | 'extension'
  | 'matchCount'
  | 'score';

export type SortOrder = 'asc' | 'desc';

export interface SortState {
  column: SortColumn | null;
  order: SortOrder;
}

export interface OcrResult {
  text: string;
  elapsedMs: number;
  status: 'done' | 'failed' | 'skipped';
  error: string;
}

