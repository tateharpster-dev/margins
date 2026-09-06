import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from './theme';
import { initialsFor } from '../domain/model';

export function Button({
  label, onPress, variant = 'primary', disabled, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const background =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : 'transparent';
  const border = variant === 'secondary' ? colors.rule : 'transparent';
  const text = variant === 'secondary' ? colors.ink : '#FFFFFF';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

export function AuthorBadge({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color, width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.badgeText, { fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>
    </View>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontWeight: '700' },
  sectionHeading: {
    ...type.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.inkFaint,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.lg,
  },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { ...type.sectionTitle, color: colors.ink, textAlign: 'center' },
  emptyBody: { ...type.body, color: colors.inkSoft, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.rule, marginVertical: spacing.md },
});
