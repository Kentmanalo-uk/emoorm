import { useEffect, useState } from 'react';
import {
  Image, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRightIcon, CameraIcon, ChartLineUpIcon, ChatCircleDotsIcon, HouseIcon, IdentificationCardIcon, MinusIcon,
  MoneyIcon, PackageIcon, PlayCircleIcon, PlusIcon, SealCheckIcon, StorefrontIcon, TruckIcon, UsersIcon,
} from 'phosphor-react-native';
import EmptyArt from '../../src/components/EmptyArt';
import { startAccountSwitch } from '../../src/components/RoleSwitchOverlay';
import {
  Glow, LinearFill, Rings, SWEEP, SWEEP_LIGHT, SweepText,
} from '../../src/components/sell/SellArt';
import { fetchCategories } from '../../src/lib/referenceData';
import { resolveImg } from '../../src/lib/media';
import useAuthStore from '../../src/store/authStore';
import { font, t } from '../../src/theme';

/*
 * web/src/pages/Sell.jsx + Sell.css at phone width ("Sell on Emoorm"): the
 * logo bar with one button, the photo hero with its two glass cards, then
 * tiles and short lists, the questions, the closing band and the floating
 * Home button. The page has no back bar or tab bar, as on the website.
 */

const BENEFITS = [
  { Icon: StorefrontIcon, title: 'Free to open a shop' },
  { Icon: UsersIcon, title: 'Reach local buyers' },
  { Icon: TruckIcon, title: 'You control delivery' },
  { Icon: ChatCircleDotsIcon, title: 'Talk to your buyers' },
  { Icon: ChartLineUpIcon, title: 'See how you are doing' },
  { Icon: SealCheckIcon, title: 'Verified and trusted' },
];

const TOOLS = [
  { art: 'products', title: 'List what you sell' },
  { art: 'delivery', title: 'Fulfil your way' },
  { art: 'payments', title: 'Get paid directly' },
  { art: 'analytics', title: 'Know your numbers' },
];

const REQUIREMENTS = [
  { Icon: IdentificationCardIcon, title: 'A valid government ID' },
  { Icon: StorefrontIcon, title: 'Your shop details' },
  { Icon: CameraIcon, title: 'Photos of your products' },
];

const FAQS = [
  {
    q: 'How much does it cost to sell?',
    a: 'Nothing. Opening a shop and listing products is free, and Emoorm takes no commission on your sales.',
  },
  {
    q: 'How do I get paid?',
    a: 'Buyers pay you directly. Depending on what you accept, that is cash on delivery, GCash, or QR Ph. Emoorm does not process or hold payments, so there is no payout waiting period.',
  },
  {
    q: 'How long does approval take?',
    a: 'Applications are reviewed by a municipal or platform administrator, usually within 1 to 2 business days. You will be notified once your shop is live.',
  },
  {
    q: 'Do I have to deliver?',
    a: 'No. You choose the municipalities and barangays you deliver to, and you can offer store pickup instead of or alongside delivery.',
  },
  {
    q: 'What about returns?',
    a: 'A buyer can request a return within 7 days if an item arrives damaged, incorrect, incomplete or not as described, unless your own return policy says otherwise. You review each request.',
  },
  {
    q: 'Can I sell and buy with the same account?',
    a: 'Yes. Your account switches between your personal profile and your Seller Center, and your buyer activity stays private.',
  },
];

const STEPS = [
  { n: '1', title: 'Create a seller account', desc: 'Sign up with your name and email.' },
  { n: '2', title: 'Register your shop', desc: 'Store name, location, and valid ID.' },
  { n: '3', title: 'List your products', desc: 'Photos, prices, descriptions.' },
  { n: '4', title: 'Start earning', desc: 'Buyers find you and you deliver.' },
];

// Stands in only until the live catalogue answers.
const CATEGORIES = [
  'Vegetables', 'Fruits', 'Seafood', 'Livestock', 'Handicrafts', 'Dried Goods',
  'Local Delicacies', 'Processed Foods', 'Beverages',
].map((name) => ({ name }));

const HERO = {
  main: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80',
  side: [
    'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=80',
    'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80',
  ],
};

