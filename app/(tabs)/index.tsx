import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Note } from '@/features/notes/domain/note';
import { NoteRow } from '@/ui/components/note-row';
import { PrimaryButton } from '@/ui/components/primary-button';
import { toError } from '@/ui/errors';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, spacing } from '@/ui/theme/tokens';

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('home.title')}</Text>
        <PrimaryButton label={t('home.capture')} onPress={openCapture} />
        <PrimaryButton
          label={t('home.captureTemplate')}
          variant="secondary"
          onPress={() => router.push('/templates')}
        />
        <PrimaryButton
          label={t('home.captureUrl')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/capture', params: { mode: 'url' } })}
        />
        <Text style={[styles.section, { color: colors.textMuted }]}>{t('home.recent')}</Text>
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.message, { color: colors.textMuted }]}>{t('home.loading')}</Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.textMuted }]}>{t('home.error')}</Text>
          <PrimaryButton label={t('common.retry')} onPress={retry} />
        </View>
      ) : state.notes.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.textMuted }]}>{t('home.empty')}</Text>
          <PrimaryButton label={t('home.emptyAction')} onPress={openCapture} />
        </View>
      ) : (
        <FlatList
          data={state.notes}
          keyExtractor={(note) => note.id}
          contentContainerStyle={styles.list}
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
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  section: { fontSize: 15, fontWeight: '600', marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { fontSize: 15, textAlign: 'center' },
});
