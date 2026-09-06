import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMargins } from '../../src/store/MarginsProvider';
import { authorStats } from '../../src/domain/db';
import { getBookByNumber } from '../../src/domain/canon';
import { decodeVerseId } from '../../src/domain/verseId';
import { previewText } from '../../src/bible/text';
import { AuthorBadge, EmptyState, SectionHeading } from '../../src/ui/components';
import { colors, radius, serifFamily, spacing, type } from '../../src/ui/theme';

/**
 * The consolidated commentary: one person's notes as a continuous document,
 * in canonical order. This is the artifact the product is really about.
 */
export default function CommentaryScreen() {
  const router = useRouter();
  const { authorId } = useLocalSearchParams<{ authorId: string }>();
  const { authorFor, commentaryDocument, self, state, commentaries } = useMargins();

  const author = authorFor(authorId ?? '');
  const sections = useMemo(
    () => (author ? commentaryDocument(author.id) : []),
    [author?.id, state]
  );
  const stats = author ? authorStats(state, author.id) : null;
  const commentary = commentaries.find((c) => c.authorId === author?.id);
  const isMine = author?.id === self.id;

  if (!author) {
    return <EmptyState title="Not found" body="That person is no longer on this device." />;
  }

  const title = commentary?.title ?? (isMine ? 'Your notes' : `${author.displayName}'s notes`);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: isMine ? 'Your notes' : author.displayName }} />

      <View style={styles.header}>
        <AuthorBadge name={author.displayName} color={author.color} size={46} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {stats ? (
            <Text style={styles.meta}>
              {stats.noteCount} {stats.noteCount === 1 ? 'note' : 'notes'} ·{' '}
              {stats.highlightCount} {stats.highlightCount === 1 ? 'highlight' : 'highlights'} ·{' '}
              {stats.bookCount} {stats.bookCount === 1 ? 'book' : 'books'}
            </Text>
          ) : null}
        </View>
      </View>

      {commentary?.description ? (
        <Text style={styles.preface}>{commentary.description}</Text>
      ) : null}

      {sections.length === 0 ? (
        <EmptyState
          title={isMine ? 'Nothing written yet' : 'Nothing here yet'}
          body={
            isMine
              ? 'Highlight a verse while reading and add a note. Everything you write is collected here, in order.'
              : 'This commentary has no notes in it.'
          }
        />
      ) : (
        sections.map((section) => (
          <View key={section.bookNumber} style={styles.section}>
            <SectionHeading>{section.bookName}</SectionHeading>
            {section.entries.map(({ annotation, label }) => {
              const { chapter } = decodeVerseId(annotation.range.start);
              const usfm = getBookByNumber(section.bookNumber)?.usfm;
              return (
                <Pressable
                  key={annotation.id}
                  style={styles.entry}
                  onPress={() =>
                    usfm
                      ? router.push(
                          `/read/${usfm}/${chapter}?highlight=${annotation.range.start}-${annotation.range.end}`
                        )
                      : undefined
                  }
                >
                  <Text style={styles.entryRef}>{label}</Text>
                  <Text style={styles.entryScripture} numberOfLines={2}>
                    {previewText(annotation.range, 160)}
                  </Text>
                  {annotation.body ? (
                    <Text style={styles.entryBody}>{annotation.body}</Text>
                  ) : (
                    <Text style={styles.entryHighlightOnly}>Highlighted, no note</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 2 },
  title: { ...type.title, fontSize: 22, color: colors.ink },
  meta: { ...type.caption, color: colors.inkSoft },
  preface: {
    ...type.body,
    color: colors.inkSoft,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    borderLeftColor: colors.rule,
    paddingLeft: spacing.md,
  },
  section: { gap: spacing.sm },
  entry: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  entryRef: { ...type.caption, fontWeight: '700', color: colors.accent },
  entryScripture: { fontFamily: serifFamily, ...type.caption, lineHeight: 20, color: colors.inkFaint },
  entryBody: { ...type.body, color: colors.ink, marginTop: 2 },
  entryHighlightOnly: { ...type.caption, color: colors.inkFaint, fontStyle: 'italic' },
});
