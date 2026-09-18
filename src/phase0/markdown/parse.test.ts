import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractAttachmentRefs,
  extractTags,
  extractWikilinks,
  parseFrontmatter,
  stringifyFrontmatter,
  type Frontmatter,
} from './parse.ts';

test('frontmatter + body round-trips losslessly', () => {
  const attributes: Frontmatter = {
    id: '9f1c-...',
    title: 'Java Basics',
    tags: ['java', 'college'],
    captureType: 'text',
    sourceUrl: null,
    createdAt: '2026-09-01T10:00:00.000Z',
  };
  const body = 'Belajar Java berkaitan dengan [[Java OOP]].';

  const text = stringifyFrontmatter(attributes, body);
  const parsed = parseFrontmatter(text);

  assert.equal(parsed.body, body);
  assert.deepEqual(parsed.attributes, attributes);
});

test('plain markdown without frontmatter is preserved', () => {
  const parsed = parseFrontmatter('# Judul\n\n{{YAML}}');
  assert.deepEqual(parsed.attributes, {});
  assert.equal(parsed.body, '# Judul\n\n{{YAML}}');
});

test('tag grammar: boundaries, code, URLs, headings, case', () => {
  const body = [
    'Belajar #Java dan #mobile-dev.',
    'Heading # tidak dihitung.',
    'URL https://example.com#fragment tidak dihitung.',
    'word#glued tidak dihitung.',
    'Inline `#kode` diabaikan.',
    '```',
    '#dalam-code-block',
    '```',
    'Lagi #java',
  ].join('\n');

  assert.deepEqual(extractTags(body).sort(), ['java', 'mobile-dev']);
});

test('wikilinks parse aliases and anchors', () => {
  const links = extractWikilinks('Lihat [[Java OOP|OOP]] dan [[Catatan#Bagian]].');
  assert.equal(links.length, 2);
  assert.deepEqual(links[0], {
    target: 'Java OOP',
    displayText: 'OOP',
    anchor: null,
    raw: '[[Java OOP|OOP]]',
  });
  assert.deepEqual(links[1], {
    target: 'Catatan',
    displayText: null,
    anchor: 'Bagian',
    raw: '[[Catatan#Bagian]]',
  });
});

test('attachment references map to the canonical vault path', () => {
  const body = '![foto](attachments/photo.jpg) dan [berkas](attachments/report.pdf)';
  const refs = extractAttachmentRefs(body);
  assert.equal(refs.length, 2);
  assert.equal(refs[0]!.kind, 'image');
  assert.equal(refs[0]!.path, 'attachments/photo.jpg');
  assert.equal(refs[1]!.kind, 'file');
  assert.equal(refs[1]!.path, 'attachments/report.pdf');
});
