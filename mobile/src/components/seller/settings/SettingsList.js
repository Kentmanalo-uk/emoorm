import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { sellerHref } from '../sellerRoutes';

/*
 * Phones: a settings page broken into its parts, one row each showing what
 * is set now; each row opens a page that edits just that part (web
 * src/components/seller/SettingsList.jsx + SettingsList.css, .scm-setlist).
 * In a Seller Center page it runs edge to edge with the 8px grey band under
 * it, as phone-app.css draws .scm-setlist (`last` drops the band).
 *
 * <SettingsList label="Shop profile">
 *   <SettingsRow to="/seller/store/about" icon={StorefrontIcon} label="About" value="…" missing tag="Needed to sell" />
 * </SettingsList>
 * Without `to` a row only shows its value (something that cannot be changed here).
 */
export function SettingsList({ label, last = false, children }) {
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <View style={[styles.list, !last && styles.band]} accessibilityLabel={label}>
      {rows.map((row, i) => (
        <View key={row.key ?? i} style={i > 0 ? styles.divider : null}>{row}</View>
      ))}
    </View>
  );
}

/** A colour dot for a row's value (.scm-swatch), e.g. the shop's two colours. */
export function Swatch({ color }) {
  return <View style={[styles.swatch, { backgroundColor: color }]} />;
}

export function SettingsRow({ to, icon: Icon, label, value, missing = false, tag = null }) {
  const router = useRouter();
  const body = (
    <>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Icon ? <Icon size={20} weight="fill" color={t.neutral[900]} /> : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text style={[styles.value, missing && styles.valueMissing]} numberOfLines={1}>{value}</Text>
        ) : (
          <View style={styles.valueRow}>{value}</View>
        )}
      </View>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      {to ? <CaretRightIcon size={16} color={t.neutral[300]} /> : null}
    </>
  );
  if (!to) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(sellerHref(to))}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -12, overflow: 'hidden', backgroundColor: t.neutral[0] },
  band: { borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  divider: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64,
    paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 16,
  },
  rowPressed: { backgroundColor: t.neutral[50] },
  icon: { width: 24, height: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 15, lineHeight: 20, ...font(500), color: t.neutral[900] },
  value: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[500] },
  valueMissing: { color: t.warning[700] },
  valueRow: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  swatch: {
    width: 12, height: 12, marginRight: 4, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  tag: {
    flexShrink: 0, paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden', borderRadius: 999,
    backgroundColor: t.accent[50], color: t.accent[700], fontSize: 11.5, lineHeight: 15, ...font(500),
  },
});
