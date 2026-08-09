import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, control, fontFamily, radius, spacing, typography } from '../theme';

const VARIANT_STYLES = {
  primary: { bg: colors.primary, text: colors.white },
  secondary: { bg: colors.bgGreenLight, text: colors.primary },
  danger: { bg: colors.error, text: colors.white },
  ghost: { bg: 'transparent', text: colors.textPrimary },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}) {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <Text style={[styles.text, { color: v.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: control.height,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  text: { ...typography.body, fontWeight: '600', fontFamily: fontFamily.semiBold },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
