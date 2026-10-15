import { useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon, CheckCircleIcon, CheckIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';

/*
 * The pieces of the seller's Delivery & payment pages on phones
 * (web/src/pages/SellerFulfillment.css "Mobile" rules, components/seller/
 * SettingsList.jsx + .css): the list of parts, the answer cards, the
 * numbered questions, fee boxes, switches and the form fields.
 */

const ELEV_CARD = '0px 8px 24px rgba(149, 157, 165, 0.06)';

/** The parts as a list, one row each with what is set now (.scm-setlist). */
export function SettingsList({ label, children }) {
  return <View style={styles.list} accessibilityLabel={label}>{children}</View>;
}

/** One part (.scm-setrow): icon, label, value (amber when missing), a tag, and the chevron. */
export function SettingsRow({
  to, icon: Icon, label, value, missing = false, tag = null, first = false,
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={to ? () => router.push(to) : undefined}
      disabled={!to}
      style={({ pressed }) => [styles.row, !first && styles.rowNext, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}><Icon size={20} weight="fill" color={t.neutral[900]} /></View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, missing && styles.rowMissing]} numberOfLines={1}>{value}</Text>
      </View>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      {to ? <CaretRightIcon size={16} color={t.neutral[300]} /> : null}
    </Pressable>
  );
}

/** "Pickup is off…" with the link to change it (.scm-part-note). */
export function PartNote({ text, linkLabel, onPress }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{text}</Text>
      <Text accessibilityRole="link" onPress={onPress} style={styles.noteLink}>{linkLabel}</Text>
    </View>
  );
}

/** A card's body (.sf-body on phones). */
export function SfBody({ children, style }) {
  return <View style={[styles.body, style]}>{children}</View>;
}

/** One answer: a card with a title, a short line and a tick when chosen (.sf-mode-card). */
export function ModeCard({ checked, onPress, title, desc }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: Boolean(checked) }}
      onPress={onPress}
      style={[styles.mode, checked && styles.modeOn]}
    >
      <View style={styles.modeText}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeDesc}>{desc}</Text>
      </View>
      {checked ? (
        <View style={styles.modeCheck}><CheckIcon size={14} color="#fff" /></View>
      ) : null}
    </Pressable>
  );
}

/** The answers, one under the other (.sf-mode-grid). */
export function ModeGrid({ children }) {
  return <View style={styles.modeGrid} accessibilityRole="radiogroup">{children}</View>;
}

/** A numbered question (.sf-q, .sf-q-title, .sf-q-num); `icon` in place of the number. */
export function Question({ num, icon = null, title, first = false, children, onLayout }) {
  return (
    <View style={[styles.q, !first && styles.qNext]} onLayout={onLayout}>
      <View style={styles.qTitle}>
        {icon || <View style={styles.qNum}><Text style={styles.qNumText}>{num}</Text></View>}
        <Text style={styles.qTitleText} accessibilityRole="header">{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** A small line of help (.sf-hint, .sf-hint-lead, .sf-hint-error). */
export function Hint({ children, lead = false, error = false, style }) {
  return <Text style={[styles.hint, lead && styles.hintLead, error && styles.hintError, style]}>{children}</Text>;
}

/** A green line with a tick (.sf-all, .sf-summary). */
export function GreenNote({ children, strong = false }) {
  return (
    <View style={styles.green} accessibilityRole={strong ? 'summary' : undefined}>
      <CheckCircleIcon size={18} weight="fill" color={t.primary[600]} style={styles.greenIcon} />
      <Text style={[styles.greenText, strong && styles.greenStrong]}>{children}</Text>
    </View>
  );
}

/** A peso box (.sf-fee-box); `width` 92 in the fee rows, 120 for the one fee. */
export function PesoBox({
  value, onChangeText, placeholder, disabled = false, free = false, width = 92, label,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.feeBox, { width }, focused && styles.feeBoxFocus, free && styles.feeBoxFree]}>
      <Text style={styles.peso}>₱</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={free ? t.primary[700] : t.neutral[400]}
        editable={!disabled}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.feeInput, free && styles.feeInputFree]}
      />
    </View>
  );
}

/** A delivery fee box: an amount in pesos, or Free (₱0) (.sf-fee). */
export function FeeInput({
  value, onChange, placeholder, label,
}) {
  const free = value !== '' && Number(value) === 0;
  return (
    <View style={styles.fee}>
      <PesoBox
        value={free ? '' : value}
        onChangeText={onChange}
        placeholder={free ? 'Free' : placeholder}
        disabled={free}
        free={free}
        label={label}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: free }}
        onPress={() => onChange(free ? '' : '0')}
        style={[styles.free, free && styles.freeOn]}
      >
        <Text style={[styles.freeText, free && styles.freeTextOn]}>Free</Text>
      </Pressable>
    </View>
  );
}

