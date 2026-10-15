import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SlidersHorizontalIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';

/*
 * The Seller Center's phone chips (web layout/SellerMobile.css .scm-chips,
 * .scm-chip, .scm-chip--more, .scm-chip-dot): pills in a row, the chosen one
 * green. A page restyles them through `style` / `chipStyle` where its own
 * CSS does (e.g. SellerProducts.css .products-tabs).
 *
 * <SellerChips
 *   chips={[{ key: 'all', label: 'All' }, { key: 'REQUESTED', label: 'To review · 2' }]}
 *   active={tab} onChange={setTab}
 *   more={{ label: 'More', on: false, onPress: () => setOpen(true) }}   (optional, the sliders chip at the end)
 *   scroll                                                              (optional, scrolls sideways)
 * />
 * SellerChip is one chip on its own.
 */
export function SellerChip({ label, on = false, onPress, dot = false, Icon, more = false, style, textStyle, children }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, more && styles.more, on && styles.on, style]}
    >
      {Icon ? <Icon size={16} weight="bold" color={on ? '#fff' : t.neutral[700]} /> : null}
      {children || (label != null ? <Text style={[styles.text, on && styles.textOn, textStyle]} numberOfLines={1}>{label}</Text> : null)}
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export default function SellerChips({ chips = [], active, onChange, more, scroll = false, style, chipStyle, textStyle }) {
  const items = (
    <>
      {chips.map((c) => (
        <SellerChip
          key={String(c.key)}
          label={c.label}
          dot={c.dot}
          on={active === c.key}
          onPress={() => onChange?.(c.key)}
          style={chipStyle}
          textStyle={textStyle}
        />
      ))}
      {more ? (
        <SellerChip
          more
          Icon={more.Icon === undefined ? SlidersHorizontalIcon : more.Icon}
          label={more.label}
          on={Boolean(more.on)}
          dot={more.dot}
          onPress={more.onPress}
          style={[!scroll && styles.moreEnd, chipStyle]}
          textStyle={textStyle}
        />
      ) : null}
    </>
  );
  if (scroll) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={[styles.scroll, style]} contentContainerStyle={styles.row}>
        {items}
      </ScrollView>
    );
  }
  return <View style={[styles.row, styles.wrap, style]}>{items}</View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  scroll: { flexGrow: 0, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 16,
    borderRadius: 999, backgroundColor: t.neutral[0],
  },
  more: { paddingHorizontal: 14 },
  moreEnd: { marginLeft: 'auto' },
  on: { backgroundColor: t.primary[600] },
  text: { fontSize: 14, lineHeight: 20, color: t.neutral[700], ...font(400) },
  textOn: { color: '#fff' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent[500] },
});
