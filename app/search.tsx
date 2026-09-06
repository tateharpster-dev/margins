import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { searchVerses } from '../src/bible/text';
import type { SearchHit } from '../src/bible/text';
import { decodeVerseId } from '../src/domain/verseId';
import { getBookByNumber } from '../src/domain/canon';
import { EmptyState } from '../src/ui/components';
import { colors, radius, serifFamily, spacing, type } from '../src/ui/theme';

const RESULT_LIMIT = 200;

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [searching, setSearching] = useState(false);

  const results = useMemo<SearchHit[]>(
    () => (submitted.length >= 2 ? searchVerses(submitted, { limit: RESULT_LIMIT }) : []),
    [submitted]
  );

  function run() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    // Yield a frame so the spinner paints before the scan blocks the thread.
    setTimeout(() => {
      setSubmitted(trimmed);
      setSearching(false);
    }, 0);
  }

  function open(hit: SearchHit) {
    const { book, chapter } = decodeVerseId(hit.id);
    const meta = getBookByNumber(book);
    if (!meta) return;
    router.push(`/read/${meta.usfm}/${chapter}?highlight=${hit.id}-${hit.id}`);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={run}
          placeholder="Search the King James Version"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search text"
        />
      </View>

      {searching ? <ActivityIndicator style={styles.spinner} color={colors.accent} /> : null}

      {submitted && !searching ? (
        <Text style={styles.count}>
          {results.length === 0
            ? `No verses contain “${submitted}”.`
            : results.length >= RESULT_LIMIT
              ? `First ${RESULT_LIMIT} verses containing “${submitted}”`
              : `${results.length} ${results.length === 1 ? 'verse' : 'verses'} containing “${submitted}”`}
        </Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          submitted || searching ? null : (
            <EmptyState
              title="Search the whole Bible"
              body="Type a word or phrase. To go straight to a passage instead, use the box on the home screen."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable style={styles.hit} onPress={() => open(item)}>
            <Text style={styles.hitRef}>{item.reference}</Text>
            <Text style={styles.hitText} numberOfLines={3}>
              {item.text}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  searchBar: { padding: spacing.lg, paddingBottom: spacing.sm },
  input: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  spinner: { marginTop: spacing.lg },
  count: { ...type.caption, color: colors.inkSoft, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  hit: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  hitRef: { ...type.caption, fontWeight: '700', color: colors.accent },
  hitText: { fontFamily: serifFamily, ...type.body, lineHeight: 24, color: colors.ink },
});
