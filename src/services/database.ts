/**
 * database.ts — SQLite + FTS5 database for file indexing + content search.
 *
 * This mirrors the desktop FileLensPro `database/schema.py` + `db_manager.py`.
 * Uses `expo-sqlite` which ships with SQLite 3.39+ (FTS5 enabled by default).
 *
 * Schema:
 *   files         — metadata (name, path, size, modified, extension, ...)
 *   file_content  — extracted text content + OCR text
 *   files_fts     — FTS5 virtual table over name, path, content, ocr_text
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { normalizeDevanagariOcrText } from './ocrService';
import { ChecklistItem, normalizeActionItems } from './temporalExtractionService';

const DB_NAME = 'filelens.db';

const SCHEMA_SQL = `
-- Files metadata table
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  extension TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT 'file',
  size INTEGER NOT NULL DEFAULT 0,
  modified TEXT NOT NULL,
  content_text TEXT,
  ocr_text TEXT,
  ocr_status TEXT NOT NULL DEFAULT 'skipped',
  index_date TEXT NOT NULL,
  semantic_vector BLOB,
  is_card INTEGER NOT NULL DEFAULT 0,
  custom_tag TEXT DEFAULT ''
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  name,
  uri,
  content,
  ocr_text,
  extension,
  tokenize = 'unicode61 remove_diacritics 0'
);

-- Semantic vector chunks table for local AI search
CREATE TABLE IF NOT EXISTS file_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  page_number INTEGER DEFAULT 1,
  embedding BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON file_chunks(file_id);

-- Index stats (for display in sidebar/settings)
CREATE TABLE IF NOT EXISTS index_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_files INTEGER NOT NULL DEFAULT 0,
  ocr_done INTEGER NOT NULL DEFAULT 0,
  ocr_pending INTEGER NOT NULL DEFAULT 0,
  cards_count INTEGER NOT NULL DEFAULT 0,
  last_index TEXT
);
INSERT OR IGNORE INTO index_stats (id) VALUES (1);

-- Voice notes table for Second Brain
CREATE TABLE IF NOT EXISTS voice_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  uri TEXT NOT NULL UNIQUE,
  title TEXT DEFAULT '',
  raw_transcript TEXT NOT NULL,
  temporal_class TEXT NOT NULL DEFAULT 'historical', -- 'today' | 'future' | 'historical'
  resolved_datetime TEXT,                            -- ISO datetime string
  action_items TEXT,                                 -- JSON string array
  is_reminder_set INTEGER NOT NULL DEFAULT 0,
  image_uris TEXT DEFAULT '[]',                      -- JSON string array of attached images
  linked_doc_uri TEXT DEFAULT '',                    -- Cross-linked PDF or Card URI
  linked_doc_name TEXT DEFAULT '',                   -- Cross-linked PDF or Card display name
  linked_doc_type TEXT DEFAULT '',                   -- 'pdf' | 'card' | 'scan'
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_temporal ON voice_notes(temporal_class, resolved_datetime);
CREATE INDEX IF NOT EXISTS idx_voice_file ON voice_notes(file_id);
`;

let db: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (or create) the database and initialize the schema instantly in <1ms */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const database = await SQLite.openDatabaseAsync(DB_NAME);

    // Enable WAL mode and 10-second busy timeout for safe concurrent search while indexing
    await database.execAsync('PRAGMA journal_mode=WAL;');
    await database.execAsync('PRAGMA synchronous=NORMAL;');
    await database.execAsync('PRAGMA busy_timeout=10000;');

    // Startup Integrity Check & Silent FTS5 Self-Healing
    try {
      const integrity = await database.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check(1);');
      if (integrity && integrity.quick_check !== 'ok') {
        console.warn('[database] SQLite quick_check issue detected:', integrity.quick_check);
      }
    } catch (checkErr) {
      console.warn('[database] PRAGMA quick_check error:', checkErr);
    }

    // Create the schema
    await database.execAsync(SCHEMA_SQL);

    // Verify FTS5 virtual table integrity, and rebuild silently if an unexpected shutdown caused corruption
    try {
      await database.execAsync("INSERT INTO files_fts(files_fts) VALUES('integrity-check');");
    } catch (ftsCorruptedErr) {
      console.warn('[database] FTS5 integrity check failed, performing automatic self-healing rebuild...', ftsCorruptedErr);
      try {
        await database.execAsync("INSERT INTO files_fts(files_fts) VALUES('rebuild');");
        console.log('[database] FTS5 virtual table successfully self-healed and rebuilt.');
      } catch (rebuildErr) {
        console.error('[database] Failed to rebuild FTS5 table, dropping and recreating:', rebuildErr);
        try {
          await database.execAsync("DROP TABLE IF EXISTS files_fts;");
          await database.execAsync(`
            CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
              name,
              uri,
              content,
              ocr_text,
              extension,
              tokenize = 'unicode61 remove_diacritics 0'
            );
            INSERT INTO files_fts(rowid, name, uri, content, ocr_text, extension)
            SELECT id, name, uri, COALESCE(content_text, ''), COALESCE(ocr_text, ''), extension
            FROM files;
          `);
        } catch (_) {}
      }
    }

    // Ensure columns exist (fast ALTER TABLE if missing)
    try {
      await database.execAsync(`
        ALTER TABLE files ADD COLUMN is_card INTEGER NOT NULL DEFAULT 0;
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE files ADD COLUMN custom_tag TEXT DEFAULT '';
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE files ADD COLUMN page_count INTEGER DEFAULT 1;
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE index_stats ADD COLUMN cards_count INTEGER NOT NULL DEFAULT 0;
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE voice_notes ADD COLUMN image_uris TEXT DEFAULT '[]';
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE voice_notes ADD COLUMN title TEXT DEFAULT '';
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE voice_notes ADD COLUMN linked_doc_uri TEXT DEFAULT '';
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE voice_notes ADD COLUMN linked_doc_name TEXT DEFAULT '';
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        ALTER TABLE voice_notes ADD COLUMN linked_doc_type TEXT DEFAULT '';
      `);
    } catch (e) {}
    try {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chunk_id INTEGER,
          file_id INTEGER,
          embedding BLOB
        );
      `);
    } catch (e) {}
    try {
      const triggers = await database.getAllAsync<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'"
      );
      for (const t of triggers) {
        if (t.sql && t.sql.includes('chunk_embeddings')) {
          await database.execAsync(`DROP TRIGGER IF EXISTS "${t.name}";`);
        }
      }
    } catch (e) {}

    db = database;
    dbPromise = null;
    return database;
  })();

  return dbPromise;
}

/** Close the database (used on app shutdown) */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

/** Upsert a file entry + its content into the DB + FTS index */
export async function upsertFile(
  entry: {
    uri: string;
    name: string;
    extension: string;
    size: number;
    modified: string;
    contentText?: string | null;
    ocrText?: string | null;
    ocrStatus?: string;
    pageCount?: number;
  },
  isCard: boolean = false,
  customTag: string = ''
): Promise<number> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const ocrStatus = entry.ocrStatus ?? 'skipped';
  const isCardInt = isCard ? 1 : 0;

  // Check if file already exists (by URI)
  // Clean strings to prevent null byte errors in SQLite
  const safeContentText = entry.contentText ? entry.contentText.replace(/\0/g, '') : null;
  const safeOcrText = entry.ocrText ? entry.ocrText.replace(/\0/g, '') : null;
  const safeName = entry.name.replace(/\0/g, '');

  let existing = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM files WHERE uri = ?',
    [entry.uri]
  );

  let fileId: number;

  if (existing) {
    // Update existing record
    if (entry.pageCount !== undefined && entry.pageCount > 0) {
      await database.runAsync(
        `UPDATE files SET name = ?, extension = ?, size = ?, modified = ?,
         content_text = ?, ocr_text = ?, ocr_status = ?, index_date = ?,
         is_card = ?, custom_tag = ?, page_count = ?
         WHERE id = ?`,
        [
          safeName, entry.extension, entry.size, entry.modified,
          safeContentText, safeOcrText, ocrStatus, now,
          isCardInt, customTag, entry.pageCount,
          existing.id,
        ]
      );
    } else {
      await database.runAsync(
        `UPDATE files SET name = ?, extension = ?, size = ?, modified = ?,
         content_text = ?, ocr_text = ?, ocr_status = ?, index_date = ?,
         is_card = ?, custom_tag = ?
         WHERE id = ?`,
        [
          safeName, entry.extension, entry.size, entry.modified,
          safeContentText, safeOcrText, ocrStatus, now,
          isCardInt, customTag,
          existing.id,
        ]
      );
    }
    fileId = existing.id;
  } else {
    try {
      // Insert new record
      const result = await database.runAsync(
        `INSERT INTO files 
         (uri, name, extension, file_type, size, modified, content_text, ocr_text, ocr_status, index_date, is_card, custom_tag, page_count)
         VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.uri, safeName, entry.extension, entry.size, entry.modified,
          safeContentText, safeOcrText, ocrStatus, now,
          isCardInt, customTag,
          entry.pageCount && entry.pageCount > 0 ? entry.pageCount : 1,
        ]
      );
      fileId = result.lastInsertRowId as number;
    } catch (insertErr) {
      // Fallback in case of collision
      const reCheck = await database.getFirstAsync<{ id: number }>(
        'SELECT id FROM files WHERE uri = ?',
        [entry.uri]
      );
      if (reCheck) {
        fileId = reCheck.id;
        if (entry.pageCount !== undefined && entry.pageCount > 0) {
          await database.runAsync(
            `UPDATE files SET name = ?, extension = ?, size = ?, modified = ?,
             content_text = ?, ocr_text = ?, ocr_status = ?, index_date = ?,
             is_card = ?, custom_tag = ?, page_count = ?
             WHERE id = ?`,
            [
              safeName, entry.extension, entry.size, entry.modified,
              safeContentText, safeOcrText, ocrStatus, now,
              isCardInt, customTag, entry.pageCount,
              fileId,
            ]
          );
        } else {
          await database.runAsync(
            `UPDATE files SET name = ?, extension = ?, size = ?, modified = ?,
             content_text = ?, ocr_text = ?, ocr_status = ?, index_date = ?,
             is_card = ?, custom_tag = ?
             WHERE id = ?`,
            [
              safeName, entry.extension, entry.size, entry.modified,
              safeContentText, safeOcrText, ocrStatus, now,
              isCardInt, customTag,
              fileId,
            ]
          );
        }
      } else {
        throw insertErr;
      }
    }
  }

  // Update FTS
  await database.runAsync('DELETE FROM files_fts WHERE rowid = ?', [fileId]);
  await database.runAsync(
    `INSERT INTO files_fts (rowid, name, uri, content, ocr_text, extension)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      fileId,
      safeName,
      entry.uri,
      safeContentText ?? '',
      safeOcrText ?? '',
      entry.extension,
    ]
  );

  return fileId;
}

let lastRefreshStatsTime = 0;
export async function refreshIndexStats(force = false): Promise<void> {
  const nowMs = Date.now();
  if (!force && nowMs - lastRefreshStatsTime < 3000) {
    return;
  }
  lastRefreshStatsTime = nowMs;

  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    await database.runAsync(
      `UPDATE index_stats SET 
         total_files = (SELECT COUNT(*) FROM files),
         ocr_done = (SELECT COUNT(*) FROM files WHERE ocr_status = 'done'),
         ocr_pending = (SELECT COUNT(*) FROM files WHERE ocr_status = 'pending' OR ocr_status = 'pending_content'),
         cards_count = (SELECT COUNT(*) FROM files WHERE is_card = 1),
         last_index = ? 
       WHERE id = 1`,
      [now]
    );
  } catch (e) {
    console.warn('[database] Failed to refresh stats:', e);
  }
}

/**
 * Renames a document in the database and updates full-text search (FTS5)
 */
export async function renameDocument(identifier: number | string, newName: string, fallbackUri?: string): Promise<string> {
  const database = await getDatabase();
  const trimmed = newName.trim();
  const cleanName = trimmed.endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;

  let row: { id: number; uri: string; content_text: string | null; ocr_text: string | null; extension: string } | null = null;
  if (typeof identifier === 'number') {
    row = await database.getFirstAsync('SELECT id, uri, content_text, ocr_text, extension FROM files WHERE id = ?', [identifier]);
  }
  if (!row && fallbackUri) {
    row = await database.getFirstAsync('SELECT id, uri, content_text, ocr_text, extension FROM files WHERE uri = ?', [fallbackUri]);
  }
  if (!row && typeof identifier === 'string') {
    row = await database.getFirstAsync('SELECT id, uri, content_text, ocr_text, extension FROM files WHERE uri = ?', [identifier]);
  }

  if (row) {
    await database.runAsync('UPDATE files SET name = ?, modified = ? WHERE id = ?', [cleanName, new Date().toISOString(), row.id]);
    try {
      await database.runAsync('DELETE FROM files_fts WHERE rowid = ?', [row.id]);
      await database.runAsync(
        `INSERT INTO files_fts (rowid, name, uri, content, ocr_text, extension)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, cleanName, row.uri, row.content_text ?? '', row.ocr_text ?? '', row.extension ?? 'pdf']
      );
    } catch (ftsErr) {
      try {
        await database.runAsync('UPDATE files_fts SET name = ? WHERE rowid = ?', [cleanName, row.id]);
      } catch (_) {}
    }
  } else {
    const targetUri = fallbackUri || (typeof identifier === 'string' ? identifier : null);
    if (targetUri) {
      await database.runAsync('UPDATE files SET name = ?, modified = ? WHERE uri = ?', [cleanName, new Date().toISOString(), targetUri]).catch(() => {});
    }
  }

  return cleanName;
}

