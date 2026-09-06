import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMargins } from '../src/store/MarginsProvider';
import { authorStats } from '../src/domain/db';
import { AuthorBadge, Button, EmptyState, SectionHeading } from '../src/ui/components';
import { colors, radius, spacing, type } from '../src/ui/theme';

export default function LayersScreen() {
  const router = useRouter();
  const { commentaries, authorFor, state, setCommentaryVisible, removeCommentary } = useMargins();

  const imported = commentaries.filter((c) => c.isImported);

  function confirmRemove(id: string, title: string) {
    const message = `Remove “${title}” and all of its notes from this device? Your own notes are not affected.`;
    if (Platform.OS === 'web') {
      // Alert.alert has no buttons on web, so a removal there would be silent.
      if (globalThis.confirm?.(message)) removeCommentary(id);
      return;
    }
    Alert.alert('Remove commentary', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeCommentary(id) },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionHeading>Shared with you</SectionHeading>

      {imported.length === 0 ? (
        <EmptyState
          title="No commentaries yet"
          body="When someone sends you a .margins file, import it from Settings and their notes will appear beside the text here."
        />
      ) : (
        imported.map((commentary) => {
          const author = authorFor(commentary.authorId);
          const stats = authorStats(state, commentary.authorId);
          if (!author) return null;
          return (
            <View key={commentary.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <AuthorBadge name={author.displayName} color={author.color} size={34} />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>{commentary.title}</Text>
                  <Text style={styles.cardMeta}>
                    {author.displayName}
                    {stats ? ` · ${stats.noteCount} notes across ${stats.bookCount} books` : ''}
                  </Text>
                </View>
                <Switch
                  value={commentary.isVisible}
                  onValueChange={(v) => setCommentaryVisible(commentary.id, v)}
                  accessibilityLabel={`Show ${commentary.title} while reading`}
                />
              </View>

              {commentary.description ? (
                <Text style={styles.description}>{commentary.description}</Text>
              ) : null}

              <View style={styles.cardActions}>
                <Pressable onPress={() => router.push(`/commentary/${author.id}`)}>
                  <Text style={styles.link}>Read all of it</Text>
                </Pressable>
                <Pressable onPress={() => confirmRemove(commentary.id, commentary.title)}>
                  <Text style={[styles.link, styles.linkDanger]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <Button
        label="Import a commentary or CSV"
        variant="secondary"
        onPress={() => router.push('/import')}
        style={styles.importButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardHeaderText: { flex: 1, gap: 2 },
  cardTitle: { ...type.sectionTitle, color: colors.ink },
  cardMeta: { ...type.caption, color: colors.inkSoft },
  description: { ...type.body, color: colors.inkSoft, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  link: { ...type.body, color: colors.accent, fontWeight: '600' },
  linkDanger: { color: colors.danger },
  importButton: { marginTop: spacing.md },
});
