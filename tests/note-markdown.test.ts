import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Note } from '@/features/notes/domain/note';
import {
  buildExportFilename,
  countAttachmentReferences,
  parseAttachmentReferences,
  resolveUniqueFilename,
  sanitizeNoteFilename,
  serializeNoteMarkdown,
} from '@/features/vault/domain/note-markdown';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '9f1c2d3e-0000-4000-8000-000000000abc',
    title: 'Java Basics',
    titleKey: 'java basics',
    content: 'Belajar Java berkaitan dengan [[Java OOP]].',
    captureType: 'text',
    notebookId: null,
    sourceUrl: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-10T09:30:00.000Z',
    openedAt: null,
    ...overrides,
  };
}

test('serializeNoteMarkdown preserves id, title, content, and timestamps', () => {
  const markdown = serializeNoteMarkdown(makeNote());

  assert.match(markdown, /^---\n/);
  assert.match(markdown, /id: 9f1c2d3e-0000-4000-8000-000000000abc/);
  assert.match(markdown, /title: Java Basics/);
  assert.match(markdown, /captureType: text/);
  assert.match(markdown, /sourceUrl: null/);
  assert.match(markdown, /createdAt: 2026-09-01T10:00:00.000Z/);
  assert.match(markdown, /updatedAt: 2026-09-10T09:30:00.000Z/);
  assert.match(markdown, /Belajar Java berkaitan dengan \[\[Java OOP\]\]\./);
  assert.ok(markdown.endsWith('[[Java OOP]].'));
});

test('serializeNoteMarkdown emits empty tags and null notebook until those features exist', () => {
  const markdown = serializeNoteMarkdown(makeNote());
  assert.match(markdown, /tags: \[\]/);
  assert.match(markdown, /notebook: null/);
});

test('serializeNoteMarkdown writes actual tags and notebook name', () => {
  const markdown = serializeNoteMarkdown(makeNote(), {
    tags: ['java', 'college'],
    notebook: 'Kuliah',
  });
  assert.match(markdown, /tags: \[java, college\]/);
  assert.match(markdown, /notebook: Kuliah/);
});

test('title values with special characters are quoted', () => {
  const markdown = serializeNoteMarkdown(makeNote({ title: 'A: B # C' }));
  assert.match(markdown, /title: "A: B # C"/);
});

test('sanitizeNoteFilename removes illegal characters and trailing dots', () => {
  assert.equal(sanitizeNoteFilename('A/B:C*D?E"F<G>H|I'), 'A B C D E F G H I');
  assert.equal(sanitizeNoteFilename('  hello   world  '), 'hello world');
  assert.equal(sanitizeNoteFilename('trailing...'), 'trailing');
  assert.equal(sanitizeNoteFilename(''), 'Untitled');
});

test('buildExportFilename is human-readable and unique for empty titles', () => {
  assert.equal(buildExportFilename(makeNote()), 'Java Basics.md');
  const untitled = buildExportFilename(
    makeNote({ title: '', id: 'abcdefgh-1234-4000-8000-000000000000' }),
  );
  assert.equal(untitled, 'Untitled-abcdefgh.md');
});

test('resolveUniqueFilename appends a deterministic suffix, case-insensitively', () => {
  assert.equal(resolveUniqueFilename('Java.md', new Set()), 'Java.md');
  assert.equal(resolveUniqueFilename('Java.md', new Set(['java.md'])), 'Java (2).md');
  assert.equal(
    resolveUniqueFilename('Java.md', new Set(['java.md', 'Java (2).md'])),
    'Java (3).md',
  );
  assert.equal(resolveUniqueFilename('Note', new Set(['note'])), 'Note (2)');
});

test('countAttachmentReferences follows the documented attachment path convention', () => {
  assert.equal(countAttachmentReferences('plain text'), 0);
  assert.equal(countAttachmentReferences('![foto](attachments/photo.jpg)'), 1);
  assert.equal(
    countAttachmentReferences(
      '![a](attachments/a.jpg)\n[file](attachments/b.pdf)\n<img src="x.png">',
    ),
    2,
  );
  assert.equal(countAttachmentReferences('[external](https://example.com/a.png)'), 0);
});

test('attachment references are parsed with positions, labels, and kind', () => {
  const content =
    'Teks awal\n\n![foto](attachments/foto.jpg)\n\n[label](attachments/voice.m4a)\n\n[web](https://example.com)';
  const refs = parseAttachmentReferences(content);

  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.path, 'attachments/foto.jpg');
  assert.equal(refs[0]?.label, 'foto');
  assert.equal(refs[0]?.image, true);
  assert.equal(content.slice(refs[0]!.start, refs[0]!.end), '![foto](attachments/foto.jpg)');

  assert.equal(refs[1]?.path, 'attachments/voice.m4a');
  assert.equal(refs[1]?.image, false);

  // Ordinary web links are not attachment references.
  assert.equal(
    refs.some((ref) => ref.path.includes('example.com')),
    false,
  );
  assert.equal(countAttachmentReferences(content), 2);
});
