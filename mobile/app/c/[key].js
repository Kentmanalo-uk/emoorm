import { useCallback } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingBagIcon, WarningCircleIcon } from '../../src/lib/icons';
import apiClient from '../../src/api/client';
import ScreenHeader from '../../src/components/ScreenHeader';
import EmptyState from '../../src/components/EmptyState';
import ListEnd from '../../src/components/ListEnd';
import ProductCard from '../../src/components/ProductCard';
import { PageLoader } from '../../src/components/BrandLoader';
import { PullFlatList } from '../../src/components/PullList';
import ShortcutHead from '../../src/components/shortcutPages/ShortcutHead';
import {
  BowlArt, BrushArt, CalendarArt, GiftArt, PackageArt, SaleArt,
} from '../../src/components/art/FlatArt';
import useInfiniteList from '../../src/hooks/useInfiniteList';
import { font, t, themed } from '../../src/theme';
import NotFound from '../+not-found';

/*
 * A collection (web/src/pages/Collection.jsx + .css, phone rules): one of
 * Home's shortcuts opened into the whole list (/c/:key), e.g. Pasalubong or
 * On Sale. The title in the back bar; the shortcut's mark and a line, three
 * sorts, the count, and every product of it in two columns, a batch at a
 * time as the end nears.
 */

// Each collection: its words and what GET /products is asked for.
const COLLECTIONS = {
  pasalubong: {
    title: 'Pasalubong',
    line: 'Local delicacies and handmade crafts to bring home.',
    params: { categories: 'local-delicacies,handicrafts' },
    Art: GiftArt,
  },
  'pre-order': {
    title: 'Pre-order',
    line: 'Order ahead from local sellers.',
    params: { badge: 'PRE_ORDER' },
    Art: CalendarArt,
  },
  diy: {
    title: 'DIY & Crafts',
    line: 'Crafts and do-it-yourself finds from local sellers.',
    params: { badge: 'DIY' },
    Art: BrushArt,
  },
  'ready-to-eat': {
    title: 'Ready to Eat',
    line: 'Cooked meals and snacks from local kitchens.',
    params: { productType: 'READY_TO_EAT' },
    Art: BowlArt,
  },
  packages: {
    title: 'Packages',
    line: 'Bundles from local shops, like party and family meal packs.',
    params: { productType: 'PACKAGE' },
    Art: PackageArt,
  },
  'on-sale': {
    title: 'On Sale',
    line: 'Products with a sale price right now.',
    params: { onSale: 1 },
    Art: SaleArt,
  },
};

// The sorts offered, as Products' sort values and the API's.
const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'top-sales', label: 'Best selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'price-low', label: 'Lowest price', sortBy: 'price', sortOrder: 'asc' },
];

// Products per batch: whole rows of the grid.
const BATCH = 20;
// The page's sides and the gap between the two columns (.coll-container, .coll-grid).
const EDGE = 12;
const GAP = 8;

// Each list as it showed last time, for this app run (web pageCache, visit only).
const saved = new Map();
const one = (v) => (Array.isArray(v) ? v[0] : v) || '';

export default function CollectionScreen() {
  const params = useLocalSearchParams();
  const key = one(params.key);
  const preset = Object.hasOwn(COLLECTIONS, key) ? COLLECTIONS[key] : null;
  if (!preset) return <NotFound />;
  return <CollectionPage key={key} slug={key} preset={preset} sortParam={one(params.sort)} />;
}

