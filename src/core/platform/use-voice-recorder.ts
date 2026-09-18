import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useState } from 'react';

import type { PermissionResult } from './permission';

async function readPermission(): Promise<PermissionResult> {
  try {
    const response = await getRecordingPermissionsAsync();
    return { state: response.granted ? 'granted' : 'denied', canAskAgain: response.canAskAgain };
  } catch {
    return { state: 'unavailable', canAskAgain: false };
  }
}

export type VoiceRecorder = {
  isRecording: boolean;
  durationMs: number;
  error: string | null;
  checkPermission: () => Promise<PermissionResult>;
  requestPermission: () => Promise<PermissionResult>;
  start: () => Promise<void>;
  /** Stops and returns the temporary recording URI, or null when nothing was recorded. */
  stop: () => Promise<string | null>;
};

/**
 * Voice recording capability (docs/ARCHITECTURE.md §8, docs/FEATURES.md §8.2). The
 * recording is written to a temporary file; saving/moving it into the vault is the
 * attachment application layer's job, so the temp path never becomes a stored path.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [error, setError] = useState<string | null>(null);

  const checkPermission = useCallback((): Promise<PermissionResult> => readPermission(), []);

  const requestPermission = useCallback(async (): Promise<PermissionResult> => {
    try {
      const response = await requestRecordingPermissionsAsync();
      return {
        state: response.granted ? 'granted' : 'denied',
        canAskAgain: response.canAskAgain,
      };
    } catch {
      return { state: 'unavailable', canAskAgain: false };
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<string | null> => {
    try {
      await recorder.stop();
    } finally {
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch {
        // Non-fatal: playback may still work with default mode.
      }
    }
    return recorder.uri ?? null;
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    durationMs: state.durationMillis,
    error,
    checkPermission,
    requestPermission,
    start,
    stop,
  };
}