/**
 * Deletes a document from SQLite database (files, files_fts, chunks, chunk_embeddings)
 * and optionally removes the physical file from disk.
 */
export async function deleteDocument(
  identifier: number | string,
  deleteFromDisk: boolean = true,
  explicitUri?: string
): Promise<void> {
  try {
    const database = await getDatabase();
    let row: { id: number; uri: string } | null = null;
    if (typeof identifier === 'number') {
      row = await database.getFirstAsync('SELECT id, uri FROM files WHERE id = ?', [identifier]);
    } else {
      row = await database.getFirstAsync('SELECT id, uri FROM files WHERE uri = ?', [identifier]);
    }

    // Fallback: If not found by numeric ID, try finding by explicitUri
    if (!row && explicitUri) {
      row = await database.getFirstAsync('SELECT id, uri FROM files WHERE uri = ?', [explicitUri]);
    }

    if (row) {
      try { await database.runAsync('DELETE FROM files_fts WHERE rowid = ?', [row.id]); } catch (e) {}
      try { await database.runAsync('DELETE FROM file_chunks WHERE file_id = ?', [row.id]); } catch (e) {}
      try { await database.runAsync('DELETE FROM chunk_embeddings WHERE file_id = ?', [row.id]); } catch (e) {}
      try { await database.runAsync('DELETE FROM voice_notes WHERE file_id = ?', [row.id]); } catch (e) {}
      try { await database.runAsync('DELETE FROM files WHERE id = ?', [row.id]); } catch (e) {}
      invalidateChunkEmbeddingsCache();
    } else if (explicitUri) {
      try { await database.runAsync('DELETE FROM files WHERE uri = ?', [explicitUri]); } catch (e) {}
    } else if (typeof identifier === 'string') {
      try { await database.runAsync('DELETE FROM files WHERE uri = ?', [identifier]); } catch (e) {}
    }

    // Unconditional disk deletion: Determine target disk path
    if (deleteFromDisk) {
      const diskPath = row?.uri || explicitUri || (typeof identifier === 'string' ? identifier : null);
      if (diskPath) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(diskPath);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(diskPath, { idempotent: true });
          }
        } catch (err) {
          console.warn('[database] Failed to delete file from disk:', diskPath, err);
        }
      }
    }
  } catch (e) {
    console.warn('[database] deleteDocument error:', e);
    // Do not rethrow table errors that break user experience
  }
}

