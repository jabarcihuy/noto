import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { isValidTagName } from '@/features/tags/domain/tag-parser';
import type { Tag } from '@/features/tags/domain/tag';
import { PrimaryButton } from '@/ui/components/primary-button';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';

type TagsState = { tags: Tag[]; allTags: Tag[] };

export default function NoteTagsScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = String(id);

  const [state, setState] = useState<TagsState | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [tags, allTags] = await Promise.all([
      services.tags.listForNote(noteId),
      services.tags.list(),
    ]);
    return { tags, allTags };
  }, [services, noteId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const result = await load();
          if (active) setState(result);
        } catch {
          if (active) setState({ tags: [], allTags: [] });
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const refresh = useCallback(async () => {
    const result = await load();
    setState(result);
  }, [load]);

  const add = useCallback(
    async (raw: string) => {
      const displayName = raw.normalize('NFKC').trim();
      if (!isValidTagName(displayName)) {
        setError(t('tags.invalid'));
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await services.tags.addTagToNote(noteId, displayName);
        setInput('');
        await refresh();
      } catch {
        setError(t('tags.addError'));
      } finally {
        setBusy(false);
      }
    },
    [services, noteId, refresh],
  );

  const remove = useCallback(
    async (tag: Tag) => {
      setBusy(true);
      setError(null);
      try {
        await services.tags.removeTagFromNote(noteId, tag.name);
        await refresh();
      } catch {
        setError(t('tags.removeError'));
      } finally {
        setBusy(false);
      }
    },
    [services, noteId, refresh],
  );

  const currentNames = new Set((state?.tags ?? []).map((tag) => tag.name));
  const suggestions = (state?.allTags ?? []).filter((tag) => !currentNames.has(tag.name));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('tags.title') }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {!state ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.section, { color: colors.textMuted }]}>{t('note.tags')}</Text>
            {state.tags.length === 0 ? (
              <Text style={[styles.message, { color: colors.textMuted }]}>{t('tags.none')}</Text>
            ) : (
              <View style={styles.chips}>
                {state.tags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('tags.remove')}: ${tag.displayName}`}
                    disabled={busy}
                    onPress={() => void remove(tag)}
                    style={[styles.chip, { backgroundColor: colors.accentMuted }]}
                  >
                    <Text style={[styles.chipText, { color: colors.accent }]}>
                      #{tag.displayName} ×
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.addRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('tags.addPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                editable={!busy}
                onSubmitEditing={() => void add(input)}
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
                label={t('tags.add')}
                onPress={() => void add(input)}
                disabled={input.trim().length === 0}
                loading={busy}
              />
            </View>
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            {suggestions.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.textMuted }]}>
                  {t('tags.available')}
                </Text>
                <View style={styles.chips}>
                  {suggestions.map((tag) => (
                    <Pressable
                      key={tag.id}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void add(tag.displayName)}
                      style={[styles.chip, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.chipText, { color: colors.text }]}>
                        #{tag.displayName}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },
  section: { fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  message: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  error: { fontSize: 14 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
});
