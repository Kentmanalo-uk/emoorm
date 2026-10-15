import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeaderGlow from './HeaderGlow';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MagnifyingGlassIcon } from 'phosphor-react-native';
import { font, t, text } from '../theme';
import { fetchCategories } from '../lib/referenceData';
import { loadRecent, PLACEHOLDER_SUGGESTIONS, POPULAR_SUGGESTIONS, saveRecent } from '../lib/shellSearch';

// The website's own outline camera (Header.jsx), not a Phosphor icon.
function CameraGlyph({ size = 26, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x="2" y="5" width="16" height="11" rx="2" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <Circle cx="10" cy="10" r="2.5" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <Path d="M7 5L8 3H12L13 5" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </Svg>
  );
}

// Swaps the suggestion every 3s with a 220ms fade, as the website does.
function useRotatingPlaceholder() {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let timer = null;
    const tick = () => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % PLACEHOLDER_SUGGESTIONS.length);
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    };
    const start = () => { if (!timer) timer = setInterval(tick, 3000); };
    const stop = () => { clearInterval(timer); timer = null; };
    start();
    // Paused in the background, like the website's pollWhileVisible.
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [opacity]);
  return [PLACEHOLDER_SUGGESTIONS[index], opacity];
}

/**
 * Home's top bar on phones (web .header.is-home): logo, then a square grey
 * search bar with the camera and the green search button flush at its end.
 * Phones search on their own page, so the bar is a button, not a field:
 * no keyboard opens here. No line under it, scrolled or not.
 */
export default function HomeHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [placeholder, opacity] = useRotatingPlaceholder();
  const openSearch = () => router.push('/search');

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <HeaderGlow />
      <View style={styles.row}>
        <Pressable accessibilityRole="link" accessibilityLabel="Emoorm home" onPress={() => router.replace('/')}>
          <Image source={require('../../assets/brand-icon.png')} style={styles.logo} />
        </Pressable>
        <View style={styles.search}>
          <Pressable accessibilityRole="search" accessibilityLabel="Search products" style={styles.field} onPress={openSearch}>
            <Animated.Text style={[styles.placeholder, { opacity }]} numberOfLines={1}>{placeholder}</Animated.Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search by image"
            style={({ pressed }) => [styles.camera, pressed && styles.cameraPressed]}
            onPress={() => router.push('/search-by-image')}
          >
            <CameraGlyph color={text.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Search" style={styles.searchButton} onPress={openSearch}>
            <MagnifyingGlassIcon size={18} color={t.neutral[0]} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * The row of quick search words under Home's header (web .home-quick-search):
 * recent searches first, then popular ones and the category names. It sits
 * at the top of the page's scroll content so it scrolls away with the page.
 */
export function HomeQuickSearch() {
  const router = useRouter();
  const [recent, setRecent] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let alive = true;
    loadRecent().then((list) => { if (alive) setRecent(list); });
    fetchCategories().then((list) => { if (alive) setCategories(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const terms = [...new Set([
    ...recent,
    ...POPULAR_SUGGESTIONS,
    ...categories.map((c) => c.name).filter(Boolean),
  ])].slice(0, 16);
  if (!terms.length) return null;

  // The website opens /search?q=…, its results page; here that is /products,
  // which reads the same `q`.
  const searchFor = (term) => {
    saveRecent(term);
    router.push({ pathname: '/products', params: { q: term } });
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chips}
      contentContainerStyle={styles.chipsRow}
      accessibilityLabel="Search suggestions"
    >
      {terms.map((term) => (
        <Pressable key={term} style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]} onPress={() => searchFor(term)}>
          <Text style={styles.chipText} numberOfLines={1}>{term}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: t.neutral[0],
    zIndex: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 57, paddingHorizontal: 10 },
  logo: { width: 28, height: 28 },
  // White inside a green outline; the green search button sits inside the outline.
  search: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', height: 44, overflow: 'hidden',
    borderWidth: 1, borderColor: t.primary[600], backgroundColor: t.neutral[0],
  },
  field: { flex: 1, minWidth: 0, justifyContent: 'center', paddingLeft: 16 },
  placeholder: { fontSize: 15, lineHeight: 24, color: t.neutral[400], ...font(400) },
  camera: { width: 40, alignItems: 'center', justifyContent: 'center' },
  cameraPressed: { backgroundColor: t.neutral[100] },
  searchButton: { width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },

  chips: { flexGrow: 0 },
  chipsRow: { gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  // Each suggestion on its own plain white box.
  chip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: t.neutral[0] },
  chipPressed: { backgroundColor: t.neutral[100] },
  chipText: { fontSize: 12, lineHeight: 14.4, color: t.neutral[600], ...font(400) },
});
