import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';

test('app metadata stores internal keys separately from product data', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await repos.appMetadata.set(connection, 'vault_id', 'vault-123');
  await repos.appMetadata.set(connection, 'schema_version', '1');

  assert.equal(await repos.appMetadata.get(connection, 'vault_id'), 'vault-123');
  assert.deepEqual(await repos.appMetadata.all(connection), {
    schema_version: '1',
    vault_id: 'vault-123',
  });

  await repos.appMetadata.set(connection, 'vault_id', 'vault-456');
  assert.equal(await repos.appMetadata.get(connection, 'vault_id'), 'vault-456');

  await repos.appMetadata.remove(connection, 'vault_id');
  assert.equal(await repos.appMetadata.get(connection, 'vault_id'), null);

  await closeTestContext(context);
});
