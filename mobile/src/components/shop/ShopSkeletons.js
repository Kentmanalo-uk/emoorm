import { StyleSheet, View } from 'react-native';
import LoadingSkeleton from '../LoadingSkeleton';
import { t } from '../../theme';

/*
 * Loading shapes for the shop pages (web/src/components/ui/PageSkeletons.jsx
 * StoreSkeleton and StoreCardsSkeleton, PageSkeletons.css).
 */
const Bone = ({ w = '100%', h, r = 6, style }) => (
  <LoadingSkeleton width={w} height={h} borderRadius={r} style={[styles.bone, style]} />
);

/** The shop page while it loads: cover, shop card, tabs, product rows. */
export function ShopPageSkeleton({ top = 0 }) {
  return (
    <View style={[styles.store, { paddingTop: top }]} accessibilityLabel="Loading shop">
      <View style={styles.cover} />
      <View style={[styles.card, styles.storeCard]}>
        <View style={styles.row}>
          <Bone w={64} h={64} r={32} />
          <View style={styles.lines}>
            <Bone h={16} w="70%" />
            <Bone h={11} w="40%" />
            <Bone h={11} w="55%" />
          </View>
          <View style={styles.stack}>
            <Bone h={32} w={92} r={999} />
            <Bone h={32} w={92} r={999} />
          </View>
        </View>
        <Bone h={44} r={12} />
      </View>
      <View style={styles.tabs}>
        {[0, 1, 2].map((i) => <Bone key={i} h={14} w={72} />)}
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, styles.productRow]}>
          <Bone w={96} h={96} r={12} />
          <View style={[styles.lines, styles.spread]}>
            <Bone h={14} w="85%" />
            <Bone h={11} w="35%" />
            <View style={[styles.row, styles.between]}>
              <Bone h={16} w={70} />
              <Bone h={32} w={96} r={10} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** The shop's product list while it loads: tiles two by two. */
export function ShopGridSkeleton({ width }) {
  const w = (width - 8) / 2;
  return (
    <View style={styles.grid}>
      {Array.from({ length: 8 }).map((_, i) => <Bone key={i} w={w} h={w * 4 / 3} r={12} />)}
    </View>
  );
}

/** The stores list while it loads. */
export function StoreCardsSkeleton({ count = 6 }) {
  return (
    <View style={styles.storeCards} accessibilityLabel="Loading shops">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.card, styles.storeTile]}>
          <View style={styles.row}>
            <Bone w={48} h={48} r={24} />
            <View style={styles.lines}>
              <Bone h={14} w="65%" />
              <Bone h={11} w="45%" />
            </View>
          </View>
          <View style={styles.thumbs}>
            {[0, 1, 2].map((k) => <Bone key={k} h={64} r={10} style={styles.thumb} />)}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The shop's Home tab while it loads. */
export function ShopHomeSkeleton() {
  return (
    <View style={styles.home}>
      <Bone h={120} r={16} />
      <Bone h={180} r={16} />
      <Bone h={70} r={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  bone: { backgroundColor: t.neutral[150] },
  store: { gap: 10, paddingBottom: 16 },
  cover: { height: 72, marginBottom: -56, backgroundColor: t.primary[600], opacity: 0.35 },
  card: { gap: 12, padding: 14, borderRadius: 14, backgroundColor: t.neutral[0] },
  storeCard: { marginHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  between: { justifyContent: 'space-between' },
  lines: { flex: 1, minWidth: 0, gap: 7 },
  spread: { justifyContent: 'space-between' },
  stack: { gap: 8 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, paddingHorizontal: 12, backgroundColor: t.neutral[0] },
  productRow: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeCards: { gap: 8 },
  storeTile: { borderWidth: 1, borderColor: t.neutral[150] },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { flex: 1 },
  home: { gap: 12 },
});
