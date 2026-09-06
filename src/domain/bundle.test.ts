import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBundle, serializeBundle, parseBundle, bundleFilename, BUNDLE_FORMAT } from './bundle';
import type { Annotation, Author, Commentary } from './model';
import { encodeVerseId } from './verseId';

const author: Author = {
  id: 'author-1',
  displayName: 'Harold Harpster',
  isSelf: true,
  color: '#B45309',
  createdAt: 1_600_000_000_000,
};

const commentary: Commentary = {
  id: 'comm-1',
  authorId: 'author-1',
  title: "Harold Harpster's Notes",
  description: 'Notes from forty years of Sunday school.',
  isImported: false,
  isVisible: true,
  version: 3,
  importedAt: null,
};

function annotation(over: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    authorId: 'author-1',
    range: { start: encodeVerseId(43, 3, 16), end: encodeVerseId(43, 3, 17) },
    color: 'amber',
    body: 'The whole gospel in one sentence.',
    bodyFormat: 'plain',
    tags: ['gospel'],
    createdAt: Date.parse('2011-04-02T00:00:00Z'),
    updatedAt: Date.parse('2011-04-02T00:00:00Z'),
    source: 'manual',
    commentaryId: null,
    deletedAt: null,
    ...over,
  };
}

test('round-trips a commentary through export and import', () => {
  const bundle = buildBundle(author, commentary, [annotation()]);
  const result = parseBundle(serializeBundle(bundle));
  assert.ok(result.ok);

  const v = result.value;
  assert.equal(v.author.id, 'author-1');
  assert.equal(v.author.displayName, 'Harold Harpster');
  assert.equal(v.commentary.title, "Harold Harpster's Notes");
  assert.equal(v.commentary.version, 3);
  assert.equal(v.annotations.length, 1);
  assert.equal(v.annotations[0].id, 'ann-1');
  assert.equal(v.annotations[0].range.start, encodeVerseId(43, 3, 16));
  assert.equal(v.annotations[0].range.end, encodeVerseId(43, 3, 17));
  assert.equal(v.annotations[0].body, 'The whole gospel in one sentence.');
  assert.equal(v.annotations[0].createdAt, Date.parse('2011-04-02T00:00:00Z'));
});

test('an imported author is never marked as self', () => {
  const bundle = buildBundle(author, commentary, [annotation()]);
  const result = parseBundle(serializeBundle(bundle));
  assert.ok(result.ok);
  assert.equal(result.value.author.isSelf, false);
  assert.equal(result.value.commentary.isImported, true);
});

test('references travel as readable USFM strings, not integers', () => {
  const json = serializeBundle(buildBundle(author, commentary, [annotation()]));
  assert.match(json, /"start": "JHN 3:16"/);
  assert.match(json, /"end": "JHN 3:17"/);
});

test('bundles carry no scripture text', () => {
  const json = serializeBundle(buildBundle(author, commentary, [annotation()]));
  assert.doesNotMatch(json, /For God so loved/i);
});

test('deleted annotations are not exported', () => {
  const bundle = buildBundle(author, commentary, [
    annotation({ id: 'keep' }),
    annotation({ id: 'gone', deletedAt: Date.now() }),
  ]);
  assert.equal(bundle.annotations.length, 1);
  assert.equal(bundle.annotations[0].id, 'keep');
});

test('exported annotations are in canonical order', () => {
  const bundle = buildBundle(author, commentary, [
    annotation({ id: 'rev', range: { start: encodeVerseId(66, 1, 1), end: encodeVerseId(66, 1, 1) } }),
    annotation({ id: 'gen', range: { start: encodeVerseId(1, 1, 1), end: encodeVerseId(1, 1, 1) } }),
    annotation({ id: 'jhn' }),
  ]);
  assert.deepEqual(bundle.annotations.map((a) => a.id), ['gen', 'jhn', 'rev']);
});

test('rejects files that are not bundles, with a readable message', () => {
  assert.equal(parseBundle('not json').ok, false);
  assert.equal(parseBundle('{"format":"something.else"}').ok, false);
  assert.equal(parseBundle('null').ok, false);
});

test('refuses a bundle from a newer format version rather than mangling it', () => {
  const result = parseBundle(
    JSON.stringify({
      format: BUNDLE_FORMAT,
      formatVersion: 99,
      author: { id: 'a', displayName: 'A' },
      commentary: { id: 'c', title: 'T' },
      annotations: [],
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /newer version/);
});

test('skips unreadable annotations but keeps the rest, and reports what it skipped', () => {
  const result = parseBundle(
    JSON.stringify({
      format: BUNDLE_FORMAT,
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      author: { id: 'a', displayName: 'A' },
      commentary: { id: 'c', title: 'T', description: null, version: 1 },
      annotations: [
        { id: 'good', ref: { start: 'JHN 3:16', end: 'JHN 3:16' }, body: 'ok', createdAt: '2011-01-01' },
        { id: 'bad-ref', ref: { start: 'XYZ 1:1', end: 'XYZ 1:1' }, body: 'x', createdAt: '2011-01-01' },
        { id: 'empty', ref: { start: 'JHN 3:17', end: 'JHN 3:17' }, createdAt: '2011-01-01' },
      ],
    })
  );
  assert.ok(result.ok);
  assert.equal(result.value.annotations.length, 1);
  assert.equal(result.value.annotations[0].id, 'good');
  assert.equal(result.value.skipped.length, 2);
});

test('filename is a readable slug', () => {
  assert.equal(bundleFilename(commentary), 'harold-harpsters-notes.margins');
  assert.equal(bundleFilename({ ...commentary, title: '  !!  ' }), 'commentary.margins');
});
