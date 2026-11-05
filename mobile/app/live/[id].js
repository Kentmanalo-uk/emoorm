import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import {
  ArrowsClockwiseIcon, CheckIcon, EyeIcon, PlusIcon, HeartIcon, PaperPlaneRightIcon, PushPinIcon, ShareNetworkIcon, ShoppingBagIcon,
  SpeakerSlashIcon, StorefrontIcon, XIcon,
} from '../../src/lib/icons';
import useAuthStore from '../../src/store/authStore';
import apiClient from '../../src/api/client';
import {
  compact, followLive, getLive, heartSender, livePlaylist, liveThumb, sendComment, viewerId,
} from '../../src/lib/live';
import { resolveImg, sizedImg } from '../../src/lib/media';
import { saleInfo } from '../../src/lib/variantPricing';
import { toast } from '../../src/lib/toast';
import { font } from '../../src/theme';
import HeartLayer from '../../src/components/live/HeartLayer';
import LiveComments from '../../src/components/live/LiveComments';
import LiveBagSheet from '../../src/components/live/LiveBagSheet';
import { BAG_LABELS, addFromLive, bagAction } from '../../src/components/live/liveCart';

const KEEP_COMMENTS = 50;
const SITE = 'https://emoorm.shop';
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** New comments into the list: hidden ones out, none twice, the last 50. */
const mergeComments = (list, incoming) => {
  let next = list;
  for (const c of incoming) {
    if (c.hidden) next = next.filter((x) => x.id !== c.id);
    else if (!next.some((x) => x.id === c.id)) next = [...next, c];
  }
  return next.length > KEEP_COMMENTS ? next.slice(-KEEP_COMMENTS) : next;
};

/**
 * Watching a live (the website's /live/:id, pages/LiveWatch.jsx). The video
 * is the phone's own player following the Low-Latency HLS playlist: it keeps
 * itself about a second behind the seller, speeding up a touch when it falls
 * back. Comments, hearts, the product on show and the end come by long-poll.
 */
export default function LiveWatchScreen() {
  const { id } = useLocalSearchParams();
  // A new live is a new screen: nothing carries over from the last one.
  return <LiveWatch key={String(id)} id={String(id)} />;
}

