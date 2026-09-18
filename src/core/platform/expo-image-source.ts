import * as ImagePicker from 'expo-image-picker';

import type { ImageSource, ImageSourcePort, PickedImage } from './image-source-port';
import type { PermissionResult } from './permission';

type ExpoPermissionResponse = {
  granted: boolean;
  status: string;
  canAskAgain?: boolean;
};

function toPermissionResult(response: ExpoPermissionResponse): PermissionResult {
  if (response.granted) return { state: 'granted', canAskAgain: true };
  const canAskAgain = response.canAskAgain ?? false;
  if (response.status === 'undetermined') return { state: 'undetermined', canAskAgain };
  return { state: 'denied', canAskAgain };
}

function toPickedImage(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0]!;
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
  };
}

const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 1,
  allowsMultipleSelection: false,
};

/** `expo-image-picker` implementation of the gallery/camera capability. */
export function createExpoImageSource(): ImageSourcePort {
  return {
    async getPermission(source: ImageSource): Promise<PermissionResult> {
      try {
        const response =
          source === 'camera'
            ? await ImagePicker.getCameraPermissionsAsync()
            : await ImagePicker.getMediaLibraryPermissionsAsync();
        return toPermissionResult(response);
      } catch {
        return { state: 'unavailable', canAskAgain: false };
      }
    },

    async requestPermission(source: ImageSource): Promise<PermissionResult> {
      try {
        const response =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        return toPermissionResult(response);
      } catch {
        return { state: 'unavailable', canAskAgain: false };
      }
    },

    async pickFromLibrary(): Promise<PickedImage | null> {
      const result = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
      return toPickedImage(result);
    },

    async captureWithCamera(): Promise<PickedImage | null> {
      const result = await ImagePicker.launchCameraAsync(PICK_OPTIONS);
      return toPickedImage(result);
    },
  };
}
