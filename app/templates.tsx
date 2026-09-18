import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import type { Template } from '@/features/templates';
import { PrimaryButton } from '@/ui/components/primary-button';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';
import { ThemedText } from '@/ui/components/themed-text';

type State =
  { status: 'loading' } | { status: 'ready'; templates: Template[] } | { status: 'error' };

export default function TemplatesScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    const templates = await services.templates.list();
    return { status: 'ready' as const, templates };
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const next = await load();
          if (active) setState(next);
        } catch (error) {
          console.error('[Noto] load templates failed', error);
          if (active) setState({ status: 'error' });
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void (async () => {
      try {
        setState(await load());
      } catch (error) {
        console.error('[Noto] load templates failed', error);
        setState({ status: 'error' });
      }
    })();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('templates.title') }} />
      <View style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText style={[styles.title, { color: colors.text }]}>
            {t('templates.title')}
          </ThemedText>
          <ThemedText style={[styles.intro, { color: colors.textMuted }]}>
            {t('templates.intro')}
          </ThemedText>

          {state.status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('templates.loading')}
              </ThemedText>
            </View>
          ) : state.status === 'error' ? (
            <View style={styles.center}>
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('templates.error')}
              </ThemedText>
              <PrimaryButton label={t('common.retry')} onPress={retry} />
            </View>
          ) : state.templates.length === 0 ? (
            <View style={styles.center}>
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('templates.empty')}
              </ThemedText>
            </View>
          ) : (
            state.templates.map((template) => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                accessibilityLabel={
                  template.description ? `${template.name}. ${template.description}` : template.name
                }
                onPress={() =>
                  router.push({ pathname: '/capture', params: { templateId: template.id } })
                }
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={[styles.name, { color: colors.text }]}>
                  {template.name}
                </ThemedText>
                {template.description ? (
                  <ThemedText style={[styles.description, { color: colors.textMuted }]}>
                    {template.description}
                  </ThemedText>
                ) : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 28, lineHeight: 34 },
  intro: { fontSize: 14 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  name: { fontSize: 16 },
  description: { fontSize: 14 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  message: { fontSize: 15, textAlign: 'center' },
});
