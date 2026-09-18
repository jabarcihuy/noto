/**
 * Canonical note Markdown representation (docs/DATABASE.md §9.1). This is the single
 * format shared by single-note export now and full-vault export later; do not create a
 * second representation.
 *
 * Pure domain code: no filesystem, no SQLite, no React.
 */

import type { Note } from '@/features/notes/domain/note';

export type NoteMarkdownOptions = {
  /** Tag names; empty until the tags feature exists (Phase 4). */
  tags?: string[];
  /** Notebook name, or null when the note has no notebook. */
  notebook?: string | null;
};

function yamlScalar(value: string): string {
  if (value.length === 0) return '""';
  if (/^[A-Za-z0-9_./ -]+$/.test(value) && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlList(values: string[]): string {
  return `[${values.map(yamlScalar).join(', ')}]`;
}

export function serializeNoteMarkdown(note: Note, options: NoteMarkdownOptions = {}): string {
  const tags = options.tags ?? [];
  const notebook = options.notebook ?? null;

  const frontmatter = [
    `id: ${note.id}`,
    `title: ${yamlScalar(note.title)}`,
    `tags: ${yamlList(tags)}`,
    `notebook: ${notebook === null ? 'null' : yamlScalar(notebook)}`,
    `captureType: ${note.captureType}`,
    `sourceUrl: ${note.sourceUrl === null ? 'null' : yamlScalar(note.sourceUrl)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
  ];

  return `---\n${frontmatter.join('\n')}\n---\n\n${note.content}`;
}

/** Cross-platform-safe, human-readable base name (no extension). */
export function sanitizeNoteFilename(title: string): string {
  const cleaned = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
    .slice(0, 80)
    .trim();
  return cleaned.length > 0 ? cleaned : 'Untitled';
}

/**
 * Human-readable filename. Empty titles get a short ID suffix so multiple untitled notes
 * do not collide (docs/DATABASE.md §9.1).
 */
export function buildExportFilename(note: Pick<Note, 'id' | 'title'>): string {
  const base = sanitizeNoteFilename(note.title);
  if (base === 'Untitled') {
    return `Untitled-${note.id.slice(0, 8)}.md`;
  }
  return `${base}.md`;
}

/**
 * Deterministic case-insensitive unique name for batch export (future vault export).
 * Appends ` (2)`, ` (3)`, … before the extension.
 */
export function resolveUniqueFilename(filename: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((name) => name.toLowerCase()));
  if (!lowerTaken.has(filename.toLowerCase())) return filename;

  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';

  let counter = 2;
  let candidate = `${base} (${counter})${extension}`;
  while (lowerTaken.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${base} (${counter})${extension}`;
  }
  return candidate;
}

const ATTACHMENT_REFERENCE = /!?\[[^\]]*\]\(([^)]+)\)/g;

/** Counts Markdown references to `attachments/…` (docs/DATABASE.md §7.2). */
export function countAttachmentReferences(content: string): number {
  let count = 0;
  for (const match of content.matchAll(ATTACHMENT_REFERENCE)) {
    const path = match[1]?.trim() ?? '';
    if (/(^|\/)attachments\//.test(path)) count += 1;
  }
  return count;
}
