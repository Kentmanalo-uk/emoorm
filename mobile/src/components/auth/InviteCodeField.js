import { StyleSheet, Text, View } from 'react-native';
import { AuthField } from './AuthForm';
import { font, t, themed } from '../../theme';

/**
 * The optional invite code on the sign-up forms (lib/invite
 * useSignupInvite), filled in from an invite link opened on this phone and
 * still editable. Only shown while invites are on.
 *
 * kind: the form's field kind ('register' on Sign up, 'login' on the
 * Google "Complete your account" step).
 */
export default function InviteCodeField({ invite, kind = 'register' }) {
  if (!invite?.on) return null;
  return (
    <View>
      <AuthField
        kind={kind}
        label="Invite code"
        optional
        value={invite.code}
        onChangeText={invite.setCode}
        placeholder="e.g. MARIA7K2Q"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={16}
      />
      {invite.fromLink ? <Text style={styles.note}>From the invite link you opened.</Text> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  note: { marginTop: 4, fontSize: 12, lineHeight: 18, color: t.primary[700], ...font(400) },
}));
