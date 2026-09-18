import * as Audio from 'expo-audio';
import { Camera, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { type CheckResult, errorMessage, fail, info, ok } from '../types';

/**
 * Feasibility checks for camera, microphone, audio recording, and audio playback
 * (docs/ROADMAP.md Phase 0, docs/ARCHITECTURE.md §8).
 *
 * Module/API availability is verified at runtime. Actual capture and recording require
 * user interaction and are not automated here.
 */
export async function runMediaChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(
    typeof ImagePicker.launchImageLibraryAsync === 'function'
      ? ok('media.image_picker', 'launchImageLibraryAsync tersedia')
      : fail('media.image_picker', 'launchImageLibraryAsync tidak tersedia'),
    typeof ImagePicker.launchCameraAsync === 'function'
      ? ok('media.image_picker.camera', 'launchCameraAsync tersedia')
      : fail('media.image_picker.camera', 'launchCameraAsync tidak tersedia'),
    typeof CameraView === 'function'
      ? ok('media.camera.view', 'CameraView tersedia')
      : fail('media.camera.view', 'CameraView tidak tersedia'),
    typeof Audio.useAudioRecorder === 'function' && typeof Audio.createAudioPlayer === 'function'
      ? ok('media.audio.api', 'useAudioRecorder + createAudioPlayer tersedia')
      : fail('media.audio.api', 'API perekaman/pemutaran tidak lengkap'),
    Audio.RecordingPresets?.HIGH_QUALITY
      ? ok('media.audio.presets', 'RecordingPresets.HIGH_QUALITY tersedia')
      : fail('media.audio.presets', 'RecordingPresets tidak tersedia'),
  );

  const permissionChecks: [string, () => Promise<{ status: string }>][] = [
    ['media.permission.camera', () => Camera.getCameraPermissionsAsync()],
    ['media.permission.microphone', () => Camera.getMicrophonePermissionsAsync()],
    ['media.permission.media_library', () => ImagePicker.getMediaLibraryPermissionsAsync()],
    ['media.permission.audio_recording', () => Audio.getRecordingPermissionsAsync()],
  ];

  for (const [name, getter] of permissionChecks) {
    try {
      const response = await getter();
      results.push(info(name, `Status izin saat ini: ${response.status}`));
    } catch (error) {
      results.push(fail(name, errorMessage(error)));
    }
  }

  return results;
}
