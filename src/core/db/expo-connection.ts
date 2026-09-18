import * as SQLite from 'expo-sqlite';

import type { RunResult, SqliteConnection, SqliteExecutor, SqlValue } from './sqlite-port';

/**
 * `expo-sqlite` implementation of the SQLite port. This is the only production file
 * allowed to import `expo-sqlite` (docs/ARCHITECTURE.md §7).
 */

type ExpoDatabase = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<RunResult>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
};

export async function createExpoConnection(databaseName: string): Promise<SqliteConnection> {
  const raw = (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoDatabase;

  const executor: SqliteExecutor = {
    execAsync: (sql) => raw.execAsync(sql),
    runAsync: (sql, params = []) => raw.runAsync(sql, params),
    getAllAsync: <T>(sql: string, params: SqlValue[] = []) => raw.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: SqlValue[] = []) => raw.getFirstAsync<T>(sql, params),
  };

  return {
    ...executor,
    driver: 'expo-sqlite',
    async withTransactionAsync<T>(task: (tx: SqliteExecutor) => Promise<T>): Promise<T> {
      let result!: T;
      await raw.withTransactionAsync(async () => {
        result = await task(executor);
      });
      return result;
    },
    closeAsync: () => raw.closeAsync(),
  };
}
