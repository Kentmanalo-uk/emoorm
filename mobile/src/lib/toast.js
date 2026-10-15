import { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Easing, StyleSheet, Text, View,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import Toast from 'react-native-toast-message';
import {
  ArrowCounterClockwiseIcon, BellIcon, ChatCircleDotsIcon, ChatTextIcon, CheckCircleIcon, CopyIcon, FileArrowDownIcon,
  FlagIcon, GearSixIcon, HeadsetIcon, HeartIcon, IdentificationCardIcon, ImageSquareIcon, InfoIcon, LockKeyIcon,
  MapPinIcon, PackageIcon, ReceiptIcon, ShoppingCartIcon, StarIcon, StorefrontIcon, TagIcon, TicketIcon,
  UserCircleIcon, UserPlusIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import { font, t } from '../theme';
import { showCommerceHud } from '../components/CommerceHud';
import { liquidGlass } from '../components/Glass';

/*
 * Pop-ups as the website shows them (web/src/components/ui/AppToaster.jsx +
 * AppToaster.css), backed by react-native-toast-message: a white banner that
 * glides down from the top (swipe it up to dismiss), with a small coloured
 * tile saying what it is about (a report's flag, an order's box…), a small
 * uppercase label and "now", the first sentence in bold and the rest under it.
 * "Added to cart" / wishlist confirmations fade in and out in the middle of
 * the screen instead, on Liquid Glass on iOS 26 (components/CommerceHud).
 * One banner shows at a time.
 *
 * iOS 26: the banner is Liquid Glass. It glides in white (the library fades
 * the banner in, and glass can't render while faded), then the white melts
 * away as the glass materialises, and comes back just before it leaves.
 *
 * toast.success(message[, detail]), toast.error(…), toast.info(…): the
 * react-hot-toast call convention the website uses. Exported both ways since
 * call sites use `import toast from ...` and `import { toast } from ...`.
 */

const DURATION = 3800;
// iOS 26: when the glass comes in (once the slide-in is done) and goes.
const GLASS_IN_MS = 300;
const GLASS_OUT_MS = DURATION - 260;

/** A cart or wishlist confirmation (one line): shown as the box in the middle. */
const isCommerce = (text1, text2) => !text2 && /\b(cart|wishlist)\b/i.test(String(text1 || ''));

export const toast = {
  success: (text1, text2) => (isCommerce(text1, text2)
    ? showCommerceHud(text1)
    : Toast.show({ type: 'success', text1, text2, visibilityTime: DURATION })),
  error: (text1, text2) => Toast.show({ type: 'error', text1, text2, visibilityTime: DURATION }),
  info: (text1, text2) => Toast.show({ type: 'info', text1, text2, visibilityTime: DURATION }),
};

// .app-toast-icon.is-<tone>
const TONES = {
  green: t.primary[600],
  blue: t.info[500],
  orange: t.orange[500],
  amber: t.warning[500],
  pink: t.accent[500],
  red: t.danger[500],
  slate: '#64748b',
  purple: t.violet[500],
};

/** What an action's message is about, from its words: the icon and the small label. */
const CONTEXTS = [
  { test: /\breport/i, Icon: FlagIcon, label: 'Report', tone: 'orange' },
  { test: /\breview/i, Icon: StarIcon, label: 'Review', tone: 'amber' },
  { test: /\bwishlist/i, Icon: HeartIcon, label: 'Wishlist', tone: 'pink' },
  { test: /\bcart\b/i, Icon: ShoppingCartIcon, label: 'Cart', tone: 'green' },
  { test: /\breturn\b|\brefund/i, Icon: ArrowCounterClockwiseIcon, label: 'Return', tone: 'amber' },
  { test: /\border/i, Icon: PackageIcon, label: 'Order', tone: 'green' },
  { test: /\bvoucher/i, Icon: TicketIcon, label: 'Voucher', tone: 'pink' },
  { test: /\bpayment|\bproof\b|\bgcash|\bqr\b/i, Icon: ReceiptIcon, label: 'Payment', tone: 'green' },
  { test: /\bmessage|\breply|\bthread|\bchat\b/i, Icon: ChatCircleDotsIcon, label: 'Message', tone: 'blue' },
  { test: /\bsupport|\bcase\b/i, Icon: HeadsetIcon, label: 'Support', tone: 'blue' },
  { test: /\bfeedback/i, Icon: ChatTextIcon, label: 'Feedback', tone: 'blue' },
  { test: /\bpassword|\bmfa\b|\bbackup code|\bsigned (in|out)|\blog(ged)? ?(in|out)/i, Icon: LockKeyIcon, label: 'Security', tone: 'slate' },
  { test: /\bverif|\bidentity/i, Icon: IdentificationCardIcon, label: 'Verification', tone: 'green' },
  { test: /\baddress/i, Icon: MapPinIcon, label: 'Address', tone: 'green' },
  { test: /\bphoto|\bimage|\blogo|\bbanner|\bupload/i, Icon: ImageSquareIcon, label: 'Upload', tone: 'blue' },
  { test: /\bfollow/i, Icon: UserPlusIcon, label: 'Following', tone: 'pink' },
  { test: /\bproduct/i, Icon: TagIcon, label: 'Product', tone: 'green' },
  { test: /\bstore\b|\bshop\b|\bseller/i, Icon: StorefrontIcon, label: 'Shop', tone: 'green' },
  { test: /\bprofile|\baccount/i, Icon: UserCircleIcon, label: 'Account', tone: 'green' },
  { test: /\bcopied|\bcopy\b/i, Icon: CopyIcon, label: 'Copied', tone: 'slate' },
  { test: /\bexport/i, Icon: FileArrowDownIcon, label: 'Export', tone: 'blue' },
  { test: /\bnotification/i, Icon: BellIcon, label: 'Notifications', tone: 'green' },
  { test: /\bsetting|\bsaved\b|\btheme|\bpalette/i, Icon: GearSixIcon, label: 'Settings', tone: 'slate' },
];

const BY_TYPE = {
  success: { Icon: CheckCircleIcon, label: 'Done', tone: 'green' },
  error: { Icon: WarningCircleIcon, label: 'Needs attention', tone: 'red' },
  info: { Icon: InfoIcon, label: 'Notice', tone: 'green' },
};

/** "Report submitted. Our team will review it." → the first sentence in bold, the rest under it. */
const splitMessage = (text) => {
  const match = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  if (!match) return { title: text.replace(/\.$/, ''), detail: '' };
  return { title: match[1].replace(/\.$/, ''), detail: match[2] };
};

/** The banner (.app-toast-card): tile, label and "now", title, detail. */
function Banner({ type, text1, text2 }) {
  const message = String(text1 || '');
  const context = CONTEXTS.find(({ test }) => test.test(message));
  const base = BY_TYPE[type] || BY_TYPE.info;
  // What it is about, from its words; a problem keeps the warning sign.
  const look = type === 'error' ? { ...base, label: context?.label || base.label } : { ...base, ...(context || {}) };
  const { title, detail } = text2 ? { title: message, detail: String(text2) } : splitMessage(message || base.label);
  const Icon = look.Icon;
  const width = Math.min(400, Dimensions.get('window').width - 20);
  return (
    <View
      style={[styles.card, liquidGlass ? styles.cardGlass : styles.cardPlain, { width }]}
      accessibilityRole={type === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
    >
      {liquidGlass ? <GlassLayer show={`${type}|${text1}|${text2}`} /> : null}
      <View style={[styles.tile, { backgroundColor: TONES[look.tone] || TONES.green }]}>
        <Icon size={21} weight="fill" color="#ffffff" />
      </View>
      <View style={styles.text}>
        <View style={styles.top}>
          <Text style={styles.label} numberOfLines={1}>{look.label}</Text>
          <Text style={styles.time}>now</Text>
        </View>
        <Text style={[styles.title, type === 'error' && styles.titleError]} numberOfLines={2}>{title}</Text>
        {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/**
 * iOS 26: the banner's Liquid Glass. A white veil covers it while the banner
 * slides in; then the glass materialises and the veil thins to a light milk
 * (so the words stay easy to read on any page); near the end it all turns
 * white again, ready for the fade out. `show` changes with each new banner.
 */
function GlassLayer({ show }) {
  const [glassOn, setGlassOn] = useState(false);
  const veil = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setGlassOn(false);
    veil.setValue(1);
    const on = setTimeout(() => {
      setGlassOn(true);
      Animated.timing(veil, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, GLASS_IN_MS);
    const off = setTimeout(() => {
      setGlassOn(false);
      Animated.timing(veil, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    }, GLASS_OUT_MS);
    return () => { clearTimeout(on); clearTimeout(off); };
  }, [show, veil]);
  return (
    <>
      <GlassView
        pointerEvents="none"
        colorScheme="light"
        glassEffectStyle={{ style: glassOn ? 'regular' : 'none', animate: true, animationDuration: 0.35 }}
        style={[StyleSheet.absoluteFill, styles.glass]}
      />
      {/* A light milk always; the solid white only while the glass is away. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glass, styles.milk]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glass, styles.veil, { opacity: veil }]} />
    </>
  );
}

function AppToast({ type, text1, text2 }) {
  return <Banner type={type} text1={text1} text2={text2} />;
}

export const toastConfig = {
  success: (props) => <AppToast {...props} type="success" />,
  error: (props) => <AppToast {...props} type="error" />,
  info: (props) => <AppToast {...props} type="info" />,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 12,
    borderRadius: 22,
  },
  cardPlain: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    boxShadow: [
      { offsetX: 0, offsetY: 16, blurRadius: 38, color: 'rgba(15, 23, 42, 0.14)' },
      { offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(15, 23, 42, 0.05)' },
    ],
  },
  // iOS 26: the glass draws its own edge and depth; a soft shadow lifts it off the page.
  cardGlass: {
    boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 30, color: 'rgba(15, 23, 42, 0.12)' }],
  },
  glass: { borderRadius: 22 },
  milk: { backgroundColor: 'rgba(255, 255, 255, 0.28)' },
  veil: { backgroundColor: 'rgba(255, 255, 255, 0.97)' },
  tile: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 1 },
  label: {
    flexShrink: 1, fontSize: 11.5, lineHeight: 15, letterSpacing: 0.46, textTransform: 'uppercase',
    ...font(600), color: t.neutral[500],
  },
  time: { flexShrink: 0, fontSize: 11.5, lineHeight: 15, ...font(400), color: t.neutral[500] },
  title: { fontSize: 14.5, lineHeight: 18.85, ...font(600), color: t.neutral[900] },
  titleError: { color: t.danger[700] },
  detail: { fontSize: 13.5, lineHeight: 18.225, ...font(400), color: t.neutral[600] },
});

export default toast;
