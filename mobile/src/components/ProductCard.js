import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { ShoppingCart, ImageOff } from 'lucide-react-native';
import { colors, fontFamily, radius, spacing, typography } from '../theme';
import StarRating from './StarRating';

// Mirrors the product card in web/src/pages/Home.jsx (image, name, price, rating, review count, add-to-cart FAB).
// `imageUrl` is expected to already be a fully resolved URL — Phase 3 wires up the resolveImg equivalent.
export default function ProductCard({
  name,
  price,
  imageUrl,
  rating = 0,
  reviewCount = 0,
  variant = 'grid',
  onPress,
  onAddToCart,
}) {
  const isList = variant === 'list';

  return (
    <Pressable onPress={onPress} style={[styles.card, isList && styles.cardList]}>
      <View style={[styles.imageWrap, isList && styles.imageWrapList]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <ImageOff size={24} color={colors.gray400} />
          </View>
        )}
        {onAddToCart ? (
          <Pressable onPress={onAddToCart} style={styles.fab} hitSlop={8}>
            <ShoppingCart size={16} color={colors.white} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.info, isList && styles.infoList]}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.price}>₱{Number(price ?? 0).toFixed(2)}</Text>
        <View style={styles.ratingRow}>
          <StarRating rating={rating} size={11} />
          <Text style={styles.reviewCount}>({reviewCount})</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  cardList: {
    width: '100%',
    flexDirection: 'row',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.gray100,
  },
  imageWrapList: {
    width: 96,
    aspectRatio: undefined,
    height: 96,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: spacing.sm, gap: 2 },
  infoList: { flex: 1, justifyContent: 'center' },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: '500', fontFamily: fontFamily.medium },
  price: { ...typography.body, color: colors.primaryDark, fontWeight: '700', fontFamily: fontFamily.bold },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reviewCount: { ...typography.caption, color: colors.textMuted },
});
