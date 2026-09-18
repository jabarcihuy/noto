import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { getTheme, spacing } from '@/ui/theme/tokens';

type InfoCardProps = {
  children: string;
};

/** Minimal information card used by placeholder (non-feature) screens. */
export function InfoCard({ children }: InfoCardProps) {
  const colors = getTheme(useColorScheme());
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
    >
      <Text style={[styles.text, { color: colors.textMuted }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: spacing.lg,
  },
  text: { fontSize: 15, lineHeight: 20 },
});
