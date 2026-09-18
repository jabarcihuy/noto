import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';

test('saved searches persist name, query, filters, and sort', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const created = await repos.savedSearches.create(connection, {
    name: 'Programming Notes',
    query: 'java',
    filters: { tags: ['programming'], captureType: 'text' },
    sort: 'created_desc',
  });

  assert.equal(created.sort, 'created_desc');
  assert.deepEqual(created.filters.tags, ['programming']);
  assert.equal(created.filters.captureType, 'text');

  const reloaded = await repos.savedSearches.getById(connection, created.id);
  assert.deepEqual(reloaded?.filters, { tags: ['programming'], captureType: 'text' });
  assert.equal(reloaded?.query, 'java');

  await closeTestContext(context);
});

test('saved searches update and delete', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const created = await repos.savedSearches.create(connection, { name: 'Awal' });
  assert.equal(created.query, '');
  assert.equal(created.sort, 'updated_desc');

  const updated = await repos.savedSearches.update(connection, created.id, {
    name: 'Diubah',
    query: 'catatan',
    filters: { notebookId: 'nb-1' },
  });
  assert.equal(updated?.name, 'Diubah');
  assert.equal(updated?.filters.notebookId, 'nb-1');

  assert.equal(await repos.savedSearches.remove(connection, created.id), true);
  assert.equal(await repos.savedSearches.getById(connection, created.id), null);

  await closeTestContext(context);
});
