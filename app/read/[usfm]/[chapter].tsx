import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBookByUsfm } from '../../../src/domain/canon';
import { getChapter } from '../../../src/bible/text';
import { decodeVerseId, encodeVerseId } from '../../../src/domain/verseId';
import type { VerseId } from '../../../src/domain/verseId';
import { contains, formatRange, makeRange } from '../../../src/domain/range';
import { HIGHLIGHT_COLORS } from '../../../src/domain/model';
import type { Annotation } from '../../../src/domain/model';
import { useMargins } from '../../../src/store/MarginsProvider';
import { AnnotationEditor } from '../../../src/ui/AnnotationEditor';
import type { EditorTarget } from '../../../src/ui/AnnotationEditor';
import { AuthorBadge, EmptyState } from '../../../src/ui/components';
import { colors, radius, serifFamily, spacing, type } from '../../../src/ui/theme';

export default function ChapterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ usfm: string; chapter: string; highlight?: string }>();
  const { annotationsFor, authorFor, self, addAnnotation, updateAnnotation, deleteAnnotation } =
    useMargins();

  const book = getBookByUsfm(params.usfm ?? '');
  const chapter = Number(params.chapter ?? 1);

  const [selection, setSelection] = useState<VerseId[]>([]);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);

  const verses = useMemo(
    () => (book ? getChapter(book, chapter) : []),
    [book?.usfm, chapter]
  );

  const chapterRange = useMemo(() => {
    if (!book || verses.length === 0) return null;
    return {
      start: encodeVerseId(book.number, chapter, 1),
      end: encodeVerseId(book.number, chapter, verses.length),
    };
  }, [book?.usfm, chapter, verses.length]);

  const annotations = chapterRange ? annotationsFor(chapterRange) : [];

  /** Verse id -> the annotations touching it, so each row renders in one pass. */
  const byVerse = useMemo(() => {
    const map = new Map<VerseId, Annotation[]>();
    for (const verse of verses) {
      const hits = annotations.filter((a) => contains(a.range, verse.id));
      if (hits.length > 0) map.set(verse.id, hits);
    }
    return map;
  }, [annotations, verses]);

  /** Notes render under the first verse of their range that is on this page. */
  const notesStartingAt = useMemo(() => {
    const map = new Map<VerseId, Annotation[]>();
    if (!chapterRange) return map;
    for (const a of annotations) {
      if (a.body === null) continue;
      const anchor = Math.max(a.range.start, chapterRange.start);
      map.set(anchor, [...(map.get(anchor) ?? []), a]);
    }
    return map;
  }, [annotations, chapterRange]);

  const highlightRange = useMemo(() => {
    if (!params.highlight) return null;
    const [start, end] = params.highlight.split('-').map(Number);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return makeRange(start, end);
  }, [params.highlight]);

  const toggleVerse = useCallback((id: VerseId) => {
    setSelection((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id].sort((a, b) => a - b)
    );
  }, []);

  if (!book) {
    return <EmptyState title="Book not found" body="That reference does not match any book." />;
  }

  const selectionRange =
    selection.length > 0 ? makeRange(selection[0], selection[selection.length - 1]) : null;

  const lastChapter = book.verseCounts.length;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `${book.name} ${chapter}` }} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (selectionRange ? 140 : spacing.xxl) },
        ]}
      >
        <Text style={styles.chapterHeading}>
          {book.name} {lastChapter > 1 ? chapter : ''}
        </Text>

        {verses.map((verse) => {
          const hits = byVerse.get(verse.id) ?? [];
          const highlight = hits.find((a) => a.color !== null)?.color ?? null;
          const isSelected = selection.includes(verse.id);
          const isJumpTarget = highlightRange ? contains(highlightRange, verse.id) : false;
          const others = hits.filter((a) => a.authorId !== self.id);
          const notes = notesStartingAt.get(verse.id) ?? [];

          return (
            <View key={verse.id}>
              <Pressable
                onPress={() => toggleVerse(verse.id)}
                style={({ pressed }) => [
                  styles.verseRow,
                  isJumpTarget && styles.verseJumpTarget,
                  isSelected && styles.verseSelected,
                  pressed && styles.versePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${book.name} ${chapter} verse ${verse.number}`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={styles.verseNumber}>{verse.number}</Text>
                <Text
                  style={[
                    styles.verseText,
                    highlight ? { backgroundColor: HIGHLIGHT_COLORS[highlight] } : null,
                  ]}
                >
                  {verse.text}
                </Text>
                {others.length > 0 ? (
                  <View style={styles.marginMarks}>
                    {dedupeAuthors(others).map((authorId) => {
                      const author = authorFor(authorId);
                      if (!author) return null;
                      return (
                        <AuthorBadge
                          key={authorId}
                          name={author.displayName}
                          color={author.color}
                          size={18}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </Pressable>

              {notes.map((note) => {
                const author = authorFor(note.authorId);
                const isMine = note.authorId === self.id;
                return (
                  <Pressable
                    key={note.id}
                    style={[styles.note, { borderLeftColor: author?.color ?? colors.accent }]}
                    onPress={() =>
                      isMine ? setEditorTarget({ range: note.range, annotation: note }) : undefined
                    }
                    accessibilityRole={isMine ? 'button' : 'text'}
                  >
                    <View style={styles.noteHeader}>
                      <Text style={styles.noteAuthor}>
                        {isMine ? 'You' : (author?.displayName ?? 'Unknown')}
                      </Text>
                      <Text style={styles.noteRef}>{formatRange(note.range)}</Text>
                    </View>
                    <Text style={styles.noteBody}>{note.body}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        <View style={styles.pager}>
          <Pressable
            disabled={chapter <= 1}
            onPress={() => router.replace(`/read/${book.usfm}/${chapter - 1}`)}
            style={[styles.pagerButton, chapter <= 1 && styles.pagerDisabled]}
          >
            <Text style={styles.pagerText}>‹ Previous</Text>
          </Pressable>
          <Pressable
            disabled={chapter >= lastChapter}
            onPress={() => router.replace(`/read/${book.usfm}/${chapter + 1}`)}
            style={[styles.pagerButton, chapter >= lastChapter && styles.pagerDisabled]}
          >
            <Text style={styles.pagerText}>Next ›</Text>
          </Pressable>
        </View>
      </ScrollView>

      {selectionRange ? (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.actionBarLabel}>{formatRange(selectionRange)}</Text>
          <View style={styles.swatchRow}>
            {Object.entries(HIGHLIGHT_COLORS).map(([name, hex]) => (
              <Pressable
                key={name}
                style={[styles.swatch, { backgroundColor: hex }]}
                accessibilityRole="button"
                accessibilityLabel={`Highlight ${name}`}
                onPress={() => {
                  addAnnotation({ range: selectionRange, color: name });
                  setSelection([]);
                }}
              />
            ))}
          </View>
          <View style={styles.actionBarButtons}>
            <Pressable
              style={styles.secondaryAction}
              onPress={() => {
                setEditorTarget({ range: selectionRange });
                setSelection([]);
              }}
            >
              <Text style={styles.secondaryActionText}>Add a note</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => setSelection([])}>
              <Text style={styles.secondaryActionText}>Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <AnnotationEditor
        target={editorTarget}
        onClose={() => setEditorTarget(null)}
        onDelete={deleteAnnotation}
        onSave={({ range, color, body }) => {
          if (editorTarget?.annotation) {
            updateAnnotation(editorTarget.annotation.id, { color, body });
          } else {
            addAnnotation({ range, color, body });
          }
        }}
      />
    </View>
  );
}

function dedupeAuthors(annotations: readonly Annotation[]): string[] {
  return [...new Set(annotations.map((a) => a.authorId))];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  chapterHeading: {
    fontFamily: serifFamily,
    fontSize: 30,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  versePressed: { opacity: 0.6 },
  verseSelected: { backgroundColor: colors.accentSoft },
  verseJumpTarget: { backgroundColor: '#F5EFE1' },
  verseNumber: {
    ...type.verseNumber,
    color: colors.inkFaint,
    width: 22,
    textAlign: 'right',
    paddingTop: 7,
  },
  verseText: {
    flex: 1,
    fontFamily: serifFamily,
    ...type.scripture,
    color: colors.ink,
  },
  marginMarks: { gap: 2, paddingTop: 5 },
  note: {
    marginLeft: 30,
    marginVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    backgroundColor: colors.paperRaised,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  noteAuthor: { ...type.caption, fontWeight: '700', color: colors.ink },
  noteRef: { ...type.caption, color: colors.inkFaint },
  noteBody: { ...type.body, color: colors.inkSoft },
  pager: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  pagerButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  pagerDisabled: { opacity: 0.3 },
  pagerText: { ...type.body, color: colors.accent, fontWeight: '600' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paperRaised,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  actionBarLabel: { ...type.sectionTitle, color: colors.ink },
  swatchRow: { flexDirection: 'row', gap: spacing.sm },
  swatch: { flex: 1, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.rule },
  actionBarButtons: { flexDirection: 'row', gap: spacing.md },
  secondaryAction: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  secondaryActionText: { ...type.body, color: colors.accent, fontWeight: '600' },
});
