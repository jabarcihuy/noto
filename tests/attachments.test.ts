import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';

test('attachment metadata is stored and related to its note', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Dengan lampiran' });
  const image = await repos.attachments.create(connection, {
    noteId: note.id,
    kind: 'image',
    relativePath: 'attachments/photo.jpg',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    byteSize: 120034,
    width: 1080,
    height: 1920,
  });
  await repos.attachments.create(connection, {
    noteId: note.id,
    kind: 'audio',
    relativePath: 'attachments/voice.m4a',
    durationMs: 4200,
  });

  const listed = await repos.attachments.listForNote(connection, note.id);
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.id, image.id);
  assert.equal(listed[0]?.relativePath, 'attachments/photo.jpg');
  assert.equal(listed[0]?.width, 1080);

  await closeTestContext(context);
});

test('deleting an attachment removes only its metadata row', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Catatan' });
  const attachment = await repos.attachments.create(connection, {
    noteId: note.id,
    kind: 'file',
    relativePath: 'attachments/report.pdf',
  });

  assert.equal(await repos.attachments.remove(connection, attachment.id), true);
  assert.equal(await repos.attachments.getById(connection, attachment.id), null);
  assert.ok(await repos.notes.getById(connection, note.id));

  await closeTestContext(context);
});

test('pending file deletions can be queued, listed, and cleared', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await repos.pendingDeletions.enqueue(connection, 'attachments/a.jpg', '2026-01-01T00:00:00.000Z');
  await repos.pendingDeletions.enqueue(connection, 'attachments/a.jpg', '2026-01-01T00:00:01.000Z');

  assert.deepEqual(await repos.pendingDeletions.list(connection), ['attachments/a.jpg']);

  await repos.pendingDeletions.remove(connection, 'attachments/a.jpg');
  assert.deepEqual(await repos.pendingDeletions.list(connection), []);

  await closeTestContext(context);
});
