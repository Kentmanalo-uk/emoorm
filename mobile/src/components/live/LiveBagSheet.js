import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SheetFrame } from '../Sheet';
import { PushPinIcon } from '../../lib/icons';
import { resolveImg, sizedImg } from '../../lib/media';
import { saleInfo } from '../../lib/variantPricing';
import { font, t, themed } from '../../theme';
import { BAG_LABELS, bagAction } from './liveCart';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const photoOf = (p) => {
  const first = Array.isArray(p.images) ? p.images[0] : null;
  return first ? (sizedImg(first, 68) || resolveImg(first)) : null;
};

/*
 * A live's product bag (the website's components/live/LiveBagSheet.jsx):
 * every product the shop is showing, numbered as the seller says them out
 * loud, in a sheet over the video. onAction adds it or opens it; onOpen
 * opens its page.
 */
function LiveBagSheet({
  open, onClose, bag, pinnedId, onAction, onOpen,
}) {
  return (
    <SheetFrame open={open} onClose={onClose} title="Shop the live" maxHeight={0.65}>
      {bag.length === 0 ? (
        <Text style={styles.empty}>The shop has not added products to this live yet.</Text>
      ) : bag.map((p, i) => {
        const { price, regular } = saleInfo(p);
        const action = bagAction(p);
        const pinned = p.id === pinnedId;
        const photo = photoOf(p);
        return (
          <View key={p.id} style={[styles.item, pinned && styles.pinned]}>
            <Pressable onPress={() => onOpen(p)} style={styles.photo} accessibilityLabel={p.name}>
              {photo ? <Image source={{ uri: photo }} style={styles.img} contentFit="cover" /> : null}
              <Text style={styles.no}>{i + 1}</Text>
            </Pressable>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={2} onPress={() => onOpen(p)}>{p.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{peso(price)}</Text>
                {regular ? <Text style={styles.was}>{peso(regular)}</Text> : null}
              </View>
              {pinned ? (
                <View style={styles.pinNote}>
                  <PushPinIcon size={12} weight="fill" color={t.primary[700]} />
                  <Text style={styles.pinText}>Showing now</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => onAction(p)}
              disabled={action === 'sold-out'}
              style={[styles.btn, action === 'cart' && styles.buy, action === 'sold-out' && styles.off]}
              accessibilityRole="button"
            >
              <Text style={[styles.btnText, action === 'cart' && styles.buyText]}>{BAG_LABELS[action]}</Text>
            </Pressable>
          </View>
        );
      })}
    </SheetFrame>
  );
}

const styles = themed(() => StyleSheet.create({
  empty: { paddingVertical: 24, color: t.neutral[500], fontSize: 14, textAlign: 'center', ...font(400) },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 12 },
  pinned: { backgroundColor: t.primary[50] },
  photo: { width: 68, height: 68, borderRadius: 10, overflow: 'hidden', backgroundColor: t.neutral[100] },
  img: { width: '100%', height: '100%' },
  no: {
    position: 'absolute', top: 0, left: 0, minWidth: 22, paddingHorizontal: 6, paddingVertical: 2,
    borderBottomRightRadius: 8, backgroundColor: 'rgba(0,0,0,0.62)', color: '#fff', fontSize: 12, textAlign: 'center', ...font(700),
  },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: t.neutral[900], fontSize: 14, lineHeight: 18, ...font(400) },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { color: '#e11d48', fontSize: 15, ...font(700) },
  was: { color: t.neutral[400], fontSize: 12, textDecorationLine: 'line-through', ...font(400) },
  pinNote: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pinText: { color: t.primary[700], fontSize: 11.5, ...font(600) },
  btn: {
    height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: t.neutral[300],
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0],
  },
  buy: { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
  off: { opacity: 0.5 },
  btnText: { color: t.neutral[900], fontSize: 13, ...font(600) },
  buyText: { color: '#fff' },
}));

export default memo(LiveBagSheet);
