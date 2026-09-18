import type { SqliteConnection } from '@/core/db/sqlite-port';

export type DatabaseDiagnostics = {
  integrity: string;
  foreignKeyViolations: number;
  schemaVersion: number;
  fts5: boolean;
  noteCount: number;
  attachmentCount: number;
};

export type DiagnosticsUseCases = ReturnType<typeof createDiagnosticsUseCases>;

/**
 * Read-only database diagnostics (docs/DATABASE.md §10.16). Used by Settings for support
 * and by tests; it never repairs or deletes data.
 */
export function createDiagnosticsUseCases(deps: {
  connection: SqliteConnection;
  schemaVersion: number;
  fts5: boolean;
}) {
  const { connection } = deps;

  return {
    async run(): Promise<DatabaseDiagnostics> {
      const integrityRow = await connection.getFirstAsync<{ integrity_check: string }>(
        'PRAGMA integrity_check',
      );
      const violations = await connection.getAllAsync<Record<string, unknown>>(
        'PRAGMA foreign_key_check',
      );
      const notes = await connection.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM notes',
      );
      const attachments = await connection.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM attachments',
      );

      return {
        integrity: integrityRow?.integrity_check ?? 'unknown',
        foreignKeyViolations: violations.length,
        schemaVersion: deps.schemaVersion,
        fts5: deps.fts5,
        noteCount: Number(notes?.count ?? 0),
        attachmentCount: Number(attachments?.count ?? 0),
      };
    },
  };
}
