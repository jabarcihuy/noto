/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ensureFrontmatterTagsInContent,
  extractAttachmentCandidates,
  parseImportFile,
  rewriteAttachmentReferences,
  splitFrontmatter,
} from '@/features/vault/domain/markdown-import';

test('frontmatter parsing handles the documented note format', () => {
  const text = [
    '---',
    'id: 9f1c-0001',
    'title: "Java Basics"',
    'tags: [java, college]',
    'notebook: Kuliah',
    'captureType: text',
    'sourceUrl: null',
    'createdAt: 2026-09-01T10:00:00.000Z',
    '---',
    '',
    'Isi catatan.',
  ].join('\n');

  const { attributes, body } = splitFrontmatter(text);
  assert.equal(attributes.id, '9f1c-0001');
  assert.equal(attributes.title, 'Java Basics');
  assert.deepEqual(attributes.tags, ['java', 'college']);
  assert.equal(attributes.notebook, 'Kuliah');
  assert.equal(attributes.sourceUrl, null);
  assert.equal(body, 'Isi catatan.');

  const parsed = parseImportFile({ filename: 'ignored.md', text });
  assert.equal(parsed.title, 'Java Basics');
  assert.equal(parsed.requestedId, '9f1c-0001');
  assert.deepEqual(parsed.frontmatterTags, ['java', 'college']);
});

test('titles fall back to the first heading and then the filename', () => {
  const heading = parseImportFile({ filename: 'file.md', text: '# Judul dari Heading\n\nisi' });
  assert.equal(heading.title, 'Judul dari Heading');

  const filename = parseImportFile({ filename: 'Catatan Rapat.md', text: 'isi tanpa judul' });
  assert.equal(filename.title, 'Catatan Rapat');
  assert.equal(filename.requestedId, null);

  const noFrontmatter = parseImportFile({ filename: 'plain.md', text: 'Hanya teks.' });
  assert.equal(noFrontmatter.title, 'plain');
  assert.deepEqual(noFrontmatter.frontmatterTags, []);
});

test('frontmatter tags are preserved by appending missing tokens only', () => {
  const already = ensureFrontmatterTagsInContent('Isi dengan #java', ['java', 'college']);
  assert.equal(already.content, 'Isi dengan #java\n\n#college');
  assert.deepEqual(already.added, ['college']);

  const untouched = ensureFrontmatterTagsInContent('Isi tanpa tag', []);
  assert.equal(untouched.content, 'Isi tanpa tag');
  assert.deepEqual(untouched.added, []);
});

test('attachment candidates cover Obsidian and Markdown references only', () => {
  const body = [
    '![[photo.jpg]]',
    '[[voice-2026.m4a]]',
    '[[Java OOP]]',
    '![alt](attachments/canonical.png)',
    '![rel](images/relative.webp)',
    '[doc](report.pdf)',
    '[web](https://example.com/x.png)',
    '[note](other.md)',
  ].join('\n');

  const candidates = extractAttachmentCandidates(body);
  const basenames = candidates.map((candidate) => candidate.basename);
  assert.deepEqual(basenames, ['photo.jpg', 'voice-2026.m4a', 'canonical.png', 'relative.webp']);
  assert.equal(candidates[0]?.image, true);
  assert.equal(candidates[1]?.image, false);
});

test('rewriting resolves unique attachments and preserves unresolved references', () => {
  const resolved = new Map([
    ['photo.jpg', 'attachments/photo.jpg'],
    ['voice-2026.m4a', 'attachments/voice-2026.m4a'],
  ]);

  const body = [
    '![[photo.jpg]]',
    '![[photo.jpg|Alt Foto]]',
    '[[voice-2026.m4a]]',
    '[[missing.png]]',
    '![canonical](attachments/canonical.png)',
    '![relative](images/relative.webp)',
    '[[Java OOP]]',
  ].join('\n');

  const rewritten = rewriteAttachmentReferences(body, (basename) => resolved.get(basename) ?? null);
  assert.ok(rewritten.includes('![photo.jpg](attachments/photo.jpg)'));
  assert.ok(rewritten.includes('![Alt Foto](attachments/photo.jpg)'));
  assert.ok(rewritten.includes('[voice-2026.m4a](attachments/voice-2026.m4a)'));
  assert.ok(rewritten.includes('[[missing.png]]'), 'unresolved refs stay verbatim');
  assert.ok(rewritten.includes('![canonical](attachments/canonical.png)'), 'canonical refs stay');
  assert.ok(rewritten.includes('[[Java OOP]]'), 'note wikilinks are untouched');

  const ambiguous = rewriteAttachmentReferences('![[dup.png]]', () => null);
  assert.equal(ambiguous, '![[dup.png]]');
});
