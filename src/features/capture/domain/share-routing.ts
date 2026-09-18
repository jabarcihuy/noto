/**
 * Pure share payload routing (docs/FEATURES.md §1.5, PRD §9.5). Maps raw platform payloads
 * onto the existing capture flows; unsupported types are rejected explicitly.
 */

import { defaultUrlTitle, firstUrlInText, normalizeUrlInput } from './url';

export type ShareKind = 'text' | 'url' | 'image' | 'audio' | 'file';

export type SharedFileRoute = {
  uri: string;
  mimeType: string | null;
  originalName: string | null;
};

export type ShareRoute =
  | { kind: 'text'; title: string; content: string }
  | { kind: 'url'; title: string; url: string }
  | ({ kind: 'image' } & SharedFileRoute)
  | ({ kind: 'audio' } & SharedFileRoute)
  | ({ kind: 'file' } & SharedFileRoute)
  | { kind: 'unsupported'; reason: 'empty' | 'unsupported-type' | 'unreadable' };

export type IncomingSharePayload = {
  shareType: string;
  value: string;
  mimeType?: string | null;
  contentUri?: string | null;
  originalName?: string | null;
};

const IMAGE_MIME = /^image\//i;
const AUDIO_MIME = /^audio\//i;

/**
 * Routes one share payload. URL detection reuses the URL capture rules; a plain text
 * payload containing a URL is treated as a URL capture (docs/FEATURES.md §1.5).
 */
export function routeSharePayload(payload: IncomingSharePayload): ShareRoute {
  const value = payload.value.trim();
  const mimeType = payload.mimeType ?? null;
  const shareType = payload.shareType.toLowerCase();

  if (shareType === 'image' || shareType === 'audio' || shareType === 'file') {
    const uri = payload.contentUri ?? (value.length > 0 ? value : null);
    if (!uri) return { kind: 'unsupported', reason: 'unreadable' };
    return {
      kind: shareType === 'image' ? 'image' : shareType === 'audio' ? 'audio' : 'file',
      uri,
      mimeType,
      originalName: payload.originalName ?? null,
    };
  }

  if (shareType === 'video') return { kind: 'unsupported', reason: 'unsupported-type' };

  if (value.length === 0) return { kind: 'unsupported', reason: 'empty' };

  if (shareType === 'url') {
    const normalized = normalizeUrlInput(value);
    if (!normalized) return { kind: 'unsupported', reason: 'unsupported-type' };
    return { kind: 'url', title: defaultUrlTitle(normalized), url: normalized };
  }

  // Plain text: a leading/embedded URL becomes a URL capture, everything else is text.
  const embedded = firstUrlInText(value);
  if (embedded) return { kind: 'url', title: defaultUrlTitle(embedded), url: embedded };
  return { kind: 'text', title: '', content: value };
}

/** Best-effort MIME classification for shared files without a declared MIME type. */
export function classifySharedFile(mimeType: string | null): 'image' | 'audio' | 'file' {
  if (mimeType && IMAGE_MIME.test(mimeType)) return 'image';
  if (mimeType && AUDIO_MIME.test(mimeType)) return 'audio';
  return 'file';
}
