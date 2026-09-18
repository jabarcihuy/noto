import type { SqliteExecutor } from './sqlite-port';

/**
 * Search index maintenance (docs/DATABASE.md §6). The canonical index is FTS5; if the
 * runtime lacks FTS5 the no-op index is selected and search falls back to `LIKE` when the
 * search feature is built. The index is never silently swapped for another architecture.
 */
export interface SearchIndex {
  readonly kind: 'fts5' | 'none';
  upsertNote(
    db: SqliteExecutor,
    note: { id: string; title: string; content: string },
  ): Promise<void>;
  removeNote(db: SqliteExecutor, id: string): Promise<void>;
}

export const fts5SearchIndex: SearchIndex = {
  kind: 'fts5',
  async upsertNote(db, note) {
    await db.runAsync('DELETE FROM notes_fts WHERE note_id = ?', [note.id]);
    await db.runAsync('INSERT INTO notes_fts (note_id, title, content) VALUES (?, ?, ?)', [
      note.id,
      note.title,
      note.content,
    ]);
  },
  async removeNote(db, id) {
    await db.runAsync('DELETE FROM notes_fts WHERE note_id = ?', [id]);
  },
};

export const noopSearchIndex: SearchIndex = {
  kind: 'none',
  async upsertNote() {
    // FTS5 unavailable; the LIKE fallback queries the notes table directly.
  },
  async removeNote() {
    // no index to maintain
  },
};

export function createSearchIndex(fts5Available: boolean): SearchIndex {
  return fts5Available ? fts5SearchIndex : noopSearchIndex;
}
