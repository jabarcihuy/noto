/** Note link entity and resolution states (docs/DATABASE.md §4.5, PRD §10). */

export type LinkResolution = 'resolved' | 'unresolved' | 'ambiguous';

export type NoteLink = {
  id: string;
  sourceNoteId: string;
  targetNoteId: string | null;
  resolution: LinkResolution;
  /** Normalized target key as written. */
  targetText: string;
  displayText: string | null;
  anchor: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkInput = {
  /** Raw target as written in content; normalized on write. */
  targetText: string;
  displayText?: string | null;
  anchor?: string | null;
};

/** Identity of a link inside a note, used for dedup and for preserving resolution. */
export function linkIdentityKey(
  targetText: string,
  displayText: string | null,
  anchor: string | null,
): string {
  return `${targetText}\u0000${displayText ?? ''}\u0000${anchor ?? ''}`;
}
