import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartIcon, StorefrontIcon } from 'phosphor-react-native';
import { border, font, t } from '../../theme';
import EmptyArt from '../EmptyArt';
import ShellPageMenu from '../ShellPageMenu';

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} stickyHeaderIndices={[1]}>
      <View style={{ height: insets.top + 12, backgroundColor: t.neutral[0] }} />
      <View style={styles.head}>
        <Text style={styles.heading} numberOfLines={1} accessibilityRole="header">Cart</Text>
        <ShellPageMenu label="Cart options" items={menu} />
      </View>
      <View style={styles.gate}>
        <EmptyArt name="cart" size={112} style={styles.art} />
        <Text style={styles.title}>Your cart is empty</Text>
        <Text style={styles.body}>Log in to add products and check out.</Text>
        <Pressable accessibilityRole="link" onPress={toLogin} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
          <Text style={styles.btnText}>Log in</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1 },
  // .login-gate-head: 48px, 16px in on the left, the ⋯ 8px from the edge;
  // a solid bar with a hairline that holds at the top (phone-app.css).
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingLeft: 16,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: border.default,
    backgroundColor: t.neutral[0],
    zIndex: 120,
  },
  heading: { flexShrink: 1, fontSize: 22, lineHeight: 25.3, color: t.neutral[900], ...font(500) },
  // .login-gate: centred in what is left; the head's 10px margin is added
  // to the gate's own 24px top padding. The website's page is 100dvh - 68px
  // tall, 6px more than the space above the 74px tab bar, which centres it
  // 3px lower: 6px more on top does the same here.
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingHorizontal: 24, paddingBottom: 64 },
  art: { marginBottom: 18 },
  title: { marginBottom: 6, fontSize: 18, lineHeight: 21.6, color: t.neutral[900], textAlign: 'center', ...font(500) },
  body: { maxWidth: 290, marginBottom: 20, fontSize: 14, lineHeight: 21, color: t.neutral[500], textAlign: 'center', ...font(400) },
  btn: {
    minWidth: 140,
    height: 42,
    paddingHorizontal: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  btnPressed: { backgroundColor: t.primary[700] },
  btnText: { fontSize: 15, lineHeight: 18, color: '#fff', ...font(500) },
});
