/** Attachment metadata entity (docs/DATABASE.md §4.6). Binary lives on the filesystem. */

export type AttachmentKind = 'image' | 'audio' | 'file';

export type Attachment = {
  id: string;
  noteId: string;
  kind: AttachmentKind;
  /** Vault-relative path, never absolute. */
  relativePath: string;
  originalName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
};

export type NewAttachment = {
  id?: string;
  noteId: string;
  kind: AttachmentKind;
  relativePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  createdAt?: string;
};
