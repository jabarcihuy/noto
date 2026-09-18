import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUILT_IN_TEMPLATES } from '@/features/templates/domain/builtin-templates';
import { seedBuiltInTemplates } from '@/features/templates/data/seed-builtin-templates';

import { closeTestContext, createTestContext } from './helpers/context';

test('built-in templates are seeded and marked as built-in', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const templates = await repos.templates.list(connection);
  assert.equal(templates.length, BUILT_IN_TEMPLATES.length);
  assert.ok(templates.every((template) => template.isBuiltin));

  await closeTestContext(context);
});

test('seeding built-in templates is idempotent', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await connection.withTransactionAsync(async (tx) => {
    await seedBuiltInTemplates(tx, () => '2026-01-01T00:00:00.000Z');
  });

  const templates = await repos.templates.list(connection);
  assert.equal(templates.length, BUILT_IN_TEMPLATES.length);

  await closeTestContext(context);
});

test('custom templates support create / read / update / delete', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const created = await repos.templates.create(connection, {
    name: 'Resep',
    description: 'Template resep',
    content: '## Bahan\n',
  });
  assert.equal(created.isBuiltin, false);

  const updated = await repos.templates.update(connection, created.id, { name: 'Resep Baru' });
  assert.equal(updated?.name, 'Resep Baru');

  assert.equal(await repos.templates.remove(connection, created.id), true);
  assert.equal(await repos.templates.getById(connection, created.id), null);

  await closeTestContext(context);
});
