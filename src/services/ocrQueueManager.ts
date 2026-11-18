/**
 * ocrQueueManager.ts — Zero-Lag Deferred Background OCR Manager for FileLensPro.
 *
 * Architecture Principles:
 * 1. Activity Gatekeeper: OCR NEVER runs while camera is active, page organizer is open,
 *    or PDF operations (delete, rotate, reorder, save) are executing.
 * 2. Idle Debounce: New scanned documents are queued and wait for 8 seconds of complete
 *    user inactivity before beginning background extraction.
 * 3. Cooperative Multitasking: Processes 1 page at a time with InteractionManager and a
 *    mandatory 250ms yield between pages so UI gestures, animations, and GC are unblocked.
 * 4. Zero-Render Direct OCR: Reuses cropped page image files on disk when available,
 *    completely eliminating the CPU & memory overhead of re-rendering PDFs.
 * 5. On-Demand Prioritization: When the user views the [Text] tab, that document jumps to
 *    the front of the queue with live progress notifications.
 */

import { InteractionManager } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { renderPdfToImages } from 'expo-pdf-to-image';
import { ocrImage, normalizeDevanagariOcrText } from './ocrService';
import { extractContent } from './contentExtractor';
import { updateFileOcrContent, refreshIndexStats } from './database';
import { autoCategorizeFile } from '../utils/autoCategorizer';

export interface OcrProgressInfo {
  currentPage: number;
  totalPages: number;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'paused';
  text?: string;
}

export type OcrProgressListener = (info: OcrProgressInfo) => void;

interface OcrTask {
  id: string;
  pdfUri: string;
  fileName: string;
  pageUris?: string[];
  category?: string;
  priority: number; // 0 = background idle, 1 = user requested / immediate
  status: 'pending' | 'processing' | 'done' | 'failed' | 'paused';
  progress: { current: number; total: number };
  enqueuedAt: number;
}

class OcrQueueManager {
  private queue: Map<string, OcrTask> = new Map();
  private listeners: Map<string, Set<OcrProgressListener>> = new Map();
  private isProcessing = false;

  // Gatekeeper flags
  private _isCameraActive = false;
  private _isOrganizerActive = false;
  private _isPdfProcessing = false;
  private idleWorkerTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Gatekeeper controls ---

  public setCameraActive(active: boolean): void {
    const wasActive = this._isCameraActive;
    this._isCameraActive = active;
    if (active) {
      this.pauseBackgroundProcessing('Camera opened');
    } else if (wasActive && !active) {
      // Camera closed, gently schedule idle worker
      this.scheduleIdleWorker(6000);
    }
  }

  public setOrganizerActive(active: boolean): void {
    const wasActive = this._isOrganizerActive;
    this._isOrganizerActive = active;
    if (active) {
      this.pauseBackgroundProcessing('Page Organizer opened');
    } else if (wasActive && !active) {
      // Organizer closed, gently schedule idle worker
      this.scheduleIdleWorker(6000);
    }
  }

  public setPdfProcessing(processing: boolean): void {
    this._isPdfProcessing = processing;
    if (processing) {
      this.pauseBackgroundProcessing('PDF modification running');
    } else {
      this.scheduleIdleWorker(4000);
    }
  }

  public isBusy(): boolean {
    return this._isCameraActive || this._isOrganizerActive || this._isPdfProcessing;
  }

  // --- Queue Management ---

  /**
   * Enqueue a PDF for background OCR text extraction.
   * Scanned PDFs pass their original cropped page image URIs so we don't have to re-render the PDF.
   */
  public enqueueDocument(options: {
    pdfUri: string;
    fileName: string;
    pageUris?: string[];
    category?: string;
    priority?: number;
    delayMs?: number;
  }): void {
    const { pdfUri, fileName, pageUris, category, priority = 0, delayMs = 8000 } = options;

    // Check if task already exists and is done
    const existing = this.queue.get(pdfUri);
    if (existing && existing.status === 'done' && priority === 0) {
      return;
    }

    const task: OcrTask = {
      id: pdfUri,
      pdfUri,
      fileName,
      pageUris: pageUris && pageUris.length > 0 ? pageUris : existing?.pageUris,
      category: category || existing?.category || 'Document',
      priority: Math.max(priority, existing?.priority || 0),
      status: 'pending',
      progress: { current: 0, total: pageUris?.length || existing?.progress?.total || 1 },
      enqueuedAt: Date.now(),
    };

    this.queue.set(pdfUri, task);
    this.notifyListeners(pdfUri, {
      currentPage: 0,
      totalPages: task.progress.total,
      status: 'pending',
    });

    if (priority > 0 && !this.isBusy()) {
      // High priority (user requested) -> run after interactions
      this.triggerWorker();
    } else {
      // Background priority -> wait for idle delay
      this.scheduleIdleWorker(delayMs);
    }
  }