/** The phone switch (.sf-switch). */
export function SfSwitch({ value, onValueChange, label }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: Boolean(value) }}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={[styles.switch, value && styles.switchOn]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

/** A field's label (.form-group label), with the red * when required. */
export function FieldLabel({ children, required = false, style }) {
  return (
    <Text style={[styles.label, style]}>
      {children}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

/** A text box (.form-input / .form-textarea on phones). */
export function FieldInput({ multiline = false, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.neutral[400]}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, multiline && styles.textarea, focused && styles.inputFocus, style]}
    />
  );
}

/** A plain outline button (.btn-seller-outline). */
export function OutlineButton({ label, onPress, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.outline, disabled && styles.outlineOff, pressed && styles.outlinePressed, style]}
    >
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden', borderRadius: 16, backgroundColor: t.neutral[0] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingRight: 14, paddingLeft: 16,
  },
  rowNext: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  rowPressed: { backgroundColor: t.neutral[50] },
  rowIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  rowValue: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  rowMissing: { color: t.warning[700] },
  tag: {
    flexShrink: 0, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.accent[50], color: t.accent[700], fontSize: 11.5, lineHeight: 18.4, ...font(500),
  },

  note: {
    alignItems: 'flex-start', gap: 10, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.neutral[0],
  },
  noteText: { fontSize: 14, lineHeight: 21, color: t.neutral[700], ...font(400) },
  noteLink: { fontSize: 14, lineHeight: 21, color: t.primary[700], ...font(500) },

  body: { gap: 14, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16 },

  modeGrid: { gap: 8 },
  mode: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 56,
    paddingVertical: 12, paddingRight: 44, paddingLeft: 14, borderRadius: 12,
    backgroundColor: t.neutral[50], boxShadow: ELEV_CARD,
  },
  modeOn: { backgroundColor: t.success[50], boxShadow: '0px 0px 0px 3px rgba(5, 150, 105, 0.08)' },
  modeText: { flex: 1, minWidth: 0, gap: 3 },
  modeTitle: { fontSize: 14.5, lineHeight: 20, color: t.neutral[900], ...font(500) },
  modeDesc: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  modeCheck: {
    position: 'absolute', top: '50%', right: 14, marginTop: -10, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },

  q: { gap: 12 },
  qNext: { paddingTop: 18, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  qTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qNum: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600], flexShrink: 0,
  },
  qNumText: { fontSize: 12.5, lineHeight: 15, color: '#fff', ...font(500) },
  qTitleText: { flex: 1, fontSize: 16, lineHeight: 22, color: t.neutral[900], ...font(500) },

  hint: { fontSize: 12, lineHeight: 18, color: t.neutral[500], ...font(400) },
  hintLead: { fontSize: 13, lineHeight: 19.5, color: t.neutral[600] },
  hintError: { color: t.warning[700] },

  green: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: t.success[50],
  },
  greenIcon: { marginTop: 1 },
  greenText: { flex: 1, fontSize: 14, lineHeight: 20.3, color: t.primary[800], ...font(400) },
  greenStrong: font(500),

  fee: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  feeBox: {
    flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  feeBoxFocus: { borderColor: t.primary[500] },
  feeBoxFree: { borderColor: t.primary[200], backgroundColor: t.primary[50] },
  peso: { fontSize: 14, lineHeight: 20, color: t.neutral[500], ...font(400) },
  feeInput: {
    flex: 1, minWidth: 0, height: '100%', paddingVertical: 0, paddingLeft: 4, paddingRight: 0,
    fontSize: 14, color: t.neutral[900], ...font(400), outlineStyle: 'none',
  },
  feeInputFree: font(600),
  free: {
    height: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
    backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  freeOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  freeText: { fontSize: 12.5, lineHeight: 16, color: t.neutral[600], ...font(600) },
  freeTextOn: { color: '#fff' },

  switch: {
    width: 46, height: 28, borderRadius: 999, backgroundColor: t.neutral[300], flexShrink: 0,
  },
  switchOn: { backgroundColor: t.primary[600] },
  knob: {
    position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.25)',
  },
  knobOn: { transform: [{ translateX: 18 }] },

  label: { fontSize: 13, lineHeight: 19.5, color: t.neutral[700], ...font(500) },
  required: { color: t.danger[600] },
  input: {
    minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10,
    backgroundColor: t.neutral[0], fontSize: 14, color: t.neutral[900], ...font(400), outlineStyle: 'none',
  },
  textarea: { minHeight: 96 },
  inputFocus: { borderColor: t.primary[600] },

  outline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  outlineOff: { opacity: 0.5 },
  outlinePressed: { backgroundColor: t.neutral[50] },
  outlineText: { fontSize: 13, lineHeight: 16, color: t.neutral[700], ...font(500) },
});
