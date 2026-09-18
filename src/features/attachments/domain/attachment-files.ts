/**
 * Pure attachment filename/reference rules (docs/DATABASE.md §7.1–7.2). No filesystem or
 * database access; used by the attachment application layer and the UI.
 */

import type { AttachmentKind } from './attachment';

const ILLEGAL = /[\\/:*?"<>|]/g;
const CONTROL = /[\u0000-\u001f]/g;
const EXTENSION = /^[A-Za-z0-9]{1,10}$/;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
};

/** Cross-platform-safe, human-readable base name without extension. */
export function sanitizeAttachmentBaseName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(ILLEGAL, ' ')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
    .slice(0, 80)
    .trim();
}

export function splitExtension(filename: string): { base: string; extension: string | null } {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { base: filename, extension: null };
  const extension = filename.slice(dot + 1).toLowerCase();
  if (!EXTENSION.test(extension)) return { base: filename, extension: null };
  return { base: filename.slice(0, dot), extension };
}

export function mimeForFilename(filename: string): string | null {
  const { extension } = splitExtension(filename);
  if (!extension) return null;
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function extensionForMime(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null;
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? null;
}

/**
 * Human-readable stored filename: derived from `original_name`, falling back to the
 * stable attachment ID (docs/DATABASE.md §7.1). The extension comes from the original
 * name or the MIME type.
 */
export function buildStoredFilename(input: {
  originalName?: string | null;
  mimeType?: string | null;
  attachmentId: string;
}): string {
  const original = input.originalName ? splitExtension(input.originalName) : null;
  const base = original ? sanitizeAttachmentBaseName(original.base) : '';
  const safeBase = base.length > 0 ? base : `attachment-${input.attachmentId.slice(0, 8)}`;
  const extension = original?.extension ?? extensionForMime(input.mimeType) ?? 'bin';
  return `${safeBase}.${extension}`;
}

/**
 * Deterministic, case-insensitive collision suffix (`name-2.jpg`), matching the
 * documented rule (docs/DATABASE.md §7.1). `taken` holds stored filenames only.
 */
export function resolveUniqueStoredFilename(desired: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((name) => name.toLowerCase()));
  if (!lowerTaken.has(desired.toLowerCase())) return desired;

  const { base, extension } = splitExtension(desired);
  const suffix = extension ? `.${extension}` : '';
  let counter = 2;
  let candidate = `${base}-${counter}${suffix}`;
  while (lowerTaken.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${base}-${counter}${suffix}`;
  }
  return candidate;
}

export const ATTACHMENTS_DIRECTORY = 'attachments';

export function buildRelativePath(storedFilename: string): string {
  return `${ATTACHMENTS_DIRECTORY}/${storedFilename}`;
}

export function buildImageReference(relativePath: string, alt: string): string {
  return `![${alt}](${relativePath})`;
}

export function buildAudioReference(relativePath: string, label: string): string {
  return `[${label}](${relativePath})`;
}

/** Appends a reference without touching existing content (docs/DATABASE.md §7.2). */
export function appendAttachmentReference(content: string, reference: string): string {
  if (content.trim().length === 0) return reference;
  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${reference}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes Markdown references that point at `relativePath`, leaving all other content
 * intact. Used only when the user deletes an attachment on purpose.
 */
export function removeAttachmentReferences(content: string, relativePath: string): string {
  const pattern = new RegExp(`!?\\[[^\\]]*\\]\\(${escapeRegExp(relativePath)}\\)`, 'g');
  return content
    .replace(pattern, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function attachmentKindForMime(mimeType: string | null | undefined): AttachmentKind {
  if (!mimeType) return 'file';
  if (mimeType.toLowerCase().startsWith('image/')) return 'image';
  if (mimeType.toLowerCase().startsWith('audio/')) return 'audio';
  return 'file';
}

/** Language-neutral original name for a new voice recording (used for the stored name). */
export function buildVoiceOriginalName(at: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `voice-${stamp}.m4a`;
}
