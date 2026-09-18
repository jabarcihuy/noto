/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { parseManifest } from '@/features/vault/domain/vault-format';

import { closeTestContext, createTestContext, type TestContext } from './helpers/context';
import { createFakeFileSystem, type FakeFileSystem } from './helpers/fake-filesystem';
import { createTestServices } from './helpers/services';
import { createTestVault } from './helpers/vault-services';

function buildAttachments(context: TestContext, fileSystem: FakeFileSystem) {
  return createAttachmentUseCases({
    connection: context.connection,
    attachments: context.repos.attachments,
    pendingDeletions: context.repos.pendingDeletions,
    fileSystem: fileSystem.port,
    notes: {
      getById: context.repos.notes.getById,
      updateContent: (db, id, content) => context.repos.notes.update(db, id, { content }),
    },
    newId: context.newId,
    now: context.now,
  });
}

test('a Markdown file without frontmatter imports with a filename title', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);

  fileSystem.putSource('ext://file.md', 'Isi apa adanya tanpa frontmatter.');
  const result = await vault.importVault({
    kind: 'file',
    name: 'Catatan Baru.md',
    uri: 'ext://file.md',
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.importedNotes, 1);
  const [note] = await services.notes.listRecentNotes();
  assert.equal(note?.title, 'Catatan Baru');
  assert.equal(note?.content, 'Isi apa adanya tanpa frontmatter.');

  await closeTestContext(context);
});

test('an imported ID that collides with an existing note gets a new ID and is reported', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);

  const existing = await context.repos.notes.create(context.connection, {
    id: 'conflict-1',
    title: 'Lokal',
    content: 'Isi asli',
  });

  const text = [
    '---',
    'id: conflict-1',
    'title: Impor',
    'createdAt: 2026-05-01T00:00:00.000Z',
    'updatedAt: 2026-05-02T00:00:00.000Z',
    '---',
    '',
    'Isi impor.',
  ].join('\n');
  fileSystem.putSource('ext://import.md', text);

  const result = await vault.importVault({
    kind: 'file',
    name: 'import.md',
    uri: 'ext://import.md',
  });

  assert.ok(result.conflicts.includes('note-id:conflict-1'));
  const untouched = await context.repos.notes.getById(context.connection, existing.id);
  assert.deepEqual(untouched, existing);
  const all = await context.repos.notes.list(context.connection, { limit: 10 });
  const imported = all.find((note) => note.id !== existing.id);
  assert.equal(imported?.title, 'Impor');
  assert.equal(imported?.content, 'Isi impor.');

  await closeTestContext(context);
});

test('Obsidian folder import handles headings, wikilinks, tags, and attachments', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);

  const root = 'ext://obsidian';
  fileSystem.putSource(
    `${root}/Catatan.md`,
    ['# Judul Obsidian', '', 'Lihat [[Target]].', '', '#proyek', '', '![[gambar.png]]'].join('\n'),
  );
  fileSystem.putSource(`${root}/Target.md`, '# Target\n\nCatatan tujuan.');
  fileSystem.putSource(`${root}/gambar.png`, 'PNGDATA');
  fileSystem.putExternalDirectory(root, [
    { relativePath: 'Catatan.md', uri: `${root}/Catatan.md` },
    { relativePath: 'Target.md', uri: `${root}/Target.md` },
    { relativePath: 'gambar.png', uri: `${root}/gambar.png` },
  ]);

  const result = await vault.importVault({ kind: 'directory', uri: root });
  assert.equal(result.status, 'complete');
  assert.equal(result.importedNotes, 2);
  assert.equal(result.importedAttachments, 1);

  const notes = await services.notes.listRecentNotes({ limit: 10 });
  const source = notes.find((note) => note.title === 'Judul Obsidian');
  const target = notes.find((note) => note.title === 'Target');
  assert.ok(source);
  assert.ok(target);

  assert.ok(source!.content.includes('![gambar.png](attachments/gambar.png)'));
  assert.deepEqual(
    (await services.tags.listForNote(source!.id)).map((tag) => tag.name),
    ['proyek'],
  );
  const [link] = await services.links.listBySource(source!.id);
  assert.equal(link?.resolution, 'resolved');
  assert.equal(link?.targetNoteId, target!.id);

  const attachments = await context.repos.attachments.listForNote(context.connection, source!.id);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.kind, 'image');
  assert.ok(fileSystem.files.has('attachments/gambar.png'));

  await closeTestContext(context);
});

