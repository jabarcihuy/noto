/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { UrlMetadataPort } from '@/core/platform/url-metadata-port';
import { createAttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import { createCaptureUseCases } from '@/features/capture/application/capture-use-cases';

import { closeTestContext, createTestContext, type TestContext } from './helpers/context';
import { createFakeFileSystem, type FakeFileSystem } from './helpers/fake-filesystem';

function buildCapture(
  context: TestContext,
  fileSystem: FakeFileSystem,
  urlMetadata: UrlMetadataPort,
) {
  const attachments = createAttachmentUseCases({
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

  return createCaptureUseCases({
    notes: {
      createNote: async (input) => {
        const note = await context.repos.notes.create(context.connection, input);
        return note;
      },
      getNote: (id) => context.repos.notes.getById(context.connection, id),
      updateNote: (id, patch) => context.repos.notes.update(context.connection, id, patch),
      deleteNote: async (id) => {
        await context.repos.notes.remove(context.connection, id);
        return true;
      },
    },
    attachments,
    urlMetadata,
    now: context.now,
  });
}

const unavailable: UrlMetadataPort = {
  async fetchMetadata() {
    return { status: 'unavailable' };
  },
};

test('URL capture saves the note first and applies metadata afterwards', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  let fetchedUrl: string | null = null;
  const metadata: UrlMetadataPort = {
    async fetchMetadata(url) {
      fetchedUrl = url;
      return {
        status: 'ok',
        metadata: {
          finalUrl: url,
          title: 'Judul Halaman',
          description: 'Deskripsi halaman',
          domain: 'example.com',
          imageUrl: null,
        },
      };
    },
  };
  const capture = buildCapture(context, fileSystem, metadata);

  const result = await capture.saveUrl({ url: 'https://example.com/artikel' });

  assert.equal(fetchedUrl, 'https://example.com/artikel');
  assert.equal(result.metadata, 'applied');
  assert.equal(result.note.captureType, 'url');
  assert.equal(result.note.sourceUrl, 'https://example.com/artikel');
  assert.equal(result.note.title, 'Judul Halaman');
  assert.ok(result.note.content.startsWith('https://example.com/artikel'));
  assert.ok(result.note.content.includes('Deskripsi halaman'));
  assert.ok(result.note.content.includes('Sumber: example.com'));

  await closeTestContext(context);
});

test('a user-entered title survives metadata enrichment', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const metadata: UrlMetadataPort = {
    async fetchMetadata(url) {
      return {
        status: 'ok',
        metadata: {
          finalUrl: url,
          title: 'Judul Metadata',
          description: 'Deskripsi',
          domain: 'example.com',
          imageUrl: null,
        },
      };
    },
  };
  const capture = buildCapture(context, fileSystem, metadata);

  const result = await capture.saveUrl({ url: 'https://example.com', title: 'Judul Saya' });

  assert.equal(result.note.title, 'Judul Saya');
  assert.equal(result.metadata, 'applied');

  await closeTestContext(context);
});

test('metadata failure keeps the URL note valid and reports unavailable', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, unavailable);

  const result = await capture.saveUrl({ url: 'https://example.com/x' });

  assert.equal(result.metadata, 'unavailable');
  assert.equal(result.note.captureType, 'url');
  assert.equal(result.note.content, 'https://example.com/x');
  assert.equal(result.note.title, 'example.com');
  assert.ok(await context.repos.notes.getById(context.connection, result.note.id));

  await closeTestContext(context);
});

test('malformed URL input is saved as plain text and flagged', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, unavailable);

  const result = await capture.saveUrl({ url: 'bukan url sama sekali' });

  assert.equal(result.metadata, 'not-a-url');
  assert.equal(result.note.captureType, 'text');
  assert.equal(result.note.sourceUrl, null);
  assert.equal(result.note.content, 'bukan url sama sekali');

  await closeTestContext(context);
});