/** Get index stats for display */

export async function getFileContentByUri(uri: string): Promise<{ contentText?: string; ocrText?: string; name?: string } | null> {
  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ content_text: string | null; ocr_text: string | null; name: string | null }>(
      'SELECT content_text, ocr_text, name FROM files WHERE uri = ?',
      [uri]
    );
    if (!result) return null;
    return {
      contentText: result.content_text || undefined,
      ocrText: result.ocr_text || undefined,
      name: result.name || undefined,
    };
  } catch (error) {
    console.warn('[database] Failed to get file content by URI:', error);
    return null;
  }
}

export async function getFileMetadataByUri(uri: string): Promise<{ modified: string, size: number, ocr_status: string } | null> {
  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ modified: string, size: number, ocr_status: string }>(
      'SELECT modified, size, ocr_status FROM files WHERE uri = ?',
      [uri]
    );
    return result || null;
  } catch (error) {
    console.warn('[database] Failed to get file metadata by URI:', error);
    return null;
  }
}

export async function getFileMetadataByNameAndSize(name: string, size: number): Promise<{ modified: string, ocr_status: string } | null> {
  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ modified: string, ocr_status: string }>(
      'SELECT modified, ocr_status FROM files WHERE name = ? AND size = ?',
      [name, size]
    );
    return result || null;
  } catch (error) {
    console.warn('[database] Failed to get file metadata by name and size:', error);
    return null;
  }
}

