import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowCounterClockwiseIcon, ArrowRightIcon, ChatsCircleIcon, GraduationCapIcon, IdentificationCardIcon, LifebuoyIcon,
  MapPinIcon, ShieldCheckIcon, StorefrontIcon, TranslateIcon, TruckIcon,
} from 'phosphor-react-native';
import PublicHeader from '../src/components/public/PublicHeader';
import HomeFooter from '../src/components/home/HomeFooter';
import GradientIcon from '../src/components/GradientIcon';
import { LinearFill, SWEEP } from '../src/components/sell/SellArt';
import apiClient from '../src/api/client';
import { fetchCategories, fetchMunicipalities } from '../src/lib/referenceData';
import { font, t } from '../src/theme';

/*
 * About Emoorm (web/src/pages/About.jsx's content), laid out for the app:
 * a soft pink-to-mint hero with three quick facts, the mission, a numbered
 * "How it works" timeline, one list of what you can do (each with its own
 * gradient icon), the towns, the team, a brand-gradient help card, and the
 * website's footer at the end.
 */

const MUNICIPALITIES = [
  'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan',
  'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria',
];

const FACTS = [
  { value: '15', label: 'towns served' },
  { value: 'Local', label: 'sellers only' },
  { value: '3', label: 'ways to pay' },
];

const FEATURES = [
  {
    Icon: StorefrontIcon,
    colors: ['#6ee7b7', '#047857'],
    title: 'Local stores, direct from the source',
    text: 'Every store is run by a local seller who manages their own listings, stock, orders and fulfillment from the Seller Center.',
  },
  {
    Icon: ShieldCheckIcon,
    colors: ['#93c5fd', '#2563eb'],
    title: 'Reviewed sellers and listings',
    text: 'Seller applications and new products are checked by a municipal or platform administrator before they appear to buyers.',
  },
  {
    Icon: TruckIcon,
    colors: ['#fcd34d', '#ea580c'],
    title: 'Delivery or store pickup',
    text: 'Sellers choose whether they deliver, offer pickup, or both, and set the municipalities and barangays they deliver to.',
  },
  {
    Icon: IdentificationCardIcon,
    colors: ['#c4b5fd', '#7c3aed'],
    title: 'Identity verification',
    text: 'Buyers verify once with a valid Philippine government ID before checking out. The ID photo is only read, never stored.',
  },
  {
    Icon: ChatsCircleIcon,
    colors: ['#f9a8d4', '#db2777'],
    title: 'Messaging and support',
    text: 'Chat with stores about products and orders, and reach your municipal administrator through the support chat.',
  },
  {
    Icon: ArrowCounterClockwiseIcon,
    colors: ['#5eead4', '#0f766e'],
    title: 'Returns and reviews',
    text: 'Request a return for damaged, wrong or incomplete items, and rate products after your order is completed.',
  },
  {
    Icon: MapPinIcon,
    colors: ['#fca5a5', '#dc2626'],
    title: 'Store map and image search',
    text: 'Find sellers near you on the store map, or search for a product using a photo.',
  },
  {
    Icon: TranslateIcon,
    colors: ['#7dd3fc', '#0284c7'],
    title: 'English, Tagalog and Bisaya',
    text: 'Browse the marketplace in the language you are most comfortable with.',
  },
];

const STEPS = [
  { title: 'Create an account', text: 'Sign up with your email or Google account. Browsing is free.' },
  { title: 'Find local products', text: 'Search, filter by category, or explore a municipality.' },
  { title: 'Order from the seller', text: 'Pick delivery or pickup and a payment method the seller accepts.' },
  { title: 'Track and receive', text: 'Get notified as your order is confirmed, prepared and completed.' },
];

const DEVELOPERS = [
  { name: 'Mike Fernandez', role: 'Developer' },
  { name: 'Kent Manalo', role: 'Developer' },
  { name: 'John Paul Quisto', role: 'Developer' },
];

const initials = (name) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');

