import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import type { NewTemplate, Template } from '../domain/template';

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  is_builtin: number;
  created_at: string;
  updated_at: string;
};

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT =
  'SELECT id, name, description, content, is_builtin, created_at, updated_at FROM templates';

export type TemplateRepository = ReturnType<typeof createTemplateRepository>;

export function createTemplateRepository(deps: { newId: IdGenerator; now: Clock }) {
  const { newId, now } = deps;

  async function getById(db: SqliteExecutor, id: string): Promise<Template | null> {
    const row = await db.getFirstAsync<TemplateRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toTemplate(row) : null;
  }

  return {
    getById,

    async create(db: SqliteExecutor, input: NewTemplate): Promise<Template> {
      const id = input.id ?? newId();
      const timestamp = input.createdAt ?? now();
      const updatedAt = input.updatedAt ?? timestamp;
      await db.runAsync(
        `INSERT INTO templates (id, name, description, content, is_builtin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name,
          input.description ?? null,
          input.content ?? '',
          input.isBuiltin ? 1 : 0,
          timestamp,
          updatedAt,
        ],
      );
      const template = await getById(db, id);
      if (!template) throw new Error(`Template ${id} was inserted but could not be read back`);
      return template;
    },

    async list(db: SqliteExecutor): Promise<Template[]> {
      const rows = await db.getAllAsync<TemplateRow>(
        `${SELECT} ORDER BY is_builtin DESC, name ASC`,
      );
      return rows.map(toTemplate);
    },

    async update(
      db: SqliteExecutor,
      id: string,
      patch: { name?: string; description?: string | null; content?: string },
    ): Promise<Template | null> {
      const current = await getById(db, id);
      if (!current) return null;
      await db.runAsync(
        'UPDATE templates SET name = ?, description = ?, content = ?, updated_at = ? WHERE id = ?',
        [
          patch.name ?? current.name,
          patch.description === undefined ? current.description : patch.description,
          patch.content ?? current.content,
          now(),
          id,
        ],
      );
      return getById(db, id);
    },

    async remove(db: SqliteExecutor, id: string): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM templates WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}
