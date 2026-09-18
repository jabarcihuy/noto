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

test('wikilink relationships and backlinks survive a database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-links-'));
  const databasePath = join(directory, 'noto.db');

  try {
    let sourceId = '';
    let targetId = '';
    let ambiguousLinkId = '';

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

    await first.notes.createNote({ title: 'Java' });
    await first.notes.createNote({ title: 'Java' });
    const target = await first.notes.createNote({ title: 'Java OOP' });
    const source = await first.notes.createNote({
      title: 'Sumber',
      content: '[[Java OOP]] [[Nanti]] [[Java]]',
    });
    sourceId = source.id;
    targetId = target.id;

    const outgoing = await first.links.listBySource(sourceId);
    const byTargetText = new Map(outgoing.map((link) => [link.targetText, link]));
    assert.equal(byTargetText.get('java oop')?.resolution, 'resolved');
    assert.equal(byTargetText.get('nanti')?.resolution, 'unresolved');
    assert.equal(byTargetText.get('java')?.resolution, 'ambiguous');
    ambiguousLinkId = byTargetText.get('java')!.id;

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

    const reloaded = await second.links.listBySource(sourceId);
    const reloadedByText = new Map(reloaded.map((link) => [link.targetText, link]));
    assert.equal(
      reloadedByText.get('java oop')?.targetNoteId,
      targetId,
      'resolved target persists',
    );
    assert.equal(reloadedByText.get('nanti')?.resolution, 'unresolved', 'unresolved persists');
    assert.equal(reloadedByText.get('java')?.resolution, 'ambiguous', 'ambiguous persists');

    assert.deepEqual(
      (await second.links.listBacklinks(targetId)).map((note) => note.id),
      [sourceId],
      'backlinks are recomputed from persisted relationships',
    );

    // A user choice made after restart still connects the ambiguous link.
    const javaNote = (await second.links.candidatesFor('Java'))[0]!;
    await second.links.resolveLink(ambiguousLinkId, javaNote.id);
    const afterChoice = (await second.links.listBySource(sourceId)).find(
      (link) => link.id === ambiguousLinkId,
    );
    assert.equal(afterChoice?.resolution, 'resolved');
    assert.equal(afterChoice?.targetNoteId, javaNote.id);

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
