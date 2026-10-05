import { forwardRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EyeIcon, EyeSlashIcon } from 'phosphor-react-native';
import Svg, { Path } from 'react-native-svg';
import { font, t } from '../../theme';

/*
 * The pieces of the website's phone Log in / Sign up / password sheets
 * (web/src/pages/Login.css, Register.css, ForgotPassword.css,
 * ResetPassword.css under AuthSheet.css at phone width).
 *
 * Field kinds (`kind`):
 *   login     .login-form-*  and the forgot / reset sheets: 14px label 8px
 *             above a 50px input, 13px error
 *   register  .register-form-*: 13px label 6px above a 48px input, 12px error
 *   ph        the address picker's .ph-*: 13px label 4px above a 48px input
 */

// The app's web build only: Edge adds its own eye to password boxes; the
// website hides it (ResetPassword.css ::-ms-reveal), so the boxes show one eye.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('auth-no-reveal')) {
  const tag = document.createElement('style');
  tag.id = 'auth-no-reveal';
  tag.textContent = 'input::-ms-reveal,input::-ms-clear{display:none}';
  document.head.appendChild(tag);
}

const KINDS = {
  login: { gap: 8, height: 50, padX: 16, errorGap: 4 },
  sheet: { gap: 8, height: 50, padX: 16, errorGap: 0 },
  register: { gap: 6, height: 48, padX: 15, errorGap: 2 },
  ph: { gap: 4, height: 48, padX: 12, errorGap: 0 },
};

/** A field's label (with an optional grey "(optional)"). */
export function AuthLabel({ kind = 'login', children, optional, right, style }) {
  const small = kind === 'register' || kind === 'ph';
  const label = (
    <Text style={[styles.label, small && styles.labelSmall, style]}>
      {children}
      {optional ? <Text style={styles.optional}> (optional)</Text> : null}
    </Text>
  );
  if (!right) return label;
  return <View style={styles.labelRow}>{label}{right}</View>;
}

/** The input box alone: border, 10px corners, green border while typing, red on error. */
export const AuthInput = forwardRef(function AuthInput({
  kind = 'login', error, locked, editable = true, style, password, onFocus, onBlur, ...rest
}, ref) {
  const k = KINDS[kind] || KINDS.login;
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      // The address picker's and the password sheets' fields keep the
      // browser's own placeholder grey on the website (.ph-input, .fp-input
      // and .rp-input set none).
      placeholderTextColor={kind === 'ph' || kind === 'sheet' ? '#757575' : t.neutral[400]}
      editable={editable && !locked}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      style={[
        styles.input,
        { height: k.height, paddingHorizontal: k.padX },
        password && styles.inputPassword,
        focused && !locked && styles.inputFocus,
        // The password sheets' green focus border wins over the red one
        // (AuthSheet.css .is-sheet .fp-input:focus); the others stay red.
        error && !(kind === 'sheet' && focused) && (kind === 'ph' ? styles.inputErrorPh : styles.inputError),
        locked && styles.inputLocked,
        !editable && !locked && styles.inputDisabled,
        style,
      ]}
      {...rest}
    />
  );
});

/**
 * Label, input and error, as one group. `secure` adds the eye button that
 * shows the password (`eyeSize` 18; the reset sheet's is 20).
 */
export const AuthField = forwardRef(function AuthField({
  kind = 'login', label, optional, labelRight, error, secure, eyeSize = 18, eyeStart = false,
  show, onToggleShow, style, inputStyle, ...rest
}, ref) {
  const k = KINDS[kind] || KINDS.login;
  const [ownShow, setOwnShow] = useState(false);
  const visible = show ?? ownShow;
  const toggle = onToggleShow || (() => setOwnShow((v) => !v));
  return (
    <View style={[{ gap: k.gap }, style]}>
      {label ? <AuthLabel kind={kind} optional={optional} right={labelRight}>{label}</AuthLabel> : null}
      {secure ? (
        <View>
          <AuthInput
            ref={ref}
            kind={kind}
            error={error}
            password
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
            {...rest}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: visible }}
            onPress={toggle}
            style={[styles.eye, eyeStart && styles.eyeStart]}
          >
            {visible ? <EyeSlashIcon size={eyeSize} color={t.neutral[500]} /> : <EyeIcon size={eyeSize} color={t.neutral[500]} />}
          </Pressable>
        </View>
      ) : (
        <AuthInput ref={ref} kind={kind} error={error} style={inputStyle} {...rest} />
      )}
      {error ? <AuthFieldError kind={kind} style={{ marginTop: k.errorGap }}>{error}</AuthFieldError> : null}
    </View>
  );
});

/** The red line under a field. */
export function AuthFieldError({ kind = 'login', children, style }) {
  const small = kind === 'register' || kind === 'ph';
  return (
    <Text style={[styles.fieldError, small && styles.fieldErrorSmall, (kind === 'sheet' || kind === 'ph') && styles.fieldErrorDeep, style]}>
      {children}
    </Text>
  );
}

