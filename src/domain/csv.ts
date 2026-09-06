/**
 * CSV import — the path by which a writer's existing notes get into Margins.
 *
 * The design assumption is that the file was exported from Excel by someone who
 * has never read a spec, so parsing is deliberately forgiving. What is *not*
 * forgiving is the reporting: every row that fails is surfaced with its line
 * number, and nothing is written until the user confirms. A silent partial
 * import is the worst outcome here — the writer believes forty years of notes
 * arrived, and a tenth of them are missing.
 */
import { parseReference, describeReferenceError } from './reference';
import { formatRange } from './range';
import type { VerseRange } from './range';

/** RFC 4180 field parsing: quoted fields, embedded commas, doubled quotes. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM, which Excel writes and which would otherwise become
  // part of the first header name.
  const text = input.replace(/^﻿/, '');

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // Skip rows that are entirely empty (trailing newlines, blank separators).
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"' && field.trim() === '') {
      // Only treat a quote as opening if the field is otherwise empty, so that
      // an unescaped quote mid-field (5" nail) does not swallow the rest.
      field = '';
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      endField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Header aliases, because nobody's spreadsheet says "reference". */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  reference: ['reference', 'ref', 'verse', 'verses', 'passage', 'scripture', 'citation'],
  note: ['note', 'notes', 'comment', 'comments', 'text', 'body', 'thought', 'commentary'],
  color: ['color', 'colour', 'highlight', 'highlightcolor'],
  tags: ['tags', 'tag', 'topic', 'topics', 'category', 'categories'],
  created_at: ['createdat', 'created', 'date', 'written', 'timestamp'],
};

export type ColumnKey = keyof typeof COLUMN_ALIASES;

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-.]/g, '');
}

/**
 * Aliases short enough to appear inside unrelated words ("ref" in "preface")
 * are matched exactly; longer ones also match by containment, so a real-world
 * header like "My Comment" or "Highlight Color" still finds its column.
 */
const MIN_CONTAINMENT_LENGTH = 4;

export function mapHeaders(header: readonly string[]): Partial<Record<ColumnKey, number>> {
  const map: Partial<Record<ColumnKey, number>> = {};
  const keys = header.map(normalizeHeader);
  const columns = Object.entries(COLUMN_ALIASES) as [ColumnKey, readonly string[]][];

  // Exact matches first: they are unambiguous, and claiming them up front stops
  // a loose containment match from stealing a column that is named precisely.
  keys.forEach((key, index) => {
    for (const [column, aliases] of columns) {
      if (map[column] === undefined && aliases.includes(key)) map[column] = index;
    }
  });

  const claimed = new Set(Object.values(map));
  keys.forEach((key, index) => {
    if (claimed.has(index)) return;
    for (const [column, aliases] of columns) {
      if (map[column] !== undefined) continue;
      const hit = aliases.some(
        (alias) => alias.length >= MIN_CONTAINMENT_LENGTH && key.includes(alias)
      );
      if (hit) {
        map[column] = index;
        claimed.add(index);
        return;
      }
    }
  });

  return map;
}

export interface ImportRow {
  /** 1-based line in the source file, for error reporting. */
  readonly line: number;
  readonly rawReference: string;
  readonly range: VerseRange;
  readonly label: string;
  readonly note: string | null;
  readonly color: string | null;
  readonly tags: readonly string[];
  readonly createdAt: number | null;
}

export interface ImportFailure {
  readonly line: number;
  readonly rawReference: string;
  readonly rawNote: string;
  readonly reason: string;
}

export interface ImportPreview {
  readonly rows: readonly ImportRow[];
  readonly failures: readonly ImportFailure[];
  readonly missingColumns: readonly string[];
  readonly totalDataRows: number;
}

const KNOWN_COLORS = new Set(['amber', 'green', 'blue', 'pink', 'purple', 'grey']);

function normalizeColor(raw: string): string | null {
  const c = raw.trim().toLowerCase();
  if (!c) return null;
  if (KNOWN_COLORS.has(c)) return c;
  const synonyms: Record<string, string> = {
    yellow: 'amber',
    gold: 'amber',
    orange: 'amber',
    red: 'pink',
    rose: 'pink',
    violet: 'purple',
    lilac: 'purple',
    cyan: 'blue',
    teal: 'blue',
    gray: 'grey',
  };
  return synonyms[c] ?? 'amber';
}

function parseDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Phase one of the import: parse and report. Writes nothing.
 */
export function previewImport(csvText: string): ImportPreview {
  const table = parseCsv(csvText);
  if (table.length === 0) {
    return { rows: [], failures: [], missingColumns: ['reference'], totalDataRows: 0 };
  }

  const [header, ...body] = table;
  const columns = mapHeaders(header);

  const missing: string[] = [];
  if (columns.reference === undefined) missing.push('reference');
  if (columns.note === undefined && columns.color === undefined) {
    missing.push('note or color');
  }
  if (missing.length > 0) {
    return { rows: [], failures: [], missingColumns: missing, totalDataRows: body.length };
  }

  const rows: ImportRow[] = [];
  const failures: ImportFailure[] = [];

  body.forEach((cells, index) => {
    // +2: one for the header row, one because humans count from 1.
    const line = index + 2;
    const at = (key: ColumnKey): string => {
      const idx = columns[key];
      return idx === undefined ? '' : (cells[idx] ?? '').trim();
    };

    const rawReference = at('reference');
    const rawNote = at('note');
    const color = normalizeColor(at('color'));

    if (!rawReference) {
      failures.push({ line, rawReference, rawNote, reason: 'No reference given.' });
      return;
    }

    const parsedRef = parseReference(rawReference);
    if (!parsedRef.ok) {
      failures.push({
        line,
        rawReference,
        rawNote,
        reason: describeReferenceError(parsedRef.error),
      });
      return;
    }

    if (!rawNote && !color) {
      failures.push({
        line,
        rawReference,
        rawNote,
        reason: 'Row has neither a note nor a highlight colour, so there is nothing to save.',
      });
      return;
    }

    rows.push({
      line,
      rawReference,
      range: parsedRef.value.range,
      label: formatRange(parsedRef.value.range),
      note: rawNote || null,
      color,
      tags: splitTags(at('tags')),
      createdAt: parseDate(at('created_at')),
    });
  });

  return { rows, failures, missingColumns: [], totalDataRows: body.length };
}

function escapeCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(escapeCsvField).join(',')).join('\n');
}

/**
 * The rows that failed, as a CSV the user can fix and re-import — rather than
 * a list of errors they have to reconcile against the original file by hand.
 */
export function failuresToCsv(failures: readonly ImportFailure[]): string {
  return toCsv([
    ['line', 'reference', 'note', 'problem'],
    ...failures.map((f) => [String(f.line), f.rawReference, f.rawNote, f.reason]),
  ]);
}

/** A template for someone starting from scratch rather than an existing file. */
export const CSV_TEMPLATE = toCsv([
  ['reference', 'note', 'color', 'tags', 'created_at'],
  ['John 3:16', 'The whole gospel in one sentence.', 'amber', 'gospel;love', '2011-04-02'],
  ['Romans 8', "Paul's argument turns here.", '', 'study', ''],
  ['Ps 119:105', '', 'green', '', ''],
]);
