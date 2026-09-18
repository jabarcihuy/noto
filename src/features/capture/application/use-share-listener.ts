import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { ShareReceivePort } from '@/core/platform/share-receive-port';

import { setPendingSharePayloads } from './pending-share-store';

/**
 * Watches for Android/iOS share payloads and hands them to the capture flow
 * (docs/FEATURES.md §1.5). It never saves silently: it only publishes the pending batch,
 * and the capture screen asks the user to review before saving.
 *
 * Deduplication: the platform queue is cleared after each non-empty delivery and payload
 * identity is compared with the last handled batch, so cold-start/warm-start intent
 * redelivery cannot create duplicate captures.
 */
export function useShareListener(shareReceive: ShareReceivePort): void {
  useEffect(() => {
    if (!shareReceive.isAvailable()) return;

    let lastHandledKey: string | null = null;
    let disposed = false;

    const keyOf = (payloads: { shareType: string; value: string }[]) =>
      payloads
        .map((payload) => `${payload.shareType}:${payload.value}`)
        .sort()
        .join('|');

    const handle = async () => {
      const raw = shareReceive.getPendingPayloads();
      if (raw.length === 0) return;
      const key = keyOf(raw);
      if (key === lastHandledKey) return;

      // Resolved payloads carry the readable content URI for files; fall back to raw.
      const resolved = await shareReceive.resolvePendingPayloads();
      if (disposed) return;
      const payloads = resolved.length > 0 ? resolved : raw;
      lastHandledKey = key;
      shareReceive.clearPendingPayloads();
      setPendingSharePayloads(payloads);
    };

    void handle();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void handle();
    });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [shareReceive]);
}
