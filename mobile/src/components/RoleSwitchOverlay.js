import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { StorefrontIcon } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import apiClient from '../api/client';
import useAuthStore from '../store/authStore';
import { resolveImg } from '../lib/media';
import { font, t } from '../theme';

/*
 * The account switch between the personal (buyer) account and the Seller
 * Center, as the website draws it (web/src/components/account/
 * AccountSwitchOverlay.jsx + AccountSwitch.css, web/src/store/
 * accountSwitchStore.js): a white screen fades in, the shop logo (or the
 * personal photo) rises inside a spinning ring with the name and
 * "Switching to Seller Account" under it, the app moves to the other side
 * while covered, then it fades away.
 *
 * Two ways to use it:
 *
 *   startAccountSwitch('personal', '/profile')       (or 'seller', '/seller')
 *     with <AccountSwitchHost /> mounted (the Seller Center layout mounts
 *     one; mounting one in app/_layout.js too lets the fade-out run over the
 *     page it lands on: only the first host mounted draws).
 *
 *   <RoleSwitchOverlay visible={switching} target="seller" />
 *     the screen shows it while it runs its own timer and navigates
 *     (the older API: `label` without `target` still works; a label that
 *     mentions "personal" means the personal side, anything else the shop).
 */

const SWITCH_MS = 750;
const EXIT_MS = 220;
const MAX_WAIT_MS = 10000;
const SHOP_KEY = 'emoorm.sellerShop';

let nextId = 1;

export const useAccountSwitchStore = create((set, get) => ({
  // { id, target: 'seller' | 'personal', path, replace } while a switch runs.
  request: null,
  // The seller's shop name and logo, so the overlay shows them at once.
  shop: null,
  // Mounted hosts, oldest first: the first one draws.
  hosts: [],
  start: (target, path, { replace = false } = {}) => {
    if (get().request) return;
    set({ request: { id: nextId++, target, path, replace } });
  },
  finish: () => set({ request: null }),
  setShop: (shop) => {
    const next = shop ? { ownerId: shop.ownerId || null, name: shop.name || '', logo: shop.logo || null } : null;
    const current = get().shop;
    if (current?.ownerId === next?.ownerId && current?.name === next?.name && current?.logo === next?.logo) return;
    set({ shop: next });
    (next ? AsyncStorage.setItem(SHOP_KEY, JSON.stringify(next)) : AsyncStorage.removeItem(SHOP_KEY)).catch(() => {});
  },
}));

// The shop remembered from last time.
AsyncStorage.getItem(SHOP_KEY)
  .then((raw) => {
    if (raw && !useAccountSwitchStore.getState().shop) useAccountSwitchStore.setState({ shop: JSON.parse(raw) });
  })
  .catch(() => {});

/** Starts a switch: target 'seller' | 'personal', then the path to land on. */
export const startAccountSwitch = (target, path, options) => useAccountSwitchStore.getState().start(target, path, options);

/** The shop to show, if it belongs to the signed-in seller. */
function useSwitchShop(toSeller) {
  const cached = useAccountSwitchStore((s) => s.shop);
  const setShop = useAccountSwitchStore((s) => s.setShop);
  const user = useAuthStore((s) => s.user);
  const shop = cached && (!cached.ownerId || cached.ownerId === user?.id) ? cached : null;
  // First switch on this device: fetch the shop so its logo can appear.
  useEffect(() => {
    if (!toSeller || shop || user?.role !== 'SELLER') return;
    apiClient.get('/stores/my/store').then((res) => { if (res.data) setShop(res.data); }).catch(() => {});
  }, [toSeller, shop, setShop, user?.role]);
  return shop;
}

/** The overlay itself, for a screen that runs the switch on its own. */
export default function RoleSwitchOverlay({ visible, target, label }) {
  const toSeller = target ? target === 'seller' : !/personal/i.test(label || '');
  return <SwitchScreen visible={Boolean(visible)} toSeller={toSeller} />;
}

