/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { playbackIntent } from '@/core/platform/voice-player-state';
import {
  appendAttachmentReference,
  attachmentKindForMime,
  buildAudioReference,
  buildImageReference,
  buildRelativePath,
  buildStoredFilename,
  buildVoiceOriginalName,
  extensionForMime,
  mimeForFilename,
  removeAttachmentReferences,
  resolveUniqueStoredFilename,
  sanitizeAttachmentBaseName,
  splitExtension,
} from '@/features/attachments/domain/attachment-files';
import { classifyVaultFiles } from '@/features/attachments/domain/reconcile';
import { formatClock } from '@/ui/format/duration';

test('stored filenames are sanitized, keep the extension, and fall back to the ID', () => {
  assert.equal(
    buildStoredFilename({
      originalName: 'My Photo.JPG',
      mimeType: 'image/jpeg',
      attachmentId: 'abcdefgh-0000',
    }),
    'My Photo.jpg',
  );
  assert.equal(
    buildStoredFilename({ originalName: null, mimeType: 'audio/mp4', attachmentId: '12345678-x' }),
    'attachment-12345678.m4a',
  );
  assert.equal(
    buildStoredFilename({ originalName: '???.png', mimeType: null, attachmentId: 'zzzzzzzz-x' }),
    'attachment-zzzzzzzz.png',
  );
  assert.equal(sanitizeAttachmentBaseName('a/b:c*d?e'), 'a b c d e');
  assert.deepEqual(splitExtension('no-extension'), { base: 'no-extension', extension: null });
});

test('collision suffixes are deterministic and case-insensitive', () => {
  assert.equal(resolveUniqueStoredFilename('photo.jpg', new Set()), 'photo.jpg');
  assert.equal(resolveUniqueStoredFilename('photo.jpg', new Set(['Photo.JPG'])), 'photo-2.jpg');
  assert.equal(
    resolveUniqueStoredFilename('photo.jpg', new Set(['photo.jpg', 'photo-2.jpg'])),
    'photo-3.jpg',
  );
});

test('MIME helpers cover the expected image/audio formats', () => {
  assert.equal(mimeForFilename('a.PNG'), 'image/png');
  assert.equal(mimeForFilename('a.m4a'), 'audio/mp4');
  assert.equal(extensionForMime('image/jpeg'), 'jpg');
  assert.equal(extensionForMime('audio/mp4'), 'm4a');
  assert.equal(attachmentKindForMime('image/webp'), 'image');
  assert.equal(attachmentKindForMime('audio/mpeg'), 'audio');
  assert.equal(attachmentKindForMime('application/pdf'), 'file');
});

test('reference builders and append/remove preserve unrelated content', () => {
  const path = buildRelativePath('foto.jpg');
  assert.equal(path, 'attachments/foto.jpg');
  assert.equal(buildImageReference(path, 'foto'), '![foto](attachments/foto.jpg)');
  assert.equal(buildAudioReference(path, 'voice.m4a'), '[voice.m4a](attachments/foto.jpg)');

  assert.equal(appendAttachmentReference('', '![f](attachments/f.jpg)'), '![f](attachments/f.jpg)');
  assert.equal(appendAttachmentReference('teks', '![f](x)'), 'teks\n\n![f](x)');

  const content = '#java [[Java OOP]] code\n\n![a](attachments/a.png)\n\nmore';
  assert.equal(
    removeAttachmentReferences(content, 'attachments/a.png'),
    '#java [[Java OOP]] code\n\nmore',
  );
  assert.equal(removeAttachmentReferences('keep me', 'attachments/none.png'), 'keep me');
});

test('voice original names are deterministic and language-neutral', () => {
  const date = new Date(2026, 8, 18, 10, 15, 30);
  assert.equal(buildVoiceOriginalName(date), 'voice-20260918-101530.m4a');
});

test('vault classification separates matched, missing, orphan, and pending', () => {
  const result = classifyVaultFiles(
    ['attachments/a.png', 'attachments/missing.png'],
    ['a.png', 'orphan.png', 'pending.png'],
    ['attachments/pending.png'],
  );
  assert.deepEqual(result.matched, ['attachments/a.png']);
  assert.deepEqual(result.missing, ['attachments/missing.png']);
  assert.deepEqual(result.orphan, ['attachments/orphan.png']);
});

test('voice playback intent toggles a single shared player', () => {
  assert.deepEqual(playbackIntent(null, false, 'a'), { action: 'play', id: 'a' });
  assert.deepEqual(playbackIntent('a', true, 'a'), { action: 'pause' });
  assert.deepEqual(playbackIntent('a', false, 'a'), { action: 'play', id: 'a' });
  assert.deepEqual(playbackIntent('a', true, 'b'), { action: 'play', id: 'b' });
});

test('clock formatting is short and stable', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(5000), '0:05');
  assert.equal(formatClock(65000), '1:05');
});
