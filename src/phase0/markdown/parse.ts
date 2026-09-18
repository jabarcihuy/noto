/**
 * Phase 0 feasibility spike for the Markdown pipeline (docs/ROADMAP.md Phase 0,
 * docs/DATABASE.md §4.3, §7.2, §9.1).
 *
 * Goal: prove that one string-based representation (YAML frontmatter + Markdown body)
 * can serve editor, import, export, Obsidian compatibility, and search without
 * incompatible representations. This is NOT the production Markdown engine.
 */

export type FrontmatterValue = string | number | boolean | null | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export type ParsedNote = {
  attributes: Frontmatter;
  body: string;
};

export type Wikilink = {
  target: string;
  displayText: string | null;
  anchor: string | null;
  raw: string;
};

export type AttachmentRef = {
  kind: 'image' | 'file';
  label: string;
  path: string;
  raw: string;
};

/** Removes fenced code blocks and inline code so tag scanning ignores them. */
export function stripCode(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let fenceChar: string | null = null;

  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceChar === null && fence) {
      fenceChar = fence[1]![0]!;
      out.push('');
      continue;
    }
    if (fenceChar !== null && fence && fence[1]![0] === fenceChar) {
      fenceChar = null;
      out.push('');
      continue;
    }
    if (fenceChar !== null) {
      out.push('');
      continue;
    }
    out.push(line.replace(/`[^`]*`/g, ' '));
  }
  return out.join('\n');
}

/**
 * MVP tag grammar (docs/DATABASE.md §4.3): `#` at start-of-line or after whitespace,
 * followed by `[Unicode letter|digit|_|-]+`. No namespaces.
 */
const TAG_RE = /(^|[\s])#([\p{L}\p{N}_-]+)/gu;

export function extractTags(body: string): string[] {
  const cleaned = stripCode(body);
  const tags: string[] = [];
  for (const match of cleaned.matchAll(TAG_RE)) {
    const raw = match[2];
    if (raw) tags.push(raw.normalize('NFKC').toLowerCase());
  }
  return Array.from(new Set(tags));
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function splitFirst(value: string, separator: string): [string, string | null] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, null];
  return [value.slice(0, index), value.slice(index + separator.length)];
}

export function extractWikilinks(body: string): Wikilink[] {
  const links: Wikilink[] = [];
  for (const match of body.matchAll(WIKILINK_RE)) {
    const inner = match[1]!;
    const [targetPart, displayPart] = splitFirst(inner, '|');
    const [target, anchor] = splitFirst(targetPart, '#');
    links.push({
      target: target.trim(),
      displayText: displayPart === null ? null : displayPart.trim(),
      anchor: anchor === null ? null : anchor.trim(),
      raw: match[0],
    });
  }
  return links;
}

const MD_LINK_RE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

export function extractAttachmentRefs(body: string): AttachmentRef[] {
  const refs: AttachmentRef[] = [];
  for (const match of body.matchAll(MD_LINK_RE)) {
    const path = match[3]!.trim();
    if (!/(^|\/)attachments\//.test(path)) continue;
    refs.push({
      kind: match[1] === '!' ? 'image' : 'file',
      label: match[2] ?? '',
      path,
      raw: match[0],
    });
  }
  return refs;
}

function parseScalar(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
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
      .map((item) => parseScalar(item) as string);
  }
  return value;
}

function parseYamlSubset(source: string): Frontmatter {
  const attributes: Frontmatter = {};
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    attributes[key] = parseScalar(trimmed.slice(separator + 1));
  }
  return attributes;
}

function formatValue(value: FrontmatterValue): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (/[:#\n"]/.test(value)) return JSON.stringify(value);
  return value;
}

export function parseFrontmatter(text: string): ParsedNote {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { attributes: {}, body: text };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { attributes: {}, body: text };
  const frontmatter = normalized.slice(4, end).trim();
  const body = normalized.slice(end + 4).replace(/^\n+/, '');
  return { attributes: parseYamlSubset(frontmatter), body };
}

export function stringifyFrontmatter(attributes: Frontmatter, body: string): string {
  const keys = Object.keys(attributes);
  if (keys.length === 0) return body;
  const lines = keys.map((key) => `${key}: ${formatValue(attributes[key]!)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}