test('a preview image is downloaded into the vault and referenced', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const metadata: UrlMetadataPort = {
    async fetchMetadata(url) {
      return {
        status: 'ok',
        metadata: {
          finalUrl: url,
          title: null,
          description: null,
          domain: 'example.com',
          imageUrl: 'https://example.com/preview.png',
        },
      };
    },
  };
  const capture = buildCapture(context, fileSystem, metadata);
  fileSystem.putDownload('https://example.com/preview.png', 'PNGDATA', 'image/png');

  const result = await capture.saveUrl({ url: 'https://example.com/a' });

  assert.equal(result.metadata, 'applied');
  const attachmentPath = [...fileSystem.files.keys()].find((path) =>
    path.startsWith('attachments/'),
  );
  assert.ok(attachmentPath, 'preview file is stored in the vault');
  assert.ok(result.note.content.includes(`(${attachmentPath})`));

  await closeTestContext(context);
});

test('a failed preview download does not fail the URL note', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const metadata: UrlMetadataPort = {
    async fetchMetadata(url) {
      return {
        status: 'ok',
        metadata: {
          finalUrl: url,
          title: 'Judul',
          description: null,
          domain: 'example.com',
          imageUrl: 'https://example.com/broken.png',
        },
      };
    },
  };
  const capture = buildCapture(context, fileSystem, metadata);

  const result = await capture.saveUrl({ url: 'https://example.com/a' });

  assert.equal(result.metadata, 'applied');
  assert.equal(result.note.title, 'Judul');
  assert.equal([...fileSystem.files.keys()].filter((p) => p.startsWith('attachments/')).length, 0);

  await closeTestContext(context);
});

test('shared text creates a normal text note and shared URLs reuse URL capture', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, unavailable);

  const text = await capture.captureSharedPayload({ shareType: 'text', value: 'Pesan biasa' });
  assert.equal(text.kind, 'note');
  if (text.kind === 'note') {
    assert.equal(text.note.captureType, 'text');
    assert.equal(text.note.content, 'Pesan biasa');
  }

  const url = await capture.captureSharedPayload({
    shareType: 'text',
    value: 'Lihat https://example.com/a',
  });
  assert.equal(url.kind, 'note');
  if (url.kind === 'note') {
    assert.equal(url.note.captureType, 'url');
    assert.equal(url.note.sourceUrl, 'https://example.com/a');
  }

  await closeTestContext(context);
});

test('a shared image creates a note with an attachment through the existing pipeline', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, unavailable);
  fileSystem.putSource('content://photo.jpg', 'IMAGEDATA');

  const result = await capture.captureSharedPayload({
    shareType: 'image',
    value: '',
    mimeType: 'image/jpeg',
    contentUri: 'content://photo.jpg',
    originalName: 'photo.jpg',
  });

  assert.equal(result.kind, 'note');
  if (result.kind === 'note') {
    assert.equal(result.note.captureType, 'image');
    const attachments = await context.repos.attachments.listForNote(
      context.connection,
      result.note.id,
    );
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.kind, 'image');
    assert.ok(fileSystem.files.has(attachments[0]!.relativePath));
  }

  await closeTestContext(context);
});

test('unsupported share payloads are rejected without creating a note', async () => {
  const context = await createTestContext();
  const fileSystem = createFakeFileSystem();
  const capture = buildCapture(context, fileSystem, unavailable);

  const video = await capture.captureSharedPayload({ shareType: 'video', value: 'file:///v.mp4' });
  assert.deepEqual(video, { kind: 'unsupported', reason: 'unsupported-type' });

  const empty = await capture.captureSharedPayload({ shareType: 'text', value: '   ' });
  assert.deepEqual(empty, { kind: 'unsupported', reason: 'empty' });

  const file = await capture.captureSharedPayload({
    shareType: 'file',
    value: '',
    mimeType: 'application/pdf',
    contentUri: 'content://doc.pdf',
  });
  assert.deepEqual(file, { kind: 'unsupported', reason: 'unsupported-type' });

  const notes = await context.repos.notes.list(context.connection, { limit: 10 });
  assert.equal(notes.length, 0, 'no empty notes are created for unsupported payloads');

  await closeTestContext(context);
});
