import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, reviveState, selfAuthor, addAnnotation, updateAnnotation, deleteAnnotation,
  annotationsOverlapping, commitCsvImport, importBundle, publishCommentary,
  setCommentaryVisible, removeCommentary, buildCommentaryDocument, authorStats, renameSelf,
} from './db';
import { parseReference } from './reference';
import { parseBundle, buildBundle, serializeBundle } from './bundle';
import { previewImport } from './csv';
import { encodeVerseId } from './verseId';
import type { VerseRange } from './range';

function ref(text: string): VerseRange {
  const r = parseReference(text);
  assert.ok(r.ok, text);
  return r.value.range;
}

test('a new state has exactly one self author', () => {
  const s = emptyState('Tate');
  assert.equal(s.authors.length, 1);
  assert.equal(selfAuthor(s).displayName, 'Tate');
  assert.equal(selfAuthor(s).isSelf, true);
});

test('adds an annotation attributed to self', () => {
  const s0 = emptyState();
  const { state, added } = addAnnotation(s0, { range: ref('John 3:16'), body: 'hi' });
  assert.equal(added.length, 1);
  assert.equal(added[0].authorId, selfAuthor(state).id);
  assert.equal(added[0].body, 'hi');
  assert.equal(added[0].commentaryId, null);
});

test('refuses an annotation with neither highlight nor note', () => {
  const { added } = addAnnotation(emptyState(), { range: ref('John 3:16'), body: '   ' });
  assert.equal(added.length, 0);
});

test('a selection spanning books is split into one annotation per book', () => {
  const range = { start: encodeVerseId(65, 1, 1), end: encodeVerseId(66, 1, 5) };
  const { added } = addAnnotation(emptyState(), { range, color: 'amber' });
  assert.equal(added.length, 2);
  assert.equal(added[0].range.start, encodeVerseId(65, 1, 1));
  assert.equal(added[1].range.end, encodeVerseId(66, 1, 5));
});

test('the reader query finds annotations that overlap the visible range', () => {
  let s = emptyState();
  s = addAnnotation(s, { range: ref('John 3'), color: 'amber' }).state;
  s = addAnnotation(s, { range: ref('John 3:16'), body: 'the verse' }).state;
  s = addAnnotation(s, { range: ref('Romans 8'), body: 'elsewhere' }).state;

  const hits = annotationsOverlapping(s, ref('John 3:16'));
  assert.equal(hits.length, 2);
  assert.equal(annotationsOverlapping(s, ref('Romans 8:1')).length, 1);
  assert.equal(annotationsOverlapping(s, ref('Jude')).length, 0);
});

test('deleting is a soft delete and hides the annotation', () => {
  const s0 = emptyState();
  const { state, added } = addAnnotation(s0, { range: ref('John 3:16'), body: 'hi' });
  const s2 = deleteAnnotation(state, added[0].id);
  assert.equal(annotationsOverlapping(s2, ref('John 3:16')).length, 0);
  assert.equal(s2.annotations.length, 1);
  assert.notEqual(s2.annotations[0].deletedAt, null);
});

test('editing updates body and colour and stamps updatedAt', () => {
  const s0 = emptyState();
  const { state, added } = addAnnotation(s0, { range: ref('John 3:16'), body: 'first' }, 1000);
  const s2 = updateAnnotation(state, added[0].id, { body: 'second', color: 'green' }, 2000);
  assert.equal(s2.annotations[0].body, 'second');
  assert.equal(s2.annotations[0].color, 'green');
  assert.equal(s2.annotations[0].updatedAt, 2000);
  assert.equal(s2.annotations[0].createdAt, 1000);
});

test('committing a CSV import preserves the original dates', () => {
  const preview = previewImport('reference,note,created_at\nJohn 3:16,note one,2011-04-02\nRomans 8,note two,');
  const { state, count } = commitCsvImport(emptyState(), preview.rows);
  assert.equal(count, 2);
  assert.equal(state.annotations[0].createdAt, Date.parse('2011-04-02'));
  assert.equal(state.annotations[0].source, 'csv');
});

