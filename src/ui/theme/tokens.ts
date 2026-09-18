import type { ColorSchemeName } from 'react-native';

export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  danger: string;
  success: string;
  warning: string;
};

const light: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F7F7F8',
  surfaceRaised: '#FFFFFF',
  border: '#E2E2E5',
  text: '#1C1C1E',
  textMuted: '#6B6B70',
  accent: '#2F6FED',
  accentMuted: '#E7EFFD',
  danger: '#D92D20',
  success: '#1F8A4C',
  warning: '#B25E00',
};

const dark: ThemeColors = {
  background: '#121214',
  surface: '#1C1C1F',
  surfaceRaised: '#232327',
  border: '#333338',
  text: '#F2F2F4',
  textMuted: '#9A9AA2',
  accent: '#6E9BFF',
  accentMuted: '#22304F',
  danger: '#F97066',
  success: '#4CC38A',
  warning: '#E0A458',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export function getTheme(scheme: ColorSchemeName): ThemeColors {
  return scheme === 'dark' ? dark : light;
}
