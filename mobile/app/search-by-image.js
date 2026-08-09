import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, ImagePlus, PackageSearch } from 'lucide-react-native';
import { API_BASE_URL } from '../src/lib/config';
import { ENDPOINTS } from '../src/api/endpoints';
import ProductCard from '../src/components/ProductCard';
import useCartStore from '../src/store/cartStore';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

export default function SearchByImage() {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [asset, setAsset] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchAsset = async (nextAsset) => {
    setAsset(nextAsset);
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('image', nextAsset.file || {
        uri: nextAsset.uri,
        name: nextAsset.fileName || `image-search-${Date.now()}.jpg`,
        type: nextAsset.mimeType || 'image/jpeg',
      });
      const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCT_IMAGE_SEARCH}`, { method: 'POST', body: form });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'Image search failed');
      setResults(json.data?.results || []);
    } catch (err) {
      setResults([]);
      setError(err.message || 'Image search failed');
      toast.error(err.message || 'Image search failed');
    } finally {
      setLoading(false);
    }
  };

  const chooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Photo permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) searchAsset(result.assets[0]);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return toast.error('Camera permission is required');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) searchAsset(result.assets[0]);
  };

  const addToCart = (product) => {
    try {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0],
        slug: product.slug,
        storeId: product.storeId,
        storeName: product.store?.name,
        stock: product.stock,
        categoryId: product.categoryId,
      });
      toast.success('Added to cart');
    } catch (err) {
      toast.error(err.message || 'Failed to add to cart');
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}><ArrowLeft size={21} color={colors.textPrimary} /></Pressable>
        <Text style={styles.headerTitle}>Search by Image</Text>
        <View style={styles.iconButton} />
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Find visually similar products</Text>
            <Text style={styles.subtitle}>Take a clear photo of one product or choose an image from your gallery.</Text>
            <View style={styles.preview}>
              {asset ? <Image source={{ uri: asset.uri }} style={styles.previewImage} resizeMode="cover" /> : <><PackageSearch size={46} color={colors.gray400} /><Text style={styles.previewText}>No image selected</Text></>}
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.cameraButton} onPress={takePhoto}><Camera size={18} color={colors.white} /><Text style={styles.cameraText}>Take Photo</Text></Pressable>
              <Pressable style={styles.libraryButton} onPress={chooseFromLibrary}><ImagePlus size={18} color={colors.secondary} /><Text style={styles.libraryText}>Choose Image</Text></Pressable>
            </View>
            {loading ? <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={styles.statusText}>Analyzing image...</Text></View> : null}
            {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!loading && asset && !error && results.length === 0 ? <Text style={styles.emptyText}>No similar products found. Try a clearer photo of a single product.</Text> : null}
            {!loading && results.length > 0 ? <Text style={styles.resultTitle}>{results.length} similar {results.length === 1 ? 'product' : 'products'}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <View style={styles.matchBadge}><Text style={styles.matchText}>{item.matchSimilarity}% match</Text></View>
            <ProductCard name={item.name} price={item.price} imageUrl={resolveImg(item.images?.[0])} reviewCount={item.reviewCount} onPress={() => router.push(`/product/${item.slug}`)} onAddToCart={() => addToCart(item)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h3, flex: 1, textAlign: 'center', color: colors.textPrimary },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.body, marginTop: spacing.xs, marginBottom: spacing.md, color: colors.textSecondary, lineHeight: 20 },
  preview: { height: 250, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, backgroundColor: colors.white, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  previewText: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cameraButton: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.base, backgroundColor: colors.secondary },
  cameraText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  libraryButton: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.secondary, borderRadius: radius.base, backgroundColor: colors.white },
  libraryText: { ...typography.body, color: colors.secondary },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  statusText: { ...typography.body, color: colors.textSecondary },
  errorText: { ...typography.body, padding: spacing.lg, textAlign: 'center', color: colors.error },
  emptyText: { ...typography.body, padding: spacing.lg, textAlign: 'center', color: colors.textSecondary },
  resultTitle: { ...typography.h3, marginTop: spacing.xl, marginBottom: spacing.md, color: colors.textPrimary },
  gridRow: { gap: spacing.sm },
  gridItem: { flex: 1, marginBottom: spacing.sm },
  matchBadge: { position: 'absolute', zIndex: 2, top: spacing.xs, left: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.base, backgroundColor: 'rgba(5,150,105,0.92)' },
  matchText: { fontSize: 10, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
});
