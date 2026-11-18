/**
 * bookmarksService.ts — Bookmark files + save searches.
 *
 * Bookmarks: user can bookmark any search result for quick access.
 * Saved Searches: save a query + filters for re-running later.
 *
 * Both use SQLite tables (persist across app reinstalls).
 */

import { getDatabase } from './database';

export interface Bookmark {
  id: number;
  fileUri: string;
  fileName: string;
  created: string;
  tags?: string; // JSON array of strings
  parsedTags?: string[];
  fileId?: number;
  size?: number;
  extension?: string;
}

export interface SavedSearch {
  id: number;
  name: string;
  query: string;
  mode: string;
  created: string;
}

// ─── Bookmarks ─────────────────────────────────────────────────────

let isBookmarksTableReady = false;

async function initBookmarksTable(db: any) {
  if (isBookmarksTableReady) return;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_uri TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      created TEXT NOT NULL,
      tags TEXT
    );
  `);
  // Simple migration: add tags column if missing
  try {
    await db.execAsync('ALTER TABLE bookmarks ADD COLUMN tags TEXT;');
  } catch (e) {
    // Column already exists
  }
  isBookmarksTableReady = true;
}

export async function addBookmark(fileUri: string, fileName: string, tags: string[] = []): Promise<void> {
  const db = await getDatabase();
  await initBookmarksTable(db);
  
  const tagsStr = tags.length > 0 ? JSON.stringify(tags) : null;
  await db.runAsync(
    `INSERT INTO bookmarks (file_uri, file_name, created, tags) VALUES (?, ?, ?, ?)
     ON CONFLICT(file_uri) DO UPDATE SET tags = excluded.tags`,
    [fileUri, fileName, new Date().toISOString(), tagsStr]
  );
}

export async function updateBookmarkTags(fileUri: string, tags: string[]): Promise<void> {
  const db = await getDatabase();
  await initBookmarksTable(db);
  const tagsStr = tags.length > 0 ? JSON.stringify(tags) : null;
  await db.runAsync(
    'UPDATE bookmarks SET tags = ? WHERE file_uri = ?',
    [tagsStr, fileUri]
  );
}

export async function getAllUniqueBookmarkTags(): Promise<string[]> {
  const db = await getDatabase();
  await initBookmarksTable(db);
  const rows = await db.getAllAsync<{ tags: string | null }>('SELECT tags FROM bookmarks WHERE tags IS NOT NULL');
  const tagSet = new Set<string>();
  for (const r of rows) {
    if (r.tags) {
      try {
        const parsed = JSON.parse(r.tags);
        if (Array.isArray(parsed)) {
          parsed.forEach((t: string) => {
            if (typeof t === 'string' && t.trim()) tagSet.add(t.trim());
          });
        }
      } catch (e) {}
    }
  }
  return Array.from(tagSet).sort();
}

export async function removeBookmark(fileUri: string): Promise<void> {
  const db = await getDatabase();
  await initBookmarksTable(db);
  await db.runAsync('DELETE FROM bookmarks WHERE file_uri = ?', [fileUri]);
}

export async function getBookmarks(): Promise<Bookmark[]> {
  const db = await getDatabase();
  await initBookmarksTable(db);
  
  const rows = await db.getAllAsync<{
    id: number; 
    file_uri: string; 
    file_name: string; 
    created: string; 
    tags: string | null;
    file_id?: number;
    size?: number;
    extension?: string;
  }>(`
    SELECT b.id, b.file_uri, b.file_name, b.created, b.tags,
           f.id as file_id, f.size, f.extension
    FROM bookmarks b
    LEFT JOIN files f ON f.uri = b.file_uri
    ORDER BY b.created DESC
  `);
  
  return rows.map((r) => {
    let parsedTags: string[] = [];
    if (r.tags) {
      try {
        const parsed = JSON.parse(r.tags);
        if (Array.isArray(parsed)) parsedTags = parsed;
      } catch (e) {}
    }
    return {
      id: r.id,
      fileUri: r.file_uri,
      fileName: r.file_name,
      created: r.created,
      tags: r.tags || undefined,
      parsedTags,
      fileId: r.file_id || undefined,
      size: r.size || 0,
      extension: r.extension || (r.file_name.split('.').pop() || '').toLowerCase(),
    };
  });
}

export async function isBookmarked(fileUri: string): Promise<boolean> {
  const db = await getDatabase();
  await initBookmarksTable(db);
  
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM bookmarks WHERE file_uri = ?',
    [fileUri]
  );
  return !!row;
}

// ─── Saved Searches ────────────────────────────────────────────────

export async function saveSearch(
  name: string,
  query: string,
  mode: string = 'partial'
): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      query TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'partial',
      created TEXT NOT NULL
    );
  `);
  await db.runAsync(
    `INSERT OR REPLACE INTO saved_searches (name, query, mode, created) VALUES (?, ?, ?, ?)`,
    [name, query, mode, new Date().toISOString()]
  );
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      query TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'partial',
      created TEXT NOT NULL
    );
  `);
  const rows = await db.getAllAsync<{
    id: number; name: string; query: string; mode: string; created: string;
  }>('SELECT id, name, query, mode, created FROM saved_searches ORDER BY created DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    query: r.query,
    mode: r.mode,
    created: r.created,
  }));
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_searches WHERE id = ?', [id]);
}

export async function clearAllBookmarks(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM bookmarks');
}

export async function clearAllSavedSearches(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_searches');
}
