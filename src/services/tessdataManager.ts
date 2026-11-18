/**
 * tessdataManager.ts — Traineddata management for tesseract.js.
 *
 * With the WebView-based tesseract.js approach, traineddata files are
 * downloaded automatically by tesseract.js when a worker is created
 * for a given language. The files are cached in the WebView's browser
 * cache (IndexedDB).
 *
 * This module provides compatibility functions that the UI calls —
 * they're now mostly no-ops since tesseract.js handles everything.
 */

/**
 * Get the tessdata directory path (not used with tesseract.js, but
 * kept for API compatibility).
 */
export async function getTessdataDir(): Promise<string> {
  return 'tesseract-js-webview-cache';
}

/**
 * Check if a language pack is available.
 * With tesseract.js, languages are downloaded on demand — we assume
 * the default languages are available.
 */
export async function isLanguageInstalled(lang: string): Promise<boolean> {
  // tesseract.js downloads on first use, so we assume it's available
  return true;
}

/**
 * Get list of installed languages.
 * tesseract.js caches languages in the browser cache — we report the
 * defaults that are supported.
 */
export async function getInstalledLanguages(): Promise<string[]> {
  // tesseract.js downloads on demand — these are the languages we support
  return ['eng', 'hin'];
}

/**
 * Download a language pack.
 * With tesseract.js, this happens automatically when the worker is created.
 * This function is kept for API compatibility — it's a no-op.
 */
export async function downloadLanguage(
  _lang: string,
  _onProgress?: (fraction: number) => void
): Promise<string> {
  // No-op — tesseract.js handles this internally
  if (_onProgress) _onProgress(1);
  return 'tesseract-js-webview-cache';
}

/**
 * Download the default languages (eng + hin).
 * With tesseract.js, this happens on first OCR call — no-op here.
 */
export async function ensureDefaultLanguages(
  _onProgress?: (fraction: number, lang: string) => void
): Promise<void> {
  // No-op — tesseract.js downloads traineddata on first use
  // when initOcr() creates the worker
  if (_onProgress) {
    _onProgress(0.5, 'eng');
    _onProgress(1, 'hin');
  }
}
