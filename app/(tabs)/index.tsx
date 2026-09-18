import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Note } from '@/features/notes/domain/note';
import { NoteRow } from '@/ui/components/note-row';
import { PrimaryButton } from '@/ui/components/primary-button';
import { ThemedText } from '@/ui/components/themed-text';
import { toError } from '@/ui/errors';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing } from '@/ui/theme';

type HomeState =
  | { status: 'loading'; notes: Note[] }
  | { status: 'ready'; notes: Note[] }
  | { status: 'error'; notes: Note[]; error: Error };

export default function HomeScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const [state, setState] = useState<HomeState>({ status: 'loading', notes: [] });

  const fetchNotes = useCallback(() => services.notes.listRecentNotes({ limit: 50 }), [services]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const notes = await fetchNotes();
          if (active) setState({ status: 'ready', notes });
        } catch (error) {
          if (active) setState({ status: 'error', notes: [], error: toError(error) });
        }
      })();
      return () => {
        active = false;
      };
    }, [fetchNotes]),
  );

  const retry = useCallback(() => {
    setState({ status: 'loading', notes: [] });
    void (async () => {
      try {
        const notes = await fetchNotes();
        setState({ status: 'ready', notes });
      } catch (error) {
        setState({ status: 'error', notes: [], error: toError(error) });
      }
    })();
  }, [fetchNotes]);

  const openCapture = useCallback(() => {
    router.push('/capture');
  }, []);

  const header = (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <ThemedText variant="display" color={colors.text}>
          {t('home.title')}
        </ThemedText>
        <ThemedText variant="subhead" color={colors.textMuted}>
          {t('home.tagline')}
        </ThemedText>
      </View>

      <PrimaryButton label={t('home.capture')} onPress={openCapture} />

      <View style={styles.secondaryRow}>
        <PrimaryButton
          label={t('home.captureUrl')}
          variant="secondary"
          style={styles.secondaryButton}
          onPress={() => router.push({ pathname: '/capture', params: { mode: 'url' } })}
        />
        <PrimaryButton
          label={t('home.captureTemplate')}
          variant="secondary"
          style={styles.secondaryButton}
          onPress={() => router.push('/templates')}
        />
      </View>

      <View style={styles.sectionRow}>
        <ThemedText variant="overline" color={colors.textFaint}>
          {t('home.recent')}
        </ThemedText>
        {state.notes.length > 0 ? (
          <ThemedText variant="caption" color={colors.textFaint}>
            {String(state.notes.length)}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {state.status === 'loading' ? (
        <>
          {header}
          <View style={styles.center}>
            <ThemedText variant="subhead" color={colors.textMuted}>
              {t('home.loading')}
            </ThemedText>
          </View>
        </>
      ) : state.status === 'error' ? (
        <>
          {header}
          <View style={styles.center}>
            <ThemedText variant="subhead" color={colors.textMuted} style={styles.centerText}>
              {t('home.error')}
            </ThemedText>
            <PrimaryButton label={t('common.retry')} onPress={retry} />
          </View>
        </>
      ) : state.notes.length === 0 ? (
        <>
          {header}
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accentMuted }]}>
              <View style={[styles.emptyLine, { backgroundColor: colors.accent }]} />
              <View
                style={[
                  styles.emptyLine,
                  styles.emptyLineShort,
                  { backgroundColor: colors.accent },
                ]}
              />
              <View
                style={[
                  styles.emptyLine,
                  styles.emptyLineShorter,
                  { backgroundColor: colors.accent },
                ]}
              />
            </View>
            <ThemedText variant="heading" color={colors.text} style={styles.centerText}>
              {t('home.emptyTitle')}
            </ThemedText>
            <ThemedText variant="subhead" color={colors.textMuted} style={styles.centerText}>
              {t('home.empty')}
            </ThemedText>
            <PrimaryButton label={t('home.emptyAction')} onPress={openCapture} />
          </View>
        </>
      ) : (
        <FlatList
          data={state.notes}
          keyExtractor={(note) => note.id}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <NoteRow
              note={item}
              onPress={() => router.push({ pathname: '/note/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  titleBlock: { gap: spacing.xs },
  secondaryRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: { flex: 1 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  list: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xxl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  centerText: { textAlign: 'center' },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: spacing.xs,
  },
  emptyLine: { width: 34, height: 3.5, borderRadius: radius.full },
  emptyLineShort: { width: 26 },
  emptyLineShorter: { width: 18 },
});
