/**
 * App state. Thin wrapper: every mutation delegates to a pure function in
 * src/domain/db.ts, and this layer only handles React wiring and persistence.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  addAnnotation as dbAdd, annotationsOverlapping, buildCommentaryDocument,
  commitCsvImport, deleteAnnotation as dbDelete, emptyState, importBundle as dbImportBundle,
  publishCommentary as dbPublish, removeCommentary as dbRemoveCommentary, renameSelf as dbRenameSelf,
  reviveState, selfAuthor, setCommentaryVisible as dbSetVisible, updateAnnotation as dbUpdate,
} from '../domain/db';
import type { BundleImportOutcome, DbState, NewAnnotation } from '../domain/db';
import type { Annotation, Author, Commentary } from '../domain/model';
import type { VerseRange } from '../domain/range';
import type { ImportRow } from '../domain/csv';
import type { ParsedBundle } from '../domain/bundle';
import { storage } from './storage';

interface MarginsContextValue {
  ready: boolean;
  state: DbState;
  self: Author;
  authors: readonly Author[];
  commentaries: readonly Commentary[];

  annotationsFor(range: VerseRange): Annotation[];
  authorFor(id: string): Author | undefined;
  commentaryDocument(authorId: string): ReturnType<typeof buildCommentaryDocument>;

  addAnnotation(input: NewAnnotation): void;
  updateAnnotation(id: string, patch: { color?: string | null; body?: string | null }): void;
  deleteAnnotation(id: string): void;
  renameSelf(name: string): void;

  importCsvRows(rows: readonly ImportRow[]): number;
  importBundle(parsed: ParsedBundle): BundleImportOutcome;
  publishCommentary(input: { title: string; description?: string | null }): Commentary;
  setCommentaryVisible(id: string, visible: boolean): void;
  removeCommentary(id: string): void;
}

const MarginsContext = createContext<MarginsContextValue | null>(null);

export function MarginsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DbState>(() => emptyState());
  const [ready, setReady] = useState(false);

  // Guards against the first persist racing the initial load and writing an
  // empty document over real data.
  const loaded = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storage.read();
        if (raw && !cancelled) {
          const revived = reviveState(JSON.parse(raw));
          if (revived) setState(revived);
        }
      } catch {
        // A damaged document must not brick the app. Starting fresh is bad, but
        // the stored bytes are left untouched so they can still be recovered.
      } finally {
        if (!cancelled) {
          loaded.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced write: typing a note should not hit the disk on every keystroke.
  useEffect(() => {
    if (!loaded.current) return;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      void storage.write(JSON.stringify(state));
    }, 300);
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, [state]);

  const value = useMemo<MarginsContextValue>(() => {
    const self = selfAuthor(state);
    return {
      ready,
      state,
      self,
      authors: state.authors,
      commentaries: state.commentaries,

      annotationsFor: (range) => annotationsOverlapping(state, range),
      authorFor: (id) => state.authors.find((a) => a.id === id),
      commentaryDocument: (authorId) => buildCommentaryDocument(state, authorId),

      addAnnotation: (input) => setState((s) => dbAdd(s, input).state),
      updateAnnotation: (id, patch) => setState((s) => dbUpdate(s, id, patch)),
      deleteAnnotation: (id) => setState((s) => dbDelete(s, id)),
      renameSelf: (name) => setState((s) => dbRenameSelf(s, name)),

      importCsvRows: (rows) => {
        const result = commitCsvImport(state, rows);
        setState(result.state);
        return result.count;
      },
      importBundle: (parsed) => {
        const outcome = dbImportBundle(state, parsed);
        setState(outcome.state);
        return outcome;
      },
      publishCommentary: (input) => {
        const result = dbPublish(state, input);
        setState(result.state);
        return result.commentary;
      },
      setCommentaryVisible: (id, visible) => setState((s) => dbSetVisible(s, id, visible)),
      removeCommentary: (id) => setState((s) => dbRemoveCommentary(s, id)),
    };
  }, [state, ready]);

  return <MarginsContext.Provider value={value}>{children}</MarginsContext.Provider>;
}

export function useMargins(): MarginsContextValue {
  const ctx = useContext(MarginsContext);
  if (!ctx) throw new Error('useMargins must be used inside a MarginsProvider');
  return ctx;
}

/** Convenience hook: everything annotating the given range, right now. */
export function useAnnotations(range: VerseRange | null): Annotation[] {
  const { state } = useMargins();
  return useMemo(
    () => (range ? annotationsOverlapping(state, range) : []),
    [state, range?.start, range?.end]
  );
}
