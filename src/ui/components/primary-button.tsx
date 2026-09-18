import * as Haptics from 'expo-haptics';
import {
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/ui/components/themed-text';
import { getTheme, motion, radius, shadows, spacing } from '@/ui/theme';
import type { ThemeColors } from '@/ui/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function variantStyle(colors: ThemeColors, variant: Variant): ViewStyle {
  switch (variant) {
    case 'primary':
      return { backgroundColor: colors.accent, boxShadow: shadows.card };
    case 'destructive':
      return { backgroundColor: colors.danger, boxShadow: shadows.card };
    case 'secondary':
      return {
        backgroundColor: colors.surfaceRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      };
    case 'ghost':
      return { backgroundColor: 'transparent' };
  }
}

function labelColor(colors: ThemeColors, variant: Variant): string {
  switch (variant) {
    case 'primary':
      return colors.accentText;
    case 'destructive':
      return '#FFFFFF';
    case 'secondary':
      return colors.text;
    case 'ghost':
      return colors.accent;
  }
}

/**
 * The single button primitive. Press feedback is a 120ms scale on the UI thread (press-in,
 * not press-out), paired with one light haptic at the causal moment.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  const colors = getTheme(useColorScheme());
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const press = (to: number) => {
    scale.set(withTiming(to, { duration: motion.press }));
  };

  const tint = labelColor(colors, variant);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={() => press(0.97)}
      onPressOut={() => press(1)}
      pressRetentionOffset={12}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        styles.button,
        variantStyle(colors, variant),
        isDisabled ? styles.disabled : null,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.spinnerRow}>
          <View style={[styles.dot, { backgroundColor: tint }]} />
          <View style={[styles.dot, styles.dotMid, { backgroundColor: tint }]} />
          <View style={[styles.dot, { backgroundColor: tint }]} />
        </View>
      ) : (
        <ThemedText variant="button" color={tint}>
          {label}
        </ThemedText>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  disabled: { opacity: 0.45 },
  spinnerRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: radius.full, opacity: 0.5 },
  dotMid: { opacity: 1 },
});
