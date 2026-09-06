#!/usr/bin/env node
/**
 * Builds the bundled KJV translation assets and the generated canon metadata.
 *
 * Source: https://github.com/thiagobodruk/bible (public domain KJV)
 *
 * Outputs:
 *   assets/translations/kjv/<USFM>.json   one file per book, lazily required
 *   src/domain/canon.generated.ts         book metadata + per-chapter verse counts
 *
 * The canon metadata is derived from the text rather than hand-written, because
 * 1,189 chapter lengths typed by hand is 1,189 chances to be quietly wrong.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL =
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json';
const CACHE = join(ROOT, '.work', 'en_kjv.json');
const OUT_DIR = join(ROOT, 'assets', 'translations', 'kjv');
const CANON_OUT = join(ROOT, 'src', 'domain', 'canon.generated.ts');
const REQUIRE_MAP_OUT = join(ROOT, 'src', 'bible', 'kjv.generated.ts');

/** Canonical Protestant order: [USFM code, full name, abbreviations for the parser]. */
const BOOKS = [
  ['GEN', 'Genesis', ['gen', 'ge', 'gn']],
  ['EXO', 'Exodus', ['exo', 'ex', 'exod']],
  ['LEV', 'Leviticus', ['lev', 'le', 'lv']],
  ['NUM', 'Numbers', ['num', 'nu', 'nm', 'nb']],
  ['DEU', 'Deuteronomy', ['deu', 'dt', 'de', 'deut']],
  ['JOS', 'Joshua', ['jos', 'josh', 'jsh']],
  ['JDG', 'Judges', ['jdg', 'judg', 'jg']],
  ['RUT', 'Ruth', ['rut', 'ru', 'rth']],
  ['1SA', '1 Samuel', ['1sa', '1sam', '1s']],
  ['2SA', '2 Samuel', ['2sa', '2sam', '2s']],
  ['1KI', '1 Kings', ['1ki', '1kgs', '1kg', '1k']],
  ['2KI', '2 Kings', ['2ki', '2kgs', '2kg', '2k']],
  ['1CH', '1 Chronicles', ['1ch', '1chr', '1chron']],
  ['2CH', '2 Chronicles', ['2ch', '2chr', '2chron']],
  ['EZR', 'Ezra', ['ezr']],
  ['NEH', 'Nehemiah', ['neh', 'ne']],
  ['EST', 'Esther', ['est', 'es', 'esth']],
  ['JOB', 'Job', ['job', 'jb']],
  ['PSA', 'Psalms', ['psa', 'ps', 'psalm', 'psalms', 'pss']],
  ['PRO', 'Proverbs', ['pro', 'pr', 'prov', 'prv']],
  ['ECC', 'Ecclesiastes', ['ecc', 'ec', 'eccl', 'qoh']],
  ['SNG', 'Song of Solomon', ['sng', 'song', 'sos', 'ss', 'cant']],
  ['ISA', 'Isaiah', ['isa', 'is']],
  ['JER', 'Jeremiah', ['jer', 'je', 'jr']],
  ['LAM', 'Lamentations', ['lam', 'la']],
  ['EZK', 'Ezekiel', ['ezk', 'eze', 'ezek']],
  ['DAN', 'Daniel', ['dan', 'da', 'dn']],
  ['HOS', 'Hosea', ['hos', 'ho']],
  ['JOL', 'Joel', ['jol', 'joel', 'jl']],
  ['AMO', 'Amos', ['amo', 'am']],
  ['OBA', 'Obadiah', ['oba', 'ob', 'obad']],
  ['JON', 'Jonah', ['jon', 'jnh']],
  ['MIC', 'Micah', ['mic', 'mc']],
  ['NAM', 'Nahum', ['nam', 'na', 'nah']],
  ['HAB', 'Habakkuk', ['hab']],
  ['ZEP', 'Zephaniah', ['zep', 'zeph', 'zp']],
  ['HAG', 'Haggai', ['hag', 'hg']],
  ['ZEC', 'Zechariah', ['zec', 'zech', 'zc']],
  ['MAL', 'Malachi', ['mal', 'ml']],
  ['MAT', 'Matthew', ['mat', 'mt', 'matt']],
  ['MRK', 'Mark', ['mrk', 'mk', 'mar', 'mark']],
  ['LUK', 'Luke', ['luk', 'lk', 'luke']],
  ['JHN', 'John', ['jhn', 'jn', 'joh', 'john']],
  ['ACT', 'Acts', ['act', 'ac', 'acts']],
  ['ROM', 'Romans', ['rom', 'ro', 'rm']],
  ['1CO', '1 Corinthians', ['1co', '1cor']],
  ['2CO', '2 Corinthians', ['2co', '2cor']],
  ['GAL', 'Galatians', ['gal', 'ga']],
  ['EPH', 'Ephesians', ['eph', 'ep']],
  ['PHP', 'Philippians', ['php', 'phil', 'pp']],
  ['COL', 'Colossians', ['col', 'cl']],
  ['1TH', '1 Thessalonians', ['1th', '1thes', '1thess']],
  ['2TH', '2 Thessalonians', ['2th', '2thes', '2thess']],
  ['1TI', '1 Timothy', ['1ti', '1tim', '1tm']],
  ['2TI', '2 Timothy', ['2ti', '2tim', '2tm']],
  ['TIT', 'Titus', ['tit', 'ti']],
  ['PHM', 'Philemon', ['phm', 'phlm', 'philem']],
  ['HEB', 'Hebrews', ['heb', 'hebr']],
  ['JAS', 'James', ['jas', 'jm', 'jam']],
  ['1PE', '1 Peter', ['1pe', '1pet', '1pt']],
  ['2PE', '2 Peter', ['2pe', '2pet', '2pt']],
  ['1JN', '1 John', ['1jn', '1jo', '1joh', '1john']],
  ['2JN', '2 John', ['2jn', '2jo', '2joh', '2john']],
  ['3JN', '3 John', ['3jn', '3jo', '3joh', '3john']],
  ['JUD', 'Jude', ['jud', 'jde']],
  ['REV', 'Revelation', ['rev', 're', 'rv', 'apoc']],
];

