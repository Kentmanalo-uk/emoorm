import { useState } from 'react';
import { Pressable, View, Text, TextInput, StyleSheet } from 'react-native';
import { EyeIcon as Eye, EyeSlashIcon as EyeOff } from 'phosphor-react-native';
import { colors, control, fontFamily, radius, spacing, typography } from '../theme';

export default function TextField({
  label,
  error,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            secureTextEntry && styles.passwordInput,
            focused && styles.inputFocused,
            error && styles.inputError,
          ]}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            style={styles.visibilityButton}
          >
            {isPasswordVisible
              ? <EyeOff size={20} color={colors.textSecondary} />
              : <Eye size={20} color={colors.textSecondary} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  inputWrap: { position: 'relative' },
  input: {
    ...typography.body,
    minHeight: control.height,
    color: colors.textPrimary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray100,
  },
  passwordInput: { paddingRight: control.iconSize + spacing.sm },
  visibilityButton: {
    position: 'absolute',
    right: spacing.xs,
    top: 2,
    width: control.iconSize,
    height: control.iconSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputFocused: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary },
  inputError: { borderWidth: 1, borderColor: colors.error, backgroundColor: colors.white },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
});
