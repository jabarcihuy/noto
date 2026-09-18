import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import type { Notebook } from '../domain/notebook';

type NotebookRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function toNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = 'SELECT id, name, sort_order, created_at, updated_at FROM notebooks';

export type NotebookRepository = ReturnType<typeof createNotebookRepository>;

export function createNotebookRepository(deps: { newId: IdGenerator; now: Clock }) {
  const { newId, now } = deps;

  async function getById(db: SqliteExecutor, id: string): Promise<Notebook | null> {
    const row = await db.getFirstAsync<NotebookRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toNotebook(row) : null;
  }

  return {
    getById,

    async create(
      db: SqliteExecutor,
      input: { name: string; sortOrder?: number; id?: string; createdAt?: string },
    ): Promise<Notebook> {
      const id = input.id ?? newId();
      const timestamp = input.createdAt ?? now();
      await db.runAsync(
        'INSERT INTO notebooks (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, input.name, input.sortOrder ?? 0, timestamp, timestamp],
      );
      const notebook = await getById(db, id);
      if (!notebook) throw new Error(`Notebook ${id} was inserted but could not be read back`);
      return notebook;
    },

    async list(db: SqliteExecutor): Promise<Notebook[]> {
      const rows = await db.getAllAsync<NotebookRow>(`${SELECT} ORDER BY sort_order ASC, name ASC`);
      return rows.map(toNotebook);
    },

    async update(
      db: SqliteExecutor,
      id: string,
      patch: { name?: string; sortOrder?: number },
    ): Promise<Notebook | null> {
      const current = await getById(db, id);
      if (!current) return null;
      await db.runAsync(
        'UPDATE notebooks SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        [patch.name ?? current.name, patch.sortOrder ?? current.sortOrder, now(), id],
      );
      return getById(db, id);
    },

    /** Deleting a notebook never deletes notes; FK sets notes.notebook_id = NULL. */
    async remove(db: SqliteExecutor, id: string): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM notebooks WHERE id = ?', [id]);
      return result.changes > 0;
    },

    async assignNote(db: SqliteExecutor, noteId: string, notebookId: string): Promise<void> {
      await db.runAsync('UPDATE notes SET notebook_id = ?, updated_at = ? WHERE id = ?', [
        notebookId,
        now(),
        noteId,
      ]);
    },

    async removeNoteFromNotebook(db: SqliteExecutor, noteId: string): Promise<void> {
      await db.runAsync('UPDATE notes SET notebook_id = NULL, updated_at = ? WHERE id = ?', [
        now(),
        noteId,
      ]);
    },
  };
}