function grandfatherBundle(overrides: { version?: number; body?: string } = {}) {
  let s = emptyState('Harold Harpster');
  s = renameSelf(s, 'Harold Harpster');
  s = addAnnotation(s, { range: ref('John 3:16'), body: overrides.body ?? 'note A' }).state;
  s = addAnnotation(s, { range: ref('Romans 8:28'), body: 'note B' }).state;
  const published = publishCommentary(s, { title: "Harold's Notes" });
  let st = published.state;
  for (let i = 1; i < (overrides.version ?? 1); i++) {
    st = publishCommentary(st, { title: "Harold's Notes" }).state;
  }
  const author = selfAuthor(st);
  const commentary = st.commentaries[0];
  return serializeBundle(buildBundle(author, commentary, st.annotations));
}

test('importing a commentary brings in the author, the commentary and the notes', () => {
  const parsed = parseBundle(grandfatherBundle());
  assert.ok(parsed.ok);

  const outcome = importBundle(emptyState('Me'), parsed.value);
  assert.equal(outcome.added, 2);
  assert.equal(outcome.isUpdate, false);
  assert.equal(outcome.authorName, 'Harold Harpster');
  assert.equal(outcome.state.authors.length, 2);
  assert.equal(outcome.state.authors.filter((a) => a.isSelf).length, 1);
  assert.equal(outcome.state.commentaries[0].isImported, true);
});

test("someone else's notes show up alongside your own on the same verse", () => {
  const parsed = parseBundle(grandfatherBundle());
  assert.ok(parsed.ok);
  let s = addAnnotation(emptyState('Me'), { range: ref('John 3:16'), body: 'mine' }).state;
  s = importBundle(s, parsed.value).state;

  const hits = annotationsOverlapping(s, ref('John 3:16'));
  assert.equal(hits.length, 2);
  const names = hits.map((h) => s.authors.find((a) => a.id === h.authorId)?.displayName).sort();
  assert.deepEqual(names, ['Harold Harpster', 'Me']);
});

test('re-importing an updated commentary updates in place instead of duplicating', () => {
  const first = parseBundle(grandfatherBundle());
  assert.ok(first.ok);
  const s1 = importBundle(emptyState('Me'), first.value).state;

  const second = parseBundle(grandfatherBundle());
  assert.ok(second.ok);
  // Same UUIDs would come from the same device; simulate an edited note.
  const edited = {
    ...second.value,
    author: first.value.author,
    commentary: { ...first.value.commentary, version: 2 },
    annotations: first.value.annotations.map((a, i) =>
      i === 0 ? { ...a, body: 'revised note' } : a
    ),
  };
  const outcome = importBundle(s1, edited);

  assert.equal(outcome.isUpdate, true);
  assert.equal(outcome.added, 0);
  assert.equal(outcome.updated, 2);
  assert.equal(outcome.state.authors.length, 2);
  assert.equal(outcome.state.commentaries.length, 1);
  assert.equal(outcome.state.annotations.filter((a) => a.deletedAt === null).length, 2);
  assert.ok(outcome.state.annotations.some((a) => a.body === 'revised note'));
});

test('a note the reader deleted is not resurrected by re-importing', () => {
  const parsed = parseBundle(grandfatherBundle());
  assert.ok(parsed.ok);
  let s = importBundle(emptyState('Me'), parsed.value).state;

  const victim = s.annotations[0].id;
  s = deleteAnnotation(s, victim);

  const outcome = importBundle(s, parsed.value);
  assert.equal(outcome.keptDeleted, 1);
  assert.equal(outcome.state.annotations.find((a) => a.id === victim)?.deletedAt !== null, true);
});

