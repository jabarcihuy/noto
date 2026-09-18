import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';

import { runAllPhase0Checks, type CheckResult } from '@/phase0';
import { t } from '@/ui/i18n';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';

function persistResults(collected: CheckResult[]): void {
  // One machine-readable line for device verification via logcat/Metro.
  console.log('[PHASE0_RESULTS]', JSON.stringify(collected));
  try {
    const file = new File(Paths.document, 'phase0-results.json');
    file.create({ overwrite: true });
    file.write(JSON.stringify(collected, null, 2));
    console.log('[PHASE0_RESULTS_FILE]', file.uri);
  } catch (error) {
    console.log('[PHASE0_RESULTS_FILE_ERROR]', String(error));
  }
}

export default function Phase0Screen() {
  const colors = getTheme(useColorScheme());
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(true);

  const collect = useCallback(async () => {
    const collected = await runAllPhase0Checks();
    persistResults(collected);
    return collected;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const collected = await collect();
      if (cancelled) return;
      setResults(collected);
      setRunning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [collect]);

  const rerun = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const collected = await collect();
    setResults(collected);
    setRunning(false);
  }, [collect]);

  const passed = results.filter((result) => result.status === 'ok').length;
  const failed = results.filter((result) => result.status === 'fail').length;
  const infoCount = results.filter((result) => result.status === 'info').length;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('phase0.title') }} />
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['bottom']}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            {t('phase0.disclaimer')}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => void rerun()}
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.buttonLabel}>{t('phase0.run')}</Text>
          </Pressable>

          <Text style={[styles.summary, { color: colors.text }]}>
            {running
              ? t('phase0.running')
              : `${t('phase0.ready')} OK: ${passed} / ${t('phase0.summary.fail')}: ${failed} / ${t(
                  'phase0.summary.info',
                )}: ${infoCount}`}
          </Text>

          {results.map((result) => (
            <View
              key={result.name}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text
                style={[
                  styles.badge,
                  {
                    color:
                      result.status === 'ok'
                        ? colors.success
                        : result.status === 'fail'
                          ? colors.danger
                          : colors.textMuted,
                  },
                ]}
              >
                {result.status.toUpperCase()}
              </Text>
              <View style={styles.rowBody}>
                <Text style={[styles.name, { color: colors.text }]}>{result.name}</Text>
                {result.detail ? (
                  <Text style={[styles.detail, { color: colors.textMuted }]}>{result.detail}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  disclaimer: { fontSize: 14, lineHeight: 20 },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  summary: { fontSize: 15, fontWeight: '600', marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  badge: { fontSize: 12, fontWeight: '700', width: 44 },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600' },
  detail: { fontSize: 12, lineHeight: 17 },
});
