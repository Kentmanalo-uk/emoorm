import { forwardRef, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BellIcon, CaretDownIcon, CaretLeftIcon, ChatCircleDotsIcon, CheckIcon, GearIcon, HeadsetIcon, PlusIcon,
  ShareNetworkIcon, SparkleIcon,
} from 'phosphor-react-native';
import { border, font, t } from '../../theme';
import useAuthStore from '../../store/authStore';
import { resolveImg } from '../../lib/media';
import ShellBarButton from '../ShellBarButton';
import ShellPageMenu from '../ShellPageMenu';
import { useSellerShell } from './SellerShell';
import { cleanSellerPath, sellerBackTarget, sellerMenuItems, sellerPhoneTitle } from './sellerRoutes';

/*
 * The Seller Center's phone top bars (web SellerLayout.jsx + SellerMobile.css,
 * restyled by styles/phone-app.css: solid white bars with a hairline under
 * them, plain 40px round icons).
 *
 *   SellerTabHeader   a tab page (.scm-head): the big 22px title, round icons
 *                     at the right, ending with the bell and the ⋯ menu
 *   SellerHomeHeader  Home's own shop header (SellerDashboard .sh-head)
 *   SellerMeHeader    Me's own header (SellerMenu .sme-head)
 *   SellerBackBar     every other page (.scm-backbar): back arrow + title + ⋯
 *   SellerHeaderButton  one round icon (.scm-icon / .sh-icon) with a pink count
 *   SellerPageMenu    the ⋯ menu with the seller rules of web/src/lib/pageMenus.jsx
 */

/** The ⋯ page menu, with the Seller Center's links for this page. extra: this page's own actions first. */
export function SellerPageMenu({ extra = [] }) {
  const pathname = usePathname();
  return <ShellPageMenu extra={extra} items={sellerMenuItems(pathname)} />;
}

/**
 * A round 40px header icon (.scm-icon, .sh-icon): plain, grey-filled while
 * pressed, with a pink count on its corner (9+ past nine).
 * <SellerHeaderButton label="Notifications" to="/seller/notifications" badge={3}><BellIcon …/></SellerHeaderButton>
 */
export const SellerHeaderButton = forwardRef(function SellerHeaderButton({ label, to, onPress, badge = 0, children, style }, ref) {
  const router = useRouter();
  const count = Number(badge || 0);
  return (
    <ShellBarButton
      ref={ref}
      label={count ? `${label}, ${count}` : label}
      onPress={onPress || (to ? () => router.push(to) : undefined)}
      style={style}
    >
      {children}
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </ShellBarButton>
  );
});

/** The bell with the unread seller notifications. */
export function SellerBellButton() {
  const { unreadCount } = useSellerShell();
  return (
    <SellerHeaderButton label="Notifications" to="/seller/notifications" badge={unreadCount}>
      <BellIcon size={20} color={t.neutral[700]} />
    </SellerHeaderButton>
  );
}

/**
 * A tab page's top bar (.scm-head).
 * title:   the big title (default: the page's phone title)
 * actions: the page's own round icons, before the bell
 * bell:    false leaves the bell out; menu: false leaves the ⋯ out
 * chat:    the Chat tab's "Buyers ▾" switch beside the title
 * menuItems: the page's own actions, first in the ⋯ menu
 */
export function SellerTabHeader({ title, actions, bell = true, menu = true, menuItems, chat = false }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: 12 + insets.top }]}>
      {chat ? <ChatTitle /> : (
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title || sellerPhoneTitle(pathname)}</Text>
      )}
      <View style={styles.actions}>
        {actions}
        {bell ? <SellerBellButton /> : null}
        {menu ? <SellerPageMenu extra={menuItems} /> : null}
      </View>
    </View>
  );
}

/** My products' bar: + Add product, the bell, ⋯ */
export function SellerProductsHeader() {
  return (
    <SellerTabHeader
      actions={(
        <SellerHeaderButton label="Add product" to="/seller/products/new?fromList=1">
          <PlusIcon size={21} weight="bold" color={t.neutral[700]} />
        </SellerHeaderButton>
      )}
    />
  );
}

