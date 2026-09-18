import type { ColorSchemeName } from 'react-native';

export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentPressed: string;
  accentMuted: string;
  accentText: string;
  danger: string;
  dangerMuted: string;
  success: string;
  warning: string;
  overlay: string;
};

/**
 * Palette: a calm ink/indigo scheme on a slightly warm neutral. Indigo reads as
 * "notebook/study" rather than corporate blue, holds up in dark mode, and keeps the
 * accent distinguishable from the danger/warning hues.
 */
const light: ThemeColors = {
  background: '#FBFAF9',
  surface: '#F3F2F0',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EDEBE8',
  border: '#E4E1DC',
  borderStrong: '#CFCBC4',
  text: '#1A1A1D',
  textMuted: '#63605C',
  textFaint: '#918D87',
  accent: '#4F46E5',
  accentPressed: '#4338CA',
  accentMuted: '#EEF0FF',
  accentText: '#FFFFFF',
  danger: '#C2412D',
  dangerMuted: '#FBEDEA',
  success: '#15803D',
  warning: '#B45309',
  overlay: 'rgba(20, 18, 16, 0.45)',
};

const dark: ThemeColors = {
  background: '#121114',
  surface: '#1C1B1F',
  surfaceRaised: '#26242A',
  surfaceSunken: '#0D0C0F',
  border: '#302E35',
  borderStrong: '#443F4B',
  text: '#F4F2F7',
  textMuted: '#A9A4B2',
  textFaint: '#7C7788',
  accent: '#A5B4FC',
  accentPressed: '#C7D2FE',
  accentMuted: '#26264A',
  accentText: '#1E1B4B',
  danger: '#F0907F',
  dangerMuted: '#3A2320',
  success: '#6EE7A0',
  warning: '#E5B567',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 9999,
} as const;

/** Elevation as CSS `boxShadow` strings (never legacy shadow/elevation props). */
export const shadows = {
  none: 'none',
  card: '0 1px 2px rgba(24, 20, 16, 0.06)',
  raised: '0 4px 14px rgba(24, 20, 16, 0.10)',
  overlay: '0 12px 32px rgba(24, 20, 16, 0.18)',
} as const;

/**
 * Motion tokens. Durations stay under 300ms; every animated value is transform/opacity
 * so it runs on the UI thread.
 */
export const motion = {
  press: 120,
  fast: 160,
  base: 240,
  slow: 320,
  spring: { duration: 320, dampingRatio: 0.82 },
  springSnappy: { duration: 220, dampingRatio: 0.9 },
} as const;

/** Locked type ramp — Plus Jakarta Sans, bundled so Android system fonts never leak in. */
export const fontFamily = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
} as const;

export function getTheme(scheme: ColorSchemeName): ThemeColors {
  return scheme === 'dark' ? dark : light;
}

export const palettes = { light, dark } as const;
