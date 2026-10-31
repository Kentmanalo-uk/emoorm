import { useMemo, useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  DotsThreeIcon, ForkKnifeIcon, MagnifyingGlassIcon, PlusIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { saleInfo } from '../../../lib/variantPricing';
import { isOpen, momentLabel, whenLabel } from '../../../lib/availability';
import Sheet, { SheetButton, SheetOption } from '../../Sheet';
import { firstImage } from './WindowCard';

/*
 * The Menu tab of Today's menu (web/src/pages/SellerToday.jsx menuRow,
 * AddFromProducts; SellerToday.css .stw-item, .stw-pick at phone size): one
 * row per menu item (photo, name, price, one status; Post and ⋯), the ⋯
 * sheet (Edit item, Remove from menu), and "Add from My products", a
 * searchable list that asks first in the same sheet.
 */

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ms = (v) => new Date(v).getTime();

/** "Taking orders until 2:00 PM", "Next: Tomorrow, 10:00 AM" or "Not taking orders yet" (web menuStatus). */
export const menuStatus = (item, now = Date.now()) => {
  const w = item.window;
  if (w && isOpen(w, now)) {
    if ((w.remaining ?? 1) <= 0) return { tone: 'out', text: 'Sold out' };
    return { tone: 'live', text: `Taking orders until ${momentLabel(w.ordersCloseAt, now)}` };
  }
  if (w && w.status === 'SCHEDULED' && ms(w.ordersCloseAt) > now) return { tone: 'soon', text: `Next: ${whenLabel(w.ordersOpenAt, now)}` };
  return { tone: 'idle', text: 'Not taking orders yet' };
};

const TONE = themed(() => ({
  live: t.primary[700], soon: t.warning[700], out: t.danger[600], idle: t.neutral[500],
}));
const APPROVAL = { PENDING: 'Waiting for approval', HIDDEN: 'Hidden from buyers' };

function Thumb({ images, size }) {
  const [failed, setFailed] = useState(false);
  const img = firstImage(images);
  const box = { width: size, height: size, borderRadius: size > 54 ? 12 : 10 };
  if (!img || failed) {
    return <View style={[styles.thumb, styles.thumbEmpty, box]}><ForkKnifeIcon size={20} color={t.neutral[400]} /></View>;
  }
  return <Image source={{ uri: resolveImg(img) }} style={[styles.thumb, box]} resizeMode="cover" onError={() => setFailed(true)} />;
}

/** One menu item: photo, name, price, one status; Post and ⋯. */
export function MenuRow({
  item, busy = false, postOff = false, onPost, onMore,
}) {
  const state = menuStatus(item);
  return (
    <View style={styles.row}>
      <Thumb images={item.images} size={56} />
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.price}>{peso(saleInfo(item).price)}</Text>
        <Text style={[styles.status, { color: TONE[state.tone] }]}>{state.text}</Text>
        {APPROVAL[item.status] ? <Text style={styles.note}>{APPROVAL[item.status]}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Post ${item.name}`}
          disabled={busy || postOff}
          onPress={onPost}
          style={({ pressed }) => [styles.post, (busy || postOff || pressed) && styles.off]}
        >
          <Text style={styles.postText}>Post</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${item.name}`}
          disabled={busy}
          onPress={onMore}
          style={({ pressed }) => [styles.more, pressed && styles.off]}
        >
          <DotsThreeIcon size={22} weight="bold" color={t.neutral[600]} />
        </Pressable>
      </View>
    </View>
  );
}