/** Draws switches started with startAccountSwitch, and runs them. */
export function AccountSwitchHost() {
  const id = useRef(`h${Math.random().toString(36).slice(2)}`).current;
  const request = useAccountSwitchStore((s) => s.request);
  const finish = useAccountSwitchStore((s) => s.finish);
  const first = useAccountSwitchStore((s) => s.hosts[0] === id);
  const router = useRouter();
  const pathname = usePathname();
  const [navigated, setNavigated] = useState(null);
  const [leavingId, setLeavingId] = useState(null);

  useEffect(() => {
    useAccountSwitchStore.setState((s) => ({ hosts: [...s.hosts, id] }));
    return () => useAccountSwitchStore.setState((s) => ({ hosts: s.hosts.filter((h) => h !== id) }));
  }, [id]);

  // Move while covered.
  useEffect(() => {
    if (!request || !first) return undefined;
    const timer = setTimeout(() => {
      setNavigated({ id: request.id, from: pathname });
      if (request.replace) router.replace(request.path);
      else router.navigate(request.path);
    }, SWITCH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, first]);

  // Leave once the other side's page is on screen (never later than MAX_WAIT_MS).
  const navigatedNow = Boolean(request && navigated?.id === request.id);
  const moved = navigatedNow && pathname !== navigated.from;
  useEffect(() => {
    if (!navigatedNow) return undefined;
    const reqId = request.id;
    let exit = 0;
    let frame = 0;
    const leave = () => {
      clearTimeout(exit);
      setLeavingId(reqId);
      exit = setTimeout(finish, EXIT_MS);
    };
    const cap = setTimeout(leave, MAX_WAIT_MS);
    if (moved) frame = requestAnimationFrame(() => { frame = requestAnimationFrame(leave); });
    return () => { clearTimeout(cap); clearTimeout(exit); cancelAnimationFrame(frame); };
  }, [navigatedNow, moved, request, finish]);

  if (!first) return null;
  return (
    <SwitchScreen
      visible={Boolean(request) && leavingId !== request?.id}
      toSeller={request?.target === 'seller'}
    />
  );
}

/** The white screen with the avatar in its ring. */
function SwitchScreen({ visible, toSeller }) {
  const user = useAuthStore((s) => s.user);
  const shop = useSwitchShop(visible && toSeller);
  const { width: screenW } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const shown = useRef(new Animated.Value(0)).current;
  const avatarIn = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [side, setSide] = useState(toSeller);

  useEffect(() => {
    if (visible) {
      setSide(toSeller);
      setMounted(true);
      shown.setValue(0);
      avatarIn.setValue(0);
      Animated.parallel([
        Animated.timing(shown, { toValue: 1, duration: 280, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
        Animated.timing(avatarIn, { toValue: 1, duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
      ]).start();
      spin.setValue(0);
      const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
      return () => loop.stop();
    }
    if (!mounted) return undefined;
    const anim = Animated.timing(shown, { toValue: 2, duration: EXIT_MS, easing: Easing.in(Easing.ease), useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) setMounted(false); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const name = side ? shop?.name || 'Your shop' : user?.fullName || user?.email || 'Personal account';
  const image = side ? shop?.logo : user?.profilePhoto;
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const small = screenW <= 480;
  const wrap = small ? 108 : 128;
  const inset = small ? 9 : 10;
  const size = wrap - inset * 2;

  // 0 → 1: fade in 160ms (the backdrop) while the card rises; 1 → 2: away.
  const backdrop = { opacity: shown.interpolate({ inputRange: [0, 0.57, 1, 2], outputRange: [0, 1, 1, 0] }) };
  const card = {
    opacity: shown.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    transform: [
      { translateY: shown.interpolate({ inputRange: [0, 1, 2], outputRange: [10, 0, 0] }) },
      { scale: shown.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1, 0.98] }) },
    ],
  };
  const avatarStyle = {
    opacity: avatarIn,
    transform: [{ scale: avatarIn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <Animated.View style={[styles.overlay, backdrop]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Animated.View style={[styles.card, card]}>
          <View style={{ width: wrap, height: wrap, marginBottom: 18 }}>
            <Animated.View style={[styles.ring, { width: wrap, height: wrap, borderRadius: wrap / 2, transform: [{ rotate }] }]} />
            <Animated.View style={[styles.avatar, { top: inset, left: inset, width: size, height: size, borderRadius: size / 2 }, avatarStyle]}>
              {image ? (
                <Image key={image} source={{ uri: resolveImg(image) }} style={{ width: size, height: size, borderRadius: size / 2 }} />
              ) : (
                <View style={[styles.fallback, { borderRadius: size / 2 }, side && styles.fallbackShop]}>
                  {side
                    ? <StorefrontIcon size={44} weight="fill" color={t.neutral[0]} />
                    : <Text style={styles.initial}>{initial}</Text>}
                </View>
              )}
            </Animated.View>
          </View>
          <Text style={[styles.name, small && styles.nameSmall, { maxWidth: Math.min(420, screenW - 48) }]} numberOfLines={1}>{name}</Text>
          <Text style={styles.title}>{side ? 'Switching to Seller Account' : 'Switching to Personal Account'}</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  card: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 3,
    borderColor: t.secondary[50],
    borderTopColor: t.primary[600],
  },
  avatar: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 20, color: 'rgba(15, 23, 42, 0.1)' }],
  },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  fallbackShop: { backgroundColor: t.secondary[800] },
  initial: { fontSize: 42, lineHeight: 50, color: t.neutral[0], ...font(700) },
  name: { fontSize: 22, lineHeight: 27.5, color: t.neutral[900], ...font(700) },
  nameSmall: { fontSize: 19, lineHeight: 23.75 },
  title: { fontSize: 14, lineHeight: 21, color: t.neutral[500], ...font(400) },
});
