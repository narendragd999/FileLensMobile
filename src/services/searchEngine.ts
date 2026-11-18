/**
 * searchEngine.ts — FTS5 full-text search engine for indexed files.
 *
 * It builds safe FTS5 queries with Hindi/English tokenization,
 * searches files_fts JOIN files, and scores results by BM25 relevance.
 */

import { getDatabase } from './database';
import { SearchMode, SearchQuery, SearchResult, FileEntry } from '../models/types';
import { searchSemantic } from './semanticSearch';
import { transliterateHinglishToHindi, transliterateSingleWord } from './multilingualTokenizer';

/** Escape a token for FTS5 — wrap in quotes if it contains special chars */
function escapeFtsToken(token: string): string {
  const clean = token.replace(/[:"'\(\)\*\+\^\{\}\[\]\\]/g, '').trim();
  return clean;
}

/** Simple tokenizer — splits on non-alphanumeric (works for Latin + Devanagari) */
function tokenize(text: string): string[] {
  return text
    .split(/[^\w\u0900-\u097F]+/)
    .map(escapeFtsToken)
    .filter((t) => t.length > 0);
}

/** Build an FTS5 MATCH query string from the user's search query + mode */
function buildFtsQuery(query: string, mode: SearchMode): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Auto-detect exact phrase if user wrapped in quotes e.g. "exact word"
  const isQuoted = (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2) ||
                   (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 2);

  if (isQuoted || mode === 'exact') {
    const rawContent = isQuoted ? trimmed.slice(1, -1).trim() : trimmed;
    if (!rawContent) return null;
    const tokens = tokenize(rawContent);
    if (tokens.length === 0) return null;
    return `"${tokens.join(' ')}"`;
  }

  switch (mode) {
    case 'whole_word': {
      const tokens = tokenize(trimmed);
      if (tokens.length === 0) return null;
      return tokens.map((t) => `"${t}"`).join(' ');
    }
    case 'wildcard': {
      const tokens = tokenize(trimmed);
      if (tokens.length === 0) return null;
      return tokens.map((t) => `${t}*`).join(' ');
    }
    case 'boolean': {
      return trimmed
        .replace(/\bAND\b/gi, 'AND')
        .replace(/\bOR\b/gi, 'OR')
        .replace(/\bNOT\b/gi, 'NOT')
        .split(/\s+/)
        .map((tok) => {
          if (['AND', 'OR', 'NOT'].includes(tok)) return tok;
          const clean = escapeFtsToken(tok);
          return clean ? `${clean}*` : '';
        })
        .filter(Boolean)
        .join(' ');
    }
    case 'partial':
    default: {
      const tokens = tokenize(trimmed);
      if (tokens.length === 0) return null;

      const clauses: string[] = [];
      for (const t of tokens) {
        clauses.push(`"${t}"*`);
        if (/^[a-zA-Z]+$/.test(t)) {
          const devVars = transliterateSingleWord(t);
          for (const dv of devVars) {
            const cleanDv = escapeFtsToken(dv);
            if (cleanDv && cleanDv !== t && !clauses.includes(`"${cleanDv}"*`)) {
              clauses.push(`"${cleanDv}"*`);
            }
          }
        }
      }

      if (clauses.length <= tokens.length) {
        return clauses.join(' ');
      } else {
        return clauses.join(' OR ');
      }
    }
  }
}

/** Build the SQL query for the given search + sort */
export async function search(
  query: SearchQuery,
  sort?: { column: string; order: 'asc' | 'desc' }
): Promise<SearchResult[]> {
  const rawQuery = query.query.trim();
  if (!rawQuery) return [];

  // Route directly to Semantic Vector Search if mode is 'similar'
  if (query.mode === 'similar') {
    return await searchSemantic(query, sort);
  }

  const database = await getDatabase();
  const ftsQuery = buildFtsQuery(rawQuery, query.mode);
  if (!ftsQuery) return [];

  // FTS5 join with files table to get full metadata
  let sql = `
    SELECT f.id, f.uri, f.name, f.extension, f.size, f.modified,
           f.content_text, f.ocr_text, f.ocr_status, f.is_card, f.custom_tag,
           bm25(files_fts) as score
    FROM files_fts
    JOIN files f ON f.id = files_fts.rowid
    WHERE files_fts MATCH ?
  `;

  const params: any[] = [ftsQuery];

  // Add extension filter if the query looks like "name.ext"
  const extMatch = rawQuery.match(/\.([a-zA-Z0-9]{1,6})$/);
  if (extMatch && extMatch[1]) {
    sql += ` AND LOWER(f.extension) = ?`;
    params.push(extMatch[1].toLowerCase());
  }

  // Apply Advanced Filters
  if (query.filters) {
    if (query.filters.fileTypes && query.filters.fileTypes.length > 0) {
      const types = query.filters.fileTypes;
      const exts: string[] = [];
      if (types.includes('Images')) exts.push('jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp');
      if (types.includes('Documents')) exts.push('doc', 'docx', 'txt', 'rtf', 'md', 'xlsx', 'xls', 'csv');
      if (types.includes('PDFs')) exts.push('pdf');
      if (types.includes('Audio')) exts.push('mp3', 'wav', 'ogg', 'm4a', 'opus', 'aac');
      if (types.includes('Video')) exts.push('mp4', 'mkv', 'avi', 'mov');

      if (exts.length > 0) {
        sql += ` AND LOWER(f.extension) IN (${exts.map(() => '?').join(',')})`;
        params.push(...exts);
      }
    }

    if (query.filters.folderUri) {
      sql += ` AND f.uri LIKE ?`;
      params.push(`${query.filters.folderUri}%`);
    }

    if (query.filters.minSize !== undefined) {
      sql += ` AND f.size >= ?`;
      params.push(query.filters.minSize);
    }

    if (query.filters.maxSize !== undefined) {
      sql += ` AND f.size <= ?`;
      params.push(query.filters.maxSize);
    }

    if (query.filters.modifiedAfter) {
      sql += ` AND f.modified >= ?`;
      params.push(query.filters.modifiedAfter);
    }
  }

  // Sort
  if (sort) {
    const sortCol =
      sort.column === 'name'
        ? 'f.name'
        : sort.column === 'size'
        ? 'f.size'
        : sort.column === 'modified'
        ? 'f.modified'
        : sort.column === 'extension'
        ? 'f.extension'
        : 'score';
    sql += ` ORDER BY ${sortCol} ${sort.order === 'asc' ? 'ASC' : 'DESC'}`;
  } else {
    sql += ` ORDER BY score ASC`;
  }

  sql += ` LIMIT ?`;
  params.push(query.maxResults || 100);

  try {
    const rows = await database.getAllAsync<any>(sql, params);

    // Deduplicate by URI
    const seenUris = new Set<string>();
    let deduplicatedRows = rows.filter((row) => {
      if (seenUris.has(row.uri)) return false;
      seenUris.add(row.uri);
      return true;
    });

    // Exact Match & Whole Word Verification: Filter out false positives
    const isQuoted = (rawQuery.startsWith('"') && rawQuery.endsWith('"') && rawQuery.length > 2) ||
                     (rawQuery.startsWith("'") && rawQuery.endsWith("'") && rawQuery.length > 2);
    const isExact = query.mode === 'exact' || isQuoted;
    const isWholeWord = query.mode === 'whole_word';
    const cleanTarget = (isQuoted ? rawQuery.slice(1, -1).trim() : rawQuery).toLowerCase();

    if (isExact && cleanTarget) {
      deduplicatedRows = deduplicatedRows.filter((row) => {
        const nameMatch = row.name && row.name.toLowerCase().includes(cleanTarget);
        const contentMatch = row.content_text && row.content_text.toLowerCase().includes(cleanTarget);
        const ocrMatch = row.ocr_text && row.ocr_text.toLowerCase().includes(cleanTarget);
        return nameMatch || contentMatch || ocrMatch;
      });
    } else if (isWholeWord && cleanTarget) {
      const regex = new RegExp(`\\b${escapeRegex(cleanTarget)}\\b`, 'i');
      deduplicatedRows = deduplicatedRows.filter((row) => {
        const nameMatch = row.name && regex.test(row.name);
        const contentMatch = row.content_text && regex.test(row.content_text);
        const ocrMatch = row.ocr_text && regex.test(row.ocr_text);
        return nameMatch || contentMatch || ocrMatch;
      });
    }

    return deduplicatedRows.map((row) => {
      const entry: FileEntry = {
        id: row.id,
        path: row.uri || '',
        name: row.name || '',
        extension: row.extension || '',
        fileType: 'file',
        size: row.size || 0,
        modified: row.modified || '',
        contentText: row.content_text,
        ocrText: row.ocr_text,
        ocrStatus: row.ocr_status || '',
        isCard: row.is_card === 1,
        customTag: row.custom_tag || '',
      };

      // Build preview snippet
      const content = [row.content_text, row.ocr_text].filter(Boolean).join('\n\n');
      const query_lower = rawQuery.toLowerCase();
      const content_lower = content.toLowerCase();
      const matchPos = content_lower.indexOf(query_lower);
      let preview = '';
      if (matchPos >= 0) {
        const start = Math.max(0, matchPos - 50);
        const end = Math.min(content.length, matchPos + rawQuery.length + 50);
        preview =
          (start > 0 ? '...' : '') +
          content.substring(start, end).replace(/\s+/g, ' ') +
          (end < content.length ? '...' : '');
      }

      // Count keyword matches and extract page numbers
      let matchCount = 0;
      const pageNumbersSet = new Set<number>();
      if (content) {
        try {
          const keywordMatches = [...content_lower.matchAll(new RegExp(escapeRegex(query_lower), 'gi'))];
          matchCount = keywordMatches.length;

          const pageMatches = [...content.matchAll(/\[Page (\d+)\]/g)];
          for (const kw of keywordMatches) {
            const kwIndex = kw.index ?? 0;
            let page = 1;
            for (const pm of pageMatches) {
              if ((pm.index ?? 0) < kwIndex) {
                page = parseInt(pm[1], 10);
              } else {
                break;
              }
            }
            if (pageMatches.length > 0) {
              pageNumbersSet.add(page);
            }
          }
        } catch (e) {
          // Ignore regex counting error
        }
      }

      const rawScore = typeof row.score === 'number' && !isNaN(row.score) ? -row.score : 0;

      return {
        entry,
        score: rawScore,
        matchedField: row.content_text ? 'content' : row.ocr_text ? 'ocr_text' : 'name',
        preview,
        matchCount: Math.max(1, matchCount),
        pageNumbers: Array.from(pageNumbersSet),
      };
    });
  } catch (error) {
    console.error('[searchEngine] Search failed completely:', error);
    return [];
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}