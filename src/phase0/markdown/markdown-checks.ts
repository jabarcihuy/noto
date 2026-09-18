import { type CheckResult, fail, ok } from '../types';
import {
  extractAttachmentRefs,
  extractTags,
  extractWikilinks,
  parseFrontmatter,
  stringifyFrontmatter,
  type Frontmatter,
} from './parse';

/**
 * Runs the pure Markdown feasibility pipeline at runtime (docs/ROADMAP.md Phase 0).
 * Confirms one representation can serve editor, import, export, and search.
 */
export function runMarkdownChecks(): CheckResult[] {
  const results: CheckResult[] = [];

  const attributes: Frontmatter = {
    id: 'phase0-id',
    title: 'Java Basics',
    tags: ['java', 'college'],
    captureType: 'text',
  };
  const body = 'Belajar #Java dengan [[Java OOP|OOP]].\n\n![foto](attachments/photo.jpg)';
  const roundTrip = parseFrontmatter(stringifyFrontmatter(attributes, body));
  results.push(
    JSON.stringify(roundTrip.attributes) === JSON.stringify(attributes) && roundTrip.body === body
      ? ok('markdown.round_trip', 'Frontmatter + body round-trip identik')
      : fail('markdown.round_trip', 'Round-trip tidak identik'),
  );

  const tags = extractTags(body);
  results.push(
    tags.length === 1 && tags[0] === 'java'
      ? ok('markdown.tags', 'Ekstraksi tag sesuai grammar', tags.join(','))
      : fail('markdown.tags', `tags=[${tags.join(',')}]`),
  );

  const links = extractWikilinks(body);
  results.push(
    links.length === 1 && links[0]?.target === 'Java OOP' && links[0]?.displayText === 'OOP'
      ? ok('markdown.wikilinks', 'Wikilink + alias terbaca')
      : fail('markdown.wikilinks', JSON.stringify(links)),
  );

  const refs = extractAttachmentRefs(body);
  results.push(
    refs.length === 1 && refs[0]?.path === 'attachments/photo.jpg'
      ? ok('markdown.attachments', 'Referensi attachment terbaca')
      : fail('markdown.attachments', JSON.stringify(refs)),
  );

  return results;
}
