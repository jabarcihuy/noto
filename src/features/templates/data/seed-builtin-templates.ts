import type { Clock } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import { BUILT_IN_TEMPLATES } from '../domain/builtin-templates';

/**
 * Seeds built-in templates idempotently (docs/DATABASE.md §8). Safe to run on every
 * startup: existing rows are left untouched.
 */
export async function seedBuiltInTemplates(db: SqliteExecutor, clock: Clock): Promise<void> {
  const timestamp = clock();
  for (const template of BUILT_IN_TEMPLATES) {
    await db.runAsync(
      `INSERT INTO templates (id, name, description, content, is_builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [template.id, template.name, template.description, template.content, timestamp, timestamp],
    );
  }
}
