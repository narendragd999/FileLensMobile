/**
 * autoCategorizer.ts
 *
 * Automatically tags files based on OCR and document text matching 65+ smart heuristics.
 */

import { addBookmark } from '../services/bookmarksService';
import { detectSmartTags } from '../services/smartTagService';
import { getDatabase } from '../services/database';

/**
 * Checks the text content of a file and automatically adds smart tags to bookmarks.
 *
 * @param path The file URI
 * @param name The file name
 * @param text The OCR or extracted text content
 */
export async function autoCategorizeFile(path: string, name: string, text: string): Promise<void> {
  if (!text || text.trim() === '') return;

  const matchedTags = detectSmartTags(name, text, text);

  if (matchedTags && matchedTags.length > 0) {
    try {
      await addBookmark(path, name, matchedTags);
      console.log(`[autoCategorizer] Auto-tagged ${name} as: ${matchedTags.join(', ')}`);
    } catch (e) {
      console.warn(`[autoCategorizer] Failed to auto-tag ${name}:`, e);
    }
  }
}

/**
 * Retroactively scans all indexed files in the SQLite database and assigns smart dynamic tags to bookmarks.
 * Uses a single fast SQLite transaction with zero UI blocking.
 */
export async function autoCategorizeAllIndexedFiles(): Promise<number> {
  try {
    const db = await getDatabase();
    
    // Ensure table exists
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_uri TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        created TEXT NOT NULL,
        tags TEXT
      );
    `);

    // Fetch existing bookmarks map
    const existingBookmarks = await db.getAllAsync<{ file_uri: string; tags: string | null }>(
      'SELECT file_uri, tags FROM bookmarks'
    );
    const bookmarkMap = new Map<string, Set<string>>();
    for (const b of existingBookmarks) {
      const tagSet = new Set<string>();
      if (b.tags) {
        try {
          const parsed = JSON.parse(b.tags);
          if (Array.isArray(parsed)) parsed.forEach(t => tagSet.add(t));
        } catch (e) {}
      }
      bookmarkMap.set(b.file_uri, tagSet);
    }

    const rows = await db.getAllAsync<{ uri: string; name: string; content_text: string | null; ocr_text: string | null }>(
      "SELECT uri, name, content_text, ocr_text FROM files WHERE (content_text IS NOT NULL AND content_text != '') OR (ocr_text IS NOT NULL AND ocr_text != '')"
    );

    if (!rows || rows.length === 0) return 0;

    const toInsert: Array<{ uri: string; name: string; tags: string[] }> = [];
    const toUpdate: Array<{ uri: string; tags: string[] }> = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const text = [row.content_text, row.ocr_text].filter(Boolean).join('\n\n');
      if (text && text.trim()) {
        const matchedTags = detectSmartTags(row.name, row.content_text, row.ocr_text);
        if (matchedTags && matchedTags.length > 0) {
          const existingTags = bookmarkMap.get(row.uri);
          if (existingTags) {
            // Check if there are new tags to add
            let hasNew = false;
            for (const t of matchedTags) {
              if (!existingTags.has(t)) {
                existingTags.add(t);
                hasNew = true;
              }
            }
            if (hasNew) {
              toUpdate.push({ uri: row.uri, tags: Array.from(existingTags) });
            }
          } else {
            toInsert.push({ uri: row.uri, name: row.name, tags: matchedTags });
          }
        }
      }
    }

    if (toInsert.length === 0 && toUpdate.length === 0) {
      return 0;
    }

    // Execute in a single fast SQLite transaction
    await db.withTransactionAsync(async () => {
      for (const item of toInsert) {
        await db.runAsync(
          'INSERT INTO bookmarks (file_uri, file_name, created, tags) VALUES (?, ?, ?, ?) ON CONFLICT(file_uri) DO NOTHING',
          [item.uri, item.name, now, JSON.stringify(item.tags)]
        );
      }
      for (const item of toUpdate) {
        await db.runAsync(
          'UPDATE bookmarks SET tags = ? WHERE file_uri = ?',
          [JSON.stringify(item.tags), item.uri]
        );
      }
    });

    return toInsert.length + toUpdate.length;
  } catch (e) {
    console.warn('[autoCategorizer] Failed to bulk categorize indexed files:', e);
    return 0;
  }
}
