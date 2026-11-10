import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRightIcon, MapPinIcon, TagIcon, WarningCircleIcon,
} from '../src/lib/icons';
import apiClient from '../src/api/client';
import { PageLoader } from '../src/components/BrandLoader';
import ListEnd from '../src/components/ListEnd';
import ProductCard from '../src/components/ProductCard';
import { PullScrollView } from '../src/components/PullList';
import Select from '../src/components/Select';
import PalengkeBand from '../src/components/palengke/PalengkeBand';
import PalengkeBasket from '../src/components/palengke/PalengkeBasket';
import PalengkeCards, { PLG_KINDS } from '../src/components/palengke/PalengkeCards';
import PalengkeTop from '../src/components/palengke/PalengkeTop';
import { colorMix, plgColors } from '../src/components/palengke/plgTheme';
import useInfiniteList from '../src/hooks/useInfiniteList';
import { getCachedData, setCachedData } from '../src/lib/dataCache';
import { GRID_EDGE, GRID_GAP, gridCellWidth } from '../src/lib/productGrid';
import { fetchCategories, fetchMunicipalities } from '../src/lib/referenceData';
import useAuthStore from '../src/store/authStore';
import { font, t, themed, useScheme } from '../src/theme';

// The orders, as GET /products sorts (the same values as the website).
// Newest first unless a card chose another.
const SORTS = {
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  'top-sales': { sortBy: 'orderCount', sortOrder: 'desc' },
  'price-low': { sortBy: 'price', sortOrder: 'asc' },
};

// Products per batch; the next comes on its own as the end of the grid nears.
const BATCH = 20;
const TOP_KEY = 'palengke-top';
const one = (v) => (Array.isArray(v) ? v[0] : v) || '';

/**
 * E-MOORM Palengke (web/src/pages/Palengke.jsx + Palengke.css, phone
 * layout): every product a seller tagged Palengke (product.badge PALENGKE),
 * in one grid that loads on as it is scrolled. On top a green band
 * (PalengkeBand: Back, a search of the palengke, ⋯, the E-MOORM logo and
 * the word), then cards that choose a kind of produce or an order, the
 * three best sellers (only once three have really sold), and the grid with
 * a town filter. Search, kind, order and town are kept in the address
 * (?q, ?cat, ?sort, ?town), so a view can be shared. The grid's heading
 * (with the town) stays at the top of the screen while it scrolls.
 */
