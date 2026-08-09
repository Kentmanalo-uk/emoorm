import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Heart,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Share2,
  ShoppingCart,
  Store,
} from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import ProductCard from '../../src/components/ProductCard';
import StarRating from '../../src/components/StarRating';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import useCartStore from '../../src/store/cartStore';
import useWishlistStore from '../../src/store/wishlistStore';
import useRequireAuth from '../../src/hooks/useRequireAuth';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { colors, control, fontFamily, radius, spacing, typography } from '../../src/theme';

const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
};

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const activeStatus = (store) => {
  if (store?.isActive) return 'Active now';
  const timestamp = store?.updatedAt || store?.createdAt;
  if (!timestamp) return 'Active recently';
  const elapsedMinutes = Math.max(1, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (elapsedMinutes < 60) return `Active ${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Active ${elapsedHours}hr ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Active ${elapsedDays}d ago`;
};

const RECOMMENDATION_PAGE_SIZE = 10;

export default function ProductDetails() {
  const { slug } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(windowWidth, 720);
  const addItem = useCartStore((state) => state.addItem);
  const toggleWishlist = useWishlistStore((state) => state.toggleItem);
  const requireAuth = useRequireAuth();

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [sameStoreProducts, setSameStoreProducts] = useState([]);
  const [storeProfile, setStoreProfile] = useState(null);
  const [recommendationPage, setRecommendationPage] = useState(1);
  const [recommendationTotalPages, setRecommendationTotalPages] = useState(1);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const recommendationRequestRef = useRef(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const isWishlisted = useWishlistStore((state) => state.items.some((item) => item.id === product?.id));

  const fetchProduct = useCallback(async () => {
    setIsLoading(true);
    try {
      const productRes = await apiClient.get(ENDPOINTS.PRODUCT_BY_SLUG(slug));
      const nextProduct = productRes.data;
      setProduct(nextProduct);
      setSelectedImage(0);
      setQuantity(1);
      setRecommendationPage(1);
      setRecommendationTotalPages(1);
      recommendationRequestRef.current = false;
      setIsLoadingRecommendations(false);

      const [reviewRes, relatedRes, storeRes, storefrontRes] = await Promise.all([
        apiClient.get(ENDPOINTS.REVIEWS.BY_PRODUCT(nextProduct.id)).catch(() => ({ data: [] })),
        apiClient
          .get(ENDPOINTS.PRODUCTS, { params: { categoryId: nextProduct.categoryId, page: 1, pageSize: RECOMMENDATION_PAGE_SIZE } })
          .catch(() => ({ data: [] })),
        apiClient
          .get(ENDPOINTS.PRODUCTS, { params: { storeId: nextProduct.storeId, pageSize: 8 } })
          .catch(() => ({ data: [] })),
        nextProduct.store?.slug
          ? apiClient.get(ENDPOINTS.STORES.STOREFRONT(nextProduct.store.slug)).catch(() => ({ data: nextProduct.store }))
          : Promise.resolve({ data: nextProduct.store }),
      ]);

      setReviews(reviewRes.data || []);
      setRelatedProducts((relatedRes.data || []).filter((item) => item.id !== nextProduct.id));
      setRecommendationTotalPages(relatedRes.pagination?.totalPages || 1);
      setSameStoreProducts((storeRes.data || []).filter((item) => item.id !== nextProduct.id).slice(0, 6));
      setStoreProfile(storefrontRes.data || nextProduct.store);
    } catch (err) {
      toast.error('Failed to load product', err.message);
      router.replace('/products');
    } finally {
      setIsLoading(false);
    }
  }, [router, slug]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const loadMoreRecommendations = useCallback(async () => {
    if (!product || recommendationRequestRef.current || recommendationPage >= recommendationTotalPages) return;
    recommendationRequestRef.current = true;
    setIsLoadingRecommendations(true);
    const nextPage = recommendationPage + 1;
    try {
      const response = await apiClient.get(ENDPOINTS.PRODUCTS, {
        params: {
          categoryId: product.categoryId,
          page: nextPage,
          pageSize: RECOMMENDATION_PAGE_SIZE,
        },
      });
      const nextProducts = (response.data || []).filter((item) => item.id !== product.id);
      setRelatedProducts((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...nextProducts.filter((item) => !existingIds.has(item.id))];
      });
      setRecommendationPage(nextPage);
      setRecommendationTotalPages(response.pagination?.totalPages || recommendationTotalPages);
    } catch (error) {
      toast.error('Could not load more recommendations', error.message);
    } finally {
      recommendationRequestRef.current = false;
      setIsLoadingRecommendations(false);
    }
  }, [product, recommendationPage, recommendationTotalPages]);

  const addProductToCart = () => {
    if (!product) return false;
    try {
      addItem(
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: parseImages(product.images)[0],
          storeId: product.storeId,
          storeName: product.store?.name,
          stock: product.stock,
          slug: product.slug,
          categoryId: product.categoryId,
        },
        quantity
      );
      toast.success('Added to cart');
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to add to cart');
      return false;
    }
  };

  const handleBuyNow = () => {
    requireAuth(() => {
      if (addProductToCart()) router.push('/cart');
    }, `/product/${slug}`);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `${product.name} — ${peso(product.price)}` });
    } catch {
      // Native share cancellations do not need feedback.
    }
  };

  const navigateProduct = (nextSlug) => router.replace(`/product/${nextSlug}`);

  const handleWishlist = () => {
    requireAuth(() => {
      toggleWishlist(product);
      toast.success(isWishlisted ? 'Removed from wishlist' : 'Saved to wishlist');
    }, `/product/${slug}`);
  };

  const handleChat = () => requireAuth(
    () => router.push(`/messages?store=${product.store.id}`),
    `/product/${slug}`
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <ProductDetailsSkeleton topInset={insets.top} width={contentWidth} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Package size={48} color={colors.gray400} />
        <Text style={styles.emptyTitle}>Product not found</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/products')}>
          <Text style={styles.primaryButtonText}>Browse products</Text>
        </Pressable>
      </View>
    );
  }

  const images = parseImages(product.images);
  const averageRating = Number(product.averageRating || 0);
  const reviewCount = product.reviewCount ?? reviews.length;
  const isOutOfStock = product.stock === 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top, minHeight: 56 + insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton} onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>Product Details</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Share product" style={styles.iconButton} onPress={handleShare}>
          <Share2 size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent }) => {
          const distanceFromBottom = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
          if (distanceFromBottom < 700) loadMoreRecommendations();
        }}
        contentContainerStyle={[styles.content, { width: contentWidth, alignSelf: 'center', paddingBottom: 88 + Math.max(insets.bottom, spacing.sm) }]}
      >
        <View style={[styles.gallery, { width: contentWidth }]}>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                setSelectedImage(Math.round(event.nativeEvent.contentOffset.x / contentWidth));
              }}
            >
              {images.map((image, index) => (
                <Image
                  key={`${image}-${index}`}
                  source={{ uri: resolveImg(image) }}
                  style={[styles.heroImage, { width: contentWidth }]}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.imagePlaceholder, { width: contentWidth }]}>
              <Package size={48} color={colors.gray400} />
            </View>
          )}
          {images.length > 1 ? (
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>{selectedImage + 1}/{images.length}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroInfo}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.ratingRow}>
            <StarRating rating={averageRating} size={14} />
            <Text style={styles.ratingText}>{averageRating > 0 ? averageRating.toFixed(1) : 'New'}</Text>
            <View style={styles.divider} />
            <Text style={styles.mutedText}>{reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'}</Text>
          </View>
          <Text style={styles.price}>{peso(product.price)}</Text>

          <View style={styles.deliveryGroup}>
            <View style={styles.infoRow}>
            <MapPin size={17} color={colors.textSecondary} />
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoTitle}>{product.municipality?.name || 'Oriental Mindoro'}</Text>
              <Text style={styles.infoText}>Standard delivery · Ships within 2–3 business days</Text>
            </View>
            </View>
            <View style={styles.infoRow}>
              <CheckCircle2 size={17} color={colors.secondary} />
              <Text style={styles.infoText}>100% Authentic · 7 Days Free Return · Damage guarantee</Text>
            </View>
          </View>

          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>Quantity</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
                style={[styles.stepperButton, quantity <= 1 && styles.disabled]}
                disabled={quantity <= 1}
                onPress={() => setQuantity((current) => Math.max(1, current - 1))}
              >
                <Minus size={16} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                style={[styles.stepperButton, quantity >= product.stock && styles.disabled]}
                disabled={quantity >= product.stock}
                onPress={() => setQuantity((current) => Math.min(product.stock, current + 1))}
              >
                <Plus size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Text style={[styles.stockText, (isOutOfStock || product.stock < 10) && styles.stockLow]}>
              {isOutOfStock ? 'Out of stock' : product.stock < 10 ? `Only ${product.stock} left` : `${product.stock} available`}
            </Text>
          </View>

        </View>

        {product.store ? (
          <View style={styles.storeCard}>
            <View style={styles.storeIdentity}>
              {storeProfile?.logo || storeProfile?.logoUrl ? (
                <Image source={{ uri: resolveImg(storeProfile.logo || storeProfile.logoUrl) }} style={styles.storeAvatarImage} />
              ) : (
                <View style={styles.storeAvatar}><Text style={styles.storeInitials}>{product.store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?'}</Text></View>
              )}
              <View style={styles.storeText}>
                <Text style={styles.storeName}>{product.store.name}</Text>
                <View style={styles.storeStatusRow}>
                  <View style={[styles.storeStatusDot, !storeProfile?.isActive && styles.storeStatusDotInactive]} />
                  <Text style={styles.storeMeta}>{activeStatus(storeProfile || product.store)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.storeActions}>
              <Pressable accessibilityRole="button" style={styles.storeGhostButton} onPress={handleChat}>
                <MessageCircle size={15} color={colors.secondary} />
                <Text style={styles.storeGhostText}>Chat</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.storeButton} onPress={() => router.push(`/store/${product.store.slug}`)}>
                <Text style={styles.storeButtonText}>Visit Store</Text>
                <ChevronRight size={15} color={colors.white} />
              </Pressable>
            </View>
          </View>
        ) : null}

        <DetailSection title="Product Description">
          <Text style={styles.paragraph}>{product.description || 'No description provided by the seller.'}</Text>
        </DetailSection>

        <DetailSection title="Specifications">
          <SpecRow label="Category" value={product.category?.name || '—'} />
          <SpecRow label="Origin" value={product.municipality?.name || 'Oriental Mindoro'} />
          <SpecRow label="Sold by" value={product.store?.name || '—'} />
          <SpecRow label="Stock" value={String(product.stock)} />
          <SpecRow label="SKU" value={product.id?.slice(0, 8).toUpperCase()} />
          <SpecRow label="Listed" value={new Date(product.createdAt).toLocaleDateString()} />
        </DetailSection>

        <DetailSection title={`Reviews${reviewCount > 0 ? ` (${reviewCount})` : ''}`}>
          {reviews.length === 0 ? (
            <Text style={styles.mutedText}>No reviews yet. Be the first to review this product.</Text>
          ) : (
            reviews.slice(0, 10).map((review) => (
              <View key={review.id} style={styles.review}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewInitial}>{review.user?.fullName?.charAt(0) || 'U'}</Text>
                  </View>
                  <View style={styles.reviewAuthor}>
                    <Text style={styles.reviewName}>{review.user?.fullName || 'Anonymous'}</Text>
                    <StarRating rating={review.rating} size={12} />
                  </View>
                  <Text style={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString()}</Text>
                </View>
                {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                {Array.isArray(review.images) && review.images.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewMedia}>
                    {review.images.map((image, index) => (
                      <Image key={`${image}-${index}`} source={{ uri: resolveImg(image) }} style={styles.reviewImage} />
                    ))}
                  </ScrollView>
                ) : null}
                {review.videoUrl ? <ReviewVideo source={review.videoUrl} /> : null}
              </View>
            ))
          )}
        </DetailSection>

        <ProductShelf
          title="From the Same Store"
          products={sameStoreProducts}
          onPress={navigateProduct}
          onMore={product.store ? () => router.push(`/store/${product.store.slug}`) : undefined}
        />
        <RecommendationGrid
          products={relatedProducts}
          onPress={navigateProduct}
          contentWidth={contentWidth}
          isLoading={isLoadingRecommendations}
          hasMore={recommendationPage < recommendationTotalPages}
        />
      </ScrollView>

      <View style={[styles.purchaseBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to wishlist"
          style={styles.wishlistButton}
          onPress={handleWishlist}
        >
          <Heart size={21} color={isWishlisted ? colors.error : colors.textSecondary} fill={isWishlisted ? colors.error : 'transparent'} />
        </Pressable>
        <Pressable accessibilityRole="button" style={[styles.cartButton, isOutOfStock && styles.disabled]} disabled={isOutOfStock} onPress={addProductToCart}>
          <ShoppingCart size={18} color={colors.primaryDark} />
          <Text style={styles.cartButtonText}>Add to Cart</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[styles.buyButton, isOutOfStock && styles.disabled]} disabled={isOutOfStock} onPress={handleBuyNow}>
          <Text style={styles.buyButtonText}>{isOutOfStock ? 'Sold Out' : 'Buy Now'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailSection({ title, children }) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeader}><Text style={styles.sectionTitle}>{title}</Text></View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ProductDetailsSkeleton({ topInset, width, bottomInset }) {
  return (
    <View style={styles.skeletonScreen} accessibilityLabel="Loading product details">
      <View style={[styles.topBar, { paddingTop: topInset, minHeight: 56 + topInset }]}>
        <LoadingSkeleton width={44} height={44} borderRadius={radius.full} />
        <LoadingSkeleton width={130} height={18} />
        <LoadingSkeleton width={44} height={44} borderRadius={radius.full} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ width, alignSelf: 'center', paddingBottom: 96 + bottomInset }}>
        <LoadingSkeleton width={width} height={Math.min(width, 520)} borderRadius={0} />
        <View style={styles.skeletonInfo}>
          <LoadingSkeleton width="82%" height={24} />
          <LoadingSkeleton width="42%" height={16} />
          <LoadingSkeleton width="48%" height={30} />
          <LoadingSkeleton width="100%" height={76} borderRadius={radius.lg} />
          <LoadingSkeleton width="70%" height={44} borderRadius={radius.lg} />
        </View>
        <View style={styles.skeletonInfo}>
          <LoadingSkeleton width="36%" height={20} />
          <LoadingSkeleton width="100%" height={92} />
        </View>
      </ScrollView>
    </View>
  );
}

