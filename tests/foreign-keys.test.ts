import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';

test('foreign key enforcement is active on the connection', async () => {
  const context = await createTestContext();
  const row = await context.connection.getFirstAsync<{ foreign_keys: number }>(
    'PRAGMA foreign_keys',
  );
  assert.equal(Number(row?.foreign_keys), 1);
  await closeTestContext(context);
});

test('CASCADE: deleting a note removes its tag assignments, links, and attachments', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Sumber' });
  const tag = await repos.tags.findOrCreate(connection, 'Java');
  await repos.tags.attachToNote(connection, note.id, tag.id);
  await repos.links.replaceLinksForNote(connection, note.id, [{ targetText: 'Tujuan' }]);
  await repos.attachments.create(connection, {
    noteId: note.id,
    kind: 'image',
    relativePath: 'attachments/a.jpg',
  });

  await repos.notes.remove(connection, note.id);

  assert.equal(
    Number(
      (await connection.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM note_tags'))?.c,
    ),
    0,
  );
  assert.equal(
    Number(
      (await connection.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM note_links'))?.c,
    ),
    0,
  );
  assert.equal(
    Number(
      (await connection.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM attachments'))?.c,
    ),
    0,
  );
  // The tag row itself is never deleted automatically.
  assert.ok(await repos.tags.getById(connection, tag.id));

  await closeTestContext(context);
});

test('SET NULL: deleting a notebook keeps notes and clears notebook_id', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const notebook = await repos.notebooks.create(connection, { name: 'Kuliah' });
  const note = await repos.notes.create(connection, {
    title: 'Catatan',
    notebookId: notebook.id,
  });

  await repos.notebooks.remove(connection, notebook.id);

  const keptNote = await repos.notes.getById(connection, note.id);
  assert.ok(keptNote, 'note must survive notebook deletion');
  assert.equal(keptNote?.notebookId, null);

  await closeTestContext(context);
});

test('SET NULL: deleting a link target clears target_note_id', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const target = await repos.notes.create(connection, { title: 'Target' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Target' }]);

  await repos.notes.remove(connection, target.id);

  const links = await repos.links.listBySource(connection, source.id);
  assert.equal(links.length, 1);
  assert.equal(links[0]?.targetNoteId, null);

  await closeTestContext(context);
});

test('an invalid foreign key insert is rejected', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const note = await repos.notes.create(connection, { title: 'Catatan' });
  await assert.rejects(() =>
    connection.runAsync('INSERT INTO note_tags (note_id, tag_id, created_at) VALUES (?, ?, ?)', [
      note.id,
      'missing-tag',
      '2026-01-01T00:00:00.000Z',
    ]),
  );

  await closeTestContext(context);
});

test('attachments require a note and are rejected without one', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  await assert.rejects(() =>
    repos.attachments.create(connection, {
      noteId: 'missing-note',
      kind: 'file',
      relativePath: 'attachments/x.pdf',
    }),
  );

  await closeTestContext(context);
});
