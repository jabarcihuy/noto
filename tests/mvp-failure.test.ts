/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { UrlMetadataPort } from '@/core/platform/url-metadata-port';
import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { createCaptureUseCases } from '@/features/capture/application/capture-use-cases';
import { parseImportFile } from '@/features/vault/domain/markdown-import';

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

function buildCapture(
  context: TestContext,
  fileSystem: FakeFileSystem,
  urlMetadata: UrlMetadataPort,
) {
  return createCaptureUseCases({
    notes: {
      createNote: (input) => context.repos.notes.create(context.connection, input),
      getNote: (id) => context.repos.notes.getById(context.connection, id),
      updateNote: (id, patch) => context.repos.notes.update(context.connection, id, patch),
      deleteNote: async (id) => {
        await context.repos.notes.remove(context.connection, id);
        return true;
      },
    },
    attachments: buildAttachments(context, fileSystem),
    urlMetadata,
    now: context.now,
  });
}

test('metadata timeout/unavailability leaves the URL note and content intact', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, {
    async fetchMetadata() {
      return { status: 'unavailable' };
    },
  });

  const result = await capture.saveUrl({ url: 'https://offline.example.com/page' });
  assert.equal(result.metadata, 'unavailable');

  // A later metadata failure must not touch the stored note.
  const stored = await context.repos.notes.getById(context.connection, result.note.id);
  assert.equal(stored?.content, 'https://offline.example.com/page');
  assert.equal(stored?.sourceUrl, 'https://offline.example.com/page');

  await closeTestContext(context);
});

test('malformed frontmatter imports as plain content without losing data', () => {
  const malformed = ['---', 'title: "tidak ditutup', '', 'Isi tetap ada.'].join('\n');
  const parsed = parseImportFile({ filename: 'rusak.md', text: malformed });

  // Unterminated frontmatter is treated as content, never dropped.
  assert.ok(parsed.body.includes('Isi tetap ada.'));
  assert.equal(parsed.title, 'rusak');

  const weirdValues = parseImportFile({
    filename: 'aneh.md',
    text: ['---', 'id:', 'tags: [java, ]', 'title: 123', '---', '', 'Isi.'].join('\n'),
  });
  assert.equal(weirdValues.requestedId, null);
  assert.deepEqual(weirdValues.frontmatterTags, ['java']);
  assert.equal(weirdValues.body, 'Isi.');
});

test('a missing attachment file does not break the note or block export', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);
  const attachments = buildAttachments(context, fileSystem);

  const note = await services.notes.createNote({ title: 'Catatan' });
  fileSystem.putSource('file://a.png', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://a.png', mimeType: 'image/png', fileName: 'a.png' },
  });
  fileSystem.files.delete(attachment.relativePath);

  const [view] = await attachments.listForNote(note.id);
  assert.equal(view?.available, false);
  assert.ok(await services.notes.getNote(note.id));

  fileSystem.setPickedDirectory('export://vault');
  const exported = await vault.exportVault();
  assert.deepEqual(exported.missingAttachments, [attachment.relativePath]);
  assert.equal(exported.noteCount, 1);

  await closeTestContext(context);
});

test('a failed attachment file deletion keeps the note and queues cleanup', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const services = createTestServices(context);
  const attachments = buildAttachments(context, fileSystem);

  const note = await services.notes.createNote({ title: 'Catatan' });
  fileSystem.putSource('file://a.png', 'DATA');
  const attachment = await attachments.addImage({
    noteId: note.id,
    source: { uri: 'file://a.png', mimeType: 'image/png', fileName: 'a.png' },
  });

  fileSystem.setDeleteFailure(true);
  await attachments.remove(attachment.id);

  assert.equal(await context.repos.attachments.getById(context.connection, attachment.id), null);
  assert.ok(fileSystem.files.has(attachment.relativePath));
  assert.deepEqual(await context.repos.pendingDeletions.list(context.connection), [
    attachment.relativePath,
  ]);
  assert.ok(await services.notes.getNote(note.id), 'the note survives a failed file delete');

  fileSystem.setDeleteFailure(false);
  const report = await attachments.reconcile();
  assert.equal(report.deletedPending, 1);

  await closeTestContext(context);
});

test('duplicate IDs and attachment paths in an export are blocked, not silently merged', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const vault = createTestVault(context, fileSystem);
  const services = createTestServices(context);

  // Two notes can share a title; that is not a conflict.
  await services.notes.createNote({ title: 'Sama' });
  await services.notes.createNote({ title: 'Sama' });

  fileSystem.setPickedDirectory('export://vault');
  const exported = await vault.exportVault();
  assert.equal(exported.noteCount, 2);

  const noteFiles = [...fileSystem.exported.keys()].filter((key) => key.endsWith('.md'));
  assert.equal(noteFiles.length, 2);
  assert.equal(new Set(noteFiles.map((key) => key.toLowerCase())).size, 2);

  await closeTestContext(context);
});

test('a shared image that cannot be stored leaves no empty note behind', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, {
    async fetchMetadata() {
      return { status: 'unavailable' };
    },
  });

  // The content URI cannot be read, so the attachment copy fails.
  const result = await capture.captureSharedPayload({
    shareType: 'image',
    value: '',
    mimeType: 'image/jpeg',
    contentUri: 'content://missing.jpg',
    originalName: 'missing.jpg',
  });

  assert.deepEqual(result, { kind: 'unsupported', reason: 'unreadable' });
  const notes = await context.repos.notes.list(context.connection, { limit: 10 });
  assert.equal(notes.length, 0, 'the rolled-back note must not remain');

  await closeTestContext(context);
});

test('ambiguous and missing link targets stay safe after a restart', async () => {
  const context = await createTestContext();
  const { notes, links } = createTestServices(context);

  await notes.createNote({ title: 'Java' });
  await notes.createNote({ title: 'Java' });
  const source = await notes.createNote({
    title: 'Sumber',
    content: '[[Java]] dan [[Tidak Ada]]',
  });

  const outgoing = await links.listBySource(source.id);
  const byText = new Map(outgoing.map((link) => [link.targetText, link]));
  assert.equal(byText.get('java')?.resolution, 'ambiguous');
  assert.equal(byText.get('java')?.targetNoteId, null);
  assert.equal(byText.get('tidak ada')?.resolution, 'unresolved');
  assert.equal(byText.get('tidak ada')?.targetNoteId, null);

  await closeTestContext(context);
});