export async function getPendingContentFiles(): Promise<{ uri: string, name: string, size: number, modified: string, extension: string }[]> {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<{ uri: string, name: string, size: number, modified: string, extension: string }>(
      "SELECT uri, name, size, modified, extension FROM files WHERE ocr_status = 'pending_content'"
    );
  } catch (error) {
    console.warn('[database] Failed to get pending content files:', error);
    return [];
  }
}

export async function getPendingOcrFiles(limit: number = 300): Promise<{ uri: string, name: string, size: number, modified: string, extension: string }[]> {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<{ uri: string, name: string, size: number, modified: string, extension: string }>(
      `SELECT uri, name, size, modified, extension FROM files 
       WHERE ocr_status = 'pending' 
          OR ocr_status = 'pending_content' 
       ORDER BY is_card DESC, modified DESC
       LIMIT ?`,
      [limit]
    );
  } catch (error) {
    console.warn('[database] Failed to get pending OCR files:', error);
    return [];
  }
}

export async function getIndexStats(): Promise<{
  totalFiles: number;
  indexedFiles: number;
  cardsCount: number;
  ocrDone: number;
  ocrPending: number;
  lastIndex: string | null;
}> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    total_files: number;
    ocr_done: number;
    ocr_pending: number;
    cards_count: number;
    last_index: string | null;
  }>('SELECT total_files, ocr_done, ocr_pending, cards_count, last_index FROM index_stats WHERE id = 1');

  if (row && row.total_files !== undefined) {
    const total = row.total_files || 0;
    const cards = row.cards_count || 0;
    return {
      totalFiles: total,
      indexedFiles: Math.max(0, total - cards),
      cardsCount: cards,
      ocrDone: row.ocr_done || 0,
      ocrPending: row.ocr_pending || 0,
      lastIndex: row.last_index || null,
    };
  }

  return {
    totalFiles: 0,
    indexedFiles: 0,
    cardsCount: 0,
    ocrDone: 0,
    ocrPending: 0,
    lastIndex: null,
  };
}

/** Clear all indexed device files while preserving Cards */
export async function clearIndex(
  keepCards: boolean = true,
  onProgress?: (step: string, progress: number) => void
): Promise<void> {
  const database = await getDatabase();
  
  onProgress?.('Preparing database...', 0.15);

  await database.withTransactionAsync(async () => {
    onProgress?.('Purging search index & content chunks...', 0.40);
    if (!keepCards) {
      await database.runAsync('DELETE FROM file_chunks');
      await database.runAsync('DELETE FROM files_fts');
      await database.runAsync('DELETE FROM files');
    } else {
      await database.runAsync('DELETE FROM file_chunks WHERE file_id IN (SELECT id FROM files WHERE is_card = 0)');
      await database.runAsync('DELETE FROM files_fts WHERE rowid IN (SELECT id FROM files WHERE is_card = 0)');
      await database.runAsync('DELETE FROM files WHERE is_card = 0');
    }
    
    onProgress?.('Resetting indexed folder targets...', 0.70);
    await database.runAsync('DELETE FROM index_targets');
    
    onProgress?.('Recalculating database stats...', 0.90);
    await database.runAsync(
      `UPDATE index_stats SET total_files = (SELECT COUNT(*) FROM files),
       ocr_done = (SELECT COUNT(*) FROM files WHERE ocr_status = 'done'),
       ocr_pending = (SELECT COUNT(*) FROM files WHERE ocr_status = 'pending'),
       last_index = NULL WHERE id = 1`
    );
  });

  onProgress?.('Clearing cached embeddings...', 0.98);
  invalidateChunkEmbeddingsCache();
  onProgress?.('Complete', 1.0);
}

export async function addIndexTarget(type: string, uri: string = ''): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS index_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      uri TEXT NOT NULL UNIQUE
    );
  `);
  await database.runAsync(
    'INSERT OR IGNORE INTO index_targets (type, uri) VALUES (?, ?)',
    [type, uri]
  );
}

export async function clearIndexTargetsByType(type: string): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS index_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      uri TEXT NOT NULL UNIQUE
    );
  `);
  await database.runAsync('DELETE FROM index_targets WHERE type = ?', [type]);
}

