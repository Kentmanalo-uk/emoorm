import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MapPinIcon, ShoppingBagIcon, SlidersHorizontalIcon, SquaresFourIcon } from 'phosphor-react-native';
import apiClient from '../src/api/client';
import Button from '../src/components/Button';
import TextField from '../src/components/TextField';
import ProductCard from '../src/components/ProductCard';
import TodayCard from '../src/components/TodayCard';
import TodayTag from '../src/components/TodayTag';
import { BulkPrices, SaleEnds, SaleWas } from '../src/components/SaleTag';
import StatusBadge from '../src/components/StatusBadge';
import EmptyState from '../src/components/EmptyState';
import EmptyArt, { EMPTY_ART_NAMES } from '../src/components/EmptyArt';
import Chip from '../src/components/Chip';
import Sheet, { SheetButton, SheetOption } from '../src/components/Sheet';
import LoadingSkeleton from '../src/components/LoadingSkeleton';
import StarRating from '../src/components/StarRating';
import { MODES } from '../src/lib/availability';
import { font, spacing, t } from '../src/theme';

/*
 * Every shared piece, for comparing with the website's phone view.
 * Live products and Available Today items come from the API; the samples
 * below show the states the data may not have (sale, reviews, sold out).
 * ?sheet=buyer|seller opens that sheet on arrival, ?only=<section id> shows one
 * section (for screenshots).
 */

const hour = 3600e3;
const SAMPLE = {
  sale: {
    id: 's1', slug: 'sample', name: 'Fresh Calamansi, 1 kg bag from Naujan', price: '100', salePrice: '80', images: [],
    reviewCount: 12, averageRating: 4.4, soldCount: 37, municipality: { name: 'Naujan' },
  },
  today: {
    id: 's2', slug: 'sample', name: 'Pancit Bihon Bilao', price: '350', images: [], listingKind: 'TODAY', reviewCount: 0, soldCount: 5,
    availability: { status: 'LIVE', mode: 'READY_NOW', ordersOpenAt: new Date(Date.now() - hour).toISOString(), ordersCloseAt: new Date(Date.now() + 40 * 60e3).toISOString() },
    store: { municipality: { name: 'Bongabong' } },
  },
};
const flashSale = { price: '100', salePrice: '80', saleEndsAt: new Date(Date.now() + 26 * hour).toISOString() };
const todayItem = (over) => ({
  id: `t-${over.mode}`, mode: 'READY_NOW', status: 'LIVE', remaining: 3,
  ordersOpenAt: new Date(Date.now() - hour).toISOString(), ordersCloseAt: new Date(Date.now() + 5 * hour).toISOString(),
  product: { ...SAMPLE.sale, name: 'Sample: Chicken Adobo (per tub)' }, store: { municipality: { name: 'Calapan' } },
  ...over,
});

