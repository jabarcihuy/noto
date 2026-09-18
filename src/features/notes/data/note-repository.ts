import type { Clock, IdGenerator } from '@/core';
import type { SearchIndex } from '@/core/db/search-index';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import {
  normalizeTitleKey,
  type CaptureType,
  type NewNote,
  type Note,
  type NoteOrder,
  type NotePatch,
  type Page,
} from '../domain/note';

type NoteRow = {
  id: string;
  title: string;
  title_key: string;
  content: string;
  capture_type: CaptureType;
  notebook_id: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  opened_at: string | null;
};

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    titleKey: row.title_key,
    content: row.content,
    captureType: row.capture_type,
    notebookId: row.notebook_id,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    openedAt: row.opened_at,
  };
}

const SELECT = `
  SELECT id, title, title_key, content, capture_type, notebook_id, source_url,
         created_at, updated_at, opened_at
  FROM notes
`;

export type NoteRepository = ReturnType<typeof createNoteRepository>;

export function createNoteRepository(deps: { index: SearchIndex; newId: IdGenerator; now: Clock }) {
  const { index, newId, now } = deps;

  async function getById(db: SqliteExecutor, id: string): Promise<Note | null> {
    const row = await db.getFirstAsync<NoteRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toNote(row) : null;
  }

  async function create(db: SqliteExecutor, input: NewNote = {}): Promise<Note> {
    const id = input.id ?? newId();
    const timestamp = input.createdAt ?? now();
    const updatedAt = input.updatedAt ?? timestamp;
    const title = input.title ?? '';
    const content = input.content ?? '';
    const captureType = input.captureType ?? 'text';
    const notebookId = input.notebookId ?? null;
    const sourceUrl = input.sourceUrl ?? null;

    await db.runAsync(
      `INSERT INTO notes
         (id, title, title_key, content, capture_type, notebook_id, source_url,
          created_at, updated_at, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        normalizeTitleKey(title),
        content,
        captureType,
        notebookId,
        sourceUrl,
        timestamp,
        updatedAt,
        input.openedAt ?? null,
      ],
    );

    const note = await getById(db, id);
    if (!note) throw new Error(`Note ${id} was inserted but could not be read back`);
    await index.upsertNote(db, { id: note.id, title: note.title, content: note.content });
    return note;
  }

  async function update(db: SqliteExecutor, id: string, patch: NotePatch): Promise<Note | null> {
    const current = await getById(db, id);
    if (!current) return null;

    const title = patch.title ?? current.title;
    const content = patch.content ?? current.content;
    const captureType = patch.captureType ?? current.captureType;
    const notebookId = patch.notebookId === undefined ? current.notebookId : patch.notebookId;
    const sourceUrl = patch.sourceUrl === undefined ? current.sourceUrl : patch.sourceUrl;

    await db.runAsync(
      `UPDATE notes
         SET title = ?, title_key = ?, content = ?, capture_type = ?, notebook_id = ?,
             source_url = ?, updated_at = ?
       WHERE id = ?`,
      [title, normalizeTitleKey(title), content, captureType, notebookId, sourceUrl, now(), id],
    );

    const note = await getById(db, id);
    if (!note) throw new Error(`Note ${id} was updated but could not be read back`);
    await index.upsertNote(db, { id: note.id, title: note.title, content: note.content });
    return note;
  }

  async function remove(db: SqliteExecutor, id: string): Promise<boolean> {
    const result = await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
    await index.removeNote(db, id);
    return result.changes > 0;
  }

  async function list(
    db: SqliteExecutor,
    query: Page & { order?: NoteOrder } = {},
  ): Promise<Note[]> {
    const { limit = 50, offset = 0, order = 'updated_desc' } = query;
    const orderBy: Record<NoteOrder, string> = {
      updated_desc: 'updated_at DESC, id ASC',
      opened_desc: 'opened_at DESC, updated_at DESC, id ASC',
      created_desc: 'created_at DESC, id ASC',
      created_asc: 'created_at ASC, id ASC',
    };
    const rows = await db.getAllAsync<NoteRow>(
      `${SELECT} ORDER BY ${orderBy[order]} LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows.map(toNote);
  }

  return {
    getById,
    create,
    update,
    remove,

    async markOpened(db: SqliteExecutor, id: string): Promise<void> {
      await db.runAsync('UPDATE notes SET opened_at = ? WHERE id = ?', [now(), id]);
    },

    list,

    /** Recent = most recently updated, paged (docs/FEATURES.md §7.4). */
    async listRecent(db: SqliteExecutor, page: Page = {}): Promise<Note[]> {
      return list(db, { ...page, order: 'updated_desc' });
    },

    async listByNotebook(
      db: SqliteExecutor,
      notebookId: string | null,
      page: Page = {},
    ): Promise<Note[]> {
      const { limit = 50, offset = 0 } = page;
      const rows = await db.getAllAsync<NoteRow>(
        `${SELECT} WHERE notebook_id IS ? ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`,
        [notebookId, limit, offset],
      );
      return rows.map(toNote);
    },

    async findByTitleKey(db: SqliteExecutor, titleKey: string): Promise<Note[]> {
      const rows = await db.getAllAsync<NoteRow>(
        `${SELECT} WHERE title_key = ? ORDER BY created_at ASC, id ASC`,
        [titleKey],
      );
      return rows.map(toNote);
    },

    /** Prefix search over the indexed title key; used by wikilink suggestions. */
    async searchByTitlePrefix(db: SqliteExecutor, prefix: string, limit = 10): Promise<Note[]> {
      const escaped = prefix.replace(/[%_\\]/g, '\\$&');
      const rows = await db.getAllAsync<NoteRow>(
        `${SELECT} WHERE title_key LIKE ? ESCAPE '\\' ORDER BY updated_at DESC, id ASC LIMIT ?`,
        [`${escaped}%`, limit],
      );
      return rows.map(toNote);
    },

    async getManyByIds(db: SqliteExecutor, ids: string[]): Promise<Note[]> {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      const rows = await db.getAllAsync<NoteRow>(`${SELECT} WHERE id IN (${placeholders})`, ids);
      return rows.map(toNote);
    },

    async count(db: SqliteExecutor): Promise<number> {
      const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM notes');
      return Number(row?.count ?? 0);
    },
  };
}
