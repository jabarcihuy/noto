/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseHtmlMetadata } from '@/features/capture/domain/html-metadata';
import {
  buildUrlContent,
  buildUrlEnrichment,
  defaultUrlTitle,
  domainOf,
  firstUrlInText,
  normalizeUrlInput,
} from '@/features/capture/domain/url';
import { routeSharePayload } from '@/features/capture/domain/share-routing';

test('URL input is validated and normalized; non-http values are rejected', () => {
  assert.equal(normalizeUrlInput('  https://example.com/a?b=1  '), 'https://example.com/a?b=1');
  assert.equal(normalizeUrlInput('http://example.com'), 'http://example.com/');
  assert.equal(normalizeUrlInput('example.com'), null);
  assert.equal(normalizeUrlInput('javascript:alert(1)'), null);
  assert.equal(normalizeUrlInput('ftp://example.com'), null);
  assert.equal(normalizeUrlInput('   '), null);
  assert.equal(domainOf('https://sub.example.com/x'), 'sub.example.com');
  assert.equal(domainOf('not a url'), null);
  assert.equal(defaultUrlTitle('https://example.com/x'), 'example.com');
  assert.equal(buildUrlContent('https://example.com/x'), 'https://example.com/x');
});

test('firstUrlInText extracts only safe http(s) URLs', () => {
  assert.equal(firstUrlInText('lihat https://example.com/a besok'), 'https://example.com/a');
  assert.equal(firstUrlInText('tidak ada tautan'), null);
  assert.equal(firstUrlInText('javascript:alert(1)'), null);
});

test('HTML metadata parsing prefers OpenGraph and resolves relative images', () => {
  const html = `<!doctype html><html><head>
    <title>Judul Halaman</title>
    <meta name="description" content="Deskripsi biasa">
    <meta property="og:title" content="Judul OG">
    <meta property="og:description" content="Deskripsi OG">
    <meta property="og:image" content="/images/preview.png">
  </head><body><script>alert(1)</script><h1>Halo</h1></body></html>`;

  const metadata = parseHtmlMetadata(html, 'https://example.com/artikel');
  assert.equal(metadata.title, 'Judul OG');
  assert.equal(metadata.description, 'Deskripsi OG');
  assert.equal(metadata.imageUrl, 'https://example.com/images/preview.png');
});

test('HTML metadata falls back to title/description and tolerates missing metadata', () => {
  const fallback = parseHtmlMetadata(
    '<html><head><title>Tunggal</title><meta name="description" content="D"></head></html>',
    'https://example.com',
  );
  assert.equal(fallback.title, 'Tunggal');
  assert.equal(fallback.description, 'D');
  assert.equal(fallback.imageUrl, null);

  const empty = parseHtmlMetadata(
    '<html><body>tanpa metadata</body></html>',
    'https://example.com',
  );
  assert.equal(empty.title, null);
  assert.equal(empty.description, null);
  assert.equal(empty.imageUrl, null);

  const escaped = parseHtmlMetadata(
    '<html><head><meta property="og:title" content="A &amp; B &#39;C&#39;"></head></html>',
    'https://example.com',
  );
  assert.equal(escaped.title, "A & B 'C'");
});

test('URL enrichment never overwrites a user-entered title', () => {
  const metadata = {
    title: 'Judul dari Halaman',
    description: 'Deskripsi',
    domain: 'example.com',
    previewImageUrl: null,
  };

  const userTitle = buildUrlEnrichment({
    metadata,
    currentTitle: 'Judul Pilihan Saya',
    currentContent: 'https://example.com',
    url: 'https://example.com',
  });
  assert.equal(userTitle.title, null, 'user title must be preserved');
  assert.ok(userTitle.contentBlock?.includes('Deskripsi'));

  const defaultTitle = buildUrlEnrichment({
    metadata,
    currentTitle: 'example.com',
    currentContent: 'https://example.com',
    url: 'https://example.com',
  });
  assert.equal(defaultTitle.title, 'Judul dari Halaman');

  const noMetadata = buildUrlEnrichment({
    metadata: { title: null, description: null, domain: null, previewImageUrl: null },
    currentTitle: 'example.com',
    currentContent: 'https://example.com',
    url: 'https://example.com',
  });
  assert.equal(noMetadata.title, null);
  assert.equal(noMetadata.contentBlock, null);
});

test('share routing maps text, URL, image, audio, and rejects unsupported payloads', () => {
  assert.deepEqual(routeSharePayload({ shareType: 'text', value: 'Catatan biasa' }), {
    kind: 'text',
    title: '',
    content: 'Catatan biasa',
  });
  assert.deepEqual(routeSharePayload({ shareType: 'text', value: 'Lihat https://example.com/a' }), {
    kind: 'url',
    title: 'example.com',
    url: 'https://example.com/a',
  });
  assert.deepEqual(routeSharePayload({ shareType: 'url', value: 'https://example.com/x' }), {
    kind: 'url',
    title: 'example.com',
    url: 'https://example.com/x',
  });

  const image = routeSharePayload({
    shareType: 'image',
    value: '',
    mimeType: 'image/jpeg',
    contentUri: 'file:///tmp/photo.jpg',
    originalName: 'photo.jpg',
  });
  assert.equal(image.kind, 'image');
  if (image.kind === 'image') assert.equal(image.uri, 'file:///tmp/photo.jpg');

  const audio = routeSharePayload({
    shareType: 'audio',
    value: '',
    mimeType: 'audio/mp4',
    contentUri: 'file:///tmp/voice.m4a',
  });
  assert.equal(audio.kind, 'audio');

  assert.deepEqual(routeSharePayload({ shareType: 'video', value: 'file:///v.mp4' }), {
    kind: 'unsupported',
    reason: 'unsupported-type',
  });
  assert.deepEqual(routeSharePayload({ shareType: 'text', value: '   ' }), {
    kind: 'unsupported',
    reason: 'empty',
  });
  assert.deepEqual(routeSharePayload({ shareType: 'url', value: 'bukan-url' }), {
    kind: 'unsupported',
    reason: 'unsupported-type',
  });
  assert.deepEqual(routeSharePayload({ shareType: 'image', value: '' }), {
    kind: 'unsupported',
    reason: 'unreadable',
  });
});
