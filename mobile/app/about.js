import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowCounterClockwiseIcon, ChatsCircleIcon, CodeIcon, GraduationCapIcon, IdentificationCardIcon, MagnifyingGlassIcon,
  MapPinIcon, PackageIcon, ShieldCheckIcon, ShoppingCartIcon, StorefrontIcon, TranslateIcon, TruckIcon, UserPlusIcon,
} from 'phosphor-react-native';
import PublicHeader from '../src/components/public/PublicHeader';
import { font, t } from '../src/theme';

// web/src/pages/About.jsx with About.css and phone-app.css at phone width.

const MUNICIPALITIES = [
  'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan',
  'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria',
];

const FEATURES = [
  {
    Icon: StorefrontIcon,
    title: 'Local stores, direct from the source',
    text: 'Every store is run by a local seller who manages their own listings, stock, orders and fulfillment from the Seller Center.',
  },
  {
    Icon: ShieldCheckIcon,
    title: 'Reviewed sellers and listings',
    text: 'Seller applications and new products are checked by a municipal or platform administrator before they appear to buyers.',
  },
  {
    Icon: TruckIcon,
    title: 'Delivery or store pickup',
    text: 'Sellers choose whether they deliver, offer pickup, or both, and set the municipalities and barangays they deliver to.',
  },
  {
    Icon: IdentificationCardIcon,
    title: 'Identity verification',
    text: 'Buyers verify once with a valid Philippine government ID before checking out. The ID photo is only read, never stored.',
  },
  {
    Icon: ChatsCircleIcon,
    title: 'Messaging and support',
    text: 'Chat with stores about products and orders, and reach your municipal administrator through the support chat.',
  },
  {
    Icon: ArrowCounterClockwiseIcon,
    title: 'Returns and reviews',
    text: 'Request a return for damaged, wrong or incomplete items, and rate products after your order is completed.',
  },
  {
    Icon: MapPinIcon,
    title: 'Store map and image search',
    text: 'Find sellers near you on the store map, or search for a product using a photo.',
  },
  {
    Icon: TranslateIcon,
    title: 'English, Tagalog and Bisaya',
    text: 'Browse the marketplace in the language you are most comfortable with.',
  },
];

const STEPS = [
  { Icon: UserPlusIcon, title: 'Create an account', text: 'Sign up with your email or Google account. Browsing is free.' },
  { Icon: MagnifyingGlassIcon, title: 'Find local products', text: 'Search, filter by category, or explore a municipality.' },
  { Icon: ShoppingCartIcon, title: 'Order from the seller', text: 'Pick delivery or pickup and a payment method the seller accepts.' },
  { Icon: PackageIcon, title: 'Track and receive', text: 'Get notified as your order is confirmed, prepared and completed.' },
];

const DEVELOPERS = [
  { name: 'Mike Fernandez', role: 'Developer' },
  { name: 'Kent Manalo', role: 'Developer' },
  { name: 'John Paul Quisto', role: 'Developer' },
];

const initials = (name) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');

