/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { parseManifest } from '@/features/vault/domain/vault-format';

import { closeTestContext, createTestContext, type TestContext } from './helpers/context';
import { createFakeFileSystem, type FakeFileSystem } from './helpers/fake-filesystem';
import { createTestServices } from './helpers/services';
import { createTestVault } from './helpers/vault-services';

function buildAttachments(context: TestContext, fileSystem: FakeFileSystem) {
  return createAttachmentUseCases({
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
}

async function buildRepresentativeVault(context: TestContext, fileSystem: FakeFileSystem) {
  const services = createTestServices(context);
  const attachments = buildAttachments(context, fileSystem);

  const notebook = await services.notebooks.create('Kuliah');
  const target = await services.notes.createNote({ title: 'Java OOP', content: 'Target.' });
  const empty = await services.notes.createNote({ title: '', content: 'Catatan tanpa judul.' });
  const normal = await services.notes.createNote({
    title: 'Catatan Normal',
    content: 'Isi normal.',
  });
  await services.notes.createNote({ title: 'Duplikat', content: 'Duplikat A' });
  await services.notes.createNote({ title: 'Duplikat', content: 'Duplikat B' });
  await services.notes.createNote({ title: 'Java', content: 'Java satu' });
  await services.notes.createNote({ title: 'Java', content: 'Java dua' });

  const source = await services.notes.createNote({
    title: 'Sumber "Spesial": #1?',
    content: [
      '#java #college',
      '',
      'Resolved [[Java OOP]].',
      '',
      'Alias [[Java OOP|OOP]].',
      '',
      'Anchor [[Java OOP#Inheritance]].',
      '',
      'Unresolved [[Operating Systems]].',
      '',
      'Ambiguous [[Java]].',
      '',
      'Hilang ![ghost](attachments/ghost.png)',
    ].join('\n'),
  });
  await services.notebooks.assignNote(source.id, notebook.id);

  fileSystem.putSource('file://foto.jpg', 'IMAGEDATA');
  await attachments.addImage({
    noteId: source.id,
    source: {
      uri: 'file://foto.jpg',
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
      width: 1200,
      height: 800,
    },
  });
  fileSystem.putSource('file://voice.m4a', 'AUDIODATA');
  await attachments.addAudio({
    noteId: source.id,
    sourceUri: 'file://voice.m4a',
    mimeType: 'audio/mp4',
    originalName: 'voice.m4a',
    durationMs: 4200,
  });

  // User-created template and saved search: part of the vault format and must round-trip.
  const template = await context.repos.templates.create(context.connection, {
    name: 'Resep',
    description: 'Template resep keluarga',
    content: '## Bahan\n\n- \n\n## Langkah\n\n1. \n',
  });
  const savedSearch = await context.repos.savedSearches.create(context.connection, {
    name: 'Programming Notes',
    query: 'java',
    filters: { tags: ['programming'], notebookId: notebook.id, captureType: 'text' },
    sort: 'created_desc',
  });

  return {
    services,
    attachments,
    notebook,
    target,
    empty,
    normal,
    source,
    template,
    savedSearch,
  };
}

test('round-trip: export then import into a fresh database preserves the vault', async () => {
  const contextA = await createTestContext();
  const fileSystemA = createFakeFileSystem();
  const vaultA = createTestVault(contextA, fileSystemA);
  const dataset = await buildRepresentativeVault(contextA, fileSystemA);

  const exportDirectory = 'export://vault';
  fileSystemA.setPickedDirectory(exportDirectory);
  const exportResult = await vaultA.exportVault();

  assert.equal(exportResult.usedFallback, false);
  assert.equal(exportResult.noteCount, 8);
  assert.equal(exportResult.attachmentCount, 2);
  assert.deepEqual(exportResult.missingAttachments, []);
  assert.ok(
    exportResult.warnings.some((warning) =>
      warning.startsWith(`missing-attachment-reference:${dataset.source.id}:`),
    ),
    'the missing attachment reference is reported',
  );
  assert.ok(fileSystemA.exportedHas(exportDirectory, 'manifest.json'));

  const manifestText = fileSystemA.exported.get(`${exportDirectory}/manifest.json`);
  assert.ok(manifestText);
  const manifest = parseManifest(manifestText!);
  assert.ok(manifest);
  assert.equal(manifest!.notes.length, 8);
  assert.equal(manifest!.attachments.length, 2);
  assert.ok(manifest!.templates.some((template) => template.id === dataset.template.id));
  assert.ok(manifest!.savedSearches.some((saved) => saved.id === dataset.savedSearch.id));

  // Feed the exported directory into a fresh database as an external folder.
  const contextB = await createTestContext();
  const fileSystemB = createFakeFileSystem();
  const importRoot = 'ext://vault';
  const files: { relativePath: string; uri: string }[] = [];
  for (const [key, contents] of fileSystemA.exported) {
    const relativePath = key.slice(`${exportDirectory}/`.length);
    const uri = `${importRoot}/${relativePath}`;
    fileSystemB.putSource(uri, contents);
    files.push({ relativePath, uri });
  }
  fileSystemB.putExternalDirectory(importRoot, files);
  const vaultB = createTestVault(contextB, fileSystemB);

  const importResult = await vaultB.importVault({ kind: 'directory', uri: importRoot });
  assert.equal(importResult.status, 'complete');
  assert.equal(importResult.importedNotes, 8);
  assert.equal(importResult.importedAttachments, 2);
  assert.deepEqual(importResult.conflicts, []);

  // Notes: count, IDs, titles, content, timestamps, notebook.
  const notesA = await contextA.repos.notes.list(contextA.connection, { limit: 100 });
  const notesB = await contextB.repos.notes.list(contextB.connection, { limit: 100 });
  assert.equal(notesB.length, notesA.length);

  const byId = new Map(notesB.map((note) => [note.id, note]));
  for (const original of notesA) {
    const copy = byId.get(original.id);
    assert.ok(copy, `note ${original.id} must keep its ID`);
    assert.equal(copy!.title, original.title);
    assert.equal(copy!.content, original.content);
    assert.equal(copy!.captureType, original.captureType);
    assert.equal(copy!.notebookId, original.notebookId);
    assert.equal(copy!.createdAt, original.createdAt);
    assert.equal(copy!.updatedAt, original.updatedAt);
  }

  // Tags (content-derived) and notebook identity survive.
  const tagsA = await contextA.repos.tags.listForNote(contextA.connection, dataset.source.id);
  const tagsB = await contextB.repos.tags.listForNote(contextB.connection, dataset.source.id);
  assert.deepEqual(
    tagsB.map((tag) => tag.name),
    tagsA.map((tag) => tag.name),
  );
  assert.equal(
    (await contextB.repos.notebooks.getById(contextB.connection, dataset.notebook.id))?.name,
    'Kuliah',
  );

  // Links: resolved, unresolved, ambiguous, alias, and anchor states.
  const linksB = await contextB.repos.links.listBySource(contextB.connection, dataset.source.id);
  const byText = new Map(linksB.map((link) => [link.targetText, link]));
  assert.equal(byText.get('java oop')?.resolution, 'resolved');
  assert.equal(byText.get('java oop')?.targetNoteId, dataset.target.id);
  assert.equal(linksB.filter((link) => link.targetText === 'java oop').length, 3);
  assert.equal(byText.get('operating systems')?.resolution, 'unresolved');
  assert.equal(byText.get('operating systems')?.targetNoteId, null);
  assert.equal(byText.get('java')?.resolution, 'ambiguous');
  assert.equal(byText.get('java')?.targetNoteId, null);

  // Attachments: metadata, note relationship, and actual files.
  const attachmentsB = await contextB.repos.attachments.listForNote(
    contextB.connection,
    dataset.source.id,
  );
  assert.equal(attachmentsB.length, 2);
  const imageB = attachmentsB.find((row) => row.kind === 'image');
  const audioB = attachmentsB.find((row) => row.kind === 'audio');
  assert.ok(imageB);
  assert.ok(audioB);
  assert.equal(imageB!.relativePath, 'attachments/foto.jpg');
  assert.equal(imageB!.mimeType, 'image/jpeg');
  assert.equal(imageB!.width, 1200);
  assert.equal(audioB!.relativePath, 'attachments/voice.m4a');
  assert.equal(audioB!.durationMs, 4200);
  assert.ok(fileSystemB.files.has('attachments/foto.jpg'));
  assert.ok(fileSystemB.files.has('attachments/voice.m4a'));

  // The missing reference stays in content and produced no row.
  assert.ok(
    (await contextB.repos.notes.getById(contextB.connection, dataset.source.id))!.content.includes(
      'attachments/ghost.png',
    ),
  );

  // Templates: built-ins are preserved, the user template round-trips exactly, and no
  // note was altered by the template import.
  assert.equal(importResult.importedTemplates, 1);
  assert.equal(importResult.importedSavedSearches, 1);
  const templateB = await contextB.repos.templates.getById(
    contextB.connection,
    dataset.template.id,
  );
  assert.ok(templateB);
  assert.equal(templateB!.name, dataset.template.name);
  assert.equal(templateB!.description, dataset.template.description);
  assert.equal(templateB!.content, dataset.template.content);
  assert.equal(templateB!.isBuiltin, false);
  assert.equal(templateB!.createdAt, dataset.template.createdAt);
  assert.equal(templateB!.updatedAt, dataset.template.updatedAt);
  assert.equal(
    (await contextB.repos.templates.list(contextB.connection)).length,
    (await contextA.repos.templates.list(contextA.connection)).length,
  );

  // Saved searches: query, filters, and sort survive verbatim.
  const savedB = await contextB.repos.savedSearches.getById(
    contextB.connection,
    dataset.savedSearch.id,
  );
  assert.ok(savedB);
  assert.equal(savedB!.name, 'Programming Notes');
  assert.equal(savedB!.query, 'java');
  assert.equal(savedB!.sort, 'created_desc');
  assert.deepEqual(savedB!.filters, {
    tags: ['programming'],
    notebookId: dataset.notebook.id,
    captureType: 'text',
  });

  await closeTestContext(contextA);
  await closeTestContext(contextB);
});

test('round-trip is idempotent: importing the same export twice never overwrites', async () => {
  const contextA = await createTestContext();
  const fileSystemA = createFakeFileSystem();
  const vaultA = createTestVault(contextA, fileSystemA);
  const dataset = await buildRepresentativeVault(contextA, fileSystemA);
  fileSystemA.setPickedDirectory('export://vault');
  await vaultA.exportVault();

  const contextB = await createTestContext();
  const fileSystemB = createFakeFileSystem();
  const importRoot = 'ext://vault';
  const files: { relativePath: string; uri: string }[] = [];
  for (const [key, contents] of fileSystemA.exported) {
    const relativePath = key.slice('export://vault/'.length);
    const uri = `${importRoot}/${relativePath}`;
    fileSystemB.putSource(uri, contents);
    files.push({ relativePath, uri });
  }
  fileSystemB.putExternalDirectory(importRoot, files);
  const vaultB = createTestVault(contextB, fileSystemB);

  const first = await vaultB.importVault({ kind: 'directory', uri: importRoot });
  assert.equal(first.importedNotes, 8);

  const original = await contextB.repos.notes.getById(contextB.connection, dataset.source.id);
  assert.ok(original);

  const second = await vaultB.importVault({ kind: 'directory', uri: importRoot });
  assert.equal(second.importedNotes, 8);
  assert.equal(second.importedAttachments, 2);
  assert.equal(second.importedTemplates, 0, 'existing templates are never overwritten');
  assert.equal(second.importedSavedSearches, 0, 'existing saved searches are never overwritten');
  assert.ok(second.conflicts.some((conflict) => conflict === `note-id:${dataset.source.id}`));
  assert.ok(second.conflicts.some((conflict) => conflict.startsWith('attachment-id:')));
  assert.ok(second.conflicts.some((conflict) => conflict === `template-id:${dataset.template.id}`));
  assert.ok(
    second.conflicts.some((conflict) => conflict === `saved-search-id:${dataset.savedSearch.id}`),
  );

  // Template and saved-search data are unchanged after the second import.
  const templateAfter = await contextB.repos.templates.getById(
    contextB.connection,
    dataset.template.id,
  );
  assert.deepEqual(templateAfter, dataset.template);
  const savedAfter = await contextB.repos.savedSearches.getById(
    contextB.connection,
    dataset.savedSearch.id,
  );
  assert.deepEqual(savedAfter, dataset.savedSearch);

  // The original notes were not overwritten; the second import created new IDs.
  const afterOriginal = await contextB.repos.notes.getById(contextB.connection, dataset.source.id);
  assert.deepEqual(afterOriginal, original);
  const allNotes = await contextB.repos.notes.list(contextB.connection, { limit: 100 });
  assert.equal(allNotes.length, 16);

  await closeTestContext(contextA);
  await closeTestContext(contextB);
});
