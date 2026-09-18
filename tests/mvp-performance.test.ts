/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { closeTestContext, createTestContext } from './helpers/context';
import { createFakeFileSystem } from './helpers/fake-filesystem';
import { createTestServices } from './helpers/services';
import { createTestVault } from './helpers/vault-services';

const NOTE_COUNT = 1_000;

/**
 * Performance smoke test (PRD §19). It measures a 1,000-note vault end-to-end and asserts
 * only generous ceilings, so it catches accidental full-vault scans without being flaky.
 * The 10k/50k benchmarks remain unmeasured (reported as a risk, not claimed).
 */
test('1,000-note smoke test: search, pagination, and export stay bounded', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const services = createTestServices(context);

  const seedStart = Date.now();
  for (let index = 0; index < NOTE_COUNT; index += 1) {
    await services.notes.createNote({
      title: `Catatan ${index}`,
      content: `Isi catatan ${index} #tag${index % 10}`,
    });
  }
  const seedMs = Date.now() - seedStart;

  const searchStart = Date.now();
  const page = await services.search.search({ query: 'catatan 5', limit: 25 });
  const searchMs = Date.now() - searchStart;
  assert.ok(page.items.length > 0);
  assert.ok(page.items.length <= 25, 'search results stay paged');

  const filterStart = Date.now();
  const filtered = await services.search.search({
    query: '',
    filters: { tags: ['tag3'] },
    limit: 25,
  });
  const filterMs = Date.now() - filterStart;
  assert.equal(filtered.items.length, 25);
  assert.equal(filtered.hasMore, true);

  const deepStart = Date.now();
  const deep = await services.search.search({ query: 'catatan', limit: 25, offset: 900 });
  const deepMs = Date.now() - deepStart;
  assert.equal(deep.items.length, 25, 'deep pagination returns a full page');

  const exportStart = Date.now();
  const vault = createTestVault(context, fileSystem);
  fileSystem.setPickedDirectory('export://vault');
  const exported = await vault.exportVault();
  const exportMs = Date.now() - exportStart;
  assert.equal(exported.noteCount, NOTE_COUNT);

  // Generous ceilings: ~2s each on slow CI. These catch quadratic behavior, not slow disks.
  assert.ok(seedMs < 30_000, `seeding ${NOTE_COUNT} notes took ${seedMs}ms`);
  assert.ok(searchMs < 2_000, `search took ${searchMs}ms`);
  assert.ok(filterMs < 2_000, `filter took ${filterMs}ms`);
  assert.ok(deepMs < 2_000, `deep pagination took ${deepMs}ms`);
  assert.ok(exportMs < 10_000, `export took ${exportMs}ms`);

  console.log(
    `[perf] notes=${NOTE_COUNT} seed=${seedMs}ms search=${searchMs}ms filter=${filterMs}ms deepPage=${deepMs}ms export=${exportMs}ms`,
  );

  await closeTestContext(context);
});

test('attachment loading stays per-note, not per-vault', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const services = createTestServices(context);
  const attachments = createAttachmentUseCases({
    connection: context.connection,
    attachments: context.repos.attachments,
    pendingDeletions: context.repos.pendingDeletions,
    fileSystem: fileSystem.port,
    notes: {
      getById: context.repos.notes.getById,
      updateContent: (db, id, content) => context.repos.notes.update(db, id, { content }),
    },
    newId: context.newId,
    now: context.now,
  });

  const noteA = await services.notes.createNote({ title: 'A' });
  const noteB = await services.notes.createNote({ title: 'B' });
  fileSystem.putSource('file://a.png', 'A');
  await attachments.addImage({
    noteId: noteA.id,
    source: { uri: 'file://a.png', mimeType: 'image/png', fileName: 'a.png' },
  });

  assert.equal((await attachments.listForNote(noteA.id)).length, 1);
  assert.equal((await attachments.listForNote(noteB.id)).length, 0);

  await closeTestContext(context);
});
