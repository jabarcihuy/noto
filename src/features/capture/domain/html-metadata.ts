/**
 * Pure URL / HTML metadata parsing (docs/FEATURES.md §1.4, PRD §9.4). Untrusted external
 * content: this parser only extracts a small set of fields with regexes, never evaluates
 * HTML, never executes scripts, and never returns raw markup to the UI.
 */

export type ParsedMetadata = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
};

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_TAG = /<meta\b[^>]*>/gi;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&');
}

function clean(value: string | null): string | null {
  if (value === null) return null;
  const text = decodeEntities(value.replace(/\s+/g, ' ').trim());
  return text.length > 0 ? text.slice(0, 500) : null;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(ATTR)) {
    const name = match[1]?.toLowerCase();
    const value = match[2];
    if (name && value !== undefined) result[name] = unquote(value);
  }
  return result;
}

/**
 * Extracts OpenGraph/Twitter/`<title>` metadata. Relative image URLs are resolved against
 * the page URL; unsupported or missing fields become null. Never throws.
 */
export function parseHtmlMetadata(html: string, pageUrl: string): ParsedMetadata {
  let title: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;
  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogImage: string | null = null;
  let twitterTitle: string | null = null;
  let twitterDescription: string | null = null;
  let twitterImage: string | null = null;

  const titleMatch = TITLE.exec(html);
  if (titleMatch?.[1]) title = clean(titleMatch[1]);

  for (const tag of html.matchAll(META_TAG)) {
    const attrs = attributes(tag[0]);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    const content = attrs.content ?? '';
    switch (key) {
      case 'og:title':
        ogTitle = clean(content);
        break;
      case 'og:description':
        ogDescription = clean(content);
        break;
      case 'og:image':
      case 'og:image:url':
        ogImage = clean(content);
        break;
      case 'twitter:title':
        twitterTitle = clean(content);
        break;
      case 'twitter:description':
        twitterDescription = clean(content);
        break;
      case 'twitter:image':
      case 'twitter:image:src':
        twitterImage = clean(content);
        break;
      case 'description':
        if (description === null) description = clean(content);
        break;
      default:
        break;
    }
  }

  const image = ogImage ?? twitterImage;
  if (image) {
    try {
      imageUrl = new URL(image, pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  return {
    title: ogTitle ?? twitterTitle ?? title,
    description: ogDescription ?? twitterDescription ?? description,
    imageUrl,
  };
}
