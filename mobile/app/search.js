import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CaretLeftIcon, ClockCounterClockwiseIcon, EyeIcon, EyeSlashIcon, MagnifyingGlassIcon, SquaresFourIcon, TrashIcon, XIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ProductImage from '../src/components/ProductImage';
import SearchCameraGlyph from '../src/components/search/SearchCameraGlyph';
import SearchCategoryIcon from '../src/components/search/SearchCategoryIcon';
import ImageSearchSheet from '../src/components/search/ImageSearchSheet';
import { setPendingImage } from '../src/components/search/imageSearchStore';
import { clearRecent, loadRecent, removeRecentTerm, saveRecent } from '../src/lib/shellSearch';
import { fetchCategories } from '../src/lib/referenceData';
import { resolveImg } from '../src/lib/media';
import { font, t } from '../src/theme';

const HIDE_POPULAR_KEY = 'emoorm.search.hide-popular';
// The website's /search shows the results once anything is asked (App.jsx SearchRoute).
const RESULT_PARAMS = ['q', 'category', 'municipalityId', 'minPrice', 'maxPrice', 'imageSearch'];

// The category look the admin chose (App settings → categoryStyle), once per run.
let categoryStyle = null;
const loadCategoryStyle = () => {
  categoryStyle = categoryStyle || apiClient.get('/app-settings').then((res) => res?.data?.categoryStyle || 'IMAGE').catch(() => 'IMAGE');
  return categoryStyle;
};

/**
 * Phones: the search page the header's search bar opens (and the results
 * page's bar, to change the words) — web/src/pages/SearchStart.jsx. A search
 * field with the camera and a Search button; your search history; popular
 * products (most ordered); and categories with how many products each has.
 * While typing: matching past searches, categories and products.
 *
 * `?edit=` brings the words already searched (the website's router state).
 */
export default function SearchScreen() {
  const params = useLocalSearchParams();
  const asked = RESULT_PARAMS.some((key) => params[key]);
  if (asked) {
    const next = Object.fromEntries(RESULT_PARAMS.filter((key) => params[key]).map((key) => [key, params[key]]));
    return <Redirect href={{ pathname: '/products', params: next }} />;
  }
  return <SearchStart initial={typeof params.edit === 'string' ? params.edit : ''} />;
}

