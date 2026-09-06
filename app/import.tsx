import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { previewImport, failuresToCsv, CSV_TEMPLATE } from '../src/domain/csv';
import type { ImportPreview } from '../src/domain/csv';
import { parseBundle } from '../src/domain/bundle';
import type { BundleImportOutcome } from '../src/domain/db';
import { useMargins } from '../src/store/MarginsProvider';
import { exportTextFile, pickTextFile } from '../src/store/files';
import { Button, Card, SectionHeading } from '../src/ui/components';
import { colors, radius, spacing, type } from '../src/ui/theme';

type Stage =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'csv-preview'; filename: string; preview: ImportPreview }
  | { kind: 'csv-done'; count: number }
  | { kind: 'bundle-done'; outcome: BundleImportOutcome; skipped: number };

export default function ImportScreen() {
  const router = useRouter();
  const { importCsvRows, importBundle } = useMargins();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  async function choose() {
    setBusy(true);
    try {
      const picked = await pickTextFile();
      if (!picked) return;

      const looksLikeBundle =
        picked.name.endsWith('.margins') || picked.contents.trimStart().startsWith('{');

      if (looksLikeBundle) {
        const parsed = parseBundle(picked.contents);
        if (!parsed.ok) {
          setStage({ kind: 'error', message: parsed.error });
          return;
        }
        const outcome = importBundle(parsed.value);
        setStage({ kind: 'bundle-done', outcome, skipped: parsed.value.skipped.length });
        return;
      }

      const preview = previewImport(picked.contents);
      if (preview.missingColumns.length > 0) {
        setStage({
          kind: 'error',
          message: `That file is missing a ${preview.missingColumns.join(' column and a ')} column. The first row should name the columns.`,
        });
        return;
      }
      setStage({ kind: 'csv-preview', filename: picked.name, preview });
    } catch (error) {
      setStage({
        kind: 'error',
        message: error instanceof Error ? error.message : 'That file could not be read.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {stage.kind === 'idle' ? (
        <>
          <Text style={styles.lead}>
            Bring in a commentary someone shared with you, or a spreadsheet of notes you have
            already written somewhere else.
          </Text>

          <Card>
            <SectionHeading>A shared commentary</SectionHeading>
            <Text style={styles.body}>
              A <Text style={styles.mono}>.margins</Text> file from someone else. Their notes will
              appear beside the text, with their name on them.
            </Text>
          </Card>

          <Card>
            <SectionHeading>A spreadsheet of notes</SectionHeading>
            <Text style={styles.body}>
              A CSV with a <Text style={styles.mono}>reference</Text> column and a{' '}
              <Text style={styles.mono}>note</Text> or <Text style={styles.mono}>color</Text>{' '}
              column. References can be written however you write them — “John 3:16”, “Romans 8”,
              “1 Cor 13:4-7”.
            </Text>
            <Pressable
              onPress={() => void exportTextFile('margins-template.csv', CSV_TEMPLATE, 'text/csv')}
            >
              <Text style={styles.link}>Download a template</Text>
            </Pressable>
          </Card>

          <Button label={busy ? 'Opening…' : 'Choose a file'} onPress={() => void choose()} disabled={busy} />
        </>
      ) : null}

      {stage.kind === 'error' ? (
        <>
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>That file could not be imported</Text>
            <Text style={styles.body}>{stage.message}</Text>
          </Card>
          <Button label="Try another file" onPress={() => setStage({ kind: 'idle' })} />
        </>
      ) : null}

      {stage.kind === 'csv-preview' ? (
        <CsvPreview
          preview={stage.preview}
          filename={stage.filename}
          onCancel={() => setStage({ kind: 'idle' })}
          onConfirm={() => {
            const count = importCsvRows(stage.preview.rows);
            setStage({ kind: 'csv-done', count });
          }}
        />
      ) : null}

      {stage.kind === 'csv-done' ? (
        <>
          <Card>
            <Text style={styles.doneTitle}>
              {stage.count} {stage.count === 1 ? 'note' : 'notes'} imported
            </Text>
            <Text style={styles.body}>
              They are yours, and they now appear beside the passages they belong to.
            </Text>
          </Card>
          <Button label="Done" onPress={() => router.back()} />
        </>
      ) : null}

      {stage.kind === 'bundle-done' ? (
        <>
          <Card>
            <Text style={styles.doneTitle}>
              {stage.outcome.isUpdate ? 'Commentary updated' : 'Commentary imported'}
            </Text>
            <Text style={styles.body}>
              “{stage.outcome.commentaryTitle}” by {stage.outcome.authorName}.
              {stage.outcome.added > 0 ? ` ${stage.outcome.added} new notes.` : ''}
              {stage.outcome.updated > 0 ? ` ${stage.outcome.updated} updated.` : ''}
              {stage.outcome.keptDeleted > 0
                ? ` ${stage.outcome.keptDeleted} you had deleted were left deleted.`
                : ''}
              {stage.skipped > 0 ? ` ${stage.skipped} could not be read and were skipped.` : ''}
            </Text>
          </Card>
          <Button label="Done" onPress={() => router.back()} />
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * Phase one of the import: show exactly what will and will not arrive, and
 * write nothing until the user says so.
 */
function CsvPreview({
  preview, filename, onCancel, onConfirm,
}: {
  preview: ImportPreview;
  filename: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { rows, failures } = preview;

  return (
    <>
      <Text style={styles.lead}>{filename}</Text>

      <Card>
        <Text style={styles.doneTitle}>
          {rows.length} of {preview.totalDataRows} rows are ready
        </Text>
        {failures.length > 0 ? (
          <Text style={styles.warning}>
            {failures.length} {failures.length === 1 ? 'row' : 'rows'} could not be matched to a
            passage and will not be imported.
          </Text>
        ) : (
          <Text style={styles.body}>Every row matched a passage.</Text>
        )}
      </Card>

      {rows.length > 0 ? (
        <View style={styles.section}>
          <SectionHeading>What will be imported</SectionHeading>
          {rows.slice(0, 8).map((row) => (
            <View key={row.line} style={styles.previewRow}>
              <Text style={styles.previewRef}>{row.label}</Text>
              {row.note ? (
                <Text style={styles.previewNote} numberOfLines={2}>
                  {row.note}
                </Text>
              ) : (
                <Text style={styles.previewHighlightOnly}>Highlight only</Text>
              )}
            </View>
          ))}
          {rows.length > 8 ? (
            <Text style={styles.more}>and {rows.length - 8} more</Text>
          ) : null}
        </View>
      ) : null}

      {failures.length > 0 ? (
        <View style={styles.section}>
          <SectionHeading>What will not</SectionHeading>
          {failures.slice(0, 8).map((failure) => (
            <View key={failure.line} style={[styles.previewRow, styles.failureRow]}>
              <Text style={styles.previewRef}>
                Line {failure.line}: {failure.rawReference || '(blank)'}
              </Text>
              <Text style={styles.failureReason}>{failure.reason}</Text>
            </View>
          ))}
          {failures.length > 8 ? (
            <Text style={styles.more}>and {failures.length - 8} more</Text>
          ) : null}
          <Pressable
            onPress={() =>
              void exportTextFile('margins-import-problems.csv', failuresToCsv(failures), 'text/csv')
            }
          >
            <Text style={styles.link}>Download these rows to fix and re-import</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" style={styles.action} onPress={onCancel} />
        <Button
          label={`Import ${rows.length}`}
          style={styles.action}
          disabled={rows.length === 0}
          onPress={onConfirm}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  lead: { ...type.body, color: colors.inkSoft },
  body: { ...type.body, color: colors.inkSoft },
  mono: { fontFamily: 'monospace', color: colors.ink },
  link: { ...type.body, color: colors.accent, fontWeight: '600', marginTop: spacing.sm },
  doneTitle: { ...type.sectionTitle, color: colors.ink, marginBottom: spacing.xs },
  warning: { ...type.body, color: colors.danger },
  errorCard: { borderColor: colors.danger },
  errorTitle: { ...type.sectionTitle, color: colors.danger, marginBottom: spacing.xs },
  section: { gap: spacing.sm },
  previewRow: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  failureRow: { borderColor: '#E7C3C3' },
  previewRef: { ...type.caption, fontWeight: '700', color: colors.accent },
  previewNote: { ...type.body, color: colors.ink },
  previewHighlightOnly: { ...type.caption, color: colors.inkFaint, fontStyle: 'italic' },
  failureReason: { ...type.caption, color: colors.danger },
  more: { ...type.caption, color: colors.inkFaint, paddingLeft: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  action: { flex: 1 },
});
