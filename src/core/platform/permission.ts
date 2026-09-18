/** Shared permission vocabulary for platform capabilities (docs/ARCHITECTURE.md §8). */

export type PermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  /** Capability or permission API is not available on this platform/build. */
  | 'unavailable';

export type PermissionResult = {
  state: PermissionState;
  /** Whether the OS allows asking again (false means the user must use Settings). */
  canAskAgain: boolean;
};
