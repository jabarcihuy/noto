import { StyleSheet, type StyleProp, type TextStyle, useColorScheme } from 'react-native';

import { linkIdentityKey, segmentContent, type NoteLink, type Wikilink } from '@/features/links';
import { normalizeTitleKey } from '@/features/notes/domain/note';
import { parseAttachmentReferences } from '@/features/vault/domain/note-markdown';
import { ThemedText } from '@/ui/components/themed-text';
import { getTheme } from '@/ui/theme';

type NoteContentProps = {
  content: string;
  links: NoteLink[];
  /** Vault-relative paths that have a real attachment row; those refs are hidden inline. */
  attachmentPaths?: Set<string>;
  onPressLink: (link: Wikilink, noteLink: NoteLink | null) => void;
  style?: StyleProp<TextStyle>;
};

type Segment = { type: 'text'; text: string } | { type: 'link'; link: Wikilink };

function lookupKey(link: Wikilink): string {
  return linkIdentityKey(normalizeTitleKey(link.target), link.displayText, link.anchor);
}

/**
 * Builds render segments from note content: wikilinks stay inline and tappable, and
 * attachment references that resolve to a stored attachment are removed from the prose
 * because the Lampiran section already shows them. Unresolvable references stay visible
 * so the user can see and fix them (docs/DATABASE.md §7.2).
 */
function buildSegments(content: string, attachmentPaths: Set<string>): Segment[] {
  const hidden = parseAttachmentReferences(content).filter((reference) =>
    attachmentPaths.has(reference.path),
  );

  // Remove hidden reference spans from the text before wikilink segmentation, keeping the
  // surrounding newlines tidy so removed references do not leave blank gaps.
  let visible = content;
  for (const reference of [...hidden].reverse()) {
    const before = visible.slice(0, reference.start);
    const after = visible.slice(reference.end);
    const trimmedBefore = before.replace(/[ \t]+$/, '');
    const trimmedAfter = after.replace(/^\n{2,}/, '\n\n');
    visible = trimmedBefore + trimmedAfter;
  }

  return segmentContent(visible) as Segment[];
}

/**
 * Renders note content with wikilinks made visually identifiable and tappable
 * (docs/FEATURES.md §2.2, §3). It never rewrites stored content: only the rendered view is
 * adjusted, and only for attachment references that actually exist.
 */
export function NoteContent({
  content,
  links,
  attachmentPaths,
  onPressLink,
  style,
}: NoteContentProps) {
  const colors = getTheme(useColorScheme());
  const byIdentity = new Map(
    links.map((link) => [linkIdentityKey(link.targetText, link.displayText, link.anchor), link]),
  );
  const segments = buildSegments(content, attachmentPaths ?? new Set());

  return (
    <ThemedText selectable style={style}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') return segment.text;
        const noteLink = byIdentity.get(lookupKey(segment.link)) ?? null;
        const resolution = noteLink?.resolution ?? 'unresolved';
        const color =
          resolution === 'resolved'
            ? colors.accent
            : resolution === 'ambiguous'
              ? colors.warning
              : colors.textMuted;
        const label = segment.link.displayText
          ? segment.link.displayText
          : segment.link.anchor
            ? `${segment.link.target}#${segment.link.anchor}`
            : segment.link.target;

        return (
          <ThemedText
            key={index}
            accessibilityRole="link"
            onPress={() => onPressLink(segment.link, noteLink)}
            style={[
              styles.link,
              {
                color,
                textDecorationStyle: resolution === 'resolved' ? 'solid' : 'dashed',
              },
            ]}
          >
            {label}
          </ThemedText>
        );
      })}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