function Pill({ label, primary, onPress }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        primary ? styles.pillPrimary : styles.pillPlain,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.pillText, primary && styles.pillTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, sub, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2} accessibilityRole="header">{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

export default function About() {
  const router = useRouter();
  const go = (to) => () => router.push(to);
  // The website's footer (links, directory, town seals) closes this page in
  // the app, rather than the bottom of Home.
  const [footer, setFooter] = useState({ municipalities: [], categories: [], appLogo: null });
  useEffect(() => {
    let live = true;
    Promise.all([
      fetchMunicipalities().catch(() => []),
      fetchCategories().catch(() => []),
      apiClient.get('/app-settings').then((res) => res?.data?.appLogo || null).catch(() => null),
    ]).then(([municipalities, categories, appLogo]) => {
      if (live) setFooter({ municipalities: municipalities || [], categories: categories || [], appLogo });
    });
    return () => { live = false; };
  }, []);

  return (
    <View style={styles.screen}>
      <PublicHeader title="About Emoorm" />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.page}>
        {/* Hero: the soft pink-to-mint wash, the mark on a white tile, three quick facts. */}
        <View style={styles.hero}>
          <LinearFill stops={[[0, t.accent[50]], [1, t.primary[50]]]} diagonal />
          <View style={styles.logoTile}>
            <Image source={require('../assets/brand-icon.png')} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">Oriental Mindoro&apos;s local online marketplace</Text>
          <Text style={styles.lead}>
            Emoorm connects buyers with farmers, fishers, artisans and food producers across Oriental Mindoro,
            so fresh produce, local delicacies and handcrafted goods from every town are only a few taps away.
          </Text>
          <View style={styles.facts}>
            {FACTS.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factValue}>{f.value}</Text>
                <Text style={styles.factLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.heroActions}>
            <Pill primary label="Browse products" onPress={go('/products')} />
            <Pill label="Sell on Emoorm" onPress={go('/seller-apply')} />
          </View>
        </View>

        <Section title="Our mission">
          <View style={styles.card}>
            <Text style={styles.para}>
              Many local producers in Oriental Mindoro depend on market days, word of mouth and long trips between
              towns to reach buyers. Emoorm gives them an online store they manage themselves, and gives buyers one
              place to discover and order products made and grown in the province.
            </Text>
            <Text style={[styles.para, styles.paraNext]}>
              Sellers list and manage their own products, and buyers arrange payment and delivery directly with the
              seller of their choice. Emoorm does not process or hold payments; depending on the seller, buyers can
              pay by Cash on Delivery, GCash or QR Ph.
            </Text>
          </View>
        </Section>

        {/* How it works: a numbered timeline. */}
        <Section title="How it works">
          <View style={styles.card}>
            {STEPS.map(({ title, text }, index) => (
              <View key={title} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={styles.stepDot}>
                    <LinearFill stops={SWEEP} radius={14} diagonal />
                    <Text style={styles.stepNum}>{index + 1}</Text>
                  </View>
                  {index < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={[styles.stepBody, index === STEPS.length - 1 && styles.stepBodyLast]}>
                  <Text style={styles.itemTitle}>{title}</Text>
                  <Text style={styles.itemText}>{text}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Residents who want to sell can{' '}
            <Text style={styles.noteLink} accessibilityRole="link" onPress={go('/seller-apply')}>apply as a seller</Text>
            . Applications are reviewed by a municipal or platform administrator before the store goes live.
          </Text>
        </Section>

        {/* What you can do: one list, a gradient icon each. */}
        <Section title="What you can do on Emoorm">
          <View style={[styles.card, styles.cardList]}>
            {FEATURES.map(({ Icon, colors, title, text }, index) => (
              <View key={title} style={[styles.feature, index > 0 && styles.featureRule]}>
                <View style={[styles.featureIcon, { backgroundColor: `${colors[0]}33` }]}>
                  <GradientIcon Icon={Icon} colors={colors} size={22} />
                </View>
                <View style={styles.featureBody}>
                  <Text style={styles.itemTitle}>{title}</Text>
                  <Text style={styles.itemText}>{text}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Coverage" sub="Emoorm serves all fifteen municipalities of Oriental Mindoro.">
          <View style={styles.towns}>
            {MUNICIPALITIES.map((name) => (
              <View key={name} style={styles.town}>
                <View style={styles.townDot} />
                <Text style={styles.townText}>{name}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section
          title="The team behind Emoorm"
          sub="Emoorm was developed by 4th-year Bachelor of Science in Information Technology students of Mindoro State University."
        >
          <View style={[styles.card, styles.cardList]}>
            {DEVELOPERS.map((dev, index) => (
              <View key={dev.name} style={[styles.person, index > 0 && styles.featureRule]}>
                <View style={styles.avatar}>
                  <LinearFill stops={SWEEP} radius={22} diagonal />
                  <Text style={styles.avatarText}>{initials(dev.name)}</Text>
                </View>
                <View style={styles.featureBody}>
                  <Text style={styles.itemTitle}>{dev.name}</Text>
                  <Text style={styles.itemText}>{dev.role} · BSIT 4th Year · Mindoro State University</Text>
                </View>
              </View>
            ))}
            <View style={[styles.person, styles.featureRule]}>
              <View style={[styles.avatar, styles.adviserAvatar]}>
                <GraduationCapIcon size={22} weight="fill" color="#fff" />
              </View>
              <View style={styles.featureBody}>
                <Text style={styles.eyebrow}>Project Adviser</Text>
                <Text style={styles.itemTitle}>Christian Cabrera</Text>
                <Text style={styles.itemText}>Professor · Master&apos;s degree holder · Mindoro State University</Text>
                <Text style={[styles.itemText, styles.adviserNote]}>The team developed Emoorm under the guidance and advice of Prof. Cabrera.</Text>
              </View>
            </View>
          </View>
        </Section>

        {/* Help: the brand's pink-to-green card. */}
        <View style={styles.cta}>
          <LinearFill stops={SWEEP} radius={18} diagonal />
          <View style={styles.ctaIcon}><LifebuoyIcon size={22} weight="fill" color={t.accent[600]} /></View>
          <Text style={styles.ctaTitle} accessibilityRole="header">Questions or feedback?</Text>
          <Text style={styles.ctaText}>Browse the answers in Help &amp; Support, or start a case and tell us what you need. We would love to hear from you.</Text>
          <Pressable
            accessibilityRole="link"
            onPress={go('/help-center')}
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.ctaBtnText}>Help &amp; Support</Text>
            <ArrowRightIcon size={16} weight="bold" color={t.primary[700]} />
          </Pressable>
        </View>

        <View style={styles.footer}>
          <HomeFooter municipalities={footer.municipalities} categories={footer.categories} appLogo={footer.appLogo} />
        </View>
      </ScrollView>
    </View>
  );
}

const GUTTER = 16;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[50] },
  page: { paddingHorizontal: GUTTER, backgroundColor: t.neutral[50] },
  // The footer runs edge to edge, under the last card.
  footer: { marginTop: 28, marginHorizontal: -GUTTER },

  hero: {
    marginHorizontal: -GUTTER,
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  logoTile: {
    width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    backgroundColor: '#fff', boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 18, color: 'rgba(4, 120, 87, 0.14)' }],
  },
  heroLogo: { width: 48, height: 48 },
  heroTitle: { fontSize: 23, lineHeight: 28.5, color: t.neutral[900], textAlign: 'center', ...font(600) },
  lead: { marginTop: 10, maxWidth: 340, fontSize: 14.5, lineHeight: 22.5, color: t.neutral[600], textAlign: 'center', ...font(400) },
  facts: { flexDirection: 'row', alignSelf: 'stretch', gap: 8, marginTop: 20 },
  fact: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: '#fff',
  },
  factValue: { fontSize: 17, lineHeight: 21, color: t.primary[700], ...font(700) },
  factLabel: { marginTop: 2, fontSize: 12, lineHeight: 15, color: t.neutral[500], ...font(400) },
  heroActions: { flexDirection: 'row', alignSelf: 'stretch', gap: 10, marginTop: 18 },

  pill: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  pillPrimary: { backgroundColor: t.primary[600] },
  pillPlain: { backgroundColor: '#fff', borderWidth: 1, borderColor: t.neutral[200] },
  pillText: { fontSize: 14.5, lineHeight: 18, color: t.neutral[800], ...font(500) },
  pillTextPrimary: { color: '#fff' },

  section: { paddingTop: 28 },
  h2: { marginBottom: 10, fontSize: 18, lineHeight: 22, color: t.neutral[900], ...font(600) },
  sub: { marginTop: -4, marginBottom: 14, fontSize: 14, lineHeight: 21, color: t.neutral[500], ...font(400) },

  card: { padding: 16, borderRadius: 16, backgroundColor: '#fff' },
  cardList: { paddingVertical: 4 },
  para: { fontSize: 14.5, lineHeight: 23, color: t.neutral[700], ...font(400) },
  paraNext: { marginTop: 12 },

  step: { flexDirection: 'row', gap: 14 },
  stepRail: { alignItems: 'center', width: 28 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stepNum: { fontSize: 13, lineHeight: 16, color: '#fff', ...font(700) },
  stepLine: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: t.primary[100] },
  stepBody: { flex: 1, paddingTop: 3, paddingBottom: 18 },
  stepBodyLast: { paddingBottom: 0 },
  itemTitle: { fontSize: 15, lineHeight: 20, color: t.neutral[900], ...font(500) },
  itemText: { marginTop: 3, fontSize: 13.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  note: { marginTop: 12, paddingHorizontal: 4, fontSize: 13.5, lineHeight: 21, color: t.neutral[600], ...font(400) },
  noteLink: { color: t.primary[700], ...font(500) },

  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  featureRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.neutral[200] },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureBody: { flex: 1 },

  towns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  town: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: '#fff',
  },
  townDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary[500] },
  townText: { fontSize: 13.5, lineHeight: 17, color: t.neutral[800], ...font(500) },

  person: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 15, lineHeight: 18, color: '#fff', ...font(600) },
  adviserAvatar: { backgroundColor: t.neutral[700] },
  eyebrow: { marginBottom: 2, fontSize: 12, lineHeight: 15, color: t.primary[600], ...font(600) },
  adviserNote: { marginTop: 6, color: t.neutral[600] },

  cta: { marginTop: 28, alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20, borderRadius: 18, overflow: 'hidden' },
  ctaIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: '#fff' },
  ctaTitle: { fontSize: 19, lineHeight: 24, color: '#fff', textAlign: 'center', ...font(600) },
  ctaText: { marginTop: 6, maxWidth: 300, fontSize: 14, lineHeight: 21, color: 'rgba(255, 255, 255, 0.92)', textAlign: 'center', ...font(400) },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, height: 42, paddingHorizontal: 22,
    borderRadius: 999, backgroundColor: '#fff',
  },
  ctaBtnText: { fontSize: 14.5, lineHeight: 18, color: t.primary[700], ...font(600) },
});
