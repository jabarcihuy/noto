/**
 * Portable vault format (docs/DATABASE.md §9). Pure domain code: it plans an export from
 * already-loaded data and validates it. No filesystem, no SQLite, no React.
 */

import type { Attachment } from '@/features/attachments/domain/attachment';
import type { Note } from '@/features/notes/domain/note';
import type { NoteLink } from '@/features/links/domain/note-link';
import type { Notebook } from '@/features/notebooks/domain/notebook';
import type { SavedSearch } from '@/features/search/domain/saved-search';
import type { Tag } from '@/features/tags/domain/tag';
import type { Template } from '@/features/templates/domain/template';

import { buildExportFilename, resolveUniqueFilename, serializeNoteMarkdown } from './note-markdown';

export const VAULT_FORMAT = 'noto-vault';
export const VAULT_FORMAT_VERSION = 1;
export const NOTES_DIRECTORY = 'notes';
export const ATTACHMENTS_DIRECTORY = 'attachments';
export const MANIFEST_FILENAME = 'manifest.json';

export type ManifestNoteLink = {
  targetText: string;
  targetNoteId: string | null;
  resolution: 'resolved' | 'unresolved' | 'ambiguous';
  displayText: string | null;
  anchor: string | null;
};

export type ManifestNote = {
  id: string;
  title: string;
  captureType: string;
  notebookId: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  file: string;
  tags: string[];
  links: ManifestNoteLink[];
};

export type ManifestNotebook = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ManifestTag = {
  id: string;
  name: string;
  displayName: string;
};

export type ManifestAttachment = {
  id: string;
  noteId: string;
  kind: string;
  file: string;
  originalName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
};

export type ManifestTemplate = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManifestSavedSearch = {
  id: string;
  name: string;
  query: string;
  filters: SavedSearch['filters'];
  sort: string;
  createdAt: string;
  updatedAt: string;
};

export type VaultManifest = {
  format: typeof VAULT_FORMAT;
  version: number;
  exportedAt: string;
  notebooks: ManifestNotebook[];
  tags: ManifestTag[];
  notes: ManifestNote[];
  attachments: ManifestAttachment[];
  templates: ManifestTemplate[];
  savedSearches: ManifestSavedSearch[];
};

export type VaultExportInput = {
  notes: Note[];
  notebooks: Notebook[];
  tags: Tag[];
  /** Normalized tag names per note. */
  tagsByNote: Map<string, string[]>;
  linksByNote: Map<string, NoteLink[]>;
  attachments: Attachment[];
  templates: Template[];
  savedSearches: SavedSearch[];
  exportedAt: string;
};

export type VaultNoteFile = {
  relativePath: string;
  noteId: string;
  markdown: string;
};

export type VaultAttachmentFile = {
  relativePath: string;
  sourceVaultPath: string;
  attachmentId: string;
};

export type VaultExportPlan = {
  manifest: VaultManifest;
  noteFiles: VaultNoteFile[];
  attachmentFiles: VaultAttachmentFile[];
  /** Blocking problems: the plan must not be written when non-empty. */
  errors: string[];
  /** Non-blocking problems: export proceeds and reports them. */
  warnings: string[];
};

const ATTACHMENT_REFERENCE = /!?\[[^\]]*\]\(([^)]+)\)/g;

