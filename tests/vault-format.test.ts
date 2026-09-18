/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Attachment } from '@/features/attachments/domain/attachment';
import type { NoteLink } from '@/features/links/domain/note-link';
import type { Note } from '@/features/notes/domain/note';
import {
  parseManifest,
  planVaultExport,
  serializeManifest,
  VAULT_FORMAT,
  VAULT_FORMAT_VERSION,
} from '@/features/vault/domain/vault-format';

function note(overrides: Partial<Note> & { id: string }): Note {
  return {
    title: '',
    titleKey: '',
    content: '',
    captureType: 'text',
    notebookId: null,
    sourceUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    openedAt: null,
    ...overrides,
  };
}

function attachment(
  overrides: Partial<Attachment> & { id: string; relativePath: string },
): Attachment {
  return {
    noteId: 'note-1',
    kind: 'image',
    originalName: null,
    mimeType: 'image/jpeg',
    byteSize: 3,
    width: null,
    height: null,
    durationMs: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('export filenames are human-readable, unique, and case-insensitive', () => {
  const plan = planVaultExport({
    notes: [
      note({ id: 'b', title: 'Java Basics', createdAt: '2026-01-02T00:00:00.000Z' }),
      note({ id: 'a', title: 'java basics', createdAt: '2026-01-01T00:00:00.000Z' }),
      note({ id: 'c', title: '' }),
    ],
    notebooks: [],
    tags: [],
    tagsByNote: new Map(),
    linksByNote: new Map(),
    attachments: [],
    templates: [],
    savedSearches: [],
    exportedAt: '2026-09-18T00:00:00.000Z',
  });

  assert.deepEqual(plan.errors, []);
  const files = plan.noteFiles.map((file) => file.relativePath);
  assert.deepEqual(files, [
    'notes/java basics.md',
    'notes/Untitled-c.md',
    'notes/Java Basics (2).md',
  ]);
  assert.equal(new Set(files.map((file) => file.toLowerCase())).size, 3);
});

test('manifest carries IDs, tags, notebook, links, and attachment metadata', () => {
  const link: NoteLink = {
    id: 'link-1',
    sourceNoteId: 'note-1',
    targetNoteId: 'note-2',
    resolution: 'resolved',
    targetText: 'java oop',
    displayText: 'OOP',
    anchor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const plan = planVaultExport({
    notes: [
      note({
        id: 'note-1',
        title: 'Java Basics',
        content: 'Lihat [[Java OOP|OOP]] dan ![foto](attachments/photo.jpg)',
        notebookId: 'nb-1',
      }),
    ],
    notebooks: [
      {
        id: 'nb-1',
        name: 'Kuliah',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    tags: [
      { id: 'tag-1', name: 'java', displayName: 'Java', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    tagsByNote: new Map([['note-1', ['java']]]),
    linksByNote: new Map([['note-1', [link]]]),
    attachments: [attachment({ id: 'att-1', relativePath: 'attachments/photo.jpg' })],
    templates: [],
    savedSearches: [],
    exportedAt: '2026-09-18T00:00:00.000Z',
  });

  assert.equal(plan.manifest.format, VAULT_FORMAT);
  assert.equal(plan.manifest.version, VAULT_FORMAT_VERSION);
  assert.equal(plan.manifest.notes[0]?.file, 'notes/Java Basics.md');
  assert.deepEqual(plan.manifest.notes[0]?.tags, ['java']);
  assert.equal(plan.manifest.notes[0]?.notebookId, 'nb-1');
  assert.equal(plan.manifest.notes[0]?.links[0]?.targetNoteId, 'note-2');
  assert.equal(plan.manifest.attachments[0]?.file, 'attachments/photo.jpg');
  assert.equal(plan.manifest.notebooks[0]?.name, 'Kuliah');
  assert.ok(plan.noteFiles[0]?.markdown.includes('notebook: Kuliah'));
  assert.ok(plan.noteFiles[0]?.markdown.includes('tags: [java]'));

  const reparsed = parseManifest(serializeManifest(plan.manifest));
  assert.deepEqual(reparsed, plan.manifest);
  assert.equal(parseManifest('{"format":"other"}'), null);
  assert.equal(parseManifest('not json'), null);
});

test('export validation blocks duplicate IDs and paths but reports missing references', () => {
  const duplicateIds = planVaultExport({
    notes: [note({ id: 'same', title: 'A' }), note({ id: 'same', title: 'B' })],
    notebooks: [],
    tags: [],
    tagsByNote: new Map(),
    linksByNote: new Map(),
    attachments: [],
    templates: [],
    savedSearches: [],
    exportedAt: '2026-09-18T00:00:00.000Z',
  });
  assert.ok(duplicateIds.errors.includes('duplicate-note-id:same'));

  const duplicatePaths = planVaultExport({
    notes: [],
    notebooks: [],
    tags: [],
    tagsByNote: new Map(),
    linksByNote: new Map(),
    attachments: [
      attachment({ id: 'a1', relativePath: 'attachments/photo.jpg' }),
      attachment({ id: 'a2', relativePath: 'attachments/PHOTO.JPG' }),
    ],
    templates: [],
    savedSearches: [],
    exportedAt: '2026-09-18T00:00:00.000Z',
  });
  assert.ok(duplicatePaths.errors.some((error) => error.startsWith('duplicate-attachment-path:')));

  const missing = planVaultExport({
    notes: [note({ id: 'n1', content: '![x](attachments/ghost.png)' })],
    notebooks: [],
    tags: [],
    tagsByNote: new Map(),
    linksByNote: new Map(),
    attachments: [],
    templates: [],
    savedSearches: [],
    exportedAt: '2026-09-18T00:00:00.000Z',
  });
  assert.deepEqual(missing.errors, []);
  assert.ok(missing.warnings.includes('missing-attachment-reference:n1:attachments/ghost.png'));
});
