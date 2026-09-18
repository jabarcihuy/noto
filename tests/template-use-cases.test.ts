/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTemplateUseCases } from '@/features/templates/application/template-use-cases';
import { seedBuiltInTemplates } from '@/features/templates/data/seed-builtin-templates';
import { BUILT_IN_TEMPLATES } from '@/features/templates/domain/builtin-templates';

import { closeTestContext, createTestContext } from './helpers/context';

function buildTemplates(context: Awaited<ReturnType<typeof createTestContext>>) {
  return createTemplateUseCases({
    connection: context.connection,
    templates: context.repos.templates,
  });
}

test('the five documented built-in templates are listed', async () => {
  const context = await createTestContext();
  const templates = buildTemplates(context);

  const list = await templates.list();
  assert.deepEqual(
    list.map((template) => template.name),
    ['Fleeting Note', 'Idea', 'Literature Note', 'Meeting Note', 'Permanent Note'],
  );
  assert.ok(list.every((template) => template.isBuiltin));

  const idea = list.find((template) => template.name === 'Idea');
  assert.ok(idea);
  const reloaded = await templates.getById(idea!.id);
  assert.equal(reloaded?.content, idea!.content);
  assert.equal(await templates.getById('missing-template'), null);

  await closeTestContext(context);
});

test('re-seeding does not overwrite a modified built-in template', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const [first] = await repos.templates.list(connection);
  assert.ok(first);
  await repos.templates.update(connection, first!.id, { content: 'Isi diubah pengguna' });

  await connection.withTransactionAsync(async (tx) => {
    await seedBuiltInTemplates(tx, () => '2026-01-01T00:00:00.000Z');
  });

  const after = await repos.templates.getById(connection, first!.id);
  assert.equal(after?.content, 'Isi diubah pengguna');

  await closeTestContext(context);
});

test('a deleted built-in template is re-created by the next seed (current behavior)', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const [first] = await repos.templates.list(connection);
  assert.ok(first);
  assert.equal(await repos.templates.remove(connection, first!.id), true);
  assert.equal(await repos.templates.getById(connection, first!.id), null);

  await connection.withTransactionAsync(async (tx) => {
    await seedBuiltInTemplates(tx, () => '2026-01-01T00:00:00.000Z');
  });

  const recreated = await repos.templates.getById(connection, first!.id);
  assert.ok(recreated, 'seeding re-inserts a missing built-in (existing behavior)');
  assert.equal(
    recreated?.content,
    BUILT_IN_TEMPLATES.find((template) => template.id === first!.id)?.content,
  );

  await closeTestContext(context);
});
