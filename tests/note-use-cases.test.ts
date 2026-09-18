/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '@/core/db/database';
import {
  createNoteUseCases,
  shouldTouchOpenedAt,
} from '@/features/notes/application/note-use-cases';
import { createRepositories } from '@/repositories';

import { closeTestContext, createTestContext } from './helpers/context';
import { createNodeConnection } from './helpers/node-sqlite-connection';

function buildUseCases(context: Awaited<ReturnType<typeof createTestContext>>) {
  return createNoteUseCases({
    connection: context.connection,
    notes: context.repos.notes,
    links: context.repos.links,
    reconcileTags: { reconcile: async () => undefined },
    reconcileLinks: {
      reconcile: async () => undefined,
      resolveByTargetText: async () => undefined,
    },
    now: context.now,
  });
}

test('createNote assigns a stable ID and timestamps', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  const note = await notes.createNote({ title: 'Judul', content: 'Isi catatan' });

  assert.ok(note.id.length > 0);
  assert.equal(note.title, 'Judul');
  assert.equal(note.content, 'Isi catatan');
  assert.equal(note.captureType, 'text');
  assert.equal(note.createdAt, note.updatedAt);
  assert.equal(note.openedAt, null);

  // The ID is stable across reads.
  const reread = await notes.getNote(note.id);
  assert.equal(reread?.id, note.id);

  await closeTestContext(context);
});

test('createNote does not invent title/content validation', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  const note = await notes.createNote({ content: 'tanpa judul' });
  assert.equal(note.title, '');
  assert.equal(note.titleKey, '');

  await closeTestContext(context);
});

test('updateNote preserves ID and created_at, and advances updated_at', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  const created = await notes.createNote({ title: 'Awal' });

  const updated = await notes.updateNote(created.id, { title: 'Akhir', content: 'baru' });

  assert.equal(updated?.id, created.id);
  assert.equal(updated?.createdAt, created.createdAt);
  assert.ok(updated && updated.updatedAt > created.updatedAt);

  await closeTestContext(context);
});

test('updateNote does not touch opened_at', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  const created = await notes.createNote({ title: 'Catatan' });
  const opened = await notes.openNote(created.id);
  assert.ok(opened?.openedAt);

  const updated = await notes.updateNote(created.id, { content: 'diubah' });
  assert.equal(updated?.openedAt, opened?.openedAt);

  await closeTestContext(context);
});

test('openNote retrieves the note and sets opened_at with throttling', async () => {
  let current = '2026-06-01T00:00:00.000Z';
  const context = await createTestContext({ now: () => current });
  const notes = buildUseCases(context);

  const created = await notes.createNote({ title: 'Buka' });

  const firstOpen = await notes.openNote(created.id);
  assert.equal(firstOpen?.id, created.id);
  assert.equal(firstOpen?.openedAt, '2026-06-01T00:00:00.000Z');

  // Within the throttle window the timestamp must not be rewritten.
  current = '2026-06-01T00:00:30.000Z';
  const withinWindow = await notes.openNote(created.id);
  assert.equal(withinWindow?.openedAt, '2026-06-01T00:00:00.000Z');

  // After the window it is refreshed.
  current = '2026-06-01T00:01:31.000Z';
  const afterWindow = await notes.openNote(created.id);
  assert.equal(afterWindow?.openedAt, '2026-06-01T00:01:31.000Z');

  await closeTestContext(context);
});

test('openNote returns null for an unknown note', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  assert.equal(await notes.openNote('missing-note'), null);

  await closeTestContext(context);
});

test('deleteNote removes the correct note and is idempotent', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  const first = await notes.createNote({ title: 'Pertama' });
  const second = await notes.createNote({ title: 'Kedua' });

  assert.equal(await notes.deleteNote(first.id), true);
  assert.equal(await notes.getNote(first.id), null);
  assert.ok(await notes.getNote(second.id));

  assert.equal(await notes.deleteNote(first.id), false);

  await closeTestContext(context);
});

test('created notes appear in recent listing', async () => {
  const context = await createTestContext();
  const notes = buildUseCases(context);

  const note = await notes.createNote({ title: 'Terbaru' });
  const recent = await notes.listRecentNotes({ limit: 10 });

  assert.equal(recent[0]?.id, note.id);

  await closeTestContext(context);
});

test('a note persists across a database reopen (restart)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-persist-'));
  const databasePath = join(directory, 'noto.db');

  try {
    const firstConnection = createNodeConnection(databasePath);
    const firstDatabase = await openDatabase(firstConnection);
    const firstRepos = createRepositories(firstDatabase, {
      newId: () => 'persisted-note',
      now: () => '2026-07-01T00:00:00.000Z',
    });
    const firstUseCases = createNoteUseCases({
      connection: firstConnection,
      notes: firstRepos.notes,
      links: firstRepos.links,
      reconcileTags: { reconcile: async () => undefined },
      reconcileLinks: {
        reconcile: async () => undefined,
        resolveByTargetText: async () => undefined,
      },
      now: () => '2026-07-01T00:00:00.000Z',
    });
    const created = await firstUseCases.createNote({ title: 'Tahan Restart', content: 'isi' });
    await firstConnection.closeAsync();

    const secondConnection = createNodeConnection(databasePath);
    const secondDatabase = await openDatabase(secondConnection);
    const secondRepos = createRepositories(secondDatabase, {
      newId: () => 'unused',
      now: () => '2026-07-02T00:00:00.000Z',
    });

    const reloaded = await secondRepos.notes.getById(secondConnection, created.id);
    assert.equal(reloaded?.title, 'Tahan Restart');
    assert.equal(reloaded?.content, 'isi');
    assert.equal(secondDatabase.schemaVersion, 1);

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('shouldTouchOpenedAt encodes the documented throttle policy', () => {
  assert.equal(shouldTouchOpenedAt(null, '2026-01-01T00:00:00.000Z'), true);
  assert.equal(shouldTouchOpenedAt('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:30.000Z'), false);
  assert.equal(shouldTouchOpenedAt('2026-01-01T00:00:00.000Z', '2026-01-01T00:01:30.000Z'), true);
});
