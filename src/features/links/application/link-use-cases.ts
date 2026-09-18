import type { SqliteConnection, SqliteExecutor } from '@/core/db/sqlite-port';
import type { Note } from '@/features/notes/domain/note';
import { normalizeTitleKey } from '@/features/notes/domain/note';

import type { LinkRepository } from '../data/note-link-repository';
import type { NoteLink } from '../domain/note-link';

/**
 * Read-only note lookups the link application needs. Implemented by the notes repository
 * and injected at the composition root; the links feature never writes notes itself.
 */
export type LinkNotePort = {
  findByTitleKey(db: SqliteExecutor, titleKey: string): Promise<Note[]>;
  searchByTitlePrefix(db: SqliteExecutor, prefix: string, limit?: number): Promise<Note[]>;
  getManyByIds(db: SqliteExecutor, ids: string[]): Promise<Note[]>;
  listRecent(db: SqliteExecutor, page?: { limit?: number; offset?: number }): Promise<Note[]>;
};

export type LinkUseCases = ReturnType<typeof createLinkUseCases>;

/**
 * Application layer for wikilinks, backlinks, suggestions, and target selection
 * (docs/FEATURES.md §3, docs/UX_FLOW.md §7). The editor and reader call these; they never
 * touch `note_links` directly and never use raw SQL.
 */
export function createLinkUseCases(deps: {
  connection: SqliteConnection;
  links: LinkRepository;
  notes: LinkNotePort;
}) {
  const { connection, links, notes } = deps;

  return {
    /** Outgoing links of a note, classified by the repository. */
    async listBySource(noteId: string): Promise<NoteLink[]> {
      return links.listBySource(connection, noteId);
    },

    /**
     * Notes that reference `noteId`, derived from `note_links` (never stored separately).
     * Each source note appears once even when it links with several aliases.
     */
    async listBacklinks(noteId: string): Promise<Note[]> {
      const incoming = await links.listBacklinks(connection, noteId);
      const orderedIds: string[] = [];
      const seen = new Set<string>();
      for (const link of incoming) {
        if (seen.has(link.sourceNoteId)) continue;
        seen.add(link.sourceNoteId);
        orderedIds.push(link.sourceNoteId);
      }
      const found = await notes.getManyByIds(connection, orderedIds);
      const byId = new Map(found.map((note) => [note.id, note]));
      return orderedIds.flatMap((id) => {
        const note = byId.get(id);
        return note ? [note] : [];
      });
    },

    /**
     * Title suggestions for the `[[` autocomplete. An empty query returns recent notes so
     * the user sees choices as soon as they open the brackets.
     */
    async suggest(query: string, limit = 10): Promise<Note[]> {
      const key = normalizeTitleKey(query);
      if (key.length === 0) return notes.listRecent(connection, { limit });
      return notes.searchByTitlePrefix(connection, key, limit);
    },

    /**
     * Every note whose normalized title equals `targetText`. Zero, one, or many results;
     * the caller never auto-selects among several (docs/DATABASE.md §4.5).
     */
    async candidatesFor(targetText: string): Promise<Note[]> {
      return notes.findByTitleKey(connection, normalizeTitleKey(targetText));
    },

    /**
     * Connects a link to a user-chosen note. This is the only path that sets a target on
     * an ambiguous/unresolved link; it never changes note content and never re-points an
     * already-resolved link to a different note.
     */
    async resolveLink(linkId: string, targetNoteId: string): Promise<void> {
      await connection.withTransactionAsync((tx) => links.setTarget(tx, linkId, targetNoteId));
    },
  };
}
