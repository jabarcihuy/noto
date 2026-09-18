/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '@/core/db/database';
import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { seedBuiltInTemplates } from '@/features/templates/data/seed-builtin-templates';
import { createRepositories } from '@/repositories';

import { closeTestContext, createTestContext, type TestContext } from './helpers/context';
import { createFakeFileSystem, type FakeFileSystem } from './helpers/fake-filesystem';
import { createNodeConnection } from './helpers/node-sqlite-connection';
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

/** Moves an exported vault into a fake filesystem so it can be imported. */
function stageExportAsFolder(
  source: FakeFileSystem,
  exportDirectory: string,
  target: FakeFileSystem,
  importRoot: string,
): void {
  const files: { relativePath: string; uri: string }[] = [];
  for (const [key, contents] of source.exported) {
    const relativePath = key.slice(`${exportDirectory}/`.length);
    const uri = `${importRoot}/${relativePath}`;
    target.putSource(uri, contents);
    files.push({ relativePath, uri });
  }
  target.putExternalDirectory(importRoot, files);
}

test('template content reconciles tags and links on note creation', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const { notes, tags, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java OOP' });
  const template = await context.repos.templates.create(context.connection, {
    name: 'Kuliah',
    content: '## Rencana #proyek\n\nLihat [[Java OOP]].',
  });

  const note = await notes.createNote({ content: template.content });

  assert.deepEqual(
    (await tags.listForNote(note.id)).map((tag) => tag.name),
    ['proyek'],
  );
  const [link] = await links.listBySource(note.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('attachment references survive export and point at exported files', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const { notes } = createTestServices(context);
  const attachments = buildAttachments(context, fileSystem);

  const note = await notes.createNote({ title: 'Dengan Lampiran' });
  fileSystem.putSource('file://foto.jpg', 'IMG');
  const image = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://foto.jpg', mimeType: 'image/jpeg', fileName: 'foto.jpg' },
  });
  fileSystem.putSource('file://voice.m4a', 'AUDIO');
  const audio = await attachments.addAudio({
    noteId: note.id,
    sourceUri: 'file://voice.m4a',
    originalName: 'voice.m4a',
  });

  fileSystem.setPickedDirectory('export://vault');
  await vault.exportVault();

  const exportedNote = [...fileSystem.exported.entries()].find(([key]) => key.endsWith('.md'))?.[1];
  assert.ok(exportedNote);
  assert.ok(exportedNote!.includes(`(${image.relativePath})`));
  assert.ok(exportedNote!.includes(`(${audio.relativePath})`));
  assert.ok(fileSystem.exportedHas('export://vault', image.relativePath));
  assert.ok(fileSystem.exportedHas('export://vault', audio.relativePath));

  await closeTestContext(context);
});

test('renaming a note keeps search consistent with title and content', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const note = await notes.createNote({ title: 'Alpha', content: 'kata kunci unik' });
  assert.equal((await search.search({ query: 'alpha' })).items.length, 1);

  await notes.updateNote(note.id, { title: 'Beta' });

  assert.equal((await search.search({ query: 'alpha' })).items.length, 0);
  const renamed = await search.search({ query: 'beta' });
  assert.deepEqual(
    renamed.items.map((item) => item.note.id),
    [note.id],
  );
  assert.equal((await search.search({ query: 'kunci' })).items.length, 1);

  await closeTestContext(context);
});

test('renaming a link target keeps the resolved relationship and search finds it', async () => {
  const context = await createTestContext();
  const { notes, links, search } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java Basics' });
  const source = await notes.createNote({ title: 'Sumber', content: '[[Java Basics]]' });
  assert.equal((await links.listBySource(source.id))[0]?.targetNoteId, target.id);

  await notes.updateNote(target.id, { title: 'Java Fundamental' });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target.id);
  const found = await search.search({ query: 'fundamental' });
  assert.deepEqual(
    found.items.map((item) => item.note.id),
    [target.id],
  );

  await closeTestContext(context);
});

test('removing a tag token updates tag search results without deleting the note', async () => {
  const context = await createTestContext();
  const { notes, tags, search } = createTestServices(context);

  const note = await notes.createNote({ title: 'Bertag', content: 'isi #java' });
  assert.deepEqual(
    (await search.search({ query: '', filters: { tags: ['java'] } })).items.map(
      (item) => item.note.id,
    ),
    [note.id],
  );

  await tags.removeTagFromNote(note.id, 'java');

  assert.equal((await search.search({ query: '', filters: { tags: ['java'] } })).items.length, 0);
  assert.ok(await notes.getNote(note.id), 'the note itself is untouched');
  assert.equal((await search.search({ query: 'isi' })).items.length, 1);

  await closeTestContext(context);
});

test('renaming a notebook keeps notebook filtering by ID working', async () => {
  const context = await createTestContext();
  const { notes, notebooks, search } = createTestServices(context);

  const notebook = await notebooks.create('Kuliah');
  const note = await notes.createNote({ title: 'Algoritma' });
  await notebooks.assignNote(note.id, notebook.id);

  await notebooks.rename(notebook.id, 'Kuliah Baru');

  const filtered = await search.search({ query: '', filters: { notebookId: notebook.id } });
  assert.deepEqual(
    filtered.items.map((item) => item.note.id),
    [note.id],
  );
  assert.equal((await notebooks.getById(notebook.id))?.name, 'Kuliah Baru');

  await closeTestContext(context);
});