function SpecRow({ label, value }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function ReviewVideo({ source }) {
  const player = useVideoPlayer(resolveImg(source));
  return <VideoView player={player} style={styles.reviewVideo} nativeControls contentFit="cover" />;
}

function ProductShelf({ title, products, onPress, onMore }) {
  if (!products.length) return null;
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onMore ? (
          <Pressable onPress={onMore} style={styles.shelfMore}>
            <Text style={styles.shelfMoreText}>See more</Text>
            <ChevronRight size={14} color={colors.secondary} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfContent}>
        {products.map((item) => (
          <View key={item.id} style={styles.shelfItem}>
            <ProductCard
              name={item.name}
              price={item.price}
              imageUrl={resolveImg(parseImages(item.images)[0])}
              rating={item.averageRating}
              reviewCount={item.reviewCount}
              onPress={() => onPress(item.slug)}
              style={styles.shelfCard}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function RecommendationGrid({ products, onPress, contentWidth, isLoading, hasMore }) {
  if (!products.length && !isLoading) return null;
  const itemWidth = (contentWidth - spacing.lg * 2 - spacing.md) / 2;
  return (
    <View style={styles.recommendations}>
      <Text style={styles.sectionTitle}>Recommended for You</Text>
      <View style={styles.recommendationGrid}>
        {products.map((item) => (
          <View key={item.id} style={{ width: itemWidth }}>
            <ProductCard
              name={item.name}
              price={item.price}
              imageUrl={resolveImg(parseImages(item.images)[0])}
              rating={item.averageRating}
              reviewCount={item.reviewCount}
              onPress={() => onPress(item.slug)}
              style={styles.recommendationCard}
            />
          </View>
        ))}
        {isLoading ? Array.from({ length: 2 }, (_, index) => (
          <View key={`recommendation-skeleton-${index}`} style={[styles.recommendationSkeleton, { width: itemWidth }]}>
            <LoadingSkeleton width="100%" height={itemWidth} borderRadius={radius.lg} />
            <LoadingSkeleton width="84%" height={14} />
            <LoadingSkeleton width="48%" height={16} />
          </View>
        )) : null}
      </View>
      {!hasMore && products.length > 0 ? <Text style={styles.recommendationEnd}>You’ve reached the end</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bgPrimary },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  topBar: {
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    justifyContent: 'space-between',
  },
  topBarTitle: { ...typography.h3, flex: 1, textAlign: 'center', color: colors.textPrimary },
  iconButton: { width: control.iconSize, height: control.iconSize, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  content: { backgroundColor: colors.bgSecondary },
  gallery: { alignSelf: 'center', backgroundColor: colors.gray100, overflow: 'hidden' },
  heroImage: { aspectRatio: 1 },
  imagePlaceholder: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  imageCounter: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, backgroundColor: 'rgba(17,24,39,0.7)' },
  imageCounterText: { ...typography.caption, color: colors.white },
  heroInfo: { padding: spacing.lg, backgroundColor: colors.white, gap: spacing.lg },
  productName: { ...typography.h1, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingText: { ...typography.caption, color: colors.textPrimary },
  mutedText: { ...typography.body, color: colors.textSecondary },
  divider: { width: 1, height: 16, backgroundColor: colors.borderLight },
  price: { fontSize: 30, lineHeight: 36, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primaryDark },
  deliveryGroup: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray50 },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  infoTextWrap: { flex: 1, gap: 2 },
  infoTitle: { ...typography.body, color: colors.textPrimary },
  infoText: { ...typography.caption, flex: 1, color: colors.textSecondary, lineHeight: 18 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  quantityLabel: { ...typography.body, fontFamily: fontFamily.medium, color: colors.textPrimary },
  stepper: { minHeight: control.compactHeight, flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.gray100 },
  stepperButton: { width: control.iconSize, height: control.compactHeight, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { ...typography.body, width: 40, textAlign: 'center', color: colors.textPrimary },
  stockText: { ...typography.caption, color: colors.textSecondary },
  stockLow: { color: colors.error },
  disabled: { opacity: 0.45 },
  purchaseBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
  buyButton: { flex: 1, height: control.height, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  buyButtonText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  cartButton: { flex: 1.25, height: control.height, flexDirection: 'row', gap: spacing.xs, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  cartButtonText: { ...typography.body, color: colors.primaryDark, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  wishlistButton: { width: control.height, height: control.height, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 },
  primaryButton: { height: 44, paddingHorizontal: spacing.lg, borderRadius: radius.base, backgroundColor: colors.primary, justifyContent: 'center' },
  primaryButtonText: { ...typography.body, color: colors.white },
  storeCard: { marginTop: spacing.md, padding: spacing.lg, backgroundColor: colors.white, gap: spacing.lg },
  storeIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storeAvatar: { width: 46, height: 46, borderRadius: radius.full, backgroundColor: colors.bgGreenLight, alignItems: 'center', justifyContent: 'center' },
  storeAvatarImage: { width: 46, height: 46, borderRadius: radius.full, backgroundColor: colors.gray100 },
  storeInitials: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.secondary },
  storeText: { flex: 1 },
  storeName: { ...typography.h3, color: colors.textPrimary },
  storeStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  storeStatusDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.success },
  storeStatusDotInactive: { backgroundColor: colors.gray400 },
  storeMeta: { ...typography.caption, color: colors.textSecondary },
  storeActions: { flexDirection: 'row', gap: spacing.sm },
  storeGhostButton: { flex: 1, height: control.compactHeight, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg },
  storeGhostText: { ...typography.caption, color: colors.secondary },
  storeButton: { flex: 1.3, height: control.compactHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.secondary },
  storeButtonText: { ...typography.caption, color: colors.white },
  detailCard: { marginTop: spacing.md, backgroundColor: colors.white, overflow: 'hidden' },
  detailHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  sectionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  paragraph: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  specRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  specLabel: { ...typography.caption, width: 100, color: colors.textSecondary },
  specValue: { ...typography.body, flex: 1, color: colors.textPrimary },
  review: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, gap: spacing.sm },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewAvatar: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgGreenLight },
  reviewInitial: { ...typography.body, color: colors.secondary },
  reviewAuthor: { flex: 1, gap: 2 },
  reviewName: { ...typography.body, color: colors.textPrimary },
  reviewDate: { ...typography.caption, color: colors.textMuted },
  reviewComment: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  reviewMedia: { gap: spacing.sm },
  reviewImage: { width: 76, height: 76, borderRadius: radius.base },
  reviewVideo: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.base, backgroundColor: colors.black },
  shelf: { marginTop: spacing.md, paddingVertical: spacing.lg, backgroundColor: colors.white },
  shelfHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shelfMore: { flexDirection: 'row', alignItems: 'center' },
  shelfMoreText: { ...typography.caption, color: colors.secondary },
  shelfContent: { paddingHorizontal: spacing.lg, gap: spacing.md },
  shelfItem: { width: 170 },
  shelfCard: { width: '100%' },
  recommendations: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.white, gap: spacing.md },
  recommendationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  recommendationCard: { width: '100%' },
  recommendationSkeleton: { gap: spacing.sm, marginBottom: spacing.sm },
  recommendationEnd: { ...typography.caption, paddingTop: spacing.sm, textAlign: 'center', color: colors.textMuted },
  skeletonScreen: { flex: 1, backgroundColor: colors.bgSecondary },
  skeletonInfo: { padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.white, marginBottom: spacing.md },
});
