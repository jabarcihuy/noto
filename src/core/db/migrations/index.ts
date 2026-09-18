import { migration001InitialSchema } from './001-initial-schema';
import type { Migration } from './types';

export type { Migration } from './types';

/** Ordered migration history. Append new migrations; never edit existing ones. */
export const MIGRATIONS: readonly Migration[] = [migration001InitialSchema];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);
