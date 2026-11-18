/**
 * highlighter.ts — Find all occurrences of a search term in text + navigate.
 *
 * This is a port of the desktop FileLensPro `ocr_upload/highlighter.py`.
 * It's pure TypeScript — no React Native dependencies — so it can be
 * unit-tested independently.
 *
 * Features:
 *   - Case-sensitive / case-insensitive matching
 *   - Whole-word matching (\b boundaries)
 *   - Regex support
 *   - All matches returned as (start, end) offsets
 *   - Mutable current index with prev/next/wrap
 *   - Match counter text ("Match 3 of 12")
 */

import { Match } from '../models/types';
import { getCrossLingualConceptVariants, transliterateSingleWord, transliterateHinglishToHindi } from './multilingualTokenizer';

export class Highlighter {
  text: string = '';
  query: string = '';
  caseSensitive: boolean = false;
  wholeWord: boolean = false;
  regex: boolean = false;
  matches: Match[] = [];
  currentIndex: number = -1;

  /**
   * Recompute all matches for the given (text, query, options).
   * Returns the number of matches found.
   * Resets currentIndex to 0 if there's at least one match.
   */
  update(
    text: string,
    query: string,
    opts?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ): number {
    this.text = text || '';
    this.query = query || '';
    this.caseSensitive = opts?.caseSensitive ?? false;
    this.wholeWord = opts?.wholeWord ?? false;
    this.regex = opts?.regex ?? false;
    this.matches = this._findAll();
    this.currentIndex = this.matches.length > 0 ? 0 : -1;
    return this.matches.length;
  }

  clear(): void {
    this.text = '';
    this.query = '';
    this.matches = [];
    this.currentIndex = -1;
  }

  get count(): number {
    return this.matches.length;
  }

  get hasMatches(): boolean {
    return this.matches.length > 0;
  }

  get current(): Match | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.matches.length) {
      return this.matches[this.currentIndex];
    }
    return null;
  }

  next(wrap: boolean = true): Match | null {
    if (this.matches.length === 0) return null;
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.matches.length) {
        this.currentIndex = wrap ? 0 : this.matches.length - 1;
      }
    }
    return this.current;
  }

  prev(wrap: boolean = true): Match | null {
    if (this.matches.length === 0) return null;
    if (this.currentIndex < 0) {
      this.currentIndex = this.matches.length - 1;
    } else {
      this.currentIndex--;
      if (this.currentIndex < 0) {
        this.currentIndex = wrap ? this.matches.length - 1 : 0;
      }
    }
    return this.current;
  }

  goto(index: number): Match | null {
    if (this.matches.length === 0) return null;
    this.currentIndex = Math.max(0, Math.min(index, this.matches.length - 1));
    return this.current;
  }

  statusText(): string {
    const n = this.matches.length;
    if (n === 0) return this.query ? 'No matches' : '';
    return `Match ${this.currentIndex + 1} of ${n}`;
  }

  private _findAll(): Match[] {
    const text = this.text;
    const q = this.query?.trim();
    if (!text || !q) return [];

    let flags = this.caseSensitive ? 'g' : 'gi';
    let pattern: RegExp;
    try {
      if (this.regex) {
        pattern = new RegExp(q, flags);
      } else if (this.wholeWord) {
        pattern = new RegExp(`\\b${escapeRegex(q)}\\b`, flags);
      } else {
        // Collect query terms, bilingual concept variants and transliterations
        const searchTerms = new Set<string>();
        searchTerms.add(q);
        const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          searchTerms.add(t);
          const conceptVars = getCrossLingualConceptVariants(t);
          for (const cv of conceptVars) searchTerms.add(cv);
          const translitVars = transliterateSingleWord(t);
          for (const tv of translitVars) searchTerms.add(tv);
        }
        const termsArr = Array.from(searchTerms).filter(t => t.length > 0);
        pattern = new RegExp(termsArr.map(escapeRegex).join('|'), flags);
      }
    } catch (e) {
      return [];
    }

    const out: Match[] = [];
    // Pre-compute line starts for O(log n) line lookup
    const lineStarts: number[] = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') lineStarts.push(i + 1);
    }

    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      // Binary search for line number
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= start) lo = mid;
        else hi = mid - 1;
      }
      const lineNum = lo + 1;
      const col = start - lineStarts[lo] + 1;
      out.push({
        start,
        end,
        line: lineNum,
        col,
        snippet: text.substring(start, end),
      });
      // Avoid zero-length match infinite loop
      if (m[0].length === 0) pattern.lastIndex++;
    }
    return out;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
