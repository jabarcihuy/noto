import * as Sharing from 'expo-sharing';

import type { IncomingSharePayload, ShareReceivePort } from './share-receive-port';

function toPayload(payload: {
  shareType: string;
  value: string;
  mimeType?: string | null;
  contentUri?: string | null;
  originalName?: string | null;
}): IncomingSharePayload {
  return {
    shareType: payload.shareType,
    value: payload.value,
    mimeType: payload.mimeType ?? null,
    contentUri: payload.contentUri ?? null,
    originalName: payload.originalName ?? null,
  };
}

/**
 * `expo-sharing` first-party share-receive adapter (Phase 0 decision). The API is
 * experimental and only present in a development/standalone build with the config plugin;
 * on Expo Go or Web `isAvailable()` is false and share flows degrade gracefully.
 */
export function createExpoShareReceive(): ShareReceivePort {
  const available =
    typeof Sharing.getSharedPayloads === 'function' &&
    typeof Sharing.getResolvedSharedPayloadsAsync === 'function';

  return {
    isAvailable(): boolean {
      return available;
    },

    getPendingPayloads(): IncomingSharePayload[] {
      if (!available) return [];
      try {
        return Sharing.getSharedPayloads().map(toPayload);
      } catch {
        return [];
      }
    },

    async resolvePendingPayloads(): Promise<IncomingSharePayload[]> {
      if (!available) return [];
      try {
        const resolved = await Sharing.getResolvedSharedPayloadsAsync();
        return resolved.map(toPayload);
      } catch {
        return [];
      }
    },

    clearPendingPayloads(): void {
      if (!available) return;
      try {
        Sharing.clearSharedPayloads();
      } catch {
        // Clearing is best effort; a duplicate delivery is guarded by the listener.
      }
    },
  };
}
