import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getTheme, spacing } from '@/ui/theme/tokens';

type ScreenProps = {
  title: string;
  children?: ReactNode;
  scroll?: boolean;
};

/**
 * Minimal themed screen container. Foundation only; not a product screen.
 */
export function Screen({ title, children, scroll = false }: ScreenProps) {
  const colors = getTheme(useColorScheme());

  const content = (
    <View style={styles.inner}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { flex: 1, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
});
