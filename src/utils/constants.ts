/**
 * constants.ts — File extensions + app-wide constants
 * Mirrors the desktop FileLensPro utils/constants.py
 */

import { OcrLanguage } from '../models/types';

export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'bmp', 'gif', 'tif', 'tiff', 'webp', 'jp2',
  'pnm', 'pgm', 'ppm', 'pbm', 'heic', 'heif',
]);

export const PDF_EXTENSIONS = new Set(['pdf']);

export const WORD_EXTENSIONS = new Set(['docx', 'doc', 'rtf', 'odt']);

export const EXCEL_EXTENSIONS = new Set(['xlsx', 'xls']);

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'tsv',
]);

export const ALL_ACCEPTED_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...WORD_EXTENSIONS,
  ...EXCEL_EXTENSIONS,
  ...TEXT_EXTENSIONS,
]);

/** Explicitly excluded code, markup, config, and system files */
export const EXCLUDED_CODE_AND_SYSTEM_EXTENSIONS = new Set([
  // Web & Markup
  'xml', 'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'svg',
  // Programming & Scripting Code
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'pyc', 'pyo', 'pyd', 'ipynb',
  'java', 'class', 'jar', 'kt', 'kts',
  'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx',
  'cs', 'go', 'rs', 'swift', 'rb', 'php', 'pl', 'pm',
  'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'vbs',
  'sql', 'sqlite', 'db-journal', 'db-wal', 'db-shm',
  'gradle', 'properties', 'lua', 'dart', 'r', 'm',
  // Config & Serialization
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config',
  'plist', 'env', 'lock', 'map', 'bak', 'tmp', 'temp', 'log',
  // System binaries & archives
  'dex', 'apk', 'aab', 'aar', 'so', 'dll', 'exe', 'dylib', 'bin', 'dat',
]);

/** Excluded system & cache directories */
export const EXCLUDED_FOLDER_NAMES = new Set([
  'sent',
  'private',
  '.thumbnails',
  '.cache',
  '.trash',
  '.recycle',
  'whatsapp voice notes',
  'whatsapp animated gifs',
  'whatsapp video notes',
  'node_modules',
  '.git',
  '.github',
  '.gradle',
  '.idea',
  '.vscode',
  'build',
  'dist',
  'target',
  'bin',
  'obj',
  'venv',
  '.venv',
  '__pycache__',
  '.cxx',
  '.expo',
  'cache',
  'temp',
  'tmp',
  'logs',
  '.system_generated',
]);

/** Default Tesseract language — English + Hindi */
export const DEFAULT_OCR_LANGUAGE: OcrLanguage = 'eng+hin';

/** Available language presets for the dropdown */
export const LANGUAGE_PRESETS: { value: OcrLanguage; label: string }[] = [
  { value: 'eng+hin', label: 'English + Hindi (Recommended)' },
  { value: 'eng', label: 'English' },
  { value: 'hin', label: 'Hindi (Devanagari)' },
];

/** Tesseract traineddata download URLs (tessdata_fast = smaller, 90% accuracy) */
export const TESSDATA_BASE_URL =
  'https://github.com/tesseract-ocr/tessdata_fast/raw/main';

/** Colors used in highlights */
export const HIGHLIGHT_COLORS = {
  otherMatch: '#FFEB3B',   // yellow
  currentMatch: '#FF9800', // orange
};
