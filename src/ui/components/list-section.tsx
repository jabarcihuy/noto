import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/ui/components/themed-text';
import { getTheme, motion, radius, spacing } from '@/ui/theme';

type ListSectionProps = {
  title?: string;
  footer?: string;
  children: ReactNode;
};

/**
 * Grouped list section, in the Apple Notes / Things idiom: a quiet overline, one rounded
 * container holding hairline-separated rows, and an optional quiet footer. Grouping is
 * done with background + hairlines rather than a card per row.
 */
export function ListSection({ title, footer, children }: ListSectionProps) {
  const colors = getTheme(useColorScheme());

  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText variant="overline" color={colors.textFaint} style={styles.sectionTitle}>
          {title}
        </ThemedText>
      ) : null}
      <View style={[styles.group, { backgroundColor: colors.surfaceRaised }]}>{children}</View>
      {footer ? (
        <ThemedText variant="caption" color={colors.textFaint} style={styles.footer}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

type ListRowProps = {
  label: string;
  /** One short line of supporting text. Keep it to a single sentence. */
  detail?: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Right-hand accessory; defaults to a chevron when pressable. */
  accessory?: ReactNode;
  last?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A single row inside a `ListSection`. */
export function ListRow({
  label,
  detail,
  value,
  onPress,
  disabled = false,
  destructive = false,
  accessory,
  last = false,
}: ListRowProps) {
  const colors = getTheme(useColorScheme());
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: pressed.get() === 1 ? colors.surface : 'rgba(0,0,0,0)',
  }));

  const content = (
    <View style={styles.rowInner}>
      <View style={styles.rowText}>
        <ThemedText
          variant="body"
          color={destructive ? colors.danger : disabled ? colors.textFaint : colors.text}
        >
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText variant="caption" color={colors.textFaint} numberOfLines={2}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {value ? (
        <ThemedText variant="subhead" color={colors.textMuted} numberOfLines={1}>
          {value}
        </ThemedText>
      ) : null}
      {accessory ??
        (onPress ? <View style={[styles.chevron, { borderColor: colors.borderStrong }]} /> : null)}
    </View>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.row,
          !last && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => pressed.set(withTiming(1, { duration: motion.press }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: motion.press }))}
      onPress={onPress}
      pressRetentionOffset={12}
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        animatedStyle,
        disabled && styles.disabled,
      ]}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { paddingHorizontal: spacing.xs },
  group: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  footer: { paddingHorizontal: spacing.xs, lineHeight: 16 },
  row: { minHeight: 52 },
  rowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
  chevron: {
    width: 7,
    height: 7,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    transform: [{ rotate: '45deg' }],
    opacity: 0.5,
  },
  disabled: { opacity: 0.45 },
});
