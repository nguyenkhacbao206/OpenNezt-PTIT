/**
 * Design System — single source of truth for colors, spacing, typography and
 * radii. NativeWind classes cover most styling, but this object is used where
 * we need raw values (navigation theme, StatusBar, imperative styles).
 *
 * Keep the color palette in sync with `tailwind.config.js`.
 */

export const colors = {
  primary: '#2563eb',
  primaryLight: '#60a5fa',
  primaryDark: '#1d4ed8',
  secondary: '#7c3aed',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#f59e0b',
  muted: '#6b7280',
  background: '#f9fafb',
  surface: '#ffffff',
  text: '#111827',
  textInverse: '#ffffff',
  border: '#e5e7eb',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 9999,
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;

export const theme = { colors, spacing, fontSize, radius } as const;
export type Theme = typeof theme;
