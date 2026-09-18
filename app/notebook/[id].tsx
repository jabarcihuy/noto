import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import type { Note } from '@/features/notes/domain/note';
import type { Notebook } from '@/features/notebooks/domain/notebook';
import { PrimaryButton } from '@/ui/components/primary-button';
import { contentPreview, formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; notebook: Notebook; notes: Note[] }
  | { status: 'notFound' }
  | { status: 'error' };

export default function NotebookDetailScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const notebookId = String(id);

  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const notebook = await services.notebooks.getById(notebookId);
    if (!notebook) return null;
    const notes = await services.notebooks.listNotes(notebookId, { limit: 100 });
    return { notebook, notes };
  }, [services, notebookId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const result = await load();
          if (!active) return;
          setState(result ? { status: 'ready', ...result } : { status: 'notFound' });
        } catch {
          if (active) setState({ status: 'error' });
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const startRename = useCallback(() => {
    if (state.status !== 'ready') return;
    setName(state.notebook.name);
    setEditing(true);
  }, [state]);

  const saveRename = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await services.notebooks.rename(notebookId, trimmed);
      setEditing(false);
      const result = await load();
      if (result) setState({ status: 'ready', ...result });
    } catch {
      Alert.alert(t('notebookDetail.renameError'));
    } finally {
      setBusy(false);
    }
  }, [name, busy, services, notebookId, load]);

  const confirmDelete = useCallback(() => {
    Alert.alert(t('notebookDetail.deleteTitle'), t('notebookDetail.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('note.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await services.notebooks.remove(notebookId);
            router.back();
          })();
        },
      },
    ]);
  }, [services, notebookId]);

  const removeNote = useCallback(
    async (noteId: string) => {
      await services.notebooks.removeNote(noteId);
      const result = await load();
      if (result) setState({ status: 'ready', ...result });
    },
    [services, load],
  );

  const headerTitle = state.status === 'ready' ? state.notebook.name : t('notebooks.title');

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: headerTitle }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('notebookDetail.loading')}
            </ThemedText>
          </View>
        ) : state.status === 'notFound' ? (
          <View style={styles.center}>
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('notebookDetail.notFound')}
            </ThemedText>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.center}>
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('notebooks.error')}
            </ThemedText>
          </View>
        ) : (
          <>
            <View style={[styles.actions, { borderBottomColor: colors.border }]}>
              {editing ? (
                <View style={styles.renameRow}>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={t('notebookDetail.namePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    editable={!busy}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  />
                  <PrimaryButton
                    label={t('common.cancel')}
                    variant="secondary"
                    onPress={() => setEditing(false)}
                    disabled={busy}
                  />
                  <PrimaryButton
                    label={t('editor.save')}
                    onPress={() => void saveRename()}
                    disabled={name.trim().length === 0}
                    loading={busy}
                  />
                </View>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={startRename}
                    style={[styles.action, { backgroundColor: colors.accentMuted }]}
                  >
                    <ThemedText style={[styles.actionLabel, { color: colors.accent }]}>
                      {t('notebookDetail.rename')}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={confirmDelete}
                    style={[styles.action, { backgroundColor: colors.danger }]}
                  >
                    <ThemedText style={[styles.actionLabel, { color: '#FFFFFF' }]}>
                      {t('notebookDetail.delete')}
                    </ThemedText>
                  </Pressable>
                </>
              )}
            </View>

            {state.notes.length === 0 ? (
              <View style={styles.center}>
                <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                  {t('notebookDetail.notesEmpty')}
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={state.notes}
                keyExtractor={(note) => note.id}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <View style={[styles.noteRow, { borderBottomColor: colors.border }]}>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.noteMain}
                      onPress={() =>
                        router.push({ pathname: '/note/[id]', params: { id: item.id } })
                      }
                    >
                      <ThemedText
                        numberOfLines={1}
                        style={[styles.noteTitle, { color: colors.text }]}
                      >
                        {item.title.trim().length > 0 ? item.title : t('home.untitled')}
                      </ThemedText>
                      <ThemedText
                        numberOfLines={1}
                        style={[styles.notePreview, { color: colors.textMuted }]}
                      >
                        {contentPreview(item.content) || t('home.noContent')}
                      </ThemedText>
                      <ThemedText style={[styles.noteTime, { color: colors.textMuted }]}>
                        {formatDateTime(item.updatedAt)}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void removeNote(item.id)}
                      style={styles.remove}
                    >
                      <ThemedText style={[styles.removeLabel, { color: colors.accent }]}>
                        {t('notebookDetail.removeNote')}
                      </ThemedText>
                    </Pressable>
                  </View>
                )}
              />
            )}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  renameRow: { flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...type.body,
  },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...type.subhead },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  noteMain: { flex: 1, gap: 2 },
  noteTitle: { ...type.body },
  notePreview: { ...type.subhead },
  noteTime: { ...type.caption, marginTop: 2 },
  remove: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  removeLabel: { ...type.label },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { ...type.subhead, textAlign: 'center' },
});
