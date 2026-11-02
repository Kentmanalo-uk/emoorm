import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { resolveImg } from '../../lib/media';
import { t, themed } from '../../theme';
import { ShopLogoArt } from './ShopArt';

/*
 * A shop's logo as the stores list shows it (StoreListCard), also used by a
 * shop's long-press preview (peek/StorePeek).
 */

// The API returns the logo as `logo`; older rows may carry `logoUrl`.
const logoOf = (store) => {
  const raw = store.logoUrl || store.logo;
  return raw ? resolveImg(raw) || raw : null;
};

/** A shop's logo, or its generated one (ShopArt) when it has none. */
export default function StoreListLogo({ store, style }) {
  const [failed, setFailed] = useState(false);
  const src = logoOf(store);
  return (
    <View style={[styles.logo, style]}>
      {src && !failed ? (
        <Image source={{ uri: src }} style={styles.logoImg} resizeMode="cover" onError={() => setFailed(true)} />
      ) : <ShopLogoArt name={store.name} />}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  logo: {
    width: 52, height: 52, flexShrink: 0, overflow: 'hidden', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  logoImg: { width: '100%', height: '100%', backgroundColor: t.neutral[0] },
}));
