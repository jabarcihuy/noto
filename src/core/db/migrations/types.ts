import type { SqliteExecutor } from '../sqlite-port';

/**
 * One ordered schema step. `up` runs inside its own transaction; the runner sets
 * `PRAGMA user_version` after `up` succeeds. Existing migrations are never edited once
 * applied (docs/DATABASE.md §8).
 */
export type Migration = {
  version: number;
  name: string;
  up: (db: SqliteExecutor) => Promise<void>;
};
