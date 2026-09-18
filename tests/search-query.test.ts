/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDatePreset } from '@/features/search/domain/date-range';
import {
  buildFtsMatchExpression,
  isFilterActive,
  normalizeSearchQuery,
  tokenizeSearchQuery,
} from '@/features/search/domain/search';
import { buildSnippet, parseSnippet } from '@/features/search/domain/search-highlight';

test('query normalization and tokenization are literal and whitespace-stable', () => {
  assert.equal(normalizeSearchQuery('  java   oop \n'), 'java oop');
  assert.deepEqual(tokenizeSearchQuery(' java  OOP '), ['java', 'OOP']);
  assert.deepEqual(tokenizeSearchQuery('   '), []);
});

test('FTS expression quotes every token and escapes embedded quotes', () => {
  assert.equal(buildFtsMatchExpression(['java', 'oop']), '"java"* AND "oop"*');
  assert.equal(buildFtsMatchExpression(['a"b']), '"a""b"*');
  assert.equal(buildFtsMatchExpression(['NEAR OR']), '"NEAR OR"*');
});

test('filter activity is detected from any populated filter', () => {
  assert.equal(isFilterActive({}), false);
  assert.equal(isFilterActive({ tags: [] }), false);
  assert.equal(isFilterActive({ tags: ['java'] }), true);
  assert.equal(isFilterActive({ notebookId: 'nb' }), true);
  assert.equal(isFilterActive({ captureType: 'text' }), true);
  assert.equal(isFilterActive({ dateFrom: '2026-01-01T00:00:00.000Z' }), true);
});

test('parseSnippet separates matched and plain segments', () => {
  const segments = parseSnippet('hello \u0001Java\u0002 world');
  assert.deepEqual(segments, [
    { text: 'hello ', match: false },
    { text: 'Java', match: true },
    { text: ' world', match: false },
  ]);
  assert.deepEqual(parseSnippet('plain'), [{ text: 'plain', match: false }]);
});

test('buildSnippet marks the matching token and returns null when nothing matches', () => {
  const snippet = buildSnippet('Belajar Java OOP hari ini', ['java']);
  assert.ok(snippet);
  const matched = parseSnippet(snippet!).filter((segment) => segment.match);
  assert.deepEqual(
    matched.map((segment) => segment.text),
    ['Java'],
  );
  assert.equal(buildSnippet('tidak ada', ['zzz']), null);
  assert.equal(buildSnippet('apa pun', []), null);
});

test('date presets resolve to inclusive local-day boundaries', () => {
  assert.equal(resolveDatePreset('all'), null);

  const now = new Date(2026, 8, 18, 10, 30, 0);
  const today = resolveDatePreset('today', now);
  assert.ok(today);
  assert.equal(today!.dateTo, now.toISOString());
  const start = new Date(today!.dateFrom);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getDate(), 18);

  const week = resolveDatePreset('week', now);
  assert.equal(new Date(week!.dateFrom).getDate(), 12);
  const month = resolveDatePreset('month', now);
  assert.equal(new Date(month!.dateFrom).getDate(), 20);
  assert.equal(new Date(month!.dateFrom).getMonth(), 7);
});
