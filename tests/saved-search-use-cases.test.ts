/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '@/core/db/database';
import { createSearchUseCases } from '@/features/search/application/search-use-cases';
import { createSearchRepository } from '@/features/search/data/search-repository';
import { createRepositories, type Repositories } from '@/repositories';

import { closeTestContext, createTestContext } from './helpers/context';
import { createNodeConnection } from './helpers/node-sqlite-connection';
import { createTestServices } from './helpers/services';

test('a saved search stores rules and recomputes results against current data', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const match = await notes.createNote({ title: 'Java Dasar', content: '#programming' });
  await notes.createNote({ title: 'Kotlin', content: '#programming' });
  await notes.createNote({ title: 'Java tanpa tag', content: 'java' });

  const saved = await search.createSavedSearch({
    name: 'Programming Notes',
    query: 'java',
    filters: { tags: ['programming'] },
    sort: 'updated_desc',
  });

  assert.equal(saved.name, 'Programming Notes');
  assert.equal(saved.query, 'java');
  assert.deepEqual(saved.filters, { tags: ['programming'] });

  const firstRun = await search.search({
    query: saved.query,
    filters: saved.filters,
    sort: saved.sort,
  });
  assert.deepEqual(
    firstRun.items.map((item) => item.note.id),
    [match.id],
  );

  // The rule is recomputed: a newly matching note appears without changing the saved search.
  const newMatch = await notes.createNote({ title: 'Java Lanjutan', content: '#programming' });
  const secondRun = await search.search({
    query: saved.query,
    filters: saved.filters,
    sort: saved.sort,
  });
  assert.ok(secondRun.items.some((item) => item.note.id === newMatch.id));

  await closeTestContext(context);
});

test('saved search creation requires a name and lists by name', async () => {
  const context = await createTestContext();
  const { search } = createTestServices(context);

  await assert.rejects(() => search.createSavedSearch({ name: '   ' }));

  await search.createSavedSearch({ name: 'Zeta', query: 'z' });
  await search.createSavedSearch({ name: 'Alpha', query: 'a' });

  const list = await search.listSavedSearches();
  assert.deepEqual(
    list.map((item) => item.name),
    ['Alpha', 'Zeta'],
  );
  const fetched = await search.getSavedSearch(list[0]!.id);
  assert.equal(fetched?.query, 'a');

  await closeTestContext(context);
});

test('saved search filters are sanitized (empty values dropped, tags de-duplicated)', async () => {
  const context = await createTestContext();
  const { search } = createTestServices(context);

  const saved = await search.createSavedSearch({
    name: 'Bersih',
    query: '  java   oop ',
    filters: { tags: ['java', 'java', ''], notebookId: null, captureType: null },
  });

  assert.equal(saved.query, 'java oop');
  assert.deepEqual(saved.filters, { tags: ['java'] });

  await closeTestContext(context);
});

test('saved searches persist across a database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'noto-search-'));
  const databasePath = join(directory, 'noto.db');

  const buildSearch = (
    connection: Awaited<ReturnType<typeof createNodeConnection>>,
    repos: Repositories,
  ) =>
    createSearchUseCases({
      connection,
      search: createSearchRepository(),
      savedSearches: repos.savedSearches,
      fts5Available: true,
    });

  try {
    let savedId = '';

    const firstConnection = createNodeConnection(databasePath);
    const firstDatabase = await openDatabase(firstConnection);
    const firstRepos = createRepositories(firstDatabase, {
      newId: () => `id-${Math.random().toString(16).slice(2)}`,
      now: () => '2026-07-01T00:00:00.000Z',
    });
    const firstSearch = buildSearch(firstConnection, firstRepos);
    const saved = await firstSearch.createSavedSearch({
      name: 'Programming',
      query: 'java',
      filters: { tags: ['programming'], captureType: 'text' },
      sort: 'created_desc',
    });
    savedId = saved.id;

    await firstConnection.closeAsync();

    const secondConnection = createNodeConnection(databasePath);
    const secondDatabase = await openDatabase(secondConnection);
    const secondRepos = createRepositories(secondDatabase, {
      newId: () => 'unused',
      now: () => '2026-07-02T00:00:00.000Z',
    });
    const secondSearch = buildSearch(secondConnection, secondRepos);

    const reloaded = await secondSearch.getSavedSearch(savedId);
    assert.equal(reloaded?.name, 'Programming');
    assert.equal(reloaded?.query, 'java');
    assert.equal(reloaded?.sort, 'created_desc');
    assert.deepEqual(reloaded?.filters, { tags: ['programming'], captureType: 'text' });

    await secondConnection.closeAsync();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