test('an imported vault is searchable and backlinks resolve', async () => {
  const contextA = await createTestContext();
  const fileSystemA = createFakeFileSystem();
  const vaultA = createTestVault(contextA, fileSystemA);
  const servicesA = createTestServices(contextA);

  const target = await servicesA.notes.createNote({ title: 'Java OOP', content: 'target' });
  await servicesA.notes.createNote({
    title: 'Sumber',
    content: '#kuliah\n\nLihat [[Java OOP]].',
  });
  fileSystemA.setPickedDirectory('export://vault');
  await vaultA.exportVault();

  const contextB = await createTestContext();
  const fileSystemB = createFakeFileSystem();
  stageExportAsFolder(fileSystemA, 'export://vault', fileSystemB, 'ext://vault');
  const vaultB = createTestVault(contextB, fileSystemB);
  const servicesB = createTestServices(contextB);

  const importResult = await vaultB.importVault({ kind: 'directory', uri: 'ext://vault' });
  assert.equal(importResult.importedNotes, 2);

  const byTitle = await servicesB.search.search({ query: 'java oop' });
  assert.ok(
    byTitle.items.some((item) => item.note.id === target.id),
    'the imported target is searchable',
  );
  assert.ok(byTitle.items.length >= 1);
  assert.equal(
    (await servicesB.search.search({ query: '', filters: { tags: ['kuliah'] } })).items.length,
    1,
  );

  const source = (await servicesB.notes.listRecentNotes()).find((note) => note.title === 'Sumber');
  assert.ok(source);
  const backlinks = await servicesB.links.listBacklinks(target.id);
  assert.deepEqual(
    backlinks.map((note) => note.id),
    [source!.id],
  );

  await closeTestContext(contextA);
  await closeTestContext(contextB);
});

test('a vault can be imported and exported again with stable data', async () => {
  const contextA = await createTestContext();
  const fileSystemA = createFakeFileSystem();
  const vaultA = createTestVault(contextA, fileSystemA);
  const servicesA = createTestServices(contextA);

  const note = await servicesA.notes.createNote({
    title: 'Asli',
    content: '#tag\n\n[[Tujuan]]',
  });
  await servicesA.notes.createNote({ title: 'Tujuan' });
  fileSystemA.setPickedDirectory('export://vault');
  await vaultA.exportVault();

  const contextB = await createTestContext();
  const fileSystemB = createFakeFileSystem();
  stageExportAsFolder(fileSystemA, 'export://vault', fileSystemB, 'ext://vault');
  const vaultB = createTestVault(contextB, fileSystemB);
  await vaultB.importVault({ kind: 'directory', uri: 'ext://vault' });

  // Second export from the imported vault.
  fileSystemB.setPickedDirectory('export://second');
  const secondExport = await vaultB.exportVault();
  assert.equal(secondExport.noteCount, 2);

  const contextC = await createTestContext();
  const fileSystemC = createFakeFileSystem();
  stageExportAsFolder(fileSystemB, 'export://second', fileSystemC, 'ext://second');
  const vaultC = createTestVault(contextC, fileSystemC);
  const third = await vaultC.importVault({ kind: 'directory', uri: 'ext://second' });
  assert.equal(third.importedNotes, 2);

  const reloaded = await contextC.repos.notes.getById(contextC.connection, note.id);
  assert.equal(reloaded?.title, 'Asli');
  assert.equal(reloaded?.content, '#tag\n\n[[Tujuan]]');
  const links = await contextC.repos.links.listBySource(contextC.connection, note.id);
  assert.equal(links[0]?.resolution, 'resolved');

  await closeTestContext(contextA);
  await closeTestContext(contextB);
  await closeTestContext(contextC);
});

test('all persisted data survives a database reopen (cold restart)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-restart-'));
  const databasePath = join(directory, 'noto.db');

  try {
    const firstConnection = createNodeConnection(databasePath);
    const firstDatabase = await openDatabase(firstConnection);
    const firstRepos = createRepositories(firstDatabase, {
      newId: () => `id-${Math.random().toString(16).slice(2)}`,
      now: () => '2026-07-01T00:00:00.000Z',
    });
    await firstConnection.withTransactionAsync((tx) =>
      seedBuiltInTemplates(tx, () => '2026-07-01T00:00:00.000Z'),
    );

    const notebook = await firstRepos.notebooks.create(firstConnection, { name: 'Kuliah' });
    const target = await firstRepos.notes.create(firstConnection, { title: 'Tujuan' });
    const note = await firstRepos.notes.create(firstConnection, {
      title: 'Sumber',
      content: '#tag\n\n[[Tujuan]]',
      notebookId: notebook.id,
    });
    await firstRepos.links.replaceLinksForNote(firstConnection, note.id, [
      { targetText: 'Tujuan' },
    ]);
    await firstRepos.tags.findOrCreate(firstConnection, 'tag');
    await firstRepos.savedSearches.create(firstConnection, { name: 'Simpan', query: 'sumber' });
    await firstConnection.closeAsync();

    const secondConnection = createNodeConnection(databasePath);
    const secondDatabase = await openDatabase(secondConnection);
    const secondRepos = createRepositories(secondDatabase, {
      newId: () => 'unused',
      now: () => '2026-07-02T00:00:00.000Z',
    });

    assert.equal((await secondRepos.notes.getById(secondConnection, note.id))?.title, 'Sumber');
    assert.equal(
      (await secondRepos.notebooks.getById(secondConnection, notebook.id))?.name,
      'Kuliah',
    );
    assert.equal(
      (await secondRepos.links.listBySource(secondConnection, note.id))[0]?.targetNoteId,
      target.id,
    );
    assert.ok(await secondRepos.tags.findByName(secondConnection, 'tag'));
    assert.equal((await secondRepos.savedSearches.list(secondConnection))[0]?.name, 'Simpan');
    assert.equal(
      (await secondRepos.templates.list(secondConnection)).length,
      5,
      'built-ins are seeded after reopen',
    );

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
