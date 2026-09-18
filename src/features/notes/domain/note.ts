/** Note entity and pure rules (docs/DATABASE.md §4.2, ARCHITECTURE.md §3.1). */

export type CaptureType = 'text' | 'image' | 'voice' | 'url' | 'file' | 'mixed';

export type Note = {
  id: string;
  title: string;
  /** Derived normalized title used for wikilink matching (docs/DATABASE.md §4.5). */
  titleKey: string;
  content: string;
  captureType: CaptureType;
  notebookId: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
};

export type NewNote = {
  id?: string;
  title?: string;
  content?: string;
  captureType?: CaptureType;
  notebookId?: string | null;
  sourceUrl?: string | null;
  createdAt?: string;
  /** Import/restore only: preserve the exported timestamp instead of "now". */
  updatedAt?: string;
  openedAt?: string | null;
};

export type NotePatch = {
  title?: string;
  content?: string;
  captureType?: CaptureType;
  notebookId?: string | null;
  sourceUrl?: string | null;
};

export type NoteOrder = 'updated_desc' | 'opened_desc' | 'created_desc' | 'created_asc';

export type Page = {
  limit?: number;
  offset?: number;
};

/**
 * Normalized title key. Unicode NFKC + trim + collapse internal whitespace + lowercase,
 * matching the documented title-matching rule (docs/DATABASE.md §4.5).
 */
export function normalizeTitleKey(title: string): string {
  return title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isCaptureType(value: string): value is CaptureType {
  return (
    value === 'text' ||
    value === 'image' ||
    value === 'voice' ||
    value === 'url' ||
    value === 'file' ||
    value === 'mixed'
  );
}
