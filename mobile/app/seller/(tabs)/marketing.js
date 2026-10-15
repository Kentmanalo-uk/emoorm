import { useCallback, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  LockSimpleIcon, MegaphoneIcon, PackageIcon, PaintBrushIcon, ShareNetworkIcon, TagIcon, UsersIcon,
} from 'phosphor-react-native';
import apiClient from '../../../src/api/client';
import { toast } from '../../../src/lib/toast';
import { BACKEND_URL, resolveImg } from '../../../src/lib/media';
import { getCacheEntry, setCachedData } from '../../../src/lib/dataCache';
import EmptyState from '../../../src/components/EmptyState';
import LoadingSkeleton from '../../../src/components/LoadingSkeleton';
import SellerPage from '../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import { setupNextTo } from '../../../src/components/seller/sellerSetup';
import { sellerHref } from '../../../src/components/seller/sellerRoutes';
import { meStyles } from '../../../src/components/seller/me/MeParts';
import ToolIcon from '../../../src/components/seller/marketing/ToolIcon';
import ShopVouchers from '../../../src/components/seller/marketing/ShopVouchers';
import AnnounceSheet from '../../../src/components/seller/marketing/AnnounceSheet';
import { getSellerFollowerStats, shortDate } from '../../../src/components/seller/marketing/marketingLib';
import { font, t } from '../../../src/theme';
import { PageLoader } from '../../../src/components/BrandLoader';

/*
 * /seller/marketing (web/src/pages/SellerMarketing.jsx + SellerApp.css
 * .smk-*): ways a seller brings buyers back. Tell followers something new
 * (a shop announcement, or one product to look at), share the shop link,
 * decorate the shop, and give buyers voucher codes. Every announcement lands
 * in the followers' notifications and is listed here with how many it
 * reached. The bar is SellerPage's tab header ("Marketing", bell, ⋯).
 */

const FOLLOWERS_KEY = 'seller:followers';
const FEED_KEY = 'seller:announcements';
const PRODUCTS_KEY = 'seller:approved-products';

