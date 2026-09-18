import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeTagName } from '@/features/tags/domain/tag';

import { closeTestContext, createTestContext } from './helpers/context';

test('tag identity is normalized and casing is preserved for display', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const first = await repos.tags.findOrCreate(connection, 'Java');
  const second = await repos.tags.findOrCreate(connection, '  java ');

  assert.equal(first.id, second.id);
  assert.equal(first.name, 'java');
  assert.equal(first.displayName, 'Java');
  assert.equal(normalizeTagName('JAVA'), 'java');

  await closeTestContext(context);
});

test('attaching and removing tags maintains the note-tag relation', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Catatan' });
  const java = await repos.tags.findOrCreate(connection, 'java');
  const college = await repos.tags.findOrCreate(connection, 'college');

  await repos.tags.attachToNote(connection, note.id, java.id);
  await repos.tags.attachToNote(connection, note.id, college.id);
  await repos.tags.attachToNote(connection, note.id, java.id); // idempotent

  const tags = await repos.tags.listForNote(connection, note.id);
  assert.deepEqual(
    tags.map((tag) => tag.name),
    ['college', 'java'],
  );

  await repos.tags.removeFromNote(connection, note.id, java.id);
  const remaining = await repos.tags.listForNote(connection, note.id);
  assert.deepEqual(
    remaining.map((tag) => tag.name),
    ['college'],
  );

  await closeTestContext(context);
});

test('removing a tag assignment never deletes the tag row', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Catatan' });
  const tag = await repos.tags.findOrCreate(connection, 'project');
  await repos.tags.attachToNote(connection, note.id, tag.id);
  await repos.tags.removeFromNote(connection, note.id, tag.id);

  assert.ok(await repos.tags.getById(connection, tag.id), 'tag must survive unassignment');

  await closeTestContext(context);
});

test('notes can be listed by tag', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const tag = await repos.tags.findOrCreate(connection, 'java');
  const first = await repos.notes.create(connection, { title: 'Satu' });
  const second = await repos.notes.create(connection, { title: 'Dua' });
  await repos.tags.attachToNote(connection, first.id, tag.id);
  await repos.tags.attachToNote(connection, second.id, tag.id);

  const noteIds = await repos.tags.listNoteIdsByTag(connection, tag.id);
  assert.equal(noteIds.length, 2);
  assert.ok(noteIds.includes(first.id) && noteIds.includes(second.id));

  await closeTestContext(context);
});

test('explicit tag deletion removes assignments but not notes', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Catatan' });
  const tag = await repos.tags.findOrCreate(connection, 'sementara');
  await repos.tags.attachToNote(connection, note.id, tag.id);

  await repos.tags.remove(connection, tag.id);

  assert.equal(await repos.tags.getById(connection, tag.id), null);
  assert.ok(await repos.notes.getById(connection, note.id));
  assert.equal((await repos.tags.listForNote(connection, note.id)).length, 0);

  await closeTestContext(context);
});