export async function getIndexTargets(): Promise<{ type: string; uri?: string; albumId?: string }[]> {
  const database = await getDatabase();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS index_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      uri TEXT NOT NULL UNIQUE
    );
  `);
  const rows = await database.getAllAsync<{ type: string; uri: string }>('SELECT type, uri FROM index_targets');
  return rows.map(r => {
    if (r.type === 'album') {
      return { type: r.type, albumId: r.uri };
    }
    return { type: r.type, ...(r.uri ? { uri: r.uri } : {}) };
  });
}

/**
 * Delete a file by its ID from files, files_fts, and file_chunks tables.
 */
export async function deleteFileById(fileId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM file_chunks WHERE file_id = ?', [fileId]);
  await database.runAsync('DELETE FROM files_fts WHERE rowid = ?', [fileId]);
  await database.runAsync('DELETE FROM files WHERE id = ?', [fileId]);
}

/**
 * Update a card's custom tag and refresh FTS text
 */
export async function updateCardTag(fileId: number, newTag: string): Promise<void> {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ content_text: string }>('SELECT content_text FROM files WHERE id = ?', [fileId]);
  
  if (existing) {
    let content = existing.content_text || '';
    // Remove old tag if it exists
    content = content.replace(/^\[Card Tag:.*?\]\n\n/, '');
    content = content.replace(/^\[Card Tag:.*?\]/, '');
    
    // Add new tag if provided
    if (newTag) {
      const tagString = `[Card Tag: ${newTag}]`;
      content = content ? `${tagString}\n\n${content}` : tagString;
    }

    await database.runAsync('UPDATE files SET custom_tag = ?, content_text = ? WHERE id = ?', [newTag, content, fileId]);
    await database.runAsync('UPDATE files_fts SET content = ? WHERE rowid = ?', [content, fileId]);
  }
}

/**
 * Convert an existing indexed file to a Card by marking is_card = 1 and updating custom tag.
 */
export async function markFileAsCard(fileId: number, customTag: string): Promise<void> {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ content_text: string | null; ocr_text: string | null; name: string }>(
    'SELECT content_text, ocr_text, name FROM files WHERE id = ?',
    [fileId]
  );
  
  if (existing) {
    let content = existing.content_text || existing.ocr_text || '';
    // Clean old card tag if exists
    content = content.replace(/^\[Card Tag:.*?\]\n\n/, '');
    content = content.replace(/^\[Card Tag:.*?\]/, '');
    
    if (customTag) {
      const tagString = `[Card Tag: ${customTag}]`;
      content = content ? `${tagString}\n\n${content}` : tagString;
    }

    await database.runAsync(
      'UPDATE files SET is_card = 1, custom_tag = ?, content_text = ? WHERE id = ?',
      [customTag, content, fileId]
    );
    await database.runAsync(
      'UPDATE files_fts SET content = ? WHERE rowid = ?',
      [content, fileId]
    );
  }
}

/**
 * Save semantic vector chunk embeddings for a specific file.
 */
export async function saveFileChunkEmbeddings(
  fileId: number,
  chunks: Array<{ text: string; pageNumber: number; vector: Float32Array }>
): Promise<void> {
  if (!chunks || chunks.length === 0) return;
  const database = await getDatabase();
  
  await database.withTransactionAsync(async () => {
    // Clean up any old chunks for this file
    await database.runAsync('DELETE FROM file_chunks WHERE file_id = ?', [fileId]);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const safeText = chunk.text.replace(/\0/g, '');
      const uint8Bytes = new Uint8Array(chunk.vector.buffer, chunk.vector.byteOffset, chunk.vector.byteLength);

      await database.runAsync(
        `INSERT INTO file_chunks (file_id, chunk_index, chunk_text, page_number, embedding)
         VALUES (?, ?, ?, ?, ?)`,
        [fileId, i, safeText, chunk.pageNumber, uint8Bytes]
      );
    }
  });
  
  invalidateChunkEmbeddingsCache();
}

function parseVectorBlob(blob: any, dim: number = 384): Float32Array {
  if (!blob) return new Float32Array(dim);
  try {
    if (blob instanceof Uint8Array) {
      if (blob.byteOffset % 4 === 0) {
        return new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      }
      const copy = new Float32Array(Math.floor(blob.byteLength / 4));
      new Uint8Array(copy.buffer).set(blob);
      return copy;
    }
    if (blob instanceof ArrayBuffer) {
      return new Float32Array(blob, 0, Math.floor(blob.byteLength / 4));
    }
  } catch (e) {
    console.warn('[database] Error parsing embedding blob:', e);
  }
  return new Float32Array(dim);
}

let cachedChunkEmbeddings: Array<{
  fileId: number;
  chunkId: number;
  chunkText: string;
  pageNumber: number;
  vector: Float32Array;
  fileName: string;
  fileUri: string;
  fileExtension: string;
  fileSize: number;
  fileModified: string;
}> | null = null;

export function invalidateChunkEmbeddingsCache(): void {
  cachedChunkEmbeddings = null;
}

/**
 * Retrieve all chunk embeddings joined with lightweight file metadata for similarity search.
 * Persistently cached in RAM for ultra-fast instant sub-second queries at scale (4,000+ files).
 */
export async function getAllChunkEmbeddings(forceRefresh: boolean = false): Promise<Array<{
  fileId: number;
  chunkId: number;
  chunkText: string;
  pageNumber: number;
  vector: Float32Array;
  fileName: string;
  fileUri: string;
  fileExtension: string;
  fileSize: number;
  fileModified: string;
  isCard?: boolean;
  customTag?: string;
}>> {
  if (!forceRefresh && cachedChunkEmbeddings !== null) {
    return cachedChunkEmbeddings;
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(`
    SELECT c.id as chunk_id, c.file_id, c.chunk_text, c.page_number, c.embedding,
           f.name, f.uri, f.extension, f.size, f.modified, f.is_card, f.custom_tag
    FROM file_chunks c
    JOIN files f ON f.id = c.file_id
  `);

  cachedChunkEmbeddings = rows.map((r: any) => ({
    fileId: r.file_id,
    chunkId: r.chunk_id,
    chunkText: r.chunk_text || '',
    pageNumber: r.page_number || 1,
    vector: parseVectorBlob(r.embedding),
    fileName: r.name || '',
    fileUri: r.uri || '',
    fileExtension: r.extension || '',
    fileSize: r.size || 0,
    fileModified: r.modified || '',
    isCard: r.is_card === 1,
    customTag: r.custom_tag || '',
  }));

  return cachedChunkEmbeddings;
}

/**
 * Fetch full document content on demand for preview, detail view, or export.
 * Supports querying by file ID or file URI.
 */
export async function getFileContent(identifier: number | string): Promise<{ contentText: string | null; ocrText: string | null }> {
  try {
    const database = await getDatabase();
    let res: { content_text: string | null; ocr_text: string | null } | null = null;
    if (typeof identifier === 'number') {
      res = await database.getFirstAsync<{ content_text: string | null; ocr_text: string | null }>(
        'SELECT content_text, ocr_text FROM files WHERE id = ?',
        [identifier]
      );
    }
    if (!res && identifier) {
      const idStr = String(identifier);
      const withPrefix = idStr.startsWith('file://') ? idStr : `file://${idStr}`;
      const withoutPrefix = idStr.startsWith('file://') ? idStr.replace(/^file:\/\//, '') : idStr;
      const fileName = idStr.split('/').pop() || '';
      res = await database.getFirstAsync<{ content_text: string | null; ocr_text: string | null }>(
        'SELECT content_text, ocr_text FROM files WHERE uri = ? OR uri = ? OR (name = ? AND name != "") LIMIT 1',
        [withPrefix, withoutPrefix, fileName]
      );
    }
    return {
      contentText: res?.content_text || null,
      ocrText: res?.ocr_text || null,
    };
  } catch (e) {
    return { contentText: null, ocrText: null };
  }
}

