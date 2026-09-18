import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  appendTagToken,
  isValidTagName,
  parseTags,
  removeTagToken,
} from '@/features/tags/domain/tag-parser';

test('parses tags at boundaries only', () => {
  const content = [
    '#java di awal baris',
    'tag setelah spasi #college',
    'word#glued tidak dihitung',
    'URL https://example.com#fragment tidak dihitung',
    '# Heading tanpa tag',
    'koma,#setelah-tanda-baca tidak dihitung',
  ].join('\n');

  const parsed = parseTags(content);
  assert.deepEqual(
    parsed.map((tag) => tag.name),
    ['java', 'college'],
  );
});

test('normalizes capitalization and preserves display name', () => {
  const [tag] = parseTags('#Java');
  assert.equal(tag?.name, 'java');
  assert.equal(tag?.displayName, 'Java');
});

test('ignores inline code spans and fenced code blocks', () => {
  const content = ['inline `#kode` diabaikan', '```', '#didalamfence', '```', 'nyata #asli'].join(
    '\n',
  );
  assert.deepEqual(
    parseTags(content).map((tag) => tag.name),
    ['asli'],
  );
});

test('supports letters, digits, underscores and dashes, and Unicode letters', () => {
  assert.ok(isValidTagName('java'));
  assert.ok(isValidTagName('mobile_dev-2'));
  assert.ok(isValidTagName('café'));
  assert.ok(!isValidTagName('dua kata'));
  assert.ok(!isValidTagName('a/b'));
  assert.deepEqual(
    parseTags('#mobile_dev-2 #café').map((tag) => tag.name),
    ['mobile_dev-2', 'café'],
  );
});

test('reports positions that can drive removal', () => {
  const content = 'a #java b';
  const [tag] = parseTags(content);
  assert.ok(tag);
  assert.equal(content.slice(tag.start, tag.end), '#java');
});

test('appendTagToken keeps content as the source of truth', () => {
  assert.equal(appendTagToken('', 'Java'), '#Java');
  assert.equal(appendTagToken('Isi catatan', 'Java'), 'Isi catatan\n\n#Java');
  assert.equal(appendTagToken('Isi catatan\n\n', 'Java'), 'Isi catatan\n\n#Java');
});

test('removeTagToken removes every occurrence of the normalized tag', () => {
  const content = 'awal #Java tengah #java akhir';
  assert.equal(removeTagToken(content, 'java'), 'awal  tengah  akhir');
  assert.equal(removeTagToken(content, 'missing'), content);
});
