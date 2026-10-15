import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRightIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';

/*
 * The Me page's building blocks (web/src/pages/SellerMenu.jsx, SellerApp.css
 * .sme-*, SellerMobile.css .sm-badge). On phones every card runs the full
 * screen width, square, with an 8px grey band under it (phone-app.css), and
 * the cards stand 12px apart (.sh-body).
 */

/** A white section, edge to edge, with the grey band under it (`last`: none). */
export function MeCard({ last = false, style, children }) {
  return <View style={[meStyles.card, last && meStyles.cardLast, style]}>{children}</View>;
}

/** A titled list of rows (.sme-list). */
export function MeList({ title, last = false, children }) {
  return (
    <MeCard last={last} style={meStyles.list}>
      <Text style={meStyles.listTitle} accessibilityRole="header">{title}</Text>
      {children}
    </MeCard>
  );
}

/** The pink count (.sm-badge). */
export function MeBadge({ count }) {
  return (
    <View style={meStyles.badge}>
      <Text style={meStyles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/**
 * One row (.sme-row): a plain ink icon, the label, a pink count or a grey
 * hint (amber when `warn`: a part not set yet), and the chevron. A hairline
 * sits between rows (`first` has none).
 */
export function MeRow({
  icon: Icon, label, hint, badge = 0, warn = false, onPress, first = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [meStyles.row, !first && meStyles.rowLine, pressed && meStyles.pressed]}
    >
      <View style={meStyles.rowIcon}><Icon size={19} weight="fill" color={t.neutral[900]} /></View>
      <Text style={meStyles.rowLabel}>{label}</Text>
      {badge > 0 ? <MeBadge count={badge} /> : null}
      {hint != null && !badge ? <Text style={[meStyles.rowHint, warn && meStyles.rowWarn]}>{hint}</Text> : null}
      <CaretRightIcon size={16} color={t.neutral[300]} />
    </Pressable>
  );
}

export const meStyles = StyleSheet.create({
  // .sh-card on phones (phone-app.css): full width, square, an 8px band under it.
  card: {
    marginHorizontal: -12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 8,
    borderBottomColor: t.neutral[100],
  },
  cardLast: { borderBottomWidth: 0 },
  pressed: { backgroundColor: t.neutral[50] },

  // .sme-list: 14px above the title, 4px under the last row; rows bring their own 16px sides.
  list: { paddingTop: 14, paddingBottom: 4, paddingHorizontal: 0 },
  listTitle: {
    paddingHorizontal: 16, paddingBottom: 4, fontSize: 15.5, lineHeight: 19.4, ...font(500), color: t.neutral[900],
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16,
  },
  rowLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  rowIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[800] },
  rowHint: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  rowWarn: { color: t.warning[700] },

  badge: {
    minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent[500],
  },
  badgeText: { fontSize: 11.5, lineHeight: 20, ...font(700), color: '#fff', textAlign: 'center' },
});
