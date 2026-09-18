import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';
import { createTestServices } from './helpers/services';

test('notebooks support create, list, and rename', async () => {
  const context = await createTestContext();
  const { notebooks } = createTestServices(context);

  const created = await notebooks.create('Kuliah');
  assert.equal(created.name, 'Kuliah');
  assert.ok(created.id);

  const renamed = await notebooks.rename(created.id, 'Kuliah Semester 1');
  assert.equal(renamed?.name, 'Kuliah Semester 1');

  const all = await notebooks.list();
  assert.equal(all.length, 1);
  assert.equal(all[0]?.name, 'Kuliah Semester 1');

  await closeTestContext(context);
});

test('a note can be assigned to and removed from a notebook', async () => {
  const context = await createTestContext();
  const { notes, notebooks } = createTestServices(context);

  const notebook = await notebooks.create('Project');
  const note = await notes.createNote({ title: 'Catatan' });
  assert.equal(note.notebookId, null, 'notes can exist without a notebook');

  await notebooks.assignNote(note.id, notebook.id);
  const assigned = await notes.getNote(note.id);
  assert.equal(assigned?.notebookId, notebook.id);

  await notebooks.removeNote(note.id);
  const removed = await notes.getNote(note.id);
  assert.equal(removed?.notebookId, null);

  await closeTestContext(context);
});

test('deleting a notebook leaves its notes intact and unassigned', async () => {
  const context = await createTestContext();
  const { notes, notebooks } = createTestServices(context);

  const notebook = await notebooks.create('Sementara');
  const note = await notes.createNote({ title: 'Tetap ada', notebookId: notebook.id });

  assert.equal(await notebooks.remove(notebook.id), true);

  const kept = await notes.getNote(note.id);
  assert.ok(kept, 'the note must survive');
  assert.equal(kept?.notebookId, null);
  assert.equal(await notebooks.getById(notebook.id), null);

  await closeTestContext(context);
});

test('notebook note list returns only its own notes', async () => {
  const context = await createTestContext();
  const { notes, notebooks } = createTestServices(context);

  const notebook = await notebooks.create('Kuliah');
  const inside = await notes.createNote({ title: 'Di dalam', notebookId: notebook.id });
  await notes.createNote({ title: 'Di luar' });

  const listed = await notebooks.listNotes(notebook.id);
  assert.deepEqual(
    listed.map((note) => note.id),
    [inside.id],
  );

  await closeTestContext(context);
});
