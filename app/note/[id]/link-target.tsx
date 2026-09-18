import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import type { Note } from '@/features/notes/domain/note';
import { formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type Candidate = Note & { notebookName: string | null };

export default function LinkTargetScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const params = useLocalSearchParams<{ id: string; linkId: string; target: string }>();
  const linkId = String(params.linkId);
  const target = String(params.target ?? '');

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const notes = await services.links.candidatesFor(target);
        const withNotebook = await Promise.all(
          notes.map(async (note) => {
            const notebook = note.notebookId
              ? await services.notebooks.getById(note.notebookId)
              : null;
            return { ...note, notebookName: notebook?.name ?? null };
          }),
        );
        if (active) setCandidates(withNotebook);
      } catch {
        if (active) setCandidates([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [services, target]);

  const choose = useCallback(
    (note: Note) => {
      setBusy(true);
      void (async () => {
        try {
          await services.links.resolveLink(linkId, note.id);
          router.replace({ pathname: '/note/[id]', params: { id: note.id } });
        } catch (error) {
          console.error('[Noto] resolve link failed', error);
          setBusy(false);
          Alert.alert(t('link.resolveError'));
        }
      })();
    },
    [services, linkId],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('link.targetTitle') }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {candidates === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('link.loading')}
            </ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText style={[styles.intro, { color: colors.textMuted }]}>
              {t('link.ambiguousMessage')}
            </ThemedText>
            <ThemedText
              style={[styles.target, { color: colors.text }]}
            >{`[[${target}]]`}</ThemedText>
            {candidates.length === 0 ? (
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('link.candidatesEmpty')}
              </ThemedText>
            ) : (
              candidates.map((note) => (
                <Pressable
                  key={note.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => choose(note)}
                  style={[
                    styles.row,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: busy ? 0.6 : 1,
                    },
                  ]}
                >
                  <ThemedText style={[styles.rowTitle, { color: colors.text }]}>
                    {note.title.trim() || t('home.untitled')}
                  </ThemedText>
                  <ThemedText style={[styles.rowMeta, { color: colors.textMuted }]}>
                    {note.notebookName ?? t('note.noneNotebook')} · {formatDateTime(note.updatedAt)}
                  </ThemedText>
                </Pressable>
              ))
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.cancel}
            >
              <ThemedText style={[styles.cancelLabel, { color: colors.accent }]}>
                {t('common.cancel')}
              </ThemedText>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },
  intro: { ...type.subhead },
  target: { ...type.body },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 2,
  },
  rowTitle: { ...type.body },
  rowMeta: { ...type.caption },
  cancel: { paddingVertical: spacing.md, alignItems: 'center' },
  cancelLabel: { ...type.subhead },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { ...type.subhead, textAlign: 'center' },
});
