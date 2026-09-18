import type { SqliteExecutor } from '@/core/db/sqlite-port';

import type { LinkRepository } from '../data/note-link-repository';
import type { LinkInput } from '../domain/note-link';
import { parseWikilinks } from '../domain/wikilink-parser';

/**
 * Port the notes feature depends on to keep `note_links` consistent with note content,
 * without importing the links data layer (docs/ARCHITECTURE.md §4).
 */
export type NoteLinkReconciler = {
  /** Replaces a note's outgoing links with those parsed from its content. */
  reconcile(db: SqliteExecutor, noteId: string, content: string): Promise<void>;
  /** Resolves not-yet-connected links that reference a normalized title. */
  resolveByTargetText(db: SqliteExecutor, targetText: string): Promise<void>;
};

/**
 * Reconciles `note_links` from parsed content and resolves newly-connected links.
 * Resolution is delegated to the repository, which only ever touches rows whose target
 * is `NULL` (docs/DATABASE.md §4.5).
 */
export function createNoteLinkReconciler(links: LinkRepository): NoteLinkReconciler {
  return {
    async reconcile(db, noteId, content) {
      const inputs: LinkInput[] = parseWikilinks(content).map((link) => ({
        targetText: link.target,
        displayText: link.displayText,
        anchor: link.anchor,
      }));
      await links.replaceLinksForNote(db, noteId, inputs);
    },

    async resolveByTargetText(db, targetText) {
      if (targetText.length === 0) return;
      await links.resolveByTargetText(db, targetText);
    },
  };
}
