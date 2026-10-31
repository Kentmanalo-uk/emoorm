import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InfoIcon, PlusIcon } from '../../../src/lib/icons';
import apiClient from '../../../src/api/client';
import { toast } from '../../../src/lib/toast';
import { font, t, themed } from '../../../src/theme';
import { momentLabel } from '../../../src/lib/availability';
import SellerPage from '../../../src/components/seller/SellerPage';
import EmptyState from '../../../src/components/EmptyState';
import OrderConfirmDialog from '../../../src/components/orders/OrderConfirmDialog';
import WindowCard from '../../../src/components/seller/today/WindowCard';
import { AddMoreSheet, ExtendSheet, MoreSheet } from '../../../src/components/seller/today/TodaySheets';
import { AddFromProductsSheet, MenuMoreSheet, MenuRow } from '../../../src/components/seller/today/MenuParts';
import { dayTitle, manilaDay } from '../../../src/components/seller/today/todayTime';
import { PageLoader } from '../../../src/components/BrandLoader';

/*
 * /seller/today: Today's menu (web/src/pages/SellerToday.jsx + SellerToday.css
 * at phone size), on three tabs. Menu: the shop's Available Today items,
 * posted or not, with Post on each and "Add from My products" (an item on
 * the menu shows to buyers as "Not taking orders yet" until it is posted).
 * Now and coming up: Taking orders now and Coming up (by day). Ended. It
 * opens on Now and coming up when something is posted, else on Menu
 * (?tab=menu|ended picks one). "Post an item" (top right) and Edit open the
 * one-page form (today/post.js, today/[id].js). On a post: Edit and Add more
 * (or Cancel before it opens); ⋯ holds More time and Stop. An ended post can
 * be posted again through the same form.
 */
