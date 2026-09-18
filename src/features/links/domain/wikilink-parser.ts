/**
 * Single domain-level wikilink parser (docs/DATABASE.md §4.5, docs/FEATURES.md §3.1).
 *
 * Supported MVP syntax:
 *   [[Target]]
 *   [[Target|Display]]
 *   [[Target#Anchor]]
 *   [[Target#Anchor|Display]]
 *
 * Pure and UI-independent: the editor, the content renderer, and the note-link
 * reconciler all share this one parser. It does not rewrite or normalize content;
 * callers only read the parsed ranges.
 */

export type Wikilink = {
  /** Target as written (trimmed), before `#` and `|`. */
  target: string;
  /** Optional alias after `|`. */
  displayText: string | null;
  /** Optional anchor after `#`. */
  anchor: string | null;
  /** Exact source slice, including brackets. */
  raw: string;
  /** Start offset of `[[` in the source string. */
  start: number;
  /** End offset just past `]]` in the source string. */
  end: number;
};

export type ContentSegment = { type: 'text'; text: string } | { type: 'link'; link: Wikilink };

/** One line, no nested brackets, shortest possible inner text. */
const WIKILINK_RE = /\[\[([^[\]\n]+?)\]\]/g;

function splitFirst(value: string, separator: string): [string, string | null] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, null];
  return [value.slice(0, index), value.slice(index + separator.length)];
}

/**
 * Parses every well-formed wikilink in `content`, in source order.
 * Malformed or empty links (`[[ ]]`, `[[`, `]]`) are ignored, never treated as errors.
 */
export function parseWikilinks(content: string): Wikilink[] {
  const links: Wikilink[] = [];
  for (const match of content.matchAll(WIKILINK_RE)) {
    const inner = match[1]!;
    const [targetPart, displayPart] = splitFirst(inner, '|');
    const [targetRaw, anchorRaw] = splitFirst(targetPart, '#');

    const target = targetRaw.trim();
    if (target.length === 0) continue;

    const display = displayPart === null ? null : displayPart.trim();
    const anchor = anchorRaw === null ? null : anchorRaw.trim();
    const start = match.index ?? 0;

    links.push({
      target,
      displayText: display && display.length > 0 ? display : null,
      anchor: anchor && anchor.length > 0 ? anchor : null,
      raw: match[0],
      start,
      end: start + match[0].length,
    });
  }
  return links;
}

/** Splits content into literal text and parsed link segments for rendering. */
export function segmentContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let cursor = 0;

  for (const link of parseWikilinks(content)) {
    if (link.start > cursor)
      segments.push({ type: 'text', text: content.slice(cursor, link.start) });
    segments.push({ type: 'link', link });
    cursor = link.end;
  }
  if (cursor < content.length) segments.push({ type: 'text', text: content.slice(cursor) });
  return segments;
}

export type ActiveLinkQuery = {
  /** Offset of the opening `[[` that the cursor is currently inside. */
  start: number;
  /** Text typed after `[[` up to the cursor. */
  query: string;
};

/**
 * Detects an unterminated `[[query` immediately before `cursor`, used by the editor to
 * show suggestions. Returns `null` for normal text, completed links, aliases, and anchors.
 */
export function findActiveLinkQuery(content: string, cursor: number): ActiveLinkQuery | null {
  const safeCursor = Math.max(0, Math.min(cursor, content.length));
  const before = content.slice(0, safeCursor);
  const open = before.lastIndexOf('[[');
  if (open === -1) return null;

  const inner = before.slice(open + 2);
  if (inner.includes(']]') || inner.includes('[') || inner.includes('|') || inner.includes('#')) {
    return null;
  }
  if (inner.includes('\n')) return null;
  return { start: open, query: inner };
}

/**
 * Replaces the active `[[query` fragment with a wikilink token, leaving all other content
 * untouched. This is the editor's only mutation when a suggestion is chosen.
 */
export function replaceActiveLinkQuery(
  content: string,
  start: number,
  cursor: number,
  title: string,
): string {
  const token = `[[${title.trim()}]]`;
  return `${content.slice(0, start)}${token}${content.slice(cursor)}`;
}
