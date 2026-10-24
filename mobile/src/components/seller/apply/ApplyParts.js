import { useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  CameraIcon, CheckIcon, FileTextIcon, MoneyIcon, XIcon,
} from 'phosphor-react-native';
import { SvgXml } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../../../api/client';
import { ENDPOINTS } from '../../../api/endpoints';
import { toast } from '../../../lib/toast';
import { uploadImage, uploadKycDocument } from '../../../lib/upload';
import { resolveImg } from '../../../lib/media';
import { font, t } from '../../../theme';
import { GCASH_LOGO, QRPH_LOGO } from '../fulfillment/paymentLogos';

/*
 * The seller application's pieces as phones draw them
 * (web/src/pages/SellerApply.jsx + SellerApply.css, the
 * `@media (max-width: 600px)` block): numbered white section cards, grey
 * filled fields, choice cards with a checkbox or a radio dot, the round /
 * square / wide picture boxes and the business papers box.
 */

// The page's own greens (SellerApply.css .apply-page --apply-brand / --apply-brand-soft).
export const BRAND = '#055d07';
export const BRAND_SOFT = '#e8f3e8';

// How buyers pay the shop. GCash and QR Ph need the account buyers pay into.
export const PAYOUT_METHODS = [
  { value: 'GCASH', label: 'GCash', logo: GCASH_LOGO, desc: 'Buyers pay to your GCash number', numberLabel: 'GCash number', numberPlaceholder: '0917 123 4567' },
  { value: 'QRPH', label: 'QR Ph', logo: QRPH_LOGO, desc: 'Buyers scan your bank or e-wallet QR', numberLabel: 'Account number', numberPlaceholder: 'Bank or e-wallet account number' },
  { value: 'COD_ONLY', label: 'Cash on delivery', desc: 'Buyers pay in cash when they get the order' },
];
export const QR_METHODS = ['GCASH', 'QRPH'];

const pickPhoto = async (quality) => {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality });
  return result.canceled ? null : result.assets?.[0] || null;
};

/** .apply-section: a white card. */
export function Section({ children, onLayout }) {
  return <View style={styles.section} onLayout={onLayout}>{children}</View>;
}

/** .apply-section-head: the step in a soft green circle, a title, one line on why, an icon. */
export function SectionHead({ step, title, Icon, children }) {
  return (
    <View style={styles.head}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{step}</Text></View>
      <View style={styles.headText}>
        <Text style={styles.headTitle} accessibilityRole="header">{title}</Text>
        <Text style={styles.headLine}>{children}</Text>
      </View>
      <Icon size={20} weight="fill" color={BRAND} style={styles.headIcon} />
    </View>
  );
}

/** .apply-field: the label (a red * when needed, "(optional)" in grey), the control, then the error or a hint. */
export function Field({ label, required = false, optional = false, error, hint, children }) {
  return (
    <View style={styles.field}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
          {optional ? <Text style={styles.optional}> (optional)</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** .apply-field input: grey filled, white with a green border while typing, red when wrong. */
export function ApplyInput({ error = false, white = false, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.neutral[500]}
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[styles.input, white && styles.inputWhite, focused && styles.inputFocus, error && styles.inputError, style]}
    />
  );
}

/** .apply-form: the fields of a section, 20 apart. */
export function Form({ children }) {
  return <View style={styles.form}>{children}</View>;
}

/** .apply-info: the grey box of who is applying. */
export function InfoBox({ children }) {
  return <View style={styles.info}>{children}</View>;
}

export function InfoRow({ label, value, children }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValue}>
        <Text style={styles.infoValueText}>{value}</Text>
        {children}
      </View>
    </View>
  );
}

