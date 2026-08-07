import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fontFamily, radius, spacing, typography } from '../theme';

const VARIANT_STYLES = {
  primary: { bg: colors.primary, text: colors.white, border: colors.primary },
  secondary: { bg: colors.white, text: colors.primary, border: colors.primary },
  danger: { bg: colors.error, text: colors.white, border: colors.error },
  ghost: { bg: 'transparent', text: colors.textPrimary, border: 'transparent' },
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
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
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
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  text: { ...typography.body, fontWeight: '600', fontFamily: fontFamily.semiBold },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
