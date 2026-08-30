import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MagnifyingGlassIcon as Search, TagIcon as Tag, XIcon as X } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import ScreenHeader from '../../src/components/ScreenHeader';
import EmptyState from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/SkeletonLayouts';
import useChatAttachmentStore from '../../src/store/chatAttachmentStore';
import { colors, radius, spacing, typography } from '../../src/theme';

// Dedicated picker page pushed from the conversation composer's product ("Tag") button.
// Selecting a product stashes it in chatAttachmentStore and pops back to the thread,
// where the pending product is picked up and attached to the draft message.
export default function SelectProduct() {
  const router = useRouter();
  const { storeId, storeName } = useLocalSearchParams();
  const setPendingProduct = useChatAttachmentStore((s) => s.setPendingProduct);

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!storeId) {
      setIsLoading(false);
      return undefined;
    }
    apiClient
      .get(ENDPOINTS.PRODUCTS, { params: { storeId, pageSize: 100 } })
      .then((res) => { if (!cancelled) setProducts(res.data || []); })
      .catch((err) => { if (!cancelled) toast.error('Failed to load products', err.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [storeId]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((p) => p.name.toLowerCase().includes(normalized));
  }, [products, query]);

  const handleSelect = (product) => {
    setPendingProduct({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0],
    });
    router.back();
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Select a product" subtitle={storeName ? `From ${storeName}` : undefined} />
      <View style={styles.searchWrap}>
        <Search size={17} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search products"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search store products"
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
            <X size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ListSkeleton rows={6} imageSize={52} />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filteredProducts.length ? styles.list : styles.emptyList}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Attach ${item.name} to message`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => handleSelect(item)}
            >
              {item.images?.[0] ? (
                <Image source={{ uri: resolveImg(item.images[0]) }} style={styles.rowImage} />
              ) : (
                <View style={[styles.rowImage, styles.rowImageFallback]}><Tag size={20} color={colors.gray400} /></View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.rowPrice}>₱{Number(item.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Tag size={44} color={colors.gray400} />}
              title={query ? 'No products found' : 'No products yet'}
              message={query ? 'Try another product name.' : 'This store has no listed products.'}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  searchWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray100 },
  searchInput: { ...typography.body, flex: 1, minWidth: 0, paddingVertical: spacing.sm, color: colors.textPrimary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  emptyList: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.gray50 },
  rowPressed: { backgroundColor: colors.gray100 },
  rowImage: { width: 52, height: 52, borderRadius: radius.base, backgroundColor: colors.gray100 },
  rowImageFallback: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { ...typography.body, color: colors.textPrimary },
  rowPrice: { ...typography.caption, color: colors.primaryDark, fontFamily: 'Inter_600SemiBold' },
});
