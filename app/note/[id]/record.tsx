import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { useVoicePlayer, useVoiceRecorder, type PermissionResult } from '@/core/platform';
import { buildVoiceOriginalName } from '@/features/attachments';
import { PrimaryButton } from '@/ui/components/primary-button';
import { formatClock } from '@/ui/format/duration';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';
import { ThemedText } from '@/ui/components/themed-text';

type Phase = 'idle' | 'recording' | 'ready' | 'saving' | 'error';

export default function RecordVoiceScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = String(id);

  const recorder = useVoiceRecorder();
  const player = useVoicePlayer();

  const [phase, setPhase] = useState<Phase>('idle');
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [tempUri, setTempUri] = useState<string | null>(null);
  const [recordedMs, setRecordedMs] = useState(0);

  const tempRef = useRef<string | null>(null);
  const savedRef = useRef(false);
  const recordingRef = useRef(false);
  const recorderRef = useRef(recorder);

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);
  useEffect(() => {
    tempRef.current = tempUri;
  }, [tempUri]);
  useEffect(() => {
    recordingRef.current = recorder.isRecording;
  }, [recorder.isRecording]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await recorderRef.current.checkPermission();
      if (active) setPermission(result);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Release recording/playback resources when leaving the screen.
  useEffect(
    () => () => {
      if (recordingRef.current) {
        void recorderRef.current
          .stop()
          .then((uri) => (uri ? services.attachments.discardTempFile(uri) : undefined))
          .catch(() => undefined);
      }
      const uri = tempRef.current;
      if (uri && !savedRef.current) void services.attachments.discardTempFile(uri);
    },
    [services],
  );

  const grantPermission = useCallback(async () => {
    const result = await recorder.requestPermission();
    setPermission(result);
    if (result.state !== 'granted') {
      Alert.alert(t('attachments.permTitle'), t('attachments.permBlocked'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('attachments.openSettings'), onPress: () => void Linking.openSettings() },
      ]);
    }
  }, [recorder]);

  const start = useCallback(async () => {
    try {
      player.stop();
      await recorder.start();
      setPhase('recording');
    } catch {
      setPhase('error');
    }
  }, [player, recorder]);

  const stop = useCallback(async () => {
    try {
      const duration = recorder.durationMs;
      const uri = await recorder.stop();
      if (!uri) {
        setPhase('idle');
        return;
      }
      setRecordedMs(duration);
      setTempUri(uri);
      tempRef.current = uri;
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [recorder]);

  const discard = useCallback(async () => {
    player.stop();
    const uri = tempUri;
    setTempUri(null);
    tempRef.current = null;
    setRecordedMs(0);
    setPhase('idle');
    if (uri) await services.attachments.discardTempFile(uri);
  }, [player, services, tempUri]);

  const save = useCallback(async () => {
    if (!tempUri) return;
    setPhase('saving');
    try {
      await services.attachments.addAudio({
        noteId,
        sourceUri: tempUri,
        mimeType: 'audio/mp4',
        originalName: buildVoiceOriginalName(),
        durationMs: recordedMs,
      });
      savedRef.current = true;
      router.back();
    } catch (error) {
      console.error('[Noto] save recording failed', error);
      setPhase('ready');
      Alert.alert(t('attachments.recordError'));
    }
  }, [services, noteId, tempUri, recordedMs]);

  const permissionGranted = permission?.state === 'granted';

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('attachments.recordTitle') }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={styles.body}>
          {!permissionGranted ? (
            <>
              <ThemedText style={[styles.message, { color: colors.text }]}>
                {t('attachments.permMicrophone')}
              </ThemedText>
              {permission?.state === 'unavailable' ? (
                <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                  {t('attachments.permUnavailable')}
                </ThemedText>
              ) : (
                <>
                  <PrimaryButton
                    label={t('attachments.grant')}
                    onPress={() => void grantPermission()}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void Linking.openSettings()}
                    style={styles.linkButton}
                  >
                    <ThemedText style={[styles.link, { color: colors.accent }]}>
                      {t('attachments.openSettings')}
                    </ThemedText>
                  </Pressable>
                </>
              )}
            </>
          ) : phase === 'recording' ? (
            <>
              <View style={styles.recordingRow}>
                <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                <ThemedText style={[styles.recordingLabel, { color: colors.danger }]}>
                  {t('attachments.recording')}
                </ThemedText>
              </View>
              <ThemedText style={[styles.clock, { color: colors.text }]}>
                {formatClock(recorder.durationMs)}
              </ThemedText>
              <PrimaryButton label={t('attachments.recordStop')} onPress={() => void stop()} />
            </>
          ) : phase === 'ready' || phase === 'saving' ? (
            <>
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('attachments.recordReady')}
              </ThemedText>
              <View style={styles.previewRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    player.isPlaying ? t('attachments.pause') : t('attachments.play')
                  }
                  onPress={() => tempUri && player.toggle('preview', tempUri)}
                  style={[styles.previewButton, { backgroundColor: colors.accentMuted }]}
                >
                  <ThemedText style={[styles.previewLabel, { color: colors.accent }]}>
                    {player.isPlaying ? t('attachments.pause') : t('attachments.play')}
                  </ThemedText>
                </Pressable>
                <ThemedText style={[styles.clock, { color: colors.textMuted }]}>
                  {`${formatClock(player.positionMs)} / ${formatClock(recordedMs)}`}
                </ThemedText>
              </View>
              <View style={styles.actions}>
                <PrimaryButton
                  label={t('attachments.recordDiscard')}
                  variant="secondary"
                  onPress={() => void discard()}
                />
                <PrimaryButton
                  label={t('attachments.recordSave')}
                  loading={phase === 'saving'}
                  onPress={() => void save()}
                />
              </View>
            </>
          ) : phase === 'error' ? (
            <>
              <ThemedText style={[styles.message, { color: colors.danger }]}>
                {t('attachments.recordError')}
              </ThemedText>
              <PrimaryButton label={t('common.retry')} onPress={() => setPhase('idle')} />
            </>
          ) : (
            <>
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('attachments.recordHint')}
              </ThemedText>
              <PrimaryButton
                label={t('attachments.recordStart')}
                onPress={() => void start()}
                loading={recorder.isRecording}
              />
            </>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: 'center' },
  message: { fontSize: 15, textAlign: 'center' },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  recordingLabel: { fontSize: 16 },
  clock: { fontSize: 28, textAlign: 'center' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
  },
  previewButton: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  previewLabel: { fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  linkButton: { alignItems: 'center', paddingVertical: spacing.sm },
  link: { fontSize: 15 },
});
