import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, mapHeaders, previewImport, failuresToCsv, toCsv, CSV_TEMPLATE } from './csv';
import { encodeVerseId } from './verseId';

test('parses quoted fields with embedded commas and newlines', () => {
  const rows = parseCsv('a,b\n"one, two","line1\nline2"');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['one, two', 'line1\nline2'],
  ]);
});

test('parses doubled quotes as a literal quote', () => {
  const rows = parseCsv('note\n"He said ""hello"" loudly"');
  assert.equal(rows[1][0], 'He said "hello" loudly');
});

test('strips a BOM so the first header still matches', () => {
  const rows = parseCsv('﻿reference,note\nJohn 3:16,hi');
  assert.equal(rows[0][0], 'reference');
});

test('skips blank lines and tolerates CRLF', () => {
  const rows = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('an unescaped quote mid-field does not swallow the row', () => {
  const rows = parseCsv('a,b\n5" nail,ok');
  assert.deepEqual(rows[1], ['5" nail', 'ok']);
});

test('matches header aliases case- and space-insensitively', () => {
  const m = mapHeaders(['Passage', ' My Comment ', 'Highlight Color', 'Topics', 'Date']);
  assert.equal(m.reference, 0);
  assert.equal(m.note, 1);
  assert.equal(m.color, 2);
  assert.equal(m.tags, 3);
  assert.equal(m.created_at, 4);
});

test('an exactly-named column wins over a loose match elsewhere', () => {
  const m = mapHeaders(['My Comment', 'Note']);
  assert.equal(m.note, 1);
});

test('one column is never claimed by two fields', () => {
  const m = mapHeaders(['Verse Reference', 'Commentary Notes']);
  assert.equal(m.reference, 0);
  assert.equal(m.note, 1);
});

test('a note-bearing row with real-world headers is not dropped', () => {
  const preview = previewImport(
    'Passage,My Comment,Highlight Color\n"Romans 8","Paul\'s argument turns here.",'
  );
  assert.equal(preview.failures.length, 0);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].note, "Paul's argument turns here.");
  assert.equal(preview.rows[0].color, null);
});

test('imports a well-formed file', () => {
  const preview = previewImport(CSV_TEMPLATE);
  assert.equal(preview.failures.length, 0);
  assert.equal(preview.rows.length, 3);
  assert.equal(preview.rows[0].range.start, encodeVerseId(43, 3, 16));
  assert.equal(preview.rows[0].color, 'amber');
  assert.deepEqual([...preview.rows[0].tags], ['gospel', 'love']);
  assert.equal(preview.rows[1].label, 'Romans 8');
  assert.equal(preview.rows[2].note, null);
  assert.equal(preview.rows[2].color, 'green');
});

test('reports bad references with their line numbers instead of dropping them', () => {
  const csv = [
    'reference,note',
    'John 3:16,fine',
    'Hezekiah 2:1,bogus book',
    'John 99,bogus chapter',
    'John 3:17,also fine',
  ].join('\n');

  const preview = previewImport(csv);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.failures.length, 2);
  assert.equal(preview.totalDataRows, 4);
  assert.equal(preview.failures[0].line, 3);
  assert.match(preview.failures[0].reason, /Hezekiah/);
  assert.equal(preview.failures[1].line, 4);
  assert.match(preview.failures[1].reason, /21 chapters/);
});

test('rejects a row with neither note nor colour', () => {
  const preview = previewImport('reference,note,color\nJohn 3:16,,');
  assert.equal(preview.rows.length, 0);
  assert.equal(preview.failures.length, 1);
  assert.match(preview.failures[0].reason, /nothing to save/);
});

test('reports missing required columns rather than importing nothing silently', () => {
  const preview = previewImport('foo,bar\n1,2');
  assert.deepEqual([...preview.missingColumns], ['reference', 'note or color']);
});

test('normalises colour synonyms', () => {
  const preview = previewImport('reference,color\nJohn 3:16,Yellow\nJohn 3:17,gray');
  assert.equal(preview.rows[0].color, 'amber');
  assert.equal(preview.rows[1].color, 'grey');
});

test('parses dates when present and tolerates their absence', () => {
  const preview = previewImport('reference,note,created_at\nJohn 3:16,hi,2011-04-02\nJohn 3:17,hi,');
  assert.equal(preview.rows[0].createdAt, Date.parse('2011-04-02'));
  assert.equal(preview.rows[1].createdAt, null);
});

test('failure CSV round-trips back through the parser', () => {
  const preview = previewImport('reference,note\n"Hezekiah 2:1","said ""what"", loudly"');
  const csv = failuresToCsv(preview.failures);
  const reparsed = parseCsv(csv);
  assert.equal(reparsed[0][0], 'line');
  assert.equal(reparsed[1][1], 'Hezekiah 2:1');
  assert.equal(reparsed[1][2], 'said "what", loudly');
});

test('toCsv quotes only what needs quoting', () => {
  assert.equal(toCsv([['a', 'b,c'], ['d"e', 'f']]), 'a,"b,c"\n"d""e",f');
});