/** The contact number is required to apply, so it is fixed here, not in Settings. */
export function ContactNumberField({ value, onSaved }) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const contactNumber = draft.trim();
    if (!/^(\+63|0)?[0-9]{10}$/.test(contactNumber)) {
      toast.error('Enter a valid Philippine mobile number, e.g. 09171234567');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.put(ENDPOINTS.AUTH.PROFILE, { contactNumber });
      onSaved(res?.data?.contactNumber || contactNumber);
      setEditing(false);
      toast.success('Contact number saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save your contact number');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <InfoRow label="Contact number" value={value}>
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={8}>
          {({ pressed }) => <Text style={[styles.inlineEdit, pressed && styles.pressedText]}>Change</Text>}
        </Pressable>
      </InfoRow>
    );
  }

  return (
    <Field label="Contact number" required>
      <View style={styles.inlineField}>
        <ApplyInput
          white
          value={draft}
          onChangeText={setDraft}
          placeholder="09171234567"
          keyboardType="phone-pad"
          autoComplete="tel"
          error={!value}
          style={styles.inlineInput}
        />
        <Pressable
          accessibilityRole="button"
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.inlineSave, pressed && styles.primaryPressed, saving && styles.busy]}
        >
          <Text style={styles.inlineSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </Field>
  );
}

