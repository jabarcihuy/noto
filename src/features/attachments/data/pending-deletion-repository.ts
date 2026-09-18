import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

/**
 * Queue of attachment files awaiting filesystem deletion (docs/DATABASE.md §4.10, §7.3).
 * Rows are written in the same DB transaction that removes metadata; files are deleted
 * afterwards and removed from the queue by the reconciliation sweep.
 */
export type PendingDeletionRepository = ReturnType<typeof createPendingDeletionRepository>;

export function createPendingDeletionRepository(_deps: { newId: IdGenerator; now: Clock }) {
  return {
    async enqueue(db: SqliteExecutor, relativePath: string, at: string): Promise<void> {
      await db.runAsync(
        'INSERT OR IGNORE INTO pending_file_deletions (relative_path, created_at) VALUES (?, ?)',
        [relativePath, at],
      );
    },

    async list(db: SqliteExecutor): Promise<string[]> {
      const rows = await db.getAllAsync<{ relative_path: string }>(
        'SELECT relative_path FROM pending_file_deletions ORDER BY created_at ASC',
      );
      return rows.map((row) => row.relative_path);
    },

    async remove(db: SqliteExecutor, relativePath: string): Promise<void> {
      await db.runAsync('DELETE FROM pending_file_deletions WHERE relative_path = ?', [
        relativePath,
      ]);
    },
  };
}
