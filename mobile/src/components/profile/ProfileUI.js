import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretRightIcon, EyeIcon, EyeSlashIcon, SignOutIcon } from 'phosphor-react-native';
import EmptyArt from '../EmptyArt';
import { font, t } from '../../theme';

/*
 * The account pages' building blocks, drawn as the website's phone view draws
 * them (web/src/pages/Profile.css .pf-m-*, styles/phone-app.css, components/
 * seller/SettingsList.css + PhoneSaveBar.css, pages/ProfileSettings.css .ps-*,
 * the profile pages' .empty-state).
 */

export const BAND = t.neutral[100];

/** A full-width white section with the 8px grey band under it (.pf-m-section). */
export function PfSection({ children, list = false, last = false, style }) {
  return <View style={[styles.section, list && styles.sectionList, last && styles.sectionLast, style]}>{children}</View>;
}

/** A section title (.pf-m-section h2). In a list section it sits 16px in. */
export function PfTitle({ children, list = false, style }) {
  return <Text style={[styles.h2, list && styles.h2List, style]} accessibilityRole="header">{children}</Text>;
}

/** One line in the account lists (.pf-m-row): a bare filled icon, the label, a count, a chevron. */
export function PfRow({ Icon, label, hint, onPress, first = false }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}><Icon size={22} weight="fill" color={t.neutral[900]} /></View>
      <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
      {hint != null && hint !== '' ? <Text style={styles.rowHint} numberOfLines={1}>{hint}</Text> : null}
      <CaretRightIcon size={16} color={t.neutral[300]} />
    </Pressable>
  );
}

/** "Log out", the full-width row that closes the Profile and Settings pages (.pf-m-signout). */
export function SignOutRow({ onPress, label = 'Log out' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.signout, pressed && styles.signoutPressed]}>
      <SignOutIcon size={18} weight="bold" color={t.danger[600]} />
      <Text style={styles.signoutText}>{label}</Text>
    </Pressable>
  );
}

/** Settings in parts: rows showing what is set now (SettingsList / SettingsRow). */
export function SettingsList({ children }) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View>
      {rows.map((row, i) => <View key={i} style={i > 0 && styles.setLine}>{row}</View>)}
    </View>
  );
}

export function SettingsRow({ onPress, Icon, label, value, missing = false, tag = null }) {
  const body = (
    <>
      <View style={styles.setIcon}><Icon size={20} weight="fill" color={t.neutral[900]} /></View>
      <View style={styles.setText}>
        <Text style={styles.setLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.setValue, missing && styles.setMissing]} numberOfLines={1}>{value}</Text>
      </View>
      {tag ? <Text style={styles.setTag}>{tag}</Text> : null}
      {onPress ? <CaretRightIcon size={16} color={t.neutral[300]} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.setRow}>{body}</View>;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.setRow, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

/** Cancel and Save changes, pinned to the bottom of a part's page (PhoneSaveBar). */
export function SaveBar({ onCancel, onSave, saving = false, canSave = true, saveLabel = 'Save changes' }) {
  const insets = useSafeAreaInsets();
  const off = saving || !canSave;
  return (
    <View style={[styles.savebar, { paddingBottom: 10 + insets.bottom }]}>
      <Pressable accessibilityRole="button" onPress={onCancel} disabled={saving} style={[styles.saveBtn, styles.saveCancel]}>
        <Text style={[styles.saveText, { color: t.neutral[700] }]}>Cancel</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: off }}
        onPress={onSave}
        disabled={off}
        style={[styles.saveBtn, styles.saveSave, off && styles.saveOff]}
      >
        {saving ? <ActivityIndicator size="small" color={t.neutral[500]} style={{ marginRight: 8 }} /> : null}
        <Text style={[styles.saveText, { color: off ? t.neutral[500] : '#fff' }]}>{saving ? 'Saving…' : saveLabel}</Text>
      </Pressable>
    </View>
  );
}

/** A form card on a part's page (.ps-card): white, rounded, a faint shadow. */
export function PsCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A labelled field (.ps-field): label, the control, a help line. */
export function PsField({ label, help, warn = false, children, style }) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
      {help ? <Text style={[styles.help, warn && styles.helpWarn]}>{help}</Text> : null}
    </View>
  );
}

export function PsInput({ style, prefix, right, editable = true, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <TextInput
        placeholderTextColor={t.neutral[500]}
        editable={editable}
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[
          styles.input,
          prefix && { paddingLeft: 28 },
          right && { paddingRight: 44 },
          focused && styles.inputFocus,
          !editable && styles.inputLocked,
          style,
        ]}
      />
      {prefix ? <Text style={styles.prefix} pointerEvents="none">{prefix}</Text> : null}
      {right ? <View style={styles.inputRight}>{right}</View> : null}
    </View>
  );
}

/** A password input with a show/hide eye (PasswordField). */
export function PasswordField({ label, value, onChange, help }) {
  const [visible, setVisible] = useState(false);
  return (
    <PsField label={label} help={help}>
      <PsInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        right={(
          <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible((v) => !v)} style={styles.eye}>
            {visible ? <EyeSlashIcon size={15} color={t.neutral[500]} /> : <EyeIcon size={15} color={t.neutral[500]} />}
          </Pressable>
        )}
      />
    </PsField>
  );
}

