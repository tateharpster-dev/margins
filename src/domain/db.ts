/**
 * The in-memory database and every query the app runs against it.
 *
 * Kept free of React and React Native imports so it can be unit tested in plain
 * Node, and so the persistence backend can change without touching query logic.
 *
 * On storage: Phase 1 persists the whole state as one JSON document, which is
 * ample at personal scale (a prolific writer produces thousands of annotations,
 * not millions) and behaves identically on iOS, Android and web. The SQLite
 * schema in docs/DATA_MODEL.md remains the migration target — the entity shapes
 * here are exactly its rows, so moving over is an adapter swap, not a redesign.
 */
import { uuid } from './id';
import { authorColorFor, isMeaningful } from './model';
import type { Annotation, Author, Commentary } from './model';
import { formatRange, overlaps, splitByBook } from './range';
import type { VerseRange } from './range';
import { decodeVerseId } from './verseId';
import { getBookByNumber } from './canon';
import type { ImportRow } from './csv';
import type { ParsedBundle } from './bundle';

export interface DbState {
  version: number;
  authors: Author[];
  annotations: Annotation[];
  commentaries: Commentary[];
}

export const STATE_VERSION = 1;

export function emptyState(selfName = 'Me', now = Date.now()): DbState {
  const id = uuid();
  return {
    version: STATE_VERSION,
    authors: [
      { id, displayName: selfName, isSelf: true, color: authorColorFor(id), createdAt: now },
    ],
    annotations: [],
    commentaries: [],
  };
}

/** Tolerates a missing, truncated or older document rather than losing the app. */
export function reviveState(raw: unknown): DbState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Partial<DbState>;
  if (!Array.isArray(s.authors) || !Array.isArray(s.annotations)) return null;
  if (!s.authors.some((a) => a?.isSelf)) return null;
  return {
    version: typeof s.version === 'number' ? s.version : STATE_VERSION,
    authors: s.authors,
    annotations: s.annotations,
    commentaries: Array.isArray(s.commentaries) ? s.commentaries : [],
  };
}

export function selfAuthor(state: DbState): Author {
  const self = state.authors.find((a) => a.isSelf);
  if (!self) throw new Error('State has no self author');
  return self;
}

export function authorById(state: DbState, id: string): Author | undefined {
  return state.authors.find((a) => a.id === id);
}

export function commentaryById(state: DbState, id: string): Commentary | undefined {
  return state.commentaries.find((c) => c.id === id);
}

function live(state: DbState): Annotation[] {
  return state.annotations.filter((a) => a.deletedAt === null);
}

/**
 * Whether an annotation should be shown: your own always, an imported one only
 * while its commentary layer is switched on.
 */
export function isVisible(state: DbState, a: Annotation): boolean {
  if (a.commentaryId === null) return true;
  const c = commentaryById(state, a.commentaryId);
  return c ? c.isVisible : true;
}

/**
 * The reader's core query — every annotation touching the given range. This is
 * the interval overlap test from docs/DATA_MODEL.md.
 */
export function annotationsOverlapping(
  state: DbState,
  range: VerseRange,
  options: { visibleOnly?: boolean } = {}
): Annotation[] {
  const visibleOnly = options.visibleOnly ?? true;
  return live(state)
    .filter((a) => overlaps(a.range, range))
    .filter((a) => (visibleOnly ? isVisible(state, a) : true))
    .sort((a, b) => a.range.start - b.range.start || a.createdAt - b.createdAt);
}

export function annotationsByAuthor(state: DbState, authorId: string): Annotation[] {
  return live(state)
    .filter((a) => a.authorId === authorId)
    .sort((a, b) => a.range.start - b.range.start);
}

export function annotationsInCommentary(state: DbState, commentaryId: string): Annotation[] {
  return live(state)
    .filter((a) => a.commentaryId === commentaryId)
    .sort((a, b) => a.range.start - b.range.start);
}

export interface NewAnnotation {
  range: VerseRange;
  color?: string | null;
  body?: string | null;
  tags?: readonly string[];
  createdAt?: number;
  source?: Annotation['source'];
  authorId?: string;
  commentaryId?: string | null;
}

/**
 * Adds an annotation, splitting any selection that crosses book boundaries so
 * that every stored range means one unambiguous thing.
 */
