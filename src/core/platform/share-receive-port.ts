/**
 * Incoming share capability (docs/ARCHITECTURE.md §8, FEATURES.md §1.5). Implemented by
 * `expo-sharing`'s first-party receiving APIs; requires a development/standalone build.
 */

export type IncomingSharePayload = {
  shareType: string;
  value: string;
  mimeType: string | null;
  contentUri: string | null;
  originalName: string | null;
};

export interface ShareReceivePort {
  /** True when the receiving API exists on this platform/build. */
  isAvailable(): boolean;
  /** Raw payloads from the last share event; synchronous, may be empty. */
  getPendingPayloads(): IncomingSharePayload[];
  /** Resolves payloads (may need I/O); resolves to [] when nothing was shared. */
  resolvePendingPayloads(): Promise<IncomingSharePayload[]>;
  /** Clears the platform queue so the same event is not handled twice. */
  clearPendingPayloads(): void;
}
