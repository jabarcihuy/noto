import { Pressable, StyleSheet, Text, useColorScheme } from 'react-native';

import type { Note } from '@/features/notes/domain/note';
import { contentPreview, formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { getTheme, spacing } from '@/ui/theme/tokens';

type NoteRowProps = {
  note: Note;
  onPress: () => void;
};

export function NoteRow({ note, onPress }: NoteRowProps) {
  const colors = getTheme(useColorScheme());
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
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
        {note.title.trim().length > 0 ? note.title : t('home.untitled')}
      </Text>
      <Text numberOfLines={1} style={[styles.preview, { color: colors.textMuted }]}>
        {preview.length > 0 ? preview : t('home.noContent')}
      </Text>
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
  preview: { fontSize: 14 },
  timestamp: { fontSize: 12, marginTop: 2 },
});