/** .apply-chip / .apply-pill: a round choice, green with a tick when on. */
export function Chip({ label, on, onPress, role = 'checkbox' }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && !on && styles.chipPressed, on && styles.chipOn]}
    >
      {({ pressed }) => (
        <>
          {on ? <CheckIcon size={13} weight="bold" color={t.neutral[0]} /> : null}
          <Text style={[styles.chipText, pressed && !on && styles.chipTextPressed, on && styles.chipTextOn]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** .apply-chips: the categories, a pale red box around them when none is picked. */
export function Chips({ error = false, children, label }) {
  return <View accessibilityLabel={label} style={[styles.chips, error && styles.chipsError]}>{children}</View>;
}

/** Choices as cards where one is on: an icon, a name, one line on what it means, a radio dot. */
export function OptionCards({ label, options, value, onChange }) {
  return (
    <View style={styles.cards} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(({ value: optionValue, label: name, desc, Icon }) => {
        const on = value === optionValue;
        return (
          <Pressable
            key={optionValue}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${name}. ${desc}`}
            onPress={() => onChange(optionValue)}
            style={({ pressed }) => [styles.card, styles.option, pressed && !on && styles.cardPressed, on && styles.cardOn]}
          >
            <View style={[styles.optionIcon, on && styles.optionIconOn]}><Icon size={18} weight="fill" color={BRAND} /></View>
            <View style={styles.cardText}>
              <Text style={styles.optionLabel}>{name}</Text>
              <Text style={styles.cardDesc}>{desc}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** GCash, QR Ph and Cash on delivery as cards: the logo (or a cash icon), how buyers pay, a checkbox. Pick any. */
export function PaymentMethods({ value, onToggle }) {
  return (
    <View style={styles.cards} accessibilityLabel="Payment methods">
      {PAYOUT_METHODS.map((m) => {
        const on = value.includes(m.value);
        return (
          <Pressable
            key={m.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${m.label}. ${m.desc}`}
            onPress={() => onToggle(m.value)}
            style={({ pressed }) => [styles.card, pressed && !on && styles.cardPressed, on && styles.cardOn]}
          >
            <View style={styles.cardText}>
              {m.logo ? (
                <View style={styles.payLogo}><SvgXml xml={m.logo} height={22} width={94} /></View>
              ) : (
                <View style={styles.cod}>
                  <View style={styles.codIcon}><MoneyIcon size={15} weight="fill" color={t.neutral[0]} /></View>
                  <Text style={styles.codLabel}>{m.label}</Text>
                </View>
              )}
              <Text style={styles.cardDesc}>{m.desc}</Text>
            </View>
            <View style={[styles.check, on && styles.checkOn]}>
              {on ? <CheckIcon size={13} weight="bold" color={t.neutral[0]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A picture to upload (here the payment QR, square): a grey box with "Add", or the picture with a round ×. */
export function PictureField({ label, value, onChange, shape = 'square' }) {
  const [busy, setBusy] = useState(false);
  const src = value ? resolveImg(value) : null;
  const pick = async () => {
    if (busy) return;
    const asset = await pickPhoto(0.9);
    if (!asset) return;
    setBusy(true);
    try {
      const res = await uploadImage(asset);
      onChange(res.url);
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };
  const square = shape === 'square';
  return (
    <View style={[styles.pic, !square && styles.picWideWrap]}>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
          onPress={pick}
          disabled={busy}
          style={({ pressed }) => [styles.picBox, square ? styles.picSquare : styles.picWide, pressed && styles.picPressed]}
        >
          {src ? (
            <Image source={{ uri: src }} style={[styles.picImg, square && styles.picImgContain]} resizeMode={square ? 'contain' : 'cover'} />
          ) : (
            <View style={styles.picEmpty}>
              <CameraIcon size={20} color={BRAND} />
              <Text style={styles.picEmptyText}>{busy ? 'Uploading…' : 'Add'}</Text>
            </View>
          )}
        </Pressable>
        {src && !busy ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} onPress={() => onChange('')} hitSlop={6} style={styles.picRemove}>
            <XIcon size={12} weight="bold" color={t.neutral[0]} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.picLabel}>{label}</Text>
    </View>
  );
}

/**
 * The business papers (permit, DTI or SEC): uploaded privately, so the preview
 * is the picked photo itself, never a link back to the stored document.
 */
export function PapersField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const pick = async () => {
    if (busy) return;
    const asset = await pickPhoto(1);
    if (!asset) return;
    setBusy(true);
    try {
      const res = await uploadKycDocument(asset);
      setPreview(asset.uri);
      onChange(res.fileId);
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? 'Change business papers' : 'Add business papers'}
        onPress={pick}
        disabled={busy}
        style={({ pressed }) => [styles.picBox, styles.papersBox, pressed && styles.picPressed]}
      >
        {value && preview ? <Image source={{ uri: preview }} style={styles.picImg} resizeMode="cover" /> : (
          <View style={[styles.picEmpty, styles.papersEmpty]}>
            {value ? <FileTextIcon size={22} color={BRAND} /> : <CameraIcon size={20} color={BRAND} />}
            <Text style={[styles.picEmptyText, styles.papersText]}>
              {busy ? 'Uploading…' : value ? 'Papers uploaded · tap to change' : 'Add a photo of your papers'}
            </Text>
          </View>
        )}
      </Pressable>
      {value && !busy ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Remove business papers" onPress={() => { setPreview(null); onChange(''); }} hitSlop={6} style={styles.picRemove}>
          <XIcon size={12} weight="bold" color={t.neutral[0]} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** .apply-reject / .apply-later / .apply-next: an icon and two lines (red, white or soft green). */
export function ApplyNote({ tone = 'later', Icon, title, children }) {
  const reject = tone === 'reject';
  return (
    <View style={[styles.note, reject ? styles.noteReject : tone === 'next' ? styles.noteNext : styles.noteLater]}>
      <Icon size={tone === 'later' ? 22 : 20} weight="fill" color={reject ? t.danger[700] : BRAND} style={styles.noteIcon} />
      <View style={styles.noteText}>
        <Text style={[styles.noteTitle, reject && styles.noteTitleReject]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export function NoteLine({ children }) {
  return <Text style={styles.noteLine}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.neutral[0] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  stepNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_SOFT },
  stepNumText: { fontSize: 13.5, lineHeight: 18, color: BRAND, ...font(700) },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { marginTop: 3, marginBottom: 2, fontSize: 17, lineHeight: 22.1, color: t.neutral[900], ...font(600) },
  headLine: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },
  headIcon: { marginTop: 5 },

  form: { gap: 20 },
  field: { gap: 6, minWidth: 0 },
  label: { fontSize: 13.5, lineHeight: 20, color: t.neutral[700], ...font(500) },
  req: { color: t.danger[600] },
  optional: { color: t.neutral[500], ...font(400) },
  input: {
    minHeight: 46, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: t.neutral[50], color: t.neutral[900], fontSize: 16, lineHeight: 22, ...font(400),
  },
  inputWhite: { backgroundColor: t.neutral[0] },
  inputFocus: { backgroundColor: t.neutral[0], borderColor: t.secondary[500] },
  inputError: { borderColor: t.danger[600] },
  error: { fontSize: 12.5, lineHeight: 18, color: t.danger[600], ...font(400) },
  hint: { fontSize: 12.5, lineHeight: 18.1, color: t.neutral[500], ...font(400) },

  info: { gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.neutral[50] },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  infoLabel: { flexShrink: 0, fontSize: 14, lineHeight: 20, color: t.neutral[500], ...font(400) },
  infoValue: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  infoValueText: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: t.neutral[900], textAlign: 'right', ...font(500) },
  inlineEdit: { paddingVertical: 4, fontSize: 13, lineHeight: 18, color: t.primary[700], ...font(600) },
  pressedText: { opacity: 0.6 },
  inlineField: { flexDirection: 'row', gap: 8 },
  inlineInput: { flex: 1, minWidth: 0 },
  inlineSave: { minHeight: 46, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  inlineSaveText: { fontSize: 14, lineHeight: 20, color: t.neutral[0], ...font(600) },
  primaryPressed: { backgroundColor: t.primary[700] },
  busy: { opacity: 0.65 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsError: { padding: 8, borderRadius: 12, backgroundColor: t.danger[50] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: t.neutral[100],
  },
  chipPressed: { backgroundColor: t.primary[50] },
  chipOn: { backgroundColor: t.primary[600] },
  chipText: { fontSize: 13.5, lineHeight: 20, color: t.neutral[600], ...font(500) },
  chipTextPressed: { color: t.primary[700] },
  chipTextOn: { color: t.neutral[0] },

  cards: { gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: t.neutral[50],
  },
  cardPressed: { backgroundColor: t.neutral[100] },
  cardOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  cardText: { flex: 1, minWidth: 0, gap: 4 },
  cardDesc: { fontSize: 13, lineHeight: 18.2, color: t.neutral[500], ...font(400) },
  payLogo: { height: 24, justifyContent: 'center' },
  cod: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 24 },
  codIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.success[600] },
  codLabel: { fontSize: 14.5, lineHeight: 20, color: t.neutral[900], ...font(700) },
  check: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: t.neutral[300],
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0],
  },
  checkOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  option: { gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_SOFT },
  optionIconOn: { backgroundColor: t.neutral[0] },
  optionLabel: { fontSize: 14.5, lineHeight: 18.9, color: t.neutral[900], ...font(600) },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.neutral[300],
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0],
  },
  radioOn: { borderColor: t.primary[600] },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: t.primary[600] },

  pic: { alignItems: 'center', gap: 6, minWidth: 0 },
  picWideWrap: { flex: 1, alignItems: 'stretch' },
  picBox: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  picSquare: { width: 84, height: 84, borderRadius: 14 },
  picWide: { height: 84, borderRadius: 14 },
  picPressed: { backgroundColor: t.secondary[50] },
  picImg: { width: '100%', height: '100%' },
  picImgContain: { backgroundColor: t.neutral[0] },
  picEmpty: { alignItems: 'center', gap: 4 },
  picEmptyText: { fontSize: 12.5, lineHeight: 17, color: t.neutral[500], ...font(500) },
  picRemove: {
    position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17, 24, 39, 0.62)',
  },
  picLabel: { fontSize: 12.5, lineHeight: 17, color: t.neutral[600], ...font(500) },
  papersBox: { height: 110, borderRadius: 14 },
  papersEmpty: { paddingHorizontal: 12 },
  papersText: { textAlign: 'center' },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  noteReject: { backgroundColor: t.danger[50] },
  noteLater: { backgroundColor: t.neutral[0] },
  noteNext: { backgroundColor: BRAND_SOFT },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, minWidth: 0 },
  noteTitle: { fontSize: 15, lineHeight: 21, color: t.neutral[900], ...font(600) },
  noteTitleReject: { color: t.danger[700] },
  noteLine: { marginTop: 2, fontSize: 13.5, lineHeight: 20.25, color: t.neutral[600], ...font(400) },
});
