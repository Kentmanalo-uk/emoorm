import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowsDownUpIcon, MagnifyingGlassIcon, MapPinIcon, ShoppingBagIcon, SquaresFourIcon, XIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import Chip from '../src/components/Chip';
import EmptyState from '../src/components/EmptyState';
import ScreenHeader from '../src/components/ScreenHeader';
import TodayCard from '../src/components/TodayCard';
import TodayChoiceSheet from '../src/components/today/TodayChoiceSheet';
import TodaySkeleton from '../src/components/today/TodaySkeleton';
import { isOpen, MODES } from '../src/lib/availability';
import { fetchCategories, fetchMunicipalities } from '../src/lib/referenceData';
import useAuthStore from '../src/store/authStore';
import { font, t } from '../src/theme';

const SORTS = [
  { key: 'ending', label: 'Ending soon' },
  { key: 'newest', label: 'Newest' },
  { key: 'ready', label: 'Ready soonest' },
  { key: 'price-low', label: 'Price: low to high' },
  { key: 'price-high', label: 'Price: high to low' },
];
const PAGE_SIZE = 24;
const one = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * Available Today (web/src/pages/AvailableToday.jsx, phone layout): fresh
 * food and produce local shops sell for a limited time. Near the buyer's town
 * by default; a search box, kind chips, then Where / Category / Sort chips
 * that open choice sheets, all kept in the address (?town, ?mode, ?category,
 * ?sort, ?q, ?delivers) so a view can be shared. Two-column result cards with
 * Load more.
 */
