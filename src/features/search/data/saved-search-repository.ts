import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import {
  isSavedSearchSort,
  type SavedSearch,
  type SavedSearchFilters,
  type SavedSearchSort,
} from '../domain/saved-search';

type SavedSearchRow = {
  id: string;
  name: string;
  query: string;
  filters_json: string;
  sort: string;
  created_at: string;
  updated_at: string;
};

function parseFilters(json: string): SavedSearchFilters {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as SavedSearchFilters) : {};
  } catch {
    return {};
  }
}

function toSavedSearch(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    filters: parseFilters(row.filters_json),
    sort: isSavedSearchSort(row.sort) ? row.sort : 'updated_desc',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT =
  'SELECT id, name, query, filters_json, sort, created_at, updated_at FROM saved_searches';

export type SavedSearchRepository = ReturnType<typeof createSavedSearchRepository>;

export function createSavedSearchRepository(deps: { newId: IdGenerator; now: Clock }) {
  const { newId, now } = deps;

  async function getById(db: SqliteExecutor, id: string): Promise<SavedSearch | null> {
    const row = await db.getFirstAsync<SavedSearchRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toSavedSearch(row) : null;
  }

  return {
    getById,

    async create(
      db: SqliteExecutor,
      input: {
        id?: string;
        name: string;
        query?: string;
        filters?: SavedSearchFilters;
        sort?: SavedSearchSort;
        createdAt?: string;
        /** Import/restore only: preserve the exported timestamp instead of "now". */
        updatedAt?: string;
      },
    ): Promise<SavedSearch> {
      const id = input.id ?? newId();
      const timestamp = input.createdAt ?? now();
      const updatedAt = input.updatedAt ?? timestamp;
      await db.runAsync(
        `INSERT INTO saved_searches (id, name, query, filters_json, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name,
          input.query ?? '',
          JSON.stringify(input.filters ?? {}),
          input.sort ?? 'updated_desc',
          timestamp,
          updatedAt,
        ],
      );
      const saved = await getById(db, id);
      if (!saved) throw new Error(`Saved search ${id} was inserted but could not be read back`);
      return saved;
    },

    async list(db: SqliteExecutor): Promise<SavedSearch[]> {
      const rows = await db.getAllAsync<SavedSearchRow>(`${SELECT} ORDER BY name ASC`);
      return rows.map(toSavedSearch);
    },

    async update(
      db: SqliteExecutor,
      id: string,
      patch: {
        name?: string;
        query?: string;
        filters?: SavedSearchFilters;
        sort?: SavedSearchSort;
      },
    ): Promise<SavedSearch | null> {
      const current = await getById(db, id);
      if (!current) return null;
      await db.runAsync(
        'UPDATE saved_searches SET name = ?, query = ?, filters_json = ?, sort = ?, updated_at = ? WHERE id = ?',
        [
          patch.name ?? current.name,
          patch.query ?? current.query,
          JSON.stringify(patch.filters ?? current.filters),
          patch.sort ?? current.sort,
          now(),
          id,
        ],
      );
      return getById(db, id);
    },

    async remove(db: SqliteExecutor, id: string): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM saved_searches WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}
