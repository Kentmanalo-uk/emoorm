import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckIcon } from '../../../../src/lib/icons';
import { font, t, themed } from '../../../../src/theme';
import SellerPage from '../../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../../src/components/seller/SellerShell';
import ShopPreview from '../../../../src/components/seller/decorate/ShopPreview';
import {
  SHOP_TEMPLATES, previewProps, recommendTemplate, templateInUse, useShopFacts,
} from '../../../../src/components/seller/decorate/shopTemplates';

/*
 * /seller/decorate/templates (web/src/pages/SellerDecorate.jsx SellerTemplates,
 * SellerApp.css .stp-*): every template as a miniature of the shop page in
 * its colours, with its name, swatches and tagline. The one in use is
 * ringed in green; the one that suits the shop's products is marked
 * Recommended. Each opens its full preview.
 */
const GAP = 12;
const MIN_CARD = 150;

export default function SellerTemplatesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { store } = useSellerShell();
  const facts = useShopFacts(store?.id);
  const inUse = templateInUse(store);
  const recommended = recommendTemplate(facts.products.map((p) => p.category?.name));

  // grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) inside the 12px gutters.
  const inner = width - 24;
  const cols = Math.max(1, Math.floor((inner + GAP) / (MIN_CARD + GAP)));
  const cardW = (inner - GAP * (cols - 1)) / cols;

  return (
    <SellerPage>
      <View style={styles.grid}>
        {SHOP_TEMPLATES.map((tpl) => {
          const isOn = inUse?.key === tpl.key;
          const isPick = !isOn && facts.loaded && recommended.key === tpl.key;
          return (
            <Pressable
              key={tpl.key}
              accessibilityRole="link"
              accessibilityLabel={`${tpl.name}${isOn ? ', in use' : isPick ? ', recommended' : ''}`}
              onPress={() => router.push(`/seller/decorate/templates/${tpl.key}`)}
              style={[styles.card, { width: cardW }]}
            >
              <View style={styles.frame}>
                <ShopPreview compact template={tpl} store={store} {...previewProps(facts)} />
                {isOn || isPick ? (
                  <View style={[styles.tag, isOn && styles.tagOn]}>
                    {isOn ? <CheckIcon size={11} weight="bold" color={t.primary[700]} /> : null}
                    <Text style={[styles.tagText, isOn && styles.tagTextOn]}>{isOn ? 'In use' : 'Recommended'}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{tpl.name}</Text>
                <View style={styles.swatches}>
                  <View style={[styles.swatch, { backgroundColor: tpl.primary }]} />
                  <View style={[styles.swatch, styles.swatchNext, { backgroundColor: tpl.secondary }]} />
                </View>
              </View>
              <Text style={styles.tagline}>{tpl.tagline}</Text>
              {isOn ? <View pointerEvents="none" style={styles.ring} /> : null}
            </Pressable>
          );
        })}
      </View>
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: {
    gap: 3, minWidth: 0, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, borderRadius: 16, backgroundColor: t.neutral[0],
  },
  // outline: 2px green, drawn inside the card.
  ring: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: t.primary[600], borderRadius: 16 },
  frame: { position: 'relative', height: 230, marginBottom: 6, overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[100] },
  tag: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: t.accent[600],
  },
  tagOn: { backgroundColor: t.neutral[0] },
  tagText: { fontSize: 11.5, lineHeight: 16, color: t.onBrand, ...font(500) },
  tagTextOn: { color: t.primary[700] },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  name: { flexShrink: 1, fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900], ...font(500) },
  swatches: { flexDirection: 'row', flexShrink: 0 },
  // 14px circles with a 2px white border and a 1px outline.
  swatch: { width: 14, height: 14, borderWidth: 2, bordercolor: t.onBrand, borderRadius: 7, outlineWidth: 1, outlineColor: t.neutral[200], outlineStyle: 'solid' },
  swatchNext: { marginLeft: -5 },
  tagline: { paddingHorizontal: 4, fontSize: 12.5, lineHeight: 16.875, color: t.neutral[500], ...font(400) },
}));