export default function Palengke() {
  useScheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const isSeller = useAuthStore((s) => s.user?.role?.toUpperCase() === 'SELLER');
  const [municipalities, setMunicipalities] = useState([]);
  const [categories, setCategories] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchMunicipalities().then((list) => { if (alive) setMunicipalities(list || []); }).catch(() => {});
    fetchCategories().then((list) => { if (alive) setCategories(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Only the kinds whose category exists (all of them until the list comes).
  const kinds = useMemo(() => {
    if (!categories) return PLG_KINDS;
    const slugs = new Set(categories.map((c) => c.slug));
    return PLG_KINDS.filter((k) => !k.slug || slugs.has(k.slug));
  }, [categories]);

  const sortKey = SORTS[one(params.sort)] ? one(params.sort) : 'newest';
  const sort = SORTS[sortKey];
  const cat = PLG_KINDS.some((k) => k.slug && k.slug === one(params.cat)) ? one(params.cat) : '';
  const kind = PLG_KINDS.find((k) => k.slug === cat);
  const q = one(params.q).trim().slice(0, 100);
  const town = one(params.town);
  const townName = municipalities.find((m) => m.id === town)?.name || '';

  const query = useMemo(() => {
    const p = { badge: 'PALENGKE', pageSize: BATCH, ...sort };
    // A search in the default order: the best matches first.
    if (q) {
      p.search = q;
      if (sortKey === 'newest') p.sortBy = 'relevance';
    }
    if (cat) p.categorySlug = cat;
    if (town) p.municipalityId = town;
    return p;
  }, [sort, sortKey, q, cat, town]);

  const list = useInfiniteList({
    listKey: `palengke-list:${JSON.stringify(query)}`,
    loadPage: async (page) => {
      const res = await apiClient.get('/products', { params: { ...query, page } });
      const items = res.data || [];
      return {
        items,
        total: res.pagination?.total ?? items.length,
        totalPages: res.pagination?.totalPages ?? 1,
      };
    },
    readSaved: (key) => getCachedData(key) || undefined,
    save: (key, saved) => setCachedData(key, saved),
  });
  const products = list.items;

  // The three best sellers, by units sold. Shown only when all three have
  // sold something: no ranking of products nobody has bought.
  const [topThree, setTopThree] = useState(() => getCachedData(TOP_KEY) || []);
  const loadTop = useCallback(() => apiClient.get('/products', {
    params: {
      badge: 'PALENGKE', sortBy: 'orderCount', sortOrder: 'desc', pageSize: 3,
    },
  }).then((res) => {
    const top = res.data || [];
    setCachedData(TOP_KEY, top);
    setTopThree(top);
  }).catch(() => {}), []);
  useEffect(() => { loadTop(); }, [loadTop]);
  const showTop = !q && topThree.length === 3 && topThree.every((p) => Number(p.soldCount) > 0);

  // The page's scroll, for the grid's top and the status bar's colour.
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const gridTop = useRef(0);
  const [bandH, setBandH] = useState(0);
  const [pastBand, setPastBand] = useState(false);

  const onScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.current = y;
    const past = bandH > 0 && y > bandH - 30;
    if (past !== pastBand) setPastBand(past);
    list.checkScroll(e);
  };

  // A search, a kind, an order or a town starts the list over, from the
  // top of the grid.
  const update = (patch) => {
    const next = {};
    Object.entries(patch).forEach(([k, v]) => { next[k] = v || undefined; });
    router.setParams(next);
    if (scrollY.current > gridTop.current) scrollRef.current?.scrollTo({ y: gridTop.current, animated: false });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const refresh = () => Promise.all([list.reload(), loadTop()]);

  let heading = 'All products';
  if (q) heading = `Results for “${q}”`;
  else if (kind?.slug) heading = kind.name;
  else if (sortKey !== 'newest') heading = sortKey === 'top-sales' ? 'Best selling first' : 'Lowest price first';

  // What is narrowing the list, for the empty state.
  const narrowed = Boolean(q || cat || town);
  const what = kind?.slug ? kind.name.toLowerCase() : 'palengke products';
  const where = town ? ` in ${townName || 'this town'}` : '';
  const c = plgColors();
  const cell = gridCellWidth(screenW);

  let body;
  if (list.loading) {
    body = <PageLoader minHeight={360} label="Loading the palengke" />;
  } else if (list.error) {
    body = (
      <View style={styles.state} accessibilityRole="alert">
        <WarningCircleIcon size={56} weight="fill" color={t.warning[500]} style={styles.warn} />
        <Text style={styles.stateTitle}>Couldn’t load the palengke</Text>
        <Text style={styles.stateText}>{list.error.message || 'Check your connection and try again.'}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={list.reload}
            style={({ pressed }) => [styles.btn, { backgroundColor: c.b2 }, pressed && styles.btnPressed]}
          >
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  } else if (products.length === 0) {
    let title = 'The palengke is still setting up';
    let note = 'No seller has tagged a product Palengke yet. Fresh gulay, prutas and more will show here as soon as they do.';
    if (q) {
      title = `Nothing in the palengke matches “${q}”${where}`;
      note = 'Try another word, or see everything in the palengke.';
    } else if (narrowed) {
      title = `No ${what}${where} yet`;
      note = 'Sellers haven’t tagged any of these Palengke yet. Try another kind or all towns, or browse everything on E-MOORM.';
    }
    body = (
      <View style={styles.state}>
        <View style={styles.stateArt}>
          <View style={[styles.disc, { backgroundColor: colorMix(c.b1, 0.22, t.neutral[0]) }]} />
          <View><PalengkeBasket size={120} /></View>
        </View>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateText}>{note}</Text>
        <View style={styles.actions}>
          {narrowed ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => update({
                q: '', cat: '', town: '', sort: '',
              })}
              style={({ pressed }) => [styles.btn, { backgroundColor: c.b2 }, pressed && styles.btnPressed]}
            >
              <Text style={[styles.btnText, styles.btnTextPrimary]}>Show everything</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/products')}
            style={({ pressed }) => [styles.btn, !narrowed && { backgroundColor: c.b2 }, pressed && styles.btnPressed]}
          >
            <Text style={[styles.btnText, !narrowed && styles.btnTextPrimary]}>Browse all products</Text>
            <ArrowRightIcon size={16} color={narrowed ? t.neutral[800] : '#FFFFFF'} />
          </Pressable>
        </View>
        {isSeller ? (
          <View style={styles.hint}>
            <TagIcon size={16} weight="fill" color={t.accent[500]} style={styles.hintIcon} />
            <Text style={styles.hintText}>
              Selling fresh produce? Pick the <Text style={styles.hintStrong}>Palengke</Text> badge in your product form and it shows here.
              {' '}
              <Text style={styles.hintLink} accessibilityRole="link" onPress={() => router.push('/seller/products')}>Your products</Text>
            </Text>
          </View>
        ) : null}
      </View>
    );
  } else {
    body = (
      <View style={styles.grid}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} variant="home" style={{ width: cell }} />
        ))}
      </View>
    );
  }

  const townOptions = useMemo(() => [
    { value: '', label: 'All towns' },
    ...municipalities.map((m) => ({ value: m.id, label: m.name })),
  ], [municipalities]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* The status bar: the band's green over it, the sheet's grey once the band has gone. */}
      <View
        pointerEvents="none"
        style={[styles.statusBar, { height: insets.top, backgroundColor: pastBand ? t.neutral[100] : colorMix(c.g1, 0.69, c.g2) }]}
      />
      <PullScrollView
        onPull={refresh}
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 8 + insets.bottom }]}
        stickyHeaderIndices={[2]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={32}
        onContentSizeChange={(_w, h) => list.checkScroll({ offset: scrollY.current, content: h })}
        onLayout={(e) => list.checkScroll({ offset: scrollY.current, viewport: e.nativeEvent.layout.height })}
      >
        <View onLayout={(e) => setBandH(e.nativeEvent.layout.height)}>
          <PalengkeBand q={q} onSearch={(text) => update({ q: text })} onBack={goBack} />
        </View>

        <View style={styles.sheet}>
          <PalengkeCards
            kinds={kinds}
            cat={cat}
            sort={sortKey}
            onCat={(slug) => update({ cat: slug })}
            onSort={(key) => update({ sort: key })}
          />
          {showTop ? <PalengkeTop products={topThree} /> : null}
        </View>

        {/* Sticky: React Native replaces the sticky child's own style on phones,
            so the row lives one level in. */}
        <View onLayout={(e) => { gridTop.current = e.nativeEvent.layout.y; }}>
          <View style={styles.listhead}>
            <View style={styles.listheadText}>
              <Text style={styles.heading} numberOfLines={1} accessibilityRole="header">{heading}</Text>
              <Text style={styles.count}>
                {list.loading ? ' ' : (
                  <>
                    <Text style={styles.countStrong}>{list.total}</Text>
                    {` ${list.total === 1 ? 'product' : 'products'}`}
                    {townName ? ` in ${townName}` : ''}
                  </>
                )}
              </Text>
            </View>
            <View style={styles.townWrap}>
              <Select
                accessibilityLabel="Town"
                title="Town"
                value={town}
                options={townOptions}
                onChange={(v) => update({ town: v })}
                caretColor={t.neutral[500]}
                style={[styles.town, town && styles.townOn]}
                textStyle={[styles.townText, town && styles.townTextOn]}
              />
              <View style={styles.townPin} pointerEvents="none">
                <MapPinIcon size={15} weight="fill" color={t.accent[500]} />
              </View>
            </View>
          </View>
        </View>

        <View>{body}</View>

        <View>
          {!list.loading && !list.error && products.length > 0 ? (
            <ListEnd list={list} done={list.total > BATCH ? 'That’s everything in the palengke for now' : ''} />
          ) : null}
        </View>
      </PullScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },

  // The sheet: grey with round top corners over the band's bottom.
  sheet: {
    marginTop: -22, paddingTop: 12, paddingBottom: 6, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: t.neutral[100],
  },

  listhead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 14, backgroundColor: t.neutral[100],
  },
  listheadText: { flexShrink: 1, minWidth: 0 },
  heading: { fontSize: 16.5, lineHeight: 19, ...font(500), color: t.neutral[900] },
  count: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  countStrong: { ...font(500), color: t.primary[700] },

  townWrap: { flexShrink: 0 },
  town: {
    minHeight: 36, height: 36, paddingLeft: 31, paddingRight: 11, gap: 8, borderRadius: 999,
    borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  townOn: {
    paddingLeft: 30.5, paddingRight: 10.5, borderWidth: 1.5, borderColor: t.primary[500], backgroundColor: t.primary[50],
  },
  townText: {
    // Sized by its words: the Select's own flex: 1 leaves it 0 wide in a pill
    // that is only as wide as its content (phones).
    flex: 0, flexShrink: 1, fontSize: 13.5, lineHeight: 17.55, ...font(500), color: t.neutral[700],
  },
  townTextOn: { color: t.primary[700] },
  townPin: { position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingHorizontal: GRID_EDGE,
  },

  // Empty and error: a card with the basket on a flat green disc.
  state: {
    alignItems: 'center', marginTop: 4, marginHorizontal: 12, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 28,
    borderRadius: 24, backgroundColor: t.neutral[0],
  },
  stateArt: {
    width: 180, height: 160, marginBottom: 12, alignItems: 'center', justifyContent: 'center',
  },
  disc: {
    position: 'absolute', top: 10, bottom: 10, left: 14, right: 14, borderRadius: 999,
  },
  warn: { marginBottom: 10 },
  stateTitle: {
    fontSize: 18, lineHeight: 23.4, ...font(500), color: t.neutral[900], textAlign: 'center',
  },
  stateText: {
    maxWidth: 420, marginTop: 8, fontSize: 14.5, lineHeight: 22.475, ...font(400), color: t.neutral[600], textAlign: 'center',
  },
  actions: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 20,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, paddingHorizontal: 18,
    borderRadius: 999, backgroundColor: t.neutral[100],
  },
  btnPressed: { opacity: 0.88 },
  btnText: { fontSize: 14.5, lineHeight: 20, ...font(500), color: t.neutral[800] },
  btnTextPrimary: { color: '#FFFFFF' },
  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, maxWidth: 440, marginTop: 24,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.accent[50],
  },
  hintIcon: { marginTop: 2 },
  hintText: {
    flex: 1, fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[700],
  },
  hintStrong: { ...font(700) },
  hintLink: { ...font(500), color: t.accent[700], textDecorationLine: 'underline' },
}));