function CollectionPage({ slug, preset, sortParam }) {
  const { title, line, params: filter, Art } = preset;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const cellW = Math.floor(((screenW - EDGE * 2 - GAP) / 2) * 100) / 100;
  const sortKey = SORTS.some((s) => s.key === sortParam) ? sortParam : 'newest';
  const sort = SORTS.find((s) => s.key === sortKey);

  const list = useInfiniteList({
    listKey: `collection:${slug}:${sortKey}`,
    loadPage: async (page) => {
      const res = await apiClient.get('/products', {
        params: {
          ...filter, pageSize: BATCH, sortBy: sort.sortBy, sortOrder: sort.sortOrder, page,
        },
      });
      const items = Array.isArray(res?.data) ? res.data : [];
      return {
        items,
        total: res.pagination?.total ?? items.length,
        totalPages: res.pagination?.totalPages ?? 1,
      };
    },
    readSaved: (k) => saved.get(k),
    save: (k, s) => saved.set(k, s),
  });

  const pickSort = useCallback((next) => {
    if (next === sortKey) return;
    router.setParams({ sort: next === 'newest' ? undefined : next });
  }, [router, sortKey]);

  const count = list.loading ? null : list.total;
  const empty = !list.loading && !list.error && list.items.length === 0;

  const header = (
    <View>
      <View style={styles.gutter}>
        <ShortcutHead Art={Art} title={title} line={line} />
      </View>
      {/* Nothing to sort or count in an empty list. */}
      {!empty ? (
        <View style={styles.bar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sorts}
            accessibilityRole="radiogroup"
            accessibilityLabel="Sort by"
          >
            {SORTS.map((s) => {
              const on = s.key === sortKey;
              return (
                <Pressable
                  key={s.key}
                  style={({ pressed }) => [styles.sort, on && styles.sortOn, pressed && !on && styles.sortPressed]}
                  onPress={() => pickSort(s.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.sortText, on && styles.sortTextOn]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {count == null ? ' ' : (
              <>
                <Text style={styles.countStrong}>{count}</Text>
                {` ${count === 1 ? 'product' : 'products'}`}
              </>
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );

  let body = null;
  if (list.loading) {
    body = <PageLoader minHeight={320} />;
  } else if (list.error) {
    body = (
      <View style={styles.error} accessibilityRole="alert">
        <WarningCircleIcon size={48} weight="fill" color={t.neutral[300]} />
        <Text style={styles.errorTitle} accessibilityRole="header">Couldn’t load {title}</Text>
        <Text style={styles.errorText}>Check your connection and try again.</Text>
        <Pressable
          style={({ pressed }) => [styles.errorBtn, pressed && styles.errorBtnPressed]}
          onPress={list.reload}
          accessibilityRole="button"
        >
          <Text style={styles.errorBtnText}>Try again</Text>
        </Pressable>
      </View>
    );
  } else if (list.items.length === 0) {
    body = (
      <EmptyState
        style={styles.empty}
        art="products"
        roomy
        title={`No ${title} products yet`}
        text="Local sellers add new products every day. Check back soon, or browse everything for now."
        actions={[{ label: 'Browse all products', icon: ShoppingBagIcon, onPress: () => router.push('/products') }]}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} />
      <PullFlatList
        onPull={list.reload}
        style={styles.list}
        data={body ? [] : list.items}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        renderItem={({ item }) => (
          <View style={{ width: cellW, minWidth: 0 }}>
            <ProductCard product={item} variant="home" />
          </View>
        )}
        ListFooterComponent={body ? null : (
          <ListEnd list={list} done={list.total > BATCH ? `That’s all of ${title} for now` : ''} />
        )}
        {...list.endProps}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  list: { flex: 1 },
  gutter: { paddingHorizontal: EDGE },

  // .coll-bar on phones: the sorts take the row, the count under them.
  bar: { gap: 10, marginBottom: 10 },
  sorts: { gap: 8, paddingHorizontal: EDGE },
  sort: {
    minHeight: 34, paddingHorizontal: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  sortPressed: { borderColor: t.primary[300] },
  sortOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  sortText: { fontSize: 13.5, lineHeight: 16.2, ...font(500), color: t.neutral[700] },
  sortTextOn: { color: t.neutral[0] },
  count: { paddingHorizontal: 14, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  countStrong: { ...font(500), color: t.neutral[900] },

  row: { gap: GAP, paddingHorizontal: EDGE, marginBottom: GAP },

  empty: { marginTop: 0 },

  // .coll-error
  error: { alignItems: 'center', gap: 8, paddingVertical: 56, paddingHorizontal: 24 },
  errorTitle: { marginTop: 4, fontSize: 18, lineHeight: 21.6, ...font(500), color: t.neutral[900], textAlign: 'center' },
  errorText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  errorBtn: {
    minHeight: 40, marginTop: 8, paddingHorizontal: 20, justifyContent: 'center',
    borderRadius: 999, backgroundColor: t.primary[600],
  },
  errorBtnPressed: { backgroundColor: t.primary[700] },
  errorBtnText: { fontSize: 15, lineHeight: 18, ...font(500), color: t.onBrand },
}));