export default function AvailableToday() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Two columns 8px apart inside the body's 12px sides.
  const cell = { width: Math.floor(((screenW - 24 - 8) / 2) * 100) / 100 };
  const user = useAuthStore((s) => s.user);
  const myTown = user?.municipalityId || '';
  const myBarangay = user?.barangay || '';
  const [municipalities, setMunicipalities] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let alive = true;
    fetchMunicipalities().then((list) => { if (alive) setMunicipalities(list || []); }).catch(() => {});
    fetchCategories().then((list) => { if (alive) setCategories(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // "near" (default when signed in): shops in my town or delivering there.
  const town = one(params.town) ?? (myTown ? 'near' : '');
  const mode = one(params.mode) || '';
  const category = one(params.category) || '';
  const sort = one(params.sort) || 'ending';
  const q = one(params.q) || '';
  const delivers = one(params.delivers) === '1' && Boolean(myTown);
  const [draft, setDraft] = useState(q);
  const [sheet, setSheet] = useState(null);

  const set = (patch) => {
    const next = {};
    Object.entries(patch).forEach(([k, v]) => { next[k] = v === '' || v == null ? undefined : v; });
    router.setParams(next);
  };

  // Where: near me, delivers to me, all towns, or one town.
  const where = delivers ? 'delivers' : town === 'near' ? 'near' : (!town || town === 'all') ? 'all' : town;
  const setWhere = (key) => {
    if (key === 'delivers') set({ delivers: '1', town: null });
    else if (key === 'near') set({ delivers: null, town: null });
    else if (key === 'all') set({ delivers: null, town: myTown ? 'all' : null });
    else set({ delivers: null, town: key });
  };
  const townName = municipalities.find((m) => m.id === myTown)?.name;
  const whereOptions = useMemo(() => [
    ...(myTown ? [
      { key: 'near', label: `Near me${townName ? ` (${townName})` : ''}` },
      { key: 'delivers', label: 'Delivers to me' },
    ] : []),
    { key: 'all', label: 'All towns' },
    ...municipalities.map((m) => ({ key: m.id, label: m.name })),
  ], [myTown, townName, municipalities]);
  const categoryOptions = useMemo(() => [{ key: '', label: 'All categories' }, ...categories.map((c) => ({ key: c.id, label: c.name }))], [categories]);
  const labelOf = (options, key, fallback) => options.find((o) => o.key === key)?.label || fallback;

  const query = useMemo(() => {
    const out = { sort, pageSize: PAGE_SIZE };
    if (mode) out.mode = mode;
    if (category) out.categoryId = category;
    if (q) out.search = q;
    if (delivers) {
      out.deliversTo = myTown;
      if (myBarangay) out.barangay = myBarangay;
    } else if (town === 'near' && myTown) {
      out.near = myTown;
    } else if (town && town !== 'near' && town !== 'all') {
      out.municipalityId = town;
    }
    return out;
  }, [sort, mode, category, q, delivers, town, myTown, myBarangay]);

  const [state, setState] = useState({ items: [], total: 0, page: 1, loading: true, enabled: true });
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const load = useCallback(async (page) => {
    const id = ++request.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await apiClient.get('/today', { params: { ...query, page } });
      if (id !== request.current) return;
      const data = res.data || {};
      setState((s) => ({
        items: page === 1 ? data.items || [] : [...s.items, ...(data.items || [])],
        total: data.total || 0,
        page,
        loading: false,
        enabled: data.enabled !== false,
      }));
    } catch {
      if (id === request.current) setState((s) => ({ ...s, loading: false }));
    }
  }, [query]);
  useEffect(() => { load(1); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  };

  const items = state.items.filter((w) => isOpen(w));
  const filtered = Boolean(q || mode || category || (town && town !== 'near') || delivers);
  const clearAll = () => { setDraft(''); set({ q: null, mode: null, category: null, sort: null, delivers: null, town: null }); };

  const results = state.loading && state.page === 1 && !refreshing ? (
    <View style={styles.grid} accessibilityState={{ busy: true }}>
      {Array.from({ length: 4 }, (_, i) => <TodaySkeleton key={i} height={250} radius={12} style={cell} />)}
    </View>
  ) : items.length === 0 ? (
    <EmptyState
      flat
      art="calendar"
      style={styles.empty}
      title={state.enabled ? 'Nothing available right now' : 'Available Today is off for now'}
      text={state.enabled
        ? (filtered ? 'Try other filters, or check back later today.' : 'Shops post fresh food and produce here during the day. Check back soon.')
        : 'Check back later.'}
      actions={filtered && state.enabled
        ? [{ label: 'Clear filters', onPress: clearAll, icon: XIcon }]
        : [{ label: 'Browse products', onPress: () => router.push('/products'), icon: ShoppingBagIcon }]}
    />
  ) : (
    <>
      <View style={styles.grid}>
        {items.map((item) => <TodayCard key={item.id} item={item} result style={cell} />)}
      </View>
      {state.items.length < state.total ? (
        <Pressable
          accessibilityRole="button"
          disabled={state.loading}
          onPress={() => load(state.page + 1)}
          style={({ pressed }) => [styles.more, pressed && styles.morePressed, state.loading && styles.moreBusy]}
        >
          <Text style={styles.moreText}>{state.loading ? 'Loading…' : 'Load more'}</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Available Today" />
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
      >
        <View style={[styles.page, { minHeight: screenH * 0.6 }]}>
          <View style={styles.top}>
            <View style={styles.search} accessibilityRole="search">
              <MagnifyingGlassIcon size={18} color={t.neutral[500]} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => set({ q: draft.trim() })}
                placeholder="Search today's food and produce"
                placeholderTextColor={t.neutral[500]}
                accessibilityLabel="Search Available Today"
                returnKeyType="search"
                enterKeyHint="search"
                autoCorrect={false}
                style={styles.searchInput}
              />
              {draft ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setDraft(''); set({ q: null }); }} style={styles.searchClear}>
                  <XIcon size={14} weight="bold" color={t.neutral[600]} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={styles.chipRowInner}
              accessibilityRole="tablist"
              accessibilityLabel="Kind"
            >
              {[{ key: '', label: 'All' }, ...MODES].map((m) => (
                <Chip key={m.key || 'all'} variant="pill" label={m.label} active={mode === m.key} onPress={() => set({ mode: m.key })} />
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.chipRowInner}>
              <Chip
                variant="today"
                icon={MapPinIcon}
                caret
                active={where !== (myTown ? 'near' : 'all')}
                label={labelOf(whereOptions, where, 'All towns')}
                onPress={() => setSheet('where')}
              />
              <Chip
                variant="today"
                icon={SquaresFourIcon}
                caret
                active={Boolean(category)}
                label={category ? labelOf(categoryOptions, category, 'Category') : 'Category'}
                onPress={() => setSheet('category')}
              />
              <Chip
                variant="today"
                icon={ArrowsDownUpIcon}
                caret
                active={sort !== 'ending'}
                label={labelOf(SORTS, sort, 'Sort')}
                onPress={() => setSheet('sort')}
              />
            </ScrollView>
          </View>

          <View style={styles.body}>
            {!state.loading && items.length > 0 ? (
              <View style={styles.count}>
                <Text style={styles.countText}>
                  <Text style={styles.countStrong}>{state.total}</Text>
                  {' '}available{delivers ? ' · delivered to your address' : ''}
                </Text>
                {filtered ? (
                  <Pressable accessibilityRole="button" onPress={clearAll} hitSlop={8} style={styles.clear}>
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {results}
          </View>
        </View>
      </ScrollView>

      <TodayChoiceSheet
        open={sheet === 'where'}
        title="Where"
        options={whereOptions}
        value={where}
        onPick={setWhere}
        onClose={() => setSheet(null)}
      />
      <TodayChoiceSheet
        open={sheet === 'category'}
        title="Category"
        options={categoryOptions}
        value={category}
        onPick={(key) => set({ category: key })}
        onClose={() => setSheet(null)}
      />
      <TodayChoiceSheet
        open={sheet === 'sort'}
        title="Sort by"
        options={SORTS}
        value={sort}
        onPick={(key) => set({ sort: key === 'ending' ? null : key })}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  page: { paddingBottom: 32, backgroundColor: t.neutral[100] },

  top: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: t.neutral[0] },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginBottom: 10, paddingLeft: 14, paddingRight: 8,
    borderWidth: 1, borderColor: 'transparent', borderRadius: 999, backgroundColor: t.neutral[100],
  },
  searchInput: {
    flex: 1, minWidth: 0, height: '100%', padding: 0, fontSize: 15, ...font(400), color: t.neutral[900],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  searchClear: {
    width: 28, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: t.neutral[200],
  },
  chipRow: { flexGrow: 0, marginHorizontal: -16, marginBottom: 10 },
  filterRow: { flexGrow: 0, marginHorizontal: -16 },
  chipRowInner: { gap: 8, paddingHorizontal: 16 },

  body: { paddingTop: 12, paddingHorizontal: 12 },
  count: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginHorizontal: 4, marginBottom: 10 },
  countText: { fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[600] },
  countStrong: { ...font(500), color: t.neutral[900] },
  clear: { marginLeft: 'auto' },
  clearText: { fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.primary[700] },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  empty: { marginHorizontal: -12 },

  more: {
    alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44, marginTop: 16, paddingHorizontal: 20,
    borderWidth: 1, borderColor: t.primary[600], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  morePressed: { backgroundColor: t.primary[50] },
  moreBusy: { opacity: 0.6 },
  moreText: { fontSize: 16, lineHeight: 24, ...font(500), color: t.primary[700] },
});
