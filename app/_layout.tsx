import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { subscribePendingSharePayloads, useShareListener } from '@/features/capture';
import { AppProvider, useAppServices } from '@/ui/providers/app-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  // Bundled TTF files: the app never falls back to the Android system font.
  const [fontsLoaded, fontError] = useFonts({
    'PlusJakartaSans-Regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PlusJakartaSans-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PlusJakartaSans-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'PlusJakartaSans-ExtraBold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
  });

  useEffect(() => {
    // Hide the splash once fonts resolve (or fail — the app must still start).
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
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
