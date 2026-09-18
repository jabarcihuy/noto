import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deleteNote } from '@/features/notes/application/delete-note';

import { closeTestContext, createTestContext } from './helpers/context';

test('no match: a link with no target note is unresolved', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Belum Ada' }]);

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.resolution, 'unresolved');
  assert.equal(link?.targetNoteId, null);

  await closeTestContext(context);
});

test('unique match: a link resolves to the single matching note', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const target = await repos.notes.create(connection, { title: 'Java OOP' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java OOP' }]);

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('zero matches becomes resolved when exactly one target is later created', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  await repos.links.replaceLinksForNote(connection, source.id, [
    { targetText: 'Operating Systems' },
  ]);

  const before = (await repos.links.listBySource(connection, source.id))[0];
  assert.equal(before?.resolution, 'unresolved');

  const target = await repos.notes.create(connection, { title: 'Operating Systems' });
  await repos.links.resolveLinks(connection, {});

  const after = (await repos.links.listBySource(connection, source.id))[0];
  assert.equal(after?.resolution, 'resolved');
  assert.equal(after?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('ambiguous: multiple matching titles stay unresolved and never pick the oldest', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const oldest = await repos.notes.create(connection, { title: 'Java' });
  const newest = await repos.notes.create(connection, { title: 'java' });

  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java' }]);

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.resolution, 'ambiguous');
  assert.equal(link?.targetNoteId, null);
  assert.notEqual(link?.targetNoteId, oldest.id);
  assert.notEqual(link?.targetNoteId, newest.id);

  await closeTestContext(context);
});

test('a resolved link is never re-pointed when another same-title note is created', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const target = await repos.notes.create(connection, { title: 'Java OOP' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java OOP' }]);

  const resolved = (await repos.links.listBySource(connection, source.id))[0];
  assert.equal(resolved?.targetNoteId, target.id);

  // Creating a duplicate title must not steal the already-resolved relationship.
  await repos.notes.create(connection, { title: 'Java OOP' });
  await repos.links.resolveLinks(connection, {});

  const after = (await repos.links.listBySource(connection, source.id))[0];
  assert.equal(after?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('renaming the target does not change an existing relationship', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const target = await repos.notes.create(connection, { title: 'Java Basics' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java Basics' }]);

  await repos.notes.update(connection, target.id, { title: 'Java Fundamental' });
  await repos.links.resolveLinks(connection, {});

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.targetNoteId, target.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetText, 'java basics', 'raw target text may stay stale');

  await closeTestContext(context);
});

test('deleting the target produces the documented unresolved state', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const target = await repos.notes.create(connection, { title: 'Java OOP' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java OOP' }]);

  await deleteNote(connection, { notes: repos.notes, links: repos.links }, target.id);

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.targetNoteId, null);
  assert.equal(link?.resolution, 'unresolved');
  assert.ok(await repos.notes.getById(connection, source.id), 'source note must survive');

  await closeTestContext(context);
});

test('rebuilding links preserves a resolved target for an unchanged link', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  const target = await repos.notes.create(connection, { title: 'Java OOP' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java OOP' }]);
  await repos.notes.create(connection, { title: 'Java OOP' }); // duplicate appears

  await repos.links.replaceLinksForNote(connection, source.id, [
    { targetText: 'Java OOP', displayText: null, anchor: null },
  ]);

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('identical links are deduplicated and aliases/anchors are preserved', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  await repos.links.replaceLinksForNote(connection, source.id, [
    { targetText: 'Java OOP' },
    { targetText: 'Java OOP' },
    { targetText: 'Java OOP', displayText: 'OOP' },
    { targetText: 'Java OOP', anchor: 'Bagian' },
  ]);

  const links = await repos.links.listBySource(connection, source.id);
  assert.equal(links.length, 3);
  const aliases = links.filter((link) => link.displayText !== null);
  assert.equal(aliases.length, 1);

  await closeTestContext(context);
});

test('an unresolved link becomes ambiguous when resolution later sees two matches', async () => {
  const context = await createTestContext();
  const { connection, repos } = context;

  const source = await repos.notes.create(connection, { title: 'Sumber' });
  await repos.links.replaceLinksForNote(connection, source.id, [{ targetText: 'Java' }]);
  assert.equal(
    (await repos.links.listBySource(connection, source.id))[0]?.resolution,
    'unresolved',
  );

  // Two matching notes appear before resolution runs; the app must not guess one.
  await repos.notes.create(connection, { title: 'Java' });
  await repos.notes.create(connection, { title: 'java' });
  await repos.links.resolveLinks(connection, {});

  const [link] = await repos.links.listBySource(connection, source.id);
  assert.equal(link?.resolution, 'ambiguous');
  assert.equal(link?.targetNoteId, null);

  await closeTestContext(context);
});
