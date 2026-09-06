/** Entity types. The persisted shape is documented in docs/DATA_MODEL.md. */
import type { VerseRange } from './range';

export type AnnotationSource = 'manual' | 'csv' | 'bundle';
export type BodyFormat = 'plain';

export interface Author {
  readonly id: string;
  readonly displayName: string;
  /** Exactly one author is the device owner. */
  readonly isSelf: boolean;
  readonly color: string;
  readonly createdAt: number;
}

export interface Annotation {
  readonly id: string;
  readonly authorId: string;
  readonly range: VerseRange;
  /** Highlight colour, or null for a note with no highlight. */
  readonly color: string | null;
  /** Note text, or null for a highlight with no note. */
  readonly body: string | null;
  readonly bodyFormat: BodyFormat;
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly source: AnnotationSource;
  /** Set when the annotation arrived inside an imported commentary. */
  readonly commentaryId: string | null;
  /**
   * Soft delete. Needed because a re-imported bundle would otherwise resurrect
   * notes the reader deliberately removed.
   */
  readonly deletedAt: number | null;
}

export interface Commentary {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly description: string | null;
  readonly isImported: boolean;
  /** Layer toggle in the reader. */
  readonly isVisible: boolean;
  readonly version: number;
  readonly importedAt: number | null;
}

/** An annotation with at least one of colour or body is meaningful; both null is a leak. */
export function isMeaningful(a: Pick<Annotation, 'color' | 'body'>): boolean {
  return a.color !== null || (a.body !== null && a.body.trim() !== '');
}

export const AUTHOR_COLORS = [
  '#B45309',
  '#0F766E',
  '#1D4ED8',
  '#9D174D',
  '#6D28D9',
  '#4D7C0F',
  '#B91C1C',
  '#0E7490',
] as const;

/** Deterministic colour for an author, so their notes look the same on every device. */
export function authorColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AUTHOR_COLORS[hash % AUTHOR_COLORS.length];
}

export const HIGHLIGHT_COLORS: Record<string, string> = {
  amber: '#FDE68A',
  green: '#BBF7D0',
  blue: '#BFDBFE',
  pink: '#FBCFE8',
  purple: '#DDD6FE',
  grey: '#E5E7EB',
};

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