/** Books 1-39 are the Old Testament. */
const OT_COUNT = 39;

/**
 * A collision between two books' abbreviations would silently send a note to
 * the wrong passage, so it fails the build instead.
 */
function assertNoAmbiguousAbbreviations() {
  const seen = new Map();
  for (const [usfm, name, abbreviations] of BOOKS) {
    const keys = [name, usfm, ...abbreviations].map((k) =>
      k.toLowerCase().replace(/[\s.]/g, '')
    );
    for (const key of keys) {
      const owner = seen.get(key);
      if (owner && owner !== usfm) {
        throw new Error(
          `Ambiguous book key "${key}": claimed by both ${owner} and ${usfm}`
        );
      }
      seen.set(key, usfm);
    }
  }
  return seen.size;
}

async function loadSource() {
  if (existsSync(CACHE)) return readFileSync(CACHE, 'utf8');
  console.log(`Downloading ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const body = await res.text();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, body);
  return body;
}

/**
 * The source overloads braces for two very different things:
 *
 *   1. KJV's supplied (italicised) words - "the earth {was} without form".
 *      These ARE scripture; only the markers should go.
 *   2. The translators' marginal apparatus - "{firmament: Heb. expansion}".
 *      These are editorial glosses appended after the verse, and printing them
 *      inline produces nonsense like "...kingdom of God. again: or, from above".
 *
 * The two are separable by shape: a gloss is `lemma: explanation`, and a survey
 * of the whole corpus found every one of the 7,859 colon-bearing groups sitting
 * in the trailing apparatus block, while the 21,534 supplied-word groups
 * average 1.3 words and never contain a colon. Five further glosses are
 * malformed in the source (the colon is missing) but still give themselves away
 * with a "Heb."/"Gr." marker or the "..." lemma elision.
 *
 * So: drop the glosses, unwrap the rest. Erring in this direction never deletes
 * a word that might be scripture.
 */
function clean(verse) {
  return verse
    .replace(/\{[^}]*:[^}]*\}/g, '')
    .replace(/\{[^}]*(?:\b(?:Heb|Gr|Chal)\.\s|\.\.\.)[^}]*\}/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const keyCount = assertNoAmbiguousAbbreviations();
  const raw = (await loadSource()).replace(/^﻿/, '');
  const source = JSON.parse(raw);

  if (source.length !== BOOKS.length) {
    throw new Error(`Expected ${BOOKS.length} books, source has ${source.length}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(CANON_OUT), { recursive: true });
  mkdirSync(dirname(REQUIRE_MAP_OUT), { recursive: true });

  const canon = [];
  let totalVerses = 0;

  for (let i = 0; i < source.length; i++) {
    const [usfm, name, abbreviations] = BOOKS[i];
    const book = source[i];

    // Guard the order assumption: a silently mis-ordered canon would corrupt
    // every verse ID in the app, and it would not be obvious for a long time.
    const sourceName = (book.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const expected = name.toLowerCase();
    const matches =
      sourceName === expected ||
      sourceName.startsWith(expected.slice(0, 4)) ||
      expected.startsWith(sourceName.slice(0, 4));
    if (!matches) {
      throw new Error(
        `Book ${i + 1} order mismatch: expected "${name}", source has "${book.name}"`
      );
    }

    const chapters = book.chapters.map((ch) => ch.map(clean));
    writeFileSync(join(OUT_DIR, `${usfm}.json`), JSON.stringify(chapters));

    const verseCounts = chapters.map((ch) => ch.length);
    totalVerses += verseCounts.reduce((a, b) => a + b, 0);

    canon.push({
      number: i + 1,
      usfm,
      name,
      abbreviations,
      testament: i < OT_COUNT ? 'OT' : 'NT',
      verseCounts,
    });
  }

  const banner = `// GENERATED FILE - do not edit by hand.
// Produced by scripts/build-translation.mjs from the public-domain KJV text.
// Regenerate with: npm run build:translation
`;

  const body = `${banner}
import type { BookMeta } from './canon';

export const BOOKS: readonly BookMeta[] = ${JSON.stringify(canon, null, 0)} as const;
`;

  writeFileSync(CANON_OUT, body);

  // Metro resolves requires at build time, so every path must be a literal.
  // A computed path would silently bundle nothing at all.
  const loaders = canon
    .map(
      (b) =>
        `  '${b.usfm}': () => require('../../assets/translations/kjv/${b.usfm}.json') as string[][],`
    )
    .join('\n');
  writeFileSync(
    REQUIRE_MAP_OUT,
    `${banner}
/**
 * Static require map for the bundled KJV. Each loader is a thunk so that only
 * the books actually opened are parsed, rather than all 4.5 MB on launch.
 */
export const KJV_BOOK_LOADERS: Record<string, () => string[][]> = {
${loaders}
};
`
  );

  console.log(`Wrote ${canon.length} books to ${OUT_DIR}`);
  console.log(`Wrote canon metadata to ${CANON_OUT}`);
  console.log(`Wrote require map to ${REQUIRE_MAP_OUT}`);
  console.log(`Total verses: ${totalVerses}`);
  console.log(`Unambiguous book lookup keys: ${keyCount}`);
  console.log(`Max chapters in a book: ${Math.max(...canon.map((b) => b.verseCounts.length))}`);
  console.log(`Max verses in a chapter: ${Math.max(...canon.flatMap((b) => b.verseCounts))}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