test('hiding a commentary layer hides its notes but keeps your own', () => {
  const parsed = parseBundle(grandfatherBundle());
  assert.ok(parsed.ok);
  let s = addAnnotation(emptyState('Me'), { range: ref('John 3:16'), body: 'mine' }).state;
  s = importBundle(s, parsed.value).state;

  s = setCommentaryVisible(s, parsed.value.commentary.id, false);
  const hits = annotationsOverlapping(s, ref('John 3:16'));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].body, 'mine');

  assert.equal(annotationsOverlapping(s, ref('John 3:16'), { visibleOnly: false }).length, 2);
});

test('removing a commentary takes its notes and its author with it', () => {
  const parsed = parseBundle(grandfatherBundle());
  assert.ok(parsed.ok);
  let s = addAnnotation(emptyState('Me'), { range: ref('John 3:16'), body: 'mine' }).state;
  s = importBundle(s, parsed.value).state;
  s = removeCommentary(s, parsed.value.commentary.id);

  assert.equal(s.commentaries.length, 0);
  assert.equal(s.authors.length, 1);
  assert.equal(annotationsOverlapping(s, ref('John 3:16')).length, 1);
});

test('publishing claims your notes and re-publishing bumps the version', () => {
  let s = addAnnotation(emptyState('Me'), { range: ref('John 3:16'), body: 'mine' }).state;
  const first = publishCommentary(s, { title: 'My Notes' });
  assert.equal(first.commentary.version, 1);
  assert.equal(first.state.annotations[0].commentaryId, first.commentary.id);

  const second = publishCommentary(first.state, { title: 'My Notes' });
  assert.equal(second.commentary.version, 2);
  assert.equal(second.state.commentaries.length, 1);
});

test('publishing a subset leaves the unselected notes unpublished', () => {
  let s = emptyState('Me');
  const a = addAnnotation(s, { range: ref('John 3:16'), body: 'keep' });
  s = a.state;
  const b = addAnnotation(s, { range: ref('Romans 8:28'), body: 'omit' });
  s = b.state;

  const { state } = publishCommentary(s, { title: 'Selected', annotationIds: [a.added[0].id] });
  assert.notEqual(state.annotations.find((x) => x.id === a.added[0].id)?.commentaryId, null);
  assert.equal(state.annotations.find((x) => x.id === b.added[0].id)?.commentaryId, null);
});

test('the consolidated commentary is grouped by book in canonical order', () => {
  let s = emptyState('Me');
  s = addAnnotation(s, { range: ref('Romans 8:28'), body: 'later' }).state;
  s = addAnnotation(s, { range: ref('Genesis 1:1'), body: 'earlier' }).state;
  s = addAnnotation(s, { range: ref('Genesis 3:15'), body: 'also early' }).state;

  const doc = buildCommentaryDocument(s, selfAuthor(s).id);
  assert.deepEqual(doc.map((d) => d.bookName), ['Genesis', 'Romans']);
  assert.equal(doc[0].entries.length, 2);
  assert.equal(doc[0].entries[0].label, 'Genesis 1:1');
});

test('author stats count notes, highlights and books', () => {
  let s = emptyState('Me');
  s = addAnnotation(s, { range: ref('John 3:16'), body: 'note', color: 'amber' }).state;
  s = addAnnotation(s, { range: ref('Romans 8'), color: 'green' }).state;

  const stats = authorStats(s, selfAuthor(s).id);
  assert.ok(stats);
  assert.equal(stats.noteCount, 1);
  assert.equal(stats.highlightCount, 2);
  assert.equal(stats.bookCount, 2);
});

test('state survives a round trip through JSON', () => {
  let s = emptyState('Me');
  s = addAnnotation(s, { range: ref('John 3:16'), body: 'mine' }).state;
  const revived = reviveState(JSON.parse(JSON.stringify(s)));
  assert.ok(revived);
  assert.equal(annotationsOverlapping(revived, ref('John 3:16')).length, 1);
});

test('corrupt or foreign stored data is rejected rather than half-loaded', () => {
  assert.equal(reviveState(null), null);
  assert.equal(reviveState({ authors: [], annotations: [] }), null);
  assert.equal(reviveState('nope'), null);
});
