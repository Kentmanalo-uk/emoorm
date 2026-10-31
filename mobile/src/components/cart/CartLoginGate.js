import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartIcon, StorefrontIcon } from '../../lib/icons';
import { border, font, t, themed } from '../../theme';
import EmptyState from '../EmptyState';
import ShellPageMenu from '../ShellPageMenu';
import HeaderGlow from '../HeaderGlow';
import { floatingTabBar } from '../Glass';

/*
 * What a signed-out visitor sees on the Cart tab (web/src/components/
 * LoginGate.jsx, page "cart": ProtectedRoute shows it on phones instead of
 * the cart): the tab's title bar with its ⋯ menu ("Continue shopping" works
 * without an account, "My wishlist" leads to Log in), then the cart picture,
 * a line of text and a Log in button, centred above the tab bar.
 */
export default function CartLoginGate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `redirect` brings them back to the cart once they are signed in.
  const toLogin = () => router.push({ pathname: '/login', params: { redirect: '/cart' } });
  const menu = [
    { key: 'shop', Icon: StorefrontIcon, label: 'Continue shopping', to: '/products' },
    { key: 'wish', Icon: HeartIcon, label: 'My wishlist', onPress: toLogin },
  ];

  return (
    // iOS 26 (native glass tabs): the system insets the scroll view for the
    // status bar and the floating tab bar itself.
    <View style={styles.screen}>
      <HeaderGlow height={insets.top + 12 + 48} />
      <View style={{ height: insets.top + 12 }} />
      <View style={styles.head}>
        <Text style={styles.heading} numberOfLines={1} accessibilityRole="header">Cart</Text>
        <ShellPageMenu label="Cart options" items={menu} />
      </View>
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <EmptyState page art="cart" title="Your cart is empty" text="Log in to add products and check out." actions={[{ label: 'Log in', onPress: toLogin, wave: true }]} />
    </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1 },
  // .login-gate-head: 48px, 16px in on the left, the ⋯ 8px from the edge;
  // it sits on the header wash (HeaderGlow), like the signed-in cart.
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingLeft: 16,
    paddingRight: 8,
    zIndex: 120,
  },
  heading: { flexShrink: 1, fontSize: 22, lineHeight: 25.3, color: t.neutral[900], ...font(500) },
}));
