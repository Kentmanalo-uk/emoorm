import { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretRightIcon, CheckIcon } from '../../../../src/lib/icons';
import apiClient from '../../../../src/api/client';
import { toast } from '../../../../src/lib/toast';
import { font, t, themed, veil } from '../../../../src/theme';
import Glass from '../../../../src/components/Glass';
import SellerPage, { SellerPrivateLine, sellerPageStyles } from '../../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../../src/components/seller/SellerShell';
import ShopPreview from '../../../../src/components/seller/decorate/ShopPreview';
import {
  findTemplate, previewProps, templateInUse, useShopFacts,
} from '../../../../src/components/seller/decorate/shopTemplates';

/*
 * /seller/decorate/templates/:key (web/src/pages/SellerDecorate.jsx
 * SellerTemplatePreview, SellerApp.css .stp-preview-*): the shop page in the
 * template's colours at full size, a link to the live shop page, and
 * "Apply <name>" pinned to the bottom. Applying saves the shop's two colours
 * (PUT /stores/:id) and goes back to Decorate my shop.
 */
export default function SellerTemplatePreviewScreen() {
  const { key: rawKey } = useLocalSearchParams();
  const key = String(rawKey || '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store, setStore } = useSellerShell();
  const facts = useShopFacts(store?.id);
  const template = findTemplate(key);
  const [applying, setApplying] = useState(false);
  const inUse = templateInUse(store)?.key === key;

  if (!template) {
    return (
      <SellerPage>
        <Text style={styles.missing}>
          That template doesn&apos;t exist.{' '}
          <Text accessibilityRole="link" style={styles.missingLink} onPress={() => router.replace('/seller/decorate/templates')}>
            See all templates
          </Text>
        </Text>
      </SellerPage>
    );
  }

  const apply = async () => {
    if (!store?.id || applying) return;
    setApplying(true);
    try {
      const res = await apiClient.put(`/stores/${store.id}`, {
        primaryColor: template.primary,
        secondaryColor: template.secondary,
      });
      setStore((prev) => (prev ? {
        ...prev, ...(res.data || {}), primaryColor: template.primary, secondaryColor: template.secondary,
      } : prev));
      toast.success(`${template.name} applied to your shop`);
      // Back to Decorate my shop (the website replaces this page with it).
      router.dismissTo('/seller/decorate');
    } catch (err) {
      toast.error(err.message || 'Could not apply the template');
    } finally {
      setApplying(false);
    }
  };

  return (
    <SellerPage scroll={false} privateLine={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.flex} contentContainerStyle={[sellerPageStyles.content, styles.body, { paddingBottom: 96 + insets.bottom }]}>
        <SellerPrivateLine />
        <Text style={styles.note}>{template.tagline}. This is how your shop page will look to buyers.</Text>
        <View style={styles.frame}>
          <ShopPreview template={template} store={store} {...previewProps(facts)} />
        </View>
        {store?.slug ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/store/${store.slug}`)} style={styles.live}>
            <Text style={styles.liveText}>See your live shop page</Text>
            <CaretRightIcon size={13} weight="bold" color={t.primary[700]} />
          </Pressable>
        ) : null}
      </ScrollView>

      <Glass fallbackStyle={barFallback()} style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: applying || inUse, busy: applying }}
          disabled={applying || inUse}
          onPress={apply}
          style={({ pressed }) => [styles.btn, inUse && styles.btnDone, applying && styles.btnOff, pressed && styles.btnPressed]}
        >
          {inUse ? <CheckIcon size={17} weight="bold" color={t.primary[700]} /> : null}
          {applying ? <ActivityIndicator size={14} color="#fff" /> : null}
          <Text style={[styles.btnText, inUse && styles.btnTextDone]}>
            {inUse ? 'In use' : applying ? 'Applying…' : `Apply ${template.name}`}
          </Text>
        </Pressable>
      </Glass>
    </SellerPage>
  );
}

// .stp-apply-bar on Android and older iPhones: white at 98% with a hairline above.
/* A function, not a table: this is handed to a component whole, and
   React Native freezes the style it is given. A fresh object each time
   keeps the colours of the palette in use. */
const barFallback = () => ({
  backgroundColor: veil(0.98),
  borderTopWidth: 1,
  borderTopColor: t.neutral[200],
});

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: 12 },
  missing: { marginTop: 10, marginBottom: 2, fontSize: 13.5, lineHeight: 19.575, color: t.neutral[500], ...font(400) },
  missingLink: { color: t.primary[700], ...font(500) },
  note: { fontSize: 14, lineHeight: 20.3, color: t.neutral[500], ...font(400) },
  frame: {
    width: '100%',
    maxWidth: 375,
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 20,
    backgroundColor: t.neutral[100],
  },
  live: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, paddingVertical: 4 },
  liveText: { fontSize: 14, lineHeight: 22.4, color: t.primary[700], ...font(500) },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', paddingTop: 10, paddingHorizontal: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    maxWidth: 560,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: t.primary[600],
  },
  btnPressed: { backgroundColor: t.primary[700] },
  btnOff: { opacity: 0.6 },
  btnDone: { backgroundColor: t.primary[50] },
  btnText: { fontSize: 16, lineHeight: 20, color: t.onBrand, ...font(500) },
  btnTextDone: { color: t.primary[700] },
}));
