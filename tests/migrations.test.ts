import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '@/core/db/migrations';
import { migrate, readSchemaVersion } from '@/core/db/migrate';

import { createNodeConnection } from './helpers/node-sqlite-connection';

const EXPECTED_TABLES = [
  'app_metadata',
  'attachments',
  'note_links',
  'note_tags',
  'notebooks',
  'notes',
  'pending_file_deletions',
  'saved_searches',
  'tags',
  'templates',
];

test('fresh database applies every migration and records the version', async () => {
  const connection = createNodeConnection();
  const result = await migrate(connection);

  assert.deepEqual(
    result.applied,
    MIGRATIONS.map((migration) => migration.version),
  );
  assert.equal(await readSchemaVersion(connection), LATEST_SCHEMA_VERSION);

  const tables = (
    await connection.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
  ).map((row) => row.name);

  for (const table of EXPECTED_TABLES) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }

  await connection.closeAsync();
});

test('migrations are idempotent', async () => {
  const connection = createNodeConnection();
  await migrate(connection);

  const second = await migrate(connection);
  assert.deepEqual(second.applied, []);
  assert.equal(second.fromVersion, LATEST_SCHEMA_VERSION);
  assert.equal(second.toVersion, LATEST_SCHEMA_VERSION);

  await connection.closeAsync();
});

test('a database newer than the app is refused', async () => {
  const connection = createNodeConnection();
  await connection.execAsync('PRAGMA user_version = 9999');

  await assert.rejects(() => migrate(connection), /newer than this app understands/);

  await connection.closeAsync();
});

test('a failing migration is surfaced and fully rolled back', async () => {
  const connection = createNodeConnection();

  await assert.rejects(
    () =>
      migrate(connection, [
        {
          version: 1,
          name: 'broken',
          async up(db) {
            await db.execAsync('CREATE TABLE partial (id TEXT)');
            throw new Error('boom');
          },
        },
      ]),
    /Migration 1 \(broken\) failed/,
  );

  assert.equal(await readSchemaVersion(connection), 0);
  const leftovers = await connection.getAllAsync(
    "SELECT name FROM sqlite_master WHERE name = 'partial'",
  );
  assert.equal(leftovers.length, 0);

  await connection.closeAsync();
});