/** A button's label while its action runs: a spinner, then the text. */
export function BusyLabel({ children, color = '#fff', textStyle }) {
  return (
    <View style={styles.busy}>
      <ActivityIndicator size={16} color={color} />
      <Text style={textStyle}>{children}</Text>
    </View>
  );
}

/**
 * The green submit (.login-form-submit / .fp-submit). `fade` dims it while
 * busy (the password sheets); otherwise it turns grey (Log in, Sign up).
 */
export function AuthSubmit({ label, busyLabel, busy = false, disabled, onPress, fade = false, style }) {
  const off = disabled ?? busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.submit,
        pressed && styles.submitPressed,
        off && (fade ? styles.submitFaded : styles.submitOff),
        style,
      ]}
    >
      {busy && busyLabel
        ? <BusyLabel textStyle={styles.submitText}>{busyLabel}</BusyLabel>
        : <Text style={styles.submitText}>{label}</Text>}
    </Pressable>
  );
}

/** A white button with a grey border (.fp-secondary, "Back to log in"). */
export function AuthOutlineButton({ label, onPress, style, textStyle, children }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.outline, pressed && styles.outlinePressed, style]}
    >
      {children}
      {label ? <Text style={[styles.outlineText, textStyle]}>{label}</Text> : null}
    </Pressable>
  );
}

/** Google's four-colour G (the website's inline SVG). */
export function GoogleMark({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
      <Path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853" />
      <Path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <Path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
    </Svg>
  );
}

/** "Sign in with Google" / "Sign up with Google" (.login-form-google). */
export function GoogleButton({ label, onPress, disabled, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.google, pressed && styles.outlinePressed, disabled && styles.googleOff, style]}
    >
      <GoogleMark />
      <Text style={styles.googleText}>{label}</Text>
    </Pressable>
  );
}

/** The "or" between the form and Google (.login-form-divider). */
export function AuthDivider({ style }) {
  return (
    <View style={[styles.divider, style]}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
    </View>
  );
}

/** The red box with what the server said (.login-form-error-message). */
export function AuthErrorBox({ children, style }) {
  return (
    <View accessibilityRole="alert" style={[styles.errorBox, style]}>
      <Text style={styles.errorBoxText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700], ...font(500) },
  labelSmall: { fontSize: 13, lineHeight: 20.8 },
  optional: { color: t.neutral[500], ...font(400) },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },

  input: {
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 10,
    backgroundColor: '#fff',
    color: t.neutral[900],
    fontSize: 16,
    ...font(400),
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  inputPassword: { paddingRight: 48 },
  inputFocus: { borderColor: t.primary[600] },
  inputError: { borderColor: t.danger[500] },
  inputErrorPh: { borderColor: t.danger[600] },
  inputLocked: { backgroundColor: t.neutral[50], color: t.neutral[700], borderColor: t.neutral[300] },
  inputDisabled: { backgroundColor: t.neutral[100], color: t.neutral[500] },

  eye: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeStart: { alignItems: 'flex-start' },

  fieldError: { fontSize: 13, lineHeight: 20.8, color: t.danger[500], ...font(400) },
  fieldErrorSmall: { fontSize: 12, lineHeight: 19.2 },
  fieldErrorDeep: { color: t.danger[600] },

  busy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },

  submit: {
    height: 48,
    borderRadius: 10,
    backgroundColor: t.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  submitPressed: { backgroundColor: t.primary[700] },
  submitOff: { backgroundColor: t.neutral[400] },
  submitFaded: { opacity: 0.6 },
  submitText: { fontSize: 15, lineHeight: 18, color: '#fff', ...font(500) },

  outline: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.neutral[300],
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  outlinePressed: { backgroundColor: t.neutral[50], borderColor: t.neutral[400] },
  outlineText: { fontSize: 15, lineHeight: 24, color: t.neutral[800], ...font(500) },

  google: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.neutral[300],
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
  },
  googleOff: { opacity: 0.6 },
  googleText: { fontSize: 14, lineHeight: 16.8, color: t.neutral[700], ...font(500) },

  // The "or" sits 4px down a 24px line box (baseline-aligned inline-block on the website).
  divider: { height: 24, alignItems: 'center', paddingTop: 4 },
  dividerLine: { position: 'absolute', left: 0, right: 0, top: 12, height: 1, backgroundColor: t.neutral[200] },
  dividerText: {
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 12,
    lineHeight: 19.2,
    letterSpacing: 0.6,
    color: t.neutral[500],
    ...font(500),
  },

  errorBox: {
    padding: 12,
    backgroundColor: t.danger[50],
    borderWidth: 1,
    borderColor: t.danger[200],
    borderRadius: 4,
  },
  errorBoxText: { fontSize: 14, lineHeight: 22.4, color: t.danger[500], textAlign: 'center', ...font(400) },
});