/** Chat's bar: "Chat [Buyers ▾]", Ate Moormy (the AI assistant), the bell, ⋯ */
export function SellerChatHeader() {
  return (
    <SellerTabHeader
      chat
      actions={(
        <SellerHeaderButton label="Ask Ate Moormy, your AI assistant" to="/seller/assistant">
          <SparkleIcon size={21} weight="fill" color={t.violet[500]} />
        </SellerHeaderButton>
      )}
    />
  );
}

// "Chat  [Buyers ▾]": who the list is with — buyers here, or the municipal admin (its own page).
function ChatTitle() {
  const router = useRouter();
  const { waiting } = useSellerShell();
  const { width } = useWindowDimensions();
  const boxRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const adminCount = waiting['/seller/support']?.count || 0;
  // The menu opens 8px under the title row, from its left edge (.scm-chat-menu).
  const open = () => boxRef.current?.measureInWindow((x, y, w, h) => setAnchor({ left: x, top: y + h + 8 }));
  const close = () => setAnchor(null);
  return (
    <View ref={boxRef} collapsable={false} style={styles.chatTitle}>
      <Text style={styles.title} accessibilityRole="header">Chat</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chatting with buyers. Change"
        accessibilityState={{ expanded: Boolean(anchor) }}
        onPress={() => (anchor ? close() : open())}
        style={styles.chatSwitch}
      >
        <Text style={[styles.chatSwitchText, anchor && { color: t.primary[700] }]}>Buyers</Text>
        <CaretDownIcon size={13} weight="bold" color={anchor ? t.primary[700] : t.neutral[700]} />
      </Pressable>
      <Modal visible={Boolean(anchor)} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        {anchor ? (
          <View style={[styles.chatMenu, { top: anchor.top, left: Math.min(anchor.left, width - 242) }]} accessibilityRole="menu">
            <Pressable accessibilityRole="menuitem" onPress={close} style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}>
              <ChatCircleDotsIcon size={19} weight="fill" color={t.neutral[900]} />
              <Text style={styles.chatRowText}>Buyers</Text>
              <CheckIcon size={16} weight="bold" color={t.primary[600]} />
            </Pressable>
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => { close(); router.push('/seller/support'); }}
              style={({ pressed }) => [styles.chatRow, styles.chatRowLine, pressed && styles.chatRowPressed]}
            >
              <HeadsetIcon size={19} weight="fill" color={t.neutral[900]} />
              <Text style={styles.chatRowText}>Municipal admin</Text>
              {adminCount > 0 ? <Text style={styles.chatCount}>{adminCount}</Text> : null}
            </Pressable>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

/** A round avatar: the image, or the first letter on light green. */
function Avatar({ uri, name, size, fontSize }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image source={{ uri: resolveImg(uri) }} style={[box, styles.avatarImg]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[box, styles.avatarFallback]}>
      <Text style={[styles.avatarText, { fontSize, lineHeight: fontSize * 1.2 }]}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/**
 * Home's header (.sh-head): the shop (logo, "Hi, <first name>", its name;
 * opens Me), then the bell, the personal account (switches to it) and ⋯
 */
export function SellerHomeHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { store, unreadCount, switchToPersonal } = useSellerShell();
  const name = store?.name || 'My shop';
  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  return (
    <View style={[styles.head, styles.ownHead, { paddingTop: 12 + insets.top, paddingBottom: 12 }]}>
      <Pressable accessibilityRole="link" accessibilityLabel="Your shop" onPress={() => router.push('/seller/menu')} style={styles.shop}>
        <Avatar uri={store?.logo} name={name} size={44} fontSize={18} />
        <View style={styles.shopText}>
          <Text style={styles.shopHi} numberOfLines={1}>{firstName ? `Hi, ${firstName}` : 'Seller Center'}</Text>
          <Text style={styles.shopName} numberOfLines={1} accessibilityRole="header">{name}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <SellerHeaderButton label="Notifications" to="/seller/notifications" badge={unreadCount}>
          <BellIcon size={20} color={t.neutral[700]} />
        </SellerHeaderButton>
        <SellerHeaderButton label="Switch to my buyer account" onPress={switchToPersonal}>
          <Avatar uri={user?.profilePhoto} name={user?.fullName || 'U'} size={30} fontSize={13} />
        </SellerHeaderButton>
        <SellerPageMenu />
      </View>
    </View>
  );
}

/**
 * Me's header (.sme-head): "Me", then Share shop (onShare; only when the
 * shop is public), Shop settings and ⋯
 */
export function SellerMeHeader({ onShare }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, styles.ownHead, { paddingTop: 12 + insets.top }]}>
      <Text style={styles.title} accessibilityRole="header">Me</Text>
      <View style={styles.actions}>
        {onShare ? (
          <SellerHeaderButton label="Share shop" onPress={onShare}>
            <ShareNetworkIcon size={19} color={t.neutral[700]} />
          </SellerHeaderButton>
        ) : null}
        <SellerHeaderButton label="Shop settings" to="/seller/settings">
          <GearIcon size={19} color={t.neutral[700]} />
        </SellerHeaderButton>
        <SellerPageMenu />
      </View>
    </View>
  );
}

