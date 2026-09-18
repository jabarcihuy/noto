/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '@/core/db/database';
import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { createRepositories } from '@/repositories';

import { closeTestContext, createTestContext, type TestContext } from './helpers/context';
import { createFakeFileSystem, type FakeFileSystem } from './helpers/fake-filesystem';
import { createNodeConnection } from './helpers/node-sqlite-connection';

function buildAttachments(
  context: Pick<TestContext, 'connection' | 'repos' | 'newId' | 'now'>,
  fileSystem: FakeFileSystem,
) {
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

async function setup() {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const attachments = buildAttachments(context, fileSystem);
  return { context, fileSystem, attachments };
}

test('adding an image stores the file, metadata, and a content reference', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, {
    title: 'Catatan',
    content: '#tag',
  });
  fileSystem.putSource('file://photo.jpg', 'IMAGEBYTES');

  const attachment = await attachments.addImage({
    noteId: note.id,
    source: {
      uri: 'file://photo.jpg',
      mimeType: 'image/jpeg',
      fileName: 'Foto Pantai.jpg',
      width: 1200,
      height: 800,
    },
  });

  assert.equal(attachment.kind, 'image');
  assert.equal(attachment.noteId, note.id);
  assert.equal(attachment.relativePath, 'attachments/Foto Pantai.jpg');
  assert.equal(attachment.mimeType, 'image/jpeg');
  assert.equal(attachment.byteSize, 'IMAGEBYTES'.length);
  assert.equal(attachment.width, 1200);
  assert.ok(fileSystem.files.has('attachments/Foto Pantai.jpg'));

  const reloaded = await context.repos.notes.getById(context.connection, note.id);
  assert.match(reloaded?.content ?? '', /!\[Foto Pantai\.jpg\]\(attachments\/Foto Pantai\.jpg\)/);

  await closeTestContext(context);
});

test('duplicate filenames get a deterministic suffix and stay separate attachments', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://1', 'A');
  fileSystem.putSource('file://2', 'B');

  const first = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://1', mimeType: 'image/jpeg', fileName: 'foto.jpg' },
  });
  const second = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://2', mimeType: 'image/jpeg', fileName: 'foto.jpg' },
  });

  assert.equal(first.relativePath, 'attachments/foto.jpg');
  assert.equal(second.relativePath, 'attachments/foto-2.jpg');
  assert.equal((await attachments.listForNote(note.id)).length, 2);

  await closeTestContext(context);
});

test('a failed file copy writes no metadata and leaves no file', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  fileSystem.setCopyFailure(true);

  await assert.rejects(() =>
    attachments.addImage({
      noteId: note.id,
      source: { uri: 'file://photo.jpg', mimeType: 'image/jpeg', fileName: 'foto.jpg' },
    }),
  );

  assert.equal(
    (await context.repos.attachments.listForNote(context.connection, note.id)).length,
    0,
  );
  assert.equal(
    [...fileSystem.files.keys()].filter((path) => path.startsWith('attachments/')).length,
    0,
  );

  await closeTestContext(context);
});

test('a metadata write failure after a successful copy cleans the file up', async () => {
  const { context, fileSystem } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://photo.jpg', 'DATA');

  const failingRepo = {
    ...context.repos.attachments,
    create: async () => {
      throw new Error('db write failed');
    },
  } as typeof context.repos.attachments;
  const attachments = createAttachmentUseCases({
    connection: context.connection,
    attachments: failingRepo,
    pendingDeletions: context.repos.pendingDeletions,
    fileSystem: fileSystem.port,
    notes: {
      getById: context.repos.notes.getById,
      updateContent: (db, id, content) => context.repos.notes.update(db, id, { content }),
    },
    newId: context.newId,
    now: context.now,
  });

  await assert.rejects(() =>
    attachments.addImage({
      noteId: note.id,
      source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'db-fail.png' },
    }),
  );

  assert.equal(fileSystem.files.has('attachments/db-fail.png'), false);
  assert.deepEqual(
    await context.repos.pendingDeletions.list(context.connection),
    [],
    'successful cleanup needs no queue row',
  );

  await closeTestContext(context);
});

test('a metadata write failure whose cleanup also fails records a pending deletion', async () => {
  const { context, fileSystem } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  fileSystem.setDeleteFailure(true);

  const failingRepo = {
    ...context.repos.attachments,
    create: async () => {
      throw new Error('db write failed');
    },
  } as typeof context.repos.attachments;
  const attachments = createAttachmentUseCases({
    connection: context.connection,
    attachments: failingRepo,
    pendingDeletions: context.repos.pendingDeletions,
    fileSystem: fileSystem.port,
    notes: {
      getById: context.repos.notes.getById,
      updateContent: (db, id, content) => context.repos.notes.update(db, id, { content }),
    },
    newId: context.newId,
    now: context.now,
  });

  await assert.rejects(() =>
    attachments.addImage({
      noteId: note.id,
      source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'queue.png' },
    }),
  );

  assert.ok(fileSystem.files.has('attachments/queue.png'));
  assert.deepEqual(await context.repos.pendingDeletions.list(context.connection), [
    'attachments/queue.png',
  ]);

  // Reconciliation completes the interrupted cleanup.
  fileSystem.setDeleteFailure(false);
  const report = await attachments.reconcile();
  assert.equal(report.deletedPending, 1);
  assert.equal(fileSystem.files.has('attachments/queue.png'), false);
  assert.deepEqual(await context.repos.pendingDeletions.list(context.connection), []);

  await closeTestContext(context);
});

