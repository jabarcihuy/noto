import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeTitleKey } from '@/features/notes/domain/note';

import { closeTestContext, createTestContext } from './helpers/context';

test('note create / read / update / delete', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const created = await repos.notes.create(connection, {
    title: 'Java Basics',
    content: 'Belajar [[Java OOP]]',
  });
  assert.equal(created.title, 'Java Basics');
  assert.equal(created.titleKey, normalizeTitleKey('Java Basics'));
  assert.equal(created.captureType, 'text');

  const read = await repos.notes.getById(connection, created.id);
  assert.equal(read?.content, 'Belajar [[Java OOP]]');

  const updated = await repos.notes.update(connection, created.id, { title: 'Java Fundamental' });
  assert.equal(updated?.title, 'Java Fundamental');
  assert.equal(updated?.titleKey, 'java fundamental');
  assert.notEqual(updated?.updatedAt, created.updatedAt);

  assert.equal(await repos.notes.remove(connection, created.id), true);
  assert.equal(await repos.notes.getById(connection, created.id), null);

  await closeTestContext(context);
});

test('timestamps track created, updated, and opened', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Timestamps' });
  assert.equal(note.createdAt, note.updatedAt);
  assert.equal(note.openedAt, null);

  const updated = await repos.notes.update(connection, note.id, { content: 'berubah' });
  assert.ok(updated && updated.updatedAt > updated.createdAt);

  await repos.notes.markOpened(connection, note.id);
  const opened = await repos.notes.getById(connection, note.id);
  assert.ok(opened?.openedAt);

  await closeTestContext(context);
});

test('recent listing is ordered by updated_at and ignores notes beyond the page', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const first = await repos.notes.create(connection, { title: 'Satu' });
  const second = await repos.notes.create(connection, { title: 'Dua' });
  const third = await repos.notes.create(connection, { title: 'Tiga' });

  await repos.notes.update(connection, first.id, { content: 'diperbarui terakhir' });

  const recent = await repos.notes.listRecent(connection, { limit: 10 });
  assert.equal(recent[0]?.id, first.id);
  assert.equal(recent.length, 3);

  const page = await repos.notes.listRecent(connection, { limit: 2, offset: 1 });
  assert.equal(page.length, 2);
  assert.deepEqual(
    page.map((note) => note.id),
    recent.slice(1).map((note) => note.id),
  );

  await closeTestContext(context);
});

test('notes can be filtered by notebook', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const notebook = await repos.notebooks.create(connection, { name: 'Kuliah' });
  const inside = await repos.notes.create(connection, {
    title: 'Di dalam',
    notebookId: notebook.id,
  });
  await repos.notes.create(connection, { title: 'Di luar' });

  const listed = await repos.notes.listByNotebook(connection, notebook.id);
  assert.deepEqual(
    listed.map((note) => note.id),
    [inside.id],
  );

  await closeTestContext(context);
});

test('findByTitleKey supports wikilink resolution input', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await repos.notes.create(connection, { title: 'Java OOP' });
  await repos.notes.create(connection, { title: 'java oop' });

  const matches = await repos.notes.findByTitleKey(connection, 'java oop');
  assert.equal(matches.length, 2);

  await closeTestContext(context);
});
