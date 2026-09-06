/**
 * The canon: which books exist, in what order, and how many verses are in each
 * chapter. This is the address space that every annotation is written against.
 *
 * The data itself lives in canon.generated.ts, derived from the bundled text by
 * scripts/build-translation.mjs. See docs/DATA_MODEL.md.
 */
import { BOOKS } from './canon.generated';

export type Testament = 'OT' | 'NT';

export interface BookMeta {
  /** 1-66, canonical Protestant order. The high field of a verse ID. */
  readonly number: number;
  /** USFM code, e.g. "JHN". The stable wire identifier used in share bundles. */
  readonly usfm: string;
  /** Display name, e.g. "John". */
  readonly name: string;
  /** Lowercase abbreviations accepted by the reference parser. */
  readonly abbreviations: readonly string[];
  readonly testament: Testament;
  /** Verse count per chapter; index 0 is chapter 1. */
  readonly verseCounts: readonly number[];
}

export { BOOKS };

export const BOOK_COUNT = BOOKS.length;

const byNumber = new Map<number, BookMeta>();
const byUsfm = new Map<string, BookMeta>();
/** Every accepted spelling, normalised, mapped to its book. */
const byLookupKey = new Map<string, BookMeta>();

/**
 * Collapses a user-written book name to a lookup key: lowercase, no spaces or
 * punctuation, with ordinal prefixes unified so that "1 John", "1st John",
 * "I John" and "1john" all arrive at the same place.
 */
export function normalizeBookKey(input: string): string {
  let s = input.toLowerCase().trim();

  // Written and ordinal prefixes -> digits.
  s = s.replace(/^(first|1st)\s+/, '1 ');
  s = s.replace(/^(second|2nd)\s+/, '2 ');
  s = s.replace(/^(third|3rd)\s+/, '3 ');

  // Roman numeral prefixes -> digits. Anchored and boundary-checked so that
  // "Isaiah" is not read as "I saiah".
  s = s.replace(/^iii\s+/, '3 ');
  s = s.replace(/^ii\s+/, '2 ');
  s = s.replace(/^i\s+/, '1 ');

  return s.replace(/[\s.\-_']/g, '');
}

for (const book of BOOKS) {
  byNumber.set(book.number, book);
  byUsfm.set(book.usfm, book);
  for (const key of [book.name, book.usfm, ...book.abbreviations]) {
    byLookupKey.set(normalizeBookKey(key), book);
  }
}

// A few spellings people actually use that are not derivable from the name.
const EXTRA_ALIASES: ReadonlyArray<[string, string]> = [
  ['songofsongs', 'SNG'],
  ['canticles', 'SNG'],
  ['psalter', 'PSA'],
  ['apocalypse', 'REV'],
  ['revelations', 'REV'],
  ['actsoftheapostles', 'ACT'],
];
for (const [alias, usfm] of EXTRA_ALIASES) {
  const book = byUsfm.get(usfm);
  if (book) byLookupKey.set(normalizeBookKey(alias), book);
}

export function getBookByNumber(n: number): BookMeta | undefined {
  return byNumber.get(n);
}

export function getBookByUsfm(usfm: string): BookMeta | undefined {
  return byUsfm.get(usfm.toUpperCase());
}

/** Resolves any accepted spelling of a book name. */
export function findBook(name: string): BookMeta | undefined {
  return byLookupKey.get(normalizeBookKey(name));
}

export function chapterCount(book: BookMeta): number {
  return book.verseCounts.length;
}

/** Verse count for a 1-indexed chapter, or 0 if the chapter does not exist. */
export function verseCount(book: BookMeta, chapter: number): number {
  return book.verseCounts[chapter - 1] ?? 0;
}

/**
 * Single-chapter books change how a bare number is read: "Jude 3" means verse
 * three, not chapter three.
 */
export function isSingleChapter(book: BookMeta): boolean {
  return book.verseCounts.length === 1;
}

export const OLD_TESTAMENT = BOOKS.filter((b) => b.testament === 'OT');
export const NEW_TESTAMENT = BOOKS.filter((b) => b.testament === 'NT');
