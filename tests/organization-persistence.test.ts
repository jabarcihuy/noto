/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '@/core/db/database';
import { createRepositories } from '@/repositories';

import { createNodeConnection } from './helpers/node-sqlite-connection';
import { createTestServices } from './helpers/services';

test('notebook and tag relationships persist across a database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-org-'));
  const databasePath = join(directory, 'noto.db');

  try {
    let noteId = '';
    let notebookId = '';

    const firstConnection = createNodeConnection(databasePath);
    const firstDatabase = await openDatabase(firstConnection);
    const firstRepos = createRepositories(firstDatabase, {
      newId: () => `id-${Math.random().toString(16).slice(2)}`,
      now: () => '2026-07-01T00:00:00.000Z',
    });
    const first = createTestServices({
      connection: firstConnection,
      repos: firstRepos,
      now: () => '2026-07-01T00:00:00.000Z',
    });

    const notebook = await first.notebooks.create('Kuliah');
    notebookId = notebook.id;
    const note = await first.notes.createNote({
      title: 'Terorganisasi',
      content: 'Belajar #Java dan #college',
      notebookId: notebook.id,
    });
    noteId = note.id;

    assert.deepEqual(
      (await first.tags.listForNote(noteId)).map((tag) => tag.name),
      ['college', 'java'],
    );

    await firstConnection.closeAsync();

    const secondConnection = createNodeConnection(databasePath);
    const secondDatabase = await openDatabase(secondConnection);
    const secondRepos = createRepositories(secondDatabase, {
      newId: () => 'unused',
      now: () => '2026-07-02T00:00:00.000Z',
    });
    const second = createTestServices({
      connection: secondConnection,
      repos: secondRepos,
      now: () => '2026-07-02T00:00:00.000Z',
    });

    const reloaded = await second.notes.getNote(noteId);
    assert.equal(reloaded?.notebookId, notebookId, 'notebook assignment persists');

    assert.deepEqual(
      (await second.tags.listForNote(noteId)).map((tag) => tag.name),
      ['college', 'java'],
      'tags persist',
    );
    assert.equal((await second.notebooks.getById(notebookId))?.name, 'Kuliah');

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
