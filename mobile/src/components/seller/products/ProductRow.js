import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DotsThreeIcon, PackageIcon, PencilSimpleIcon, PlusIcon, WarningCircleIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { isOpen as windowOpen, isTodayProduct, windowState } from '../../../lib/availability';
import { isStockless, priceUnit, productKind } from '../productKinds';
import LoadingSkeleton from '../../LoadingSkeleton';
import {
  BADGE_TONES, hasStockPerChoice, itemsLabel, packageIssue, priceText, statusOf, stockLevel, stockWords,
} from './productRules';
import { useSellerProductPeek } from '../../peek/SellerProductPeek';

/*
 * One product on My products (web/src/pages/SellerProducts.jsx, the table
 * row as phones show it: SellerProducts.css + layout/SellerMobile.css
 * "Products"). A white 16px card, edge to edge:
 *
 *   [photo] Name (two lines at most)
 *   [     ] ₱200.00 / head            Live
 *   [     ] Fruits                 Stock 5
 *   [ Edit ] [ + Add stock ] [ ⋯ ]
 *   (the admin's note, when suspended or archived)
 *
 * Holding the photo and name opens its preview with every action
 * (components/peek/SellerProductPeek).
 */
export default function ProductRow({
  product, onEdit, onAddStock, onPostToday, onMore, onToggleVisibility, onView, onDelete,
}) {
  const s = statusOf(product);
  const kind = productKind(product);
  const words = stockWords(product);
  const today = isTodayProduct(product);
  const stockless = isStockless(product);
  const showNote = Boolean(product.moderationNote)
    && (product.status === 'SUSPENDED' || product.status === 'ARCHIVED');
  const unit = priceUnit(product);

  // The second action: post today's batch, edit per-choice stock, or add stock.
  let second = null;
  if (today) second = { label: 'Post today', onPress: () => onPostToday(product) };
  else if (stockless) second = null;
  else if (hasStockPerChoice(product)) second = { label: 'Edit stock', onPress: () => onEdit(product) };
  else second = { label: words.add, onPress: () => onAddStock(product) };

  const peek = useSellerProductPeek()(product, {
    onEdit, second, onToggleVisibility, onView, onDelete,
  });

  return (
    <View style={styles.card}>
      <Pressable style={styles.top} {...peek} accessibilityLabel={product.name}>
        <Thumb src={product.images?.[0]} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <View style={styles.line}>
            <Text style={styles.price} numberOfLines={1}>
              {priceText(product.price)}
              {unit ? <Text style={styles.priceUnit}>{unit}</Text> : null}
            </Text>
            <Badge tone={s.tone} Icon={s.Icon} label={s.label} />
          </View>
          <View style={styles.line}>
            <Text style={styles.cat} numberOfLines={1}>{product.category?.name || '—'}</Text>
            <Stock product={product} kind={kind} />
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${product.name}`}
          onPress={() => onEdit(product)}
          style={({ pressed }) => [styles.btn, styles.btnWide, pressed && styles.btnPressed]}
        >
          <PencilSimpleIcon size={16} color={t.neutral[800]} />
          <Text style={styles.btnText} numberOfLines={1}>Edit</Text>
        </Pressable>
        {second ? (
          <Pressable
            accessibilityRole="button"
            onPress={second.onPress}
            style={({ pressed }) => [styles.btn, styles.btnWide, pressed && styles.btnPressed]}
          >
            <PlusIcon size={16} color={t.neutral[800]} />
            <Text style={styles.btnText} numberOfLines={1}>{second.label}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${product.name}`}
          onPress={() => onMore(product)}
          style={({ pressed }) => [styles.btn, styles.btnMore, pressed && styles.btnPressed]}
        >
          <DotsThreeIcon size={20} weight="bold" color={t.neutral[800]} />
        </Pressable>
      </View>

      {showNote ? (
        <View style={styles.note}>
          <WarningCircleIcon size={14} color={t.danger[700]} style={styles.noteIcon} />
          <Text style={styles.noteText}>
            <Text style={styles.noteStrong}>{product.status === 'SUSPENDED' ? 'Suspended by admin: ' : 'Archived by admin: '}</Text>
            {product.moderationNote}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// The 64px photo; a grey tile with a parcel when there is none (.product-thumb--placeholder).
function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) || src : null;
  if (!uri || failed) {
    return (
      <View style={[styles.thumb, styles.thumbEmpty]}>
        <PackageIcon size={16} color={t.neutral[400]} />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" onError={() => setFailed(true)} />;
}

/** A .seller-badge pill. small: .product-stock-badge (11px). */
export function Badge({ tone, Icon, label, small = false }) {
  return (
    <View style={[styles.badge, small && styles.badgeSmall, { backgroundColor: tone.bg }]}>
      {Icon ? <Icon size={12} color={tone.fg} /> : null}
      <Text style={[styles.badgeText, small && styles.badgeTextSmall, { color: tone.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// Read on use, so the badges follow the mode.
const KIND_TONE = { get bg() { return t.primary[50]; }, get fg() { return t.primary[700]; } };
const TODAY_TONE = { get bg() { return t.accent[50]; }, get fg() { return t.accent[700]; } };

// The stock cell: what the product has left, in its kind's words.
function Stock({ product, kind }) {
  if (isTodayProduct(product)) {
    const w = product.availability;
    const state = windowState(w);
    return (
      <View style={styles.stock}>
        <Badge tone={TODAY_TONE} label="Available Today" />
        <Text style={styles.stockLabel}>
          {windowOpen(w) ? `${product.stock} left` : state.tone === 'soon' ? state.text : 'Not posted now'}
        </Text>
      </View>
    );
  }
  // Paluto: cooked when ordered, so no stock to count or add.
  if (isStockless(product)) {
    return (
      <View style={styles.stock}>
        <Badge tone={KIND_TONE} label="Made to order" />
      </View>
    );
  }
  const level = stockLevel(product);
  const valueStyle = [styles.stockValue, level === 'low' && styles.valueLow, level === 'out' && styles.valueOut];
  return (
    <View style={styles.stock}>
      {kind === 'PACKAGE' ? (
        <>
          <Badge tone={KIND_TONE} label="Package" />
          <Text style={styles.stockNote}>{itemsLabel(product)}</Text>
        </>
      ) : null}
      {kind === 'PACKAGE' && packageIssue(product) ? (
        <Badge small tone={BADGE_TONES.pending} label="Check its items" />
      ) : null}
      {kind === 'LIVESTOCK' ? (
        <Text style={valueStyle}>
          {product.stock} <Text style={styles.stockNoteIn}>{Number(product.stock) === 1 ? 'head' : 'heads'}</Text>
        </Text>
      ) : kind === 'PACKAGE' ? (
        <Text style={valueStyle}>
          {product.stock} <Text style={styles.stockNoteIn}>available</Text>
        </Text>
      ) : (
        <Text style={styles.stockLabel}>
          Stock <Text style={valueStyle}>{product.stock}</Text>
        </Text>
      )}
      {level === 'out' ? (
        <Badge small tone={BADGE_TONES.cancelled} label={kind === 'REGULAR' ? 'Out of stock' : 'Sold out'} />
      ) : null}
      {level === 'low' ? <Badge small tone={BADGE_TONES.pending} label="Low stock" /> : null}
    </View>
  );
}

/** The list while it loads: cards in the product row's shape. */
export function ProductRowSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Loading products">
      <View style={styles.top}>
        <LoadingSkeleton width={64} height={64} borderRadius={12} />
        <View style={[styles.info, styles.skelInfo]}>
          <LoadingSkeleton width="70%" height={15} />
          <LoadingSkeleton width="40%" height={14} />
          <LoadingSkeleton width="55%" height={12} />
        </View>
      </View>
      <View style={styles.actions}>
        <LoadingSkeleton height={40} borderRadius={12} style={styles.btnWide} />
        <LoadingSkeleton height={40} borderRadius={12} style={styles.btnWide} />
        <LoadingSkeleton width={44} height={40} borderRadius={12} />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .products-table tbody tr: padding 14, 16px corners, white; the card runs
  // edge to edge (the .seller-card around the list cancels the 12px gutter).
  card: {
    marginHorizontal: -12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: t.neutral[0],
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: t.neutral[100] },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 2 },
  skelInfo: { gap: 8, paddingTop: 2 },
  name: { fontSize: 15, lineHeight: 20.25, color: t.neutral[900], ...font(500) },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  price: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(600) },
  priceUnit: { fontSize: 12, color: t.neutral[500], ...font(400) },
  cat: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999,
  },
  badgeSmall: { paddingVertical: 2, paddingHorizontal: 8 },
  badgeText: { fontSize: 11.5, lineHeight: 18.4, letterSpacing: 0.1, ...font(600) },
  badgeTextSmall: { fontSize: 11, lineHeight: 17.6 },

  // .product-stock on phones: right-aligned beside the category.
  stock: {
    flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
  },
  stockLabel: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  stockValue: { fontSize: 13, lineHeight: 20, color: t.neutral[900], ...font(600) },
  valueLow: { color: t.warning[700] },
  valueOut: { color: t.danger[700] },
  stockNote: { fontSize: 12.5, color: t.neutral[500], ...font(400) },
  // The word after a count ("3 heads", "1 available"): the count's size, plain.
  stockNoteIn: { fontSize: 13, color: t.neutral[500], ...font(400) },

  // .pm-actions: [Edit] [second] [⋯ 44px], 8px apart.
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, paddingHorizontal: 8,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  btnWide: { flex: 1, minWidth: 0 },
  btnMore: { width: 44, paddingHorizontal: 0 },
  btnPressed: { backgroundColor: t.neutral[50] },
  btnText: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: t.neutral[800], ...font(500) },

  // .products-moderation-note
  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: t.danger[100], backgroundColor: t.danger[50],
  },
  noteIcon: { marginTop: 3 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18.75, color: t.danger[700], ...font(400) },
  noteStrong: { ...font(700) },
}));
