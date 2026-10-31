import { useState } from 'react';
import {
  Image, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  CheckIcon, StorefrontIcon, TrashIcon, UploadSimpleIcon, WarningCircleIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import Sheet from '../../Sheet';
import ProfileAddressPicker from '../../profile/ProfileAddressPicker';
import { ShopGradient, mix } from '../../shop/shopTheme';
import { hexOf, joinPickup, paintColor, splitPickup } from './storeLib';

/*
 * The Shop profile's fields as phones draw them (web/src/pages/SellerStore.jsx
 * and SellerStore.css, the `@media (max-width: 768px)` block; SellerDashboard.css
 * .form-input / .btn-seller-outline; components/seller/PickupAddressField.jsx).
 */

const ELEV_CARD = [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(149, 157, 165, 0.06)' }];
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: "'Courier New', monospace" });

/** .form-group: the label (13px, 600 on phones), the control, then any hint. */
export function Field({ label, required = false, Icon, children, style }) {
  return (
    <View style={[styles.field, style]}>
      {label ? (
        <View style={styles.labelRow}>
          {Icon ? <Icon size={14} color={t.neutral[700]} /> : null}
          <Text style={styles.label}>
            {label}
            {required ? <Text style={styles.required}> *</Text> : null}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** .form-input (and .form-textarea with `multiline`): a green border while typing. */
export function FormInput({ style, multiline = false, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.neutral[500]}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[styles.input, multiline && styles.textarea, focused && styles.inputFocus, style]}
    />
  );
}

/** "Store is Active": the checkbox row (.form-toggle), with the warning while off. */
export function ActiveToggle({ value, onChange }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.toggle}
    >
      <View style={[styles.box, value && styles.boxOn]}>
        {value ? <CheckIcon size={14} weight="bold" color="#fff" /> : null}
      </View>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLine}>
          Store is <Text style={styles.strong}>{value ? 'Active' : 'Inactive'}</Text>
        </Text>
        {!value ? (
          <View style={styles.warn}>
            <WarningCircleIcon size={14} color={t.warning[500]} style={styles.warnIcon} />
            <Text style={styles.warnText}>Buyers won&apos;t see your store or products</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** .btn-seller-outline, full width on phones (Reset to Emoorm colors). */
export function OutlineButton({ label, Icon, onPress, danger = false, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.outline, pressed && styles.outlinePressed, disabled && styles.off, style]}
    >
      {Icon ? <Icon size={14} color={danger ? t.danger[700] : t.neutral[700]} /> : null}
      <Text style={[styles.outlineText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One branding row: its label and hint, then the uploader (ImageUploader):
 * the picture with Replace and Remove, or a dashed "Upload image" box.
 * shape: 'circle' (the logo) or 'banner'.
 */
export function ImageUploader({ title, hint, value, onPick, onRemove, uploading = false, shape = 'circle' }) {
  const src = value ? resolveImg(value) : null;
  const banner = shape === 'banner';
  return (
    <View style={styles.brandRow}>
      <View>
        <Text style={styles.brandTitle}>{title}</Text>
        <Text style={styles.brandHint}>{hint}</Text>
      </View>
      {src ? (
        <View style={styles.uploader}>
          <View style={[styles.preview, banner ? styles.previewBanner : styles.previewCircle]}>
            <Image source={{ uri: src }} style={styles.previewImg} resizeMode="cover" />
          </View>
          <View style={styles.actions}>
            <OutlineButton label="Replace" Icon={UploadSimpleIcon} onPress={onPick} disabled={uploading} style={styles.actionBtn} />
            <OutlineButton label="Remove" Icon={TrashIcon} danger onPress={onRemove} style={styles.actionBtn} />
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onPick}
          disabled={uploading}
          style={({ pressed }) => [styles.empty, banner && styles.emptyBanner, pressed && styles.emptyPressed]}
        >
          {({ pressed }) => (
            <>
              <UploadSimpleIcon size={18} color={pressed ? t.primary[600] : t.neutral[600]} />
              <Text style={[styles.emptyText, pressed && styles.emptyTextPressed]}>{uploading ? 'Uploading…' : 'Upload image'}</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

// The colours the picker offers: the website's own colour ramps (tokens).
const RAMPS = ['primary', 'secondary', 'success', 'teal', 'sky', 'info', 'indigo', 'violet', 'accent', 'danger', 'orange', 'warning', 'neutral'];
const STOPS = [300, 400, 500, 600, 700, 800, 900];
const PALETTE = RAMPS.map((ramp) => STOPS.map((s) => t[ramp]?.[s]).filter(Boolean)).filter((row) => row.length);

/**
 * A colour (ColorPicker): the label and hint with a swatch, then the colour
 * button and its hex code. Phones have no colour input, so the button opens
 * a sheet of the website's colours; the hex field takes any exact colour.
 */
export function ColorPicker({ label, hint, value, onChange }) {
  const [open, setOpen] = useState(false);
  const shown = hexOf(value);
  // A saved `var(--t-…)` default shows as the colour it paints.
  const text = /^var\(/i.test(String(value || '')) ? shown : String(value || '');
  return (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <View style={styles.pickerCopy}>
          <Text style={styles.pickerTitle}>{label}</Text>
          {hint ? <Text style={styles.pickerHint}>{hint}</Text> : null}
        </View>
        <View style={[styles.swatch, { backgroundColor: shown }]} />
      </View>
      <View style={styles.pickerInputs}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} colour`}
          onPress={() => setOpen(true)}
          style={styles.colorBtn}
        >
          <View style={[styles.colorFill, { backgroundColor: shown }]} />
        </Pressable>
        <FormInput
          value={text.toUpperCase()}
          onChangeText={(v) => onChange(v)}
          placeholder="#047857"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={styles.hex}
        />
      </View>
      <Sheet variant="seller" open={open} title={label} onClose={() => setOpen(false)}>
        <View style={styles.palette}>
          {PALETTE.map((row, r) => (
            <View key={r} style={styles.paletteRow}>
              {row.map((c) => {
                const on = c.toLowerCase() === shown.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={c}
                    accessibilityState={{ selected: on }}
                    onPress={() => { onChange(c.toUpperCase()); setOpen(false); }}
                    style={[styles.dot, on && styles.dotOn]}
                  >
                    <View style={[styles.dotFill, { backgroundColor: c }]}>
                      {on ? <CheckIcon size={16} weight="bold" color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/** The shop header in the shop's colours (ThemePreview): banner, logo, name, buttons, badges. */
export function ThemePreview({ name, logo, banner, primary, secondary }) {
  const p = paintColor(primary, t.primary[600]);
  const s = paintColor(secondary, t.warning[500]);
  return (
    <View style={styles.tp}>
      <View style={styles.tpBanner}>
        {banner ? (
          <Image source={{ uri: resolveImg(banner) }} style={styles.previewImg} resizeMode="cover" />
        ) : (
          <>
            <ShopGradient angle={120} stops={[[p, 0], [s, 1]]} />
            <Text style={styles.tpBannerText}>BANNER</Text>
          </>
        )}
      </View>
      <View style={styles.tpBody}>
        <View style={styles.tpLogo}>
          {logo ? <Image source={{ uri: resolveImg(logo) }} style={styles.previewImg} resizeMode="cover" /> : <StorefrontIcon size={22} color={t.neutral[500]} />}
        </View>
        <View style={styles.tpInfo}>
          <Text style={styles.tpName} numberOfLines={1}>{name}</Text>
          <View style={styles.tpRow}>
            <Text style={[styles.tpBtn, { backgroundColor: p, color: t.onBrand }]}>Follow</Text>
            <Text style={[styles.tpBtn, styles.tpGhost, { borderColor: p, color: p }]}>Message</Text>
          </View>
          <View style={styles.tpRow}>
            <Text style={[styles.tpBadge, { backgroundColor: mix(p, 0.12, '#fff'), color: p }]}>Featured</Text>
            <Text style={[styles.tpBadge, { backgroundColor: mix(s, 0.15, '#fff'), color: mix(s, 0.55, '#000') }]}>Best Seller</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * The pickup address picked like every other address in the app (the town
 * and barangay from the lists, then the street or a landmark) instead of
 * typed (PickupAddressField). The address text changes only when the seller
 * changes something; `onChange(text, parts)` gets the new line and its parts.
 */
export function PickupAddressField({ value, shopTown, municipalities, onChange }) {
  const [parts, setParts] = useState(() => splitPickup(value, shopTown));
  const handleChange = (next) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    // The picker settles the province and the codes by itself; only the
    // seller's own changes rewrite the address.
    const moved = ['municipalityName', 'barangay', 'street']
      .some((k) => String(merged[k] || '') !== String(parts[k] || ''));
    if (moved) onChange(joinPickup(merged), merged);
  };
  return (
    <ProfileAddressPicker
      value={parts}
      onChange={handleChange}
      dbMunicipalities={municipalities}
      streetLabel="Street, building or landmark"
      streetPlaceholder="e.g. Stall 4, public market"
    />
  );
}

const styles = themed(() => StyleSheet.create({
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(600) },
  required: { color: t.danger[600] },
  input: {
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 10,
    backgroundColor: t.neutral[0],
    color: t.neutral[900],
    fontSize: 14,
    ...font(400),
  },
  textarea: { height: 106, paddingTop: 10 },
  inputFocus: { borderColor: t.primary[600] },

  toggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: t.neutral[50],
  },
  box: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: t.neutral[500], backgroundColor: t.neutral[0],
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  toggleText: { flex: 1, minWidth: 0 },
  toggleLine: { fontSize: 14, lineHeight: 20, color: t.neutral[900], ...font(400) },
  strong: { ...font(700) },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4 },
  warnIcon: { marginTop: 1 },
  warnText: { flex: 1, fontSize: 12, lineHeight: 16.8, color: t.warning[500], ...font(400) },

  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  outlinePressed: { borderColor: t.primary[600] },
  outlineText: { fontSize: 13.5, lineHeight: 18, color: t.neutral[700], ...font(500) },
  dangerText: { color: t.danger[700] },
  off: { opacity: 0.6 },

  brandRow: { gap: 10, paddingVertical: 10 },
  brandTitle: { marginBottom: 4, fontSize: 13.5, lineHeight: 21.6, color: t.neutral[900], ...font(700) },
  brandHint: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  uploader: { gap: 10 },
  preview: { overflow: 'hidden', backgroundColor: t.neutral[50], boxShadow: ELEV_CARD },
  previewCircle: { width: 96, height: 96, borderRadius: 48 },
  previewBanner: { width: '100%', aspectRatio: 4, borderRadius: 12 },
  previewImg: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { minHeight: 40, alignSelf: 'flex-start' },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.neutral[300],
    borderRadius: 12,
    backgroundColor: t.neutral[50],
  },
  emptyBanner: { minHeight: 96, paddingVertical: 24, paddingHorizontal: 16 },
  emptyPressed: { borderColor: t.primary[600], backgroundColor: t.success[50] },
  emptyText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[600], ...font(400) },
  emptyTextPressed: { color: t.primary[600] },

  picker: {
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: t.neutral[50],
    boxShadow: ELEV_CARD,
  },
  pickerHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  pickerCopy: { flex: 1, minWidth: 0 },
  pickerTitle: { marginBottom: 2, fontSize: 13, lineHeight: 20.8, color: t.neutral[900], ...font(700) },
  pickerHint: { fontSize: 11.5, lineHeight: 18.4, color: t.neutral[500], ...font(400) },
  swatch: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, inset: true, color: t.neutral[0] }],
  },
  pickerInputs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorBtn: {
    flexShrink: 0,
    width: 48,
    height: 44,
    padding: 4,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 8,
    backgroundColor: t.neutral[0],
  },
  colorFill: { flex: 1, borderRadius: 3 },
  hex: { flex: 1, minWidth: 0, borderRadius: 8, fontFamily: MONO, fontWeight: '400' },
  palette: { gap: 10, paddingBottom: 8 },
  paletteRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dot: { width: 40, height: 40, padding: 2, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  dotOn: { borderColor: t.neutral[900] },
  dotFill: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  tp: { overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[0], boxShadow: ELEV_CARD },
  tpBanner: { aspectRatio: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tpBannerText: { fontSize: 12, lineHeight: 19.2, letterSpacing: 1, color: 'rgba(255, 255, 255, 0.85)', ...font(400) },
  tpBody: { flexDirection: 'row', gap: 12, marginTop: -28, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 16 },
  tpLogo: {
    flexShrink: 0,
    width: 56,
    height: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: t.neutral[0],
    borderRadius: 28,
    backgroundColor: t.neutral[0],
    boxShadow: ELEV_CARD,
  },
  tpInfo: { flex: 1, minWidth: 0, gap: 8, paddingTop: 32 },
  tpName: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(700) },
  tpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tpBtn: {
    overflow: 'hidden', paddingVertical: 5, paddingHorizontal: 14, borderRadius: 999, fontSize: 12, lineHeight: 14.4, ...font(500),
  },
  tpGhost: { paddingVertical: 4, paddingHorizontal: 13, borderWidth: 1 },
  tpBadge: {
    overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, fontSize: 11, lineHeight: 17.6, ...font(400),
  },
}));
