import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  BellIcon, BellSlashIcon, MagnifyingGlassIcon, UserMinusIcon, XIcon,
} from '../src/lib/icons';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import { ProfileEmpty } from '../src/components/profile/ProfileUI';
import Select from '../src/components/Select';
import { errorText } from '../src/components/profile/profileLib';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { invalidateCachedData } from '../src/lib/dataCache';
import { font, t, themed } from '../src/theme';
import { PageLoader } from '../src/components/BrandLoader';
import { useStorePeek } from '../src/components/peek/StorePeek';

const SORTS = [
  { value: 'recent', label: 'Recently followed' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
];

function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return v;
}

/**
 * /profile/followed-stores (web/src/pages/ProfileFollowedStores.jsx): search
 * and sort the shops followed, each card with Notifying/Muted, View shop and
 * Unfollow.
 */
export default function FollowedStores() {
  const router = useRouter();
  const [rawSearch, setRawSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [focused, setFocused] = useState(false);
  const search = useDebounce(rawSearch, 300);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/follows/me', { params: { search, sort } });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(errorText(err, 'Failed to load followed stores'));
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  // Again on coming back (a follow changed on a shop's page, as the website's
  // cross-tab follow sync does).
  useFocusEffect(useCallback(() => { fetchList(); }, [fetchList]));

  const handleUnfollow = async (storeId, storeName) => {
    setBusyId(storeId);
    try {
      await apiClient.delete(`/follows/${storeId}`);
      setItems((list) => list.filter((it) => it.store.id !== storeId));
      invalidateCachedData('profile:');
      toast.success(`Unfollowed ${storeName}`);
    } catch (err) {
      toast.error(errorText(err, 'Failed to unfollow'));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleNotifs = async (storeId, enabled) => {
    setBusyId(storeId);
    try {
      const res = await apiClient.patch(`/follows/${storeId}/notifications`, { enabled: !enabled });
      setItems((list) => list.map((it) => (it.store.id === storeId
        ? { ...it, notificationsEnabled: res.data.notificationsEnabled }
        : it)));
      toast.success(res.data.notificationsEnabled ? 'Notifications enabled' : 'Notifications muted');
    } catch (err) {
      toast.error(errorText(err, 'Failed to update notifications'));
    } finally {
      setBusyId(null);
    }
  };

  const isEmpty = !loading && items.length === 0;
  const hasFilters = !!search.trim();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Followed Stores" backTo="/profile" />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Get updates when your favorite stores add new products.</Text>

        <View style={styles.toolbar}>
          <View style={styles.search}>
            <TextInput
              value={rawSearch}
              onChangeText={setRawSearch}
              placeholder="Search followed stores…"
              placeholderTextColor={t.neutral[500]}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="search"
              style={[styles.searchInput, focused && styles.searchFocus]}
            />
            <View style={styles.searchIcon} pointerEvents="none">
              <MagnifyingGlassIcon size={16} color={t.neutral[500]} />
            </View>
            {rawSearch ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setRawSearch('')} style={styles.searchClear}>
                <XIcon size={14} color={t.neutral[500]} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.sort}>
            <Text style={styles.sortLabel}>Sort:</Text>
            <View>
              <Select
                title="Sort followed stores"
                value={sort}
                options={SORTS}
                onChange={setSort}
                style={styles.sortSelect}
                textStyle={styles.sortText}
              />
            </View>
          </View>
        </View>

        {loading ? (
          <StoreCardsSkeleton count={4} />
        ) : isEmpty ? (
          <ProfileEmpty
            page
            style={styles.emptyCard}
            art={hasFilters ? 'search' : 'following'}
            title={hasFilters ? 'No stores match your search' : 'You are not following any stores yet'}
            hint={hasFilters
              ? 'Try a different keyword or clear the search.'
              : 'Discover local sellers and follow them to see their newest products first.'}
            action="Discover Stores"
            onAction={() => router.push('/stores')}
          />
        ) : (
          <View style={styles.grid}>
            {items.map((it) => (
              <FollowedStoreCard
                key={it.id}
                item={it}
                busy={busyId === it.store.id}
                onOpen={() => router.push(`/store/${it.store.slug}`)}
                onUnfollow={() => handleUnfollow(it.store.id, it.store.name)}
                onToggleNotifs={() => handleToggleNotifs(it.store.id, it.notificationsEnabled)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function FollowedStoreCard({ item, busy, onOpen, onUnfollow, onToggleNotifs }) {
  const { store, notificationsEnabled } = item;
  const initials = store.name
    ? store.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  // Held: the shop's preview, with Unfollow instead of Follow.
  const peek = useStorePeek()(store, {
    onOpen,
    follow: false,
    extra: [{ key: 'unfollow', label: 'Unfollow', Icon: UserMinusIcon, destructive: true, onPress: onUnfollow }],
  });

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            {store.logo
              ? <Image source={{ uri: resolveImg(store.logo) }} style={styles.avatarImg} accessibilityLabel={store.name} />
              : <Text style={styles.initials}>{initials}</Text>}
          </View>
          <View style={styles.title}>
            <Pressable accessibilityRole="link" onPress={onOpen} {...peek}>
              {({ pressed }) => <Text style={[styles.name, pressed && { color: t.primary[600] }]} numberOfLines={1}>{store.name}</Text>}
            </Pressable>
            <Text style={styles.location} numberOfLines={1}>
              {[store.municipality?.name, `${store.followerCount ?? 0} ${store.followerCount === 1 ? 'Follower' : 'Followers'}`].filter(Boolean).join('  |  ')}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notificationsEnabled ? 'Mute notifications' : 'Enable notifications'}
            onPress={onToggleNotifs}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              notificationsEnabled ? styles.btnGhost : styles.btnMuted,
              pressed && { backgroundColor: notificationsEnabled ? t.primary[100] : t.neutral[200] },
              busy && styles.btnOff,
            ]}
          >
            {notificationsEnabled
              ? <BellIcon size={14} color={t.primary[600]} />
              : <BellSlashIcon size={14} color={t.neutral[500]} />}
            <Text style={[styles.btnText, { color: notificationsEnabled ? t.primary[600] : t.neutral[500] }]} numberOfLines={1}>
              {notificationsEnabled ? 'Notifying' : 'Muted'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={onOpen}
            style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && { borderColor: t.primary[600] }]}
          >
            {({ pressed }) => (
              <Text style={[styles.btnText, { color: pressed ? t.primary[600] : t.neutral[600] }]} numberOfLines={1}>View shop</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onUnfollow}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { backgroundColor: t.danger[100] }, busy && styles.btnOff]}
          >
            <Text style={[styles.btnText, { color: t.danger[700] }]} numberOfLines={1}>Unfollow</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** StoreCardsSkeleton (web PageSkeletons): a logo, two lines and three thumbs per card. */
function StoreCardsSkeleton({ count = 4 }) {
  return <PageLoader label="Loading shops" />;
}

const CARD_SHADOW = '0px 1px 2px rgba(15, 23, 42, 0.04)';

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  subtitle: { marginTop: 4, fontSize: 13.5, lineHeight: 21.6, color: t.neutral[500], ...font(400) },

  toolbar: { gap: 8 },
  search: { position: 'relative', justifyContent: 'center' },
  searchInput: {
    minHeight: 44, paddingVertical: 9, paddingLeft: 36, paddingRight: 34, borderWidth: 1, borderColor: 'transparent', borderRadius: 999,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 16, lineHeight: 24, boxShadow: CARD_SHADOW, ...font(400),
  },
  searchFocus: { borderColor: t.primary[600] },
  searchIcon: { position: 'absolute', left: 12 },
  searchClear: { position: 'absolute', right: 4, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  sort: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sortLabel: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  // .profile-main .followed-sort .ui-select on phones.
  sortSelect: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'transparent', borderRadius: 10, backgroundColor: t.neutral[0] },
  sortText: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto', fontSize: 14, lineHeight: 20, color: t.neutral[900] },

  grid: { gap: 0 },
  // No card around it: a plain row, a hairline between shops.
  card: { backgroundColor: t.neutral[0], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.neutral[200] },
  body: { gap: 14, paddingTop: 6, paddingBottom: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  avatarImg: { width: '100%', height: '100%' },
  initials: { fontSize: 20, lineHeight: 26, color: t.onBrand, ...font(500) },
  title: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 18, lineHeight: 23, color: t.neutral[900], ...font(600) },
  location: { fontSize: 13.5, lineHeight: 18, color: t.neutral[500], ...font(400) },
  actions: { flexDirection: 'row', gap: 6 },
  btn: {
    flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent',
  },
  btnGhost: { backgroundColor: t.primary[50] },
  btnMuted: { backgroundColor: t.neutral[100] },
  btnOutline: { borderColor: t.neutral[200] },
  btnDanger: { backgroundColor: t.danger[50] },
  btnOff: { opacity: 0.6 },
  btnText: { fontSize: 12.5, lineHeight: 15, ...font(500) },

  emptyCard: { marginHorizontal: -12, backgroundColor: t.neutral[0] },

  skCard: { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: t.neutral[150], backgroundColor: t.neutral[0] },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skLines: { flex: 1, gap: 8 },
  skThumbs: { flexDirection: 'row', gap: 6 },
}));
