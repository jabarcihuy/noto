import type { SqliteConnection } from '@/core/db/sqlite-port';
import type { LinkRepository } from '@/features/links/data/note-link-repository';

import type { NoteRepository } from '../data/note-repository';

/**
 * Deletes a note atomically while preserving data integrity (docs/DATABASE.md §10.3):
 * incoming links are captured, the note is deleted (FK nulls their target), then their
 * resolution is recomputed. Source notes are never destroyed.
 */
export async function deleteNote(
  connection: SqliteConnection,
  deps: { notes: NoteRepository; links: LinkRepository },
  noteId: string,
): Promise<boolean> {
  return connection.withTransactionAsync(async (tx) => {
    const affected = await deps.links.listIdsByTarget(tx, noteId);
    const removed = await deps.notes.remove(tx, noteId);
    if (affected.length > 0) {
      await deps.links.resolveLinks(tx, { ids: affected });
    }
    return removed;
  });
}
