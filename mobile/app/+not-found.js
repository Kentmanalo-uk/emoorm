import {
  Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { ArrowLeftIcon, HouseIcon, MagnifyingGlassIcon } from 'phosphor-react-native';
import PublicHeader from '../src/components/public/PublicHeader';
import { font, t, text } from '../src/theme';

/*
 * web/src/pages/NotFound.jsx + NotFound.css at phone width: a white card on
 * the grey page, its heading moved up into the back bar.
 */

function NfButton({ label, Icon, primary, onPress }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        pressed && (primary ? styles.btnPrimaryPressed : styles.btnPressed),
      ]}
    >
      <Icon size={18} weight={primary ? 'fill' : 'regular'} color={primary ? t.neutral[0] : t.primary[600]} />
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export default function NotFound() {
  const router = useRouter();
  const pathname = usePathname();
  const { height } = useWindowDimensions();
  // As the website: Go back shows when there is somewhere to go back to. In
  // the web build a deep link opened from another page has browser history
  // the router does not know about.
  const browserHistory = Platform.OS === 'web' && (globalThis.history?.length || 0) > 1;
  const canGoBack = router.canGoBack() || browserHistory;
  const goBack = () => (router.canGoBack() ? router.back() : globalThis.history?.back());

  return (
    <View style={styles.screen}>
      <PublicHeader title="Page not found" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        {/* The website's grey section is at least the viewport less 160px. */}
        <View style={[styles.section, { minHeight: Math.max(0, height - 160) }]}>
          <View style={styles.card}>
            <Image source={require('../assets/brand-icon.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.code}>404</Text>
            <Text style={styles.text}>
              We couldn&apos;t find <Text style={styles.path}>{` ${pathname} `}</Text>. The link may be broken, or the page may have been moved or removed.
            </Text>
            <View style={styles.actions}>
              <NfButton primary Icon={HouseIcon} label="Go to homepage" onPress={() => router.push('/')} />
              <NfButton Icon={MagnifyingGlassIcon} label="Browse products" onPress={() => router.push('/products')} />
            </View>
            {canGoBack ? (
              <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
                <ArrowLeftIcon size={16} color={text.muted} />
                <Text style={styles.backText}>Go back</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scrollContent: { flexGrow: 1 },
  section: {
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: t.neutral[100],
  },
  card: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: t.neutral[0],
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  logo: { width: 64, height: 64, opacity: 0.9 },
  code: {
    marginTop: 16,
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: 1.12,
    color: t.primary[600],
    ...font(500),
  },
  text: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22.4,
    color: t.neutral[600],
    textAlign: 'center',
    ...font(400),
  },
  path: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontWeight: '400',
    fontSize: 13,
    color: t.neutral[900],
    backgroundColor: t.neutral[100],
  },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 24 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: t.primary[600],
    borderRadius: 10,
    backgroundColor: t.neutral[0],
  },
  btnPressed: { backgroundColor: t.primary[50] },
  btnPrimary: { backgroundColor: t.primary[600] },
  btnPrimaryPressed: { backgroundColor: t.primary[700] },
  btnText: { fontSize: 14, lineHeight: 22.4, color: t.primary[600], ...font(500) },
  btnTextPrimary: { color: t.neutral[0] },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: 16,
    paddingHorizontal: 12,
  },
  backText: { fontSize: 13, lineHeight: 15.6, color: text.muted, ...font(400) },
});