function SearchStart({ initial }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Two equal columns 8 apart inside the 16px sides (.ss-cats).
  const cell = (width - 32 - 8) / 2;
  const inputRef = useRef(null);
  const [q, setQ] = useState(initial);
  const [focused, setFocused] = useState(true);
  const [recent, setRecent] = useState([]);
  const [popular, setPopular] = useState(null);
  const [popularHidden, setPopularHidden] = useState(false);
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState({});
  const [iconStyle, setIconStyle] = useState(false);
  // Products matching the words typed, with the words they were asked for.
  const [found, setFound] = useState({ term: '', list: [] });
  const [imageOpen, setImageOpen] = useState(false);
  const typed = q.trim();

  useEffect(() => {
    let live = true;
    loadRecent().then((list) => { if (live) setRecent(list); });
    AsyncStorage.getItem(HIDE_POPULAR_KEY).then((v) => { if (live) setPopularHidden(v === '1'); }).catch(() => {});
    fetchCategories().then((list) => { if (live) setCategories(list || []); }).catch(() => {});
    loadCategoryStyle().then((style) => { if (live) setIconStyle(style === 'ICON'); });
    return () => { live = false; };
  }, []);

  // Popular: the products ordered most, as search words with their picture.
  useEffect(() => {
    let live = true;
    apiClient.get('/products', { params: { sortBy: 'orderCount', sortOrder: 'desc', pageSize: 10 } })
      .then((res) => { if (live) setPopular(res.data || []); })
      .catch(() => { if (live) setPopular([]); });
    return () => { live = false; };
  }, []);

  // How many products each category has (real numbers, not made-up discounts).
  useEffect(() => {
    if (!categories.length) return undefined;
    let live = true;
    Promise.all(categories.map((c) => apiClient.get('/products', { params: { categoryId: c.id, pageSize: 1 } })
      .then((res) => [c.id, res.pagination?.total ?? 0])
      .catch(() => [c.id, null])))
      .then((list) => { if (live) setCounts(Object.fromEntries(list)); });
    return () => { live = false; };
  }, [categories]);

  // While typing: products whose names match, asked for a moment after the last key.
  useEffect(() => {
    if (typed.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      apiClient.get('/products', { params: { search: typed, pageSize: 6 } })
        .then((res) => { if (live) setFound({ term: typed, list: res.data || [] }); })
        .catch(() => { if (live) setFound({ term: typed, list: [] }); });
    }, 220);
    return () => { live = false; clearTimeout(timer); };
  }, [typed]);

  const shownCategories = useMemo(() => {
    // Fullest categories first once their counts are in; empty ones are left out.
    const list = categories.filter((c) => counts[c.id] !== 0);
    if (Object.keys(counts).length) list.sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return list;
  }, [categories, counts]);

  const search = (term) => {
    const word = term.trim();
    if (!word) { inputRef.current?.focus(); return; }
    saveRecent(word).then(setRecent);
    router.push({ pathname: '/products', params: { q: word } });
  };
  const openCategory = (id) => router.push({ pathname: '/products', params: { category: id } });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const togglePopular = () => {
    const next = !popularHidden;
    setPopularHidden(next);
    AsyncStorage.setItem(HIDE_POPULAR_KEY, next ? '1' : '0').catch(() => { /* the choice just isn't remembered */ });
  };

  const low = typed.toLowerCase();
  const recentMatches = typed ? recent.filter((term) => term.toLowerCase().includes(low)).slice(0, 4) : [];
  const categoryMatches = typed ? categories.filter((c) => c.name.toLowerCase().includes(low)).slice(0, 3) : [];
  // The last answer stays while the next is on its way, if it still fits the words.
  const matches = typed.length >= 2 && found.term && low.startsWith(found.term.toLowerCase()) ? found.list : [];

  return (
    <View style={styles.screen}>
      <Text style={styles.srOnly} accessibilityRole="header">Search Emoorm</Text>
      <View style={[styles.bar, { paddingTop: 10 + insets.top }]}>
        <Pressable style={styles.back} onPress={back} accessibilityRole="button" accessibilityLabel="Back">
          <CaretLeftIcon size={24} color={t.neutral[800]} />
        </Pressable>
        <View style={[styles.field, focused && styles.fieldFocus]} accessibilityRole="search">
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={q}
            onChangeText={setQ}
            autoFocus
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => search(q)}
            returnKeyType="search"
            enterKeyHint="search"
            placeholder="Search products"
            placeholderTextColor={t.neutral[400]}
            accessibilityLabel="Search products"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q ? (
            <Pressable style={styles.clear} onPress={() => { setQ(''); inputRef.current?.focus(); }} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8}>
              <XIcon size={14} weight="bold" color={t.neutral[0]} />
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.camera, pressed && styles.cameraPressed]}
            onPress={() => setImageOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Search by image"
          >
            <SearchCameraGlyph color={t.neutral[500]} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
            onPress={() => search(q)}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <MagnifyingGlassIcon size={18} color={t.neutral[0]} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {typed ? (
          <View>
            <SuggestRow Icon={MagnifyingGlassIcon} onPress={() => search(typed)}>
              <Text style={styles.sugText} numberOfLines={1}>Search for “<Text style={styles.sugBold}>{typed}</Text>”</Text>
            </SuggestRow>
            {recentMatches.map((term) => (
              <SuggestRow key={`r-${term}`} Icon={ClockCounterClockwiseIcon} onPress={() => search(term)}>
                <Text style={styles.sugText} numberOfLines={1}>{term}</Text>
              </SuggestRow>
            ))}
            {categoryMatches.map((c) => (
              <SuggestRow key={`c-${c.id}`} Icon={SquaresFourIcon} onPress={() => openCategory(c.id)}>
                <View style={styles.sugTextBox}>
                  <Text style={styles.sugText} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.sugSmall}>Category</Text>
                </View>
              </SuggestRow>
            ))}
            {matches.map((p) => (
              <SuggestRow key={p.id} thumb={p.images?.[0]} onPress={() => search(p.name)}>
                <Text style={styles.sugText} numberOfLines={1}>{p.name}</Text>
              </SuggestRow>
            ))}
          </View>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={styles.sec}>
                <View style={styles.head}>
                  <Text style={styles.h2} accessibilityRole="header">Search History</Text>
                  <Pressable style={styles.headBtn} onPress={() => clearRecent().then(setRecent)} accessibilityRole="button">
                    <Text style={styles.headBtnText}>Clear All</Text>
                    <TrashIcon size={18} color={t.neutral[500]} />
                  </Pressable>
                </View>
                <View style={styles.history}>
                  {recent.map((term) => (
                    <View key={term} style={styles.chip}>
                      <Pressable onPress={() => search(term)} accessibilityRole="button" style={styles.chipMain}>
                        <Text style={styles.chipText} numberOfLines={1}>{term}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.chipX}
                        onPress={() => removeRecentTerm(term).then(setRecent)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${term}`}
                      >
                        <XIcon size={11} weight="bold" color={t.neutral[500]} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {popular?.length > 0 ? (
              <View style={[styles.sec, recent.length > 0 && styles.secNext]}>
                <View style={styles.head}>
                  <Text style={styles.h2} accessibilityRole="header">Popular Search</Text>
                  <Pressable style={styles.headBtn} onPress={togglePopular} accessibilityRole="button">
                    <Text style={styles.headBtnText}>{popularHidden ? 'Show' : 'Hide'}</Text>
                    {popularHidden ? <EyeSlashIcon size={19} color={t.neutral[500]} /> : <EyeIcon size={19} color={t.neutral[500]} />}
                  </Pressable>
                </View>
                {popularHidden ? (
                  <Text style={styles.hiddenNote}>Popular searches are hidden.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.popular} contentContainerStyle={styles.popularRow}>
                    {popular.map((p) => (
                      <Pressable key={p.id} style={styles.pop} onPress={() => search(p.name)} accessibilityRole="button" accessibilityLabel={p.name}>
                        <View style={styles.popImg}><ProductImage src={p.images?.[0]} /></View>
                        <Text style={styles.popName} numberOfLines={2}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {shownCategories.length > 0 ? (
              <View style={[styles.sec, (recent.length > 0 || popular?.length > 0) && styles.secNext]}>
                <View style={styles.head}>
                  <Text style={styles.h2} accessibilityRole="header">Popular Categories</Text>
                </View>
                <View style={styles.cats}>
                  {shownCategories.map((c) => (
                    <Pressable
                      key={c.id}
                      style={({ pressed }) => [styles.cat, { width: cell }, pressed && styles.catPressed]}
                      onPress={() => openCategory(c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={c.name}
                    >
                      <View style={styles.catImg}>
                        {iconStyle
                          ? <SearchCategoryIcon category={c} size={40} />
                          : <Image source={{ uri: resolveImg(c.image) || resolveImg(`/categories/${c.slug}.png`) }} style={styles.catPhoto} />}
                      </View>
                      <View style={styles.catText}>
                        <Text style={styles.catName} numberOfLines={2}>{c.name}</Text>
                        {counts[c.id] != null ? (
                          <Text style={styles.catCount}>{counts[c.id]} {counts[c.id] === 1 ? 'product' : 'products'}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ImageSearchSheet
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        onFile={(asset) => {
          setImageOpen(false);
          setPendingImage(asset);
          router.push('/search-by-image');
        }}
      />
    </View>
  );
}

/** A suggestion while typing (.ss-sug-row): an icon or a product thumbnail, then the words. */
function SuggestRow({ Icon, thumb, onPress, children }) {
  return (
    <Pressable style={({ pressed }) => [styles.sugRow, pressed && styles.sugPressed]} onPress={onPress} accessibilityRole="button">
      {Icon ? <Icon size={18} color={t.neutral[500]} /> : (
        <View style={styles.sugThumb}><ProductImage src={thumb} /></View>
      )}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },

  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingRight: 12, paddingBottom: 10, paddingLeft: 4, backgroundColor: t.neutral[0], zIndex: 20,
  },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', height: 44, backgroundColor: t.neutral[100] },
  fieldFocus: {
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1.5, color: t.primary[500] }],
  },
  input: {
    // The website's input is 46 tall in the 44 field: its words sit a little low.
    flex: 1, minWidth: 0, height: '100%', paddingLeft: 16, paddingRight: 8, paddingTop: 3, paddingBottom: 0,
    fontSize: 16, ...font(400), color: t.neutral[900],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  clear: {
    alignSelf: 'center', width: 22, height: 22, marginRight: 4, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[300],
  },
  camera: { width: 40, alignItems: 'center', justifyContent: 'center' },
  cameraPressed: { backgroundColor: t.neutral[200] },
  go: { width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  goPressed: { backgroundColor: t.primary[700] },

  scroll: { flex: 1 },
  sec: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6 },
  secNext: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  h2: { fontSize: 18, lineHeight: 20.7, ...font(500), color: t.neutral[900] },
  headBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  headBtnText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },

  history: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', backgroundColor: t.neutral[100] },
  chipMain: { maxWidth: 220, paddingTop: 8, paddingRight: 4, paddingBottom: 8, paddingLeft: 12 },
  chipText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
  chipX: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' },

  popular: { marginHorizontal: -16 },
  popularRow: { gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  pop: { width: 92, alignItems: 'center', gap: 8 },
  popImg: { width: 92, height: 92, overflow: 'hidden', backgroundColor: t.neutral[100] },
  popName: { width: '100%', fontSize: 13, lineHeight: 16.9, ...font(400), color: t.neutral[600], textAlign: 'center' },
  hiddenNote: { marginBottom: 12, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },

  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  cat: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0,
    padding: 10, backgroundColor: t.neutral[50],
  },
  catPressed: { backgroundColor: t.neutral[100] },
  catImg: { width: 56, height: 56, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0] },
  catPhoto: { width: '100%', height: '100%' },
  catText: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 6 },
  catName: { fontSize: 14, lineHeight: 18.2, ...font(400), color: t.neutral[900] },
  catCount: {
    paddingVertical: 2, paddingHorizontal: 6, backgroundColor: t.primary[50],
    fontSize: 12, lineHeight: 19.2, ...font(500), color: t.primary[700],
  },

  sugRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  sugPressed: { backgroundColor: t.neutral[50] },
  sugThumb: { width: 36, height: 36, overflow: 'hidden', backgroundColor: t.neutral[100] },
  sugTextBox: { flex: 1, minWidth: 0 },
  sugText: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[800] },
  sugBold: { ...font(500) },
  sugSmall: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
});

