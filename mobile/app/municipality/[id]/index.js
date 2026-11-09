import { useEffect, useState } from 'react';
import {
  Image, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRightIcon, MapPinIcon } from '../../../src/lib/icons';
import ProductCard from '../../../src/components/ProductCard';
import { GRID_GAP } from '../../../src/lib/productGrid';
import apiClient from '../../../src/api/client';
import EmptyState from '../../../src/components/EmptyState';
import PublicHeader from '../../../src/components/public/PublicHeader';
import {
  MunicipalityGalleryStack, MunicipalitySeal, MunicipalitySectionHead, MunicipalityStoreRow,
} from '../../../src/components/public/MunicipalityParts';
import { resolveImg } from '../../../src/lib/media';
import { font, t, themed } from '../../../src/theme';
import { PageLoader } from '../../../src/components/BrandLoader';
import { PullScrollView } from '../../../src/components/PullList';
import ListEnd from '../../../src/components/ListEnd';
import useInfiniteList from '../../../src/hooks/useInfiniteList';

/*
 * web/src/pages/MunicipalityShowcase.jsx + MunicipalityShowcase.css and
 * phone-app.css at phone width. The hero's town name is the page's h1, which
 * the website moves up into the back bar.
 */

const GUTTER = 12;
const readList = (response) => (Array.isArray(response?.data) ? response.data : []);

// The town's products per batch; the next comes on its own as the end of
// the grid nears, so every one of them shows (web BATCH).
const BATCH = 24;
// Kept for this app run, so Back finds the town's products loaded so far.
const savedLists = new Map();
const productsKey = (id) => `municipality-products:${id}`;

/** HighlightCardsSkeleton: two columns of a 140px block and two lines. */
function HighlightCardsSkeleton({ count = 6, itemWidth }) {
  return <PageLoader minHeight={200} label="Loading highlights" />;
}

function Action({ label, primary, onPress }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionSecondary, pressed && styles.actionPressed]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]} numberOfLines={1}>{label}</Text>
      {primary ? <ArrowRightIcon size={16} color={t.neutral[0]} /> : null}
    </Pressable>
  );
}

