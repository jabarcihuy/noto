import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';
import { createTestServices } from './helpers/services';

test('note content is parsed into normalized tags on save', async () => {
  const context = await createTestContext();
  const { notes, tags } = createTestServices(context);

  const note = await notes.createNote({ title: 'Java', content: 'Belajar #Java dan #college' });

  const attached = await tags.listForNote(note.id);
  assert.deepEqual(
    attached.map((tag) => tag.name),
    ['college', 'java'],
  );
  assert.equal(attached.find((tag) => tag.name === 'java')?.displayName, 'Java');

  await closeTestContext(context);
});

test('editing content reconciles assignments but never deletes tag rows', async () => {
  const context = await createTestContext();
  const { notes, tags } = createTestServices(context);

  const note = await notes.createNote({ content: '#java #college' });
  await notes.updateNote(note.id, { content: '#java' });

  const attached = await tags.listForNote(note.id);
  assert.deepEqual(
    attached.map((tag) => tag.name),
    ['java'],
  );

  const all = await tags.list();
  assert.ok(
    all.some((tag) => tag.name === 'college'),
    'the unassigned tag row must remain',
  );

  await closeTestContext(context);
});

test('duplicate tag tokens in content produce a single assignment', async () => {
  const context = await createTestContext();
  const { notes, tags } = createTestServices(context);

  const note = await notes.createNote({ content: '#java and #Java and #JAVA' });
  const attached = await tags.listForNote(note.id);
  assert.equal(attached.length, 1);
  assert.equal(attached[0]?.name, 'java');

  await closeTestContext(context);
});

test('tags inside code are not parsed', async () => {
  const context = await createTestContext();
  const { notes, tags } = createTestServices(context);

  const note = await notes.createNote({ content: 'nyata #asli\n\n`#kode`' });
  const attached = await tags.listForNote(note.id);
  assert.deepEqual(
    attached.map((tag) => tag.name),
    ['asli'],
  );

  await closeTestContext(context);
});

test('addTagToNote and removeTagFromNote update content and assignments', async () => {
  const context = await createTestContext();
  const { notes, tags } = createTestServices(context);

  const note = await notes.createNote({ content: 'Isi' });

  await tags.addTagToNote(note.id, 'Java');
  await tags.addTagToNote(note.id, 'college');
  await tags.addTagToNote(note.id, 'java'); // duplicate is a no-op

  let attached = await tags.listForNote(note.id);
  assert.deepEqual(
    attached.map((tag) => tag.name),
    ['college', 'java'],
  );

  await tags.removeTagFromNote(note.id, 'java');
  attached = await tags.listForNote(note.id);
  assert.deepEqual(
    attached.map((tag) => tag.name),
    ['college'],
  );

  const reloaded = await notes.getNote(note.id);
  assert.ok(!reloaded?.content.includes('#java'));
  assert.ok(reloaded?.content.includes('#college'));

  await closeTestContext(context);
});

test('tag identity is normalized independently of display text', async () => {
  const context = await createTestContext();
  const { notes, tags } = createTestServices(context);

  const first = await notes.createNote({ content: '#Java' });
  const second = await notes.createNote({ content: '#java' });

  const all = await tags.list();
  assert.equal(all.length, 1, 'Java and java are one logical tag');

  assert.equal((await tags.listForNote(first.id)).length, 1);
  assert.equal((await tags.listForNote(second.id)).length, 1);

  await closeTestContext(context);
});
