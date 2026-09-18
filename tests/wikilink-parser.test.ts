/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  findActiveLinkQuery,
  parseWikilinks,
  replaceActiveLinkQuery,
  segmentContent,
} from '@/features/links/domain/wikilink-parser';

test('parses a basic wikilink', () => {
  const [link] = parseWikilinks('Lihat [[Java OOP]] besok.');
  assert.ok(link);
  assert.equal(link.target, 'Java OOP');
  assert.equal(link.displayText, null);
  assert.equal(link.anchor, null);
  assert.equal(link.raw, '[[Java OOP]]');
  assert.equal(link.start, 6);
  assert.equal(link.end, 18);
});

test('parses alias, anchor, and combined forms', () => {
  const links = parseWikilinks('[[Java OOP|OOP]] dan [[Java OOP#Inheritance]] dan [[B#C|D]]');
  assert.equal(links.length, 3);

  assert.equal(links[0]?.target, 'Java OOP');
  assert.equal(links[0]?.displayText, 'OOP');
  assert.equal(links[0]?.anchor, null);

  assert.equal(links[1]?.target, 'Java OOP');
  assert.equal(links[1]?.displayText, null);
  assert.equal(links[1]?.anchor, 'Inheritance');

  assert.equal(links[2]?.target, 'B');
  assert.equal(links[2]?.displayText, 'D');
  assert.equal(links[2]?.anchor, 'C');
});

test('ignores malformed and empty wikilinks without throwing', () => {
  assert.deepEqual(parseWikilinks('[[unclosed'), []);
  assert.deepEqual(parseWikilinks('no brackets at all'), []);
  assert.deepEqual(parseWikilinks('[[]]'), []);
  assert.deepEqual(parseWikilinks('[[   ]]'), []);
  assert.deepEqual(parseWikilinks('[[|alias only]]'), []);
  const [link] = parseWikilinks('[[Target|]]');
  assert.equal(link?.target, 'Target');
  assert.equal(link?.displayText, null);
});

test('does not span lines and parses multiple links in order', () => {
  const links = parseWikilinks('[[One]] then [[Two|2]]');
  assert.deepEqual(
    links.map((link) => link.target),
    ['One', 'Two'],
  );
  assert.ok(links[0]!.start < links[1]!.start);
  assert.deepEqual(parseWikilinks('[[broken\nlink]]'), []);
});

test('segments content into text and links without rewriting text', () => {
  const segments = segmentContent('A [[Java]] B');
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], { type: 'text', text: 'A ' });
  assert.deepEqual(segments[2], { type: 'text', text: ' B' });
  const link = segments[1];
  assert.equal(link.type, 'link');
  if (link.type === 'link') {
    assert.equal(link.link.target, 'Java');
    assert.equal(link.link.raw, '[[Java]]');
    assert.equal(link.link.start, 2);
    assert.equal(link.link.end, 10);
  }
});

test('detects the active [[ query before the cursor', () => {
  assert.deepEqual(findActiveLinkQuery('[[Java', 6), { start: 0, query: 'Java' });
  assert.deepEqual(findActiveLinkQuery('text [[', 7), { start: 5, query: '' });
  assert.equal(findActiveLinkQuery('[[Java OOP]]', 12), null);
  assert.equal(findActiveLinkQuery('no link here', 5), null);
  assert.equal(findActiveLinkQuery('[[a|b', 5), null);
  assert.equal(findActiveLinkQuery('[[a#b', 5), null);
  assert.equal(findActiveLinkQuery('[[line\nmore', 10), null);
});

test('replaceActiveLinkQuery inserts a token and leaves other content intact', () => {
  const content = 'A [[jav B';
  const next = replaceActiveLinkQuery(content, 2, 7, 'Java');
  assert.equal(next, 'A [[Java]] B');
  assert.equal(replaceActiveLinkQuery('[[', 0, 2, ' Java OOP '), '[[Java OOP]]');
});
