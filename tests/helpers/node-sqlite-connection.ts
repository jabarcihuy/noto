/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';

import type { RunResult, SqliteConnection, SqliteExecutor, SqlValue } from '@/core/db/sqlite-port';

/**
 * Node's built-in `node:sqlite` adapted to the SQLite port. Used only by tests; the app
 * uses the expo-sqlite adapter. This lets migrations, foreign keys, and repositories run
 * against a real SQLite in CI without a device.
 */
export function createNodeConnection(path = ':memory:'): SqliteConnection {
  const raw = new DatabaseSync(path);

  const executor: SqliteExecutor = {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params: SqlValue[] = []): Promise<RunResult> {
      const statement = raw.prepare(sql);
      const result = statement.run(...(params as never[]));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      const statement = raw.prepare(sql);
      return statement.all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
      const statement = raw.prepare(sql);
      const row = statement.get(...(params as never[]));
      return (row ?? null) as T | null;
    },
  };

  return {
    ...executor,
    driver: 'node:sqlite',
    async withTransactionAsync<T>(task: (tx: SqliteExecutor) => Promise<T>): Promise<T> {
      raw.exec('BEGIN');
      try {
        const result = await task(executor);
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync() {
      raw.close();
    },
  };
}
