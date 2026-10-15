import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';
import { ShopGradient } from './shopTheme';

/*
 * A shop's logo as the stores list shows it (StoreListCard), also used by a
 * shop's long-press preview (peek/StorePeek).
 */

const initialsOf = (name) => (name
  ? name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  : '?');

// The API returns the logo as `logo`; older rows may carry `logoUrl`.
const logoOf = (store) => {
  const raw = store.logoUrl || store.logo;
  return raw ? resolveImg(raw) || raw : null;
};

/** A shop's logo, or its initials on the site's green when it has none. */
export default function StoreListLogo({ store, style, textStyle }) {
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

const styles = StyleSheet.create({
  logo: {
    width: 52, height: 52, flexShrink: 0, overflow: 'hidden', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  logoImg: { width: '100%', height: '100%', backgroundColor: t.neutral[0] },
  logoText: { fontSize: 17, lineHeight: 20.4, ...font(500), color: t.neutral[0] },
});
