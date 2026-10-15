import { forwardRef, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { InfoIcon, PackageIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { P } from './pkfLib';

/*
 * The package form's building blocks on phones (web PackageForm.jsx
 * Section, Field, FieldError, Thumb and PackageForm.css .pkf-section,
 * .pkf-field, .pkf-tag, .pkf-input, .pkf-note, ≤768px).
 */

/** Required / Optional beside a question (.pkf-tag). */
export function Tag({ text, inTitle = false }) {
  const req = text === 'Required';
  return (
    <View style={[styles.tag, req && styles.tagReq]}>
      <Text style={[styles.tagText, inTitle && styles.tagTextTitle, req && styles.tagTextReq]}>{text}</Text>
    </View>
  );
}

/** One step's white card: its title, a line under it and the fields (.pkf-section). */
export const Section = forwardRef(function Section({ title, tag, hint, invalid, children }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.titleRow}>
          <Text style={[styles.sectionTitle, invalid && styles.sectionTitleBad]} accessibilityRole="header">{title}</Text>
          {tag ? <Tag text={tag} inTitle /> : null}
        </View>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
});

/** A question: its label and tag, the control, then the error or a hint (.pkf-field). */
export const Field = forwardRef(function Field({ label, tag, error, hint, aside, children }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {tag ? <Tag text={tag} /> : null}
        {aside ? <Text style={styles.aside}>{aside}</Text> : null}
      </View>
      {children}
      {error ? <FieldError text={error} /> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

export function FieldError({ text }) {
  if (!text) return null;
  return <Text style={styles.error} accessibilityRole="alert">{text}</Text>;
}

/** A hint line under a field (.pkf-hint). */
export function Hint({ children, style }) {
  return <Text style={[styles.hint, style]}>{children}</Text>;
}

/** .pkf-input: grey hairline, green while typing, red on an error. */
export function PkfInput({ error, multiline, style, onFocus, onBlur, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...rest}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor={t.neutral[400]}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      style={[
        styles.input,
        multiline && styles.textarea,
        focused && styles.inputFocus,
        error && styles.inputBad,
        style,
      ]}
    />
  );
}

/** A product photo, or the package icon on grey when it has none (.pkf-thumb). */
export function Thumb({ src, style, iconSize = 18 }) {
  const uri = src ? resolveImg(src) || src : null;
  if (!uri) {
    return (
      <View style={[styles.thumb, styles.thumbNone, style]}>
        <PackageIcon size={iconSize} color={t.neutral[400]} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.thumb, style]} resizeMode="cover" />;
}

/** The green (or amber, draft) note above step 1 (.pkf-note). */
export function Note({ draft = false, children }) {
  const color = draft ? t.warning[800] : P.greenDark;
  return (
    <View style={[styles.note, draft && styles.noteDraft]}>
      <InfoIcon size={16} color={color} style={styles.noteIcon} />
      <Text style={[styles.noteText, { color }]}>{children}</Text>
    </View>
  );
}

export const pkfStyles = StyleSheet.create({
  // .pkf-link
  link: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingHorizontal: 2 },
  linkText: {
    fontSize: 13, lineHeight: 20.8, color: P.muted, textDecorationLine: 'underline', ...font(500),
  },
});

const styles = StyleSheet.create({
  section: { padding: 16, borderRadius: 16, backgroundColor: t.neutral[0] },
  sectionHead: { marginBottom: 14 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, lineHeight: 23.4, color: P.ink, ...font(500) },
  sectionTitleBad: { color: P.danger },
  sectionHint: { marginTop: 4, fontSize: 13.5, lineHeight: 19.575, color: P.muted, ...font(400) },
  sectionBody: { gap: 18 },

  tag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.neutral[100] },
  tagReq: { backgroundColor: t.warning[50] },
  tagText: { fontSize: 11.5, lineHeight: 18.4, color: P.muted, ...font(600) },
  tagTextTitle: { lineHeight: 14.95 },
  tagTextReq: { color: t.warning[700] },

  field: { gap: 7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(500) },
  aside: { marginLeft: 'auto', fontSize: 12, lineHeight: 19.2, color: P.muted, fontVariant: ['tabular-nums'], ...font(400) },
  hint: { fontSize: 12.5, lineHeight: 18.125, color: P.muted, ...font(400) },
  error: { fontSize: 13, lineHeight: 18.2, color: P.danger, ...font(500) },

  input: {
    width: '100%',
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 12,
    backgroundColor: t.neutral[0],
    color: P.ink,
    fontSize: 16,
    ...font(400),
  },
  textarea: { minHeight: 104, lineHeight: 24 },
  inputFocus: { borderColor: P.green },
  inputBad: { borderColor: P.danger },

  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: t.neutral[100] },
  thumbNone: { alignItems: 'center', justifyContent: 'center' },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: P.greenSoft,
  },
  noteDraft: { backgroundColor: t.warning[50] },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, fontSize: 13.5, lineHeight: 19.575, ...font(400) },
});