/** ⋯ on a menu item. */
export function MenuMoreSheet({
  item, onEdit, onRemove, onClose,
}) {
  return (
    <Sheet variant="seller" open={Boolean(item)} title={item?.name || 'More'} onClose={onClose}>
      {item ? (
        <View>
          <SheetOption variant="seller" label="Edit item" onPress={onEdit} />
          <SheetOption variant="seller" danger label="Remove from menu" onPress={onRemove} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** "Add from My products": search the shop's products; tapping one asks first. */
export function AddFromProductsSheet({
  open, choices, busy = false, onAdd, onClose,
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (choices || []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [choices, query]);
  const close = () => { setQuery(''); setPicked(null); onClose(); };

  return (
    <Sheet
      variant="seller"
      open={open}
      title={picked ? 'Add to your menu?' : 'Add from My products'}
      onClose={close}
      footer={picked ? (
        <>
          <SheetButton variant="seller" label="Back" onPress={() => setPicked(null)} disabled={busy} />
          <SheetButton variant="seller" primary label={busy ? 'Adding…' : 'Add to menu'} onPress={() => onAdd(picked, () => { setQuery(''); setPicked(null); })} disabled={busy} />
        </>
      ) : null}
    >
      {picked ? (
        <View style={styles.confirm}>
          <View style={styles.pick}>
            <Thumb images={picked.images} size={52} />
            <View style={styles.pickText}>
              <Text style={styles.pickName} numberOfLines={1}>{picked.name}</Text>
              <Text style={styles.pickSub}>{peso(saleInfo(picked).price)}</Text>
            </View>
          </View>
          <Text style={styles.hint}>
            Add {picked.name} to your menu? It will show as ‘Not taking orders yet’ until you post it.
          </Text>
        </View>
      ) : (
        <View style={styles.picker}>
          <View style={styles.search}>
            <MagnifyingGlassIcon size={18} color={t.neutral[500]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your products"
              placeholderTextColor={t.neutral[400]}
              accessibilityLabel="Search your products"
              returnKeyType="search"
              style={styles.searchInput}
            />
          </View>
          {list.length === 0 ? (
            <Text style={[styles.hint, styles.empty]}>
              {query ? `No products match “${query}”.` : 'No products to add. Packages and paluto keep their own ordering.'}
            </Text>
          ) : list.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${p.name}`}
              disabled={Boolean(p.note)}
              onPress={() => setPicked(p)}
              style={({ pressed }) => [styles.pick, styles.pickRow, pressed && styles.pickPressed, p.note && styles.off]}
            >
              <Thumb images={p.images} size={52} />
              <View style={styles.pickText}>
                <Text style={styles.pickName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.pickSub}>{p.note || peso(saleInfo(p).price)}</Text>
              </View>
              {!p.note ? <PlusIcon size={18} weight="bold" color={t.primary[600]} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  // .stw-item
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 16, backgroundColor: t.neutral[0],
  },
  thumb: { backgroundColor: t.neutral[100] },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, lineHeight: 22, ...font(600), color: t.neutral[900] },
  price: { marginTop: 2, fontSize: 15, lineHeight: 20, ...font(400), color: t.neutral[800] },
  status: { marginTop: 4, fontSize: 14, lineHeight: 19, ...font(600) },
  note: { marginTop: 2, fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[500] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  post: {
    minHeight: 40, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, backgroundColor: t.primary[600],
  },
  postText: { fontSize: 15, lineHeight: 20, ...font(500), color: t.onBrand },
  more: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  off: { opacity: 0.55 },

  // .stw-picker, .stw-search, .stw-pick
  picker: { gap: 6, paddingBottom: 4 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, marginBottom: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[50],
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 16, ...font(400), color: t.neutral[900] },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickRow: { minHeight: 64, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: 12 },
  pickPressed: { backgroundColor: t.neutral[50] },
  pickText: { flex: 1, minWidth: 0 },
  pickName: { fontSize: 15, lineHeight: 20, ...font(600), color: t.neutral[900] },
  pickSub: { fontSize: 14, lineHeight: 19, ...font(400), color: t.neutral[600] },
  confirm: { gap: 14, paddingBottom: 4 },
  hint: { fontSize: 15, lineHeight: 22.5, ...font(400), color: t.neutral[700] },
  empty: { paddingVertical: 12, paddingHorizontal: 4 },
}));
