import { Pressable, StyleSheet, Text, useColorScheme } from 'react-native';

import { parseSnippet, type SearchResultItem } from '@/features/search';
import { contentPreview, formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { getTheme, spacing } from '@/ui/theme/tokens';

type SearchResultRowProps = {
  item: SearchResultItem;
  onPress: () => void;
};

/** One search result: title, highlighted snippet (or preview), and updated time. */
export function SearchResultRow({ item, onPress }: SearchResultRowProps) {
  const colors = getTheme(useColorScheme());
  const note = item.note;
  const segments = item.snippet ? parseSnippet(item.snippet) : null;
  const preview = contentPreview(note.content);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
        {note.title.trim().length > 0 ? note.title : t('home.untitled')}
      </Text>
      {segments ? (
        <Text numberOfLines={2} style={[styles.preview, { color: colors.textMuted }]}>
          {segments.map((segment, index) => (
            <Text
              key={index}
              style={segment.match ? { color: colors.accent, fontWeight: '700' } : undefined}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      ) : (
        <Text numberOfLines={2} style={[styles.preview, { color: colors.textMuted }]}>
          {preview.length > 0 ? preview : t('home.noContent')}
        </Text>
      )}
      <Text style={[styles.timestamp, { color: colors.textMuted }]}>
        {formatDateTime(note.updatedAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  title: { fontSize: 16, fontWeight: '600' },
  preview: { fontSize: 14, lineHeight: 19 },
  timestamp: { fontSize: 12, marginTop: 2 },
});
