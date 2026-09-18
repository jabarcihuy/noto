import type { TextStyle } from 'react-native';

import { fontFamily } from './tokens';

/**
 * Locked type ramp. Every style names a `fontFamily` and omits `fontWeight`, so the
 * bundled Plus Jakarta Sans files are used verbatim and Android never substitutes the
 * system font or synthesizes a weight.
 */
export const type = {
  display: {
    fontFamily: fontFamily.extrabold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  subhead: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  overline: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 21,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
