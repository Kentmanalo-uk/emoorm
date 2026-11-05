import {
  useEffect, useId, useMemo, useState,
} from 'react';
import {
  Animated, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as Photo } from 'expo-image';
import Svg, {
  Circle, Defs, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import {
  ArrowRightIcon, GraduationCapIcon, HouseIcon, LifebuoyIcon, MinusIcon, PlayCircleIcon, PlusIcon,
} from '../../src/lib/icons';
import { startAccountSwitch } from '../../src/components/RoleSwitchOverlay';
import Mascot from '../../src/components/avatars/Mascot';
import { LinearFill } from '../../src/components/sell/SellArt';
import { HeroPhone, StepShot } from '../../src/components/sell/SellPhone';
import {
  Areas, Chat, Receipt, Ribbon,
} from '../../src/components/sell/SellSections';
import WhiteMark from '../../src/components/sell/WhiteMark';
import {
  EASE_IN_OUT, frames, useLoop, useReducedMotion,
} from '../../src/components/sell/motion';
import apiClient from '../../src/api/client';
import { fetchCategories, fetchMunicipalities } from '../../src/lib/referenceData';
import { BACKEND_URL, sizedImg } from '../../src/lib/media';
import useAuthStore from '../../src/store/authStore';
import {
  activeScheme, font, t, themed,
} from '../../src/theme';

/*
 * web/src/pages/Sell.jsx + Sell.css at phone width: why and how to open a
 * shop on Emoorm, built around Emoorm's mark, white on the brand green.
 *
 * The green header with one button; the green hero (the headline, the
 * mascot sitting on Start selling, the Seller Center on a tilted phone with
 * a new order dropping in); three big numbers; three reasons, each shown as
 * the thing a seller sees (a receipt, the barangays, a chat); the four
 * steps, each over the top of a phone showing its screen, swiped
 * sideways; the live categories moving past; shops already selling; the
 * questions; the closing green band; and the floating Home button. The page
 * has no back bar or tab bar, as on the website.
 */

/* Each step with the screen it happens on (the Seller Academy's shots, from the site). */
const STEPS = [
  { title: 'Create your account', desc: 'With your email or Google.', time: 'About 2 min', shot: '/tutorial/register.webp' },
  { title: 'Register your shop', desc: 'Shop name, your town, how you deliver, a valid ID.', time: 'About 5 min', shot: '/tutorial/apply.webp' },
  { title: 'List your products', desc: 'Photos, prices, stock. Add more any time.', time: 'A few minutes each', shot: '/tutorial/form-basics.webp' },
  { title: 'Start selling', desc: 'Your town’s admin approves your shop.', time: '1–2 business days', shot: '/tutorial/seller-orders.webp' },
];

/* Answers match how the platform works; see the site footer. */
const FAQS = [
  { q: 'How much does it cost to sell?', a: 'Nothing. Opening a shop and listing products is free, and Emoorm takes no commission on your sales.' },
  { q: 'How do I get paid?', a: 'Buyers pay you directly: cash on delivery, GCash or QR Ph, depending on what you accept. Emoorm does not process or hold payments, so there is no payout waiting period.' },
  { q: 'How long does approval take?', a: 'An administrator for your municipality reviews each application, usually within 1 to 2 business days. You are notified once your shop is live.' },
  { q: 'Do I have to deliver?', a: 'No. You choose the barangays you deliver to, and you can offer pickup from your shop instead of, or alongside, delivery.' },
  { q: 'What about returns?', a: 'A buyer can ask to return an item within 7 days if it arrives damaged, wrong, incomplete or not as described, unless your own return policy says otherwise. You review each request.' },
  { q: 'Can I sell and buy with the same account?', a: 'Yes. Your account switches between your personal profile and your Seller Center, and your shopping stays private.' },
];

const HELP = [
  { Icon: PlayCircleIcon, label: 'Watch how selling works', note: '3 min', to: '/sell/tutorial' },
  { Icon: GraduationCapIcon, label: 'Seller Academy', note: 'Free lessons', to: '/sell/academy' },
  { Icon: LifebuoyIcon, label: 'Help Centre', note: 'A real person answers', to: '/help-center' },
];

const SHOWN_SHOPS = 8;
const STEP_GAP = 16;

/*
 * The page's colours (Sell.css's --sl-*), from the theme. In dark mode the
 * brand green stays the deep one, so white type on it still reads (the
 * website has no dark mode; the dark ramps put a bright mint at 600).
 */
const C = themed(() => {
  const dark = activeScheme() === 'dark';
  return {
    green: dark ? t.primary[400] : t.primary[600],
    pink: t.accent[500],
    pinkSoft: dark ? t.accent[700] : t.accent[300],
    ink: t.neutral[900],
    muted: t.neutral[600],
    line: t.neutral[200],
    page: t.neutral[0],
    card: t.neutral[0],
    tint: t.primary[50],
    pinkTint: t.accent[50],
    steps: t.neutral[50],
  };
});

/* The page's colours as one object, for the pictures (read on each render). */
const colours = () => ({
  green: C.green,
  pink: C.pink,
  ink: C.ink,
  muted: C.muted,
  line: C.line,
  page: C.page,
  card: C.card,
  tint: C.tint,
});

/* The hero's light: radial-gradient(ellipse at 85% 15%, white 8%, transparent 55%). */
function HeroLight() {
  const id = `slLight${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="0.85" cy="0.15" fx="0.85" fy="0.15" r="1.2">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.08} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* The pink sun behind the phone. */
function Sun({ left, top }) {
  const id = `slSun${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, opacity: 0.9 }}>
      <Svg width={290} height={290}>
        <Defs>
          <RadialGradient id={id} cx="0.35" cy="0.35" fx="0.35" fy="0.35" r="0.92">
            <Stop offset="0" stopColor={C.pinkSoft} />
            <Stop offset="0.7" stopColor={C.pink} />
          </RadialGradient>
        </Defs>
        <Circle cx={145} cy={145} r={145} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* A pill button: light (white on the green) or brand (the pink-to-green sweep). */
function Btn({
  label, onPress, disabled, brand, arrow, small,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        small ? styles.btnSmall : null,
        brand ? null : styles.btnLight,
        brand || small ? null : styles.btnShadow,
        disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
      ]}
    >
      {brand ? (
        <LinearFill
          radius={999}
          stops={[[0, C.pink], [0.06, C.pink], [0.94, C.green], [1, C.green]]}
        />
      ) : null}
      <Text style={[styles.btnText, small && styles.btnTextSmall, { color: brand ? '#ffffff' : C.green }]}>{label}</Text>
      {arrow ? <View><ArrowRightIcon size={17} weight="bold" color={brand ? '#ffffff' : C.green} /></View> : null}
    </Pressable>
  );
}

