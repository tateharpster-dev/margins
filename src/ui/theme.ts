/**
 * Visual language: a printed page, not a chat app.
 *
 * The product is competing with a physical Bible full of a grandfather's
 * handwriting, so the reader is warm paper and serif type, and the chrome stays
 * out of the way. Annotations are the only saturated colour on the screen.
 */
import { Platform } from 'react-native';

export const colors = {
  paper: '#FBF8F3',
  paperRaised: '#FFFFFF',
  ink: '#1C1917',
  inkSoft: '#57534E',
  inkFaint: '#A8A29E',
  rule: '#E7E1D8',
  accent: '#8A6D3B',
  accentSoft: '#F2E9DA',
  danger: '#B91C1C',
  success: '#15803D',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const type = {
  scripture: { fontSize: 18, lineHeight: 30 },
  verseNumber: { fontSize: 11, lineHeight: 16 },
  title: { fontSize: 26, fontWeight: '600' as const },
  sectionTitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 17 },
};

/** Platform-appropriate serif stack for scripture. */
export const serifFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, "Times New Roman", serif',
  default: 'serif',
});