/**
 * Backwards compatibility alias for getFileContent.
 */
export async function getFileContentById(fileId: number): Promise<{ contentText: string | null; ocrText: string | null }> {
  return getFileContent(fileId);
}

/**
 * Update document content & OCR text in files and files_fts.
 */
export async function updateFileOcrContent(
  uriOrId: string | number,
  text: string
): Promise<void> {
  try {
    const database = await getDatabase();
    const cleanText = text.replace(/\0/g, '');
    let existing: { id: number; uri: string; name: string; extension: string } | null = null;
    if (typeof uriOrId === 'number') {
      existing = await database.getFirstAsync<{ id: number; uri: string; name: string; extension: string }>(
        'SELECT id, uri, name, extension FROM files WHERE id = ?',
        [uriOrId]
      );
    }
    if (!existing && uriOrId) {
      existing = await database.getFirstAsync<{ id: number; uri: string; name: string; extension: string }>(
        'SELECT id, uri, name, extension FROM files WHERE uri = ?',
        [String(uriOrId)]
      );
    }

    if (existing) {
      await database.runAsync(
        'UPDATE files SET content_text = ?, ocr_text = ?, ocr_status = ? WHERE id = ?',
        [cleanText, cleanText, 'done', existing.id]
      );
      await database.runAsync('DELETE FROM files_fts WHERE rowid = ?', [existing.id]).catch(() => {});
      await database.runAsync(
        'INSERT INTO files_fts (rowid, name, uri, content, ocr_text, extension) VALUES (?, ?, ?, ?, ?, ?)',
        [existing.id, existing.name, existing.uri, cleanText, cleanText, existing.extension || 'pdf']
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[database] updateFileOcrContent failed:', err);
  }
}

/**
 * Delete chunk embeddings for a specific file.
 */
export async function deleteFileChunkEmbeddings(fileId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM file_chunks WHERE file_id = ?', [fileId]);
}

/**
 * Fetch all files that have text content or OCR text but are missing chunk embeddings.
 */
export async function getFilesMissingEmbeddings(): Promise<Array<{
  id: number;
  uri: string;
  name: string;
  extension: string;
  size: number;
  modified: string;
  content_text: string | null;
  ocr_text: string | null;
  ocr_status: string;
}>> {
  const database = await getDatabase();
  return await database.getAllAsync<any>(`
    SELECT f.id, f.uri, f.name, f.extension, f.size, f.modified, f.content_text, f.ocr_text, f.ocr_status
    FROM files f
    LEFT JOIN file_chunks c ON c.file_id = f.id
    WHERE c.id IS NULL
      AND ((f.content_text IS NOT NULL AND LENGTH(TRIM(f.content_text)) > 0)
        OR (f.ocr_text IS NOT NULL AND LENGTH(TRIM(f.ocr_text)) > 0))
    LIMIT 100
  `);
}

export interface VoiceNoteRecord {
  id: number;
  fileId: number;
  uri: string;
  title?: string;
  rawTranscript: string;
  temporalClass: 'today' | 'future' | 'historical';
  resolvedDatetime: string | null;
  actionItems: any[];
  checklistItems?: ChecklistItem[];
  isReminderSet: boolean;
  imageUris?: string[];
  linkedDocUri?: string;
  linkedDocName?: string;
  linkedDocType?: string;
  createdAt: string;
}

export async function saveVoiceNoteRecord(entry: {
  uri: string;
  title?: string;
  rawTranscript: string;
  temporalClass: 'today' | 'future' | 'historical';
  resolvedDatetime?: string | null;
  actionItems?: any[];
  isReminderSet?: boolean;
  imageUris?: string[];
  linkedDocUri?: string;
  linkedDocName?: string;
  linkedDocType?: string;
}): Promise<number> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const actionItemsJson = JSON.stringify(entry.actionItems || []);
  const imageUrisJson = JSON.stringify(entry.imageUris || []);
  const resolvedDatetime = entry.resolvedDatetime || null;
  const isReminderSetInt = entry.isReminderSet ? 1 : 0;
  const title = (entry.title || '').trim();
  const linkedDocUri = entry.linkedDocUri || '';
  const linkedDocName = entry.linkedDocName || '';
  const linkedDocType = entry.linkedDocType || '';

  const fileName = `Voice Note - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const fileId = await upsertFile({
    uri: entry.uri,
    name: fileName,
    extension: 'txt',
    size: entry.rawTranscript.length,
    modified: now,
    contentText: `[Source: Voice Note | ${entry.temporalClass.toUpperCase()}]\n${entry.rawTranscript}`,
    ocrText: '',
    ocrStatus: 'done',
  });

  const result = await database.runAsync(
    `INSERT INTO voice_notes 
     (file_id, uri, title, raw_transcript, temporal_class, resolved_datetime, action_items, is_reminder_set, image_uris, linked_doc_uri, linked_doc_name, linked_doc_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fileId,
      entry.uri,
      title,
      entry.rawTranscript,
      entry.temporalClass,
      resolvedDatetime,
      actionItemsJson,
      isReminderSetInt,
      imageUrisJson,
      linkedDocUri,
      linkedDocName,
      linkedDocType,
      now,
    ]
  );

  return result.lastInsertRowId as number;
}

