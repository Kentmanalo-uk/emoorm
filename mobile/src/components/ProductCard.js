import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { ShoppingCartIcon as ShoppingCart, ImageBrokenIcon as ImageOff } from 'phosphor-react-native';
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
  style,
}) {
  const isList = variant === 'list';

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, isList && styles.cardList, pressed && styles.pressed, style]}>
      <View style={[styles.imageWrap, isList && styles.imageWrapList]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <ImageOff size={24} color={colors.gray400} />
          </View>
        )}
        {onAddToCart ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onAddToCart();
            }}
            style={styles.fab}
            accessibilityRole="button"
            accessibilityLabel={`Add ${name} to cart`}
          >
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
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { minHeight: 88, padding: spacing.md, gap: spacing.xs },
  infoList: { flex: 1, justifyContent: 'center' },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: '500', fontFamily: fontFamily.medium },
  price: { ...typography.body, color: colors.primaryDark, fontWeight: '700', fontFamily: fontFamily.bold },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reviewCount: { ...typography.caption, color: colors.textMuted },
  pressed: { opacity: 0.72 },
});
