import { StyleSheet, type StyleProp, type TextStyle, useColorScheme } from 'react-native';

import { linkIdentityKey, segmentContent, type NoteLink, type Wikilink } from '@/features/links';
import { normalizeTitleKey } from '@/features/notes/domain/note';
import { getTheme } from '@/ui/theme/tokens';
import { ThemedText } from '@/ui/components/themed-text';

type NoteContentProps = {
  content: string;
  links: NoteLink[];
  onPressLink: (link: Wikilink, noteLink: NoteLink | null) => void;
  style?: StyleProp<TextStyle>;
};

function lookupKey(link: Wikilink): string {
  return linkIdentityKey(normalizeTitleKey(link.target), link.displayText, link.anchor);
}

/**
 * Renders note content with wikilinks made visually identifiable and tappable
 * (docs/FEATURES.md §2.2, §3). It never rewrites content: only link segments get styling,
 * and the stored text is exactly what the user typed.
 */
export function NoteContent({ content, links, onPressLink, style }: NoteContentProps) {
  const colors = getTheme(useColorScheme());
  const byIdentity = new Map(
    links.map((link) => [linkIdentityKey(link.targetText, link.displayText, link.anchor), link]),
  );

  return (
    <ThemedText selectable style={style}>
      {segmentContent(content).map((segment, index) => {
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
