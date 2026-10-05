import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, t } from '../../theme';
import { useSetupReturn } from '../../lib/setupReturn';
import { useAccountSwitchStore } from '../RoleSwitchOverlay';
import SellerGuideArt from './SellerGuideArt';
import { completeGuide, shouldShowGuide } from './sellerGuides';
import { useSellerShell } from './SellerShell';

/**
 * Phones: the first time a shop opens a Seller Center page, a small sheet
 * rises with a picture of what the page is for, a title and a line or two
 * (web/src/components/seller/SellerPhoneGuide.jsx + .css). One sheet per
 * page, saved on the shop (store.sellerGuides, PUT /stores/my/guides) under
 * the same keys as the website, so a page seen on one device is done on the
 * other. Mounted once by app/seller/_layout.js.
 */
export const GUIDE_PAGES = {
  '/seller': {
    key: 'dashboard',
    art: 'home',
    title: 'Your shop at a glance',
    text: 'Orders waiting, today\'s sales and tips show here first. The shop tools below take you everywhere else.',
  },
  '/seller/products': {
    art: 'products',
    title: 'Your products',
    text: 'Everything you sell, with its stock and status. Tap Add product to list something new.',
  },
  '/seller/products/new': {
    art: 'newProduct',
    title: 'Add a product',
    text: 'Clear photos, a fair price and the stock you have. New listings may get a quick check before buyers see them.',
  },
  '/seller/today': {
    art: 'today',
    title: "Today's menu",
    text: 'Post fresh food or harvests with how many you have and until when. Buyers order until it ends or sells out; you confirm each order quickly.',
  },
  '/seller/orders': {
    art: 'orders',
    title: 'Orders, step by step',
    text: 'Each tab is a step. Every order shows one button for what to do next, and the buyer is told as it moves on.',
  },
  '/seller/returns': {
    art: 'returns',
    title: 'Returns & refunds',
    text: 'Look over a buyer\'s request, confirm the parcel when it comes back, then record the refund.',
  },
  '/seller/messages': {
    art: 'messages',
    title: 'Chat with buyers',
    text: 'Questions about products, delivery and orders arrive here. Quick, kind replies bring buyers back.',
  },
  '/seller/assistant': {
    art: 'assistant',
    title: 'Ask Ate Moormy',
    text: 'Not sure how something works? Ask in English or Tagalog and she will walk you through it.',
  },
  '/seller/marketing': {
    art: 'marketing',
    title: 'Bring buyers in',
    text: 'Announce news to your followers, promote a product or share your shop link.',
  },
  '/seller/decorate': {
    art: 'decorate',
    title: 'Decorate your shop',
    text: 'Choose what buyers see first on your shop page and how it looks.',
  },
  '/seller/menu': {
    art: 'menu',
    title: 'Everything about your shop',
    text: 'Shop health, earnings, delivery and payment, help and settings, all in one list.',
  },
  '/seller/store': {
    art: 'store',
    title: 'Your shop profile',
    text: 'Name, logo, banner and description: what buyers see. Tap a row to change just that part.',
  },
  '/seller/fulfillment': {
    art: 'fulfillment',
    title: 'Delivery & payment',
    text: 'Delivery, pickup or both, where you deliver and for how much, and how buyers pay you.',
  },
  '/seller/analytics': {
    art: 'analytics',
    title: 'How your shop is doing',
    text: 'Sales, orders and best sellers over time, so you know what to restock and promote.',
  },
  '/seller/finance': {
    art: 'finance',
    title: 'Your earnings',
    text: 'Money from completed orders, kept apart from orders still on the way. Download it anytime.',
  },
  '/seller/reviews': {
    art: 'reviews',
    title: 'Buyer reviews',
    text: 'Read what buyers say and reply. Replies are public, so keep them helpful and kind.',
  },
  '/seller/questions': {
    art: 'questions',
    title: 'Buyer questions',
    text: 'Answer questions about your products. Answers show on the product page for the next buyer too.',
  },
  '/seller/notifications': {
    art: 'notifications',
    title: 'Shop notifications',
    text: 'New orders, messages, reviews and news from Emoorm, all in one place.',
  },
  '/seller/support': {
    art: 'support',
    title: 'Your municipal admin',
    text: 'Talk to your town\'s admin about your shop, your verification or anything you need help with.',
  },
  '/seller/settings': {
    art: 'settings',
    title: 'Shop settings',
    text: 'Account-level controls for your shop, separate from your public shop profile.',
  },
};

const OPEN_DELAY_MS = 600;
const OPEN_MS = 280;
const CLOSE_MS = 220;

export default function SellerPhoneGuide() {
  const { store, setStore } = useSellerShell();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const fromSetup = useSetupReturn();
  const switching = useAccountSwitchStore((s) => Boolean(s.request));
  const path = pathname.replace(/\/+$/, '') || '/';
  const page = GUIDE_PAGES[path];
  const guideKey = page?.key || path;
  // Sent by a link to one part of the page (`focus`) to do one thing, or on
  // an errand from the guided setup: the sheet waits for a later visit.
  // Nor does it open under the account switch.
  const focused = Boolean(params.focus);
  const eligible = Boolean(page) && shouldShowGuide(store, guideKey) && !focused && !switching && !fromSetup;

  // { key, page, closing } for the sheet on screen.
  const [shown, setShown] = useState(null);
  const open = Boolean(shown && shown.key === guideKey);

  useEffect(() => {
    if (!eligible) return undefined;
    const timer = setTimeout(() => setShown({ key: guideKey, page, closing: false }), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eligible, guideKey, page]);

  const close = () => {
    if (!open || shown.closing) return;
    completeGuide(guideKey, setStore);
    setShown({ ...shown, closing: true });
    setTimeout(() => setShown(null), CLOSE_MS);
  };

  if (!open) return null;
  return <GuideSheet page={shown.page} closing={shown.closing} onClose={close} />;
}

function GuideSheet({ page, closing, onClose }) {
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (closing) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(rise, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: OPEN_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
    ]).start();
  }, [closing, fade, rise]);

  const travel = sheetH || screenH;
  const artW = Math.min(280, width - 48);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
          style={[styles.sheet, {
            paddingBottom: 18 + insets.bottom,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }],
          }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <View style={styles.handle} />
          <SellerGuideArt name={page.art} width={artW} style={styles.art} />
          <Text style={styles.title} accessibilityRole="header">{page.title}</Text>
          <Text style={styles.text}>{page.text}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.ok, pressed && styles.okPressed]}>
            <Text style={styles.okText}>Got it</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.38)' },
  sheet: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: -8, blurRadius: 30, color: 'rgba(15, 23, 42, 0.12)' }],
  },
  handle: { width: 36, height: 4, marginBottom: 6, borderRadius: 999, backgroundColor: t.neutral[200] },
  art: { marginBottom: 6 },
  title: { marginBottom: 6, fontSize: 20, lineHeight: 26, color: t.neutral[900], textAlign: 'center', ...font(500) },
  text: { maxWidth: 320, marginBottom: 18, fontSize: 14, lineHeight: 21, color: t.neutral[500], textAlign: 'center', ...font(400) },
  ok: {
    alignSelf: 'stretch', minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: t.primary[600],
  },
  okPressed: { backgroundColor: t.primary[700] },
  okText: { fontSize: 15, lineHeight: 20, color: '#fff', ...font(600) },
});
