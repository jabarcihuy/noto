import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { getTheme, spacing } from '@/ui/theme/tokens';

export default function NotFoundScreen() {
  const colors = getTheme(useColorScheme());
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.text, { color: colors.text }]}>This screen does not exist.</Text>
        <Link href="/" style={[styles.link, { color: colors.accent }]}>
          Go to Home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  text: { fontSize: 16 },
  link: { fontSize: 16, fontWeight: '600' },
});
