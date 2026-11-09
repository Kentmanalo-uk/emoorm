import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeftIcon, CaretRightIcon, ClockIcon, MagnifyingGlassIcon, StorefrontIcon, XIcon,
} from '../src/lib/icons';
import apiClient from '../src/api/client';
import Chip from '../src/components/Chip';
import EmptyArt from '../src/components/EmptyArt';
import ShellPageMenu from '../src/components/ShellPageMenu';
import { StoreCardsSkeleton } from '../src/components/shop/ShopSkeletons';
import StoreListCard from '../src/components/shop/StoreListCard';
import { getCachedData, setCachedData } from '../src/lib/dataCache';
import { fetchMunicipalities } from '../src/lib/referenceData';
import useAuthStore from '../src/store/authStore';
import { font, t, themed } from '../src/theme';
import { PullScrollView } from '../src/components/PullList';

/*
 * The shops directory on phones (web/src/pages/Stores.jsx, is-phone layout,
 * and the phone rules at the end of Stores.css + styles/phone-app.css):
 * a bar with Back, a live "Search stores" field and the page menu, the
 * "Stores" title, town chips, the count, then edge-to-edge shop rows.
 *
 * Home's shortcuts open it filtered: ?open=now (shops whose posted hours say
 * they are open now) and ?pickup=1 (shops offering pickup, in the town shown,
 * else the signed-in buyer's own, else every town). Each is a chip that turns
 * on and off; with one on, the heading and a line say what the list is.
 * ?municipalityId=all: every town, where pickup would pick the buyer's own.
 */

const PAGE_SIZE = 20;
// Each list as it showed last time.
const listKey = (page, q, municipalityId, open, pickup) => `stores-page:${JSON.stringify(
  open || pickup ? [page, q, municipalityId, open, pickup] : [page, q, municipalityId],
)}`;
const one = (v) => (Array.isArray(v) ? v[0] : v) || '';

