/**
 * Verse identity. See docs/DATA_MODEL.md for why this shape was chosen.
 *
 *   verseId = book * 1_000_000 + chapter * 1_000 + verse
 *
 * The build script asserts the real bounds (150 chapters, 176 verses), so the
 * 1,000-wide fields have room to spare and the largest ID is ~66 million.
 */
import { findBook, getBookByNumber, isSingleChapter, verseCount } from './canon';
import type { BookMeta } from './canon';

export type VerseId = number;

export const BOOK_FACTOR = 1_000_000;
export const CHAPTER_FACTOR = 1_000;

export interface VerseAddress {
  book: number;
  chapter: number;
  verse: number;
}

export function encodeVerseId(book: number, chapter: number, verse: number): VerseId {
  return book * BOOK_FACTOR + chapter * CHAPTER_FACTOR + verse;
}

export function decodeVerseId(id: VerseId): VerseAddress {
  const book = Math.floor(id / BOOK_FACTOR);
  const chapter = Math.floor((id % BOOK_FACTOR) / CHAPTER_FACTOR);
  const verse = id % CHAPTER_FACTOR;
  return { book, chapter, verse };
}

/** True only if the address names a verse that actually exists in the canon. */
export function isValidVerseId(id: VerseId): boolean {
  const { book, chapter, verse } = decodeVerseId(id);
  const meta = getBookByNumber(book);
  if (!meta) return false;
  if (chapter < 1 || verse < 1) return false;
  return verse <= verseCount(meta, chapter);
}

/** Builds a verse ID, or returns null if that verse does not exist. */
export function makeVerseId(
  book: BookMeta | string | number,
  chapter: number,
  verse: number
): VerseId | null {
  const meta = resolveBook(book);
  if (!meta) return null;
  if (chapter < 1 || chapter > meta.verseCounts.length) return null;
  if (verse < 1 || verse > verseCount(meta, chapter)) return null;
  return encodeVerseId(meta.number, chapter, verse);
}

export function resolveBook(book: BookMeta | string | number): BookMeta | undefined {
  if (typeof book === 'number') return getBookByNumber(book);
  if (typeof book === 'string') return findBook(book);
  return book;
}

/** First and last verse IDs of a chapter. */
export function chapterBounds(book: BookMeta, chapter: number): [VerseId, VerseId] | null {
  const count = verseCount(book, chapter);
  if (count === 0) return null;
  return [
    encodeVerseId(book.number, chapter, 1),
    encodeVerseId(book.number, chapter, count),
  ];
}

/** First and last verse IDs of a whole book. */
export function bookBounds(book: BookMeta): [VerseId, VerseId] {
  const lastChapter = book.verseCounts.length;
  return [
    encodeVerseId(book.number, 1, 1),
    encodeVerseId(book.number, lastChapter, verseCount(book, lastChapter)),
  ];
}

/**
 * Human-readable reference for a single verse: "John 3:16".
 * Single-chapter books drop the chapter, as they are conventionally cited.
 */
export function formatVerseId(id: VerseId): string {
  const { book, chapter, verse } = decodeVerseId(id);
  const meta = getBookByNumber(book);
  if (!meta) return `?${id}`;
  return isSingleChapter(meta)
    ? `${meta.name} ${verse}`
    : `${meta.name} ${chapter}:${verse}`;
}

/** Wire format for share bundles: "JHN 3:16". Always includes the chapter. */
export function toUsfmRef(id: VerseId): string {
  const { book, chapter, verse } = decodeVerseId(id);
  const meta = getBookByNumber(book);
  if (!meta) return `UNK ${chapter}:${verse}`;
  return `${meta.usfm} ${chapter}:${verse}`;
}

/** Parses the wire format. Returns null on anything malformed. */
export function fromUsfmRef(ref: string): VerseId | null {
  const match = /^\s*([A-Za-z0-9]{3})\s+(\d+):(\d+)\s*$/.exec(ref);
  if (!match) return null;
  const meta = findBook(match[1]);
  if (!meta) return null;
  return makeVerseId(meta, Number(match[2]), Number(match[3]));
}

/**
 * Steps to the next existing verse, rolling over chapter and book boundaries.
 * Returns null at the end of the canon.
 */
export function nextVerseId(id: VerseId): VerseId | null {
  const { book, chapter, verse } = decodeVerseId(id);
  const meta = getBookByNumber(book);
  if (!meta) return null;
  if (verse < verseCount(meta, chapter)) return encodeVerseId(book, chapter, verse + 1);
  if (chapter < meta.verseCounts.length) return encodeVerseId(book, chapter + 1, 1);
  const nextBook = getBookByNumber(book + 1);
  return nextBook ? encodeVerseId(nextBook.number, 1, 1) : null;
}
