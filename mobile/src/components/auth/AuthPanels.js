import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import AuthAddressPicker from './AuthAddressPicker';
import { AuthErrorBox, AuthField, AuthSubmit } from './AuthForm';
import { font, t } from '../../theme';

/*
 * The other steps of the website's Log in sheet (web/src/pages/Login.jsx):
 * finishing a first Google sign-in, and an admin's two-factor check or
 * set-up. Same words and checks as the website.
 */

/** The sheet's big title (.login-form-title in the sheet: 28px, 500). */
export function AuthTitle({ children, style }) {
  return <Text accessibilityRole="header" style={[styles.title, style]}>{children}</Text>;
}

/** The grey note under a step's title (.login-mfa-hint), with bold parts. */
export function AuthHint({ children, style }) {
  return <Text style={[styles.hint, style]}>{children}</Text>;
}

export function Strong({ children }) {
  return <Text style={styles.strong}>{children}</Text>;
}

/** "Use a different account" / "Cancel" (.login-mfa-link). */
export function AuthTextLink({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** First Google sign-in: name, contact, address and a password before the account is made. */
export function GoogleCompleteProfile({
  profile, form, errors, onChange, onAddressChange, municipalities, municipalitiesLoading,
  showPassword, onTogglePassword, onSubmit, onCancel, isLoading, apiError,
}) {
  return (
    <View style={styles.form}>
      <AuthTitle>Complete your account</AuthTitle>
      <AuthHint>
        You&apos;re signing in with <Strong>{profile?.email}</Strong>. Just a few more
        details to finish setting up your Emoorm account.
      </AuthHint>

      <AuthField
        label="Full name"
        value={form.fullName}
        onChangeText={(v) => onChange('fullName', v)}
        error={errors.fullName}
        autoComplete="name"
      />
      <AuthField
        label="Contact number"
        optional
        value={form.contactNumber}
        onChangeText={(v) => onChange('contactNumber', v)}
        placeholder="09123456789"
        keyboardType="phone-pad"
        error={errors.contactNumber}
      />
      <AuthAddressPicker
        value={form}
        onChange={onAddressChange}
        dbMunicipalities={municipalities}
        dbLoading={municipalitiesLoading}
        errors={errors}
        streetLabel="Street / House No. (optional)"
      />
      <AuthField
        label="Password"
        secure
        show={showPassword}
        onToggleShow={onTogglePassword}
        value={form.password}
        onChangeText={(v) => onChange('password', v)}
        placeholder="Create a password"
        error={errors.password}
      />
      <AuthField
        label="Confirm password"
        value={form.confirmPassword}
        onChangeText={(v) => onChange('confirmPassword', v)}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.confirmPassword}
      />

      <AuthSubmit
        label="Create account & continue"
        busyLabel="Creating account…"
        busy={isLoading}
        onPress={onSubmit}
        style={styles.submit}
      />
      {apiError ? <AuthErrorBox>{apiError}</AuthErrorBox> : null}
      <AuthTextLink label="Use a different account" onPress={onCancel} />
    </View>
  );
}

/** An admin's sign-in: the code from the authenticator app (or a backup code). */
export function MfaVerify({ email, code, onCodeChange, onSubmit, onCancel, isLoading, apiError }) {
  return (
    <View style={styles.form}>
      <AuthTitle>Two-factor verification</AuthTitle>
      <AuthHint>
        Enter the 6-digit code from your authenticator app for
        {' '}<Strong>{email}</Strong>. You can also use a backup code.
      </AuthHint>
      <AuthField
        label="Verification code"
        value={code}
        onChangeText={onCodeChange}
        autoFocus
        maxLength={12}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="123 456"
        inputStyle={styles.codeInput}
        onSubmitEditing={onSubmit}
      />
      <AuthSubmit label="Verify & continue" busyLabel="Verifying…" busy={isLoading} onPress={onSubmit} style={styles.submit} />
      {apiError ? <AuthErrorBox>{apiError}</AuthErrorBox> : null}
      <AuthTextLink label="Use a different account" onPress={onCancel} />
    </View>
  );
}

/** An admin without two-factor yet: scan, enter a code, then keep the backup codes. */
export function MfaSetup({
  email, qrDataUrl, secret, code, onCodeChange, onSubmit, onCancel, onContinue, backupCodes, isLoading, apiError,
}) {
  if (backupCodes) {
    return (
      <View style={styles.form}>
        <AuthTitle>Save your backup codes</AuthTitle>
        <AuthHint>Store these in a safe place. Each can be used once if you lose access to your authenticator.</AuthHint>
        <View style={styles.backup}>
          {backupCodes.map((c) => (
            <Text key={c} selectable style={styles.backupCode}>{c}</Text>
          ))}
        </View>
        <AuthSubmit label="I've saved them — continue" onPress={onContinue} style={styles.submit} />
      </View>
    );
  }
  return (
    <View style={styles.form}>
      <AuthTitle>Set up two-factor auth</AuthTitle>
      <AuthHint>
        Admin accounts require an authenticator app. Scan the QR with Google
        Authenticator, Authy, or 1Password, then enter the 6-digit code.
      </AuthHint>
      {qrDataUrl ? (
        <Image source={{ uri: qrDataUrl }} accessibilityLabel="MFA QR code" style={styles.qr} />
      ) : (
        <View style={[styles.qr, styles.qrEmpty]}><Text style={styles.qrEmptyText}>Loading QR…</Text></View>
      )}
      {secret ? (
        <View style={styles.secret}>
          <Text style={styles.secretLabel}>OR ENTER THIS KEY MANUALLY</Text>
          <Text selectable style={styles.secretCode}>{secret}</Text>
        </View>
      ) : null}
      <AuthField
        label="6-digit code"
        value={code}
        onChangeText={onCodeChange}
        autoFocus
        maxLength={6}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="123456"
        inputStyle={styles.codeInput}
        onSubmitEditing={onSubmit}
      />
      <AuthSubmit label="Enable & continue" busyLabel="Verifying…" busy={isLoading} onPress={onSubmit} style={styles.submit} />
      {apiError ? <AuthErrorBox>{apiError}</AuthErrorBox> : null}
      <AuthHint style={styles.signedAs}>Signed in as <Strong>{email}</Strong>.</AuthHint>
      <AuthTextLink label="Cancel" onPress={onCancel} />
    </View>
  );
}

const mono = { fontFamily: 'monospace' };

const styles = StyleSheet.create({
  form: { gap: 16 },
  title: { fontSize: 28, lineHeight: 32.2, letterSpacing: -0.28, color: t.neutral[900], ...font(500) },
  hint: { fontSize: 13.5, lineHeight: 20.9, color: t.neutral[600], textAlign: 'center', marginBottom: 2, ...font(400) },
  strong: { color: t.neutral[800], ...font(500) },
  submit: { marginTop: 8 },
  link: { alignSelf: 'center', marginTop: -4, paddingVertical: 6, paddingHorizontal: 10 },
  linkText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], textDecorationLine: 'underline', ...font(400) },
  codeInput: { fontSize: 18, letterSpacing: 4, textAlign: 'center' },
  qr: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.neutral[200],
    backgroundColor: t.neutral[0],
    padding: 8,
  },
  qrEmpty: { alignItems: 'center', justifyContent: 'center' },
  qrEmptyText: { fontSize: 13, color: t.neutral[400], ...font(400) },
  secret: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.neutral[300],
    backgroundColor: t.neutral[50],
    alignItems: 'center',
  },
  secretLabel: { fontSize: 11.5, letterSpacing: 0.5, color: t.neutral[500], marginBottom: 4, ...font(400) },
  secretCode: { ...mono, fontSize: 13, color: t.neutral[900], textAlign: 'center' },
  backup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  backupCode: {
    ...mono,
    width: '48.5%',
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.neutral[200],
    backgroundColor: t.neutral[100],
    fontSize: 13,
    color: t.neutral[900],
    textAlign: 'center',
  },
  signedAs: { marginTop: -8 },
});