/**
 * An inner page's bar (.scm-backbar): back arrow, the page's phone title
 * (PHONE_TITLES), the page's own button(s) and ⋯
 * title:  overrides the title (e.g. a product's name)
 * action: the page's own icon(s) before the ⋯ (SellerHeaderButton; the
 *         assistant's New chat uses style={{ marginRight: 6 }} as .scm-icon--bar)
 * onBack: what Back does (default: back, or where the website goes without history)
 * menu:   false hides the ⋯; menuItems: this page's own actions first in it
 */
export function SellerBackBar({ title, action, onBack, menu = true, menuItems }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const path = cleanSellerPath(pathname);
  const editing = path === '/seller/products/new' && Boolean(params.edit);
  const goBack = onBack || (() => (router.canGoBack() ? router.back() : router.replace(sellerBackTarget(path))));
  return (
    <View style={[styles.backbar, { paddingTop: insets.top, height: 52 + insets.top }]}>
      <ShellBarButton label="Back" onPress={goBack}>
        <CaretLeftIcon size={22} weight="bold" color={t.neutral[900]} />
      </ShellBarButton>
      <Text style={styles.backtitle} numberOfLines={1} accessibilityRole="header">
        {title || sellerPhoneTitle(path, { editing })}
      </Text>
      {action}
      {menu ? <SellerPageMenu extra={menuItems} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: border.default,
    zIndex: 120,
  },
  // Home and Me: drawn in the page's 12px gutter, pulled out to the edges
  // (phone-app.css): 12px at the left, 8px at the right; 4px lower than the
  // tab bars' 8px (the page's own top padding sits above them).
  ownHead: { paddingLeft: 12, paddingRight: 8 },
  title: { flexShrink: 1, minWidth: 0, fontSize: 22, lineHeight: 28, letterSpacing: -0.2, color: t.neutral[900], ...font(500) },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 8 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: t.neutral[0],
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.accent[500],
  },
  badgeText: { fontSize: 10.5, lineHeight: 14, color: '#fff', ...font(700) },

  chatTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 },
  chatSwitch: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.neutral[0],
  },
  chatSwitchText: { fontSize: 13.5, lineHeight: 18, color: t.neutral[700], ...font(500) },
  chatMenu: {
    position: 'absolute',
    minWidth: 230,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 12, blurRadius: 30, color: 'rgba(15, 23, 42, 0.14)' }],
  },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16 },
  chatRowLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  chatRowPressed: { backgroundColor: t.neutral[50] },
  chatRowText: { flex: 1, fontSize: 15, lineHeight: 22, color: t.neutral[800], ...font(400) },
  chatCount: {
    minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: t.accent[500],
    color: '#fff', fontSize: 10.5, lineHeight: 18, textAlign: 'center', ...font(700),
  },

  shop: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 1 },
  shopText: { gap: 1, minWidth: 0, flexShrink: 1 },
  shopHi: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  shopName: { fontSize: 18, lineHeight: 22.5, color: t.neutral[900], ...font(500) },
  avatarImg: { backgroundColor: t.primary[50] },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  avatarText: { color: t.primary[700], ...font(500) },

  backbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: border.default,
    zIndex: 120,
  },
  backtitle: { flex: 1, minWidth: 0, fontSize: 19, lineHeight: 22.8, color: t.neutral[900], ...font(500) },
});
