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
 * Palette from https://colorhunt.co/palette/0000001f150c412d15e1dcc9
 *   #000000 near-black · #1F150C espresso · #412D15 dark leather · #E1DCC9 parchment
 *
 * A warm, paper-and-leather scheme: parchment surfaces in light mode, espresso in dark
 * mode, with the dark leather brown as the single accent. Light mode keeps the parchment
 * as the page and uses the darker tones for text; dark mode inverts that.
 */
const light: ThemeColors = {
  background: '#F7F4EC',
  surface: '#EFEADF',
  surfaceRaised: '#FDFBF6',
  surfaceSunken: '#E1DCC9',
  border: '#DED7C4',
  borderStrong: '#C4B9A0',
  text: '#1F150C',
  textMuted: '#6B5B45',
  textFaint: '#94856C',
  accent: '#412D15',
  accentPressed: '#2E1F0E',
  accentMuted: '#E8E1D0',
  accentText: '#FDFBF6',
  danger: '#A3341F',
  dangerMuted: '#F3E2DC',
  success: '#4A6B2A',
  warning: '#8A5A12',
  overlay: 'rgba(31, 21, 12, 0.45)',
};

const dark: ThemeColors = {
  background: '#0B0906',
  surface: '#1F150C',
  surfaceRaised: '#2A1D11',
  surfaceSunken: '#000000',
  border: '#3A2A18',
  borderStrong: '#57422A',
  text: '#E1DCC9',
  textMuted: '#A99C82',
  textFaint: '#7A6E58',
  accent: '#E1DCC9',
  accentPressed: '#F2EEE1',
  accentMuted: '#332516',
  accentText: '#1F150C',
  danger: '#E28A73',
  dangerMuted: '#3A2118',
  success: '#9BC46B',
  warning: '#D9A94E',
  overlay: 'rgba(0, 0, 0, 0.65)',
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
  card: '0 1px 2px rgba(31, 21, 12, 0.06)',
  raised: '0 4px 14px rgba(31, 21, 12, 0.10)',
  overlay: '0 12px 32px rgba(31, 21, 12, 0.20)',
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
