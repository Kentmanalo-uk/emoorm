import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChatTextIcon as MessageSquareText, StarIcon as Star, TrashIcon as Trash2 } from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyState from '../src/components/EmptyState';
import StarRating from '../src/components/StarRating';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import { toast } from '../src/lib/toast';
import { invalidateCachedData } from '../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

export default function Reviews() {
  const router = useRouter();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchReviews = useCallback(async () => { setLoading(true); try { const response = await apiClient.get(ENDPOINTS.REVIEWS.MY_REVIEWS, { params: { pageSize: 100 } }); setReviews(response.data || []); } catch (error) { toast.error('Failed to load reviews', error.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { fetchReviews(); }, [fetchReviews]));
  const remove = (review) => Alert.alert('Delete review?', 'This cannot be undone.', [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await apiClient.delete(ENDPOINTS.REVIEWS.BY_ID(review.id)); setReviews((current) => current.filter((item) => item.id !== review.id)); invalidateCachedData('profile:'); toast.success('Review deleted'); } catch (error) { toast.error('Could not delete review', error.message); } } }]);
  return <View style={styles.screen}><ScreenHeader title="My Reviews" subtitle={`${reviews.length} published`} /><FlatList refreshing={loading} onRefresh={fetchReviews} data={reviews} keyExtractor={(item) => item.id} contentContainerStyle={reviews.length ? styles.list : styles.empty} ListEmptyComponent={!loading ? <EmptyState icon={<MessageSquareText size={44} color={colors.gray400} />} title="No reviews yet" message="Review products after a completed order." actionLabel="View orders" onAction={() => router.push('/orders')} /> : null} renderItem={({ item }) => <View style={styles.card}><View style={styles.header}><Pressable style={styles.product} onPress={() => item.product?.slug && router.push(`/product/${item.product.slug}`)}><Text style={styles.name}>{item.product?.name || 'Product'}</Text><Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('en-PH')}</Text></Pressable><Pressable style={styles.delete} onPress={() => remove(item)}><Trash2 size={17} color={colors.error} /></Pressable></View><StarRating rating={item.rating} size={16} />{item.comment ? <Text style={styles.comment}>{item.comment}</Text> : <Text style={styles.noComment}>No written comment</Text>}<View style={styles.ratingLabel}><Star size={13} color={colors.star} weight="fill" /><Text style={styles.ratingText}>{item.rating} out of 5</Text></View></View>} /></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bgSecondary }, list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl }, empty: { flexGrow: 1 }, card: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white }, header: { flexDirection: 'row', alignItems: 'flex-start' }, product: { flex: 1 }, name: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, date: { ...typography.caption, color: colors.textMuted, marginTop: 2 }, delete: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, comment: { ...typography.body, color: colors.textSecondary, lineHeight: 20 }, noComment: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' }, ratingLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, ratingText: { ...typography.caption, color: colors.textMuted }, });
