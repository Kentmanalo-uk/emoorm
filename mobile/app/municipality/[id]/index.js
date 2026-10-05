import { useEffect, useState } from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRightIcon, MapPinIcon } from 'phosphor-react-native';
import apiClient from '../../../src/api/client';
import EmptyArt from '../../../src/components/EmptyArt';
import LoadingSkeleton from '../../../src/components/LoadingSkeleton';
import PublicHeader from '../../../src/components/public/PublicHeader';
import {
  MunicipalityGalleryStack, MunicipalityProductCard, MunicipalitySeal, MunicipalitySectionHead, MunicipalityStoreRow,
} from '../../../src/components/public/MunicipalityParts';
import { resolveImg } from '../../../src/lib/media';
import { font, t, text } from '../../../src/theme';

/*
 * web/src/pages/MunicipalityShowcase.jsx + MunicipalityShowcase.css and
 * phone-app.css at phone width. The hero's town name is the page's h1, which
 * the website moves up into the back bar.
 */

const GUTTER = 12;
const readList = (response) => (Array.isArray(response?.data) ? response.data : []);

/** HighlightCardsSkeleton: two columns of a 140px block and two lines. */
function HighlightCardsSkeleton({ count = 6, itemWidth }) {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading highlights">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={i} style={[styles.skeletonCard, { width: itemWidth }]}>
          <LoadingSkeleton height={140} borderRadius={12} />
          <LoadingSkeleton height={12} width="75%" borderRadius={6} />
          <LoadingSkeleton height={11} width="45%" borderRadius={6} />
        </View>
      ))}
    </View>
  );
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

function Empty({ art, label }) {
  return (
    <View style={styles.empty}>
      <EmptyArt name={art} size={80} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

export default function MunicipalityShowcase() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  // Two columns 8px apart inside the 12px gutters.
  const itemWidth = (Math.min(useWindowDimensions().width, 768) - GUTTER * 2 - 8) / 2;
  const [municipality, setMunicipality] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      apiClient.get(`/municipalities/${id}`),
      apiClient.get('/stores', { params: { pageSize: 100, municipalityId: id } }),
      apiClient.get('/products', { params: { pageSize: 100, municipalityId: id, sortBy: 'createdAt', sortOrder: 'desc' } }),
    ]).then(([municipalityRes, storesRes, productsRes]) => {
      if (cancelled) return;
      setMunicipality(municipalityRes.data || null);
      setStores(readList(storesRes));
      setProducts(readList(productsRes));
    }).catch(() => {
      if (!cancelled) setError('Unable to load this municipality right now.');
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const logo = municipality?.logo ? resolveImg(municipality.logo) : null;
  const name = municipality?.name;

  return (
    <View style={styles.screen}>
      <PublicHeader title={name || 'Municipality'} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
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
                <MunicipalitySectionHead title="Top Products" label="View all products" to={`/products?municipalityId=${id}`} />
                {products.length > 0 ? (
                  <View style={styles.grid}>
                    {products.slice(0, 8).map((product) => (
                      <MunicipalityProductCard key={product.id} product={product} style={{ width: itemWidth }} />
                    ))}
                  </View>
                ) : <Empty art="products" label="No products are available yet." />}
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
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[50] },
  scroll: { flex: 1, backgroundColor: t.neutral[50] },
  page: { flexGrow: 1, backgroundColor: t.neutral[50] },

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  empty: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  emptyText: { fontSize: 14, lineHeight: 22.4, color: text.muted, textAlign: 'center', ...font(400) },
});