function Section({ id, only, title, children }) {
  if (only && only !== id) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function DesignSystemDemo() {
  const params = useLocalSearchParams();
  const [products, setProducts] = useState([]);
  const [today, setToday] = useState([]);
  const [sheet, setSheet] = useState(params.sheet || null);
  const [chip, setChip] = useState('All');
  const [town, setTown] = useState('');

  useEffect(() => {
    apiClient.get('/products', { params: { search: 'a', pageSize: 4 } }).then((res) => setProducts(res.data || [])).catch(() => {});
    apiClient.get('/today', { params: { pageSize: 4 } }).then((res) => setToday(res.data?.items || [])).catch(() => {});
  }, []);

  const grid = (list, variant) => (
    <View style={styles.grid}>
      {list.map((p) => <ProductCard key={`${variant}-${p.id}`} product={p} variant={variant} onPress={() => { }} style={styles.cell} />)}
    </View>
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Section id="home" only={params.only} title="Product card: home">
          {grid([...products, SAMPLE.sale, SAMPLE.today], 'home')}
        </Section>

        <Section id="result" only={params.only} title="Product card: search result">
          {grid([...products, SAMPLE.sale, SAMPLE.today], 'result')}
        </Section>

        <Section id="legacy" only={params.only} title="Product card: older grid / list">
          <View style={styles.legacyRow}>
            <ProductCard name="Fresh Calamansi (1kg)" price={45} rating={4} reviewCount={12} onPress={() => { }} />
            <ProductCard name="Handwoven Nito Bag" price={350} onPress={() => { }} />
          </View>
          <ProductCard variant="list" name="Organic Brown Rice (5kg)" price={220} rating={4.5} reviewCount={28} onPress={() => { }} />
        </Section>

        <Section id="today" only={params.only} title="Available Today card">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {[...today, todayItem({ mode: 'MADE_TO_ORDER' }), todayItem({ mode: 'PRE_ORDER', remaining: 0 })].map((item) => (
              <TodayCard key={item.id} item={item} onPress={() => { }} style={styles.railCard} />
            ))}
          </ScrollView>
          <View style={styles.grid}>
            {[...today.slice(0, 2), todayItem({ mode: 'MADE_TO_ORDER', ordersCloseAt: new Date(Date.now() + 30 * 60e3).toISOString() })].map((item) => (
              <TodayCard key={`r-${item.id}`} item={item} result onPress={() => { }} style={styles.cell} />
            ))}
          </View>
        </Section>

        <Section id="tags" only={params.only} title="Today tags and sale prices">
          <View style={styles.wrapRow}>
            {MODES.map((m) => <TodayTag key={m.key} mode={m.key} />)}
            <TodayTag mode="READY_NOW" size={13} />
          </View>
          <View style={styles.wrapRow}>
            <SaleWas product={flashSale} />
            <SaleWas product={flashSale} compact />
            <SaleEnds product={flashSale} />
          </View>
          <BulkPrices tiers={[{ minQty: 10, price: 90 }, { minQty: 50, price: 80 }]} />
        </Section>

        <Section id="chips" only={params.only} title="Chips">
          <View style={[styles.wrapRow, styles.band]}>
            <Chip variant="filter" icon={SlidersHorizontalIcon} label="Filter" onPress={() => { }} />
            <Chip variant="filter" icon={MapPinIcon} label={town || 'Municipality'} caret active={Boolean(town)} onPress={() => setTown(town ? '' : 'Baco')} />
            <Chip variant="filter" label="Category" caret onPress={() => { }} />
          </View>
          <View style={styles.wrapRow}>
            <Chip variant="today" icon={MapPinIcon} label="All towns" caret onPress={() => { }} />
            <Chip variant="today" icon={SquaresFourIcon} label="Local Delicacies" caret active onPress={() => { }} />
          </View>
          <View style={styles.wrapRow}>
            {['All', ...MODES.map((m) => m.label)].map((l) => <Chip key={l} variant="pill" label={l} active={chip === l} onPress={() => setChip(l)} />)}
          </View>
          <View style={[styles.wrapRow, styles.sellerBand]}>
            {['All', 'To ship', 'Done'].map((l) => <Chip key={l} variant="seller" label={l} active={chip === l} onPress={() => setChip(l)} />)}
            <Chip variant="seller" label="More" dot onPress={() => { }} />
          </View>
          <View style={styles.wrapRow}>
            <Chip variant="suggest" label="kakanin" onPress={() => { }} />
            <Chip variant="suggest" label="calamansi" active onPress={() => { }} />
          </View>
        </Section>

        <Section id="sheets" only={params.only} title="Sheets">
          <View style={styles.row}>
            <Button title="Buyer sheet" variant="secondary" onPress={() => setSheet('buyer')} style={styles.flexItem} />
            <Button title="Seller sheet" variant="secondary" onPress={() => setSheet('seller')} style={styles.flexItem} />
          </View>
        </Section>

        <Section id="empty" only={params.only} title="Empty state">
          <View style={styles.sunken}>
            <EmptyState flat art="calendar" title="Nothing available right now" text="Shops post fresh food and produce here during the day. Check back soon." actions={[{ label: 'Browse products', icon: ShoppingBagIcon, onPress: () => { } }]} />
          </View>
          <View style={styles.sunken}>
            <EmptyState art="cart" title="Your cart is empty" text="Add products to your cart." actions={[{ label: 'Browse products', onPress: () => { } }, { label: 'View wishlist', variant: 'outline', onPress: () => { } }]} />
          </View>
          <View style={styles.sunken}>
            <EmptyState icon={SquaresFourIcon} title="Nothing here yet" message="Older callers pass an icon element." actionLabel="Refresh" onAction={() => { }} />
          </View>
          <View style={styles.whiteBox}>
            <EmptyState inset art="search" title="No results" text="Inset: inside a white card." />
          </View>
        </Section>

        <Section id="art" only={params.only} title="Empty art">
          <View style={styles.artGrid}>
            {EMPTY_ART_NAMES.map((n) => (
              <View key={n} style={styles.artCell}>
                <EmptyArt name={n} size={56} />
                <Text style={styles.artName}>{n}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section id="older" only={params.only} title="Older pieces">
          <View style={styles.row}>
            <Button title="Primary" onPress={() => { }} style={styles.flexItem} />
            <Button title="Danger" variant="danger" onPress={() => { }} style={styles.flexItem} />
          </View>
          <TextField label="Email" placeholder="you@example.com" />
          <StarRating rating={3.5} />
          <View style={styles.wrapRow}>
            <StatusBadge status="PENDING" />
            <StatusBadge status="COMPLETED" />
          </View>
          <LoadingSkeleton width="70%" height={16} />
        </Section>
      </ScrollView>

      <Sheet
        open={sheet === 'buyer'}
        title="Filters"
        onClose={() => setSheet(null)}
        footer={<><SheetButton label="Reset all" onPress={() => setTown('')} /><SheetButton label="Show results" primary onPress={() => setSheet(null)} /></>}
      >
        <Text style={styles.sheetSec}>Municipality</Text>
        <View style={styles.sheetGrid}>
          {['All municipalities', 'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City'].map((m) => (
            <SheetOption key={m} grid label={m} selected={(town || 'All municipalities') === m} onPress={() => setTown(m === 'All municipalities' ? '' : m)} style={styles.sheetGridCell} />
          ))}
        </View>
        <View style={styles.sheetRule} />
        {['Newest', 'Price, low to high'].map((s) => <SheetOption key={s} label={s} selected={s === 'Newest'} onPress={() => { }} />)}
      </Sheet>

      <Sheet open={sheet === 'seller'} variant="seller" title="Filter orders" onClose={() => setSheet(null)}
        footer={<><SheetButton variant="seller" label="Clear" onPress={() => { }} /><SheetButton variant="seller" primary label="Apply" onPress={() => setSheet(null)} /></>}
      >
        <Text style={styles.sheetLabel}>Status</Text>
        {['All orders', 'To ship', 'Completed'].map((s) => <SheetOption key={s} variant="seller" label={s} selected={s === 'All orders'} onPress={() => { }} />)}
        <SheetOption variant="seller" label="Delete order" danger onPress={() => { }} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: spacing.xl, backgroundColor: t.neutral[100] },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 18, lineHeight: 24, ...font(500), color: t.neutral[900] },
  row: { flexDirection: 'row', gap: spacing.sm },
  flexItem: { flex: 1 },
  // The website's phone grids: two columns, 4px apart.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { flexBasis: '48%', flexGrow: 1, maxWidth: '49.45%' },
  legacyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rail: { gap: 8 },
  railCard: { width: 150 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  band: { padding: 12, backgroundColor: t.neutral[0] },
  sellerBand: { padding: 12, backgroundColor: t.neutral[100] },
  sunken: { marginHorizontal: -12, backgroundColor: t.neutral[100] },
  whiteBox: { borderRadius: 12, backgroundColor: t.neutral[0] },
  artGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  artCell: { width: '31%', alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: t.neutral[0] },
  artName: { fontSize: 11, lineHeight: 14, color: t.neutral[500] },
  sheetSec: { paddingTop: 14, paddingHorizontal: 20, paddingBottom: 6, fontSize: 15, lineHeight: 17.25, ...font(500), color: t.neutral[900] },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4, paddingHorizontal: 20, paddingBottom: 12 },
  sheetGridCell: { flexBasis: '45%', flexGrow: 1, maxWidth: '48.6%' },
  sheetRule: { height: 8, backgroundColor: t.neutral[50] },
  sheetLabel: { marginTop: 14, marginBottom: 8, fontSize: 13, lineHeight: 20, color: t.neutral[500] },
});