export default function SellerTodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tab } = useLocalSearchParams();
  const asked = ['menu', 'active', 'ended'].includes(tab) ? tab : null;
  const [scope, setScope] = useState(asked || 'active');
  // Until the first list is in: then Now and coming up, or Menu when nothing is posted.
  const [decided, setDecided] = useState(Boolean(asked));
  const [data, setData] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [extend, setExtend] = useState(null);
  const [adding, setAdding] = useState(null);
  const [more, setMore] = useState(null);
  const [ending, setEnding] = useState(null);
  const [itemMore, setItemMore] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [picking, setPicking] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(false);
  const first = useRef(!asked);

  const load = useCallback(async (which) => {
    let windows = [];
    try {
      const res = await apiClient.get('/today/mine', { params: { scope: which === 'ended' ? 'ended' : undefined } });
      setData(res.data || { enabled: true, windows: [] });
      windows = res.data?.windows || [];
    } catch (err) {
      toast.error(err.message || "Could not load Today's menu");
      setData({ enabled: true, windows: [] });
    }
    if (first.current) {
      first.current = false;
      if (!windows.length) setScope('menu');
      setDecided(true);
    }
  }, []);
  useEffect(() => {
    if (scope === 'menu') return;
    setData(null);
    load(scope);
  }, [scope, load]);

  const loadMenu = useCallback(async () => {
    try {
      const res = await apiClient.get('/today/menu');
      setMenu(res.data || { enabled: true, items: [], choices: [] });
    } catch (err) {
      toast.error(err.message || 'Could not load your menu');
      setMenu((m) => m || { enabled: true, items: [], choices: [] });
    }
  }, []);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  // Back from posting, editing or the product form: show what changed (the first focus is the loads above).
  useFocusEffect(useCallback(() => {
    if (shown.current) {
      loadMenu();
      if (scope !== 'menu') load(scope);
    }
    shown.current = true;
  }, [load, loadMenu, scope]));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMenu(), scope === 'menu' ? null : load(scope)]);
    setRefreshing(false);
  };

  const pickTab = (key) => {
    if (key === scope) return;
    setScope(key);
    if (key === 'menu') loadMenu();
  };

  // Live posts tick over on their own: reload when the next one ends or opens.
  useEffect(() => {
    if (scope !== 'active' || !data?.windows?.length) return undefined;
    const now = Date.now();
    const next = data.windows
      .map((w) => new Date(w.status === 'LIVE' ? w.ordersCloseAt : w.ordersOpenAt).getTime())
      .filter((ms) => ms > now)
      .sort((a, b) => a - b)[0];
    if (!next || next - now > 6 * 3600e3) return undefined;
    const id = setTimeout(() => load('active'), next - now + 65000);
    return () => clearTimeout(id);
  }, [data, scope, load]);

  const replace = (w) => setData((d) => ({ ...d, windows: d.windows.map((x) => (x.id === w.id ? { ...x, ...w } : x)) }));

  const act = async (w, run, done) => {
    setBusyId(w.id);
    try {
      const res = await run();
      if (res?.data?.id) replace(res.data);
      if (done) toast.success(done);
      return res?.data;
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  // The website asks first (confirmAction); here the phone's confirm sheet.
  const endNow = async () => {
    const w = ending;
    const scheduled = w.status === 'SCHEDULED';
    const res = await act(w, () => apiClient.post(`/today/${w.id}/end`), scheduled ? 'Post cancelled' : 'Orders stopped');
    setEnding(null);
    if (res) setData((d) => ({ ...d, windows: d.windows.filter((x) => x.id !== w.id) }));
  };

  const saveExtend = async () => {
    if (extend?.value == null) return;
    const close = new Date(extend.value);
    const w = extend.window;
    const body = { ordersCloseAt: close.toISOString() };
    if (new Date(w.readyUntil) < close) body.readyUntil = close.toISOString();
    const res = await act(w, () => apiClient.patch(`/today/${w.id}`, body), `Orders now close ${momentLabel(close)}`);
    if (res) setExtend(null);
  };

  /** Add more: the total to sell, never below what is already taken. */
  const openAdding = (w) => {
    const taken = w.status === 'LIVE' ? w.quantity - (w.remaining ?? 0) : w.soldCount;
    setAdding({ window: w, total: w.quantity, min: Math.max(1, taken) });
  };
  const saveAdding = async () => {
    const w = adding.window;
    const total = Math.max(adding.min, adding.total);
    const delta = total - w.quantity;
    if (!delta) { setAdding(null); return; }
    const res = await act(w, () => apiClient.post(`/today/${w.id}/quantity`, { delta }), `Now ${total} to sell`);
    if (res) setAdding(null);
  };

  // ── The menu ──────────────────────────────────────────────────────
  const addToMenu = async (product, reset) => {
    setAddingItem(true);
    try {
      await apiClient.post('/today/menu', { productId: product.id });
      toast.success(`${product.name} is on your menu. Post it when you have it.`);
      reset();
      setPicking(false);
      await loadMenu();
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
    } finally {
      setAddingItem(false);
    }
  };

  const removeFromMenu = async () => {
    const item = removing;
    setBusyId(item.id);
    try {
      await apiClient.delete(`/today/menu/${item.id}`);
      toast.success(`${item.name} is off your menu. Set its stock in My products.`);
      setRemoving(null);
      await loadMenu();
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
      setRemoving(null);
    } finally {
      setBusyId(null);
    }
  };

  const today = manilaDay(Date.now());
  const windows = data?.windows || [];
  const live = windows.filter((w) => w.status === 'LIVE');
  const upcoming = windows.filter((w) => w.status === 'SCHEDULED');
  const enabled = data?.enabled !== false && menu?.enabled !== false;
  const items = menu?.items || [];
  const noItems = menu !== null && items.length === 0;
  const ended = scope === 'ended';
  const onMenu = scope === 'menu';
  const empty = data !== null && windows.length === 0;
  const showPost = enabled && items.length > 0;

  const card = (w) => (
    <WindowCard
      key={w.id}
      window={w}
      ended={ended}
      today={today}
      busy={busyId === w.id}
      repeatOff={!enabled}
      onEdit={() => router.push(`/seller/today/${w.id}`)}
      onAdd={() => openAdding(w)}
      onMore={() => setMore(w)}
      onEnd={() => setEnding(w)}
      onRepeat={() => router.push(`/seller/today/post?again=${w.id}`)}
    />
  );

  // Coming up, by the day orders open ("Tomorrow", "Wed, Oct 15").
  const upcomingDays = [];
  for (const w of upcoming) {
    const day = manilaDay(new Date(w.ordersOpenAt).getTime());
    const last = upcomingDays[upcomingDays.length - 1];
    if (last && last.day === day) last.windows.push(w);
    else upcomingDays.push({ day, windows: [w] });
  }

  const scheduledEnd = ending?.status === 'SCHEDULED';
  const createItem = () => router.push('/seller/products/new?type=today');

  let body;
  if (onMenu) {
    if (menu === null) {
      body = <View style={styles.list}><PageLoader label="Loading your menu" /></View>;
    } else if (noItems) {
      body = (
        <View>
          <EmptyState
            page
            art="calendar"
            title="No items on your menu yet"
            text="Add food you sell. Buyers see it as 'Not taking orders yet' until you post it."
            actions={enabled ? [{ label: 'Add from My products', onPress: () => setPicking(true), icon: PlusIcon }] : []}
          />
          <Text style={[styles.create, styles.createCentered]} accessibilityRole="link" onPress={createItem}>Create a new menu item</Text>
        </View>
      );
    } else {
      body = (
        <>
          <View style={styles.menuBar}>
            <Pressable
              accessibilityRole="button"
              disabled={!enabled}
              onPress={() => setPicking(true)}
              style={({ pressed }) => [styles.add, (!enabled || pressed) && styles.off]}
            >
              <PlusIcon size={16} weight="bold" color={t.primary[700]} />
              <Text style={styles.addText}>Add from My products</Text>
            </Pressable>
            <Text style={styles.create} accessibilityRole="link" onPress={createItem}>Create a new menu item</Text>
          </View>
          <View style={styles.list}>
            {items.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                postOff={!enabled}
                onPost={() => router.push(`/seller/today/post?product=${item.id}`)}
                onMore={() => setItemMore(item)}
              />
            ))}
          </View>
        </>
      );
    }
  } else if (!decided || data === null) {
    body = <View style={styles.list} accessibilityState={{ busy: true }}><PageLoader label="Loading today's menu" /></View>;
  } else if (empty) {
    body = noItems ? (
      <EmptyState
        page
        art="calendar"
        title="Nothing to post yet"
        text="Add items to your menu first, then post them."
        actions={[{ label: 'Go to Menu', onPress: () => pickTab('menu'), icon: PlusIcon }]}
      />
    ) : (
      <EmptyState
        page
        art="calendar"
        title={ended ? 'Nothing ended yet' : 'Nothing posted'}
        text={ended ? 'Posts that ended show here, so you can post them again.' : 'Post what you have today.'}
        actions={ended || !enabled ? [] : [{ label: 'Post an item', onPress: () => router.push('/seller/today/post'), icon: PlusIcon }]}
      />
    );
  } else if (ended) {
    body = <View style={styles.list}>{windows.map(card)}</View>;
  } else {
    body = (
      <>
        {live.length > 0 ? (
          <View>
            <Text style={styles.groupTitle} accessibilityRole="header">Taking orders now</Text>
            <View style={styles.list}>{live.map(card)}</View>
          </View>
        ) : null}
        {upcoming.length > 0 ? (
          <View style={live.length > 0 ? styles.groupNext : null}>
            <Text style={styles.groupTitle} accessibilityRole="header">Coming up</Text>
            {upcomingDays.map((g, i) => (
              <View key={g.day} style={i > 0 ? styles.dayNext : null}>
                <Text style={styles.dayTitle} accessibilityRole="header">{dayTitle(g.day, today)}</Text>
                <View style={styles.list}>{g.windows.map(card)}</View>
              </View>
            ))}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.screen}>
    <SellerPage refreshing={refreshing} onRefresh={refresh} contentStyle={styles.content}>
      {!enabled ? (
        <View style={styles.banner}>
          <InfoIcon size={16} color={t.warning[800]} />
          <Text style={styles.bannerText}>Available Today is turned off for now. Your posts are kept; buyers can&apos;t order them.</Text>
        </View>
      ) : null}

      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Show">
        {[['menu', 'Menu'], ['active', 'Now and coming up'], ['ended', 'Ended']].map(([key, label]) => {
          const on = decided && scope === key;
          return (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pickTab(key)} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {body}

      {!onMenu && decided && data !== null && !empty && !ended ? (
        <Text style={styles.foot}>
          New orders show in{' '}
          <Text style={styles.footLink} accessibilityRole="link" onPress={() => router.push('/seller/orders')}>My orders</Text>
          . Confirm them quickly.
        </Text>
      ) : null}

      <AddFromProductsSheet
        open={picking}
        choices={menu?.choices || []}
        busy={addingItem}
        onAdd={addToMenu}
        onClose={() => setPicking(false)}
      />
      <MenuMoreSheet
        item={itemMore}
        onClose={() => setItemMore(null)}
        onEdit={() => {
          const item = itemMore;
          setItemMore(null);
          router.push(`/seller/products/new?edit=${item.id}`);
        }}
        onRemove={() => { const item = itemMore; setItemMore(null); setRemoving(item); }}
      />
      <OrderConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Take ${removing.name} off your menu?` : ''}
        message="It becomes a regular product with 0 in stock. Set its stock in My products to sell it there."
        confirmLabel="Remove from menu"
        danger
        loading={Boolean(removing) && busyId === removing.id}
        onConfirm={removeFromMenu}
        onCancel={() => setRemoving(null)}
      />

      <AddMoreSheet
        adding={adding}
        setAdding={setAdding}
        busy={Boolean(adding) && busyId === adding.window.id}
        onSave={saveAdding}
        onClose={() => setAdding(null)}
      />
      <MoreSheet
        more={more}
        onClose={() => setMore(null)}
        onExtend={() => {
          const w = more;
          setMore(null);
          setExtend({ window: w, value: new Date(w.ordersCloseAt).getTime() + 3600e3 });
        }}
        onEnd={() => { const w = more; setMore(null); setEnding(w); }}
      />
      <ExtendSheet
        extend={extend}
        setExtend={setExtend}
        busy={Boolean(extend) && busyId === extend.window.id}
        onSave={saveExtend}
        onClose={() => setExtend(null)}
      />
      <OrderConfirmDialog
        open={Boolean(ending)}
        title={scheduledEnd ? 'Cancel this post?' : 'Stop taking orders?'}
        message={scheduledEnd
          ? 'It will not open. You can post it again any time.'
          : 'Buyers can no longer order it. Orders already placed stay.'}
        confirmLabel={scheduledEnd ? 'Cancel post' : 'Stop orders'}
        danger
        loading={Boolean(ending) && busyId === ending.id}
        onConfirm={endNow}
        onCancel={() => setEnding(null)}
      />
    </SellerPage>

    {/* "Post an item": all green, held at the bottom right while the page scrolls (.stw-post). */}
    {showPost ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/seller/today/post')}
        style={({ pressed }) => [styles.postBtn, { bottom: 18 + insets.bottom }, pressed && styles.postPressed]}
      >
        <View style={styles.postIcon}><PlusIcon size={18} weight="bold" color="#fff" /></View>
        <Text style={styles.postText}>Post an item</Text>
      </Pressable>
    ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1 },
  // Lets an empty state fill the page and centre in it; room at the end for "Post an item".
  content: { flexGrow: 1, paddingBottom: 100 },

  // .stw-post: all green, floating bottom right
  postBtn: {
    position: 'absolute', right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 48, paddingVertical: 6, paddingLeft: 6, paddingRight: 18,
    borderRadius: 999, backgroundColor: t.primary[700],
  },
  postPressed: { backgroundColor: t.primary[800] },
  postIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  postText: { fontSize: 14.5, lineHeight: 19, ...font(600), color: t.onBrand },
  off: { opacity: 0.6 },

  // .stw-banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: t.warning[50],
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, ...font(400), color: t.warning[800] },

  // .stw-tabs: three choices in one pill
  tabs: { flexDirection: 'row', gap: 4, marginBottom: 16, padding: 4, borderRadius: 999, backgroundColor: t.neutral[200] },
  tab: {
    flexGrow: 1, flexShrink: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 10, borderRadius: 999,
  },
  tabOn: {
    backgroundColor: t.neutral[0],
    shadowColor: '#111827', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  tabText: { fontSize: 14, lineHeight: 19, ...font(400), color: t.neutral[700] },
  tabTextOn: { ...font(600), color: t.neutral[900] },

  // .stw-menu-bar, .stw-add, .stw-create
  menuBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 18, rowGap: 10, marginBottom: 14,
  },
  add: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 42, paddingHorizontal: 16,
    borderWidth: 1, borderStyle: 'dashed', borderColor: t.primary[400], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  addText: { fontSize: 15, lineHeight: 20, ...font(600), color: t.primary[700] },
  create: { fontSize: 14, lineHeight: 20, ...font(400), color: t.primary[700], textDecorationLine: 'underline' },
  createCentered: { alignSelf: 'center', marginTop: -8, marginBottom: 16 },

  // .stw-group-title, .stw-day-title: plain text
  groupNext: { marginTop: 28 },
  groupTitle: { marginBottom: 12, fontSize: 18, lineHeight: 24, ...font(600), color: t.neutral[900] },
  dayNext: { marginTop: 18 },
  dayTitle: { marginBottom: 8, fontSize: 15, lineHeight: 20, ...font(500), color: t.neutral[600] },

  list: { gap: 12 },

  // .stw-foot
  foot: { marginTop: 20, fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[600] },
  footLink: { color: t.primary[700], textDecorationLine: 'underline' },
}));
