import type { PermissionResult } from './permission';

export type ImageSource = 'library' | 'camera';

export type PickedImage = {
  uri: string;
  mimeType: string | null;
  fileName: string | null;
  width: number | null;
  height: number | null;
};

/**
 * Gallery/camera capability (docs/ARCHITECTURE.md §8). The application depends on this
 * interface; `src/core/platform` provides the Expo implementation.
 */
export interface ImageSourcePort {
  getPermission(source: ImageSource): Promise<PermissionResult>;
  requestPermission(source: ImageSource): Promise<PermissionResult>;
  /** Returns null when the user cancels. */
  pickFromLibrary(): Promise<PickedImage | null>;
  /** Returns null when the user cancels. */
  captureWithCamera(): Promise<PickedImage | null>;
}
