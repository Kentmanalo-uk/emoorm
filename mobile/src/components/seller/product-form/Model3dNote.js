import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCartSettings } from '../../cart/cartSettings';
import { font } from '../../../theme';
import { CubeMark } from '../../product/Product3dSheet';
import { PF } from './parts';

// The website, where 3D views are made (web product-form/Model3d*.jsx).
const SITE = 'https://emoorm.shop';

/*
 * A product's 3D view, in the app's form: whether it has one, and a link to
 * its edit page on the website (opened at its 3D view), where 3D views are
 * made. Only for goods kept in stock being edited, while the super admin
 * has 3D views on.
 */
export default function Model3dNote({ product, kind }) {
  const settings = useCartSettings();
  if (!product?.id || kind !== 'REGULAR' || settings?.product3dEnabled === false) return null;
  const has = !!product.model3d?.glbUrl;
  const open = () => {
    Linking.openURL(`${SITE}/seller/products?edit=${encodeURIComponent(product.id)}&section=model3d`).catch(() => {});
  };

  return (
    <View style={styles.box}>
      {has ? (
        <View style={styles.has}>
          <CubeMark size={16} color={PF.green} strokeWidth={2} />
          <Text style={styles.hasText}>Has a 3D view</Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="link" onPress={open} hitSlop={6} style={styles.link}>
        <Text style={styles.linkText}>{has ? 'Change it on emoorm.shop' : 'Make a 3D view on emoorm.shop'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 2, paddingVertical: 2, paddingHorizontal: 4 },
  has: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hasText: { fontSize: 13.5, lineHeight: 21.6, color: PF.ink, ...font(500) },
  link: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  linkText: { fontSize: 13.5, lineHeight: 21.6, color: PF.greenDark, ...font(600) },
});
