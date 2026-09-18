/**
 * Driver-agnostic SQLite port (docs/ARCHITECTURE.md §3.2, §7).
 *
 * Domain and application layers never see this; the data layer and migrations do.
 * `expo-sqlite` is one implementation; the Node test driver is another. Keeping the
 * port small lets the same schema, migrations, and repositories run against both.
 */

export type SqlValue = string | number | null | Uint8Array;

export type RunResult = {
  changes: number;
  lastInsertRowId: number;
};

/** Read/write surface shared by a connection and a transaction. */
export interface SqliteExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<RunResult>;
  getAllAsync<T = unknown>(sql: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T = unknown>(sql: string, params?: SqlValue[]): Promise<T | null>;
}

export interface SqliteConnection extends SqliteExecutor {
  /** Identifies the driver for diagnostics/tests. */
  readonly driver: string;
  /**
   * Runs `task` inside a database transaction. If `task` throws, the transaction is
   * rolled back and the error propagates (docs/DATABASE.md §10.10).
   */
  withTransactionAsync<T>(task: (tx: SqliteExecutor) => Promise<T>): Promise<T>;
  closeAsync(): Promise<void>;
}