function LiveWatch({ id }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const me = useAuthStore((s) => s.user);

  const [info, setInfo] = useState(null);
  const [gone, setGone] = useState(false);
  const [bag, setBag] = useState([]);
  const [comments, setComments] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [pinnedId, setPinnedId] = useState(null);
  const [endedNews, setEnded] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);

  const hearts = useRef(null);
  const lastHearts = useRef(null);
  const myTaps = useRef(0);
  const bagVersion = useRef(null);
  const tapHeart = useRef(null);

  // The player: no source until the live is known to be on.
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    // A live: start as soon as a little is in, and do not wait long after a stop.
    p.bufferOptions = { minBufferForPlayback: 0.5, preferredForwardBufferDuration: 4, waitsToMinimizeStalling: false };
    if (Platform.OS === 'ios') p.targetOffsetFromLive = 1;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // ── The live ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getLive(id)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setBag(data.bag || []);
        setComments(data.news?.comments || []);
        setViewers(data.viewers || 0);
        setPinnedId(data.news?.pinned?.productId || null);
        lastHearts.current = data.hearts || 0;
        bagVersion.current = data.news?.bagVersion ?? null;
        if (data.status === 'ENDED') setEnded(true);
      })
      .catch(() => { if (!cancelled) setGone(true); });
    return () => { cancelled = true; };
  }, [id]);

  const liveId = info && info.status !== 'ENDED' ? info.id : null;

  useEffect(() => {
    if (!liveId) return;
    player.replace({ uri: livePlaylist(liveId), contentType: 'hls' });
    player.play();
  }, [liveId, player]);

  // The network dropped (the player gives up on a live): try again shortly.
  useEffect(() => {
    if (status !== 'error' || !liveId) return undefined;
    const timer = setTimeout(() => {
      player.replace({ uri: livePlaylist(liveId), contentType: 'hls' });
      player.play();
    }, 2000);
    return () => clearTimeout(timer);
  }, [status, liveId, player]);

  // ── News ──────────────────────────────────────────────────────────────
  const since = info?.news?.v || 0;
  useEffect(() => {
    if (!liveId) return undefined;
    tapHeart.current = heartSender(liveId);
    const stop = followLive({
      id: liveId,
      viewer: viewerId(),
      since,
      onNews: (n) => {
        if (n.comments?.length) setComments((list) => mergeComments(list, n.comments));
        if (n.viewers != null) setViewers(n.viewers);
        if (n.pinned !== undefined) setPinnedId(n.pinned?.productId || null);
        if (n.hearts != null && lastHearts.current != null && n.hearts > lastHearts.current) {
          const diff = n.hearts - lastHearts.current;
          const theirs = Math.max(0, diff - myTaps.current);
          myTaps.current = Math.max(0, myTaps.current - diff);
          if (theirs) hearts.current?.burst(Math.min(theirs, 6));
        }
        if (n.hearts != null) lastHearts.current = n.hearts;
        if (n.bagVersion != null && bagVersion.current != null && n.bagVersion !== bagVersion.current) {
          getLive(liveId).then((d) => setBag(d.bag || [])).catch(() => {});
        }
        if (n.bagVersion != null) bagVersion.current = n.bagVersion;
        if (n.status === 'ENDED') setEnded(true);
      },
    });
    return () => {
      tapHeart.current?.flush();
      stop();
    };
    // since: read once, with the live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  // ── Following the shop (the + on its name) ────────────────────────────
  const storeId = info?.store?.id;
  const [following, setFollowing] = useState(null);
  const [justFollowed, setJustFollowed] = useState(false);
  useEffect(() => {
    if (!storeId || !isAuthenticated) return;
    apiClient.get(`/follows/status/${storeId}`)
      .then((res) => setFollowing(Boolean(res?.data?.following)))
      .catch(() => {});
  }, [storeId, isAuthenticated]);

  // ── Actions ───────────────────────────────────────────────────────────
  const signIn = useCallback(() => router.push(`/login?redirect=${encodeURIComponent(`/live/${id}`)}`), [router, id]);

  const follow = async () => {
    if (!isAuthenticated) { signIn(); return; }
    setJustFollowed(true);
    try {
      await apiClient.post(`/follows/${storeId}`);
      setFollowing(true);
      // The tick shows a moment, then the button goes.
      setTimeout(() => setJustFollowed(false), 1400);
    } catch (err) {
      setJustFollowed(false);
      toast.error(err?.message || 'Could not follow the shop.');
    }
  };

  const heart = () => {
    hearts.current?.burst(1, { mine: true });
    myTaps.current += 1;
    tapHeart.current?.();
  };

  const toggleSound = () => {
    player.muted = !player.muted;
    setMuted(player.muted);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const share = () => {
    const url = `${SITE}/live/${id}`;
    Share.share({ message: `${info?.store?.name || 'A shop'} is live on E-MOORM: ${info?.title || ''}\n${url}`, url }).catch(() => {});
  };

  // A product's page; the live keeps playing (and talking) behind it.
  const openProduct = useCallback((p) => {
    if (!p?.slug) return;
    setBagOpen(false);
    router.push(`/product/${p.slug}`);
  }, [router]);

  const onBagAction = useCallback((p) => {
    const action = bagAction(p);
    if (action === 'sold-out') return;
    if (action !== 'cart') { openProduct(p); return; }
    if (!isAuthenticated) { signIn(); return; }
    addFromLive(p);
  }, [isAuthenticated, openProduct, signIn]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !liveId) return;
    if (!isAuthenticated) { signIn(); return; }
    setSending(true);
    try {
      const comment = await sendComment(liveId, body);
      setComments((list) => mergeComments(list, [{ ...comment, mine: true }]));
      setText('');
    } catch (err) {
      toast.error(err?.message || 'Could not send that.');
    } finally {
      setSending(false);
    }
  };

  // ── Drawing ───────────────────────────────────────────────────────────
  const ended = endedNews || gone;
  const thumb = liveThumb(info);
  const store = info?.store;
  const pinned = pinnedId ? bag.find((p) => p.id === pinnedId) : null;
  const pinnedNo = pinned ? bag.indexOf(pinned) + 1 : 0;
  const mine = me?.id && info?.sellerId === me.id;
  // Signed out: the + asks them to sign in first.
  const showFollow = store && !mine && ((isAuthenticated ? following : false) === false || justFollowed);
  const logo = store?.logo ? (sizedImg(store.logo, 34) || resolveImg(store.logo)) : null;

  if (ended) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} blurRadius={30} contentFit="cover" /> : null}
        <View style={styles.dim} />
        <View style={styles.endedBox}>
          {logo
            ? <Image source={{ uri: logo }} style={styles.endedLogo} />
            : <View style={[styles.endedLogo, styles.blankLogo]}><StorefrontIcon size={28} weight="fill" color="#055d07" /></View>}
          <Text style={styles.endedTitle}>This live has ended</Text>
          <Text style={styles.endedText}>{store ? `Thanks for watching ${store.name}.` : 'It may have just finished.'}</Text>
          <View style={styles.endedActions}>
            {store?.slug ? (
              <Pressable style={[styles.endedBtn, styles.endedPrimary]} onPress={() => router.replace(`/store/${store.slug}`)}>
                <Text style={[styles.endedBtnText, styles.endedPrimaryText]}>Visit the shop</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.endedBtn} onPress={close}>
              <Text style={styles.endedBtnText}>Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const waiting = !info || status === 'loading' || status === 'idle';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Pressable style={StyleSheet.absoluteFill} onLongPress={heart} delayLongPress={250} accessible={false}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
        />
      </Pressable>
      {thumb && waiting ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} blurRadius={12} contentFit="cover" /> : null}
      <View pointerEvents="none" style={[styles.shade, styles.shadeTop]} />
      <View pointerEvents="none" style={[styles.shade, styles.shadeBottom]} />

      {waiting ? (
        <View pointerEvents="none" style={styles.loading}>
          <ArrowsClockwiseIcon size={28} color="#fff" />
          <Text style={styles.loadingText}>Joining the live…</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={[styles.chip, styles.warn, { top: insets.top + 62 }]}>
          <Text style={styles.chipText}>Reconnecting…</Text>
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        {store ? (
          <View style={styles.shop}>
            <Pressable style={styles.shopLink} onPress={() => router.push(`/store/${store.slug}`)}>
              {logo
                ? <Image source={{ uri: logo }} style={styles.shopLogo} />
                : <View style={[styles.shopLogo, styles.blankLogo]}><StorefrontIcon size={16} weight="fill" color="#055d07" /></View>}
              <View style={styles.shopText}>
                <Text style={styles.shopName} numberOfLines={1}>{store.name}</Text>
                <Text style={styles.shopTitle} numberOfLines={1}>{info?.title}</Text>
              </View>
            </Pressable>
            {showFollow ? (
              <Pressable
                style={[styles.follow, justFollowed && styles.followDone]}
                onPress={follow}
                disabled={justFollowed}
                accessibilityLabel={justFollowed ? 'Following' : `Follow ${store.name}`}
              >
                {justFollowed ? <CheckIcon size={14} weight="bold" color="#fff" /> : <PlusIcon size={15} weight="bold" color="#fff" />}
              </Pressable>
            ) : null}
          </View>
        ) : <View style={{ flex: 1 }} />}
        <View style={styles.topRight}>
          <Text style={styles.badge}>LIVE</Text>
          <View style={styles.viewers}>
            <EyeIcon size={14} weight="fill" color="#fff" />
            <Text style={styles.viewersText}>{compact(viewers)}</Text>
          </View>
          <Pressable style={styles.icon} onPress={share} accessibilityLabel="Share this live"><ShareNetworkIcon size={18} color="#fff" /></Pressable>
          <Pressable style={styles.icon} onPress={close} accessibilityLabel="Close the live"><XIcon size={20} color="#fff" /></Pressable>
        </View>
      </View>

      {muted && !waiting ? (
        <Pressable style={[styles.chip, { top: insets.top + 62 }]} onPress={toggleSound}>
          <SpeakerSlashIcon size={15} weight="fill" color="#fff" />
          <Text style={styles.chipText}>Tap for sound</Text>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <LiveComments comments={comments} maxHeight={Math.min(260, height * 0.32)} />

        {pinned ? (
          <View style={styles.pinned}>
            <Pressable onPress={() => openProduct(pinned)} style={styles.pinnedPhoto}>
              {Array.isArray(pinned.images) && pinned.images[0]
                ? <Image source={{ uri: sizedImg(pinned.images[0], 56) || resolveImg(pinned.images[0]) }} style={styles.fill} contentFit="cover" />
                : null}
              <Text style={styles.pinnedNo}>{pinnedNo}</Text>
            </Pressable>
            <View style={styles.pinnedInfo}>
              <View style={styles.pinnedTag}>
                <PushPinIcon size={11} weight="fill" color="#047857" />
                <Text style={styles.pinnedTagText}>Showing now</Text>
              </View>
              <Text style={styles.pinnedName} numberOfLines={1} onPress={() => openProduct(pinned)}>{pinned.name}</Text>
              <Text style={styles.pinnedPrice}>{peso(saleInfo(pinned).price)}</Text>
            </View>
            <Pressable
              style={[styles.buy, bagAction(pinned) === 'sold-out' && styles.buyOff]}
              disabled={bagAction(pinned) === 'sold-out'}
              onPress={() => onBagAction(pinned)}
            >
              <Text style={styles.buyText}>{bagAction(pinned) === 'cart' ? 'Buy' : BAG_LABELS[bagAction(pinned)]}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.compose}>
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => { if (!isAuthenticated) signIn(); }}
              placeholder={mine ? 'Say something to your viewers…' : 'Say something…'}
              placeholderTextColor="rgba(255,255,255,0.72)"
              maxLength={200}
              returnKeyType="send"
              onSubmitEditing={send}
              style={styles.input}
            />
            {text.trim() ? (
              <Pressable style={styles.send} onPress={send} disabled={sending} accessibilityLabel="Send">
                <PaperPlaneRightIcon size={18} weight="fill" color="#055d07" />
              </Pressable>
            ) : null}
          </View>
          <Pressable style={[styles.round, styles.bag]} onPress={() => setBagOpen(true)} accessibilityLabel={`Products (${bag.length})`}>
            <ShoppingBagIcon size={22} weight="fill" color="#fff" />
            {bag.length > 0 ? <Text style={styles.count}>{bag.length}</Text> : null}
          </Pressable>
          <Pressable style={styles.round} onPress={heart} accessibilityLabel="Send a heart">
            <HeartIcon size={22} weight="fill" color="#ff4f7b" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <HeartLayer ref={hearts} style={{ bottom: insets.bottom + 74 }} />
      <LiveBagSheet
        open={bagOpen}
        onClose={() => setBagOpen(false)}
        bag={bag}
        pinnedId={pinnedId}
        onAction={onBagAction}
        onOpen={openProduct}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  shade: { position: 'absolute', left: 0, right: 0 },
  shadeTop: { top: 0, height: 120, backgroundColor: 'rgba(0,0,0,0.22)' },
  shadeBottom: { bottom: 0, height: '40%', backgroundColor: 'rgba(0,0,0,0.18)' },
  loading: {
    position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center', gap: 10,
  },
  loadingText: { color: 'rgba(255,255,255,0.92)', fontSize: 14, ...font(500) },
  top: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
  },
  shop: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingVertical: 4, paddingLeft: 4, paddingRight: 5,
    borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.32)',
  },
  shopLink: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, paddingRight: 6 },
  follow: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f43f5e',
  },
  followDone: { backgroundColor: '#10b981' },
  shopLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff' },
  blankLogo: { alignItems: 'center', justifyContent: 'center' },
  shopText: { flexShrink: 1 },
  shopName: { color: '#fff', fontSize: 13.5, ...font(600) },
  shopTitle: { color: 'rgba(255,255,255,0.82)', fontSize: 11.5, ...font(400) },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', flexShrink: 0 },
  badge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', backgroundColor: '#f43f5e', color: '#fff',
    fontSize: 11, letterSpacing: 0.6, ...font(800),
  },
  viewers: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.36)',
  },
  viewersText: { color: '#fff', fontSize: 12, ...font(600) },
  icon: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.32)',
  },
  chip: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  warn: { backgroundColor: 'rgba(180,83,9,0.85)' },
  chipText: { color: '#fff', fontSize: 13, ...font(600) },
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, paddingHorizontal: 12,
  },
  pinned: {
    flexDirection: 'row', alignItems: 'center', gap: 10, width: '88%', maxWidth: 380, padding: 8, borderRadius: 14, backgroundColor: '#fff',
  },
  pinnedPhoto: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f2f3f5' },
  pinnedNo: {
    position: 'absolute', top: 0, left: 0, paddingHorizontal: 6, paddingVertical: 1, borderBottomRightRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.62)', color: '#fff', fontSize: 11, ...font(700),
  },
  pinnedInfo: { flex: 1, minWidth: 0, gap: 1 },
  pinnedTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pinnedTagText: { color: '#047857', fontSize: 11, ...font(600) },
  pinnedName: { color: '#1f2328', fontSize: 13.5, ...font(400) },
  pinnedPrice: { color: '#e11d48', fontSize: 15, ...font(700) },
  buy: {
    height: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f43f5e',
  },
  buyOff: { backgroundColor: '#9ca3af' },
  buyText: { color: '#fff', fontSize: 14, ...font(700) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compose: {
    flex: 1, flexDirection: 'row', alignItems: 'center', height: 42, paddingLeft: 16, paddingRight: 4, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  input: { flex: 1, height: '100%', color: '#fff', fontSize: 14, ...font(400), paddingVertical: 0 },
  send: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  round: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.38)',
  },
  bag: { backgroundColor: '#f43f5e' },
  count: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, borderWidth: 2,
    borderColor: '#f43f5e', backgroundColor: '#fff', color: '#f43f5e', fontSize: 10.5, lineHeight: 14, textAlign: 'center', ...font(800),
  },
  endedBox: { alignItems: 'center', gap: 8, maxWidth: 340, padding: 24 },
  endedLogo: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', backgroundColor: '#fff', marginBottom: 8 },
  endedTitle: { color: '#fff', fontSize: 22, ...font(600) },
  endedText: { color: 'rgba(255,255,255,0.78)', fontSize: 14, marginBottom: 12, textAlign: 'center', ...font(400) },
  endedActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  endedBtn: {
    height: 42, paddingHorizontal: 20, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  endedPrimary: { backgroundColor: '#fff', borderColor: '#fff' },
  endedBtnText: { color: '#fff', fontSize: 14, ...font(600) },
  endedPrimaryText: { color: '#055d07' },
});
