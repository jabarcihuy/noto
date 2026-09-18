import type { SqliteExecutor } from './sqlite-port';

/**
 * Internal application metadata (docs/DATABASE.md §4.9). This is separate from product
 * data and is not a general settings store.
 */
export type AppMetadataRepository = ReturnType<typeof createAppMetadataRepository>;

export function createAppMetadataRepository() {
  return {
    async get(db: SqliteExecutor, key: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_metadata WHERE key = ?',
        [key],
      );
      return row?.value ?? null;
    },

    async set(db: SqliteExecutor, key: string, value: string): Promise<void> {
      await db.runAsync(
        'INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    },

    async remove(db: SqliteExecutor, key: string): Promise<void> {
      await db.runAsync('DELETE FROM app_metadata WHERE key = ?', [key]);
    },

    async all(db: SqliteExecutor): Promise<Record<string, string>> {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM app_metadata ORDER BY key ASC',
      );
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
  };
}