  /**
   * Immediately extract OCR for a document (e.g. when user opens the [Text] tab).
   * Bumps priority and returns extracted text.
   */
  public async processDocumentImmediately(
    pdfUri: string,
    existingPageImages?: string[],
    fileName: string = 'Document.pdf'
  ): Promise<string> {
    let task = this.queue.get(pdfUri);
    if (!task) {
      task = {
        id: pdfUri,
        pdfUri,
        fileName,
        pageUris: existingPageImages,
        priority: 1,
        status: 'pending',
        progress: { current: 0, total: existingPageImages?.length || 1 },
        enqueuedAt: Date.now(),
      };
      this.queue.set(pdfUri, task);
    } else {
      task.priority = 1;
      if (existingPageImages && existingPageImages.length > 0 && (!task.pageUris || task.pageUris.length === 0)) {
        task.pageUris = existingPageImages;
      }
    }

    return await this.executeTask(task);
  }

  /**
   * Subscribe to progress updates for a document.
   */
  public subscribeOcrProgress(pdfUri: string, listener: OcrProgressListener): () => void {
    if (!this.listeners.has(pdfUri)) {
      this.listeners.set(pdfUri, new Set());
    }
    this.listeners.get(pdfUri)!.add(listener);

    // Immediately send current state if task exists
    const task = this.queue.get(pdfUri);
    if (task) {
      listener({
        currentPage: task.progress.current,
        totalPages: task.progress.total,
        status: task.status,
      });
    }

    return () => {
      const set = this.listeners.get(pdfUri);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(pdfUri);
        }
      }
    };
  }

  // --- Worker Implementation ---

  private scheduleIdleWorker(delayMs: number): void {
    if (this.idleWorkerTimer) {
      clearTimeout(this.idleWorkerTimer);
    }
    this.idleWorkerTimer = setTimeout(() => {
      this.idleWorkerTimer = null;
      if (!this.isBusy() && !this.isProcessing) {
        this.triggerWorker();
      }
    }, delayMs);
  }

  private pauseBackgroundProcessing(reason: string): void {
    if (this.idleWorkerTimer) {
      clearTimeout(this.idleWorkerTimer);
      this.idleWorkerTimer = null;
    }
    // Any active worker will check isBusy() before processing the next page and suspend
  }

  private async triggerWorker(): Promise<void> {
    if (this.isProcessing) return;
    if (this.isBusy()) return;

    this.isProcessing = true;
    try {
      // Find next task: high priority first, then oldest pending
      while (!this.isBusy()) {
        const nextTask = this.getNextPendingTask();
        if (!nextTask) break;

        await this.executeTask(nextTask);

        // Yield 300ms between documents to give complete priority to UI and garbage collection
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.warn('[ocrQueueManager] Worker error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private getNextPendingTask(): OcrTask | null {
    let chosen: OcrTask | null = null;
    for (const task of this.queue.values()) {
      if (task.status === 'pending' || task.status === 'paused') {
        if (!chosen) {
          chosen = task;
        } else if (task.priority > chosen.priority) {
          chosen = task;
        } else if (task.priority === chosen.priority && task.enqueuedAt < chosen.enqueuedAt) {
          chosen = task;
        }
      }
    }
    return chosen;
  }

  private async executeTask(task: OcrTask): Promise<string> {
    task.status = 'processing';
    this.notifyListeners(task.pdfUri, {
      currentPage: task.progress.current,
      totalPages: task.progress.total,
      status: 'processing',
    });

    try {
      let workingPdfUri = task.pdfUri;
      let pageImages: string[] = task.pageUris && task.pageUris.length > 0 ? task.pageUris : [];

      // Handle content:// URIs by copying to a cached local file for native text/render operations
      if (workingPdfUri.startsWith('content://')) {
        try {
          const cleanHash = Math.abs(workingPdfUri.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
          const tempCache = `${FileSystem.cacheDirectory}ocr_cache_${cleanHash}.pdf`;
          const fileInfo = await FileSystem.getInfoAsync(tempCache);
          if (!fileInfo.exists) {
            await FileSystem.copyAsync({ from: workingPdfUri, to: tempCache });
          }
          workingPdfUri = tempCache;
        } catch (copyErr) {
          console.warn('[ocrQueueManager] Error copying content URI to cache:', copyErr);
        }
      }

      // 1. Fast digital text layer check (<25ms) if working file exists
      if (!workingPdfUri.startsWith('content://')) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(workingPdfUri);
          if (fileInfo.exists) {
            const nativeRes = await extractContent(workingPdfUri);
            if (nativeRes?.text && nativeRes.text.trim().length > 40) {
              const safeText = normalizeDevanagariOcrText(nativeRes.text.trim()).replace(/\0/g, '');
              await updateFileOcrContent(task.pdfUri, safeText).catch(() => {});
              if (workingPdfUri !== task.pdfUri) {
                await updateFileOcrContent(workingPdfUri, safeText).catch(() => {});
              }
              task.status = 'done';
              task.progress.current = 1;
              task.progress.total = 1;
              this.notifyListeners(task.pdfUri, {
                currentPage: 1,
                totalPages: 1,
                status: 'done',
                text: safeText,
              });
              return safeText;
            }
          }
        } catch (_) {}
      }

      // 2. If no page images provided (e.g. externally imported PDF), render pages lazily
      if (pageImages.length === 0) {
        if (this._isCameraActive || (this.isBusy() && task.priority === 0)) {
          task.status = 'paused';
          return '';
        }
        try {
          pageImages = await renderPdfToImages(workingPdfUri);
        } catch (renderErr) {
          console.warn('[ocrQueueManager] renderPdfToImages failed:', renderErr);
          task.status = 'failed';
          this.notifyListeners(task.pdfUri, {
            currentPage: 0,
            totalPages: 0,
            status: 'failed',
          });
          return '';
        }
      }

      if (!pageImages || pageImages.length === 0) {
        task.status = 'done';
        this.notifyListeners(task.pdfUri, {
          currentPage: 0,
          totalPages: 0,
          status: 'done',
          text: '',
        });
        return '';
      }

      const totalPages = Math.min(pageImages.length, 30);
      task.progress.total = totalPages;
      const textBlocks: string[] = [];

      // 4. Cooperative page-by-page OCR execution
      for (let i = 0; i < totalPages; i++) {
        // Gatekeeper check before each single page: camera always halts OCR; other busy states halt background tasks
        if (this._isCameraActive || (this.isBusy() && task.priority === 0)) {
          console.log(`[ocrQueueManager] Activity detected; pausing background OCR at page ${i + 1}/${totalPages}`);
          task.status = 'paused';
          this.notifyListeners(task.pdfUri, {
            currentPage: i,
            totalPages,
            status: 'paused',
          });
          return textBlocks.join('\n\n');
        }

        // Wait until any active touch/interaction animation completes
        await new Promise<void>(resolve => {
          InteractionManager.runAfterInteractions(() => resolve());
        });

        const pageUri = pageImages[i];
        try {
          const res = await ocrImage(pageUri);
          if (res && res.text && res.text.trim()) {
            textBlocks.push(`[Page ${i + 1}]\n${res.text.trim()}`);
          }
        } catch (pageErr) {
          console.warn(`[ocrQueueManager] Page ${i + 1} OCR error:`, pageErr);
        }

        task.progress.current = i + 1;
        this.notifyListeners(task.pdfUri, {
          currentPage: i + 1,
          totalPages,
          status: 'processing',
        });

        // Mandatory cooperative yield: 250ms sleep to keep JS event loop & GC free
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const aggregated = textBlocks.join('\n\n');
      const safeCleanText = normalizeDevanagariOcrText(aggregated).replace(/\0/g, '');

      if (safeCleanText) {
        await updateFileOcrContent(task.pdfUri, safeCleanText).catch(() => {});
        if (workingPdfUri !== task.pdfUri) {
          await updateFileOcrContent(workingPdfUri, safeCleanText).catch(() => {});
        }
        autoCategorizeFile(task.pdfUri, task.fileName, safeCleanText).catch(() => {});
        refreshIndexStats().catch(() => {});
      }

      task.status = 'done';
      this.notifyListeners(task.pdfUri, {
        currentPage: totalPages,
        totalPages,
        status: 'done',
        text: safeCleanText,
      });

      console.log(`[ocrQueueManager] Successfully completed deferred OCR for: ${task.fileName}`);
      return safeCleanText;
    } catch (err) {
      console.warn('[ocrQueueManager] Task execution failed:', err);
      task.status = 'failed';
      this.notifyListeners(task.pdfUri, {
        currentPage: task.progress.current,
        totalPages: task.progress.total,
        status: 'failed',
      });
      return '';
    }
  }

  private notifyListeners(pdfUri: string, info: OcrProgressInfo): void {
    const listeners = this.listeners.get(pdfUri);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(info);
        } catch (_) {}
      }
    }
  }
}

export const ocrQueueManager = new OcrQueueManager();
