import type { Clock, IdGenerator } from '@/core';
import { openDatabase, type Database } from '@/core/db/database';
import type { SqliteConnection } from '@/core/db/sqlite-port';
import { seedBuiltInTemplates } from '@/features/templates/data/seed-builtin-templates';
import { createRepositories, type Repositories } from '@/repositories';

import { createNodeConnection } from './node-sqlite-connection';

export type TestContext = {
  connection: SqliteConnection;
  db: Database;
  repos: Repositories;
  newId: IdGenerator;
  now: Clock;
};

const BASE_TIME = Date.parse('2026-01-01T00:00:00.000Z');

export async function createTestContext(options: { now?: Clock } = {}): Promise<TestContext> {
  const connection = createNodeConnection();
  const db = await openDatabase(connection);

  let idCounter = 0;
  const newId: IdGenerator = () => `id-${String(++idCounter).padStart(5, '0')}`;

  let tick = 0;
  const defaultNow: Clock = () => new Date(BASE_TIME + tick++ * 1000).toISOString();
  const now: Clock = options.now ?? defaultNow;

  await connection.withTransactionAsync(async (tx) => {
    await seedBuiltInTemplates(tx, now);
  });

  const repos = createRepositories(db, { newId, now });
  return { connection, db, repos, newId, now };
}

export async function closeTestContext(context: TestContext): Promise<void> {
  await context.connection.closeAsync();
}
