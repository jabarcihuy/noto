import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Note } from '@/features/notes/domain/note';
import { ThemedText } from '@/ui/components/themed-text';
import { contentPreview, formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { getTheme, motion, radius, spacing } from '@/ui/theme';

type NoteRowProps = {
  note: Note;
  onPress: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A recent-note row. Full-width rows highlight their background on press (they must not
 * scale — that reads as the whole screen squishing).
 */
export function NoteRow({ note, onPress }: NoteRowProps) {
  const colors = getTheme(useColorScheme());
  const preview = contentPreview(note.content);
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: pressed.get() === 1 ? colors.surface : 'rgba(0,0,0,0)',
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={note.title.trim().length > 0 ? note.title : t('home.untitled')}
      onPressIn={() => pressed.set(withTiming(1, { duration: motion.press }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: motion.press }))}
      onPress={onPress}
      pressRetentionOffset={12}
      style={[styles.row, animatedStyle]}
    >
      <View style={styles.text}>
        <ThemedText variant="heading" color={colors.text} numberOfLines={1}>
          {note.title.trim().length > 0 ? note.title : t('home.untitled')}
        </ThemedText>
        <ThemedText variant="subhead" color={colors.textMuted} numberOfLines={1}>
          {preview.length > 0 ? preview : t('home.noContent')}
        </ThemedText>
        <ThemedText variant="caption" color={colors.textFaint}>
          {formatDateTime(note.updatedAt)}
        </ThemedText>
      </View>
      <View style={[styles.chevron, { borderColor: colors.borderStrong }]} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  text: { flex: 1, gap: 1 },
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    transform: [{ rotate: '45deg' }],
    opacity: 0.6,
  },
});
