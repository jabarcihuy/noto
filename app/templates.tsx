import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import type { Template } from '@/features/templates';
import { PrimaryButton } from '@/ui/components/primary-button';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';

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
          <Text style={[styles.title, { color: colors.text }]}>{t('templates.title')}</Text>
          <Text style={[styles.intro, { color: colors.textMuted }]}>{t('templates.intro')}</Text>

          {state.status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.message, { color: colors.textMuted }]}>
                {t('templates.loading')}
              </Text>
            </View>
          ) : state.status === 'error' ? (
            <View style={styles.center}>
              <Text style={[styles.message, { color: colors.textMuted }]}>
                {t('templates.error')}
              </Text>
              <PrimaryButton label={t('common.retry')} onPress={retry} />
            </View>
          ) : state.templates.length === 0 ? (
            <View style={styles.center}>
              <Text style={[styles.message, { color: colors.textMuted }]}>
                {t('templates.empty')}
              </Text>
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
                <Text style={[styles.name, { color: colors.text }]}>{template.name}</Text>
                {template.description ? (
                  <Text style={[styles.description, { color: colors.textMuted }]}>
                    {template.description}
                  </Text>
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
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  intro: { fontSize: 14 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  name: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 14 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  message: { fontSize: 15, textAlign: 'center' },
});
