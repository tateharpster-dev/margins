import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMargins } from '../src/store/MarginsProvider';
import { annotationsByAuthor } from '../src/domain/db';
import { buildBundle, bundleFilename, serializeBundle } from '../src/domain/bundle';
import { exportTextFile } from '../src/store/files';
import { KJV } from '../src/bible/text';
import { Button, Card, SectionHeading } from '../src/ui/components';
import { colors, radius, spacing, type } from '../src/ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { self, state, commentaries, renameSelf, publishCommentary } = useMargins();

  const [name, setName] = useState(self.displayName);
  const mine = commentaries.find((c) => c.authorId === self.id && !c.isImported);
  const [title, setTitle] = useState(mine?.title ?? `${self.displayName}'s Notes`);
  const [description, setDescription] = useState(mine?.description ?? '');
  const [status, setStatus] = useState<string | null>(null);

  const myAnnotations = annotationsByAuthor(state, self.id);

  async function shareCommentary() {
    if (myAnnotations.length === 0) {
      setStatus('There is nothing to share yet — write a note first.');
      return;
    }
    const commentary = publishCommentary({ title, description: description.trim() || null });
    const bundle = buildBundle({ ...self, displayName: name.trim() || self.displayName }, commentary, myAnnotations);
    const result = await exportTextFile(bundleFilename(commentary), serializeBundle(bundle));
    setStatus(
      result.ok
        ? `Shared “${commentary.title}” — version ${commentary.version}, ${myAnnotations.length} notes.`
        : (result.message ?? 'Could not share the file.')
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <SectionHeading>Your name</SectionHeading>
        <Text style={styles.help}>
          This is the name that appears beside your notes when someone else reads them.
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={() => renameSelf(name)}
          placeholder="Your name"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          accessibilityLabel="Your name"
        />
      </View>

      <View style={styles.section}>
        <SectionHeading>Share your commentary</SectionHeading>
        <Text style={styles.help}>
          This gathers everything you have written into one file. Send it to someone and your notes
          will appear beside the text in their copy of Margins, with your name on them.
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          accessibilityLabel="Commentary title"
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="A note to whoever reads this (optional)"
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, styles.textArea]}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Commentary description"
        />

        <Card>
          <Text style={styles.stat}>
            {myAnnotations.length} {myAnnotations.length === 1 ? 'note' : 'notes'} will be included
            {mine ? ` · last shared as version ${mine.version}` : ''}
          </Text>
        </Card>

        <Button label="Share commentary" onPress={() => void shareCommentary()} />
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      <View style={styles.section}>
        <SectionHeading>Import</SectionHeading>
        <Button
          label="Import a commentary or CSV"
          variant="secondary"
          onPress={() => router.push('/import')}
        />
      </View>

      <View style={styles.section}>
        <SectionHeading>Translation</SectionHeading>
        <Card>
          <Text style={styles.stat}>
            {KJV.name} ({KJV.abbreviation}) · {KJV.license}
          </Text>
          <Text style={styles.help}>
            Your notes are attached to verses, not to a particular translation, so they will carry
            over unchanged when other translations are added.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  help: { ...type.caption, color: colors.inkSoft, lineHeight: 18 },
  input: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  textArea: { minHeight: 80 },
  stat: { ...type.body, color: colors.ink },
  status: { ...type.caption, color: colors.success },
});
