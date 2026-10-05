import { StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../theme';

/*
 * The centred "done" state of the password and email-confirmation sheets
 * (web ResetPassword.css .rp-done, .rp-done-icon(--warn), .rp-title,
 * .rp-description): a round icon, the title, the text, then its buttons.
 */

/** The round icon on top: green, or amber with `warn`. */
export function DoneIcon({ Icon, warn = false }) {
  return (
    <View style={[styles.icon, warn && styles.iconWarn]}>
      <Icon size={32} weight="fill" color={warn ? t.warning[600] : t.primary[600]} />
    </View>
  );
}

export function DoneTitle({ children, style }) {
  return <Text accessibilityRole="header" style={[styles.title, style]}>{children}</Text>;
}

export function DoneText({ children, style }) {
  return <Text style={[styles.text, style]}>{children}</Text>;
}

export default function AuthDone({ children, style }) {
  return <View style={[styles.done, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  done: { paddingTop: 24 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[50],
  },
  iconWarn: { backgroundColor: t.warning[50] },
  title: {
    marginBottom: 8,
    fontSize: 28,
    lineHeight: 32.2,
    letterSpacing: -0.28,
    color: t.neutral[900],
    textAlign: 'center',
    ...font(500),
  },
  text: { marginBottom: 24, fontSize: 15, lineHeight: 22.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
});
