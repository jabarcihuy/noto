/**
 * Markdown/Obsidian import parsing (docs/DATABASE.md §9.3, §7.4). Pure domain code: it
 * parses frontmatter, derives titles, finds attachment candidates, and rewrites references
 * to the canonical `attachments/<file>` form. It never writes anything.
 */

import { appendTagToken, isValidTagName, parseTags } from '@/features/tags/domain/tag-parser';
import { normalizeTagName } from '@/features/tags/domain/tag';

export type FrontmatterValue = string | number | boolean | string[] | null;

export type ParsedImportFile = {
  attributes: Record<string, FrontmatterValue>;
  body: string;
  title: string;
  requestedId: string | null;
  frontmatterTags: string[];
};

export type AttachmentCandidate = {
  basename: string;
  image: boolean;
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp']);
const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'aac', 'wav', 'ogg', 'opus']);

export function isSupportedAttachmentName(name: string): boolean {
  const extension = extensionOf(name);
  return extension !== null && (IMAGE_EXTENSIONS.has(extension) || AUDIO_EXTENSIONS.has(extension));
}

export function isImageAttachmentName(name: string): boolean {
  const extension = extensionOf(name);
  return extension !== null && IMAGE_EXTENSIONS.has(extension);
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : null;
}

function parseScalar(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value.length === 0 || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'string' ? parsed : value.slice(1, -1);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => {
        const scalar = parseScalar(item);
        return typeof scalar === 'string' ? scalar : String(scalar ?? '');
      });
  }
  return value;
}

function parseAttributes(source: string): Record<string, FrontmatterValue> {
  const attributes: Record<string, FrontmatterValue> = {};
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (key.length === 0) continue;
    attributes[key] = parseScalar(trimmed.slice(separator + 1));
  }
  return attributes;
}

export function splitFrontmatter(text: string): {
  attributes: Record<string, FrontmatterValue>;
  body: string;
} {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { attributes: {}, body: text };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { attributes: {}, body: text };
  const after = normalized.slice(end + 4);
  const body = after.startsWith('\n\n')
    ? after.slice(2)
    : after.startsWith('\n')
      ? after.slice(1)
      : after;
  return { attributes: parseAttributes(normalized.slice(4, end)), body };
}

function firstHeading(body: string): string | null {
  for (const line of body.split('\n')) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function filenameTitle(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]{1,10}$/, '');
  return base.replace(/[\\/]/g, ' ').trim();
}

/** Parses one Markdown file into the fields the importer needs (docs/DATABASE.md §9.3). */
export function parseImportFile(input: { filename: string; text: string }): ParsedImportFile {
  const { attributes, body } = splitFrontmatter(input.text);

  const titleAttribute = attributes.title;
  const heading = firstHeading(body);
  // A frontmatter title is authoritative, including an intentionally empty one; foreign
  // files without the key fall back to the first heading, then the filename.
  const derived =
    typeof titleAttribute === 'string'
      ? titleAttribute.trim()
      : heading && heading.trim().length > 0
        ? heading.trim()
        : filenameTitle(input.filename);

  const idAttribute = attributes.id;
  const requestedId =
    typeof idAttribute === 'string' && idAttribute.trim().length > 0 ? idAttribute.trim() : null;

  const tagsAttribute = attributes.tags;
  const frontmatterTags = Array.isArray(tagsAttribute)
    ? tagsAttribute.filter((tag) => typeof tag === 'string' && isValidTagName(tag))
    : typeof tagsAttribute === 'string' && isValidTagName(tagsAttribute)
      ? [tagsAttribute]
      : [];

  return { attributes, body, title: derived, requestedId, frontmatterTags };
}

const OBSIDIAN_REFERENCE = /(!?)\[\[([^\]|#\n]+)(?:[|#]([^\]\n]*))?\]\]/g;
const MARKDOWN_REFERENCE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Attachment candidates from canonical Markdown paths and Obsidian `[[name.ext]]` /
 * `![[name.ext]]` references. Note wikilinks (no attachment extension) are ignored.
 */
export function extractAttachmentCandidates(body: string): AttachmentCandidate[] {
  const candidates: AttachmentCandidate[] = [];

  for (const match of body.matchAll(OBSIDIAN_REFERENCE)) {
    const target = match[2]?.trim() ?? '';
    const basename = target.split('/').pop() ?? target;
    if (!isSupportedAttachmentName(basename)) continue;
    candidates.push({ basename, image: match[1] === '!' });
  }

  for (const match of body.matchAll(MARKDOWN_REFERENCE)) {
    const path = match[3]?.trim() ?? '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) continue; // http:, data:, …
    const basename = path.split('/').pop() ?? path;
    if (!isSupportedAttachmentName(basename)) continue;
    candidates.push({ basename, image: match[1] === '!' });
  }

  return candidates;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites attachment references to canonical `attachments/<file>` paths when the basename
 * resolves. Unresolvable references are left verbatim (docs/DATABASE.md §7.4).
 */
export function rewriteAttachmentReferences(
  body: string,
  resolve: (basename: string) => string | null,
): string {
  const withObsidian = body.replace(
    OBSIDIAN_REFERENCE,
    (raw: string, bang: string, target: string, alias: string | undefined) => {
      const basename = target.trim().split('/').pop() ?? target.trim();
      if (!isSupportedAttachmentName(basename)) return raw;
      const canonical = resolve(basename);
      if (!canonical) return raw;
      const label = (alias ?? '').trim() || basename;
      return bang === '!' ? `![${label}](${canonical})` : `[${label}](${canonical})`;
    },
  );

  return withObsidian.replace(
    MARKDOWN_REFERENCE,
    (raw: string, bang: string, label: string, path: string) => {
      const trimmed = path.trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return raw;
      if (/(^|\/)attachments\//.test(trimmed)) return raw; // already canonical
      const basename = trimmed.split('/').pop() ?? trimmed;
      if (!isSupportedAttachmentName(basename)) return raw;
      const canonical = resolve(basename);
      if (!canonical) return raw;
      return `${bang}[${label}](${canonical})`;
    },
  );
}

/**
 * Frontmatter tags must survive import even when the body has no `#tag` token, because the
 * app's tag model is content-derived (docs/DATABASE.md §4.3). Missing valid tags are
 * appended as tokens; existing content is otherwise untouched.
 */
export function ensureFrontmatterTagsInContent(
  body: string,
  frontmatterTags: string[],
): { content: string; added: string[] } {
  const existing = new Set(parseTags(body).map((tag) => tag.name));
  const added: string[] = [];
  let content = body;

  for (const raw of frontmatterTags) {
    const name = normalizeTagName(raw);
    if (existing.has(name) || added.includes(name)) continue;
    if (!isValidTagName(raw)) continue;
    content = appendTagToken(content, raw);
    added.push(name);
  }
  return { content, added };
}

export { escapeRegExp };
