import { Children } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { font, t, themed } from '../../../theme';

/*
 * A labelled field in a Seller Center sheet (web SellerMobile.css .scm-field
 * + SellerApp.css .smk-field): a 13px grey label, 6px, then the control;
 * 12px under each field. `fieldStyles.input` is the 46px white input with a
 * light border and 12px corners (.scm-field input / .ui-select).
 */
export default function MkField({ label, children, style }) {
  return (
    <View style={[fieldStyles.field, style]}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** Two fields side by side (ShopVouchers.css .svc-row: two equal columns, 10px apart). */
export function MkFieldRow({ children }) {
  const items = Children.toArray(children);
  return (
    <View style={fieldStyles.row}>
      {items.map((child, i) => <View key={child.key ?? i} style={fieldStyles.half}>{child}</View>)}
      {items.length === 1 ? <View style={fieldStyles.half} /> : null}
    </View>
  );
}

export const fieldStyles = themed(() => StyleSheet.create({
  field: { minWidth: 0, gap: 6, marginBottom: 12 },
  label: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },
  input: {
    width: '100%', minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 16, ...font(400),
  },
  // The E-MOORM select inside a field: the input's look.
  select: {
    minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  selectText: { fontSize: 16, lineHeight: 20.8, color: t.neutral[900] },
  row: { flexDirection: 'row', gap: 10 },
  // Each column (a lone field keeps half the width, as in a 1fr 1fr grid).
  half: { flex: 1, minWidth: 0 },
  // .smk-sheet-note
  note: { marginTop: 4, marginBottom: 12, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
}));
