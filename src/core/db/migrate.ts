import { MIGRATIONS } from './migrations';
import type { Migration } from './migrations/types';
import type { SqliteConnection } from './sqlite-port';

export type MigrationResult = {
  fromVersion: number;
  toVersion: number;
  applied: number[];
};

export async function readSchemaVersion(db: SqliteConnection): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return Number(row?.user_version ?? 0);
}

function latestVersion(migrations: readonly Migration[]): number {
  return migrations.reduce((max, migration) => Math.max(max, migration.version), 0);
}

/**
 * Applies pending migrations in order, each inside its own transaction, then advances
 * `PRAGMA user_version` (docs/DATABASE.md §8).
 *
 * Failures are surfaced with the failing migration's version and name. A database whose
 * version is newer than the app understands is refused rather than downgraded.
 */
export async function migrate(
  connection: SqliteConnection,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  const fromVersion = await readSchemaVersion(connection);
  const target = latestVersion(migrations);

  if (fromVersion > target) {
    throw new Error(
      `Database schema version ${fromVersion} is newer than this app understands (${target}); refusing to open.`,
    );
  }

  const pending = migrations
    .filter((migration) => migration.version > fromVersion)
    .sort((a, b) => a.version - b.version);

  const applied: number[] = [];
  for (const migration of pending) {
    try {
      await connection.withTransactionAsync(async (tx) => {
        await migration.up(tx);
        await tx.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
      applied.push(migration.version);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed and was rolled back: ${reason}`,
      );
    }
  }

  return { fromVersion, toVersion: await readSchemaVersion(connection), applied };
}
