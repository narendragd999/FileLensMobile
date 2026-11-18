/**
 * useStore.ts — Global app state via Zustand.
 *
 * Holds: search query + results, OCR state (uploaded files + current language),
 * settings (theme, language), and index stats.
 */

import { create } from 'zustand';
import { OcrLanguage, UploadedFile, SearchResult, SortState, SearchFilters, SearchMode } from '../models/types';

interface AppState {
  // ─── Search ───
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  searchMode: SearchMode;
  sortState: SortState;
  activeFilters: SearchFilters;

  setSearchQuery: (q: string) => void;
  setSearchResults: (r: SearchResult[]) => void;
  setIsSearching: (v: boolean) => void;
  setSearchMode: (m: SearchMode) => void;
  setSort: (column: SortState['column']) => void;
  setFilters: (filters: SearchFilters) => void;

  // ─── OCR Upload ───
  uploadedFiles: UploadedFile[];
  ocrLanguage: OcrLanguage;
  isOcrRunning: boolean;
  selectedFileId: string | null;

  addUploadedFiles: (files: UploadedFile[]) => void;
  updateFile: (id: string, updates: Partial<UploadedFile>) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  setOcrLanguage: (lang: OcrLanguage) => void;
  setIsOcrRunning: (v: boolean) => void;
  setSelectedFile: (id: string | null) => void;

  // ─── Settings ───
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // ─── Index Stats ───
  totalFiles: number;
  ocrDone: number;
  ocrPending: number;
  setStats: (s: { totalFiles: number; ocrDone: number; ocrPending: number }) => void;

  // ─── Indexing ───
  isIndexing: boolean;
  indexProgress: { indexed: number; total: number; currentFile: string } | null;
  backgroundOcrProgress: { current: number; total: number; currentFile: string } | null;
  setIsIndexing: (v: boolean) => void;
  setIndexProgress: (p: { indexed: number; total: number; currentFile: string } | null) => void;
  setBackgroundOcrProgress: (p: { current: number; total: number; currentFile: string } | null) => void;


  // ─── Tesseract Status ───
  tessReady: boolean;
  tessVersion: string;
  setTessReady: (v: boolean) => void;
  setTessVersion: (v: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // ─── Search ───
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchMode: 'partial',
  sortState: { column: null, order: 'asc' },
  activeFilters: {},

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSearchMode: (m) => set({ searchMode: m }),
  setFilters: (filters) => set({ activeFilters: filters }),
  setSort: (column) => {
    const current = get().sortState;
    if (current.column === column) {
      // Toggle order
      set({ sortState: { column, order: current.order === 'asc' ? 'desc' : 'asc' } });
    } else {
      set({ sortState: { column, order: 'asc' } });
    }
  },

  // ─── OCR Upload ───
  uploadedFiles: [],
  ocrLanguage: 'eng+hin',
  isOcrRunning: false,
  selectedFileId: null,

  addUploadedFiles: (files) =>
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, ...files],
    })),
  updateFile: (id, updates) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  removeFile: (id) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id),
    })),
  clearFiles: () => set({ uploadedFiles: [], selectedFileId: null }),
  setOcrLanguage: (lang) => set({ ocrLanguage: lang }),
  setIsOcrRunning: (v) => set({ isOcrRunning: v }),
  setSelectedFile: (id) => set({ selectedFileId: id }),

  // ------------------
  // Settings
  // ------------------
  theme: 'light',
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

  // ─── Index Stats ───
  totalFiles: 0,
  ocrDone: 0,
  ocrPending: 0,
  setStats: (s) => set(s),

  // ─── Tesseract Status ───
  tessReady: false,
  tessVersion: '',
  setTessReady: (v) => set({ tessReady: v }),
  setTessVersion: (v) => set({ tessVersion: v }),

  // ─── Indexing ───
  isIndexing: false,
  indexProgress: null,
  backgroundOcrProgress: null,
  setIsIndexing: (v) => set({ isIndexing: v }),
  setIndexProgress: (p) => set({ indexProgress: p }),
  setBackgroundOcrProgress: (p) => set({ backgroundOcrProgress: p }),
}));
