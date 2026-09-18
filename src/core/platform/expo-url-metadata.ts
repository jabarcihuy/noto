import { parseHtmlMetadata, type ParsedMetadata } from '@/features/capture/domain/html-metadata';
import type { UrlMetadata, UrlMetadataPort, UrlMetadataResult } from './url-metadata-port';

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;

/**
 * `fetch` implementation of the URL metadata capability (PRD §9.4). Best-effort: it
 * enforces a timeout and a response size cap, reads only text/HTML, parses a small set of
 * fields, and never throws. No HTML is executed or injected anywhere.
 */
export function createFetchUrlMetadata(): UrlMetadataPort {
  return {
    async fetchMetadata(url: string): Promise<UrlMetadataResult> {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { status: 'invalid-url' };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { status: 'invalid-url' };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: { accept: 'text/html,application/xhtml+xml' },
        });
        if (!response.ok) return { status: 'unavailable' };

        const contentType = response.headers.get('content-type') ?? '';
        if (!/text\/html|application\/xhtml/i.test(contentType)) {
          return { status: 'unavailable' };
        }

        const text = await readCapped(response, MAX_BYTES);
        if (text === null) return { status: 'unavailable' };

        const finalUrl = response.url || url;
        const parsedMeta: ParsedMetadata = parseHtmlMetadata(text, finalUrl);
        let domain: string | null = null;
        try {
          domain = new URL(finalUrl).hostname;
        } catch {
          domain = null;
        }

        const metadata: UrlMetadata = {
          finalUrl,
          title: parsedMeta.title,
          description: parsedMeta.description,
          domain,
          imageUrl: parsedMeta.imageUrl,
        };
        return { status: 'ok', metadata };
      } catch {
        return { status: 'unavailable' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** Reads at most `maxBytes`; returns null when the body cannot be read. */
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  try {
    const buffer = await response.arrayBuffer();
    const bytes = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}
