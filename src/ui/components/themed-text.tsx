import { Text, type TextProps } from 'react-native';

import { type, type TypeVariant } from '@/ui/theme';

type ThemedTextProps = TextProps & {
  variant?: TypeVariant;
  /** Theme color for the text; pass a theme token, never a raw hex. */
  color?: string;
};

/**
 * The only text primitive in the app. It applies the locked Plus Jakarta Sans ramp so no
 * screen can fall back to the Android system font, and it keeps `allowFontScaling` on so
 * the user's text-size setting still works.
 */
export function ThemedText({ variant = 'body', color, style, ...props }: ThemedTextProps) {
  return <Text style={[type[variant], color ? { color } : null, style]} {...props} />;
}
