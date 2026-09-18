import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { subscribePendingSharePayloads, useShareListener } from '@/features/capture';
import { AppProvider, useAppServices } from '@/ui/providers/app-provider';

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppProvider>
          <ShareListener />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="capture" options={{ headerShown: true, presentation: 'modal' }} />
            <Stack.Screen name="note/[id]/index" options={{ headerShown: true }} />
            <Stack.Screen name="note/[id]/edit" options={{ headerShown: true }} />
            <Stack.Screen name="note/[id]/notebook" options={{ headerShown: true }} />
            <Stack.Screen name="note/[id]/tags" options={{ headerShown: true }} />
            <Stack.Screen name="note/[id]/link-target" options={{ headerShown: true }} />
            <Stack.Screen name="note/[id]/record" options={{ headerShown: true }} />
            <Stack.Screen name="notebook/[id]" options={{ headerShown: true }} />
            <Stack.Screen name="templates" options={{ headerShown: true }} />
            <Stack.Screen name="phase0" options={{ headerShown: true }} />
          </Stack>
        </AppProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Receives platform share payloads and opens capture for review (FEATURES.md §1.5). */
function ShareListener() {
  const services = useAppServices();
  useShareListener(services.shareReceive);

  useEffect(
    () =>
      subscribePendingSharePayloads((payloads) => {
        if (payloads.length > 0) router.push('/capture');
      }),
    [],
  );

  return null;
}