/** A line of .municipality-office: the term, then its value (a link for phone and email). */
function OfficeRow({ term, value, url }) {
  return (
    <View style={styles.officeRow}>
      <Text style={styles.officeTerm}>{term}</Text>
      <Text
        style={[styles.officeValue, url && styles.officeLink]}
        onPress={url ? () => Linking.openURL(url).catch(() => {}) : undefined}
        accessibilityRole={url ? 'link' : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

function Empty({ art, label }) {
  return (
    <EmptyState compact style={styles.empty} art={art} artSize={80} text={label} />
  );
}

export default function MunicipalityShowcase() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  // Two columns, a grid gap apart, inside the 12px gutters.
  const itemWidth = (Math.min(useWindowDimensions().width, 768) - GUTTER * 2 - GRID_GAP) / 2;
  const [municipality, setMunicipality] = useState(null);
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pullKey, setPullKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get(`/municipalities/${id}`),
      apiClient.get('/stores', { params: { pageSize: 100, municipalityId: id } }),
    ]).then(([municipalityRes, storesRes]) => {
      if (cancelled) return;
      setMunicipality(municipalityRes.data || null);
      setStores(readList(storesRes));
    }).catch(() => {
      if (!cancelled) setError('Unable to load this municipality right now.');
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, pullKey]);

  // Every product of the town, newest first, a batch at a time.
  const products = useInfiniteList({
    listKey: productsKey(id),
    loadPage: async (page) => {
      const res = await apiClient.get('/products', {
        params: { page, pageSize: BATCH, municipalityId: id, sortBy: 'createdAt', sortOrder: 'desc' },
      });
      const list = readList(res);
      return { items: list, total: res.pagination?.total ?? list.length, totalPages: res.pagination?.totalPages ?? 1 };
    },
    readSaved: (key) => savedLists.get(key),
    save: (key, saved) => savedLists.set(key, saved),
  });

  const logo = municipality?.logo ? resolveImg(municipality.logo) : null;
  const name = municipality?.name;

  return (
    <View style={styles.screen}>
      <PublicHeader title={name || 'Municipality'} />
      <PullScrollView {...products.scrollProps} onPull={() => { setPullKey((key) => key + 1); return products.reload(); }} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          {/* The seal again, faint and grey, off the right edge behind the band. */}
          {logo ? <Image source={{ uri: logo }} style={styles.heroMark} resizeMode="contain" /> : null}
          <MunicipalitySeal municipality={municipality} size={64} letterSize={26} />
          <View style={styles.heroText}>
            <View style={styles.heroLocation}>
              <MapPinIcon size={16} weight="fill" color={t.secondary[50]} style={styles.heroPin} />
              <Text style={styles.heroLocationText}>Stores, products, and makers from this community</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {isLoading ? (
            <HighlightCardsSkeleton itemWidth={itemWidth} />
          ) : (
            <>
              <View style={styles.feature}>
                <View>
                  <Text style={styles.featureTitle}>{municipality?.tagline || `${name || 'This community'}, made local.`}</Text>
                  <Text style={styles.featureText}>
                    {municipality?.description || `Discover the people, products, and small businesses that make ${name || 'this municipality'} special.`}
                  </Text>
                  {/* The municipal office, when the town has filled it in (Settings). */}
                  {(municipality?.officeAddress || municipality?.officeHours || municipality?.officePhone || municipality?.officeEmail) ? (
                    <View style={styles.office}>
                      {municipality.officeAddress ? <OfficeRow term="Municipal office" value={municipality.officeAddress} /> : null}
                      {municipality.officeHours ? <OfficeRow term="Open" value={municipality.officeHours} /> : null}
                      {municipality.officePhone ? <OfficeRow term="Phone" value={municipality.officePhone} url={`tel:${municipality.officePhone.replace(/[^0-9+]/g, '')}`} /> : null}
                      {municipality.officeEmail ? <OfficeRow term="Email" value={municipality.officeEmail} url={`mailto:${municipality.officeEmail}`} /> : null}
                    </View>
                  ) : null}
                  <View style={styles.actions}>
                    <Action primary label="View all products" onPress={() => router.push(`/products?municipalityId=${id}`)} />
                    <Action label="View all stores" onPress={() => router.push(`/stores?municipalityId=${id}`)} />
                  </View>
                </View>
                <View style={styles.stackWrap}>
                  <MunicipalityGalleryStack municipality={municipality} id={id} />
                </View>
              </View>

              <View style={styles.section}>
                <MunicipalitySectionHead title={`Stores in ${name ?? ''}`} label="View all stores" to={`/stores?municipalityId=${id}`} />
                {stores.length > 0 ? (
                  <View style={styles.storeList}>
                    {stores.slice(0, 6).map((store) => (
                      <MunicipalityStoreRow key={store.id} store={store} fallbackPlace={name} />
                    ))}
                  </View>
                ) : <Empty art="stores" label="No stores are available yet." />}
              </View>

              {/* The shops first: the products below run on to the very end. */}
              <View style={styles.section}>
                <MunicipalitySectionHead title="Products" label="View all products" to={`/products?municipalityId=${id}`} />
                {products.loading ? (
                  <PageLoader minHeight={320} label="Loading products" />
                ) : products.items.length > 0 ? (
                  <>
                    <View style={styles.grid}>
                      {products.items.map((product) => (
                        <ProductCard key={product.id} product={product} variant="home" style={{ width: itemWidth }} />
                      ))}
                    </View>
                    <ListEnd list={products} done={products.total > BATCH ? `That’s every product from ${name || 'this town'}` : ''} />
                  </>
                ) : <Empty art="products" label={products.error ? 'Couldn’t load the products right now.' : 'No products are available yet.'} />}
              </View>
            </>
          )}
        </View>
      </PullScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  scroll: { flex: 1, backgroundColor: t.neutral[100] },
  page: { flexGrow: 1, backgroundColor: t.neutral[100] },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 24,
    paddingHorizontal: GUTTER,
    overflow: 'hidden',
    backgroundColor: t.primary[800],
  },
  // ::before: the seal at 220px, its centre 40px past the right edge, 6%, grey.
  heroMark: {
    position: 'absolute',
    right: -40,
    top: '50%',
    marginTop: -110,
    width: 220,
    height: 220,
    opacity: 0.06,
    filter: [{ grayscale: 1 }],
  },
  heroText: { flex: 1, minWidth: 0 },
  heroLocation: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 6 },
  heroPin: { flexShrink: 0, marginTop: 2 },
  heroLocationText: { flex: 1, fontSize: 13, lineHeight: 18.2, color: t.secondary[50], ...font(400) },

  content: { paddingTop: 16, paddingBottom: 16, paddingHorizontal: GUTTER },
  error: {
    marginBottom: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: t.neutral[0],
    fontSize: 14,
    lineHeight: 22.4,
    color: t.danger[700],
    textAlign: 'center',
    overflow: 'hidden',
    ...font(400),
  },

  skeleton: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skeletonCard: { gap: 7 },

  // Intro: a full-width white section with the grey band under it.
  feature: {
    gap: 16,
    marginHorizontal: -GUTTER,
    padding: 14,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 8,
    borderBottomColor: t.neutral[100],
  },
  featureTitle: { marginBottom: 8, fontSize: 20, lineHeight: 22.4, color: t.secondary[950], ...font(500) },
  featureText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[600], ...font(400) },
  // .municipality-office: two columns, the terms as wide as the widest.
  office: {
    gap: 4, marginTop: 16, marginBottom: 2, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: t.neutral[50],
  },
  officeRow: { flexDirection: 'row', gap: 14 },
  officeTerm: { width: 112, fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
  officeValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, color: t.neutral[900], ...font(400) },
  officeLink: { color: t.primary[700] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  actionPrimary: { backgroundColor: t.primary[700] },
  actionSecondary: { backgroundColor: t.secondary[50] },
  actionPressed: { opacity: 0.85 },
  actionText: { fontSize: 13, lineHeight: 20.8, color: t.primary[700], ...font(500) },
  actionTextPrimary: { color: t.neutral[0] },
  stackWrap: { alignItems: 'center' },

  section: { marginTop: 20 },
  storeList: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },

  // The section's empty state on a white card.
  empty: { borderRadius: 12, backgroundColor: t.neutral[0] },
}));
