/**
 * Scripture text access.
 *
 * The translation is a *pluggable resource*: annotations address canonical
 * verse IDs and never reach into this module's data, so a licensed translation
 * (ESV) can be added or removed later without touching a single user note.
 * See docs/DATA_MODEL.md.
 */
import { KJV_BOOK_LOADERS } from './kjv.generated';
import { getBookByNumber, getBookByUsfm, verseCount } from '../domain/canon';
import type { BookMeta } from '../domain/canon';
import { decodeVerseId, encodeVerseId } from '../domain/verseId';
import type { VerseId } from '../domain/verseId';
import type { VerseRange } from '../domain/range';

export interface TranslationMeta {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly license: string;
}

export const KJV: TranslationMeta = {
  id: 'kjv',
  name: 'King James Version',
  abbreviation: 'KJV',
  license: 'Public Domain',
};

/** The installed translations. ESV joins this list once licensed. */
export const TRANSLATIONS: readonly TranslationMeta[] = [KJV];

/** Parsed books, kept once loaded. 66 books is ~4.5 MB fully resident. */
const cache = new Map<string, string[][]>();

function loadBook(usfm: string): string[][] | null {
  const cached = cache.get(usfm);
  if (cached) return cached;
  const loader = KJV_BOOK_LOADERS[usfm];
  if (!loader) return null;
  const data = loader();
  cache.set(usfm, data);
  return data;
}

export interface Verse {
  readonly id: VerseId;
  readonly number: number;
  readonly text: string;
}

/** Verses of a chapter. Returns [] for a chapter that does not exist. */
export function getChapter(book: BookMeta, chapter: number): Verse[] {
  const data = loadBook(book.usfm);
  if (!data) return [];
  const verses = data[chapter - 1];
  if (!verses) return [];
  return verses.map((text, i) => ({
    id: encodeVerseId(book.number, chapter, i + 1),
    number: i + 1,
    text,
  }));
}

/**
 * Text of a single verse, or null when this translation omits it. Modern
 * translations drop verses the KJV includes; that is expected, and an
 * annotation on such a verse is kept rather than discarded.
 */
export function getVerseText(id: VerseId): string | null {
  const { book, chapter, verse } = decodeVerseId(id);
  const meta = getBookByNumber(book);
  if (!meta) return null;
  const data = loadBook(meta.usfm);
  return data?.[chapter - 1]?.[verse - 1] ?? null;
}

/** Every verse in a range, in canonical order. Used by the commentary reader. */
export function getRangeVerses(range: VerseRange): Verse[] {
  const start = decodeVerseId(range.start);
  const end = decodeVerseId(range.end);
  const out: Verse[] = [];

  for (let b = start.book; b <= end.book; b++) {
    const meta = getBookByNumber(b);
    if (!meta) continue;
    const firstChapter = b === start.book ? start.chapter : 1;
    const lastChapter = b === end.book ? end.chapter : meta.verseCounts.length;

    for (let c = firstChapter; c <= lastChapter; c++) {
      const firstVerse = b === start.book && c === start.chapter ? start.verse : 1;
      const lastVerse =
        b === end.book && c === end.chapter ? end.verse : verseCount(meta, c);
      for (const v of getChapter(meta, c)) {
        if (v.number >= firstVerse && v.number <= lastVerse) out.push(v);
      }
    }
  }
  return out;
}

/** A short preview of a range's text, for list rows and import previews. */
export function previewText(range: VerseRange, maxLength = 140): string {
  const verses = getRangeVerses(range);
  if (verses.length === 0) return '';
  const joined = verses.map((v) => v.text).join(' ');
  return joined.length <= maxLength ? joined : `${joined.slice(0, maxLength - 1).trimEnd()}…`;
}

export interface SearchHit {
  readonly id: VerseId;
  readonly bookName: string;
  readonly reference: string;
  readonly text: string;
}

export interface SearchOptions {
  readonly limit?: number;
  /** Restrict to one book, for search-within-book. */
  readonly bookUsfm?: string;
}

/**
 * Full-text search over the translation.
 *
 * A linear scan across 31,100 verses is a few tens of milliseconds, which is
 * fine at this scale and avoids shipping an index that would have to be
 * rebuilt per translation. If this ever becomes the bottleneck, the escape
 * hatch is SQLite FTS5 over the same verse IDs — no change to annotations.
 */
export function searchVerses(query: string, options: SearchOptions = {}): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const limit = options.limit ?? 200;
  const hits: SearchHit[] = [];
  const usfmList = options.bookUsfm
    ? [options.bookUsfm]
    : Object.keys(KJV_BOOK_LOADERS);

  for (const usfm of usfmList) {
    const meta = getBookByUsfm(usfm);
    const data = loadBook(usfm);
    if (!meta || !data) continue;

    for (let c = 0; c < data.length; c++) {
      const chapter = data[c];
      for (let v = 0; v < chapter.length; v++) {
        if (!chapter[v].toLowerCase().includes(needle)) continue;
        hits.push({
          id: encodeVerseId(meta.number, c + 1, v + 1),
          bookName: meta.name,
          reference: `${meta.name} ${c + 1}:${v + 1}`,
          text: chapter[v],
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
