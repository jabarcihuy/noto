import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';

test('a committed transaction persists its writes', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await connection.withTransactionAsync(async (tx) => {
    await repos.notes.create(tx, { title: 'Commit' });
  });

  assert.equal(await repos.notes.count(connection), 1);
  await closeTestContext(context);
});

test('a transaction that fails midway is fully rolled back', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await assert.rejects(
    connection.withTransactionAsync(async (tx) => {
      await repos.notes.create(tx, { title: 'Akan dibatalkan' });
      await repos.notebooks.create(tx, { name: 'Juga dibatalkan' });
      throw new Error('intentional failure');
    }),
    /intentional failure/,
  );

  assert.equal(await repos.notes.count(connection), 0);
  assert.equal(
    Number(
      (await connection.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM notebooks'))?.c,
    ),
    0,
  );
  await closeTestContext(context);
});
