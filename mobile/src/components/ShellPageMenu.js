import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  ArrowCounterClockwiseIcon, BellIcon, CameraIcon, ChatCircleDotsIcon, ClipboardTextIcon, DotsThreeIcon, FlagIcon,
  GearIcon, HeadsetIcon, HeartIcon, HouseIcon, IdentificationCardIcon, MapPinIcon, PackageIcon, QuestionIcon,
  ShoppingBagIcon, ShoppingCartIcon, StarIcon, StorefrontIcon, UserIcon,
} from 'phosphor-react-native';
import useAuthStore from '../store/authStore';
import { font, t } from '../theme';
import ShellBarButton from './ShellBarButton';

/*
 * What the ⋯ menu at the right end of a page's top bar offers, page by page
 * (web/src/lib/pageMenus.jsx, buyer side), on the app's own paths. Website
 * pages the app has no screen for (About, Privacy, Terms, Sell) are left out.
 */
const item = (key, Icon, label, to) => ({ key, Icon, label, to });

const B = {
  home: item('home', HouseIcon, 'Home', '/'),
  products: item('products', ShoppingBagIcon, 'Browse products', '/products'),
  stores: item('stores', StorefrontIcon, 'Browse stores', '/stores'),
  cart: item('cart', ShoppingCartIcon, 'My cart', '/cart'),
  orders: item('orders', PackageIcon, 'My orders', '/orders'),
  returns: item('returns', ArrowCounterClockwiseIcon, 'Returns & refunds', '/returns'),
  reviews: item('reviews', StarIcon, 'My reviews', '/reviews'),
  addresses: item('addresses', MapPinIcon, 'Delivery addresses', '/addresses'),
  wishlist: item('wishlist', HeartIcon, 'My wishlist', '/wishlist'),
  followed: item('followed', StorefrontIcon, 'Followed stores', '/followed-stores'),
  settings: item('settings', GearIcon, 'Account settings', '/settings'),
  editProfile: item('edit', UserIcon, 'Edit profile', '/edit-profile'),
  verify: item('verify', IdentificationCardIcon, 'Verify identity', '/verification'),
  support: item('support', HeadsetIcon, 'Help & support', '/support'),
  reports: item('reports', FlagIcon, 'My reports', '/reports'),
  help: item('help', QuestionIcon, 'Help Center', '/help-center'),
  messages: item('messages', ChatCircleDotsIcon, 'Messages', '/messages'),
  notifications: item('notifications', BellIcon, 'Notifications', '/notifications'),
  apply: item('apply', ClipboardTextIcon, 'Apply to sell', '/seller-apply'),
  imageSearch: item('image-search', CameraIcon, 'Search by image', '/search-by-image'),
};

const RULES = [
  [/^\/profile$/, [B.editProfile, B.orders, B.wishlist, B.followed, B.help]],
  [/^\/orders/, [B.returns, B.reviews, B.addresses, B.support, B.products]],
  [/^\/returns\/./, [item('all-returns', ArrowCounterClockwiseIcon, 'All returns', '/returns'), B.orders, B.support]],
  [/^\/returns$/, [B.orders, B.support, B.help]],
  [/^\/addresses/, [B.settings, B.orders, B.cart]],
  [/^\/reviews/, [B.orders, B.wishlist, B.products]],
  [/^\/wishlist/, [B.cart, B.followed, B.products]],
  [/^\/followed-stores/, [B.stores, B.wishlist, B.notifications]],
  [/^\/(settings|edit-profile)/, [B.addresses, B.verify, B.support]],
  [/^\/verification/, [B.settings, B.support]],
  [/^\/support/, [B.help, B.reports, B.orders]],
  [/^\/reports/, [B.support, B.help]],
  [/^\/help-center/, [B.support, B.orders]],
  [/^\/seller-apply/, [B.help]],
  [/^\/checkout/, [B.cart, B.addresses, B.help]],
  [/^\/receipt\//, [B.orders, B.support]],
  [/^\/notification\/./, [item('all-notifs', BellIcon, 'All notifications', '/notifications'), B.messages]],
  [/^\/stores/, [B.followed, B.products, B.apply]],
  [/^\/product\/([^/]+)\/reviews/, (m) => [
    item('product', ShoppingBagIcon, 'Back to the product', `/product/${m[1]}`),
    B.reviews, B.cart,
  ]],
  [/^\/search-by-image/, [B.products, B.stores]],
  [/^\/search$/, [B.stores, B.cart, B.wishlist]],
  [/^\/products/, [B.imageSearch, B.stores, B.cart]],
];
const FALLBACK = [B.home, B.help];
// A visitor's Profile tab: nothing here needs an account.
const GUEST_PROFILE = [B.products, B.stores, B.apply];

/** The menu items for an app path; a link to the page itself is left out. */
export function shellMenuItems(pathname, { signedIn = true } = {}) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (!signedIn && path === '/profile') return GUEST_PROFILE;
  let items = FALLBACK;
  for (const [re, list] of RULES) {
    const m = path.match(re);
    if (m) { items = typeof list === 'function' ? list(m) : list; break; }
  }
  return items.filter((it) => it.to !== path);
}

const OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The ⋯ button and its pop-over menu (web PageMenu + MoreMenu): grows out of
 * the button's corner, closes on a pick or a tap outside.
 * extra: this page's own actions, listed first:
 *   [{ key, Icon, label, onPress?, to?, danger? }]
 * items: replaces the per-page links entirely (same shape).
 */
export default function ShellPageMenu({ extra = [], items: override, label = 'Page menu' }) {
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const { width } = useWindowDimensions();
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  // False as soon as it starts closing, so the ⋯ turns back with the fade.
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState(null);
  // The modal's own width: the window's can differ by a scrollbar on the web.
  const [rootWidth, setRootWidth] = useState(width);
  const pop = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  const items = [...extra.filter(Boolean), ...(override || shellMenuItems(pathname, { signedIn }))];

  useEffect(() => {
    Animated.timing(spin, { toValue: expanded ? 1 : 0, duration: 260, easing: OUT, useNativeDriver: true }).start();
  }, [expanded, spin]);

  if (!items.length) return null;

  const show = () => {
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 8, end: x + w });
      pop.setValue(0);
      setOpen(true);
      setExpanded(true);
      Animated.timing(pop, { toValue: 1, duration: 220, easing: OUT, useNativeDriver: true }).start();
    });
  };

  const hide = (after) => {
    setExpanded(false);
    Animated.timing(pop, { toValue: 2, duration: 150, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(({ finished }) => {
      // Reopened mid-close: stay open.
      if (finished) setOpen(false);
    });
    after?.();
  };

  const pick = (it) => hide(() => {
    if (it.onPress) it.onPress();
    else if (it.to) router.push(it.to);
  });

  // 0 → 1 opens, 1 → 2 closes (each with the website's own curve and offsets).
  const popStyle = {
    opacity: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    transform: [
      { translateY: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [-6, 0, -4] }) },
      { scale: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1, 0.94] }) },
    ],
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <>
      <ShellBarButton
        ref={buttonRef}
        label={label}
        onPress={() => (expanded ? hide() : show())}
        accessibilityState={{ expanded }}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <DotsThreeIcon size={22} weight="bold" color={expanded ? t.primary[700] : t.neutral[700]} />
        </Animated.View>
      </ShellBarButton>
      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={() => hide()}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onLayout={(e) => setRootWidth(e.nativeEvent.layout.width)}
          onPress={() => hide()}
          accessibilityLabel="Close menu"
        />
        {anchor ? (
          <Animated.View style={[styles.pop, { top: anchor.top, right: Math.max(0, rootWidth - anchor.end) }, popStyle]} accessibilityRole="menu">
            {items.map((it, i) => (
              <MenuRow key={it.key} item={it} index={i} onPress={() => pick(it)} />
            ))}
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

// Each row slides in a moment after the one above it.
function MenuRow({ item: it, index, onPress }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 240, delay: 40 + index * 35, easing: OUT, useNativeDriver: true }).start();
  }, [enter, index]);
  const color = it.danger ? t.danger[600] : t.neutral[800];
  const Icon = it.Icon;
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      <Pressable accessibilityRole="menuitem" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        {Icon ? <Icon size={18} color={color} /> : null}
        <Text style={[styles.rowText, { color }]} numberOfLines={1}>{it.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pop: {
    position: 'absolute',
    minWidth: 200,
    padding: 6,
    borderRadius: 14,
    backgroundColor: t.neutral[0],
    transformOrigin: 'top right',
    boxShadow: [
      { offsetX: 0, offsetY: 12, blurRadius: 32, color: 'rgba(15, 23, 42, 0.18)' },
      { offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(15, 23, 42, 0.06)' },
    ],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10 },
  rowPressed: { backgroundColor: t.neutral[100] },
  rowText: { fontSize: 14, lineHeight: 22.4, ...font(400) },
});
