/**
 * The .margins share bundle — the artifact a family actually archives.
 *
 * Design notes (fuller rationale in docs/DATA_MODEL.md):
 *  - References travel as USFM strings, so the file stays readable by a human
 *    in a text editor decades from now, independent of the internal ID scheme.
 *  - UUIDs are stable, so re-importing a newer version of a commentary updates
 *    in place instead of producing a second copy of everything.
 *  - No scripture text: keeps the file small and clear of translation copyright.
 *  - No device or account identifiers: it carries what was written, nothing else.
 */
import { fromUsfmRef, toUsfmRef } from './verseId';
import type { Annotation, Author, Commentary } from './model';
import { authorColorFor } from './model';

export const BUNDLE_FORMAT = 'margins.commentary';
export const BUNDLE_FORMAT_VERSION = 1;

export interface BundleAnnotation {
  id: string;
  ref: { start: string; end: string };
  color?: string | null;
  body?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  formatVersion: number;
  exportedAt: string;
  author: { id: string; displayName: string };
  commentary: {
    id: string;
    title: string;
    description: string | null;
    version: number;
  };
  annotations: BundleAnnotation[];
}

export function buildBundle(
  author: Author,
  commentary: Commentary,
  annotations: readonly Annotation[]
): Bundle {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    author: { id: author.id, displayName: author.displayName },
    commentary: {
      id: commentary.id,
      title: commentary.title,
      description: commentary.description,
      version: commentary.version,
    },
    annotations: annotations
      .filter((a) => a.deletedAt === null)
      .slice()
      .sort((a, b) => a.range.start - b.range.start)
      .map((a) => ({
        id: a.id,
        ref: { start: toUsfmRef(a.range.start), end: toUsfmRef(a.range.end) },
        color: a.color,
        body: a.body,
        tags: a.tags.length > 0 ? [...a.tags] : undefined,
        createdAt: new Date(a.createdAt).toISOString(),
        updatedAt: new Date(a.updatedAt).toISOString(),
      })),
  };
}

export function serializeBundle(bundle: Bundle): string {
  return JSON.stringify(bundle, null, 2);
}

export type BundleParseResult =
  | { ok: true; value: ParsedBundle }
  | { ok: false; error: string };

export interface ParsedBundle {
  readonly author: Author;
  readonly commentary: Commentary;
  readonly annotations: readonly Annotation[];
  /** Entries that could not be resolved, reported rather than dropped. */
  readonly skipped: readonly { id: string; reason: string }[];
}

/**
 * Parses a bundle defensively: the file may have been hand-edited, truncated by
 * an email client, or written by a future version of the app.
 */
export function parseBundle(text: string, now: number = Date.now()): BundleParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON, so it may be damaged or incomplete.' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'That file does not look like a Margins commentary.' };
  }
  const b = raw as Partial<Bundle>;

  if (b.format !== BUNDLE_FORMAT) {
    return { ok: false, error: 'That file does not look like a Margins commentary.' };
  }
  if (typeof b.formatVersion !== 'number' || b.formatVersion > BUNDLE_FORMAT_VERSION) {
    return {
      ok: false,
      error: `That commentary was written by a newer version of Margins (format ${String(
        b.formatVersion
      )}). Update the app to read it.`,
    };
  }
  if (!b.author?.id || !b.author?.displayName) {
    return { ok: false, error: 'That commentary is missing its author.' };
  }
  if (!b.commentary?.id || !b.commentary?.title) {
    return { ok: false, error: 'That commentary is missing its title.' };
  }
  if (!Array.isArray(b.annotations)) {
    return { ok: false, error: 'That commentary contains no notes.' };
  }

  const author: Author = {
    id: b.author.id,
    displayName: b.author.displayName,
    isSelf: false,
    color: authorColorFor(b.author.id),
    createdAt: now,
  };

  const commentary: Commentary = {
    id: b.commentary.id,
    authorId: author.id,
    title: b.commentary.title,
    description: b.commentary.description ?? null,
    isImported: true,
    isVisible: true,
    version: typeof b.commentary.version === 'number' ? b.commentary.version : 1,
    importedAt: now,
  };

  const annotations: Annotation[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const entry of b.annotations) {
    const id = typeof entry?.id === 'string' ? entry.id : '(no id)';
    const start = entry?.ref?.start ? fromUsfmRef(entry.ref.start) : null;
    const end = entry?.ref?.end ? fromUsfmRef(entry.ref.end) : null;

    if (start === null || end === null) {
      skipped.push({ id, reason: `Unreadable reference "${entry?.ref?.start ?? '?'}".` });
      continue;
    }
    const color = entry.color ?? null;
    const body = entry.body ?? null;
    if (color === null && (body === null || body.trim() === '')) {
      skipped.push({ id, reason: 'Note has neither text nor a highlight.' });
      continue;
    }

    const createdAt = Date.parse(entry.createdAt ?? '');
    const updatedAt = Date.parse(entry.updatedAt ?? '');

    annotations.push({
      id,
      authorId: author.id,
      range: start <= end ? { start, end } : { start: end, end: start },
      color,
      body,
      bodyFormat: 'plain',
      tags: Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === 'string') : [],
      createdAt: Number.isNaN(createdAt) ? now : createdAt,
      updatedAt: Number.isNaN(updatedAt) ? (Number.isNaN(createdAt) ? now : createdAt) : updatedAt,
      source: 'bundle',
      commentaryId: commentary.id,
      deletedAt: null,
    });
  }

  return { ok: true, value: { author, commentary, annotations, skipped } };
}

/** Filename for an exported commentary: "harold-harpsters-notes.margins". */
export function bundleFilename(commentary: Commentary): string {
  const slug = commentary.title
    .toLowerCase()
    // Apostrophes are dropped rather than treated as separators, so
    // "Harold Harpster's Notes" does not become "harpster-s-notes".
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'commentary'}.margins`;
}