test('a missing file is reported as unavailable and never breaks the note', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'gone.png' },
  });

  fileSystem.files.delete(attachment.relativePath);

  const [view] = await attachments.listForNote(note.id);
  assert.equal(view?.available, false);
  assert.equal(view?.uri, 'fake://vault/attachments/gone.png');
  assert.ok(await context.repos.notes.getById(context.connection, note.id));

  await closeTestContext(context);
});

test('deleting an attachment removes metadata, file, reference, and queue row', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, {
    title: 'Catatan',
    content: 'teks awal',
  });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'hapus.png' },
  });

  await attachments.remove(attachment.id);

  assert.equal(await context.repos.attachments.getById(context.connection, attachment.id), null);
  assert.equal(fileSystem.files.has(attachment.relativePath), false);
  assert.deepEqual(await context.repos.pendingDeletions.list(context.connection), []);
  const reloaded = await context.repos.notes.getById(context.connection, note.id);
  assert.equal(reloaded?.content.includes('attachments/hapus.png'), false);
  assert.equal(reloaded?.content, 'teks awal');

  await closeTestContext(context);
});

test('a failed file delete keeps the queue row until reconciliation retries', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'sisa.png' },
  });

  fileSystem.setDeleteFailure(true);
  await attachments.remove(attachment.id);

  assert.equal(await context.repos.attachments.getById(context.connection, attachment.id), null);
  assert.ok(fileSystem.files.has(attachment.relativePath));
  assert.deepEqual(await context.repos.pendingDeletions.list(context.connection), [
    attachment.relativePath,
  ]);

  fileSystem.setDeleteFailure(false);
  const report = await attachments.reconcile();
  assert.equal(report.deletedPending, 1);
  assert.equal(fileSystem.files.has(attachment.relativePath), false);
  assert.deepEqual(await context.repos.pendingDeletions.list(context.connection), []);

  await closeTestContext(context);
});

test('reconciliation reports missing files and orphan files without deleting orphans', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'hilang.png' },
  });
  fileSystem.putVaultFile('attachments/yatim.png', 'ORPHAN');
  fileSystem.files.delete(attachment.relativePath);

  const report = await attachments.reconcile();
  assert.deepEqual(report.missing, [attachment.relativePath]);
  assert.deepEqual(report.orphan, ['attachments/yatim.png']);
  assert.ok(fileSystem.files.has('attachments/yatim.png'), 'orphans are never auto-deleted');

  await closeTestContext(context);
});

test('audio metadata persists with a temporary source and is deletable', async () => {
  const { context, fileSystem, attachments } = await setup();
  const note = await context.repos.notes.create(context.connection, { title: 'Catatan' });
  fileSystem.putSource('file://tmp-recording.m4a', 'AUDIO');

  const attachment = await attachments.addAudio({
    noteId: note.id,
    sourceUri: 'file://tmp-recording.m4a',
    mimeType: 'audio/mp4',
    originalName: 'voice-20260918-101530.m4a',
    durationMs: 4200,
  });

  assert.equal(attachment.kind, 'audio');
  assert.equal(attachment.durationMs, 4200);
  assert.equal(attachment.relativePath, 'attachments/voice-20260918-101530.m4a');
  assert.ok(fileSystem.files.has(attachment.relativePath));

  await attachments.remove(attachment.id);
  assert.equal(await context.repos.attachments.getById(context.connection, attachment.id), null);
  assert.equal(fileSystem.files.has(attachment.relativePath), false);

  await closeTestContext(context);
});

test('attachment metadata survives a database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-attach-'));
  const databasePath = join(directory, 'noto.db');

  try {
    let noteId = '';
    let attachmentId = '';
    let relativePath = '';

    const firstConnection = createNodeConnection(databasePath);
    const firstDatabase = await openDatabase(firstConnection);
    const firstRepos = createRepositories(firstDatabase, {
      newId: () => `id-${Math.random().toString(16).slice(2)}`,
      now: () => '2026-07-01T00:00:00.000Z',
    });
    const fileSystem = createFakeFileSystem();
    const firstAttachments = buildAttachments(
      {
        connection: firstConnection,
        repos: firstRepos,
        newId: () => `id-${Math.random().toString(16).slice(2)}`,
        now: () => '2026-07-01T00:00:00.000Z',
      },
      fileSystem,
    );

    const note = await firstRepos.notes.create(firstConnection, { title: 'Persisten' });
    noteId = note.id;
    fileSystem.putSource('file://photo.jpg', 'DATA');
    const attachment = await firstAttachments.addImage({
      noteId,
      source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'persist.png' },
    });
    attachmentId = attachment.id;
    relativePath = attachment.relativePath;

    await firstConnection.closeAsync();

    const secondConnection = createNodeConnection(databasePath);
    const secondDatabase = await openDatabase(secondConnection);
    const secondRepos = createRepositories(secondDatabase, {
      newId: () => 'unused',
      now: () => '2026-07-02T00:00:00.000Z',
    });

    const reloaded = await secondRepos.attachments.listForNote(secondConnection, noteId);
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0]?.id, attachmentId);
    assert.equal(reloaded[0]?.relativePath, relativePath);
    assert.equal(reloaded[0]?.mimeType, 'image/png');
    assert.equal(reloaded[0]?.byteSize, 'DATA'.length);

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
