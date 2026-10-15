import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../../theme';

/*
 * The pieces Shop Settings is built from on phones:
 *   SettingsCard   .seller-card in the Seller Center phone page (phone-app.css):
 *                  edge to edge over the page's 12px gutters, square, an 8px
 *                  grey band under it (`last` drops the band)
 *   CardHeader     .seller-card-header: icon + 15px title, a hairline under it
 *   SellerButton   .btn-seller-primary / .btn-seller-outline (a pill), full
 *                  width as the phone rules make them; `danger` = .btn-danger-outline
 */

export function SettingsCard({ last = false, style, children }) {
  return <View style={[styles.card, !last && styles.band, style]}>{children}</View>;
}

export function CardHeader({ Icon, title, color = t.neutral[900] }) {
  return (
    <View style={styles.header}>
      {Icon ? <Icon size={16} color={color} /> : null}
      <Text style={[styles.headerTitle, { color }]} accessibilityRole="header">{title}</Text>
    </View>
  );
}

export function SellerButton({
  label, Icon, primary = false, danger = false, onPress, disabled = false, busy = false, minHeight = 46, iconSize = 15, style,
}) {
  const color = primary ? '#fff' : danger ? t.danger[700] : t.neutral[700];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { minHeight },
        primary ? styles.primary : styles.outline,
        pressed && (primary ? styles.primaryPressed : danger ? styles.dangerPressed : styles.outlinePressed),
        (disabled || busy) && primary && styles.off,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size={15} color={color} /> : Icon ? <Icon size={iconSize} color={color} /> : null}
      <Text style={[styles.btnText, primary ? styles.primaryText : styles.outlineText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: -12, backgroundColor: t.neutral[0] },
  band: { borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  headerTitle: { flexShrink: 1, fontSize: 15, lineHeight: 19.5, ...font(500) },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 999,
  },
  primary: { backgroundColor: t.primary[600] },
  primaryPressed: { backgroundColor: t.primary[700] },
  outline: { borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0] },
  outlinePressed: { borderColor: t.primary[600] },
  dangerPressed: { borderColor: t.danger[200], backgroundColor: t.danger[50] },
  off: { opacity: 0.6 },
  btnText: { fontSize: 13.5, lineHeight: 18 },
  primaryText: { ...font(600) },
  outlineText: { ...font(500) },
});
