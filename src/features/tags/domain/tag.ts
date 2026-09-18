/** Tag entity and normalized identity (docs/DATABASE.md §4.3, PRD §10.5). */

export type Tag = {
  id: string;
  /** Canonical identity: NFKC + trim + lowercase. */
  name: string;
  /** First-seen casing, shown to the user. */
  displayName: string;
  createdAt: string;
};

/** Canonical tag identity. Throws on an empty tag. */
export function normalizeTagName(raw: string): string {
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error('Tag name must not be empty');
  }
  return normalized;
}

/** Display casing preserves the user's original spelling (trimmed). */
export function tagDisplayName(raw: string): string {
  return raw.normalize('NFKC').trim();
}
