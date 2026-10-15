import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretDownIcon, StarIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';
import SellerPage, { sellerPageStyles } from '../../src/components/seller/SellerPage';
import { SellerChip } from '../../src/components/seller/SellerChips';
import { SelectSheet } from '../../src/components/Select';
import EmptyState from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/SkeletonLayouts';
import ReviewItem, { Stars } from '../../src/components/seller/reviews/ReviewItem';

/*
 * /seller/reviews: Reviews (web/src/pages/SellerReviews.jsx; SellerDashboard.css
 * and layout/SellerMobile.css at phone size). The shop's average, then one
 * row of chips (All, Needs reply with its count, the rating picker), the
 * reviews with Reply / Edit reply, and Prev / Next pages. "Needs reply" is
 * filtered and counted by the server; ?filter=reply (from seller Home) opens
 * with it on.
 */

const PAGE_SIZE = 10;
const RATINGS = [
  { value: '', label: 'Any' },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` })),
];

export default function SellerReviewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const [reviews, setReviews] = useState([]);
  const [ratingStats, setRatingStats] = useState({ averageRating: 0, totalReviews: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [ratingFilter, setRatingFilter] = useState('');
  const [ratingOpen, setRatingOpen] = useState(false);
  const [unansweredOnly, setUnansweredOnly] = useState(() => params.filter === 'reply');
  const [awaitingReply, setAwaitingReply] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyId, setOpenReplyId] = useState(null);
  const [savingReplyId, setSavingReplyId] = useState(null);

  // A later link to ?filter=reply while the page is open turns the filter on.
  useEffect(() => {
    if (params.filter === 'reply') setUnansweredOnly(true);
  }, [params.filter]);

  const load = useCallback(async (page = 1, rating = ratingFilter, unreplied = unansweredOnly, quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [res, pending] = await Promise.all([
        apiClient.get('/reviews/seller/mine', {
          params: { page, pageSize: PAGE_SIZE, rating: rating || undefined, unrepliedOnly: unreplied || undefined },
        }),
        apiClient.get('/reviews/seller/mine', { params: { pageSize: 1, unrepliedOnly: true } }).catch(() => null),
      ]);
      if (pending?.pagination) setAwaitingReply(pending.pagination.total);
      setReviews(res.data || []);
      setRatingStats(res.ratingStats || { averageRating: 0, totalReviews: 0 });
      if (res.pagination) {
        setPagination({
          page: res.pagination.page,
          pageSize: res.pagination.pageSize,
          total: res.pagination.total,
          totalPages: res.pagination.totalPages,
        });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load reviews');
    } finally {
      setIsLoading(false);
    }
  }, [ratingFilter, unansweredOnly]);

  useEffect(() => {
    load(1, ratingFilter, unansweredOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratingFilter, unansweredOnly]);

  const refresh = async () => {
    setRefreshing(true);
    await load(pagination.page, ratingFilter, unansweredOnly, true);
    setRefreshing(false);
  };

  const startReply = (review) => {
    setOpenReplyId(review.id);
    setReplyDrafts((p) => ({ ...p, [review.id]: p[review.id] ?? review.sellerReply ?? '' }));
  };

  const cancelReply = (id) => {
    setOpenReplyId((cur) => (cur === id ? null : cur));
  };

  const submitReply = async (review) => {
    const text = (replyDrafts[review.id] || '').trim();
    if (!text) {
      toast.error('Reply cannot be empty');
      return;
    }
    setSavingReplyId(review.id);
    try {
      const res = await apiClient.post(`/reviews/${review.id}/reply`, { reply: text });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...res.data } : r)));
      if (!review.sellerReply) setAwaitingReply((n) => Math.max(0, n - 1));
      setOpenReplyId(null);
      toast.success('Reply posted');
    } catch (err) {
      toast.error(err.message || 'Failed to post reply');
    } finally {
      setSavingReplyId(null);
    }
  };

  const ratingLabel = RATINGS.find((o) => o.value === String(ratingFilter))?.label || 'Any';
  const ratingOn = Boolean(ratingFilter);
  const ink = ratingOn ? '#fff' : t.neutral[700];

  return (
    <SellerPage scroll={false}>
      {/* Its own scroller, so a reply being typed stays above the keyboard. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          style={styles.flex}
          contentContainerStyle={[sellerPageStyles.content, { flexGrow: 1, paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
        >
          {/* The header's summary (SellerPageHead actions): the title itself is in the bar. */}
          {ratingStats.totalReviews > 0 ? (
            <View style={styles.summary}>
              <Text style={styles.avg}>{Number(ratingStats.averageRating).toFixed(1)}</Text>
              <Stars value={Math.round(ratingStats.averageRating)} />
              <Text style={styles.count}>
                {ratingStats.totalReviews} review{ratingStats.totalReviews === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}

          {/* Phones: one row of chips instead of a filter panel. */}
          <View style={styles.chips} accessibilityLabel="Show reviews">
            <SellerChip label="All" on={!unansweredOnly} onPress={() => setUnansweredOnly(false)} style={styles.chip} />
            <SellerChip
              label={`Needs reply${awaitingReply > 0 ? ` · ${awaitingReply}` : ''}`}
              on={unansweredOnly}
              onPress={() => setUnansweredOnly(true)}
              style={styles.chip}
            />
            {/* .scm-chip--select: the rating picker inside a chip. */}
            <SellerChip more on={ratingOn} onPress={() => setRatingOpen(true)} style={[styles.chip, styles.ratingChip]}>
              <StarIcon size={15} weight="fill" color={ink} />
              <View style={styles.select} accessibilityLabel="Rating">
                <Text style={[styles.selectText, { color: ink }]} numberOfLines={1}>{ratingLabel}</Text>
                <View style={ratingOpen ? styles.caretOpen : null}>
                  <CaretDownIcon size={14} weight="bold" color={ink} />
                </View>
              </View>
            </SellerChip>
          </View>
          <SelectSheet
            open={ratingOpen}
            title="Rating"
            options={RATINGS}
            value={String(ratingFilter)}
            onPick={(v) => { setRatingOpen(false); setRatingFilter(v); }}
            onClose={() => setRatingOpen(false)}
          />

          {isLoading ? (
            <View style={styles.loading}>
              <ListSkeleton rows={4} />
            </View>
          ) : reviews.length === 0 ? (
            <EmptyState
              page
              art="reviews"
              title={unansweredOnly ? 'All caught up' : 'No reviews yet'}
              text={unansweredOnly
                ? 'Every review on this page has a reply.'
                : 'Buyers can review a product once their order is completed.'}
            />
          ) : (
            <>
              <View style={styles.list}>
                {reviews.map((r) => (
                  <ReviewItem
                    key={r.id}
                    review={r}
                    open={openReplyId === r.id}
                    draft={replyDrafts[r.id] || ''}
                    saving={savingReplyId === r.id}
                    onDraft={(text) => setReplyDrafts((p) => ({ ...p, [r.id]: text }))}
                    onStart={() => startReply(r)}
                    onCancel={() => cancelReply(r.id)}
                    onSubmit={() => submitReply(r)}
                    onOpenBuyer={(id) => router.push(`/u/${id}`)}
                    onOpenProduct={(slug) => router.push(`/product/${slug}`)}
                  />
                ))}
              </View>

              {pagination.totalPages > 1 ? (
                <View style={styles.pages}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={pagination.page <= 1}
                    onPress={() => load(pagination.page - 1)}
                    style={[styles.pageBtn, pagination.page <= 1 && styles.off]}
                  >
                    <Text style={styles.pageBtnText}>Prev</Text>
                  </Pressable>
                  <Text style={styles.pageText}>{pagination.page} / {pagination.totalPages}</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onPress={() => load(pagination.page + 1)}
                    style={[styles.pageBtn, pagination.page >= pagination.totalPages && styles.off]}
                  >
                    <Text style={styles.pageBtnText}>Next</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // .seller-header .reviews-summary (phones: one row)
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  avg: { fontSize: 22, lineHeight: 22, ...font(700), color: t.neutral[900] },
  count: { fontSize: 12, lineHeight: 16, ...font(400), color: t.neutral[500] },

  // .scm-chips: the picker's 46px field makes the row that tall.
  chips: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 12 },
  chip: { minHeight: 46 },
  ratingChip: { marginLeft: 'auto' },
  select: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  selectText: { fontSize: 14, lineHeight: 20, ...font(400) },
  caretOpen: { transform: [{ rotate: '180deg' }] },

  loading: { padding: 16 },
  list: { gap: 10 },

  // .products-pagination (phones)
  pages: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, padding: 12,
    borderRadius: 12, backgroundColor: t.neutral[0],
  },
  pageText: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[500] },
  pageBtn: {
    alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  pageBtnText: { fontSize: 13, lineHeight: 18, ...font(500), color: t.neutral[700] },
  off: { opacity: 0.5 },
});