function PillButton({
  label, onPress, sweep, ghost, dark, disabled, arrow,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        ghost && (dark ? styles.pillGhostDark : styles.pillGhost),
        disabled && styles.pillDisabled,
        pressed && styles.pillPressed,
      ]}
    >
      {sweep ? <LinearFill stops={sweep} radius={999} /> : null}
      <Text style={[styles.pillText, ghost && !dark && styles.pillTextGhost]}>{label}</Text>
      {/* In a View: on the web a bare svg would paint under the gradient. */}
      {arrow ? <View><ArrowRightIcon size={16} color={t.neutral[0]} /></View> : null}
    </Pressable>
  );
}

function GlassCard({ Icon, iconColor, title, text: sub, style, subStyle }) {
  return (
    <View style={[styles.glass, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.glassIcon}><Icon size={24} weight="fill" color={iconColor} /></View>
      <View style={styles.glassText}>
        <Text style={styles.glassTitle}>{title}</Text>
        <Text style={[styles.glassSub, subStyle]}>{sub}</Text>
      </View>
    </View>
  );
}

function FaqItem({ item, open, onToggle, last }) {
  return (
    <View style={[styles.faqItem, last && styles.faqItemLast]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.faqQ, pressed && styles.faqQPressed]}
      >
        <Text style={styles.faqQText}>{item.q}</Text>
        {open
          ? <MinusIcon size={16} color={t.accent[500]} />
          : <PlusIcon size={16} color={t.secondary[600]} />}
      </Pressable>
      {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
    </View>
  );
}

export default function Sell() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  // The page's 16px sides: two tiles across with a 10px gap, three with 8px.
  const half = { width: (winW - 32 - 10) / 2 };
  const third = { width: (winW - 32 - 16) / 3 };
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isSeller = isAuthenticated && user?.role === 'SELLER';
  const isPending = isAuthenticated && user?.sellerApplicationStatus === 'PENDING';
  const [openFaq, setOpenFaq] = useState(0);
  const [categories, setCategories] = useState(CATEGORIES);
  const [band, setBand] = useState({ width: 390, height: 300 });

  // Sellers already have a shop: the page switches them to it, as the
  // website does, with the same animation as the Seller Center links.
  useEffect(() => {
    if (isSeller) startAccountSwitch('seller', '/seller', { replace: true });
  }, [isSeller]);

  // What a seller can list under comes from the live catalogue.
  useEffect(() => {
    let live = true;
    fetchCategories()
      .then((list) => {
        const named = (list || []).filter((c) => c?.name);
        if (live && named.length) setCategories(named);
      })
      .catch(() => { /* the shipped list stands in */ });
    return () => { live = false; };
  }, []);

  const ctaLabel = isPending ? 'Application Pending' : isAuthenticated ? 'Apply to sell' : 'Start selling';
  const onCta = () => {
    if (isPending) return;
    if (isAuthenticated) router.push('/seller-apply');
    else router.push({ pathname: '/register', params: { redirect: '/seller-apply' } });
  };
  const onLogin = () => router.push('/seller-login');
  const goHome = () => router.dismissTo('/');
  const toggleFaq = (i) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setOpenFaq((cur) => (cur === i ? -1 : i));
  };
  const openCategory = (cat) => router.push(cat.id
    ? { pathname: '/products', params: { category: cat.id } }
    : { pathname: '/products', params: { search: cat.name } });

  if (isSeller) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top, height: 65 + insets.top }]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Emoorm home" onPress={goHome} style={styles.logo}>
          <Image source={require('../../assets/brand-icon.png')} style={styles.logoImg} resizeMode="contain" />
          <Text style={styles.logoText}>emoorm</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isPending}
          onPress={onCta}
          style={({ pressed }) => [styles.navBtn, isPending && styles.pillDisabled, pressed && styles.pillPressed]}
        >
          <Text style={styles.navBtnText} numberOfLines={1}>{ctaLabel}</Text>
        </Pressable>
      </View>

      <ScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Hero: the photos first, then the pitch. */}
        <View style={styles.hero}>
          <Glow size={780} left={-359} top={-82} stops={[[0, t.primary[50]], [0.68, '#ffffff', 0]]} />
          <View style={styles.media}>
            <View style={styles.imgs}>
              <View style={styles.imgMain}>
                <Image source={{ uri: HERO.main }} style={styles.img} accessibilityLabel="Fresh vegetables" />
              </View>
              <View style={styles.imgSide}>
                <Image source={{ uri: HERO.side[0] }} style={[styles.img, styles.imgSideOne]} accessibilityLabel="Fresh fruits" />
                <Image source={{ uri: HERO.side[1] }} style={[styles.img, styles.imgSideOne]} accessibilityLabel="Root vegetables" />
              </View>
            </View>
            <GlassCard
              Icon={StorefrontIcon}
              iconColor={t.secondary[600]}
              title="Your Seller Center"
              text="Orders, earnings and messages in one place"
              style={styles.badge}
              subStyle={styles.badgeSub}
            />
            <GlassCard
              Icon={MoneyIcon}
              iconColor={t.accent[500]}
              title="Paid directly"
              text="Cash, GCash or QR Ph"
              style={styles.chip}
            />
          </View>

          <View style={styles.copy}>
            <Text style={styles.h1} accessibilityRole="header">
              {'Start Selling\n'}
              <SweepText style={styles.h1}>in Emoorm</SweepText>
            </Text>
            <Text style={styles.sub}>Free shop. Local buyers. No commission.</Text>
            <View style={styles.heroBtns}>
              <PillButton label={ctaLabel} sweep={SWEEP} arrow onPress={onCta} disabled={isPending} />
              {!isAuthenticated ? <PillButton ghost label="Already a seller? Log in" onPress={onLogin} /> : null}
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/sell/tutorial')}
              style={({ pressed }) => [styles.watch, pressed && styles.pressedFade]}
            >
              <PlayCircleIcon size={20} weight="fill" color={t.primary[700]} />
              <Text style={styles.watchText}>Watch how selling works</Text>
              <Text style={styles.watchTime}>3 min</Text>
            </Pressable>
            {isPending ? (
              <Text style={styles.pending}>Your application is under review (1–2 business days).</Text>
            ) : null}
          </View>
        </View>

        {/* Benefits: a 2 × 3 grid of icon tiles. */}
        <View style={[styles.section, styles.sectionGray]}>
          <Text style={styles.h2} accessibilityRole="header">Built for Oriental Mindoro</Text>
          <View style={styles.grid2}>
            {BENEFITS.map(({ Icon, title }, i) => (
              <View key={title} style={[styles.benefit, half, (i % 4 === 1 || i % 4 === 2) && styles.benefitTint]}>
                <View style={[styles.benefitIcon, i % 3 === 1 && styles.benefitIconPink]}>
                  <Icon size={22} weight="fill" color={t.neutral[0]} />
                </View>
                <Text style={styles.tileTitle}>{title}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* How it works: a numbered timeline. */}
        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">How it works</Text>
          {STEPS.map((s, i) => (
            <View key={s.n} style={[styles.step, i === STEPS.length - 1 && styles.stepLast]}>
              {i < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
              <View style={styles.stepN}><Text style={styles.stepNText}>{s.n}</Text></View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Tools: a 2 × 2 grid of illustrated tiles. */}
        <View style={[styles.section, styles.sectionGray]}>
          <Text style={styles.h2} accessibilityRole="header">Everything you need to run your shop</Text>
          <View style={styles.grid2}>
            {TOOLS.map((tool) => (
              <View key={tool.title} style={[styles.tool, half]}>
                <View style={styles.toolArt}><EmptyArt name={tool.art} size={25.6} /></View>
                <Text style={[styles.tileTitle, styles.toolTitle]}>{tool.title}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Categories: three across. */}
        <View style={styles.section}>
          <View style={styles.catsHead}>
            <Text style={[styles.h2, styles.catsTitle]} accessibilityRole="header">What can you sell?</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/products')}
              style={({ pressed }) => [styles.textLink, pressed && styles.pressedFade]}
            >
              <Text style={styles.textLinkText}>Browse the marketplace</Text>
              <ArrowRightIcon size={15} color={t.secondary[600]} />
            </Pressable>
          </View>
          <View style={styles.catGrid}>
            {categories.map((cat) => (
              <Pressable
                key={cat.id || cat.name}
                accessibilityRole="link"
                accessibilityLabel={cat.name}
                onPress={() => openCategory(cat)}
                style={({ pressed }) => [styles.cat, third, pressed && styles.pressedFade]}
              >
                <View style={styles.catThumb}>
                  {cat.image
                    ? <Image source={{ uri: resolveImg(cat.image) }} style={styles.img} />
                    : <PackageIcon size={22} weight="fill" color={t.secondary[600]} />}
                </View>
                <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Requirements: three tiles in a row. */}
        <View style={[styles.section, styles.sectionGray]}>
          <Text style={[styles.h2, styles.reqTitle]} accessibilityRole="header">What you need to get started</Text>
          <View style={styles.reqRow}>
            {REQUIREMENTS.map(({ Icon, title }) => (
              <View key={title} style={styles.req}>
                <View style={styles.reqIcon}><Icon size={24} weight="fill" color={t.accent[500]} /></View>
                <Text style={styles.reqText}>{title}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Questions: one bordered list. */}
        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">Questions sellers ask</Text>
          <View style={styles.faq}>
            {FAQS.map((f, i) => (
              <FaqItem key={f.q} item={f} open={openFaq === i} onToggle={() => toggleFaq(i)} last={i === FAQS.length - 1} />
            ))}
          </View>
        </View>

        {/* The closing band. */}
        <View
          style={styles.finalCta}
          onLayout={(e) => setBand({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          <LinearFill diagonal stops={[[0, t.primary[900]], [1, t.primary[800]]]} />
          <Rings width={band.width} height={band.height} />
          <Glow
            size={780}
            left={band.width * 1.14 - 780}
            top={-0.45 * band.height}
            stops={[[0, t.accent[500], 0.42], [0.45, t.accent[500], 0.16], [0.72, t.accent[500], 0]]}
          />
          <Text style={styles.finalTitle} accessibilityRole="header">Ready to start selling?</Text>
          <Text style={styles.finalText}>Free to open, no commission, and your buyers are already here.</Text>
          <View style={styles.finalBtns}>
            <PillButton
              label={isPending ? 'Application Pending' : 'Start selling'}
              sweep={SWEEP_LIGHT}
              arrow
              onPress={onCta}
              disabled={isPending}
            />
            {!isAuthenticated ? <PillButton ghost dark label="Already a seller? Log in" onPress={onLogin} /> : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  pressedFade: { opacity: 0.7 },

  // ── the logo bar ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    backgroundColor: t.neutral[0],
    zIndex: 10,
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  logoImg: { width: 32, height: 32 },
  logoText: { fontSize: 22, lineHeight: 35.2, letterSpacing: -0.88, color: t.success[700], ...font(700) },
  navBtn: {
    marginLeft: 'auto',
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.secondary[600],
  },
  navBtnText: { fontSize: 13.5, lineHeight: 16.2, color: t.neutral[0], ...font(500) },

  // ── hero ──
  hero: { paddingTop: 12, paddingBottom: 28, paddingHorizontal: 16, overflow: 'hidden' },
  media: { height: 340, marginBottom: 22 },
  imgs: { flex: 1, flexDirection: 'row', gap: 8 },
  imgMain: {
    flex: 3,
    borderRadius: 16,
    backgroundColor: t.neutral[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 5,
  },
  imgSide: { flex: 2, gap: 8 },
  imgSideOne: { flex: 1, height: undefined },
  img: { width: '100%', height: '100%', borderRadius: 16 },
  glass: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 210,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    // The website blurs the photo behind it (backdrop-filter); without a
    // blur the card is a little more opaque so its text stays as readable.
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  glassIcon: { flexShrink: 0 },
  glassText: { flexShrink: 1 },
  glassTitle: { fontSize: 13, lineHeight: 18.2, color: t.neutral[900], ...font(500) },
  glassSub: { fontSize: 11.5, lineHeight: 15.5, color: t.neutral[700], ...font(400) },
  badge: { left: 10, bottom: 12 },
  badgeSub: { fontSize: 12, lineHeight: 16.8 },
  chip: { top: 14, right: 10 },
  copy: {},
  h1: { marginBottom: 8, fontSize: 34, lineHeight: 37.4, letterSpacing: -0.68, color: t.neutral[900], ...font(500) },
  sub: { marginBottom: 18, fontSize: 15, lineHeight: 24, color: t.neutral[600], ...font(400) },
  heroBtns: { gap: 10 },
  pill: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  pillGhost: { backgroundColor: t.neutral[0], borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.12)' },
  pillGhostDark: { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' },
  pillDisabled: { opacity: 0.6 },
  pillPressed: { opacity: 0.85 },
  pillText: { fontSize: 15, lineHeight: 18, color: t.neutral[0], ...font(500) },
  pillTextGhost: { color: t.neutral[600] },
  watch: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, minHeight: 40, marginTop: 8 },
  watchText: { fontSize: 15, lineHeight: 24, color: t.primary[700], ...font(600) },
  watchTime: { fontSize: 15, lineHeight: 24, color: t.neutral[500], ...font(500) },
  pending: { marginTop: 12, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },

  // ── sections ──
  section: { paddingVertical: 32, paddingHorizontal: 16, backgroundColor: t.neutral[0] },
  sectionGray: { backgroundColor: t.neutral[50] },
  h2: { marginBottom: 16, fontSize: 22, lineHeight: 26.4, letterSpacing: -0.22, color: t.neutral[900], ...font(500) },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileTitle: { fontSize: 14.5, lineHeight: 18.85, letterSpacing: -0.22, color: t.neutral[900], ...font(500) },

  benefit: {
    minHeight: 118,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 16,
    backgroundColor: t.neutral[0],
  },
  benefitTint: { backgroundColor: t.primary[50], borderColor: 'transparent' },
  benefitIcon: {
    width: 40,
    height: 40,
    marginBottom: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  benefitIconPink: { backgroundColor: t.accent[500] },

  step: { flexDirection: 'row', gap: 14, paddingBottom: 20 },
  stepLast: { paddingBottom: 0 },
  stepLine: {
    position: 'absolute', left: 17, top: 38, bottom: 2, width: 2, borderRadius: 2, backgroundColor: t.primary[100],
  },
  stepN: {
    width: 44,
    height: 44,
    margin: -4,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: t.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  stepNText: { fontSize: 15, lineHeight: 18, color: t.neutral[0], ...font(500) },
  stepBody: { flex: 1, minWidth: 0 },
  stepTitle: { marginTop: 6, marginBottom: 2, fontSize: 15, lineHeight: 19.5, color: t.neutral[900], ...font(500) },
  stepDesc: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },

  tool: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 16,
    backgroundColor: t.neutral[0],
  },
  toolArt: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  toolTitle: { marginBottom: 4, letterSpacing: 0 },

  catsHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  catsTitle: { flexShrink: 1, marginBottom: 0 },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, minHeight: 40, marginTop: -6 },
  textLinkText: { fontSize: 13.5, lineHeight: 21.6, color: t.secondary[600], ...font(500) },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 },
  cat: { gap: 6 },
  catThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[50],
  },
  catName: { fontSize: 12.5, lineHeight: 16.25, textAlign: 'center', color: t.neutral[800], ...font(400) },

  reqTitle: { textAlign: 'center' },
  reqRow: { flexDirection: 'row', gap: 8 },
  req: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 16,
    backgroundColor: t.neutral[0],
  },
  reqIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reqText: { fontSize: 13, lineHeight: 16.9, letterSpacing: -0.13, textAlign: 'center', color: t.neutral[900], ...font(500) },

  faq: { overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 16, backgroundColor: t.neutral[0] },
  faqItem: { borderBottomWidth: 1, borderBottomColor: t.neutral[150] },
  faqItemLast: { borderBottomWidth: 0 },
  faqQ: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 15, paddingHorizontal: 16 },
  faqQPressed: { backgroundColor: t.neutral[50] },
  faqQText: { flex: 1, fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900], ...font(500) },
  faqA: { paddingHorizontal: 16, paddingBottom: 15, fontSize: 13.5, lineHeight: 20.9, color: t.neutral[600], ...font(400) },

  finalCta: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16, overflow: 'hidden' },
  finalTitle: { fontSize: 24, lineHeight: 27.6, letterSpacing: -0.48, textAlign: 'center', color: t.neutral[0], ...font(500) },
  finalText: {
    marginTop: 10, marginBottom: 26, fontSize: 14, lineHeight: 22.4, textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)', ...font(400),
  },
  finalBtns: { alignSelf: 'stretch', gap: 10 },

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
    backgroundColor: t.secondary[600],
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: { transform: [{ scale: 0.95 }] },
  fabText: { fontSize: 15, lineHeight: 24, color: t.neutral[0], ...font(600) },
});
