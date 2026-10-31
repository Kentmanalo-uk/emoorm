import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatTextIcon, ImageSquareIcon, ImagesIcon, StarIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { ShopGradient } from '../../shop/shopTheme';

/*
 * Small pieces the Shop home builder shares (web SellerShopHome.css):
 * the coloured kind tile, the round-cornered icon button, a field label
 * and the text field look.
 */

export const KIND_ICON = { banner: ImageSquareIcon, spotlight: StarIcon, gallery: ImagesIcon, message: ChatTextIcon };

// .shb-sec.is-<kind> .shb-sec-icon: linear-gradient(135deg, a, b).
const KIND_GRADIENT = themed(() => ({
  banner: ['#38bdf8', t.info[600]],
  spotlight: [t.warning[400], '#ea580c'],
  gallery: [t.accent[300], '#c026d3'],
  message: [t.success[400], t.primary[600]],
}));

/** The kind's white icon on its gradient tile (36 × 36 in a section head, 40 × 40 in the picker). */
export function KindIcon({ kind, size = 36, radius = 11, iconSize = 18 }) {
  const Icon = KIND_ICON[kind];
  const [a, b] = KIND_GRADIENT[kind] || KIND_GRADIENT.message;
  return (
    <View style={[styles.kindIcon, { width: size, height: size, borderRadius: radius }]}>
      <ShopGradient angle={135} stops={[[a, 0], [b, 1]]} />
      {Icon ? <Icon size={iconSize} weight="fill" color="#fff" /> : null}
    </View>
  );
}

/** .shb-icon-btn: 32 × 32, grey icon, faded when it can't be used, red when `danger`. */
export function ShbIconButton({ Icon, size = 15, onPress, disabled = false, danger = false, label, weight = 'regular' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed, disabled && styles.iconBtnOff]}
    >
      <Icon size={size} weight={weight} color={danger ? t.danger[600] : t.neutral[600]} />
    </Pressable>
  );
}

/** .shb-label with its optional grey <em>. */
export function ShbLabel({ children, em }) {
  return (
    <Text style={shb.label}>
      {children}
      {em ? <Text style={shb.labelEm}>{` ${em}`}</Text> : null}
    </Text>
  );
}

export const shb = themed(() => StyleSheet.create({
  field: { gap: 8, paddingTop: 12 },
  label: { fontSize: 13, lineHeight: 18, ...font(600), color: t.neutral[800] },
  labelEm: { ...font(500), color: t.neutral[500] },
  input: {
    minHeight: 42, paddingVertical: 9, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 11, backgroundColor: t.neutral[0],
    fontSize: 14, ...font(400), color: t.neutral[900],
  },
  inputFocus: { borderColor: t.primary[500] },
  hint: { fontSize: 12.5, lineHeight: 18, ...font(400), color: t.neutral[500] },
  thumbImg: { width: 42, height: 42, flexShrink: 0, overflow: 'hidden', borderRadius: 8, backgroundColor: t.neutral[100] },
  pickedName: { flex: 1, minWidth: 0 },
  pickedNameText: { fontSize: 13.5, lineHeight: 19, ...font(500), color: t.neutral[900] },
  pickedPrice: { fontSize: 12.5, lineHeight: 17, ...font(600), color: t.primary[700] },
}));

const styles = themed(() => StyleSheet.create({
  kindIcon: { alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  iconBtnPressed: { backgroundColor: t.neutral[100] },
  iconBtnOff: { opacity: 0.3 },
  gridRow: { flexDirection: 'row', alignItems: 'flex-start' },
  gridRowStretch: { alignItems: 'stretch' },
  gridCell: { flex: 1, minWidth: 0 },
}));

/**
 * Two across with a gap, like the website's phone grids
 * (grid-template-columns: repeat(2, minmax(0, 1fr))): a lone last item keeps
 * half the row. `stretch`: the two in a row are as tall as each other
 * (each child then has flex: 1).
 */
export function Grid2({ gap, stretch = false, children }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.gridRow, stretch && styles.gridRowStretch, { gap }]}>
          {row.map((item, i) => <View key={item.key ?? i} style={styles.gridCell}>{item}</View>)}
          {row.length === 1 ? <View style={styles.gridCell} /> : null}
        </View>
      ))}
    </View>
  );
}
