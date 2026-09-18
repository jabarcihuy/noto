import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import { normalizeTagName, tagDisplayName, type Tag } from '../domain/tag';

type TagRow = {
  id: string;
  name: string;
  display_name: string;
  created_at: string;
};

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

const SELECT = 'SELECT id, name, display_name, created_at FROM tags';

export type TagRepository = ReturnType<typeof createTagRepository>;

export function createTagRepository(deps: { newId: IdGenerator; now: Clock }) {
  const { newId, now } = deps;

  async function getById(db: SqliteExecutor, id: string): Promise<Tag | null> {
    const row = await db.getFirstAsync<TagRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toTag(row) : null;
  }

  async function findByName(db: SqliteExecutor, name: string): Promise<Tag | null> {
    const row = await db.getFirstAsync<TagRow>(`${SELECT} WHERE name = ?`, [name]);
    return row ? toTag(row) : null;
  }

  return {
    getById,
    findByName,

    /** Finds the canonical tag or creates it, preserving first-seen casing. */
    async findOrCreate(db: SqliteExecutor, rawName: string): Promise<Tag> {
      const name = normalizeTagName(rawName);
      const existing = await findByName(db, name);
      if (existing) return existing;

      const id = newId();
      await db.runAsync(
        'INSERT INTO tags (id, name, display_name, created_at) VALUES (?, ?, ?, ?)',
        [id, name, tagDisplayName(rawName), now()],
      );
      const created = await getById(db, id);
      if (!created) throw new Error(`Tag ${name} was inserted but could not be read back`);
      return created;
    },

    async list(db: SqliteExecutor): Promise<Tag[]> {
      const rows = await db.getAllAsync<TagRow>(`${SELECT} ORDER BY name ASC`);
      return rows.map(toTag);
    },

    async attachToNote(db: SqliteExecutor, noteId: string, tagId: string): Promise<void> {
      await db.runAsync(
        'INSERT OR IGNORE INTO note_tags (note_id, tag_id, created_at) VALUES (?, ?, ?)',
        [noteId, tagId, now()],
      );
    },

    async removeFromNote(db: SqliteExecutor, noteId: string, tagId: string): Promise<void> {
      await db.runAsync('DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?', [noteId, tagId]);
    },

    async listForNote(db: SqliteExecutor, noteId: string): Promise<Tag[]> {
      const rows = await db.getAllAsync<TagRow>(
        `SELECT t.id, t.name, t.display_name, t.created_at
           FROM note_tags nt
           JOIN tags t ON t.id = nt.tag_id
          WHERE nt.note_id = ?
          ORDER BY t.name ASC`,
        [noteId],
      );
      return rows.map(toTag);
    },

    /** One query for every note's normalized tag names; used by vault export. */
    async listNoteTagNames(db: SqliteExecutor): Promise<Map<string, string[]>> {
      const rows = await db.getAllAsync<{ note_id: string; name: string }>(
        `SELECT nt.note_id AS note_id, t.name AS name
           FROM note_tags nt
           JOIN tags t ON t.id = nt.tag_id
          ORDER BY nt.note_id ASC, t.name ASC`,
      );
      const result = new Map<string, string[]>();
      for (const row of rows) {
        const names = result.get(row.note_id);
        if (names) names.push(row.name);
        else result.set(row.note_id, [row.name]);
      }
      return result;
    },

    async listNoteIdsByTag(
      db: SqliteExecutor,
      tagId: string,
      page: { limit?: number; offset?: number } = {},
    ): Promise<string[]> {
      const { limit = 50, offset = 0 } = page;
      const rows = await db.getAllAsync<{ note_id: string }>(
        `SELECT nt.note_id
           FROM note_tags nt
           JOIN notes n ON n.id = nt.note_id
          WHERE nt.tag_id = ?
          ORDER BY n.updated_at DESC, n.id ASC
          LIMIT ? OFFSET ?`,
        [tagId, limit, offset],
      );
      return rows.map((row) => row.note_id);
    },

    /**
     * Explicit tag deletion only (docs/DATABASE.md §4.3). Never called automatically;
     * deleting a tag removes its assignments but no notes.
     */
    async remove(db: SqliteExecutor, tagId: string): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM tags WHERE id = ?', [tagId]);
      return result.changes > 0;
    },
  };
}
