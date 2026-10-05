import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChatCircleTextIcon, PencilSimpleIcon, StarIcon, StorefrontIcon, TrashIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import ProductImage from '../src/components/ProductImage';
import LoadingSkeleton from '../src/components/LoadingSkeleton';
import OrderReviewSheet from '../src/components/orders/OrderReviewSheet';
import CartConfirmDialog from '../src/components/cart/CartConfirmDialog';
import { ProfileEmpty } from '../src/components/profile/ProfileUI';
import {
  RATING_WORDS, errorText, parseImages, shortDate,
} from '../src/components/profile/profileLib';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { invalidateCachedData } from '../src/lib/dataCache';
import { font, t } from '../src/theme';

/** Five stars the buyer can tap (the website's hover preview is a press here). */
function StarPicker({ onPick, label }) {
  const [hovered, setHovered] = useState(0);
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <View style={styles.pickerStars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            onPressIn={() => setHovered(n)}
            onPressOut={() => setHovered(0)}
            onHoverIn={() => setHovered(n)}
            onHoverOut={() => setHovered(0)}
            onPress={() => onPick(n)}
            style={[styles.pickerStar, n <= hovered && { transform: [{ scale: 1.1 }] }]}
          >
            <StarIcon size={26} weight={n <= hovered ? 'fill' : 'regular'} color={n <= hovered ? t.warning[500] : t.neutral[300]} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.pickerHint}>{hovered ? RATING_WORDS[hovered] : 'Tap a star to rate'}</Text>
    </View>
  );
}

/** Read-only stars for a posted review. */
const Stars = ({ value, size = 16 }) => (
  <View style={styles.stars} accessibilityLabel={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <StarIcon key={n} size={size} weight={n <= value ? 'fill' : 'regular'} color={n <= value ? t.warning[500] : t.neutral[300]} />
    ))}
  </View>
);

/**
 * /profile/reviews (web/src/pages/ProfileReviews.jsx): "To review" (items
 * received and not rated yet, with tap-to-rate stars) and "My reviews" (each
 * with Edit and Delete), the review sheet and the delete question.
 */
