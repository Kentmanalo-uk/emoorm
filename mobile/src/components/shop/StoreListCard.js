import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon, MapPinIcon, PackageIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';
import { ShopGradient } from './shopTheme';
import ShopTileImage from './ShopTileImage';

const initialsOf = (name) => (name
  ? name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  : '?');

// The API returns the logo as `logo`; older rows may carry `logoUrl`.
const logoOf = (store) => {
  const raw = store.logoUrl || store.logo;
  return raw ? resolveImg(raw) || raw : null;
};

/** A shop's logo, or its initials on the site's green when it has none. */
export function StoreListLogo({ store, style, textStyle }) {
  const [failed, setFailed] = useState(false);
  const src = logoOf(store);
  return (
    <View style={[styles.logo, style]}>
      {src && !failed ? (
        <Image source={{ uri: src }} style={styles.logoImg} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <>
          <ShopGradient angle={135} stops={[[t.primary[500], 0], [t.primary[700], 1]]} />
          <Text style={[styles.logoText, textStyle]}>{initialsOf(store.name)}</Text>
        </>
      )}
    </View>
  );
}

/**
 * A shop in the stores list on phones (web Stores.jsx PhoneStoreCard, with
 * phone-app.css's flat rows): logo, name, town and product count, a line
 * about the shop, and a peek at up to three of its newest products.
 * Edge to edge, a hairline under it.
 */
export default function StoreListCard({ store }) {
  const router = useRouter();
  const count = store._count?.products ?? 0;
  const previews = (store.products || []).slice(0, 3);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/store/${store.slug}`)}
      accessibilityRole="link"
      accessibilityLabel={store.name}
    >
      <View style={styles.head}>
        <StoreListLogo store={store} />
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1} accessibilityRole="header">{store.name}</Text>
          <View style={styles.meta}>
            {store.municipality?.name ? (
              <View style={styles.metaItem}>
                <MapPinIcon size={12} weight="fill" color={t.primary[600]} />
                <Text style={styles.metaText}>{store.municipality.name}</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <PackageIcon size={12} weight="fill" color={t.primary[600]} />
              <Text style={styles.metaText}>{count} {count === 1 ? 'product' : 'products'}</Text>
            </View>
          </View>
        </View>
        <CaretRightIcon size={16} color={t.neutral[500]} />
      </View>
      {store.description ? <Text style={styles.desc} numberOfLines={2}>{store.description}</Text> : null}
      {previews.length > 0 ? (
        <View style={styles.previews}>
          {previews.map((p) => (
            <View key={p.id} style={styles.preview}>
              <ShopTileImage src={Array.isArray(p.images) ? p.images[0] : p.images} />
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: -12, padding: 14, backgroundColor: t.neutral[0],
    borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  pressed: { transform: [{ scale: 0.99 }] },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: {
    width: 52, height: 52, flexShrink: 0, overflow: 'hidden', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  logoImg: { width: '100%', height: '100%', backgroundColor: t.neutral[0] },
  logoText: { fontSize: 17, lineHeight: 20.4, ...font(500), color: t.neutral[0] },
  text: { flex: 1, minWidth: 0 },
  name: { marginBottom: 4, fontSize: 15.5, lineHeight: 17.825, ...font(500), color: t.neutral[900] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, columnGap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  desc: { marginTop: 10, fontSize: 13.5, lineHeight: 19.575, ...font(400), color: t.neutral[600] },
  previews: { flexDirection: 'row', gap: 6, marginTop: 12 },
  preview: { flex: 1, aspectRatio: 1, overflow: 'hidden', borderRadius: 10, backgroundColor: t.neutral[100] },
});