/* The mascot's line, popping now and then (.sl-mascot-say, 3.4s). */
function Say({ running, still }) {
  const clock = useLoop(3400, { running, still });
  const pop = useMemo(() => (clock ? {
    transform: [
      { scale: frames(clock, [[0, 1], [0.45, 1], [0.55, 1.08], [0.65, 1], [1, 1]], { easing: EASE_IN_OUT }) },
      { rotate: frames(clock, [[0, 0], [0.45, 0], [0.55, -2], [0.65, 0], [1, 0]], { easing: EASE_IN_OUT, unit: 'deg' }) },
    ],
  } : null), [clock]);
  return (
    <Animated.View style={[styles.say, pop]}>
      <Text style={[styles.sayText, { color: C.green }]}>Tara! It&apos;s free</Text>
    </Animated.View>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <View style={styles.faqItem}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.faqQ, pressed && styles.pressedFade]}
      >
        <Text style={styles.faqQText}>{item.q}</Text>
        {open ? <MinusIcon size={18} color={C.green} /> : <PlusIcon size={18} color={C.green} />}
      </Pressable>
      {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
    </View>
  );
}

export default function Sell() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const focused = useIsFocused();
  const still = useReducedMotion();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isSeller = isAuthenticated && user?.role === 'SELLER';
  const isPending = isAuthenticated && user?.sellerApplicationStatus === 'PENDING';
  const [openFaq, setOpenFaq] = useState(0);
  const [categories, setCategories] = useState([]);
  const [towns, setTowns] = useState(15);
  const [shops, setShops] = useState([]);

  // Sellers already have a shop: the page switches them to it, as the
  // website does, with the same animation as the Seller Center links.
  useEffect(() => {
    if (isSeller) startAccountSwitch('seller', '/seller', { replace: true });
  }, [isSeller]);

  // The live catalogue, towns and shops (the same requests as the website's).
  useEffect(() => {
    let live = true;
    fetchCategories()
      .then((list) => {
        const named = (list || []).filter((c) => c?.name);
        if (live && named.length) setCategories(named);
      })
      .catch(() => { /* no ribbon, as on the website */ });
    fetchMunicipalities()
      .then((list) => { if (live && list?.length) setTowns(list.length); })
      .catch(() => {});
    apiClient.get('/stores', { params: { page: 1, pageSize: 12 } })
      .then((res) => { if (live) setShops(res?.data || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const ctaLabel = isPending ? 'Application pending' : isAuthenticated ? 'Apply to sell' : 'Start selling';
  const onCta = () => {
    if (isPending) return;
    if (isAuthenticated) router.push('/seller-apply');
    else router.push({ pathname: '/register', params: { redirect: '/seller-apply' } });
  };
  const onLogin = () => router.push('/seller-login');
  const goHome = () => router.dismissTo('/');
  const toggleFaq = (i) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'));
    setOpenFaq((cur) => (cur === i ? -1 : i));
  };
  const openCategory = (cat) => router.push(cat.id
    ? { pathname: '/products', params: { category: cat.id } }
    : { pathname: '/products', params: { search: cat.name } });

  if (isSeller) return <View style={styles.screen} />;

  const c = colours();
  const shownShops = shops.filter((s) => s.logo).slice(0, SHOWN_SHOPS);
  // The steps: three quarters of the page's width each, swiped a step at a time.
  const stepW = (winW - 40) * 0.74;
  const stepMax = 40 + STEPS.length * stepW + (STEPS.length - 1) * STEP_GAP - winW;
  const stepSnaps = STEPS.map((_, i) => Math.min(i * (stepW + STEP_GAP), Math.max(0, stepMax)));
  const sceneW = winW - 40;
  const sceneH = 12 + 626 * 0.8 + 44;

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="light" /> : null}
      <View style={[styles.header, { paddingTop: insets.top, height: 58 + insets.top, backgroundColor: C.green }]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Emoorm home" onPress={goHome} style={styles.logo}>
          <WhiteMark size={30} />
          <Text style={styles.logoText}>emoorm</Text>
        </Pressable>
        <View style={styles.headerEnd}>
          <Btn small label={ctaLabel} onPress={onCta} disabled={isPending} />
        </View>
      </View>

      {/* Pulled past either end, the green shows (the hero above, the closing band below). */}
      <ScrollView
        style={{ backgroundColor: C.green }}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {/* The promise, and the Seller Center at work. */}
        <View style={[styles.hero, { backgroundColor: C.green }]}>
          <HeroLight />
          <View style={styles.wrap}>
            <Text style={styles.h1} accessibilityRole="header">
              {'Your stall,\nopen to all of\n'}
              <Text style={{ color: C.pinkSoft }}>Oriental Mindoro.</Text>
            </Text>
            <Text style={styles.heroSub}>
              Farmers, fisherfolk, cooks and makers sell on Emoorm to buyers in every town,
              for free. You set the prices, the delivery and the payment.
            </Text>
            <View style={styles.heroActions}>
              {/* One of the avatars' creatures, sitting on the button's
                  edge and waving the visitor to it. */}
              <View>
                <Btn label={ctaLabel} onPress={onCta} disabled={isPending} arrow={!isPending} />
                {!isPending ? (
                  <View style={styles.mascot} pointerEvents="none">
                    <Say running={focused} still={still} />
                    <Mascot name="shroom" size={72} running={focused} />
                  </View>
                ) : null}
              </View>
              {isPending ? (
                <Text style={styles.heroNote}>Your application is being reviewed (1–2 business days).</Text>
              ) : (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push('/sell/tutorial')}
                  style={({ pressed }) => [styles.watch, pressed && styles.pressedFade]}
                >
                  <PlayCircleIcon size={22} weight="fill" color="#ffffff" />
                  <Text style={styles.watchText}>See how it works</Text>
                  <Text style={styles.watchTime}>3 min</Text>
                </Pressable>
              )}
            </View>

            <View
              style={[styles.scene, { height: sceneH }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View pointerEvents="none" style={[styles.sceneMark, { left: sceneW + 140 - 350, top: sceneH + 40 - 350 }]}>
                <WhiteMark size={350} />
              </View>
              <Sun left={sceneW / 2 - 145} top={sceneH / 2 - 190} />
              <HeroPhone green={C.green} pinkSoft={C.pinkSoft} running={focused} still={still} />
            </View>
          </View>
        </View>

        {/* Three numbers, as big as they matter. */}
        <View style={styles.numbers} accessibilityLabel="Selling on Emoorm in numbers">
          {[['₱0', 'to open your shop'], ['0%', 'commission on what you sell'], [String(towns), 'towns and cities of buyers']].map(([n, label], i) => (
            <View key={label} style={[styles.number, i > 0 && styles.numberRule]}>
              <Text style={[styles.numberValue, { color: C.green }]}>{n}</Text>
              <Text style={styles.numberLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Why: each reason shown as the thing a seller sees. */}
        <View style={[styles.wrap, styles.why]}>
          <View style={styles.feature}>
            <Text style={styles.h2} accessibilityRole="header">Keep every peso.</Text>
            <Text style={styles.featureText}>
              No listing fee, no monthly fee, no cut of your sales. Buyers pay you directly by
              cash on delivery, GCash or QR Ph, and Emoorm never holds your money.
            </Text>
            <View style={[styles.featureArt, { backgroundColor: C.tint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Receipt c={c} />
            </View>
          </View>
          <View style={[styles.feature, styles.featureRule]}>
            <Text style={styles.h2} accessibilityRole="header">Deliver where you want.</Text>
            <Text style={styles.featureText}>
              Pick the barangays you serve and your own fee, or let buyers pick up at your
              stall. Change it any day; your shop follows.
            </Text>
            <View style={[styles.featureArt, { backgroundColor: C.pinkTint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Areas c={c} />
            </View>
          </View>
          <View style={[styles.feature, styles.featureRule]}>
            <Text style={styles.h2} accessibilityRole="header">Talk to your buyers.</Text>
            <Text style={styles.featureText}>
              Confirm sizes, reserve a batch, agree on a time. Buyers message your shop
              before and after they order, and every chat stays with the order.
            </Text>
            <View style={[styles.featureArt, { backgroundColor: C.tint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Chat c={c} />
            </View>
          </View>
        </View>

        {/* How: each step over the top of a phone showing its screen. */}
        <View style={[styles.steps, { backgroundColor: C.steps }]}>
          <View style={styles.wrap}>
            <Text style={styles.h2} accessibilityRole="header">Open your shop in four steps.</Text>
            <Text style={styles.stepsSub}>About ten minutes on your phone or computer. Nothing to print or mail.</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToOffsets={stepSnaps}
            decelerationRate="fast"
            contentContainerStyle={styles.timeline}
          >
            {STEPS.map((s, i) => (
              <View key={s.title} style={{ width: stepW }}>
                <StepShot
                  uri={`${BACKEND_URL}${s.shot}`}
                  width={stepW}
                  tint={i % 2 ? C.pinkTint : C.tint}
                  fade={C.steps}
                />
                <View style={[styles.stepN, { borderColor: C.steps, backgroundColor: i === STEPS.length - 1 ? C.pink : C.green }]}>
                  <Text style={styles.stepNText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
                <Text style={[styles.stepTime, { color: C.green }]}>{s.time}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={[styles.wrap, styles.stepsCta]}>
            <Btn brand label={ctaLabel} onPress={onCta} disabled={isPending} arrow={!isPending} />
          </View>
        </View>

        {/* What: the live categories, moving. */}
        {categories.length ? (
          <View style={styles.sell}>
            <View style={styles.wrap}>
              <Text style={[styles.h2, styles.sellTitle]} accessibilityRole="header">
                {'Sell what Mindoro\ngrows, catches and makes.'}
              </Text>
            </View>
            <Ribbon categories={categories} c={c} onPress={openCategory} running={focused} still={still} />
          </View>
        ) : null}

        {/* Who: real shops, once there are a few to show. */}
        {shownShops.length >= 4 ? (
          <View style={[styles.wrap, styles.shops]}>
            <Text style={styles.shopsTitle} accessibilityRole="header">Already selling here</Text>
            <View style={styles.shopList}>
              {shownShops.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="link"
                  accessibilityLabel={s.name}
                  onPress={() => router.push(`/store/${s.slug}`)}
                  style={({ pressed }) => [styles.shop, pressed && styles.pressedFade]}
                >
                  <View style={styles.shopClip}>
                    <Photo source={{ uri: sizedImg(s.logo, 60) }} style={styles.shopImg} contentFit="cover" cachePolicy="memory-disk" />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Questions, and where to learn more. */}
        <View style={styles.faq}>
          <View style={styles.wrap}>
            <Text style={styles.h2} accessibilityRole="header">Questions sellers ask.</Text>
            <View style={styles.help}>
              {HELP.map(({
                Icon, label, note, to,
              }) => (
                <Pressable
                  key={label}
                  accessibilityRole="link"
                  onPress={() => router.push(to)}
                  style={({ pressed }) => [styles.helpLink, pressed && styles.pressedFade]}
                >
                  <Icon size={22} weight="fill" color={C.green} />
                  <View style={styles.helpBody}>
                    <Text style={styles.helpLabel}>{label}</Text>
                    <Text style={styles.helpNote}>{note}</Text>
                  </View>
                  <ArrowRightIcon size={16} color={C.ink} />
                </Pressable>
              ))}
            </View>
            <View style={styles.faqList}>
              {FAQS.map((f, i) => (
                <FaqItem key={f.q} item={f} open={openFaq === i} onToggle={() => toggleFaq(i)} />
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.close, { backgroundColor: C.green, paddingBottom: 104 + insets.bottom }]}>
          <View pointerEvents="none" style={styles.closeMark}>
            <WhiteMark size={380} style={styles.closeMarkImg} />
          </View>
          <View style={styles.wrap}>
            <Text style={styles.closeTitle} accessibilityRole="header">Your buyers are already here.</Text>
            <View style={styles.closeActions}>
              <Btn label={ctaLabel} onPress={onCta} disabled={isPending} arrow={!isPending} />
              {!isAuthenticated ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={onLogin}
                  style={({ pressed }) => [styles.closeLogin, pressed && styles.pressedFade]}
                >
                  <Text style={styles.closeLoginText}>Already selling? Log in</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* No tab bar on this page: a way back to shopping stays in reach. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Back to home"
        onPress={goHome}
        style={({ pressed }) => [styles.fab, { bottom: 16 + insets.bottom }, pressed && styles.fabPressed]}
      >
        <HouseIcon size={20} weight="fill" color={t.neutral[0]} />
        <Text style={styles.fabText}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  page: { backgroundColor: t.neutral[0] },
  pressedFade: { opacity: 0.7 },
  wrap: { paddingHorizontal: 20 },

  // ── header: on the green, like the mark ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  logo: {
    flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44,
  },
  logoText: {
    fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: '#ffffff', ...font(700),
  },
  headerEnd: { marginLeft: 'auto' },

  // ── buttons ──
  btn: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
    borderRadius: 999,
  },
  btnSmall: { height: 40, paddingHorizontal: 20 },
  // The website's --t-neutral-0 is white; kept white in dark mode too, on the green.
  btnLight: { backgroundColor: '#ffffff' },
  btnShadow: {
    boxShadow: [{
      offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0, 0, 0, 0.18)',
    }],
  },
  btnDisabled: { opacity: 0.7 },
  btnPressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  btnText: { fontSize: 16, lineHeight: 25.6, ...font(700) },
  btnTextSmall: { fontSize: 14, lineHeight: 22.4 },

  // ── hero ──
  hero: { paddingTop: 32, overflow: 'hidden' },
  h1: {
    marginBottom: 18, fontSize: 44, lineHeight: 43.12, letterSpacing: -1.98, color: '#ffffff', ...font(700),
  },
  heroSub: {
    marginBottom: 80, fontSize: 16, lineHeight: 25.6, color: 'rgba(255, 255, 255, 0.82)', ...font(400),
  },
  heroActions: { gap: 18 },
  // Seated on the button's top edge: 72 wide draws it 90 tall, 62 of it above.
  mascot: {
    position: 'absolute', top: -62, right: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 2,
  },
  say: {
    marginTop: -2,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 14,
    backgroundColor: '#ffffff',
    transformOrigin: 'bottom right',
    boxShadow: [{
      offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(0, 0, 0, 0.2)',
    }],
  },
  sayText: { fontSize: 13, lineHeight: 20.8, ...font(700) },
  watch: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  watchText: {
    fontSize: 16, lineHeight: 25.6, color: '#ffffff', ...font(600),
  },
  watchTime: {
    fontSize: 14, lineHeight: 22.4, color: 'rgba(255, 255, 255, 0.65)', ...font(400),
  },
  heroNote: {
    fontSize: 15, lineHeight: 24, color: 'rgba(255, 255, 255, 0.85)', ...font(400),
  },
  // The phone, after the copy's 8 + the grid's 8 + its own 20, from 12 down.
  scene: { marginTop: 36, paddingTop: 12 },
  sceneMark: { position: 'absolute', opacity: 0.07 },

  // ── numbers ──
  numbers: {
    flexDirection: 'row', paddingTop: 64, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: t.neutral[0],
  },
  number: { flex: 1, paddingRight: 12 },
  numberRule: { paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: t.neutral[200] },
  numberValue: {
    fontSize: 46, lineHeight: 43.7, letterSpacing: -2.3, ...font(700),
  },
  numberLabel: {
    marginTop: 8, fontSize: 13.5, lineHeight: 18.225, color: t.neutral[600], ...font(400),
  },

  // ── why ──
  h2: {
    fontSize: 32, lineHeight: 33.6, letterSpacing: -1.12, color: t.neutral[900], ...font(700),
  },
  why: { paddingTop: 24, paddingBottom: 8 },
  feature: { paddingVertical: 40 },
  featureRule: { borderTopWidth: 1, borderTopColor: t.neutral[200] },
  featureText: {
    marginTop: 12, fontSize: 16, lineHeight: 25.6, color: t.neutral[600], ...font(400),
  },
  featureArt: {
    marginTop: 22, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 18, borderRadius: 24,
  },

  // ── steps ──
  steps: { paddingVertical: 64 },
  stepsSub: {
    marginTop: 12, marginBottom: 32, fontSize: 16, lineHeight: 25.6, color: t.neutral[600], ...font(400),
  },
  timeline: { gap: STEP_GAP, paddingHorizontal: 20, paddingBottom: 6 },
  // 44 across, with an 8px ring of the section's grey, over the phone's foot.
  stepN: {
    width: 60,
    height: 60,
    marginTop: -30,
    marginLeft: -8,
    marginBottom: 8,
    borderRadius: 30,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNText: {
    fontSize: 18, lineHeight: 28.8, color: '#ffffff', ...font(700),
  },
  stepTitle: {
    marginBottom: 6, fontSize: 17, lineHeight: 27.2, color: t.neutral[900], ...font(700),
  },
  stepDesc: {
    marginBottom: 10, fontSize: 15.5, lineHeight: 24.025, color: t.neutral[600], ...font(400),
  },
  stepTime: { fontSize: 14, lineHeight: 22.4, ...font(600) },
  stepsCta: { marginTop: 32 },

  // ── what ──
  sell: { paddingVertical: 64, overflow: 'hidden' },
  sellTitle: { marginBottom: 28 },

  // ── who ──
  shops: { paddingBottom: 56, gap: 20 },
  shopsTitle: {
    fontSize: 17, lineHeight: 27.2, color: t.neutral[600], ...font(500),
  },
  shopList: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  // A white 3px ring outside the 60px logo, and a soft shadow.
  shop: {
    width: 66,
    height: 66,
    margin: -3,
    padding: 3,
    borderRadius: 33,
    backgroundColor: '#ffffff',
    boxShadow: [{
      offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(15, 23, 42, 0.12)',
    }],
  },
  shopClip: { flex: 1, borderRadius: 30, overflow: 'hidden' },
  shopImg: { width: '100%', height: '100%' },

  // ── questions ──
  faq: { paddingVertical: 64, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  help: { marginTop: 20, gap: 4 },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.neutral[200],
  },
  helpBody: { flex: 1 },
  helpLabel: {
    fontSize: 17, lineHeight: 27.2, color: t.neutral[900], ...font(600),
  },
  helpNote: {
    fontSize: 14, lineHeight: 22.4, color: t.neutral[600], ...font(400),
  },
  faqList: { marginTop: 24 },
  faqItem: { borderBottomWidth: 1, borderBottomColor: t.neutral[200] },
  faqQ: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 18,
  },
  faqQText: {
    flex: 1, fontSize: 16, lineHeight: 25.6, color: t.neutral[900], ...font(600),
  },
  faqA: {
    paddingBottom: 22, fontSize: 16, lineHeight: 26.4, color: t.neutral[600], ...font(400),
  },

  // ── close: back on the green ──
  close: { paddingTop: 72, overflow: 'hidden' },
  closeMark: {
    position: 'absolute', top: 0, bottom: 0, right: -140, width: 380, justifyContent: 'center', opacity: 0.08,
  },
  closeMarkImg: { transform: [{ rotate: '-8deg' }] },
  closeTitle: {
    marginBottom: 28, fontSize: 42, lineHeight: 42, letterSpacing: -1.89, color: '#ffffff', ...font(700),
  },
  closeActions: { gap: 18 },
  closeLogin: { alignItems: 'center' },
  closeLoginText: {
    fontSize: 16, lineHeight: 25.6, color: '#ffffff', ...font(600),
  },

  // ── the way back to shopping ──
  fab: {
    position: 'absolute',
    right: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 18,
    borderRadius: 999,
    backgroundColor: t.neutral[900],
    boxShadow: [{
      offsetX: 0, offsetY: 10, blurRadius: 24, color: 'rgba(15, 23, 42, 0.25)',
    }],
  },
  fabPressed: { transform: [{ scale: 0.95 }] },
  fabText: {
    fontSize: 15, lineHeight: 24, color: t.neutral[0], ...font(600),
  },
}));
