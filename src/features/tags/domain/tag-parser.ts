/** Tag grammar and parsing (docs/DATABASE.md §4.3). Pure domain code. */

import { normalizeTagName } from './tag';

export type ParsedTag = {
  /** Normalized identity. */
  name: string;
  /** Original casing as written. */
  displayName: string;
  /** Start index of the leading `#`. */
  start: number;
  /** End index (exclusive) of the tag text. */
  end: number;
};

/** `#` at start of line or after whitespace, then allowed tag characters. */
const TAG_PATTERN = /(^|[\s])#([\p{L}\p{N}_-]+)/gu;

const VALID_TAG_NAME = /^[\p{L}\p{N}_-]+$/u;

export function isValidTagName(name: string): boolean {
  return VALID_TAG_NAME.test(name);
}

/** Replaces inline code spans with spaces while preserving string length/indices. */
function maskInlineCode(line: string): string {
  const chars = line.split('');
  let inCode = false;
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] === '`') {
      inCode = !inCode;
      chars[index] = ' ';
    } else if (inCode) {
      chars[index] = ' ';
    }
  }
  return chars.join('');
}

/**
 * Parses inline tags from note content, ignoring fenced code blocks, inline code spans,
 * URL fragments, and `word#word`. Namespaces/nested tags are not part of the grammar.
 */
export function parseTags(content: string): ParsedTag[] {
  const results: ParsedTag[] = [];
  let offset = 0;
  let fenceChar: string | null = null;

  for (const line of content.split('\n')) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);

    if (fenceChar === null && fence) {
      fenceChar = fence[1]![0]!;
    } else if (fenceChar !== null && fence && fence[1]![0] === fenceChar) {
      fenceChar = null;
    } else if (fenceChar === null) {
      const masked = maskInlineCode(line);
      for (const match of masked.matchAll(TAG_PATTERN)) {
        const preceding = match[1] ?? '';
        const leadingIndex = match.index + preceding.length;
        const start = offset + leadingIndex;
        const end = start + 1 + match[2]!.length;
        const displayName = content.slice(start + 1, end);
        results.push({
          name: normalizeTagName(displayName),
          displayName,
          start,
          end,
        });
      }
    }

    offset += line.length + 1;
  }

  return results;
}

/** Appends a `#tag` token, keeping the note content as the source of truth. */
export function appendTagToken(content: string, displayName: string): string {
  const token = `#${displayName}`;
  const trimmed = content.replace(/\s+$/, '');
  if (trimmed.length === 0) return token;
  return `${trimmed}\n\n${token}`;
}

/** Removes every occurrence of a normalized tag token from content. */
export function removeTagToken(content: string, normalizedName: string): string {
  const matches = parseTags(content).filter((tag) => tag.name === normalizedName);
  if (matches.length === 0) return content;

  let result = '';
  let cursor = 0;
  for (const match of matches) {
    result += content.slice(cursor, match.start);
    cursor = match.end;
  }
  result += content.slice(cursor);
  return result;
}