export async function getVoiceNotesByTemporalClass(
  temporalClass?: 'today' | 'future' | 'historical'
): Promise<VoiceNoteRecord[]> {
  const database = await getDatabase();
  let query = 'SELECT * FROM voice_notes';
  const params: any[] = [];

  if (temporalClass) {
    query += ' WHERE temporal_class = ?';
    params.push(temporalClass);
  }

  query += temporalClass === 'future' ? ' ORDER BY resolved_datetime ASC' : ' ORDER BY created_at DESC';

  const rows = await database.getAllAsync<any>(query, params);
  return rows.map(r => {
    let parsedActions: any[] = [];
    let parsedImages: string[] = [];
    try {
      if (r.action_items) parsedActions = JSON.parse(r.action_items);
    } catch {
      parsedActions = [];
    }
    try {
      if (r.image_uris) parsedImages = JSON.parse(r.image_uris);
    } catch {
      parsedImages = [];
    }

    const normalizedChecklist = normalizeActionItems(parsedActions);

    return {
      id: r.id,
      fileId: r.file_id,
      uri: r.uri,
      title: r.title || '',
      rawTranscript: r.raw_transcript,
      temporalClass: r.temporal_class,
      resolvedDatetime: r.resolved_datetime,
      actionItems: parsedActions,
      checklistItems: normalizedChecklist,
      isReminderSet: r.is_reminder_set === 1,
      imageUris: parsedImages,
      linkedDocUri: r.linked_doc_uri || '',
      linkedDocName: r.linked_doc_name || '',
      linkedDocType: r.linked_doc_type || '',
      createdAt: r.created_at,
    };
  });
}

export async function deleteVoiceNoteById(id: number): Promise<void> {
  const database = await getDatabase();
  const note = await database.getFirstAsync<{ file_id: number }>(
    'SELECT file_id FROM voice_notes WHERE id = ?',
    [id]
  );
  if (note) {
    await deleteFileById(note.file_id);
  }
  await database.runAsync('DELETE FROM voice_notes WHERE id = ?', [id]);
}

export async function updateVoiceNoteReminderStatus(id: number, isSet: boolean): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE voice_notes SET is_reminder_set = ? WHERE id = ?', [isSet ? 1 : 0, id]);
}

export async function updateVoiceNoteTitle(id: number, title: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE voice_notes SET title = ? WHERE id = ?', [title.trim(), id]);
}

