/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '@/core/db/database';
import { seedBuiltInTemplates } from '@/features/templates/data/seed-builtin-templates';
import { serializeNoteMarkdown } from '@/features/vault/domain/note-markdown';
import { createRepositories } from '@/repositories';

import { closeTestContext, createTestContext } from './helpers/context';
import { createNodeConnection } from './helpers/node-sqlite-connection';
import { createTestServices } from './helpers/services';

test('creating a note from a template copies content into an independent note', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { notes } = createTestServices(context);

  const [template] = await repos.templates.list(context.connection);
  assert.ok(template);

  const note = await notes.createNote({ content: template!.content });

  assert.ok(note.id.length > 0);
  assert.notEqual(note.id, template!.id);
  assert.equal(note.content, template!.content);
  assert.equal(note.title, '');

  const templateAfter = await repos.templates.getById(context.connection, template!.id);
  assert.equal(
    templateAfter?.updatedAt,
    template!.updatedAt,
    'creating a note never edits the template',
  );

  await closeTestContext(context);
});

test('note and template stay independent after edits in either direction', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { notes } = createTestServices(context);

  const [template] = await repos.templates.list(context.connection);
  assert.ok(template);
  const note = await notes.createNote({ content: template!.content });

  // Editing the note must not change the template.
  await notes.updateNote(note.id, { content: 'Isi catatan berubah' });
  const templateAfterNoteEdit = await repos.templates.getById(context.connection, template!.id);
  assert.equal(templateAfterNoteEdit?.content, template!.content);

  // Editing the template must not change existing notes.
  await repos.templates.update(context.connection, template!.id, {
    content: 'Isi template berubah',
  });
  const noteAfterTemplateEdit = await notes.getNote(note.id);
  assert.equal(noteAfterTemplateEdit?.content, 'Isi catatan berubah');

  await closeTestContext(context);
});

test('template content goes through existing tag and link reconciliation', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { notes, tags, links } = createTestServices(context);

  const target = await notes.createNote({ title: 'Java OOP' });
  const template = await repos.templates.create(context.connection, {
    name: 'Terstruktur',
    content: '## Rencana #proyek\n\nLihat [[Java OOP]]\n',
  });

  const note = await notes.createNote({ content: template.content });

  assert.deepEqual(
    (await tags.listForNote(note.id)).map((tag) => tag.name),
    ['proyek'],
  );
  const [link] = await links.listBySource(note.id);
  assert.equal(link?.targetNoteId, target.id);
  assert.equal(link?.resolution, 'resolved');

  await closeTestContext(context);
});

test('an empty template does not produce an invalid note row', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { notes } = createTestServices(context);

  const template = await repos.templates.create(context.connection, {
    name: 'Kosong',
    content: '',
  });
  const note = await notes.createNote({ content: template.content });

  assert.ok(note.id.length > 0);
  assert.equal(note.content, '');
  assert.equal((await notes.getNote(note.id))?.id, note.id);

  await closeTestContext(context);
});

test('a note created from a template exports with the unchanged format', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { notes } = createTestServices(context);

  const [template] = await repos.templates.list(context.connection);
  assert.ok(template);
  const note = await notes.createNote({ title: 'Dari Template', content: template!.content });

  const markdown = serializeNoteMarkdown(note);
  assert.ok(markdown.startsWith('---\n'));
  assert.ok(markdown.endsWith(`\n\n${template!.content}`));
  assert.equal(markdown.includes('templateId'), false);
  assert.equal(markdown.includes(template!.id), false);

  await closeTestContext(context);
});

test('a template-created note and the template persist across a database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-template-'));
  const databasePath = join(directory, 'noto.db');

  try {
    let noteId = '';
    let templateId = '';
    let templateContent = '';

    const firstConnection = createNodeConnection(databasePath);
    const firstDatabase = await openDatabase(firstConnection);
    const firstRepos = createRepositories(firstDatabase, {
      newId: () => `id-${Math.random().toString(16).slice(2)}`,
      now: () => '2026-07-01T00:00:00.000Z',
    });
    await firstConnection.withTransactionAsync(async (tx) => {
      await seedBuiltInTemplates(tx, () => '2026-07-01T00:00:00.000Z');
    });
    const [template] = await firstRepos.templates.list(firstConnection);
    assert.ok(template);
    templateId = template!.id;
    templateContent = template!.content;
    const note = await firstRepos.notes.create(firstConnection, { content: template!.content });
    noteId = note.id;

    await firstConnection.closeAsync();

    const secondConnection = createNodeConnection(databasePath);
    const secondDatabase = await openDatabase(secondConnection);
    const secondRepos = createRepositories(secondDatabase, {
      newId: () => 'unused',
      now: () => '2026-07-02T00:00:00.000Z',
    });

    const reloadedNote = await secondRepos.notes.getById(secondConnection, noteId);
    assert.equal(reloadedNote?.content, templateContent);
    assert.ok(await secondRepos.templates.getById(secondConnection, templateId));

    // Editing the persisted note still does not touch the template.
    await secondRepos.notes.update(secondConnection, noteId, { content: 'Diubah setelah restart' });
    const templateAfter = await secondRepos.templates.getById(secondConnection, templateId);
    assert.equal(templateAfter?.content, templateContent);

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
