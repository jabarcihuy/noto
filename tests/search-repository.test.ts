/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTestContext, createTestContext } from './helpers/context';
import { createTestServices } from './helpers/services';

test('FTS5 search matches title and content and reports the engine', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const byTitle = await notes.createNote({ title: 'Java Basics', content: 'pengantar' });
  const byContent = await notes.createNote({
    title: 'Catatan OOP',
    content: 'Tentang Java dan inheritance',
  });
  await notes.createNote({ title: 'Kotlin', content: 'tidak relevan' });

  const titlePage = await search.search({ query: 'basics' });
  assert.equal(titlePage.engine, 'fts5');
  assert.deepEqual(
    titlePage.items.map((item) => item.note.id),
    [byTitle.id],
  );

  const contentPage = await search.search({ query: 'inheritance' });
  assert.deepEqual(
    contentPage.items.map((item) => item.note.id),
    [byContent.id],
  );
  assert.ok(contentPage.items[0]?.snippet?.includes('\u0001'));

  const none = await search.search({ query: 'tidak-ada-sama-sekali' });
  assert.deepEqual(none.items, []);

  await closeTestContext(context);
});

test('multiple tokens use AND semantics and ignore unknown tokens', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const both = await notes.createNote({ title: 'Java OOP', content: 'inheritance' });
  await notes.createNote({ title: 'Java Dasar', content: 'variabel' });

  const page = await search.search({ query: 'java oop' });
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [both.id],
  );

  await closeTestContext(context);
});

test('special characters are treated as literal text, not FTS syntax', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const note = await notes.createNote({ title: 'Promo', content: 'diskon 100% hari ini' });

  const page = await search.search({ query: '100%' });
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [note.id],
  );

  // A syntactically dangerous query must not throw.
  await assert.doesNotReject(() => search.search({ query: '" NEAR AND OR *' }));

  await closeTestContext(context);
});

test('FTS5 handles diacritics and CJK prefix tokens', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const diacritic = await notes.createNote({ title: 'Kafe', content: 'Belajar café di Jakarta' });
  const cjk = await notes.createNote({ title: 'Catatan', content: '日本語のノート' });

  const folded = await search.search({ query: 'cafe' });
  assert.deepEqual(
    folded.items.map((item) => item.note.id),
    [diacritic.id],
  );

  const cjkPage = await search.search({ query: '日本' });
  assert.deepEqual(
    cjkPage.items.map((item) => item.note.id),
    [cjk.id],
  );

  await closeTestContext(context);
});

test('tag filters use normalized tag identity and AND across multiple tags', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const javaOnly = await notes.createNote({ title: 'Java', content: '#java' });
  const both = await notes.createNote({ title: 'Java Kotlin', content: '#java #kotlin' });
  await notes.createNote({ title: 'Kotlin', content: '#kotlin' });

  const javaPage = await search.search({ query: '', filters: { tags: ['java'] } });
  assert.deepEqual(
    javaPage.items.map((item) => item.note.id).sort(),
    [javaOnly.id, both.id].sort(),
  );

  const andPage = await search.search({ query: '', filters: { tags: ['java', 'kotlin'] } });
  assert.deepEqual(
    andPage.items.map((item) => item.note.id),
    [both.id],
  );

  await closeTestContext(context);
});

test('notebook filtering uses the notebook ID and survives a rename', async () => {
  const context = await createTestContext();
  const { notes, notebooks, search } = createTestServices(context);

  const notebook = await notebooks.create('Kuliah');
  const inNotebook = await notes.createNote({ title: 'Algoritma' });
  await notes.createNote({ title: 'Lainnya' });
  await notebooks.assignNote(inNotebook.id, notebook.id);

  const before = await search.search({ query: '', filters: { notebookId: notebook.id } });
  assert.deepEqual(
    before.items.map((item) => item.note.id),
    [inNotebook.id],
  );

  await notebooks.rename(notebook.id, 'Kuliah Baru');
  const after = await search.search({ query: '', filters: { notebookId: notebook.id } });
  assert.deepEqual(
    after.items.map((item) => item.note.id),
    [inNotebook.id],
  );

  await closeTestContext(context);
});

test('capture type filter uses the existing capture_type model', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { search } = createTestServices(context);

  await repos.notes.create(context.connection, { title: 'Teks', captureType: 'text' });
  const url = await repos.notes.create(context.connection, {
    title: 'Tautan',
    captureType: 'url',
  });

  const page = await search.search({ query: '', filters: { captureType: 'url' } });
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [url.id],
  );
  assert.deepEqual(await search.listCaptureTypes(), ['text', 'url']);

  await closeTestContext(context);
});