export function addAnnotation(
  state: DbState,
  input: NewAnnotation,
  now = Date.now()
): { state: DbState; added: Annotation[] } {
  const authorId = input.authorId ?? selfAuthor(state).id;
  const color = input.color ?? null;
  const body = input.body?.trim() ? input.body.trim() : null;

  if (!isMeaningful({ color, body })) {
    return { state, added: [] };
  }

  const created = input.createdAt ?? now;
  const added: Annotation[] = splitByBook(input.range).map((range) => ({
    id: uuid(),
    authorId,
    range,
    color,
    body,
    bodyFormat: 'plain' as const,
    tags: input.tags ? [...input.tags] : [],
    createdAt: created,
    updatedAt: now,
    source: input.source ?? 'manual',
    commentaryId: input.commentaryId ?? null,
    deletedAt: null,
  }));

  return {
    state: { ...state, annotations: [...state.annotations, ...added] },
    added,
  };
}

export function updateAnnotation(
  state: DbState,
  id: string,
  patch: { color?: string | null; body?: string | null; tags?: readonly string[] },
  now = Date.now()
): DbState {
  return {
    ...state,
    annotations: state.annotations.map((a) => {
      if (a.id !== id) return a;
      const body =
        patch.body === undefined ? a.body : patch.body?.trim() ? patch.body.trim() : null;
      const color = patch.color === undefined ? a.color : patch.color;
      return {
        ...a,
        color,
        body,
        tags: patch.tags ? [...patch.tags] : a.tags,
        updatedAt: now,
      };
    }),
  };
}

/**
 * Soft delete. A hard delete would let a re-imported bundle resurrect notes the
 * reader deliberately removed.
 */
export function deleteAnnotation(state: DbState, id: string, now = Date.now()): DbState {
  return {
    ...state,
    annotations: state.annotations.map((a) =>
      a.id === id ? { ...a, deletedAt: now, updatedAt: now } : a
    ),
  };
}

export function renameSelf(state: DbState, displayName: string): DbState {
  const name = displayName.trim();
  if (!name) return state;
  return {
    ...state,
    authors: state.authors.map((a) => (a.isSelf ? { ...a, displayName: name } : a)),
  };
}

/** Commits a previewed CSV import. Rows have already been validated. */
export function commitCsvImport(
  state: DbState,
  rows: readonly ImportRow[],
  now = Date.now()
): { state: DbState; count: number } {
  let next = state;
  let count = 0;
  for (const row of rows) {
    const result = addAnnotation(
      next,
      {
        range: row.range,
        color: row.color,
        body: row.note,
        tags: row.tags,
        createdAt: row.createdAt ?? now,
        source: 'csv',
      },
      now
    );
    next = result.state;
    count += result.added.length;
  }
  return { state: next, count };
}

export interface BundleImportOutcome {
  state: DbState;
  added: number;
  updated: number;
  /** Annotations the reader had deleted; left deleted rather than resurrected. */
  keptDeleted: number;
  isUpdate: boolean;
  authorName: string;
  commentaryTitle: string;
}

/**
 * Imports a commentary. Re-importing a newer version of the same commentary
 * updates in place, keyed on stable UUIDs, rather than producing a second copy
 * of everything under "Harold Harpster (2)".
 */
export function importBundle(
  state: DbState,
  parsed: ParsedBundle,
  now = Date.now()
): BundleImportOutcome {
  const existingAuthor = authorById(state, parsed.author.id);
  const authors = existingAuthor
    ? state.authors.map((a) =>
        a.id === parsed.author.id ? { ...a, displayName: parsed.author.displayName } : a
      )
    : [...state.authors, parsed.author];

  const existingCommentary = commentaryById(state, parsed.commentary.id);
  const commentaries = existingCommentary
    ? state.commentaries.map((c) =>
        c.id === parsed.commentary.id
          ? { ...c, ...parsed.commentary, isVisible: c.isVisible, importedAt: now }
          : c
      )
    : [...state.commentaries, parsed.commentary];

  const byId = new Map(state.annotations.map((a) => [a.id, a]));
  const annotations = [...state.annotations];
  let added = 0;
  let updated = 0;
  let keptDeleted = 0;

  for (const incoming of parsed.annotations) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      annotations.push(incoming);
      added++;
      continue;
    }
    if (existing.deletedAt !== null) {
      keptDeleted++;
      continue;
    }
    const index = annotations.findIndex((a) => a.id === incoming.id);
    annotations[index] = { ...incoming, updatedAt: now };
    updated++;
  }

  return {
    state: { ...state, authors, commentaries, annotations },
    added,
    updated,
    keptDeleted,
    isUpdate: Boolean(existingCommentary),
    authorName: parsed.author.displayName,
    commentaryTitle: parsed.commentary.title,
  };
}

