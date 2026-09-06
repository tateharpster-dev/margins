import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { HIGHLIGHT_COLORS } from '../domain/model';
import type { Annotation } from '../domain/model';
import { formatRange } from '../domain/range';
import type { VerseRange } from '../domain/range';
import { Button } from './components';
import { colors, radius, spacing, type } from './theme';

export interface EditorTarget {
  range: VerseRange;
  /** Set when editing an existing annotation rather than creating one. */
  annotation?: Annotation;
}

export function AnnotationEditor({
  target, onClose, onSave, onDelete,
}: {
  target: EditorTarget | null;
  onClose: () => void;
  onSave: (input: { range: VerseRange; color: string | null; body: string | null }) => void;
  onDelete?: (id: string) => void;
}) {
  const [body, setBody] = useState('');
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    setBody(target?.annotation?.body ?? '');
    setColor(target?.annotation?.color ?? null);
  }, [target?.annotation?.id, target?.range.start, target?.range.end]);

  if (!target) return null;

  const isEditing = Boolean(target.annotation);
  // Enforces the model's rule: an annotation with neither colour nor body is
  // invisible and unreachable, so saving one is not offered.
  const canSave = color !== null || body.trim().length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.reference}>{formatRange(target.range)}</Text>

            <Text style={styles.label}>Highlight</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
              <Pressable
                onPress={() => setColor(null)}
                style={[styles.swatch, styles.swatchNone, color === null && styles.swatchSelected]}
                accessibilityRole="button"
                accessibilityLabel="No highlight"
              >
                <Text style={styles.swatchNoneText}>None</Text>
              </Pressable>
              {Object.entries(HIGHLIGHT_COLORS).map(([name, hex]) => (
                <Pressable
                  key={name}
                  onPress={() => setColor(name)}
                  style={[styles.swatch, { backgroundColor: hex }, color === name && styles.swatchSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`Highlight ${name}`}
                />
              ))}
            </ScrollView>

            <Text style={styles.label}>Note</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What do you want to remember about this passage?"
              placeholderTextColor={colors.inkFaint}
              style={styles.textArea}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Note text"
            />

            <View style={styles.actions}>
              {isEditing && onDelete ? (
                <Button
                  label="Delete"
                  variant="danger"
                  style={styles.action}
                  onPress={() => {
                    onDelete(target.annotation!.id);
                    onClose();
                  }}
                />
              ) : (
                <Button label="Cancel" variant="secondary" style={styles.action} onPress={onClose} />
              )}
              <Button
                label={isEditing ? 'Save' : 'Add'}
                style={styles.action}
                disabled={!canSave}
                onPress={() => {
                  onSave({ range: target.range, color, body: body.trim() || null });
                  onClose();
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,25,23,0.35)' },
  backdropFill: { flex: 1 },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.rule,
    marginBottom: spacing.sm,
  },
  reference: { ...type.title, fontSize: 20, color: colors.ink },
  label: {
    ...type.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.sm,
  },
  swatchRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  swatch: {
    width: 44,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchNone: { backgroundColor: colors.paperRaised, borderColor: colors.rule },
  swatchNoneText: { ...type.caption, color: colors.inkSoft },
  swatchSelected: { borderColor: colors.ink },
  textArea: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 110,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  action: { flex: 1 },
});