test('date filter boundaries are inclusive on updated_at', async () => {
  const context = await createTestContext();
  const { repos } = context;
  const { search } = createTestServices(context);

  const january = await repos.notes.create(context.connection, {
    title: 'Januari',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const february = await repos.notes.create(context.connection, {
    title: 'Februari',
    createdAt: '2026-02-01T00:00:00.000Z',
  });

  const fromFeb = await search.search({
    query: '',
    filters: { dateFrom: '2026-02-01T00:00:00.000Z' },
  });
  assert.deepEqual(
    fromFeb.items.map((item) => item.note.id),
    [february.id],
  );

  const exactJanuary = await search.search({
    query: '',
    filters: { dateFrom: '2026-01-01T00:00:00.000Z', dateTo: '2026-01-01T00:00:00.000Z' },
  });
  assert.deepEqual(
    exactJanuary.items.map((item) => item.note.id),
    [january.id],
  );

  await closeTestContext(context);
});

test('combined filters AND together with the query', async () => {
  const context = await createTestContext();
  const { notes, notebooks, search } = createTestServices(context);

  const notebook = await notebooks.create('Kuliah');
  const match = await notes.createNote({ title: 'Java OOP', content: '#programming' });
  const wrongNotebook = await notes.createNote({ title: 'Java OOP lain', content: '#programming' });
  const noTag = await notes.createNote({ title: 'Java OOP tanpa tag', content: 'java' });
  await notebooks.assignNote(match.id, notebook.id);
  await notebooks.assignNote(noTag.id, notebook.id);

  const page = await search.search({
    query: 'java',
    filters: { tags: ['programming'], notebookId: notebook.id },
  });
  assert.deepEqual(
    page.items.map((item) => item.note.id),
    [match.id],
  );
  assert.equal(wrongNotebook.id === match.id, false);

  await closeTestContext(context);
});

test('sorting is deterministic with an id tie-breaker', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);
  const { repos } = context;

  const first = await notes.createNote({ title: 'Pertama' });
  const second = await notes.createNote({ title: 'Kedua' });
  const third = await notes.createNote({ title: 'Ketiga' });

  assert.deepEqual(
    (await search.search({ query: '', sort: 'updated_desc' })).items.map((i) => i.note.id),
    [third.id, second.id, first.id],
  );
  assert.deepEqual(
    (await search.search({ query: '', sort: 'created_asc' })).items.map((i) => i.note.id),
    [first.id, second.id, third.id],
  );
  assert.deepEqual(
    (await search.search({ query: '', sort: 'created_desc' })).items.map((i) => i.note.id),
    [third.id, second.id, first.id],
  );

  // opened_desc puts unopened notes last; opened notes are ordered by opened_at desc.
  await repos.notes.markOpened(context.connection, first.id);
  await repos.notes.markOpened(context.connection, third.id);
  assert.deepEqual(
    (await search.search({ query: '', sort: 'opened_desc' })).items.map((i) => i.note.id),
    [third.id, first.id, second.id],
  );

  // Equal primary sort values fall back to id ASC deterministically.
  const a = await repos.notes.create(context.connection, {
    title: 'Sama A',
    createdAt: '2026-03-01T00:00:00.000Z',
  });
  const b = await repos.notes.create(context.connection, {
    title: 'Sama B',
    createdAt: '2026-03-01T00:00:00.000Z',
  });
  const page = await search.search({ query: '', sort: 'created_asc' });
  const aIndex = page.items.findIndex((i) => i.note.id === a.id);
  const bIndex = page.items.findIndex((i) => i.note.id === b.id);
  assert.ok(aIndex !== -1 && bIndex !== -1);
  assert.ok(aIndex < bIndex, 'same created_at must order by id ascending');

  await closeTestContext(context);
});

test('pagination returns stable, non-duplicated pages', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  for (let index = 0; index < 5; index += 1) {
    await notes.createNote({ title: `Catatan ${index}` });
  }

  const seen: string[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await search.search({ query: '', limit: 2, offset });
    seen.push(...page.items.map((item) => item.note.id));
    hasMore = page.hasMore;
    offset += page.items.length;
    assert.ok(page.items.length <= 2);
  }

  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5, 'pages must not duplicate results');
  assert.equal(offset, 5, 'end of results is reached');

  await closeTestContext(context);
});

test('the FTS index stays consistent across create, update, and delete', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  const note = await notes.createNote({ title: 'Catatan', content: 'kata alpha' });
  assert.equal((await search.search({ query: 'alpha' })).items.length, 1);

  await notes.updateNote(note.id, { content: 'kata beta' });
  assert.equal((await search.search({ query: 'alpha' })).items.length, 0);
  assert.equal((await search.search({ query: 'beta' })).items.length, 1);

  await notes.deleteNote(note.id);
  assert.equal((await search.search({ query: 'beta' })).items.length, 0);

  await closeTestContext(context);
});

test('an empty query browses notes instead of returning the whole vault unordered', async () => {
  const context = await createTestContext();
  const { notes, search } = createTestServices(context);

  await notes.createNote({ title: 'Satu' });
  await notes.createNote({ title: 'Dua' });
  const third = await notes.createNote({ title: 'Tiga' });

  const page = await search.search({ query: '   ', limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0]?.note.id, third.id);
  assert.equal(page.hasMore, true);

  await closeTestContext(context);
});
