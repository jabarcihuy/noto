import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { FileSystemPort } from '@/core/fs/filesystem-port';
import type { SharePort } from '@/core/platform/share-port';
import type { Note } from '@/features/notes/domain/note';
import { createExportNote } from '@/features/vault/application/export-note';
import { parseImportFile } from '@/features/vault/domain/markdown-import';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '9f1c2d3e-0000-4000-8000-000000000abc',
    title: 'Java Basics',
    titleKey: 'java basics',
    content: 'Belajar Java.\n\n![foto](attachments/photo.jpg)',
    captureType: 'text',
    notebookId: null,
    sourceUrl: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-10T09:30:00.000Z',
    openedAt: null,
    ...overrides,
  };
}

function createFakeFileSystem() {
  const files = new Map<string, string>();
  const port: FileSystemPort = {
    async createExportDirectory(name) {
      return `file:///cache/exports/${name}`;
    },
    async writeTextFile(directoryUri, filename, contents) {
      const uri = `${directoryUri}/${filename}`;
      files.set(uri, contents);
      return uri;
    },
    async removeDirectory(directoryUri) {
      for (const key of [...files.keys()]) {
        if (key.startsWith(directoryUri)) files.delete(key);
      }
    },
  };
  return { port, files };
}

function createFakeShare(available = true) {
  const shared: string[] = [];
  const port: SharePort = {
    async isAvailable() {
      return available;
    },
    async shareFile(uri) {
      shared.push(uri);
    },
  };
  return { port, shared };
}

test('exportNote writes the shared Markdown format and shares the file', async () => {
  const fileSystem = createFakeFileSystem();
  const share = createFakeShare(true);
  const exportNote = createExportNote({ fileSystem: fileSystem.port, share: share.port });

  const note = makeNote();
  const before = structuredClone(note);

  const result = await exportNote(note, { dialogTitle: 'Ekspor catatan' });

  assert.equal(result.filename, 'Java Basics.md');
  assert.equal(result.shared, true);
  assert.equal(result.attachmentReferenceCount, 1);
  assert.equal(share.shared[0], result.uri);

  const written = fileSystem.files.get(result.uri);
  assert.ok(written, 'the markdown file must be written');
  assert.match(written!, /^---\n/);
  assert.match(written!, /id: 9f1c2d3e-0000-4000-8000-000000000abc/);
  assert.match(written!, /Belajar Java\./);

  assert.deepEqual(note, before, 'export must not modify the source note');
});

test('exportNote includes actual tags and notebook in the frontmatter', async () => {
  const fileSystem = createFakeFileSystem();
  const share = createFakeShare(true);
  const exportNote = createExportNote({ fileSystem: fileSystem.port, share: share.port });

  const result = await exportNote(makeNote(), {
    tags: ['java', 'college'],
    notebook: 'Kuliah',
  });

  const written = fileSystem.files.get(result.uri);
  assert.ok(written);
  assert.match(written!, /tags: \[java, college\]/);
  assert.match(written!, /notebook: Kuliah/);
});

test('exportNote still writes the file when sharing is unavailable', async () => {
  const fileSystem = createFakeFileSystem();
  const share = createFakeShare(false);
  const exportNote = createExportNote({ fileSystem: fileSystem.port, share: share.port });

  const result = await exportNote(makeNote());

  assert.equal(result.shared, false);
  assert.equal(share.shared.length, 0);
  assert.ok(fileSystem.files.has(result.uri));
});

test('exportNote propagates write failures without touching the note', async () => {
  const share = createFakeShare(true);
  const failing: FileSystemPort = {
    async createExportDirectory() {
      return 'file:///cache/exports/note';
    },
    async writeTextFile() {
      throw new Error('disk full');
    },
    async removeDirectory() {
      return undefined;
    },
  };
  const exportNote = createExportNote({ fileSystem: failing, share: share.port });

  const note = makeNote();
  await assert.rejects(() => exportNote(note), /disk full/);
  assert.equal(note.title, 'Java Basics');
  assert.equal(share.shared.length, 0);
});

test('a single-note export is parseable by the vault import parser', async () => {
  const fileSystem = createFakeFileSystem();
  const share = createFakeShare(true);
  const exportNote = createExportNote({ fileSystem: fileSystem.port, share: share.port });

  const note = makeNote({ content: 'Isi tetap utuh.' });
  const result = await exportNote(note, { tags: ['java'], notebook: 'Kuliah' });
  const written = fileSystem.files.get(result.uri);
  assert.ok(written);

  const parsed = parseImportFile({ filename: result.filename, text: written! });
  assert.equal(parsed.requestedId, note.id);
  assert.equal(parsed.title, note.title);
  assert.equal(parsed.body, note.content);
  assert.deepEqual(parsed.frontmatterTags, ['java']);
  assert.equal(parsed.attributes.notebook, 'Kuliah');
  assert.equal(parsed.attributes.createdAt, note.createdAt);
  assert.equal(parsed.attributes.updatedAt, note.updatedAt);
});
