import React, { useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NEW_TESTAMENT, OLD_TESTAMENT } from '../src/domain/canon';
import type { BookMeta } from '../src/domain/canon';
import { parseReference, describeReferenceError } from '../src/domain/reference';
import { decodeVerseId } from '../src/domain/verseId';
import { useMargins } from '../src/store/MarginsProvider';
import { AuthorBadge, SectionHeading } from '../src/ui/components';
import { colors, radius, spacing, type } from '../src/ui/theme';

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authors, self, state } = useMargins();
  const [jump, setJump] = useState('');
  const [jumpError, setJumpError] = useState<string | null>(null);

  const otherAuthors = useMemo(() => authors.filter((a) => !a.isSelf), [authors]);
  // A highlight with no body is not a note, so the two are counted separately
  // rather than lumped together under a label that would overstate the notes.
  const live = state.annotations.filter((a) => a.deletedAt === null && a.authorId === self.id);
  const noteCount = live.filter((a) => a.body !== null).length;
  const highlightCount = live.filter((a) => a.color !== null).length;

  function go(book: BookMeta, chapter = 1) {
    router.push(`/read/${book.usfm}/${chapter}`);
  }

  function submitJump() {
    const trimmed = jump.trim();
    if (!trimmed) return;
    const result = parseReference(trimmed);
    if (!result.ok) {
      setJumpError(describeReferenceError(result.error));
      return;
    }
    setJumpError(null);
    setJump('');
    const { chapter } = decodeVerseId(result.value.range.start);
    router.push(
      `/read/${result.value.book.usfm}/${chapter}?highlight=${result.value.range.start}-${result.value.range.end}`
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchRow}>
        <TextInput
          value={jump}
          onChangeText={(t) => {
            setJump(t);
            if (jumpError) setJumpError(null);
          }}
          onSubmitEditing={submitJump}
          placeholder="Go to a passage — try “John 3:16”"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          accessibilityLabel="Go to a passage"
        />
      </View>
      {jumpError ? <Text style={styles.error}>{jumpError}</Text> : null}

      <Pressable style={styles.searchLink} onPress={() => router.push('/search')}>
        <Text style={styles.searchLinkText}>Search the whole Bible for a word or phrase</Text>
      </Pressable>

      <View style={styles.quickRow}>
        <QuickAction
          label="Your notes"
          detail={summarise(noteCount, highlightCount)}
          onPress={() => router.push(`/commentary/${self.id}`)}
        />
        <QuickAction
          label="Commentaries"
          detail={
            otherAuthors.length === 0
              ? 'None yet'
              : otherAuthors.length === 1
                ? '1 person'
                : `${otherAuthors.length} people`
          }
          onPress={() => router.push('/layers')}
        />
      </View>

      {otherAuthors.length > 0 ? (
        <View style={styles.section}>
          <SectionHeading>Reading alongside</SectionHeading>
          <View style={styles.badgeRow}>
            {otherAuthors.map((a) => (
              <Pressable
                key={a.id}
                style={styles.authorChip}
                onPress={() => router.push(`/commentary/${a.id}`)}
              >
                <AuthorBadge name={a.displayName} color={a.color} size={22} />
                <Text style={styles.authorChipText}>{a.displayName}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <BookGrid title="Old Testament" books={OLD_TESTAMENT} onSelect={go} />
      <BookGrid title="New Testament" books={NEW_TESTAMENT} onSelect={go} />

      <Pressable style={styles.settingsLink} onPress={() => router.push('/settings')}>
        <Text style={styles.settingsLinkText}>Settings, import and sharing</Text>
      </Pressable>
    </ScrollView>
  );
}

/** "3 notes · 1 highlight", or an invitation when there is nothing yet. */
function summarise(notes: number, highlights: number): string {
  if (notes === 0 && highlights === 0) return 'Nothing yet';
  const parts: string[] = [];
  if (notes > 0) parts.push(`${notes} ${notes === 1 ? 'note' : 'notes'}`);
  if (highlights > 0) parts.push(`${highlights} ${highlights === 1 ? 'highlight' : 'highlights'}`);
  return parts.join(' · ');
}

function QuickAction({
  label, detail, onPress,
}: { label: string; detail: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickDetail}>{detail}</Text>
    </Pressable>
  );
}

function BookGrid({
  title, books, onSelect,
}: { title: string; books: readonly BookMeta[]; onSelect: (b: BookMeta) => void }) {
  return (
    <View style={styles.section}>
      <SectionHeading>{title}</SectionHeading>
      <View style={styles.grid}>
        {books.map((book) => (
          <Pressable key={book.usfm} style={styles.bookTile} onPress={() => onSelect(book)}>
            <Text style={styles.bookName} numberOfLines={2}>
              {book.name}
            </Text>
            <Text style={styles.bookChapters}>
              {book.verseCounts.length === 1 ? '1 ch' : `${book.verseCounts.length} ch`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.lg },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  error: { ...type.caption, color: colors.danger },
  searchLink: { paddingVertical: spacing.xs },
  searchLinkText: { ...type.body, color: colors.accent },
  quickRow: { flexDirection: 'row', gap: spacing.md },
  quickAction: {
    flex: 1,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  quickLabel: { ...type.sectionTitle, color: colors.ink },
  quickDetail: { ...type.caption, color: colors.inkSoft },
  section: { gap: spacing.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  authorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  authorChipText: { ...type.caption, color: colors.ink, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bookTile: {
    minWidth: 104,
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  bookName: { ...type.body, color: colors.ink, fontWeight: '600' },
  bookChapters: { ...type.caption, color: colors.inkFaint },
  settingsLink: { paddingVertical: spacing.md, alignItems: 'center' },
  settingsLinkText: { ...type.body, color: colors.accent },
});
