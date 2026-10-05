import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../theme';
import { CartRoundCheck } from './CartStoreGroup';

/*
 * The phone cart's checkout bar above the tab bar (web Cart.jsx .cart-m-bar):
 * an optional note line, then All · total and delivery fee · Check out (n).
 */
export default function CartBar({
  note, noteBad, allSelected, onToggleAll, totalLabel, feeLabel, offLabel, checkoutLabel, disabled, onCheckout,
}) {
  return (
    <View style={styles.bar}>
      {note ? <Text style={[styles.note, noteBad && styles.noteBad]}>{note}</Text> : null}
      <View style={styles.row}>
        <View style={styles.all}>
          <CartRoundCheck checked={allSelected} onPress={onToggleAll} label="Select all items" />
          <Text style={styles.allText}>All</Text>
        </View>
        <View style={styles.total}>
          <Text style={styles.totalStrong} numberOfLines={1}>{totalLabel}</Text>
          <Text style={styles.totalSpan} numberOfLines={1}>{feeLabel}</Text>
          {offLabel ? <Text style={[styles.totalSpan, styles.off]}>{offLabel}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(disabled) }}
          disabled={disabled}
          onPress={onCheckout}
          style={[styles.cta, disabled && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>{checkoutLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // On the website the bar's bottom 6px sit under the tab bar (the bar is
  // fixed 68px up, the 74px tab bar covers it): tuck it under the same way.
  bar: {
    marginBottom: -6,
    borderTopWidth: 1,
    borderTopColor: t.neutral[200],
    backgroundColor: t.neutral[0],
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 115,
  },
  note: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: t.primary[50],
    color: t.primary[800],
    fontSize: 12.5,
    lineHeight: 20,
    ...font(400),
    textAlign: 'center',
  },
  noteBad: { backgroundColor: t.danger[50], color: t.danger[700] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 8 },
  all: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  allText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
  total: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  totalStrong: { fontSize: 18, lineHeight: 22.5, ...font(500), color: t.primary[700] },
  totalSpan: { fontSize: 12, lineHeight: 15, ...font(400), color: t.neutral[500] },
  off: { color: t.accent[600] },
  cta: {
    flexShrink: 0,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: t.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontSize: 15, lineHeight: 18, ...font(500), color: t.neutral[0] },
});
