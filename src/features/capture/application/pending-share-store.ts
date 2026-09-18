import type { IncomingSharePayload } from '@/core/platform/share-receive-port';

/**
 * Minimal in-memory handoff from the platform share listener to the capture screen.
 * Deliberately not global app state: one pending payload batch at a time, cleared as soon
 * as capture consumes it (docs/ARCHITECTURE.md §12: no state library).
 */

type Listener = (payloads: IncomingSharePayload[]) => void;

let pending: IncomingSharePayload[] = [];
let listeners = new Set<Listener>();

export function setPendingSharePayloads(payloads: IncomingSharePayload[]): void {
  pending = payloads;
  for (const listener of listeners) listener(pending);
}

export function consumePendingSharePayloads(): IncomingSharePayload[] {
  const current = pending;
  pending = [];
  return current;
}

export function getPendingSharePayloads(): IncomingSharePayload[] {
  return pending;
}

export function subscribePendingSharePayloads(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. */
export function resetPendingSharePayloads(): void {
  pending = [];
  listeners = new Set();
}