test('ambiguous and missing attachment references are reported and preserved', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);

  const root = 'ext://folder';
  fileSystem.putSource(
    `${root}/Catatan.md`,
    ['# Catatan', '', '![[gambar.png]]', '', '![[hilang.png]]'].join('\n'),
  );
  fileSystem.putSource(`${root}/a/gambar.png`, 'A');
  fileSystem.putSource(`${root}/b/gambar.png`, 'B');
  fileSystem.putExternalDirectory(root, [
    { relativePath: 'Catatan.md', uri: `${root}/Catatan.md` },
    { relativePath: 'a/gambar.png', uri: `${root}/a/gambar.png` },
    { relativePath: 'b/gambar.png', uri: `${root}/b/gambar.png` },
  ]);

  const result = await vault.importVault({ kind: 'directory', uri: root });
  assert.ok(result.warnings.includes('ambiguous-attachment:gambar.png'));
  assert.ok(result.warnings.includes('missing-attachment:hilang.png'));
  assert.equal(result.importedAttachments, 0);

  const [note] = await createTestServices(context).notes.listRecentNotes();
  assert.ok(note?.content.includes('![[gambar.png]]'), 'ambiguous ref stays verbatim');
  assert.ok(note?.content.includes('![[hilang.png]]'), 'missing ref stays verbatim');

  await closeTestContext(context);
});

test('unreferenced attachment files are reported, never silently discarded', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);

  const root = 'ext://folder';
  fileSystem.putSource(`${root}/Catatan.md`, '# Catatan\n\nTanpa lampiran.');
  fileSystem.putSource(`${root}/yatim.png`, 'ORPHAN');
  fileSystem.putExternalDirectory(root, [
    { relativePath: 'Catatan.md', uri: `${root}/Catatan.md` },
    { relativePath: 'yatim.png', uri: `${root}/yatim.png` },
  ]);

  const result = await vault.importVault({ kind: 'directory', uri: root });

  assert.ok(result.warnings.includes('unreferenced-attachment:yatim.png'));
  assert.equal(result.importedAttachments, 0);
  assert.equal(
    [...fileSystem.files.keys()].filter((path) => path.startsWith('attachments/')).length,
    0,
    'unowned files are not copied into the vault without a referencing note',
  );

  await closeTestContext(context);
});

test('export falls back to app storage and is read-only with respect to the vault', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);

  const note = await services.notes.createNote({
    title: 'Tetap',
    content: 'Isi tidak boleh berubah.',
  });
  const before = await context.repos.notes.getById(context.connection, note.id);

  fileSystem.setPickedDirectory(null);
  const result = await vault.exportVault();

  assert.equal(result.usedFallback, true);
  assert.ok(result.destinationUri.startsWith('fake://cache/vault-export/'));
  assert.ok(fileSystem.exportedHas(result.destinationUri, 'manifest.json'));
  assert.equal(await fileSystem.port.fileExistsAt(result.destinationUri, 'manifest.json'), true);

  const after = await context.repos.notes.getById(context.connection, note.id);
  assert.deepEqual(after, before);

  await closeTestContext(context);
});

test('a missing attachment file is reported but does not abort the export', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);
  const attachments = buildAttachments(context, fileSystem);

  const note = await services.notes.createNote({ title: 'Dengan Lampiran' });
  fileSystem.putSource('file://photo.jpg', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://photo.jpg', mimeType: 'image/png', fileName: 'photo.png' },
  });
  fileSystem.files.delete(attachment.relativePath);

  fileSystem.setPickedDirectory('export://vault');
  const result = await vault.exportVault();

  assert.deepEqual(result.missingAttachments, [attachment.relativePath]);
  assert.equal(result.attachmentCount, 0);
  assert.equal(result.noteCount, 1);
  assert.ok(fileSystem.exportedHas('export://vault', 'manifest.json'));
  const manifest = parseManifest(fileSystem.exported.get('export://vault/manifest.json')!);
  assert.equal(manifest?.attachments.length, 1, 'metadata is recorded even when the file is gone');

  await closeTestContext(context);
});

test('a modified built-in template is preserved and never overwritten by import', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);

  // Export a vault that contains the stock built-ins, then modify one locally.
  const note = await services.notes.createNote({ title: 'Catatan', content: 'Isi.' });
  fileSystem.setPickedDirectory('export://vault');
  await vault.exportVault();

  const builtInId = '00000000-0000-4000-8000-000000000003';
  await context.repos.templates.update(context.connection, builtInId, {
    content: 'Versi pengguna yang dimodifikasi',
  });

  // Re-import the exported manifest into the same database.
  const importRoot = 'ext://vault';
  const files: { relativePath: string; uri: string }[] = [];
  for (const [key, contents] of fileSystem.exported) {
    const relativePath = key.slice('export://vault/'.length);
    const uri = `${importRoot}/${relativePath}`;
    fileSystem.putSource(uri, contents);
    files.push({ relativePath, uri });
  }
  fileSystem.putExternalDirectory(importRoot, files);

  const result = await vault.importVault({ kind: 'directory', uri: importRoot });

  const after = await context.repos.templates.getById(context.connection, builtInId);
  assert.equal(after?.content, 'Versi pengguna yang dimodifikasi');
  assert.equal(result.importedTemplates, 0);
  assert.equal(
    (await services.notes.getNote(note.id))?.content,
    'Isi.',
    'template import never touches notes',
  );

  await closeTestContext(context);
});
