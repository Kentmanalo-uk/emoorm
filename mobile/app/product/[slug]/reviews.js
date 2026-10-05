import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeftIcon, StarIcon } from 'phosphor-react-native';
import apiClient from '../../../src/api/client';
import EmptyArt from '../../../src/components/EmptyArt';
import ShellPageMenu from '../../../src/components/ShellPageMenu';
import { resolveImg } from '../../../src/lib/media';
import { font, t } from '../../../src/theme';
import ReviewItem, { Stars } from '../../../src/components/product/ReviewItem';
import { parseImages, peso } from '../../../src/components/product/productLib';

const PAGE_SIZE = 10;
const STARS = [5, 4, 3, 2, 1];
const PLACEHOLDER = require('../../../assets/pdp-placeholder-product.png');

/**
 * Every review of one product, at /product/:slug/reviews
 * (web/src/pages/ProductReviews.jsx): a rating summary, a star filter kept in
 * the URL (?rating=5), and the list, ten at a time.
 */
export default function ProductReviews() {
  const { slug } = useLocalSearchParams();
  // Keyed by slug so another product starts from a clean page.
  return <ReviewsPage key={String(slug)} slug={String(slug || '')} />;
}

function ReviewsPage({ slug }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const ratingParam = Number(params.rating);
  const rating = STARS.includes(ratingParam) ? ratingParam : null;

  const [product, setProduct] = useState(null);
  const [stats, setStats] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiClient.get(`/products/slug/${slug}`);
        if (!live) return;
        setProduct(res.data);
        const rv = await apiClient.get(`/reviews/product/${res.data.id}`, { params: { page: 1, pageSize: 1 } });
        if (live) setStats(rv.ratingStats || null);
      } catch {
        if (live) setMissing(true);
      }
    })();
    return () => { live = false; };
  }, [slug]);

  const pickRating = (value) => router.setParams({ rating: value ? String(value) : undefined });
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/product/${slug}`));

  const total = stats?.totalReviews ?? 0;
  const avg = Number(stats?.averageRating || 0);
  const dist = stats?.distribution || {};
  const image = product ? parseImages(product.images)[0] : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* The bar is held at the top once the 12px above it scrolls away (.prv-top is sticky). */}
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={[styles.page, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.topGap} />
        <View style={styles.top}>
          <Pressable style={styles.back} onPress={goBack} accessibilityRole="button" accessibilityLabel="Back">
            <CaretLeftIcon size={20} weight="bold" color={t.neutral[700]} />
          </Pressable>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">Reviews</Text>
            {total > 0 ? <View style={styles.count}><Text style={styles.countText}>{total}</Text></View> : null}
          </View>
          <ShellPageMenu />
        </View>

        {missing ? (
          <View style={[styles.card, styles.cardLast, styles.empty]}>
            <EmptyArt name="reviews" size={120} />
            <Text style={styles.emptyTitle}>Product not found</Text>
            <Text style={styles.emptyLink} onPress={() => router.push('/products')}>Browse products</Text>
          </View>
        ) : (
          <>
            {product ? (
              <Pressable style={[styles.card, styles.product]} onPress={() => router.push(`/product/${product.slug}`)} accessibilityRole="link">
                <ProductThumb src={image} />
                <View style={styles.productText}>
                  <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.productPrice}>{peso(product.price)}</Text>
                </View>
              </Pressable>
            ) : (
              <Pulse style={[styles.card, styles.skeleton]} />
            )}

            {stats && total > 0 ? (
              <View style={[styles.card, styles.summary]}>
                <View style={styles.score}>
                  <Text style={styles.scoreNum}>{avg.toFixed(1)}</Text>
                  <Text style={styles.scoreSmall}>out of 5</Text>
                  <View style={styles.scoreStars}><Stars rating={avg} size={16} gap={2} /></View>
                  <Text style={styles.scoreSmall}>{total} {total === 1 ? 'rating' : 'ratings'}</Text>
                </View>
                <View style={styles.bars}>
                  {STARS.map((n) => {
                    const c = dist[n] || 0;
                    return (
                      <Pressable
                        key={n}
                        style={[styles.bar, rating === n && styles.barOn]}
                        onPress={() => pickRating(rating === n ? null : n)}
                        accessibilityRole="button"
                        accessibilityLabel={`${n} star: ${c}`}
                      >
                        <View style={styles.barLabel}>
                          <Text style={styles.barLabelText}>{n}</Text>
                          <StarIcon size={11} weight="fill" color={t.warning[500]} />
                        </View>
                        <View style={styles.track}>
                          <BarFill pct={total ? (c / total) * 100 : 0} />
                        </View>
                        <Text style={styles.barCount}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {stats && total > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} accessibilityRole="tablist">
                <Pressable style={[styles.chip, !rating && styles.chipOn]} onPress={() => pickRating(null)} accessibilityRole="tab" accessibilityState={{ selected: !rating }}>
                  <Text style={[styles.chipText, !rating && styles.chipTextOn]}>All</Text>
                  <Text style={[styles.chipCount, !rating && styles.chipCountOn]}>{total}</Text>
                </Pressable>
                {STARS.map((n) => (
                  <Pressable key={n} style={[styles.chip, rating === n && styles.chipOn]} onPress={() => pickRating(n)} accessibilityRole="tab" accessibilityState={{ selected: rating === n }}>
                    <Text style={[styles.chipText, rating === n && styles.chipTextOn]}>{n}</Text>
                    <StarIcon size={12} weight="fill" color={t.warning[500]} />
                    <Text style={[styles.chipCount, rating === n && styles.chipCountOn]}>{dist[n] || 0}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {product ? <ReviewList key={`${product.id}-${rating || 'all'}`} productId={product.id} rating={rating} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** One filter's list. Keyed by filter, so switching stars starts over. */
function ReviewList({ productId, rating }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiClient.get(`/reviews/product/${productId}`, {
          params: { page, pageSize: PAGE_SIZE, ...(rating ? { rating } : {}) },
        });
        if (!live) return;
        setItems((prev) => (page === 1 ? res.data || [] : [...prev, ...(res.data || [])]));
        setTotalPages(res.pagination?.totalPages || 1);
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [productId, rating, page]);

  const loadMore = () => { setLoading(true); setPage((p) => p + 1); };

  if (failed && items.length === 0) {
    return <View style={[styles.card, styles.cardLast, styles.empty]}><Text style={styles.emptyText}>Couldn’t load reviews. Please try again.</Text></View>;
  }

  if (!loading && items.length === 0) {
    return (
      <View style={[styles.card, styles.cardLast, styles.empty]}>
        <EmptyArt name="reviews" size={120} />
        <Text style={styles.emptyTitle}>{rating ? `No ${rating}-star reviews yet` : 'No reviews yet'}</Text>
        <Text style={styles.emptyText}>{rating ? 'Try another rating.' : 'Be the first to review this product after you buy it.'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.cardLast, styles.list]}>
      {items.map((r, i) => <ReviewItem key={r.id} review={r} showReply last={i === items.length - 1} />)}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={t.neutral[500]} />
          <Text style={styles.loadingText}>Loading reviews…</Text>
        </View>
      ) : null}
      {!loading && page < totalPages ? (
        <Pressable style={styles.more} onPress={loadMore} accessibilityRole="button">
          <Text style={styles.moreText}>Show more reviews</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProductThumb({ src }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  return <Image source={uri && !failed ? { uri } : PLACEHOLDER} style={styles.thumb} onError={() => setFailed(true)} />;
}

/** A star bar's fill, growing to its share. */
function BarFill({ pct }) {
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, { toValue: pct, duration: 400, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false }).start();
  }, [pct, grow]);
  return <Animated.View style={[styles.fill, { width: grow.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />;
}

function Pulse({ style }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.55, duration: 600, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]} />;
}

const styles = StyleSheet.create({
  // Phones: a white page whose sections run edge to edge, each closed by an
  // 8px grey band (web/src/styles/phone-app.css).
  screen: { flex: 1, backgroundColor: '#fff' },
  page: { backgroundColor: '#fff' },
  topGap: { height: 12 },
  top: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 41, marginBottom: 14, paddingLeft: 12, paddingRight: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 19, lineHeight: 21.85, ...font(500), color: t.neutral[900] },
  count: { minWidth: 20, paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.primary[50] },
  countText: { fontSize: 11, lineHeight: 12.65, ...font(500), color: t.primary[700], textAlign: 'center' },
  card: { backgroundColor: '#fff', borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  cardLast: { borderBottomWidth: 0 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: t.neutral[100] },
  productText: { flexShrink: 1, minWidth: 0, gap: 3 },
  productName: { fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900] },
  productPrice: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.primary[700] },
  skeleton: { height: 88 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  score: { minWidth: 88, alignItems: 'center', gap: 2 },
  scoreNum: { fontSize: 36, lineHeight: 36, ...font(500), color: t.neutral[900] },
  scoreSmall: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  scoreStars: { marginTop: 6, marginBottom: 2 },
  bars: { flex: 1, gap: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 8 },
  barOn: { backgroundColor: t.primary[50] },
  barLabel: { width: 28, flexDirection: 'row', alignItems: 'center', gap: 3 },
  barLabelText: { fontSize: 13, lineHeight: 15.6, ...font(500), color: t.neutral[700] },
  track: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: t.neutral[150] },
  fill: { height: '100%', borderRadius: 999, backgroundColor: t.warning[500] },
  barCount: { width: 28, fontSize: 12.5, lineHeight: 15, ...font(400), color: t.neutral[500], textAlign: 'right' },
  chipsScroll: { marginHorizontal: 12, marginBottom: 12, flexGrow: 0 },
  chips: { gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: t.neutral[200], backgroundColor: '#fff',
  },
  chipOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  chipText: { fontSize: 13.5, lineHeight: 16.2, ...font(500), color: t.neutral[700] },
  chipTextOn: { color: t.primary[700] },
  chipCount: { fontSize: 13.5, lineHeight: 16.2, ...font(500), color: t.neutral[500] },
  chipCountOn: { color: t.primary[600] },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  loadingText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
  more: {
    marginTop: 4, marginBottom: 16, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: t.primary[600], alignItems: 'center',
  },
  moreText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.primary[700] },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 36, paddingHorizontal: 20 },
  emptyTitle: { marginTop: 8, fontSize: 17, lineHeight: 20.4, ...font(500), color: t.neutral[900], textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  emptyLink: { marginTop: 8, fontSize: 15, lineHeight: 24, ...font(500), color: t.primary[700] },
});
