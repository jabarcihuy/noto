/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDiagnosticsUseCases } from '@/features/diagnostics/application/diagnostics-use-cases';

import { closeTestContext, createTestContext } from './helpers/context';
import { createTestServices } from './helpers/services';

test('database diagnostics report integrity, foreign keys, schema, and counts', async () => {
  const context = await createTestContext();
  const services = createTestServices(context);
  const diagnostics = createDiagnosticsUseCases({
    connection: context.connection,
    schemaVersion: context.db.schemaVersion,
    fts5: context.db.capabilities.fts5,
  });

  await services.notes.createNote({ title: 'Satu', content: 'isi' });

  const report = await diagnostics.run();
  assert.equal(report.integrity, 'ok');
  assert.equal(report.foreignKeyViolations, 0);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.noteCount, 1);
  assert.equal(report.attachmentCount, 0);
  assert.equal(typeof report.fts5, 'boolean');

  await closeTestContext(context);
});
