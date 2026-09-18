/**
 * Snippet markers and helpers (docs/FEATURES.md §7.1). The FTS path marks matches in SQL;
 * the `LIKE` fallback builds a snippet in JS. UI code only parses segments.
 */

export const SNIPPET_OPEN = '\u0001';
export const SNIPPET_CLOSE = '\u0002';

export type SnippetSegment = { text: string; match: boolean };

/** Splits a marked snippet into plain and matched segments for rendering. */
export function parseSnippet(raw: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  let buffer = '';
  let match = false;

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ text: buffer, match });
      buffer = '';
    }
  };

  for (const character of raw) {
    if (character === SNIPPET_OPEN) {
      flush();
      match = true;
    } else if (character === SNIPPET_CLOSE) {
      flush();
      match = false;
    } else {
      buffer += character;
    }
  }
  flush();
  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a marked snippet around the first matching token in `content`. Used only by the
 * `LIKE` fallback, which has no SQL snippet function.
 */
export function buildSnippet(content: string, tokens: string[], maxLength = 160): string | null {
  const usable = tokens.filter((token) => token.length > 0);
  if (usable.length === 0) return null;

  const lower = content.toLowerCase();
  let index = -1;
  for (const token of usable) {
    const found = lower.indexOf(token.toLowerCase());
    if (found !== -1 && (index === -1 || found < index)) index = found;
  }
  if (index === -1) return null;

  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, start + maxLength);
  let slice = content.slice(start, end);
  if (start > 0) slice = `…${slice}`;
  if (end < content.length) slice = `${slice}…`;

  const ordered = [...usable].sort((a, b) => b.length - a.length);
  for (const token of ordered) {
    slice = slice.replace(
      new RegExp(escapeRegExp(token), 'gi'),
      (found) => `${SNIPPET_OPEN}${found}${SNIPPET_CLOSE}`,
    );
  }
  return slice;
}