export default function ProfileReviews() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tab = params.tab === 'pending' ? 'pending' : (params.tab === 'mine' ? 'mine' : null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [pendingRes, mineRes] = await Promise.all([
        apiClient.get('/reviews/my/pending'),
        apiClient.get('/reviews/my/reviews', { params: { pageSize: 100 } }),
      ]);
      setData({
        pending: Array.isArray(pendingRes.data) ? pendingRes.data : [],
        reviews: Array.isArray(mineRes.data) ? mineRes.data : [],
      });
    } catch (err) {
      setError(errorText(err, 'Could not load your reviews'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = data?.pending || [];
  const reviews = data?.reviews || [];

  // With nothing chosen, open on whichever list has something to show.
  const activeTab = tab || (pending.length > 0 ? 'pending' : 'mine');
  const setTab = (next) => router.setParams({ tab: next === 'pending' ? 'pending' : 'mine' });

  const productFor = (item) => ({
    id: item.productId,
    name: item.product?.name || item.productName,
    images: parseImages(item.product?.images),
  });

  const openProduct = (slug) => { if (slug) router.push(`/product/${slug}`); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/reviews/${deleteTarget.id}`);
      toast.success('Review deleted');
      setDeleteTarget(null);
      invalidateCachedData('profile:');
      load();
    } catch (err) {
      toast.error(errorText(err, 'Failed to delete review'));
    } finally {
      setDeleting(false);
    }
  };

  const summary = reviews.length
    ? { count: reviews.length, avg: Math.round((reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length) * 10) / 10 }
    : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Reviews" backTo="/profile" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Your ratings help other buyers choose and help sellers improve.</Text>

        <View style={styles.tabs} accessibilityRole="tablist">
          <TabButton label="To review" count={pending.length} active={activeTab === 'pending'} onPress={() => setTab('pending')} />
          <TabButton label="My reviews" count={reviews.length} muted active={activeTab === 'mine'} onPress={() => setTab('mine')} />
        </View>

        {loading ? (
          <ReviewCardsSkeleton />
        ) : error ? (
          <View style={styles.section}>
            <ProfileEmpty style={styles.empty} title="Something went wrong" hint={error} action="Try again" onAction={() => { setLoading(true); load(); }} />
          </View>
        ) : activeTab === 'pending' ? (
          <View style={styles.section}>
            {pending.length === 0 ? (
              <ProfileEmpty
                style={styles.empty}
                art="reviews"
                title="Nothing waiting for a review"
                hint="Once you receive an order, the items you bought show up here so you can rate them."
                action="View my orders"
                onAction={() => router.push('/orders')}
              />
            ) : (
              <View style={styles.list}>
                {pending.map((item) => {
                  const product = productFor(item);
                  return (
                    <View key={item.productId} style={[styles.card, styles.cardPending]}>
                      <View style={styles.cardTop}>
                        <Pressable accessibilityRole="link" onPress={() => openProduct(item.product?.slug)} style={styles.thumb}>
                          <ProductImage src={product.images[0]} />
                        </Pressable>
                        <View style={styles.body}>
                          <Text style={styles.name}>{product.name}</Text>
                          <View style={styles.meta}>
                            {item.store?.name ? (
                              <View style={styles.metaItem}>
                                <StorefrontIcon size={13} color={t.neutral[500]} />
                                <Text style={styles.metaText}>{item.store.name}</Text>
                              </View>
                            ) : null}
                            <Text style={styles.metaText}>Order {item.orderNumber}</Text>
                            {item.receivedAt ? <Text style={styles.metaText}>Received {shortDate(item.receivedAt)}</Text> : null}
                          </View>
                          <StarPicker
                            label={`Rate ${product.name}`}
                            onPick={(n) => setTarget({ product, orderId: item.orderId, initialRating: n })}
                          />
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setTarget({ product, orderId: item.orderId })}
                        style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { backgroundColor: t.primary[700], borderColor: t.primary[700] }]}
                      >
                        <Text style={[styles.btnText, { color: '#fff' }]}>Write review</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {summary ? (
              <View style={styles.summary}>
                <Stars value={Math.round(summary.avg)} size={18} />
                <Text style={styles.summaryText}>
                  You rate <Text style={styles.summaryStrong}>{summary.avg}</Text> on average across {summary.count} review{summary.count === 1 ? '' : 's'}.
                </Text>
              </View>
            ) : null}
            {reviews.length === 0 ? (
              <ProfileEmpty
                style={styles.empty}
                art="feedback"
                title="No reviews yet"
                hint={pending.length > 0
                  ? `You have ${pending.length} item${pending.length === 1 ? '' : 's'} waiting for a rating.`
                  : 'Once your order is completed you can rate the product and leave a review.'}
                action={pending.length > 0 ? 'Rate now' : 'View my orders'}
                onAction={() => (pending.length > 0 ? setTab('pending') : router.push('/orders'))}
              />
            ) : (
              <View style={styles.list}>
                {reviews.map((review) => {
                  const images = parseImages(review.images);
                  const product = { id: review.productId, name: review.product?.name || 'Product', images: parseImages(review.product?.images) };
                  return (
                    <View key={review.id} style={styles.card}>
                      <View style={styles.cardTop}>
                        <Pressable accessibilityRole="link" onPress={() => openProduct(review.product?.slug)} style={styles.thumb}>
                          <ProductImage src={product.images[0]} />
                        </Pressable>
                        <View style={styles.body}>
                          <Text style={styles.name}>{product.name}</Text>
                          <View style={styles.ratingRow}>
                            <Stars value={Number(review.rating)} />
                            <Text style={styles.ratingWord}>{RATING_WORDS[Number(review.rating)] || ''}</Text>
                            <Text style={styles.date}>{shortDate(review.createdAt)}</Text>
                          </View>
                          {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
                          {images.length > 0 ? (
                            <View style={styles.photos}>
                              {images.map((src, i) => (
                                <Image key={i} source={{ uri: resolveImg(src) || src }} style={styles.photo} accessibilityLabel={`Review photo ${i + 1}`} />
                              ))}
                            </View>
                          ) : null}
                          {review.sellerReply ? (
                            <View style={styles.reply}>
                              <ChatCircleTextIcon size={14} color={t.primary[600]} style={{ marginTop: 2 }} />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.replyLabel}>Seller replied{review.sellerRepliedAt ? ` · ${shortDate(review.sellerRepliedAt)}` : ''}</Text>
                                <Text style={styles.replyText}>{review.sellerReply}</Text>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.actions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setTarget({ product, existing: { id: review.id, rating: Number(review.rating), comment: review.comment || '' } })}
                          style={({ pressed }) => [styles.btn, pressed && { borderColor: t.neutral[300] }]}
                        >
                          <PencilSimpleIcon size={14} color={t.neutral[700]} />
                          <Text style={styles.btnText}>Edit</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setDeleteTarget(review)}
                          style={({ pressed }) => [styles.btn, pressed && { borderColor: t.danger[300] }]}
                        >
                          <TrashIcon size={14} color={t.danger[600]} />
                          <Text style={[styles.btnText, { color: t.danger[600] }]}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <OrderReviewSheet
        target={target}
        onClose={() => setTarget(null)}
        onSuccess={() => { invalidateCachedData('profile:'); load(); }}
      />

      <CartConfirmDialog
        open={Boolean(deleteTarget)}
        medium
        title="Delete this review?"
        message="It will be removed from the product page. You can write a new one later."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Keep it"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function TabButton({ label, count, active, muted = false, onPress }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && { color: t.primary[600] }]}>{label}</Text>
      {count > 0 ? (
        <View style={[styles.count, muted && styles.countMuted]}>
          <Text style={[styles.countText, muted && { color: t.neutral[500] }]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** ReviewCardsSkeleton (web PageSkeletons). */
function ReviewCardsSkeleton({ count = 3 }) {
  return (
    <View style={styles.skList} accessibilityLabel="Loading reviews">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.skCard}>
          <View style={styles.skRow}>
            <LoadingSkeleton width={52} height={52} borderRadius={10} />
            <View style={styles.skLines}>
              <LoadingSkeleton height={13} width="70%" />
              <LoadingSkeleton height={12} width={90} />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <LoadingSkeleton height={11} />
            <LoadingSkeleton height={11} width="60%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  subtitle: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },

  tabs: { flexDirection: 'row', gap: 4, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: t.neutral[200] },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: -1,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: t.primary[600] },
  tabText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(500) },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  countMuted: { backgroundColor: t.neutral[100] },
  countText: { fontSize: 12, lineHeight: 19.2, color: '#fff', ...font(500) },

  section: { marginHorizontal: -12, padding: 14, backgroundColor: t.neutral[0] },
  empty: { marginHorizontal: -12 },
  list: { gap: 12 },
  card: { gap: 16, padding: 16, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0] },
  cardPending: { borderColor: t.primary[200], backgroundColor: t.primary[50] },
  cardTop: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: t.neutral[100] },
  body: { flex: 1, minWidth: 0 },
  name: { marginBottom: 4, fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },

  picker: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  pickerStars: { flexDirection: 'row', gap: 2 },
  pickerStar: { padding: 2, paddingBottom: 6 },
  pickerHint: { minWidth: 110, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },

  stars: { flexDirection: 'row', gap: 1 },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 },
  ratingWord: { fontSize: 13, lineHeight: 20.8, color: t.warning[600], ...font(500) },
  date: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  comment: { marginBottom: 8, fontSize: 14, lineHeight: 21.7, color: t.neutral[700], ...font(400) },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  photo: { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[100] },
  reply: { flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.neutral[50] },
  replyLabel: { marginBottom: 2, fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(500) },
  replyText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[700], ...font(400) },

  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 },
  summaryText: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, color: t.neutral[700], ...font(400) },
  summaryStrong: { ...font(500) },

  actions: { flexDirection: 'row', gap: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  btnPrimary: { backgroundColor: t.primary[600], borderColor: t.primary[600] },
  btnText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(500) },

  skList: { gap: 12 },
  skCard: { gap: 12, padding: 14, borderRadius: 14, backgroundColor: t.neutral[0] },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skLines: { flex: 1, gap: 8 },
});
