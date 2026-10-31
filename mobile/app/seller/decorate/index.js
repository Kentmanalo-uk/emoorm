import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { font, t, themed } from '../../../src/theme';
import SellerPage from '../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import ShopPreview from '../../../src/components/seller/decorate/ShopPreview';
import { BrandArt, HomeArt, SwatchArt } from '../../../src/components/seller/decorate/DecorateArt';
import {
  SHOP_TEMPLATES, previewProps, templateInUse, useShopFacts,
} from '../../../src/components/seller/decorate/shopTemplates';

/*
 * /seller/decorate (web/src/pages/SellerDecorate.jsx, SellerApp.css .sdc-*):
 * Decorate my shop. Four blocks, each a picture, what it does and Start:
 * the shop's Home tab, a ready-made look (a template is a pair of shop
 * colours), the logo and banner, and the shop's own colours. The previews
 * use the shop's real name, logo, banner and live products.
 */
export default function SellerDecorateScreen() {
  const router = useRouter();
  const { store } = useSellerShell();
  const facts = useShopFacts(store?.id);
  const inUse = templateInUse(store);
  const shown = inUse || SHOP_TEMPLATES[0];
  const sections = store?.homeLayout?.sections?.length || 0;

  const blocks = [
    {
      key: 'home',
      title: 'Shop home',
      heading: 'Build your shop\'s Home tab',
      text: 'Banners, spotlight products, photos of your place and a message, each in a style you pick. Buyers see it first.',
      to: '/seller/decorate/home',
      note: sections ? `${sections} section${sections === 1 ? '' : 's'} on your Home` : 'No Home tab yet',
      art: <HomeArt />,
    },
    {
      key: 'look',
      title: 'Shop look',
      heading: 'Give your shop a look buyers remember',
      text: 'Pick a ready-made colour template for your shop page. Your Home tab and buttons follow it.',
      to: '/seller/decorate/templates',
      note: inUse ? `In use: ${inUse.name}` : 'Using your own colours',
      art: (
        <View style={styles.phone}>
          <ShopPreview compact template={shown} store={store} {...previewProps(facts)} />
        </View>
      ),
    },
    {
      key: 'branding',
      title: 'Logo & banner',
      heading: 'Add your logo and a cover photo',
      text: 'A clear logo and a bright banner make your shop easy to recognise.',
      to: '/seller/store/branding',
      note: store?.logo ? 'Logo added' : 'No logo yet',
      art: <BrandArt store={store} />,
    },
    {
      key: 'colors',
      title: 'Your own colours',
      heading: 'Choose exact colours',
      text: 'Already have brand colours? Set them yourself.',
      to: '/seller/store/colors',
      note: null,
      art: <SwatchArt store={store} />,
    },
  ];

  return (
    <SellerPage contentStyle={styles.body}>
      {blocks.map((b, i) => (
        <View key={b.key} style={[styles.block, i === blocks.length - 1 && styles.blockLast]}>
          <Text style={styles.head} accessibilityRole="header">{b.title}</Text>
          <View style={styles.row}>
            <View style={styles.art}>{b.art}</View>
            <View style={styles.copy}>
              <Text style={styles.heading}>{b.heading}</Text>
              <Text style={styles.text}>{b.text}</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(b.to)}
                style={({ pressed }) => [styles.start, pressed && styles.startPressed]}
              >
                <Text style={styles.startText}>Start</Text>
              </Pressable>
              {b.note ? <Text style={styles.note}>{b.note}</Text> : null}
            </View>
          </View>
        </View>
      ))}
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  body: { gap: 12 },
  // .sdc-block on phones: edge to edge, an 8px grey band under each but the last.
  block: { marginHorizontal: -12, borderBottomWidth: 8, borderBottomColor: t.neutral[100], backgroundColor: t.neutral[0] },
  blockLast: { borderBottomWidth: 0 },
  head: { paddingTop: 14, paddingHorizontal: 16, fontSize: 15.5, lineHeight: 17.8, color: t.neutral[900], ...font(500) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16 },
  // Phones up to 480px wide: 0.85fr / 1.15fr (.sdc-row).
  art: { flexGrow: 0.85, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  copy: { flexGrow: 1.15, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'flex-start' },
  // The shop page in miniature, in a light phone-shaped frame.
  phone: { height: 200, overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 16, backgroundColor: t.neutral[100] },
  heading: { marginBottom: 4, fontSize: 16, lineHeight: 21.6, color: t.neutral[900], ...font(500) },
  text: { marginBottom: 12, fontSize: 13.5, lineHeight: 19.575, color: t.neutral[500], ...font(400) },
  start: {
    minWidth: 96, height: 40, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: t.primary[600],
  },
  startPressed: { backgroundColor: t.primary[700] },
  startText: { fontSize: 14, lineHeight: 20, color: t.onBrand, ...font(500) },
  note: { marginTop: 8, fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
}));
