import type { SqliteConnection } from '@/core/db/sqlite-port';

import type { TemplateRepository } from '../data/template-repository';
import type { Template } from '../domain/template';

export type TemplateUseCases = ReturnType<typeof createTemplateUseCases>;

/**
 * Read-only template application layer (docs/FEATURES.md §6). Built-ins are seeded by the
 * database boundary; MVP exposes listing and reading only. Custom template management is
 * explicitly out of scope, so no create/update/delete is exposed here even though the
 * repository supports it for later phases.
 */
export function createTemplateUseCases(deps: {
  connection: SqliteConnection;
  templates: TemplateRepository;
}) {
  const { connection, templates } = deps;

  return {
    list(): Promise<Template[]> {
      return templates.list(connection);
    },

    getById(id: string): Promise<Template | null> {
      return templates.getById(connection, id);
    },
  };
}
