import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Notebook } from '@/features/notebooks/domain/notebook';
import { PrimaryButton } from '@/ui/components/primary-button';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type NotebookState =
  | { status: 'loading'; notebooks: Notebook[] }
  | { status: 'ready'; notebooks: Notebook[] }
  | { status: 'error'; notebooks: Notebook[] };

export default function NotebooksScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();

  const [state, setState] = useState<NotebookState>({ status: 'loading', notebooks: [] });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotebooks = useCallback(() => services.notebooks.list(), [services]);

  const refresh = useCallback(async () => {
    const notebooks = await fetchNotebooks();
    setState({ status: 'ready', notebooks });
  }, [fetchNotebooks]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const notebooks = await fetchNotebooks();
          if (active) setState({ status: 'ready', notebooks });
        } catch {
          if (active) setState({ status: 'error', notebooks: [] });
        }
      })();
      return () => {
        active = false;
      };
    }, [fetchNotebooks]),
  );

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      await services.notebooks.create(trimmed);
      setName('');
      await refresh();
    } catch {
      setError(t('notebooks.createError'));
    } finally {
      setCreating(false);
    }
  }, [name, creating, services, refresh]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText style={[styles.title, { color: colors.text }]}>
          {t('notebooks.title')}
        </ThemedText>
        <View style={styles.createRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('notebooks.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            editable={!creating}
            onSubmitEditing={() => void create()}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />
          <PrimaryButton
            label={t('notebooks.create')}
            onPress={() => void create()}
            disabled={name.trim().length === 0}
            loading={creating}
          />
        </View>
        {error ? (
          <ThemedText style={[styles.error, { color: colors.danger }]}>{error}</ThemedText>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <ThemedText style={[styles.message, { color: colors.textMuted }]}>
            {t('notebooks.loading')}
          </ThemedText>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <ThemedText style={[styles.message, { color: colors.textMuted }]}>
            {t('notebooks.error')}
          </ThemedText>
          <PrimaryButton
            label={t('common.retry')}
            onPress={() => {
              setState({ status: 'loading', notebooks: [] });
              void refresh();
            }}
          />
        </View>
      ) : state.notebooks.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={[styles.message, { color: colors.textMuted }]}>
            {t('notebooks.empty')}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={state.notebooks}
          keyExtractor={(notebook) => notebook.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/notebook/[id]', params: { id: item.id } })}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <ThemedText style={[styles.rowTitle, { color: colors.text }]}>{item.name}</ThemedText>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  title: { ...type.display },
  createRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...type.body,
  },
  error: { ...type.subhead },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { ...type.body },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { ...type.subhead, textAlign: 'center' },
});