export default function SellerMarketingScreen() {
  const router = useRouter();
  const { store, setup } = useSellerShell();
  // As they were last time, while they are asked for again.
  const [followers, setFollowers] = useState(() => getCacheEntry(FOLLOWERS_KEY)?.data || null);
  const [feed, setFeed] = useState(() => getCacheEntry(FEED_KEY)?.data || null);
  const [products, setProducts] = useState(() => getCacheEntry(PRODUCTS_KEY)?.data || []);
  const [composer, setComposer] = useState(null); // 'announce' | 'promote' | null
  const [message, setMessage] = useState('');
  const [productId, setProductId] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Remounted after a refresh, so the vouchers are read again too.
  const [vouchersKey, setVouchersKey] = useState(0);

  const loadFeed = useCallback(() => apiClient.get('/stores/my/announcements')
    .then((res) => {
      setFeed(res.data);
      setCachedData(FEED_KEY, res.data);
    })
    .catch(() => setFeed({ announcements: [], remaining: 0, dailyLimit: 2, canSend: false })), []);

  const storeId = store?.id;
  const loadShop = useCallback(() => {
    if (!storeId) return Promise.resolve();
    return Promise.all([
      getSellerFollowerStats(storeId)
        .then((data) => {
          setFollowers(data);
          setCachedData(FOLLOWERS_KEY, data);
        })
        .catch(() => setFollowers(false)),
      apiClient.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 50 } })
        .then((res) => {
          setProducts(res.data || []);
          setCachedData(PRODUCTS_KEY, res.data || []);
        })
        .catch(() => setProducts([])),
    ]);
  }, [storeId]);

  // The website reads these each time the page opens; a tab stays open, so read them each time it is shown.
  useFocusEffect(useCallback(() => { loadFeed(); loadShop(); }, [loadFeed, loadShop]));

  const refresh = async () => {
    setRefreshing(true);
    setVouchersKey((k) => k + 1);
    await Promise.all([loadFeed(), loadShop()]);
    setRefreshing(false);
  };

  const canSend = feed?.canSend !== false;
  // Why sending is off: the shop is private, closed, or cannot sell yet.
  const blockedReason = feed?.blockedReason || 'You can message followers once your shop is public.';
  const finishTo = feed?.blocked === 'NOT_READY' ? setupNextTo(setup) : null;
  const followerCount = followers ? followers.total : 0;
  const newThisWeek = followers ? followers.last7Days : 0;

  const open = (mode) => {
    if (!canSend) {
      toast.info(blockedReason);
      return;
    }
    if (feed && feed.remaining === 0) {
      toast.info(`You've sent ${feed.dailyLimit} today. Try again tomorrow.`);
      return;
    }
    setMessage('');
    setProductId(mode === 'promote' ? (products[0]?.id || '') : '');
    setComposer(mode);
  };

  const shareShop = () => {
    if (!store?.slug) return;
    const url = `${BACKEND_URL}/store/${store.slug}`;
    Share.share({ title: store.name, message: `Shop at ${store.name} on Emoorm\n${url}`, url }).catch(() => {});
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await apiClient.post('/stores/my/announcements', {
        message: message.trim(),
        ...(composer === 'promote' && productId ? { productId } : {}),
      });
      toast.success(res.message || 'Sent to your followers');
      setComposer(null);
      // Read the list (and what's left today) again.
      loadFeed();
    } catch (err) {
      toast.error(err.message || 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const tools = [
    { key: 'announce', label: 'Announce', Icon: MegaphoneIcon, tone: 'orange', onPress: () => open('announce') },
    { key: 'promote', label: 'Promote a product', Icon: TagIcon, tone: 'violet', onPress: () => open('promote') },
    { key: 'share', label: 'Share shop', Icon: ShareNetworkIcon, tone: 'blue', onPress: shareShop },
    { key: 'decorate', label: 'Decorate', Icon: PaintBrushIcon, tone: 'pink', onPress: () => router.push('/seller/decorate') },
  ];

  return (
    <SellerPage refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.body}>
        {/* Followers: who hears about what's new. */}
        <View style={[meStyles.card, styles.hero]}>
          <View style={styles.heroIcon}><UsersIcon size={22} weight="fill" color="#fff" /></View>
          <View style={styles.heroText}>
            {followers === null ? (
              <LoadingSkeleton width={110} height={22} borderRadius={6} />
            ) : (
              <Text style={styles.heroCount}>
                <Text style={styles.heroNumber}>{followerCount}</Text> {followerCount === 1 ? 'follower' : 'followers'}
              </Text>
            )}
            <Text style={styles.heroSmall}>They get your announcements in their notifications.</Text>
          </View>
          {newThisWeek > 0 ? <Text style={styles.heroNew}>+{newThisWeek} this week</Text> : null}
        </View>

        {!canSend ? (
          <View style={[meStyles.card, styles.note]}>
            <LockSimpleIcon size={18} weight="fill" color={t.warning[600]} />
            <Text style={styles.noteText}>{blockedReason}</Text>
            {finishTo ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(sellerHref(finishTo))} style={styles.cta}>
                <Text style={styles.ctaText}>Finish</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Tools: each a filled icon in its own colour, nothing behind it. */}
        <View style={meStyles.card}>
          <View style={styles.cardHead}><Text style={styles.cardTitle} accessibilityRole="header">Tools</Text></View>
          <View style={styles.tools}>
            {tools.map(({ key, label, Icon, tone, onPress }) => (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.tool}>
                {({ pressed }) => (
                  <>
                    <View style={[styles.toolIcon, pressed && styles.toolPressed]}><ToolIcon Icon={Icon} tone={tone} size={30} /></View>
                    <Text style={styles.toolLabel}>{label}</Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <ShopVouchers key={vouchersKey} />

        {/* Sent */}
        <View style={[meStyles.card, meStyles.cardLast]}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} accessibilityRole="header">Sent to followers</Text>
            {feed && canSend ? <Text style={styles.left}>{feed.remaining} of {feed.dailyLimit} left today</Text> : null}
          </View>
          {!feed ? (
            <PageLoader size={40} minHeight={96} label="Loading" />
          ) : feed.announcements.length === 0 ? (
            <EmptyState compact art="announcements" text="Nothing sent yet. Tell your followers what's new, like fresh stock or a new product." />
          ) : (
            <View>
              {feed.announcements.map((a, i) => {
                const img = a.product?.images?.[0];
                const last = i === feed.announcements.length - 1;
                return (
                  <View key={a.id} style={[styles.item, i === 0 ? styles.itemFirst : styles.itemLine, last && styles.itemLast]}>
                    <View style={[styles.itemArt, !a.product && styles.itemArtNote]}>
                      {a.product
                        ? (img ? <Image source={{ uri: resolveImg(img) }} style={styles.itemImg} /> : <PackageIcon size={20} color={t.neutral[500]} />)
                        : <MegaphoneIcon size={20} weight="fill" color="#fff" />}
                    </View>
                    <View style={styles.itemText}>
                      {a.product ? <Text style={styles.itemName}>{a.product.name}</Text> : null}
                      <Text style={styles.itemMessage} numberOfLines={2}>{a.message}</Text>
                      <Text style={styles.itemSmall}>
                        Sent to {a.recipients} follower{a.recipients === 1 ? '' : 's'} · {shortDate(a.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      <AnnounceSheet
        mode={composer}
        storeName={store?.name}
        products={products}
        productId={productId}
        onProduct={setProductId}
        message={message}
        onMessage={setMessage}
        followerCount={followerCount}
        sending={sending}
        onSend={send}
        onClose={() => setComposer(null)}
      />
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  // .sh-body: 12px between the sections.
  body: { gap: 12 },

  // .sh-card-head
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  cardTitle: { fontSize: 15.5, lineHeight: 17.8, ...font(500), color: t.neutral[900] },

  // .smk-hero
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[500] },
  heroText: { flex: 1, minWidth: 0, gap: 2 },
  heroCount: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
  heroNumber: { fontSize: 22, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  heroSmall: { fontSize: 12.5, lineHeight: 17.5, ...font(400), color: t.neutral[500] },
  heroNew: {
    alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.accent[50], color: t.accent[700], fontSize: 12, lineHeight: 19.2, ...font(500),
  },

  // .smk-note
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  noteText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[800] },
  // .sh-notice-cta
  cta: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.primary[600] },
  ctaText: { fontSize: 13, lineHeight: 20.8, ...font(500), color: '#fff' },

  // .sh-tools / .sh-tool
  tools: { flexDirection: 'row', gap: 4, paddingBottom: 2 },
  tool: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  toolIcon: { height: 34, alignItems: 'center', justifyContent: 'center' },
  toolPressed: { opacity: 0.7 },
  toolLabel: { fontSize: 12.5, lineHeight: 15.6, ...font(400), color: t.neutral[700], textAlign: 'center' },

  // .smk-left
  left: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },

  // .smk-item
  item: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  itemFirst: { paddingTop: 0 },
  itemLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  itemLast: { paddingBottom: 2 },
  itemArt: {
    width: 44, height: 44, borderRadius: 12, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  itemArtNote: { backgroundColor: t.orange[500] },
  itemImg: { width: '100%', height: '100%' },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  itemMessage: { fontSize: 14, lineHeight: 19.6, ...font(400), color: t.neutral[800] },
  itemSmall: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
});
