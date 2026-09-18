/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSnippet } from '@/features/search/domain/search-highlight';

import { closeTestContext, createTestContext } from './helpers/context';
import { createTestServices } from './helpers/services';

test('LIKE fallback is used when FTS5 is unavailable and matches substrings', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context, { fts5Available: false });

  const note = await notes.createNote({ title: 'Judul', content: 'Mengandung Java' });
  await notes.createNote({ title: 'Lain', content: 'tidak relevan' });

  assert.equal(search.isDegraded(), true);

  const page = await search.search({ query: 'ava' });
  assert.equal(page.engine, 'like');
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [note.id],
  );

  const snippet = page.items[0]?.snippet;
  assert.ok(snippet);
  const matched = parseSnippet(snippet!).filter((segment) => segment.match);
  assert.deepEqual(
    matched.map((segment) => segment.text.toLowerCase()),
    ['ava'],
  );

  await closeTestContext(context);
});

test('LIKE fallback applies filters, sorting, and pagination', async () => {
  const context = await createTestContext();
  const { notes, notebooks, search } = createTestServices(context, { fts5Available: false });

  const notebook = await notebooks.create('Kuliah');
  const tagged = await notes.createNote({ title: 'Alpha java', content: '#programming' });
  await notes.createNote({ title: 'Beta java', content: 'lain' });
  await notebooks.assignNote(tagged.id, notebook.id);

  const page = await search.search({
    query: 'java',
    filters: { tags: ['programming'], notebookId: notebook.id },
    sort: 'updated_desc',
  });
  assert.equal(page.engine, 'like');
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [tagged.id],
  );
  assert.equal(page.hasMore, false);

  const firstPage = await search.search({ query: '', limit: 1, offset: 0 });
  const secondPage = await search.search({ query: '', limit: 1, offset: 1 });
  assert.equal(firstPage.items.length, 1);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(firstPage.items[0]?.note.id, secondPage.items[0]?.note.id);

  await closeTestContext(context);
});

test('LIKE fallback title matching builds a title snippet', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context, { fts5Available: false });

  const note = await notes.createNote({ title: 'Rencana Java', content: 'isi tanpa kata kunci' });

  const page = await search.search({ query: 'rencana' });
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [note.id],
  );
  assert.equal(page.items[0]?.matchedIn, 'title');

  await closeTestContext(context);
});
