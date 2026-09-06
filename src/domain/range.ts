/**
 * Verse ranges. Every annotation covers one — a single verse, a run of verses,
 * a chapter, or a book are all the same object with different endpoints.
 */
import { getBookByNumber, isSingleChapter, verseCount } from './canon';
import type { BookMeta } from './canon';
import {
  bookBounds,
  chapterBounds,
  decodeVerseId,
  encodeVerseId,
  formatVerseId,
} from './verseId';
import type { VerseId } from './verseId';

export interface VerseRange {
  /** Inclusive. */
  readonly start: VerseId;
  /** Inclusive. */
  readonly end: VerseId;
}

export function makeRange(start: VerseId, end: VerseId): VerseRange {
  return start <= end ? { start, end } : { start: end, end: start };
}

export function singleVerse(id: VerseId): VerseRange {
  return { start: id, end: id };
}

export function rangeForChapter(book: BookMeta, chapter: number): VerseRange | null {
  const bounds = chapterBounds(book, chapter);
  return bounds ? { start: bounds[0], end: bounds[1] } : null;
}

export function rangeForBook(book: BookMeta): VerseRange {
  const [start, end] = bookBounds(book);
  return { start, end };
}

/** The standard interval overlap test — the query the reader runs constantly. */
export function overlaps(a: VerseRange, b: VerseRange): boolean {
  return a.start <= b.end && a.end >= b.start;
}

export function contains(range: VerseRange, id: VerseId): boolean {
  return id >= range.start && id <= range.end;
}

export function containsRange(outer: VerseRange, inner: VerseRange): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/** Number of verse IDs spanned. Approximate across chapters — see verseSpan. */
export function isSingleVerse(range: VerseRange): boolean {
  return range.start === range.end;
}

export function spansWholeChapter(range: VerseRange): boolean {
  const s = decodeVerseId(range.start);
  const e = decodeVerseId(range.end);
  if (s.book !== e.book || s.chapter !== e.chapter) return false;
  const meta = getBookByNumber(s.book);
  if (!meta) return false;
  return s.verse === 1 && e.verse === verseCount(meta, s.chapter);
}

export function spansWholeBook(range: VerseRange): boolean {
  const s = decodeVerseId(range.start);
  const e = decodeVerseId(range.end);
  if (s.book !== e.book) return false;
  const meta = getBookByNumber(s.book);
  if (!meta) return false;
  const [bs, be] = bookBounds(meta);
  return range.start === bs && range.end === be;
}

/**
 * Splits a range that crosses book boundaries into one range per book, clamped
 * to each book's real extent. A note about "Jude through Revelation" is almost
 * always a mis-drag, so the app stores it as separate per-book annotations
 * rather than one range whose meaning is ambiguous.
 */
export function splitByBook(range: VerseRange): VerseRange[] {
  const startBook = decodeVerseId(range.start).book;
  const endBook = decodeVerseId(range.end).book;
  if (startBook === endBook) return [range];

  const out: VerseRange[] = [];
  for (let n = startBook; n <= endBook; n++) {
    const meta = getBookByNumber(n);
    if (!meta) continue;
    const [bs, be] = bookBounds(meta);
    const start = n === startBook ? range.start : bs;
    const end = n === endBook ? range.end : be;
    if (start <= end) out.push({ start, end });
  }
  return out;
}

/**
 * Clamps a range to verses that actually exist, so stored data stays meaningful.
 * A chapter selection ends at the chapter's real last verse, never at x_xxx_999.
 */
export function clampRange(range: VerseRange): VerseRange | null {
  const start = clampVerse(range.start);
  const end = clampVerse(range.end);
  if (start === null || end === null || start > end) return null;
  return { start, end };
}

/**
 * Pulls an address onto the nearest verse that exists. An over-long verse
 * number means "to the end of the chapter", which is how a hand-written
 * reference like "Psalm 23:10" is most charitably read.
 */
function clampVerse(id: VerseId): VerseId | null {
  const { book, chapter, verse } = decodeVerseId(id);
  const meta = getBookByNumber(book);
  if (!meta) return null;

  const ch = Math.min(Math.max(chapter, 1), meta.verseCounts.length);
  const max = verseCount(meta, ch);
  return encodeVerseId(book, ch, Math.min(Math.max(verse, 1), max));
}

/**
 * Human-readable label for a range, collapsing to the shortest correct form:
 *   "John 3:16"   "John 3:16-17"   "John 3"   "John"   "John 3:16-4:2"
 */
export function formatRange(range: VerseRange): string {
  const s = decodeVerseId(range.start);
  const e = decodeVerseId(range.end);
  const meta = getBookByNumber(s.book);
  if (!meta) return `${range.start}-${range.end}`;

  if (s.book !== e.book) {
    return `${formatVerseId(range.start)} - ${formatVerseId(range.end)}`;
  }
  if (spansWholeBook(range)) return meta.name;
  if (isSingleChapter(meta)) {
    return s.verse === e.verse
      ? `${meta.name} ${s.verse}`
      : `${meta.name} ${s.verse}-${e.verse}`;
  }
  if (spansWholeChapter(range)) return `${meta.name} ${s.chapter}`;

  // Whole-chapter spans across several chapters: "Romans 8-9".
  if (
    s.verse === 1 &&
    e.verse === verseCount(meta, e.chapter) &&
    s.chapter !== e.chapter
  ) {
    return `${meta.name} ${s.chapter}-${e.chapter}`;
  }
  if (s.chapter === e.chapter) {
    return s.verse === e.verse
      ? `${meta.name} ${s.chapter}:${s.verse}`
      : `${meta.name} ${s.chapter}:${s.verse}-${e.verse}`;
  }
  return `${meta.name} ${s.chapter}:${s.verse}-${e.chapter}:${e.verse}`;
}
