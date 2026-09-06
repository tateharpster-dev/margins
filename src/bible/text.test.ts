import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getChapter, getVerseText, getRangeVerses, searchVerses, previewText } from './text';
import { BOOKS, findBook } from '../domain/canon';
import { encodeVerseId } from '../domain/verseId';
import { parseReference } from '../domain/reference';

function book(name: string) {
  const b = findBook(name);
  assert.ok(b, name);
  return b;
}

test('loads a chapter with correctly numbered verses', () => {
  const verses = getChapter(book('John'), 3);
  assert.equal(verses.length, 36);
  assert.equal(verses[15].number, 16);
  assert.equal(verses[15].id, encodeVerseId(43, 3, 16));
  assert.match(verses[15].text, /For God so loved the world/);
});

test('the KJV italics markers are stripped but the words are kept', () => {
  const text = getVerseText(encodeVerseId(1, 1, 2));
  assert.ok(text);
  assert.doesNotMatch(text, /[{}]/);
  assert.match(text, /the earth was without form/i);
});

test("the translators' marginal apparatus is not printed as scripture", () => {
  // The source data appends glosses like "{again: or, from above}" to the verse
  // text. Printing them inline produced "...kingdom of God. again: or, from
  // above", which reads as nonsense.
  const jhn33 = getVerseText(encodeVerseId(43, 3, 3));
  assert.ok(jhn33);
  assert.match(jhn33, /kingdom of God\.$/);
  assert.doesNotMatch(jhn33, /or, from above/);

  const jhn37 = getVerseText(encodeVerseId(43, 3, 7));
  assert.ok(jhn37);
  assert.match(jhn37, /Ye must be born again\.$/);
});

test('no verse in the canon leaks apparatus, braces, or empty text', () => {
  for (const meta of BOOKS) {
    for (let c = 1; c <= meta.verseCounts.length; c++) {
      for (const verse of getChapter(meta, c)) {
        assert.doesNotMatch(verse.text, /[{}]/, `${meta.usfm} ${c}:${verse.number}`);
        assert.doesNotMatch(verse.text, /\b(?:Heb|Gr|Chal)\. /, `${meta.usfm} ${c}:${verse.number}`);
        assert.notEqual(verse.text.trim(), '', `${meta.usfm} ${c}:${verse.number}`);
      }
    }
  }
});

test('first and last verses of the canon are present', () => {
  assert.match(getVerseText(encodeVerseId(1, 1, 1)) ?? '', /In the beginning/);
  assert.match(getVerseText(encodeVerseId(66, 22, 21)) ?? '', /grace of our Lord/i);
});

test('returns null rather than throwing for a verse that does not exist', () => {
  assert.equal(getVerseText(encodeVerseId(43, 3, 999)), null);
  assert.equal(getChapter(book('John'), 99).length, 0);
});

test('collects every verse in a range that crosses a chapter boundary', () => {
  const parsed = parseReference('Genesis 1:30-2:3');
  assert.ok(parsed.ok);
  const verses = getRangeVerses(parsed.value.range);
  assert.equal(verses[0].id, encodeVerseId(1, 1, 30));
  assert.equal(verses[verses.length - 1].id, encodeVerseId(1, 2, 3));
  assert.equal(verses.length, 5);
});

test('preview text is truncated with an ellipsis', () => {
  const parsed = parseReference('Genesis 1');
  assert.ok(parsed.ok);
  const preview = previewText(parsed.value.range, 60);
  assert.ok(preview.length <= 60, `got ${preview.length}`);
  assert.match(preview, /…$/);
  assert.doesNotMatch(preview, / …$/);
});

test('search finds verses and reports their references', () => {
  const hits = searchVerses('in the beginning', { limit: 10 });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].reference, 'Genesis 1:1');
});

test('search can be scoped to one book', () => {
  const hits = searchVerses('love', { bookUsfm: 'JHN', limit: 500 });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.bookName === 'John'));
});

test('search ignores queries too short to be useful', () => {
  assert.equal(searchVerses('a').length, 0);
});

test('search respects its limit', () => {
  assert.equal(searchVerses('the', { limit: 25 }).length, 25);
});
