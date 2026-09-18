import { migrate, readSchemaVersion, type MigrationResult } from './migrate';
import { createSearchIndex, type SearchIndex } from './search-index';
import type { SqliteConnection } from './sqlite-port';

export type DatabaseCapabilities = {
  /** True when the runtime-provided SQLite build has FTS5 (docs/DATABASE.md §6). */
  fts5: boolean;
};

export type Database = {
  connection: SqliteConnection;
  capabilities: DatabaseCapabilities;
  searchIndex: SearchIndex;
  schemaVersion: number;
  migration: MigrationResult;
  close(): Promise<void>;
};

/**
 * The single database initialization boundary (docs/ARCHITECTURE.md §3.2, §7).
 *
 * Enables and verifies foreign keys, runs migrations, and detects FTS5 support. It does
 * not seed or expose product data; composition adds features and seeding.
 */
export async function openDatabase(connection: SqliteConnection): Promise<Database> {
  await connection.execAsync('PRAGMA foreign_keys = ON;');
  const fk = await connection.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  if (Number(fk?.foreign_keys ?? 0) !== 1) {
    throw new Error('SQLite foreign key enforcement could not be enabled for this connection.');
  }

  const migration = await migrate(connection);

  const ftsRow = await connection.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'",
  );
  const capabilities: DatabaseCapabilities = { fts5: Boolean(ftsRow) };

  return {
    connection,
    capabilities,
    searchIndex: createSearchIndex(capabilities.fts5),
    schemaVersion: await readSchemaVersion(connection),
    migration,
    close: () => connection.closeAsync(),
  };
}
