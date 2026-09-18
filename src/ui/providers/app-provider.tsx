import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initializeAppDatabase, type AppServices } from '@/composition';
import { t } from '@/ui/i18n';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';
import { ThemedText } from '@/ui/components/themed-text';

type AppState =
  | { status: 'initializing' }
  | { status: 'ready'; services: AppServices }
  | { status: 'error'; error: Error };

const AppContext = createContext<AppServices | null>(null);

/** Use-cases, injected by `AppProvider`. UI never reaches lower layers directly. */
export function useAppServices(): AppServices {
  const services = useContext(AppContext);
  if (!services) {
    throw new Error('App services are not ready');
  }
  return services;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({ status: 'initializing' });
  const [attempt, setAttempt] = useState(0);
  const colors = getTheme(useColorScheme());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const services = await initializeAppDatabase();
        if (!cancelled) setState({ status: 'ready', services });
      } catch (error) {
        // Keep the raw error for debugging; the user sees a plain-language message.
        console.error('[Noto] Database initialization failed', error);
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'initializing') {
    return (
      <CenterState>
        <ActivityIndicator color={colors.accent} />
        <ThemedText style={[styles.message, { color: colors.textMuted }]}>
          {t('startup.loading')}
        </ThemedText>
      </CenterState>
    );
  }

  if (state.status === 'error') {
    return (
      <CenterState>
        <ThemedText style={[styles.title, { color: colors.text }]}>
          {t('startup.errorTitle')}
        </ThemedText>
        <ThemedText style={[styles.message, { color: colors.textMuted }]}>
          {t('startup.errorMessage')}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setState({ status: 'initializing' });
            setAttempt((value) => value + 1);
          }}
          style={[styles.retry, { backgroundColor: colors.accent }]}
        >
          <ThemedText style={styles.retryLabel}>{t('startup.retry')}</ThemedText>
        </Pressable>
      </CenterState>
    );
  }

  return <AppContext.Provider value={state.services}>{children}</AppContext.Provider>;
}

function CenterState({ children }: { children: ReactNode }) {
  const colors = getTheme(useColorScheme());
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.center}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: { fontSize: 22, textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center' },
  retry: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  retryLabel: { color: '#FFFFFF', fontSize: 16 },
});
