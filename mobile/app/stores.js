import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Package, Search, Store as StoreIcon } from 'lucide-react-native';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import EmptyState from '../src/components/EmptyState';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

const PAGE_SIZE = 20;

export default function Stores() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchStores = useCallback(async (targetPage, append) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.STORES.LIST, {
        params: { page: targetPage, pageSize: PAGE_SIZE, search: search || undefined },
      });
      setStores((current) => append ? [...current, ...(res.data || [])] : res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 0);
    } catch (err) {
      toast.error('Failed to load stores', err.message);
      if (!append) setStores([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search]);

  useEffect(() => {
    setPage(1);
    fetchStores(1, false);
  }, [fetchStores]);

  const submitSearch = () => setSearch(input.trim());
  const loadMore = () => {
    if (loading || loadingMore || page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    fetchStores(next, true);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}><ArrowLeft size={21} color={colors.textPrimary} /></Pressable>
        <Text style={styles.headerTitle}>Browse Stores</Text>
        <View style={styles.iconButton} />
      </View>
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={17} color={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submitSearch}
            placeholder="Search stores..."
            placeholderTextColor={colors.gray400}
            returnKeyType="search"
          />
        </View>
        <Pressable style={styles.searchButton} onPress={submitSearch}><Text style={styles.searchButtonText}>Search</Text></Pressable>
      </View>
      {!loading ? <Text style={styles.resultCount}>{total} {total === 1 ? 'store' : 'stores'} found</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon size={48} color={colors.gray400} />}
          title="No stores found"
          message={search ? `No stores match “${search}”` : 'No stores yet'}
          actionLabel={search ? 'Clear Search' : undefined}
          onAction={search ? () => { setInput(''); setSearch(''); } : undefined}
        />
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
          renderItem={({ item }) => <StoreCard store={item} onPress={() => router.push(`/store/${item.slug}`)} />}
        />
      )}
    </View>
  );
}

function StoreCard({ store, onPress }) {
  const initials = store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const logo = store.logoUrl || store.logo;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {logo ? <Image source={{ uri: resolveImg(logo) }} style={styles.logo} /> : <View style={styles.logoFallback}><Text style={styles.initials}>{initials}</Text></View>}
      <View style={styles.cardBody}>
        <Text style={styles.storeName}>{store.name}</Text>
        {store.address ? <View style={styles.metaRow}><MapPin size={13} color={colors.textMuted} /><Text style={styles.metaText} numberOfLines={1}>{store.address}</Text></View> : null}
        {store.description ? <Text style={styles.description} numberOfLines={2}>{store.description}</Text> : null}
        <View style={styles.footerRow}>
          <View style={styles.metaRow}><Package size={13} color={colors.textMuted} /><Text style={styles.metaText}>{store._count?.products || 0} products</Text></View>
          <Text style={[styles.status, store.isActive ? styles.active : styles.inactive]}>{store.isActive ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h3, flex: 1, textAlign: 'center', color: colors.textPrimary },
  searchRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.white },
  searchBar: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.base, backgroundColor: colors.gray100 },
  searchInput: { ...typography.body, flex: 1, color: colors.textPrimary },
  searchButton: { height: 42, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.secondary },
  searchButtonText: { ...typography.caption, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  resultCount: { ...typography.caption, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textSecondary },
  loader: { marginTop: spacing.xxl },
  list: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg },
  logo: { width: 72, height: 72, borderRadius: radius.full, backgroundColor: colors.gray100 },
  logoFallback: { width: 72, height: 72, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgGreenLight },
  initials: { ...typography.h3, color: colors.secondary },
  cardBody: { flex: 1, gap: spacing.xs },
  storeName: { ...typography.h3, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  metaText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  description: { ...typography.caption, color: colors.textSecondary, lineHeight: 17 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  status: { ...typography.caption, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  active: { color: colors.secondary, backgroundColor: colors.bgGreenLight },
  inactive: { color: colors.textMuted, backgroundColor: colors.gray100 },
  footerLoader: { marginVertical: spacing.md },
});