export default function Stores() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const searchQuery = one(params.q);
  const rawTown = one(params.municipalityId);
  const municipalityId = rawTown === 'all' ? '' : rawTown;
  const openNow = one(params.open) === 'now';
  const pickup = one(params.pickup) === '1';
  const myTown = useAuthStore((s) => s.user?.municipalityId) || '';
  const pickupTown = pickup && rawTown !== 'all' ? (municipalityId || myTown) : '';
  const townFilter = municipalityId || pickupTown;
  const [inputValue, setInputValue] = useState(searchQuery);
  const [focused, setFocused] = useState(false);
  const [municipalities, setMunicipalities] = useState([]);
  const [page, setPage] = useState(1);
  const [kept] = useState(() => getCachedData(listKey(1, searchQuery, townFilter, openNow, pickup)));
  const [stores, setStores] = useState(() => kept?.stores || []);
  const [isLoading, setIsLoading] = useState(() => !kept);
  const [pagination, setPagination] = useState(() => kept?.pagination || { total: 0, totalPages: 0 });
  const latestRequest = useRef(0);
  const scrollRef = useRef(null);
  // The URL as it is now: the type-to-search timer can fire after another
  // change and must not undo it.
  const live = useRef({});
  live.current = {
    q: searchQuery, municipalityId: rawTown, open: openNow ? 'now' : '', pickup: pickup ? '1' : '',
  };

  useEffect(() => {
    let on = true;
    fetchMunicipalities().then((list) => { if (on) setMunicipalities(list || []); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const [pullKey, setPullKey] = useState(0);
  useEffect(() => {
    const request = ++latestRequest.current;
    const key = listKey(page, searchQuery, townFilter, openNow, pickup);
    const saved = getCachedData(key);
    if (saved) {
      setStores(saved.stores || []);
      if (saved.pagination) setPagination(saved.pagination);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    const query = { page, pageSize: PAGE_SIZE };
    // The API filters on `search`; the page keeps `q` in its own URL.
    if (searchQuery) query.search = searchQuery;
    if (townFilter) query.municipalityId = townFilter;
    if (openNow) query.openNow = 1;
    if (pickup) query.pickup = 1;
    apiClient.get('/stores', { params: query })
      .then((res) => {
        if (request !== latestRequest.current) return;
        const list = res.data || [];
        setStores(list);
        if (res.pagination) setPagination(res.pagination);
        setCachedData(key, { stores: list, pagination: res.pagination || { total: list.length, totalPages: 1 } });
      })
      .catch((err) => { console.error('Failed to fetch stores:', err); })
      .finally(() => { if (request === latestRequest.current) setIsLoading(false); });
  }, [searchQuery, page, townFilter, openNow, pickup, pullKey]);

  // Changes q / municipalityId / open / pickup, keeping the others, from page 1.
  const updateParams = (changes) => {
    const next = { ...live.current, ...changes };
    if (['q', 'municipalityId', 'open', 'pickup'].every((k) => (next[k] || '') === (live.current[k] || ''))) return;
    setPage(1);
    router.setParams({
      q: next.q || undefined,
      municipalityId: next.municipalityId || undefined,
      open: next.open || undefined,
      pickup: next.pickup || undefined,
    });
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    const q = inputValue.trim();
    if (q === searchQuery) return undefined;
    const timer = setTimeout(() => updateParams({ q }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const clearSearch = () => {
    setInputValue('');
    updateParams({ q: '' });
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const townName = municipalities.find((m) => m.id === municipalityId)?.name;
  const pickupTownName = municipalities.find((m) => m.id === pickupTown)?.name;
  // The town the list is in, chosen or the buyer's own for pickup.
  const shownTownName = municipalities.find((m) => m.id === townFilter)?.name;
  // Every town: with pickup on, the buyer's own town has to be turned away.
  const allTowns = () => updateParams({ municipalityId: pickup && myTown ? 'all' : '' });
  const filtered = openNow || pickup;
  const showAll = () => { setInputValue(''); updateParams({ q: '', municipalityId: '', open: '', pickup: '' }); };
  // The heading says what the list is.
  const heading = openNow && pickup ? 'Open now for pickup' : openNow ? 'Open now' : pickup ? 'Pickup near you' : 'Stores';
  // An empty quick-filtered list, said truly: "open now" goes by the hours
  // a shop has posted, and a shop with none never counts as open.
  const emptyTitle = openNow
    ? (pickup ? 'No pickup shops show as open right now' : 'No shops show as open right now')
    : `No shops offer pickup${pickupTownName ? ` in ${pickupTownName}` : ''} yet`;
  const emptyText = openNow
    ? 'No shop has posted opening hours that say it is open right now. You can still browse every shop.'
    : 'Try every town, or see every shop.';
  const pickupWhere = pickupTownName ? `in ${pickupTownName}` : 'in every town';
  const filterNote = openNow && pickup
    ? `Shops ${pickupWhere} that offer pickup and whose posted hours say they’re open now`
    : openNow
      ? 'Shops whose posted hours say they’re open right now'
      : `Shops that offer pickup, ${pickupWhere}`;
  const total = pagination.total || 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.bar, { paddingTop: 10 + insets.top }]}>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <CaretLeftIcon size={22} weight="bold" color={t.neutral[900]} />
        </Pressable>
        <View style={[styles.field, focused && styles.fieldFocus]} accessibilityRole="search">
          <MagnifyingGlassIcon size={18} color={t.neutral[500]} />
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={setInputValue}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => updateParams({ q: inputValue.trim() })}
            returnKeyType="search"
            enterKeyHint="search"
            placeholder="Search stores"
            placeholderTextColor={t.neutral[400]}
            accessibilityLabel="Search stores"
            autoCorrect={false}
          />
          {inputValue ? (
            <Pressable style={styles.clear} onPress={clearSearch} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <XIcon size={13} weight="bold" color={t.neutral[0]} />
            </Pressable>
          ) : null}
        </View>
        <ShellPageMenu />
      </View>

      <PullScrollView onPull={() => setPullKey((key) => key + 1)} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.title} accessibilityRole="header">{heading}</Text>
          {/* With a quick filter on, its line says what the list is. */}
          {filtered ? <Text style={styles.subtitle}>{`${filterNote}.`}</Text> : null}
        </View>

        {/* The two quick filters, on and off; on, a chip shows its ×. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.filtersRow}
          accessibilityRole="toolbar"
          accessibilityLabel="Quick filters"
          keyboardShouldPersistTaps="handled"
        >
          <QuickChip Icon={ClockIcon} label="Open now" on={openNow} onPress={() => updateParams({ open: openNow ? '' : 'now' })} />
          <QuickChip
            Icon={StorefrontIcon}
            label="Pickup near you"
            on={pickup}
            onPress={() => updateParams({ pickup: pickup ? '' : '1', municipalityId })}
          />
        </ScrollView>

        {municipalities.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.towns}
            contentContainerStyle={styles.townsRow}
            accessibilityRole="toolbar"
            accessibilityLabel="Filter by town"
            keyboardShouldPersistTaps="handled"
          >
            <Chip variant="suggest" textStyle={styles.townText} label="All towns" active={!townFilter} onPress={allTowns} />
            {municipalities.map((m) => (
              <Chip
                key={m.id}
                variant="suggest"
                textStyle={styles.townText}
                label={m.name}
                active={townFilter === m.id}
                onPress={() => updateParams({ municipalityId: m.id })}
              />
            ))}
          </ScrollView>
        ) : null}

        {!isLoading && (total > 0 || !filtered) ? (
          <Text style={styles.count}>
            {total > 0 ? (
              <>
                <Text style={styles.countStrong}>{total}</Text>
                {` store${total !== 1 ? 's' : ''}`}
                {shownTownName ? ` in ${shownTownName}` : ''}
                {searchQuery ? ` for “${searchQuery}”` : ''}
              </>
            ) : searchQuery ? `No stores match "${searchQuery}"` : 'No stores yet'}
          </Text>
        ) : null}

        {isLoading ? (
          <StoreCardsSkeleton count={6} />
        ) : stores.length === 0 ? (
          <View style={styles.empty}>
            <EmptyArt name="stores" size={96} style={styles.emptyArt} />
            <Text style={styles.emptyTitle} accessibilityRole="header">
              {searchQuery ? `No stores match “${searchQuery}”` : filtered ? emptyTitle : townName ? `No stores in ${townName} yet` : 'No stores yet'}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Check the spelling or try another name.' : filtered ? emptyText : 'Try another town.'}
            </Text>
            {searchQuery || municipalityId || filtered ? (
              <Pressable
                style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
                onPress={showAll}
                accessibilityRole="button"
              >
                <Text style={styles.emptyBtnText}>Show all stores</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {stores.map((store) => <StoreListCard key={store.id} store={store} />)}
          </View>
        )}

        {pagination.totalPages > 1 ? (
          <View style={styles.pagination}>
            <Pressable
              style={[styles.pageBtn, page <= 1 && styles.pageBtnOff]}
              disabled={page <= 1}
              onPress={() => handlePageChange(page - 1)}
              accessibilityRole="button"
            >
              <CaretLeftIcon size={16} color={t.neutral[700]} />
              <Text style={styles.pageBtnText}>Prev</Text>
            </Pressable>
            <Text style={styles.pageInfo}>Page {page} of {pagination.totalPages}</Text>
            <Pressable
              style={[styles.pageBtn, page >= pagination.totalPages && styles.pageBtnOff]}
              disabled={page >= pagination.totalPages}
              onPress={() => handlePageChange(page + 1)}
              accessibilityRole="button"
            >
              <Text style={styles.pageBtnText}>Next</Text>
              <CaretRightIcon size={16} color={t.neutral[700]} />
            </Pressable>
          </View>
        ) : null}
      </PullScrollView>
    </View>
  );
}

/** A quick filter (.stores-fchip): a pill, green-tinted with an × when on. */
function QuickChip({
  Icon, label, on, onPress,
}) {
  const ink = on ? t.primary[700] : t.neutral[700];
  return (
    <Pressable
      style={({ pressed }) => [styles.fchip, on && styles.fchipOn, pressed && !on && styles.fchipPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `${label}, on. Turn off` : label}
    >
      <Icon size={17} weight={on ? 'fill' : 'regular'} color={ink} />
      <Text style={[styles.fchipText, { color: ink }]}>{label}</Text>
      {on ? <View style={styles.fchipX}><XIcon size={12} weight="bold" color={ink} /></View> : null}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 12, paddingBottom: 10, paddingLeft: 6,
    backgroundColor: t.neutral[0], zIndex: 120,
  },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pressed: { backgroundColor: t.neutral[100] },
  field: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 14, paddingRight: 12,
    borderWidth: 1.5, borderColor: 'transparent', borderRadius: 999, backgroundColor: t.neutral[100],
  },
  fieldFocus: { borderColor: t.primary[500], backgroundColor: t.neutral[0] },
  input: {
    flex: 1, minWidth: 0, height: '100%', padding: 0, fontSize: 16, ...font(400), color: t.neutral[900],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  clear: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: t.neutral[300] },

  scroll: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 12 },
  hero: { paddingTop: 14, paddingHorizontal: 4, paddingBottom: 10 },
  title: { fontSize: 22, lineHeight: 25.3, ...font(500), color: t.neutral[900] },
  subtitle: { marginTop: 4, fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },
  // .stores-filters on phones: one row that scrolls, 8 under it.
  filters: { marginHorizontal: -12, flexGrow: 0 },
  filtersRow: { gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  fchip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  fchipPressed: { borderColor: t.primary[300] },
  fchipOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  fchipText: { fontSize: 13.5, lineHeight: 16.2, ...font(500) },
  fchipX: { marginLeft: 2, opacity: 0.8 },
  towns: { marginHorizontal: -12, flexGrow: 0 },
  // The website's chip is a button: its text line is 1.2 tall, not the page's 1.6.
  townText: { lineHeight: 16.2 },
  townsRow: { gap: 8, paddingTop: 2, paddingHorizontal: 12, paddingBottom: 10 },
  count: { marginHorizontal: 4, marginBottom: 10, fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },
  countStrong: { ...font(500), color: t.neutral[900] },
  grid: { gap: 10 },

  // .stores-m-empty
  empty: {
    alignItems: 'center', paddingTop: 36, paddingHorizontal: 20, paddingBottom: 30,
    borderRadius: 16, backgroundColor: t.neutral[0],
  },
  emptyArt: { marginBottom: 0 },
  emptyTitle: { marginBottom: 6, fontSize: 17, lineHeight: 20.4, ...font(500), color: t.neutral[900], textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  emptyBtn: {
    marginTop: 16, height: 38, paddingHorizontal: 22, justifyContent: 'center',
    borderWidth: 1, borderColor: t.primary[600], borderRadius: 999,
  },
  emptyBtnPressed: { backgroundColor: t.primary[50] },
  emptyBtnText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: t.primary[700] },

  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  pageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  pageBtnOff: { opacity: 0.4 },
  pageBtnText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
  pageInfo: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
}));
