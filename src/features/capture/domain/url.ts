/**
 * URL capture rules (docs/FEATURES.md §1.4, PRD §9.4). Pure: no network, no React.
 *
 * Metadata is always secondary: a URL note is valid with only the URL stored.
 */

export type UrlMetadataDraft = {
  title: string | null;
  description: string | null;
  domain: string | null;
  previewImageUrl: string | null;
};

export type UrlEnrichmentPatch = {
  /** Title to apply; null means "leave the note title alone". */
  title: string | null;
  /** Content block to append; null means "nothing to add". */
  contentBlock: string | null;
  previewImageUrl: string | null;
};

const HTTP_URL = /^https?:\/\/\S+$/i;

/** Parses and normalizes user URL input; null when it is not an http(s) URL. */
export function normalizeUrlInput(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || !HTTP_URL.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>()"']+/i;

/** First http(s) URL embedded in arbitrary text, normalized; null when absent. */
export function firstUrlInText(value: string): string | null {
  const match = URL_IN_TEXT.exec(value);
  if (!match) return null;
  return normalizeUrlInput(match[0]);
}

/** Default title for a URL note: the domain, falling back to the raw URL. */
export function defaultUrlTitle(url: string): string {
  return domainOf(url) ?? url;
}

/**
 * The initial content for a URL note: the URL itself, so the note is useful even when
 * metadata never arrives. Plain text, never HTML.
 */
export function buildUrlContent(url: string): string {
  return url;
}

/**
 * Computes the metadata patch to apply after a successful fetch.
 *
 * **Implementation Decision (Phase 10):** a user-entered title is never overwritten by
 * metadata. Metadata fills the title only when the note still has the default
 * domain-derived title (or no title). The description is appended once as plain text; the
 * URL is never duplicated.
 */
export function buildUrlEnrichment(input: {
  metadata: UrlMetadataDraft;
  currentTitle: string;
  currentContent: string;
  url: string;
}): UrlEnrichmentPatch {
  const { metadata, currentTitle, currentContent, url } = input;
  const normalizedCurrent = currentTitle.trim();
  const defaultTitle = defaultUrlTitle(url);
  const titleIsDefault = normalizedCurrent.length === 0 || normalizedCurrent === defaultTitle;

  const title = titleIsDefault && metadata.title ? metadata.title : null;

  const parts: string[] = [];
  if (metadata.domain) parts.push(`Sumber: ${metadata.domain}`);
  if (metadata.description) parts.push(metadata.description);
  const block = parts.length > 0 ? parts.join('\n\n') : null;
  const contentBlock = block && !currentContent.includes(block) ? block : null;

  return {
    title,
    contentBlock,
    previewImageUrl: metadata.previewImageUrl,
  };
}