export async function updateVoiceNoteRecord(id: number, data: {
  title?: string;
  temporalClass: 'today' | 'future' | 'historical';
  resolvedDatetime: string | null;
  actionItems: any[];
  isReminderSet: boolean;
  imageUris?: string[];
  linkedDocUri?: string;
  linkedDocName?: string;
  linkedDocType?: string;
  rawTranscript?: string;
}): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const imageUrisJson = JSON.stringify(data.imageUris || []);

  if (data.title !== undefined) {
    await database.runAsync('UPDATE voice_notes SET title = ? WHERE id = ?', [data.title.trim(), id]);
  }

  if (data.linkedDocUri !== undefined) {
    await database.runAsync(
      'UPDATE voice_notes SET linked_doc_uri = ?, linked_doc_name = ?, linked_doc_type = ? WHERE id = ?',
      [data.linkedDocUri || '', data.linkedDocName || '', data.linkedDocType || '', id]
    );
  }

  if (data.rawTranscript !== undefined) {
    await database.runAsync(
      `UPDATE voice_notes 
       SET temporal_class = ?, resolved_datetime = ?, action_items = ?, is_reminder_set = ?, image_uris = ?, raw_transcript = ?
       WHERE id = ?`,
      [
        data.temporalClass,
        data.resolvedDatetime,
        JSON.stringify(data.actionItems),
        data.isReminderSet ? 1 : 0,
        imageUrisJson,
        data.rawTranscript,
        id
      ]
    );

    // Synchronize parent file record and FTS index
    const note = await database.getFirstAsync<{ file_id: number; uri: string }>(
      'SELECT file_id, uri FROM voice_notes WHERE id = ?',
      [id]
    );
    if (note) {
      await database.runAsync(
        `UPDATE files 
         SET content_text = ?, size = ?, modified = ?
         WHERE id = ?`,
        [
          `[Source: Voice Note | ${data.temporalClass.toUpperCase()}]\n${data.rawTranscript}`,
          data.rawTranscript.length,
          now,
          note.file_id
        ]
      );
      await database.runAsync('DELETE FROM files_fts WHERE rowid = ?', [note.file_id]);
      await database.runAsync(
        `INSERT INTO files_fts (rowid, name, uri, content, ocr_text, extension)
         VALUES (?, ?, ?, ?, ?, 'txt')`,
        [
          note.file_id,
          data.title?.trim() ? data.title.trim() : `Voice Note - ${new Date().toLocaleDateString()}`,
          note.uri,
          data.rawTranscript,
          ''
        ]
      );
    }
  } else {
    await database.runAsync(
      `UPDATE voice_notes 
       SET temporal_class = ?, resolved_datetime = ?, action_items = ?, is_reminder_set = ?, image_uris = ?
       WHERE id = ?`,
      [
        data.temporalClass,
        data.resolvedDatetime,
        JSON.stringify(data.actionItems),
        data.isReminderSet ? 1 : 0,
        imageUrisJson,
        id
      ]
    );
  }
}

/**
 * Toggle completion of a specific action item within a voice note
 */
export async function toggleVoiceNoteActionItem(
  noteId: number,
  itemIndex: number,
  completed?: boolean
): Promise<ChecklistItem[]> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ action_items: string }>(
    'SELECT action_items FROM voice_notes WHERE id = ?',
    [noteId]
  );
  if (!row) return [];

  const items = normalizeActionItems(row.action_items);
  if (itemIndex < 0 || itemIndex >= items.length) return items;

  items[itemIndex].completed = completed !== undefined ? completed : !items[itemIndex].completed;

  await database.runAsync(
    'UPDATE voice_notes SET action_items = ? WHERE id = ?',
    [JSON.stringify(items), noteId]
  );

  return items;
}

/**
 * Cross-link a PDF document or scanned card to a voice note
 */
export async function linkDocumentToVoiceNote(
  noteId: number,
  docUri: string,
  docName: string,
  docType: string = 'pdf'
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE voice_notes SET linked_doc_uri = ?, linked_doc_name = ?, linked_doc_type = ? WHERE id = ?',
    [docUri, docName, docType, noteId]
  );
}

/**
 * Remove cross-linked document from a voice note
 */
export async function unlinkDocumentFromVoiceNote(noteId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE voice_notes SET linked_doc_uri = '', linked_doc_name = '', linked_doc_type = '' WHERE id = ?",
    [noteId]
  );
}

/**
 * Fetch all ID cards and cards for linking in Second Brain
 */
export async function getAllCards(): Promise<Array<{
  id: number;
  uri: string;
  name: string;
  extension: string;
  category: string;
}>> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(`
      SELECT id, uri, name, extension, custom_tag
      FROM files
      WHERE is_card = 1
      ORDER BY modified DESC
    `);
    return rows.map((r: any) => ({
      id: r.id,
      uri: r.uri,
      name: r.name,
      extension: r.extension || 'jpg',
      category: r.custom_tag || 'ID Card',
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Fetch all PDF documents (both scanned and indexed storage PDFs) with metadata.
 */
export async function getAllPdfDocuments(): Promise<Array<{
  id: number;
  uri: string;
  name: string;
  extension: string;
  size: number;
  modified: string;
  category: string;
  ocrStatus: string;
  isCard: number;
  isScanned: boolean;
}>> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(`
      SELECT id, uri, name, extension, size, modified, custom_tag, ocr_status, is_card, page_count
      FROM files
      WHERE LOWER(extension) = 'pdf' OR LOWER(extension) = '.pdf' OR LOWER(name) LIKE '%.pdf' OR LOWER(uri) LIKE '%.pdf'
      ORDER BY modified DESC
    `);
    return rows.map((r: any) => ({
      id: r.id,
      uri: r.uri,
      name: r.name,
      extension: r.extension || 'pdf',
      size: r.size || 0,
      modified: r.modified || '',
      category: r.custom_tag || '',
      ocrStatus: r.ocr_status || 'pending',
      isCard: r.is_card || 0,
      isScanned: (r.uri && r.uri.includes('/scans/')) || (r.custom_tag && r.custom_tag.toLowerCase().includes('scan')),
      pageCount: r.page_count && r.page_count > 0 ? r.page_count : undefined,
    }));
  } catch (err) {
    console.warn('[database] Failed to fetch PDF documents:', err);
    return [];
  }
}

export async function updateDocumentPageCount(uri: string, pageCount: number, fileId?: number): Promise<void> {
  try {
    const database = await getDatabase();
    if (fileId) {
      await database.runAsync(
        'UPDATE files SET page_count = ? WHERE id = ? OR uri = ?',
        [pageCount, fileId, uri]
      );
    } else {
      await database.runAsync(
        'UPDATE files SET page_count = ? WHERE uri = ? OR uri = ? OR uri = ?',
        [pageCount, uri, decodeURIComponent(uri), encodeURI(uri)]
      );
    }
  } catch (e) {
    console.warn('[database] Failed to update document page count:', e);
  }
}