/** The Settings page's buttons (.ps-btn): outline, ghost, primary, danger. */
export function PsButton({ label, Icon, onPress, variant = 'outline', disabled = false, busy = false, style, textStyle }) {
  const v = BTN[variant] || BTN.outline;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.btn, v.box, (disabled || busy) && styles.btnOff, pressed && v.pressed, style]}
    >
      {busy ? <ActivityIndicator size="small" color={v.color} /> : Icon ? <Icon size={15} weight={v.weight || 'regular'} color={v.color} /> : null}
      <Text style={[styles.btnText, { color: v.color }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const BTN = {
  outline: { box: { backgroundColor: '#fff', borderColor: t.neutral[300] }, color: t.neutral[900], pressed: { backgroundColor: t.neutral[50] } },
  ghost: { box: { backgroundColor: 'transparent', borderColor: 'transparent' }, color: t.neutral[500], pressed: { backgroundColor: t.neutral[100] } },
  primary: { box: { backgroundColor: t.primary[600], borderColor: t.primary[600] }, color: '#fff', pressed: { backgroundColor: t.primary[700] } },
  danger: { box: { backgroundColor: '#fff', borderColor: t.danger[200] }, color: t.danger[600], pressed: { backgroundColor: t.danger[50] }, weight: 'bold' },
  solidDanger: { box: { backgroundColor: t.danger[600], borderColor: t.danger[600] }, color: '#fff', pressed: { backgroundColor: t.danger[700] } },
};

/** The profile pages' empty card (.profile-section .empty-state). */
/** section: drawn in its .profile-section, edge to edge on a 12px-gutter page (14px above and below). */
export function ProfileEmpty({ art, title, hint, action, onAction, artSize = 96, section = false, style }) {
  return (
    <View style={[styles.empty, section && styles.emptySection, style]}>
      {art ? <EmptyArt name={art} size={artSize} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.emptyBtn, pressed && { backgroundColor: t.primary[700] }]}>
          <Text style={styles.emptyBtnText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The line under a page's title (.profile-page-subtitle): the title itself is in the back bar. */
export function PageSubtitle({ children, style }) {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: t.neutral[0], borderBottomWidth: 8, borderBottomColor: BAND },
  sectionList: { paddingTop: 14, paddingBottom: 4, paddingHorizontal: 0 },
  sectionLast: { borderBottomWidth: 0 },
  h2: { fontSize: 17, lineHeight: 19.55, color: t.neutral[900], ...font(500) },
  h2List: { paddingHorizontal: 16, paddingBottom: 4.45 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 16 },
  rowLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  rowPressed: { backgroundColor: t.neutral[50] },
  rowIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 25.6, color: t.neutral[800], ...font(400) },
  rowHint: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },

  signout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, backgroundColor: t.neutral[0] },
  signoutPressed: { backgroundColor: t.danger[50] },
  signoutText: { fontSize: 15, lineHeight: 18, color: t.danger[600], ...font(500) },

  setLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingLeft: 16, paddingRight: 14 },
  setIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  setText: { flex: 1, minWidth: 0, gap: 2 },
  setLabel: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  setValue: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  setMissing: { color: t.warning[700] },
  setTag: {
    flexShrink: 0, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.accent[50], color: t.accent[700], fontSize: 11.5, lineHeight: 15, ...font(500),
  },

  savebar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 60,
    flexDirection: 'row', gap: 10, paddingTop: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderTopWidth: 1, borderTopColor: t.neutral[100],
    boxShadow: '0px -6px 18px rgba(15, 23, 42, 0.06)',
  },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 12, borderRadius: 999 },
  saveCancel: { flex: 1, borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  saveSave: { flex: 1.6, backgroundColor: t.primary[600] },
  saveOff: { backgroundColor: t.neutral[200] },
  saveText: { fontSize: 15, lineHeight: 24, ...font(500) },

  card: {
    gap: 16, padding: 14, borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.04)',
  },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(500) },
  help: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  helpWarn: { color: t.warning[700] },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  input: {
    minHeight: 48, paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10,
    backgroundColor: '#fff', color: t.neutral[900], fontSize: 16, lineHeight: 24, ...font(400),
  },
  inputFocus: { borderColor: t.primary[600] },
  inputLocked: { backgroundColor: t.neutral[50], color: t.neutral[500] },
  prefix: { position: 'absolute', left: 13, fontSize: 16, lineHeight: 25.6, color: t.neutral[500], ...font(400) },
  inputRight: { position: 'absolute', right: 3, top: 0, bottom: 0, justifyContent: 'center' },
  eye: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1, borderRadius: 10,
  },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 14, lineHeight: 16.8, ...font(500) },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 16 },
  emptySection: { marginHorizontal: -10, marginVertical: 14 },
  emptyTitle: { fontSize: 16, lineHeight: 25.6, color: t.neutral[700], textAlign: 'center', ...font(500) },
  emptyHint: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
  emptyBtn: { alignItems: 'center', justifyContent: 'center', height: 44, marginTop: 8, paddingHorizontal: 22, borderRadius: 10, backgroundColor: t.primary[600] },
  emptyBtnText: { fontSize: 14, lineHeight: 22.4, color: '#fff', ...font(500) },

  subtitle: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },
});