export function setCommentaryVisible(
  state: DbState,
  commentaryId: string,
  isVisible: boolean
): DbState {
  return {
    ...state,
    commentaries: state.commentaries.map((c) =>
      c.id === commentaryId ? { ...c, isVisible } : c
    ),
  };
}

/** Removes an imported commentary and every annotation that came with it. */
export function removeCommentary(state: DbState, commentaryId: string): DbState {
  const commentary = commentaryById(state, commentaryId);
  if (!commentary) return state;
  const annotations = state.annotations.filter((a) => a.commentaryId !== commentaryId);
  const stillReferenced = annotations.some((a) => a.authorId === commentary.authorId);
  return {
    ...state,
    annotations,
    commentaries: state.commentaries.filter((c) => c.id !== commentaryId),
    authors: state.authors.filter(
      (a) => a.isSelf || a.id !== commentary.authorId || stillReferenced
    ),
  };
}

/**
 * Publishes your own annotations as a named commentary — the consolidation step.
 * Re-publishing bumps the version so recipients can tell the copies apart.
 */
export function publishCommentary(
  state: DbState,
  input: { title: string; description?: string | null; annotationIds?: readonly string[] },
  now = Date.now()
): { state: DbState; commentary: Commentary } {
  const self = selfAuthor(state);
  const existing = state.commentaries.find((c) => c.authorId === self.id && !c.isImported);

  const commentary: Commentary = existing
    ? {
        ...existing,
        title: input.title.trim() || existing.title,
        description: input.description ?? existing.description,
        version: existing.version + 1,
      }
    : {
        id: uuid(),
        authorId: self.id,
        title: input.title.trim() || `${self.displayName}'s Notes`,
        description: input.description ?? null,
        isImported: false,
        isVisible: true,
        version: 1,
        importedAt: null,
      };

  const chosen = input.annotationIds ? new Set(input.annotationIds) : null;
  const annotations = state.annotations.map((a) => {
    if (a.authorId !== self.id || a.deletedAt !== null) return a;
    const include = chosen ? chosen.has(a.id) : true;
    return { ...a, commentaryId: include ? commentary.id : null, updatedAt: now };
  });

  const commentaries = existing
    ? state.commentaries.map((c) => (c.id === commentary.id ? commentary : c))
    : [...state.commentaries, commentary];

  return { state: { ...state, annotations, commentaries }, commentary };
}

export interface CommentarySection {
  readonly bookNumber: number;
  readonly bookName: string;
  readonly entries: readonly { annotation: Annotation; label: string }[];
}

/**
 * The consolidated reading view: one author's notes, in canonical order,
 * grouped by book.
 */
export function buildCommentaryDocument(
  state: DbState,
  authorId: string
): CommentarySection[] {
  const sections = new Map<number, { annotation: Annotation; label: string }[]>();

  for (const annotation of annotationsByAuthor(state, authorId)) {
    const bookNumber = decodeVerseId(annotation.range.start).book;
    const entries = sections.get(bookNumber) ?? [];
    entries.push({ annotation, label: formatRange(annotation.range) });
    sections.set(bookNumber, entries);
  }

  return [...sections.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bookNumber, entries]) => ({
      bookNumber,
      bookName: getBookByNumber(bookNumber)?.name ?? '?',
      entries,
    }));
}

export interface AuthorStats {
  readonly author: Author;
  readonly noteCount: number;
  readonly highlightCount: number;
  readonly bookCount: number;
}

export function authorStats(state: DbState, authorId: string): AuthorStats | null {
  const author = authorById(state, authorId);
  if (!author) return null;
  const own = annotationsByAuthor(state, authorId);
  const books = new Set(own.map((a) => decodeVerseId(a.range.start).book));
  return {
    author,
    noteCount: own.filter((a) => a.body !== null).length,
    highlightCount: own.filter((a) => a.color !== null).length,
    bookCount: books.size,
  };
}
