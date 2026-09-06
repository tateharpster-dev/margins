/**
 * Parses human-written scripture references into verse ranges.
 *
 * This is the single point where free text becomes an address, shared by the
 * jump-to-reference box and the CSV importer, so the two can never disagree
 * about what "1 Jn 2" means.
 *
 * Accepted, among others:
 *   John 3:16        jn 3.16         1 Cor 13:4-7      Romans 8
 *   Romans 8-9       Gen 1:1-2:3     Jude 3            Ps 119:105
 *   I John 2:1       2nd Kings 4      Song of Songs 2:1
 */
import { findBook, isSingleChapter, verseCount } from './canon';
import type { BookMeta } from './canon';
import { encodeVerseId } from './verseId';
import { clampRange, formatRange, makeRange, rangeForBook, rangeForChapter } from './range';
import type { VerseRange } from './range';

export interface ParsedReference {
  readonly book: BookMeta;
  readonly range: VerseRange;
  /** The shortest correct rendering of what was parsed. */
  readonly label: string;
}

export type ReferenceError =
  | { kind: 'empty' }
  | { kind: 'unknown-book'; text: string }
  | { kind: 'no-such-chapter'; book: BookMeta; chapter: number }
  | { kind: 'no-such-verse'; book: BookMeta; chapter: number; verse: number }
  | { kind: 'malformed'; text: string };

export type ParseResult =
  | { ok: true; value: ParsedReference }
  | { ok: false; error: ReferenceError };

/**
 * Splits "1 Cor 13:4-7" into its book part and its numeric part.
 *
 * Book names can contain digits ("1 Cor") and spaces ("Song of Solomon"), so
 * the split point is the last position where the remainder is purely numeric
 * punctuation. Longest-book-name-first would mis-handle "Judges" vs "Jude", so
 * instead the numeric tail is matched from the end.
 */
const NUMERIC_TAIL = /\s*(\d+(?:\s*[:.]\s*\d+)?(?:\s*[-‐-―]\s*\d+(?:\s*[:.]\s*\d+)?)?)\s*$/;

export function parseReference(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: { kind: 'empty' } };

  const tailMatch = NUMERIC_TAIL.exec(text);
  const bookText = (tailMatch ? text.slice(0, tailMatch.index) : text).trim();
  const numeric = tailMatch ? tailMatch[1].replace(/\s+/g, '') : '';

  if (!bookText) return { ok: false, error: { kind: 'unknown-book', text } };

  const book = findBook(bookText);
  if (!book) return { ok: false, error: { kind: 'unknown-book', text: bookText } };

  // Bare book name: the whole book.
  if (!numeric) {
    const range = rangeForBook(book);
    return { ok: true, value: { book, range, label: book.name } };
  }

  const parts = splitOnDash(numeric);
  if (!parts) return { ok: false, error: { kind: 'malformed', text } };

  const [startText, endText] = parts;
  const start = parsePoint(startText);
  if (!start) return { ok: false, error: { kind: 'malformed', text } };

  const startRange = resolvePoint(book, start);
  if ('error' in startRange) return { ok: false, error: startRange.error };

  if (endText === null) {
    return {
      ok: true,
      value: { book, range: startRange.range, label: formatRange(startRange.range) },
    };
  }

  const end = parsePoint(endText);
  if (!end) return { ok: false, error: { kind: 'malformed', text } };

  // "Romans 8:1-9" — a bare end number after a chapter:verse start is a verse
  // in the same chapter, not chapter nine.
  const endPoint =
    end.verse === null && start.verse !== null
      ? { chapter: start.chapter, verse: end.chapter }
      : end;

  const endRange = resolvePoint(book, endPoint);
  if ('error' in endRange) return { ok: false, error: endRange.error };

  const merged = makeRange(startRange.range.start, endRange.range.end);
  const clamped = clampRange(merged);
  if (!clamped) return { ok: false, error: { kind: 'malformed', text } };

  return { ok: true, value: { book, range: clamped, label: formatRange(clamped) } };
}

/** A parsed numeric point: a chapter, and possibly a verse within it. */
interface Point {
  chapter: number;
  verse: number | null;
}

function parsePoint(text: string): Point | null {
  const m = /^(\d+)(?:[:.](\d+))?$/.exec(text);
  if (!m) return null;
  return {
    chapter: Number(m[1]),
    verse: m[2] === undefined ? null : Number(m[2]),
  };
}

function splitOnDash(text: string): [string, string | null] | null {
  const idx = text.search(/[-‐-―]/);
  if (idx === -1) return [text, null];
  const left = text.slice(0, idx);
  const right = text.slice(idx + 1);
  if (!left || !right) return null;
  return [left, right];
}

/**
 * Turns a point into a range. A bare chapter number becomes the whole chapter,
 * so "Romans 8" and "Romans 8-9" both work without special cases upstream.
 */
function resolvePoint(
  book: BookMeta,
  point: Point
): { range: VerseRange } | { error: ReferenceError } {
  // "Jude 3" is verse three: a single-chapter book has no chapter to name.
  if (isSingleChapter(book) && point.verse === null) {
    const max = verseCount(book, 1);
    if (point.chapter < 1 || point.chapter > max) {
      return { error: { kind: 'no-such-verse', book, chapter: 1, verse: point.chapter } };
    }
    const id = encodeVerseId(book.number, 1, point.chapter);
    return { range: { start: id, end: id } };
  }

  const chapter = point.chapter;
  if (chapter < 1 || chapter > book.verseCounts.length) {
    return { error: { kind: 'no-such-chapter', book, chapter } };
  }

  if (point.verse === null) {
    const range = rangeForChapter(book, chapter);
    if (!range) return { error: { kind: 'no-such-chapter', book, chapter } };
    return { range };
  }

  const max = verseCount(book, chapter);
  if (point.verse < 1 || point.verse > max) {
    return { error: { kind: 'no-such-verse', book, chapter, verse: point.verse } };
  }
  const id = encodeVerseId(book.number, chapter, point.verse);
  return { range: { start: id, end: id } };
}

export function describeReferenceError(error: ReferenceError): string {
  switch (error.kind) {
    case 'empty':
      return 'No reference given.';
    case 'unknown-book':
      return `Could not recognise the book "${error.text}".`;
    case 'no-such-chapter':
      return `${error.book.name} has ${error.book.verseCounts.length} chapters, so there is no chapter ${error.chapter}.`;
    case 'no-such-verse':
      return `${error.book.name} ${error.chapter} has ${verseCount(error.book, error.chapter)} verses, so there is no verse ${error.verse}.`;
    case 'malformed':
      return `Could not read "${error.text}" as a reference.`;
  }
}