/** Vault-relative `attachments/…` paths referenced by note content. */
export function extractAttachmentPaths(content: string): string[] {
  const paths: string[] = [];
  for (const match of content.matchAll(ATTACHMENT_REFERENCE)) {
    const path = match[1]?.trim() ?? '';
    if (/(^|\/)attachments\//.test(path)) paths.push(path);
  }
  return paths;
}

function toManifestLink(link: NoteLink): ManifestNoteLink {
  return {
    targetText: link.targetText,
    targetNoteId: link.targetNoteId,
    resolution: link.resolution,
    displayText: link.displayText,
    anchor: link.anchor,
  };
}

/**
 * Builds the deterministic vault export plan: unique human-readable note filenames
 * (deduplicated case-insensitively in `createdAt, id` order), the manifest, and the list
 * of attachment files to copy. Never touches the database or filesystem.
 */
export function planVaultExport(input: VaultExportInput): VaultExportPlan {
  const errors: string[] = [];
  const warnings: string[] = [];

  const notebookById = new Map(input.notebooks.map((notebook) => [notebook.id, notebook]));
  const attachmentPaths = new Set(input.attachments.map((attachment) => attachment.relativePath));

  const noteIds = new Set<string>();
  for (const note of input.notes) {
    if (noteIds.has(note.id)) errors.push(`duplicate-note-id:${note.id}`);
    noteIds.add(note.id);
  }

  const orderedNotes = [...input.notes].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );

  const takenFilenames = new Set<string>();
  const noteFiles: VaultNoteFile[] = [];
  const manifestNotes: ManifestNote[] = [];

  for (const note of orderedNotes) {
    const filename = resolveUniqueFilename(buildExportFilename(note), takenFilenames);
    takenFilenames.add(filename);
    const relativePath = `${NOTES_DIRECTORY}/${filename}`;

    const tagNames = input.tagsByNote.get(note.id) ?? [];
    const notebook = note.notebookId ? notebookById.get(note.notebookId) : null;
    const links = input.linksByNote.get(note.id) ?? [];

    noteFiles.push({
      relativePath,
      noteId: note.id,
      markdown: serializeNoteMarkdown(note, {
        tags: tagNames,
        notebook: notebook?.name ?? null,
      }),
    });
    manifestNotes.push({
      id: note.id,
      title: note.title,
      captureType: note.captureType,
      notebookId: note.notebookId,
      sourceUrl: note.sourceUrl,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      openedAt: note.openedAt,
      file: relativePath,
      tags: tagNames,
      links: links.map(toManifestLink),
    });

    for (const referenced of extractAttachmentPaths(note.content)) {
      if (!attachmentPaths.has(referenced)) {
        warnings.push(`missing-attachment-reference:${note.id}:${referenced}`);
      }
    }
  }

  const takenAttachmentPaths = new Set<string>();
  const attachmentFiles: VaultAttachmentFile[] = [];
  const manifestAttachments: ManifestAttachment[] = [];

  for (const attachment of input.attachments) {
    const lower = attachment.relativePath.toLowerCase();
    if (takenAttachmentPaths.has(lower)) {
      errors.push(`duplicate-attachment-path:${attachment.relativePath}`);
      continue;
    }
    takenAttachmentPaths.add(lower);

    attachmentFiles.push({
      relativePath: attachment.relativePath,
      sourceVaultPath: attachment.relativePath,
      attachmentId: attachment.id,
    });
    manifestAttachments.push({
      id: attachment.id,
      noteId: attachment.noteId,
      kind: attachment.kind,
      file: attachment.relativePath,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      width: attachment.width,
      height: attachment.height,
      durationMs: attachment.durationMs,
      createdAt: attachment.createdAt,
    });
  }

  const manifest: VaultManifest = {
    format: VAULT_FORMAT,
    version: VAULT_FORMAT_VERSION,
    exportedAt: input.exportedAt,
    notebooks: input.notebooks.map((notebook) => ({
      id: notebook.id,
      name: notebook.name,
      sortOrder: notebook.sortOrder,
      createdAt: notebook.createdAt,
      updatedAt: notebook.updatedAt,
    })),
    tags: input.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      displayName: tag.displayName,
    })),
    notes: manifestNotes,
    attachments: manifestAttachments,
    templates: input.templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      content: template.content,
      isBuiltin: template.isBuiltin,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    })),
    savedSearches: input.savedSearches.map((saved) => ({
      id: saved.id,
      name: saved.name,
      query: saved.query,
      filters: saved.filters,
      sort: saved.sort,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    })),
  };

  return { manifest, noteFiles, attachmentFiles, errors, warnings };
}

/** Serializes the manifest deterministically (stable key order, 2-space indent). */
export function serializeManifest(manifest: VaultManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseManifest(text: string): VaultManifest | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const manifest = parsed as VaultManifest;
    if (manifest.format !== VAULT_FORMAT || typeof manifest.version !== 'number') return null;
    return manifest;
  } catch {
    return null;
  }
}
