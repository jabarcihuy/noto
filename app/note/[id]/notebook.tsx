import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import type { Notebook } from '@/features/notebooks/domain/notebook';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, spacing } from '@/ui/theme/tokens';

type PickerState = {
  notebookId: string | null;
  notebooks: Notebook[];
};

export default function NotebookPickerScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = String(id);

  const [state, setState] = useState<PickerState | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const [note, notebooks] = await Promise.all([
            services.notes.getNote(noteId),
            services.notebooks.list(),
          ]);
          if (!active) return;
          setState({ notebookId: note?.notebookId ?? null, notebooks });
        } catch {
          if (active) setError(true);
        }
      })();
      return () => {
        active = false;
      };
    }, [services, noteId]),
  );

  const select = useCallback(
    async (notebookId: string | null) => {
      if (busy) return;
      setBusy(true);
      try {
        if (notebookId === null) await services.notebooks.removeNote(noteId);
        else await services.notebooks.assignNote(noteId, notebookId);
        router.back();
      } catch {
        setBusy(false);
        Alert.alert(t('notebookPicker.error'));
      }
    },
    [busy, services, noteId],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('notebookPicker.title') }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {error ? (
          <View style={styles.center}>
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {t('notebooks.error')}
            </Text>
          </View>
        ) : !state ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={[null, ...state.notebooks]}
            keyExtractor={(notebook) => notebook?.id ?? 'none'}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = (item?.id ?? null) === state.notebookId;
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void select(item?.id ?? null)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {item ? item.name : t('notebookPicker.none')}
                  </Text>
                  {selected ? (
                    <Text style={[styles.current, { color: colors.accent }]}>
                      {t('notebookPicker.current')}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 16 },
  current: { fontSize: 13, fontWeight: '600' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { fontSize: 15, textAlign: 'center' },
});
