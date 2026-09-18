/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';
import { createTestServices } from './helpers/services';

test('zero matches: a wikilink in content is unresolved and the note still saves', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const source = await notes.createNote({
    title: 'Belajar',
    content: 'Saya perlu belajar [[Operating Systems]].',
  });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'unresolved');
  assert.equal(link?.targetNoteId, null);
  assert.equal(link?.targetText, 'operating systems');
  assert.equal(source.content, 'Saya perlu belajar [[Operating Systems]].');

  await closeTestContext(context);
});

test('one match: a wikilink resolves to the single matching note', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java OOP' });
  const source = await notes.createNote({ title: 'Sumber', content: 'Lihat [[Java OOP]].' });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('multiple matches: a wikilink is ambiguous and never picks the oldest', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const first = await notes.createNote({ title: 'Java' });
  const second = await notes.createNote({ title: 'java' });
  const source = await notes.createNote({ title: 'Sumber', content: '[[Java]]' });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'ambiguous');
  assert.equal(link?.targetNoteId, null);
  assert.notEqual(link?.targetNoteId, first.id);
  assert.notEqual(link?.targetNoteId, second.id);

  await closeTestContext(context);
});

test('unresolved later resolves when exactly one matching note is created', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const source = await notes.createNote({ title: 'Sumber', content: '[[Java Basics]]' });
  assert.equal((await links.listBySource(source.id))[0]?.resolution, 'unresolved');

  const target = await notes.createNote({ title: 'Java Basics' });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target.id);

  await closeTestContext(context);
});

test('rename safety: renaming the target and recreating the old title never re-points the link', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const source = await notes.createNote({ title: 'Catatan A', content: 'Ke [[Java Basics]]' });
  const target = await notes.createNote({ title: 'Java Basics' });
  assert.equal((await links.listBySource(source.id))[0]?.targetNoteId, target.id);

  await notes.updateNote(target.id, { title: 'Java Fundamental' });
  const duplicate = await notes.createNote({ title: 'Java Basics' });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target.id, 'original relationship is preserved');
  assert.notEqual(link?.targetNoteId, duplicate.id);

  await closeTestContext(context);
});

test('a resolved relationship is unchanged by unrelated edits and renames', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Tujuan' });
  const source = await notes.createNote({ title: 'Sumber', content: '[[Tujuan]]' });
  const before = (await links.listBySource(source.id))[0];

  await notes.updateNote(source.id, { content: 'Teks berubah, [[Tujuan]] tetap.' });
  await notes.updateNote(target.id, { content: 'isi baru' });

  const after = (await links.listBySource(source.id))[0];
  assert.equal(after?.targetNoteId, before?.targetNoteId);
  assert.equal(after?.resolution, 'resolved');

  await closeTestContext(context);
});

test('renaming a note can resolve unresolved references to its new title', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const source = await notes.createNote({ title: 'Sumber', content: '[[Sistem Operasi]]' });
  assert.equal((await links.listBySource(source.id))[0]?.resolution, 'unresolved');

  const note = await notes.createNote({ title: 'Sementara' });
  await notes.updateNote(note.id, { title: 'Sistem Operasi' });

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, note.id);

  await closeTestContext(context);
});

test('deleting a target makes incoming links unresolved and keeps the source note', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java OOP' });
  const source = await notes.createNote({ title: 'Sumber', content: '[[Java OOP]]' });

  await notes.deleteNote(target.id);

  const [link] = await links.listBySource(source.id);
  assert.equal(link?.resolution, 'unresolved');
  assert.equal(link?.targetNoteId, null);
  assert.ok(await notes.getNote(source.id));

  await closeTestContext(context);
});

test('backlinks list the source notes and disappear when the source is deleted', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Tujuan' });
  const a = await notes.createNote({ title: 'A', content: 'lihat [[Tujuan]]' });
  await notes.createNote({ title: 'B', content: 'tidak tertaut' });

  assert.deepEqual(
    (await links.listBacklinks(target.id)).map((note) => note.id),
    [a.id],
  );

  await notes.deleteNote(a.id);
  assert.deepEqual(await links.listBacklinks(target.id), []);

  await closeTestContext(context);
});

test('alias and anchor links keep the source visible and resolve on the target', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java OOP' });
  const source = await notes.createNote({
    title: 'Sumber',
    content: '[[Java OOP|OOP]] dan [[Java OOP#Inheritance]]',
  });

  const outgoing = await links.listBySource(source.id);
  assert.equal(outgoing.length, 2, 'distinct alias/anchor identities are kept');
  assert.ok(outgoing.every((link) => link.targetNoteId === target.id));
  assert.deepEqual(
    (await links.listBacklinks(target.id)).map((note) => note.id),
    [source.id],
    'a source linking twice appears once in backlinks',
  );

  await closeTestContext(context);
});

test('suggestions match by title prefix and return recent notes for an empty query', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  await notes.createNote({ title: 'Java Basics' });
  await notes.createNote({ title: 'Java OOP' });
  await notes.createNote({ title: 'Kotlin' });

  const java = await links.suggest('java');
  assert.deepEqual(java.map((note) => note.title).sort(), ['Java Basics', 'Java OOP']);

  const recent = await links.suggest('');
  assert.equal(recent.length, 3);

  await closeTestContext(context);
});

test('candidatesFor returns every note with the same normalized title', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  await notes.createNote({ title: 'Java Basics' });
  await notes.createNote({ title: 'java basics' });
  await notes.createNote({ title: 'Java OOP' });

  assert.equal((await links.candidatesFor('JAVA BASICS')).length, 2);
  assert.equal((await links.candidatesFor('Java OOP')).length, 1);

  await closeTestContext(context);
});

test('a user-selected target connects an ambiguous link without changing content', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  await notes.createNote({ title: 'Java' });
  const chosen = await notes.createNote({ title: 'Java' });
  const source = await notes.createNote({ title: 'Sumber', content: '[[Java]]' });

  const before = (await links.listBySource(source.id))[0];
  assert.equal(before?.resolution, 'ambiguous');

  await links.resolveLink(before!.id, chosen.id);

  const after = (await links.listBySource(source.id))[0];
  assert.equal(after?.resolution, 'resolved');
  assert.equal(after?.targetNoteId, chosen.id);
  assert.equal((await notes.getNote(source.id))?.content, '[[Java]]');

  await closeTestContext(context);
});

test('wikilink parsing leaves tags and surrounding text intact', async () => {
  const context = await createTestContext();
  const { notes, links, tags } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java OOP' });
  const source = await notes.createNote({
    title: 'Sumber',
    content: '#java [[Java OOP]] code',
  });

  assert.deepEqual(
    (await tags.listForNote(source.id)).map((tag) => tag.name),
    ['java'],
  );
  const [link] = await links.listBySource(source.id);
  assert.equal(link?.targetNoteId, target.id);
  assert.equal((await notes.getNote(source.id))?.content, '#java [[Java OOP]] code');

  await closeTestContext(context);
});
