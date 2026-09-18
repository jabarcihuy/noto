import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/ui/components/themed-text';
import { getTheme, spacing } from '@/ui/theme';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  scroll?: boolean;
  /** Right-aligned header accessory (a link, a count, an action). */
  headerRight?: ReactNode;
};

/**
 * Minimal themed screen container: safe area, one screen edge padding, and a display
 * title. Foundation only; not a product screen.
 */
export function Screen({ title, subtitle, children, scroll = false, headerRight }: ScreenProps) {
  const colors = getTheme(useColorScheme());

  const content = (
    <View style={styles.inner}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText variant="display" color={colors.text}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="subhead" color={colors.textMuted}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {headerRight}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { flex: 1, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { flex: 1, gap: spacing.xs },
});