function AboutButton({ label, primary, onPress }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.btn, primary && styles.btnPrimary, pressed && (primary ? styles.btnPrimaryPressed : styles.btnPressed)]}
    >
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export default function About() {
  const router = useRouter();
  const go = (to) => () => router.push(to);

  return (
    <View style={styles.screen}>
      <PublicHeader title="About Emoorm" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <Image source={require('../assets/brand-icon.png')} style={styles.heroLogo} resizeMode="contain" />
          <Text style={styles.eyebrow}>About Emoorm</Text>
          <Text style={styles.heroTitle} accessibilityRole="header">Oriental Mindoro&apos;s local online marketplace</Text>
          <Text style={styles.lead}>
            Emoorm connects buyers with farmers, fishers, artisans and food producers across Oriental Mindoro,
            so fresh produce, local delicacies and handcrafted goods from every town are only a few taps away.
          </Text>
          <View style={styles.actions}>
            <AboutButton primary label="Browse products" onPress={go('/products')} />
            <AboutButton label="Sell on Emoorm" onPress={go('/seller-apply')} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">Our mission</Text>
          <View style={styles.mission}>
            <Text style={styles.missionText}>
              Many local producers in Oriental Mindoro depend on market days, word of mouth and long trips between
              towns to reach buyers. Emoorm gives them an online store they manage themselves, and gives buyers one
              place to discover and order products made and grown in the province.
            </Text>
            <Text style={styles.missionText}>
              Sellers list and manage their own products, and buyers arrange payment and delivery directly with the
              seller of their choice. Emoorm does not process or hold payments; depending on the seller, buyers can
              pay by Cash on Delivery, GCash or QR Ph.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">How it works</Text>
          <View style={styles.list}>
            {STEPS.map(({ Icon, title, text }, index) => (
              <View key={title} style={styles.flatCard}>
                <Text style={styles.stepNum}>{index + 1}</Text>
                <Icon size={28} weight="fill" color={t.primary[600]} style={styles.stepIcon} />
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepText}>{text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Residents who want to sell can{' '}
            <Text style={styles.noteLink} accessibilityRole="link" onPress={go('/seller-apply')}>apply as a seller</Text>
            . Applications are reviewed by a municipal or platform administrator before the store goes live.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">What you can do on Emoorm</Text>
          <View style={styles.list}>
            {FEATURES.map(({ Icon, title, text }, index) => (
              <View key={title} style={[styles.flatCard, styles.feature, index === FEATURES.length - 1 && styles.flatLast]}>
                <Icon size={26} weight="fill" color={t.primary[600]} />
                <Text style={styles.featureTitle}>{title}</Text>
                <Text style={styles.featureText}>{text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">Coverage</Text>
          <Text style={styles.muted}>Emoorm serves all fifteen municipalities of Oriental Mindoro.</Text>
          <View style={styles.towns}>
            {MUNICIPALITIES.map((name) => <Text key={name} style={styles.town}>{name}</Text>)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">The team behind Emoorm</Text>
          <Text style={styles.muted}>
            Emoorm was developed by 4th-year Bachelor of Science in Information Technology students of
            Mindoro State University.
          </Text>

          <View style={styles.team}>
            {DEVELOPERS.map((dev) => (
              <View key={dev.name} style={[styles.card, styles.person]}>
                <View style={[styles.avatar, styles.personAvatar]}>
                  <Text style={styles.avatarText}>{initials(dev.name)}</Text>
                </View>
                <Text style={styles.personName}>{dev.name}</Text>
                <View style={styles.role}>
                  <CodeIcon size={14} weight="bold" color={t.primary[700]} />
                  <Text style={styles.roleText}>{dev.role}</Text>
                </View>
                <Text style={styles.personMeta}>BSIT 4th Year · Mindoro State University</Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, styles.adviser]}>
            <View style={[styles.avatar, styles.adviserAvatar]}>
              {/* The website's adviser text colour reaches this icon too. */}
              <GraduationCapIcon size={30} weight="fill" color={t.neutral[600]} />
            </View>
            <View style={styles.adviserBody}>
              <Text style={styles.adviserEyebrow}>Project Adviser</Text>
              <Text style={styles.adviserName}>Christian Cabrera</Text>
              <Text style={styles.adviserMeta}>Professor · Master&apos;s degree holder · Mindoro State University</Text>
              <Text style={styles.adviserText}>The team developed Emoorm under the guidance and advice of Prof. Cabrera.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.cta]}>
          <Text style={[styles.h2, styles.ctaTitle]} accessibilityRole="header">Questions or feedback?</Text>
          <Text style={styles.ctaText}>Browse the answers in Help &amp; Support, or start a case and tell us what you need. We would love to hear from you.</Text>
          <View style={styles.actions}>
            <AboutButton primary label="Help & Support" onPress={go('/help-center')} />
            <View style={styles.actionSlot} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const GUTTER = 12;
const BAND = t.neutral[100];
const cardShadow = {
  shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  page: { paddingTop: 12, paddingHorizontal: GUTTER, paddingBottom: 24, backgroundColor: t.neutral[0] },

  // Hero: a full-width section with the grey band under it.
  hero: {
    marginHorizontal: -GUTTER,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: t.success[50],
    borderBottomWidth: 8,
    borderBottomColor: BAND,
  },
  heroLogo: { width: 56, height: 56, marginBottom: 12 },
  eyebrow: { marginBottom: 6, fontSize: 13, lineHeight: 20.8, color: t.primary[600], ...font(500) },
  heroTitle: { fontSize: 24, lineHeight: 28.8, color: t.secondary[800], textAlign: 'center', ...font(500) },
  lead: { marginTop: 10, fontSize: 14.5, lineHeight: 23.2, color: t.neutral[600], textAlign: 'center', ...font(400) },
  actions: { flexDirection: 'row', alignSelf: 'stretch', gap: 8, marginTop: 20 },
  actionSlot: { flex: 1 },
  btn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 10,
    backgroundColor: t.neutral[0],
  },
  btnPressed: { backgroundColor: t.neutral[100] },
  btnPrimary: { backgroundColor: t.primary[600], borderColor: t.primary[600] },
  btnPrimaryPressed: { backgroundColor: t.primary[700], borderColor: t.primary[700] },
  btnText: { fontSize: 14, lineHeight: 22.4, color: t.primary[700], textAlign: 'center', ...font(500) },
  btnTextPrimary: { color: t.neutral[0] },

  section: { paddingTop: 32 },
  h2: { marginBottom: 12, fontSize: 20, lineHeight: 24, color: t.neutral[900], ...font(500) },
  mission: { gap: 24 },
  missionText: { fontSize: 14.5, lineHeight: 23.9, color: t.neutral[700], ...font(400) },

  list: { gap: 10 },
  flatCard: {
    marginHorizontal: -GUTTER,
    gap: 6,
    padding: 16,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 8,
    borderBottomColor: BAND,
  },
  flatLast: { borderBottomWidth: 0 },
  stepNum: { position: 'absolute', top: 16, right: 18, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(500) },
  stepIcon: { marginBottom: 4 },
  stepTitle: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  stepText: { fontSize: 13.5, lineHeight: 20.25, color: t.neutral[500], ...font(400) },
  note: { marginTop: 16, fontSize: 14, lineHeight: 22.4, color: t.neutral[600], ...font(400) },
  noteLink: { color: t.primary[700], ...font(500) },

  feature: { gap: 0 },
  featureTitle: { marginTop: 10, marginBottom: 6, fontSize: 15, lineHeight: 18, color: t.neutral[900], ...font(500) },
  featureText: { fontSize: 13.5, lineHeight: 20.9, color: t.neutral[500], ...font(400) },

  muted: { marginTop: -6, marginBottom: 20, fontSize: 15, lineHeight: 24, color: t.neutral[500], ...font(400) },
  towns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  town: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    fontSize: 13.5,
    lineHeight: 21.6,
    color: t.primary[700],
    backgroundColor: t.secondary[50],
    borderRadius: 999,
    overflow: 'hidden',
    ...font(500),
  },

  card: { backgroundColor: t.neutral[0], borderRadius: 12, ...cardShadow },
  team: { gap: 10 },
  person: { alignItems: 'center', gap: 4, padding: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  personAvatar: { marginBottom: 10 },
  avatarText: { fontSize: 24, lineHeight: 30, color: t.neutral[0], ...font(500) },
  personName: { fontSize: 17, lineHeight: 27.2, color: t.neutral[900], textAlign: 'center', ...font(500) },
  role: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roleText: { fontSize: 13, lineHeight: 20.8, color: t.primary[700], ...font(500) },
  personMeta: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], textAlign: 'center', ...font(400) },

  adviser: { marginTop: 14, alignItems: 'center', gap: 20, padding: 16 },
  adviserAvatar: { backgroundColor: t.secondary[800] },
  adviserBody: { alignSelf: 'stretch', gap: 2 },
  adviserEyebrow: { marginBottom: 6, fontSize: 13, lineHeight: 20.8, color: t.primary[600], textAlign: 'center', ...font(500) },
  adviserName: { fontSize: 18, lineHeight: 28.8, color: t.neutral[900], textAlign: 'center', ...font(500) },
  adviserMeta: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[600], textAlign: 'center', ...font(400) },
  adviserText: { marginTop: 8, fontSize: 14, lineHeight: 21.7, color: t.neutral[700], textAlign: 'center', ...font(400) },

  cta: { marginTop: 32, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  ctaTitle: { textAlign: 'center' },
  ctaText: { fontSize: 15, lineHeight: 24, color: t.neutral[500], textAlign: 'center', ...font(400) },
});
