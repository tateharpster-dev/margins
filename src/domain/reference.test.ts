import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReference } from './reference';
import { formatRange } from './range';
import { encodeVerseId, decodeVerseId, toUsfmRef, fromUsfmRef, isValidVerseId } from './verseId';
import { findBook, BOOKS } from './canon';

function parsed(input: string) {
  const r = parseReference(input);
  assert.ok(r.ok, `expected "${input}" to parse, got ${r.ok ? '' : r.error.kind}`);
  return r.value;
}

test('single verse', () => {
  const r = parsed('John 3:16');
  assert.equal(r.range.start, encodeVerseId(43, 3, 16));
  assert.equal(r.range.end, encodeVerseId(43, 3, 16));
  assert.equal(r.label, 'John 3:16');
});

test('accepts abbreviations, dots, and loose spacing', () => {
  for (const input of ['jn 3:16', 'jn3.16', 'JHN 3:16', ' John  3 : 16 ', 'joh 3.16']) {
    assert.equal(parsed(input).range.start, encodeVerseId(43, 3, 16), input);
  }
});

test('verse range within a chapter', () => {
  const r = parsed('1 Cor 13:4-7');
  assert.equal(r.range.start, encodeVerseId(46, 13, 4));
  assert.equal(r.range.end, encodeVerseId(46, 13, 7));
  assert.equal(r.label, '1 Corinthians 13:4-7');
});

test('bare chapter means the whole chapter', () => {
  const r = parsed('Romans 8');
  assert.equal(r.range.start, encodeVerseId(45, 8, 1));
  assert.equal(decodeVerseId(r.range.end).verse, 39);
  assert.equal(r.label, 'Romans 8');
});

test('chapter range', () => {
  const r = parsed('Romans 8-9');
  assert.equal(r.range.start, encodeVerseId(45, 8, 1));
  assert.equal(decodeVerseId(r.range.end).chapter, 9);
  assert.equal(r.label, 'Romans 8-9');
});

test('bare end number after chapter:verse is a verse, not a chapter', () => {
  const r = parsed('Romans 8:1-9');
  assert.equal(r.range.end, encodeVerseId(45, 8, 9));
  assert.equal(r.label, 'Romans 8:1-9');
});

test('range crossing a chapter boundary', () => {
  const r = parsed('Gen 1:1-2:3');
  assert.equal(r.range.start, encodeVerseId(1, 1, 1));
  assert.equal(r.range.end, encodeVerseId(1, 2, 3));
  assert.equal(r.label, 'Genesis 1:1-2:3');
});

test('bare book name means the whole book', () => {
  const r = parsed('John');
  assert.equal(r.range.start, encodeVerseId(43, 1, 1));
  assert.equal(decodeVerseId(r.range.end).chapter, 21);
  assert.equal(r.label, 'John');
});

test('single-chapter book: a bare number is a verse', () => {
  const r = parsed('Jude 3');
  assert.equal(r.range.start, encodeVerseId(65, 1, 3));
  assert.equal(r.range.end, encodeVerseId(65, 1, 3));
  assert.equal(r.label, 'Jude 3');
});

test('single-chapter book range', () => {
  const r = parsed('Jude 3-5');
  assert.equal(r.range.start, encodeVerseId(65, 1, 3));
  assert.equal(r.range.end, encodeVerseId(65, 1, 5));
});

test('ordinal and roman-numeral book prefixes', () => {
  for (const input of ['1 John 2:1', '1John 2:1', 'I John 2:1', 'first john 2:1', '1jn 2:1']) {
    assert.equal(parsed(input).range.start, encodeVerseId(62, 2, 1), input);
  }
  assert.equal(parsed('II Kings 4:1').range.start, encodeVerseId(12, 4, 1));
  assert.equal(parsed('2nd Kings 4:1').range.start, encodeVerseId(12, 4, 1));
});

test('"Isaiah" is not read as roman numeral I + saiah', () => {
  assert.equal(parsed('Isaiah 53:5').range.start, encodeVerseId(23, 53, 5));
  assert.equal(parsed('Is 53:5').range.start, encodeVerseId(23, 53, 5));
});

test('multi-word book names', () => {
  assert.equal(parsed('Song of Solomon 2:1').range.start, encodeVerseId(22, 2, 1));
  assert.equal(parsed('Song of Songs 2:1').range.start, encodeVerseId(22, 2, 1));
});

test('en dash and em dash separators', () => {
  assert.equal(parsed('John 3:16–17').range.end, encodeVerseId(43, 3, 17));
  assert.equal(parsed('John 3:16—17').range.end, encodeVerseId(43, 3, 17));
});

test('rejects unknown books', () => {
  const r = parseReference('Hezekiah 3:1');
  assert.equal(r.ok, false);
  assert.equal(r.ok ? null : r.error.kind, 'unknown-book');
});

test('rejects out-of-range chapters and verses', () => {
  const chapter = parseReference('John 99');
  assert.equal(chapter.ok, false);
  assert.equal(chapter.ok ? null : chapter.error.kind, 'no-such-chapter');

  const verse = parseReference('John 3:999');
  assert.equal(verse.ok, false);
  assert.equal(verse.ok ? null : verse.error.kind, 'no-such-verse');
});

test('rejects empty input', () => {
  assert.equal(parseReference('   ').ok, false);
});

test('Psalm 119:176 exists and 119:177 does not', () => {
  assert.ok(parseReference('Ps 119:176').ok);
  assert.equal(parseReference('Ps 119:177').ok, false);
});

test('every book resolves by name, USFM code, and every abbreviation', () => {
  for (const book of BOOKS) {
    for (const key of [book.name, book.usfm, ...book.abbreviations]) {
      assert.equal(findBook(key)?.usfm, book.usfm, `${key} -> ${book.usfm}`);
    }
  }
});

test('every parsed reference round-trips through the USFM wire format', () => {
  for (const book of BOOKS) {
    const id = encodeVerseId(book.number, 1, 1);
    assert.ok(isValidVerseId(id), book.usfm);
    assert.equal(fromUsfmRef(toUsfmRef(id)), id, book.usfm);
  }
});

test('formatRange collapses to the shortest correct form', () => {
  assert.equal(formatRange(parsed('Genesis').range), 'Genesis');
  assert.equal(formatRange(parsed('Genesis 1').range), 'Genesis 1');
  assert.equal(formatRange(parsed('Genesis 1:1').range), 'Genesis 1:1');
  assert.equal(formatRange(parsed('Obadiah').range), 'Obadiah');
});
