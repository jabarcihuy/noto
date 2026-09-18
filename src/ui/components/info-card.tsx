import { StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/ui/components/themed-text';
import { getTheme, radius, spacing } from '@/ui/theme';

type InfoCardProps = {
  children: string;
  tone?: 'neutral' | 'accent' | 'danger';
};

/** Quiet inline note (hints, degraded-mode notices, error messages). */
export function InfoCard({ children, tone = 'neutral' }: InfoCardProps) {
  const colors = getTheme(useColorScheme());

  const background =
    tone === 'accent'
      ? colors.accentMuted
      : tone === 'danger'
        ? colors.dangerMuted
        : colors.surface;
  const textColor =
    tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.textMuted;

  return (
    <View accessibilityRole="summary" style={[styles.card, { backgroundColor: background }]}>
      <ThemedText selectable variant="subhead" color={textColor}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
