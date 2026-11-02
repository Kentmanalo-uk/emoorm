import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, FlatList, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
// Library photos on iPhones are ph:// assets, which React Native's Image no
// longer draws; expo-image does (and is quick for a strip of thumbnails).
import { Image as LibraryImage } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowsClockwiseIcon, CameraIcon, CaretDownIcon, CaretUpIcon, ImagesIcon, LightningIcon, LightningSlashIcon,
  MapPinIcon, SlidersHorizontalIcon, XIcon,
} from '../src/lib/icons';
import Chip from '../src/components/Chip';
import EmptyState from '../src/components/EmptyState';
import ProductCard from '../src/components/ProductCard';
import SearchFilterSheet from '../src/components/search/SearchFilterSheet';
import { pickSearchImage } from '../src/components/search/ImageSearchSheet';
import { saveImageSearch, takePendingImage } from '../src/components/search/imageSearchStore';
import { authedFetch } from '../src/api/client';
import { fetchCategories, fetchMunicipalities } from '../src/lib/referenceData';
import { GRID_EDGE, GRID_GAP, gridCellWidth } from '../src/lib/productGrid';
import { font, t, themed } from '../src/theme';

/*
 * Search by image, camera first:
 *
 *   camera   the viewfinder opens at once; the gallery on the left of the
 *            shutter, front/back on the right, the phone's recent photos in
 *            a strip below (tap one to search it)
 *   scanning the photo fills the screen while a line sweeps the frame
 *            (POST /products/search-by-image runs meanwhile)
 *   results  a sheet rises over the photo with the matches, sorted and
 *            filtered like the search results page (Best match / Newest /
 *            Top Sales / Price, then Filter · Municipality · Category ·
 *            Price); drag it up for more, Retake for another photo
 *
 * Photos are sent as a JPEG about 1080px wide (iPhone HEIC photos included).
 *
 * The recent-photos strip reads the photo library (expo-media-library), which
 * works on iPhones and in Android app builds. Expo Go on Android can no longer
 * read it, so there the strip is a "Browse your photos" button instead (the
 * system photo picker, which needs no permission); the library module is
 * never loaded there.
 * A photo handed over by the search page's image sheet is searched at once.
 */

const RECENT = 40;
// Expo Go on Android can't read the photo library any more (Android's
// permission rules): use the photo picker there.
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const LIBRARY = Platform.OS === 'ios' || (Platform.OS === 'android' && !IN_EXPO_GO);
// Loaded only where it works, so Expo Go on Android never warns about it.
const mediaLibrary = () => (LIBRARY ? require('expo-media-library/legacy') : null);
// The scan plays at least this long, so it is seen rather than flashed.
const SCAN_MIN_MS = 1200;
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

// A photo ready to send: a JPEG about 1080px wide.
async function prepare(uri) {
  try {
    const out = await manipulateAsync(uri, [{ resize: { width: 1080 } }], { compress: 0.8, format: SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', fileName: `image-search-${Date.now()}.jpg` };
  } catch {
    return { uri, mimeType: 'image/jpeg', fileName: `image-search-${Date.now()}.jpg` };
  }
}

async function searchByImage(photo) {
  // The web build's photos are blob:/data: URLs: their bytes are sent.
  const blob = !photo.file && Platform.OS === 'web' ? await (await fetch(photo.uri)).blob() : null;
  // fetch, not axios: React Native sends a FormData body reliably this way.
  // authedFetch renews a lapsed session once (a fresh form for the retry).
  const res = await authedFetch('/products/search-by-image', () => {
    const form = new FormData();
    if (photo.file) form.append('image', photo.file);
    else if (blob) form.append('image', blob, photo.fileName || 'image-search.jpg');
    else form.append('image', { uri: photo.uri, name: photo.fileName, type: photo.mimeType || 'image/jpeg' });
    return { method: 'POST', body: form };
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.message || 'Image search failed');
  return json.data?.results || [];
}

export default function SearchByImage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [libraryAllowed, setLibraryAllowed] = useState(null);

  // 'camera' | 'scanning' | 'results' | 'error'
  const [phase, setPhase] = useState('camera');
  const [photo, setPhoto] = useState(null);
  const [results, setResults] = useState([]);

  // Ask for the camera as the page opens.
  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // The phone's recent photos, when it lets us see them.
  const loadRecent = useCallback(async (ask) => {
    const MediaLibrary = mediaLibrary();
    if (!MediaLibrary) return;
    try {
      // Android 13+: photos only (not videos or music).
      const photosOnly = Platform.OS === 'android' ? ['photo'] : undefined;
      const p = ask
        ? await MediaLibrary.requestPermissionsAsync(false, photosOnly)
        : await MediaLibrary.getPermissionsAsync(false, photosOnly);
      setLibraryAllowed(Boolean(p?.granted));
      if (!p?.granted) return;
      const page = await MediaLibrary.getAssetsAsync({ first: RECENT, mediaType: 'photo', sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
      setRecent(page.assets || []);
    } catch {
      setLibraryAllowed(false);
    }
  }, []);
  useEffect(() => { loadRecent(false); }, [loadRecent]);

  // Search a photo: scan it (at least a moment, so the scan reads), then the results.
  const run = useCallback(async (raw) => {
    setPhoto(raw);
    setPhase('scanning');
    try {
      const [found] = await Promise.all([searchByImage(raw), wait(SCAN_MIN_MS)]);
      setResults(found);
      saveImageSearch({ results: found, previewUrl: raw.uri });
      setPhase('results');
    } catch {
      setPhase('error');
    }
  }, []);

  // A photo handed over by the search page's image sheet.
  useEffect(() => {
    const pending = takePendingImage();
    if (pending) run(pending);
  }, [run]);

  const shoot = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (shot?.uri) run(await prepare(shot.uri));
    } finally {
      setBusy(false);
    }
  };
  const fromGallery = async () => {
    const asset = await pickSearchImage({ source: 'library' });
    if (asset) run(asset.file ? asset : await prepare(asset.uri));
  };
  const fromRecent = async (asset) => {
    let uri = asset.uri;
    try {
      // A file on the phone (an iCloud photo is downloaded first on iPhones).
      const info = await mediaLibrary()?.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
      uri = info?.localUri || uri;
    } catch { /* the asset's own uri */ }
    run(await prepare(uri));
  };
  const retake = () => { setPhase('camera'); setPhoto(null); setResults([]); };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const camOK = perm?.granted;

  return (
    <View style={styles.screen}>
      {/* The camera, or the photo being searched. */}
      {phase === 'camera' ? (
        camOK ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            enableTorch={flash && facing === 'back'}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noCam]}>
            <CameraIcon size={44} color="rgba(255,255,255,0.7)" />
            <Text style={styles.noCamTitle}>Search with your camera</Text>
            <Text style={styles.noCamText}>Point it at a product to find similar ones from local shops.</Text>
            {perm && !perm.granted ? (
              <Pressable onPress={requestPerm} style={({ pressed }) => [styles.allow, pressed && { opacity: 0.85 }]}>
                <Text style={styles.allowText}>Allow camera</Text>
              </Pressable>
            ) : null}
          </View>
        )
      ) : photo ? (
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      {/* Soft shade top and bottom, so the controls read on any picture. */}
      <Shade height={insets.top + 90} />
      <Shade height={260} bottom />

      {phase === 'camera' && camOK ? <Frame W={W} H={H} /> : null}
      {phase === 'scanning' ? <Scanner W={W} H={H} /> : null}

      {/* Top: close, the title, the torch. */}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.topBtn}>
          <XIcon size={20} weight="bold" color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>{phase === 'scanning' ? 'Searching…' : 'Search by image'}</Text>
        {phase === 'camera' && camOK && facing === 'back' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={flash ? 'Torch off' : 'Torch on'} onPress={() => setFlash((v) => !v)} style={styles.topBtn}>
            {flash ? <LightningIcon size={20} weight="fill" color="#fde68a" /> : <LightningSlashIcon size={20} color="#fff" />}
          </Pressable>
        ) : <View style={styles.topSpace} />}
      </View>

      {/* Camera controls: gallery · shutter · flip, then the recent photos. */}
      {phase === 'camera' ? (
        <View style={[styles.controls, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.hint}>Point at a product, or pick a photo</Text>
          <View style={styles.shutterRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose from gallery" onPress={fromGallery} style={styles.sideBtn}>
              {recent[0] ? <LibraryImage source={{ uri: recent[0].uri }} style={styles.sideThumb} contentFit="cover" recyclingKey={recent[0].id} /> : <ImagesIcon size={24} color="#fff" />}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              onPress={shoot}
              disabled={!camOK || busy}
              style={({ pressed }) => [styles.shutter, (!camOK || busy) && { opacity: 0.5 }, pressed && styles.shutterPressed]}
            >
              <View style={styles.shutterCore}>{busy ? <ActivityIndicator color={t.primary[600]} /> : null}</View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={facing === 'back' ? 'Use the front camera' : 'Use the back camera'}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              disabled={!camOK}
              style={[styles.sideBtn, !camOK && { opacity: 0.4 }]}
            >
              <ArrowsClockwiseIcon size={24} color="#fff" />
            </Pressable>
          </View>
          {!LIBRARY && Platform.OS !== 'web' ? (
            <Pressable onPress={fromGallery} style={styles.showPhotos}>
              <ImagesIcon size={16} color="#fff" />
              <Text style={styles.showPhotosText}>Browse your photos</Text>
            </Pressable>
          ) : null}
          {LIBRARY ? (
            recent.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recent}>
                {recent.map((a) => (
                  <Pressable key={a.id} onPress={() => fromRecent(a)} accessibilityRole="button" accessibilityLabel="Search this photo" style={({ pressed }) => [styles.recentItem, pressed && { opacity: 0.7 }]}>
                    <LibraryImage source={{ uri: a.uri }} style={styles.recentImg} contentFit="cover" recyclingKey={a.id} transition={120} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : libraryAllowed === false ? (
              <Pressable onPress={() => loadRecent(true)} style={styles.showPhotos}>
                <ImagesIcon size={16} color="#fff" />
                <Text style={styles.showPhotosText}>Show my recent photos</Text>
              </Pressable>
            ) : null
          ) : null}
        </View>
      ) : null}

      {phase === 'scanning' ? (
        <View style={[styles.scanChip, { bottom: insets.bottom + 40 }]}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.scanText}>Finding similar products…</Text>
        </View>
      ) : null}

      {phase === 'error' ? (
        <View style={[styles.errorCard, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.errorTitle}>Couldn&apos;t search this photo</Text>
          <Text style={styles.errorText}>Check your connection, or try a clearer photo of one product.</Text>
          <View style={styles.errorActions}>
            <Pressable onPress={retake} style={[styles.pill, styles.pillOutline]}><Text style={styles.pillOutlineText}>Retake</Text></Pressable>
            <Pressable onPress={() => run(photo)} style={[styles.pill, styles.pillPrimary]}><Text style={styles.pillPrimaryText}>Try again</Text></Pressable>
          </View>
        </View>
      ) : null}

      {phase === 'results' ? (
        <ResultsSheet
          results={results}
          photo={photo}
          W={W}
          H={H}
          insets={insets}
          onRetake={retake}
        />
      ) : null}
    </View>
  );
}

/** A soft dark fade at the top or bottom of the screen. */
function Shade({ height, bottom = false }) {
  return (
    <View pointerEvents="none" style={[styles.shade, { height }, bottom ? { bottom: 0 } : { top: 0 }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={bottom ? 'shadeB' : 'shadeT'} x1="0" y1={bottom ? '1' : '0'} x2="0" y2={bottom ? '0' : '1'}>
            <Stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#000" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${bottom ? 'shadeB' : 'shadeT'})`} />
      </Svg>
    </View>
  );
}

// The framing box: four soft corners in the middle of the viewfinder.
const frameBox = (W, H) => {
  const size = Math.min(W - 72, H * 0.42);
  return { left: (W - size) / 2, top: H * 0.42 - size / 2, size };
};

function Corners({ box, color = '#fff' }) {
  const arm = 26;
  const line = { position: 'absolute', backgroundColor: color, borderRadius: 2 };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: box.left, top: box.top, width: box.size, height: box.size }}>
      {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => (
        <View key={`${x}${y}`} style={{ position: 'absolute', left: x ? box.size - arm : 0, top: y ? box.size - arm : 0, width: arm, height: arm }}>
          <View style={[line, { left: 0, right: 0, height: 3, [y ? 'bottom' : 'top']: 0 }]} />
          <View style={[line, { top: 0, bottom: 0, width: 3, [x ? 'right' : 'left']: 0 }]} />
        </View>
      ))}
    </View>
  );
}

function Frame({ W, H }) {
  return <Corners box={frameBox(W, H)} color="rgba(255,255,255,0.85)" />;
}

/**
 * The scan: the frame, and a line travelling down it.
 *
 * One thing moving, which is what a scan looks like. Everything else the
 * overlay needs -- the photo staying visible, the chip staying readable --
 * is a still layer, so there is a single animation driving a single
 * transform on the UI thread.
 */
function Scanner({ W, H }) {
  const box = frameBox(W, H);
  const sweep = useRef(new Animated.Value(0)).current;
  const on = useRef(true);

  useEffect(() => {
    on.current = true;
    const run = () => {
      if (!on.current) return;
      sweep.setValue(0);
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) run(); });
    };
    run();
    return () => { on.current = false; sweep.stopAnimation(); };
  }, [sweep]);

  // It travels the frame, not the screen: the frame is what is being read.
  // It stays inside the frame's own edges, so nothing has to clip it --
  // and on Android the line's glow is an elevation shadow, which a clip
  // would cut off.
  const travel = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, box.size - 2] });
  // Faded at both ends, so it arrives and leaves instead of snapping.
  const fade = sweep.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* A plain scrim, so the chip and the buttons stay readable. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3, 26, 15, 0.34)' }]} />

      <View style={{ position: 'absolute', left: box.left, top: box.top, width: box.size, height: box.size }}>
        <Animated.View style={[styles.scanLine, { opacity: fade, transform: [{ translateY: travel }] }]} />
      </View>

      <Corners box={box} />
    </View>
  );
}

/* ── Results ─────────────────────────────────────────────────────────── */

function ResultsSheet({ results, photo, W, H, insets, onRetake }) {
  // Two resting heights: about half the screen (the photo still shows), or nearly full.
  const halfTop = Math.round(H * 0.44);
  const fullTop = insets.top + 56;
  const top = useRef(new Animated.Value(H)).current;
  const at = useRef(halfTop);
  useEffect(() => {
    Animated.spring(top, { toValue: halfTop, friction: 9, tension: 70, useNativeDriver: false }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const snap = (to) => { at.current = to; Animated.spring(top, { toValue: to, friction: 9, tension: 80, useNativeDriver: false }).start(); };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => top.setValue(Math.max(fullTop, Math.min(H - 120, at.current + g.dy))),
    onPanResponderRelease: (_, g) => {
      const y = at.current + g.dy + g.vy * 120;
      snap(Math.abs(y - fullTop) < Math.abs(y - halfTop) ? fullTop : halfTop);
    },
  }), [halfTop, fullTop, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sorting and filtering, as on the search results page (here on the matches already found).
  const [sortBy, setSortBy] = useState('relevance');
  const [filterSheet, setFilterSheet] = useState(null);
  const [filters, setFilters] = useState({ municipalityId: '', category: '', minPrice: '', maxPrice: '' });
  const [municipalities, setMunicipalities] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    fetchMunicipalities().then((m) => setMunicipalities(m || [])).catch(() => {});
    fetchCategories().then((c) => setCategories(c || [])).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const min = Number(filters.minPrice) || 0;
    const max = Number(filters.maxPrice) || Infinity;
    const list = results.filter((p) => {
      const price = Number(p.price) || 0;
      if (filters.municipalityId && (p.municipality?.id || p.municipalityId) !== filters.municipalityId) return false;
      if (filters.category && (p.category?.id || p.categoryId) !== filters.category) return false;
      return price >= min && price <= max;
    });
    const by = {
      newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      'top-sales': (a, b) => (b.soldCount || 0) - (a.soldCount || 0),
      'price-low': (a, b) => Number(a.price) - Number(b.price),
      'price-high': (a, b) => Number(b.price) - Number(a.price),
    }[sortBy];
    return by ? [...list].sort(by) : list;
  }, [results, filters, sortBy]);

  const filterCount = ['municipalityId', 'category'].filter((k) => filters[k]).length + (filters.minPrice || filters.maxPrice ? 1 : 0);
  const priceActive = Boolean(filters.minPrice || filters.maxPrice);
  const priceOn = sortBy === 'price-low' || sortBy === 'price-high';
  const town = municipalities.find((m) => m.id === filters.municipalityId)?.name;
  const cat = categories.find((c) => c.id === filters.category)?.name;
  const cellW = gridCellWidth(W);

  return (
    <>
      <Animated.View style={[styles.sheet, { top, height: H - fullTop }]}>
        <View {...pan.panHandlers}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            {photo ? <Image source={{ uri: photo.uri }} style={styles.sheetThumb} /> : null}
            <View style={styles.sheetTitleBox}>
              <Text style={styles.sheetTitle}>{`${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}</Text>
              <Text style={styles.sheetSub} numberOfLines={1}>Similar products from local shops</Text>
            </View>
            <Pressable onPress={onRetake} accessibilityRole="button" style={({ pressed }) => [styles.retake, pressed && { backgroundColor: t.primary[50] }]}>
              <CameraIcon size={15} color={t.primary[700]} />
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
          </View>
        </View>

        <FlatList
            // Rows far off screen are detached rather than kept mounted;
            // React Native's default keeps about twenty-one screens of them.
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            data={shown}
            keyExtractor={(p) => String(p.id)}
            numColumns={2}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListHeaderComponent={(
              <View>
                <View style={styles.sorts} accessibilityRole="tablist">
                  <SortTab label="Best match" on={sortBy === 'relevance'} onPress={() => setSortBy('relevance')} />
                  <SortTab label="Newest" on={sortBy === 'newest'} onPress={() => setSortBy('newest')} />
                  <SortTab label="Top Sales" on={sortBy === 'top-sales'} onPress={() => setSortBy('top-sales')} />
                  <SortTab label="Price" on={priceOn} onPress={() => setSortBy(sortBy === 'price-low' ? 'price-high' : 'price-low')}>
                    <View style={styles.sortDir}>
                      <CaretUpIcon size={10} weight="bold" color={sortBy === 'price-low' ? t.primary[700] : t.neutral[300]} />
                      <CaretDownIcon size={10} weight="bold" color={sortBy === 'price-high' ? t.primary[700] : t.neutral[300]} />
                    </View>
                  </SortTab>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                  <Chip variant="filter" icon={SlidersHorizontalIcon} label={`Filter${filterCount ? ` (${filterCount})` : ''}`} active={Boolean(filterCount)} onPress={() => setFilterSheet('all')} />
                  <Chip variant="filter" icon={MapPinIcon} label={town || 'Municipality'} caret active={Boolean(filters.municipalityId)} onPress={() => setFilterSheet('municipality')} />
                  <Chip variant="filter" label={cat || 'Category'} caret active={Boolean(filters.category)} onPress={() => setFilterSheet('category')} />
                  <Chip variant="filter" label="Price" caret active={priceActive} onPress={() => setFilterSheet('price')} />
                </ScrollView>
                {!results.length ? (
                  <EmptyState
                    compact
                    art="search"
                    title="No matches for this photo"
                    text="Try a clearer photo of a single product, in good light."
                    actions={[{ label: 'Retake', onPress: onRetake }]}
                  />
                ) : !shown.length ? (
                  <EmptyState compact art="search" title="Nothing matches these filters" actions={[{ label: 'Clear filters', variant: 'outline', onPress: () => setFilters({ municipalityId: '', category: '', minPrice: '', maxPrice: '' }) }]} />
                ) : null}
              </View>
            )}
            renderItem={({ item }) => (
              <View style={{ width: cellW }}>
                <ProductCard product={item} variant="result" />
              </View>
            )}
          />
      </Animated.View>

      <SearchFilterSheet
        focus={filterSheet}
        onClose={() => setFilterSheet(null)}
        municipalities={municipalities}
        categories={categories}
        value={filters}
        onChange={(part) => setFilters((f) => ({ ...f, ...part }))}
        onReset={() => setFilters({ municipalityId: '', category: '', minPrice: '', maxPrice: '' })}
      />
    </>
  );
}

/** A sort tab, as on the search results page: green and medium when chosen. */
function SortTab({ label, on, onPress, children }) {
  return (
    <Pressable style={styles.sortTab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
      <Text style={[styles.sortText, on && styles.sortTextOn]}>{label}</Text>
      {children}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  shade: { position: 'absolute', left: 0, right: 0 },

  noCam: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, backgroundColor: '#0b0f0d' },
  noCamTitle: { marginTop: 16, fontSize: 18, lineHeight: 23, color: '#fff', textAlign: 'center', ...font(600) },
  noCamText: { marginTop: 6, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.7)', textAlign: 'center', ...font(400) },
  allow: { marginTop: 18, height: 42, paddingHorizontal: 24, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  allowText: { fontSize: 15, lineHeight: 18, color: '#fff', ...font(500) },

  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  topBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  topSpace: { width: 42, height: 42 },
  topTitle: { fontSize: 16, lineHeight: 20, color: '#fff', ...font(600) },

  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  hint: { marginBottom: 14, fontSize: 13, lineHeight: 17, color: 'rgba(255,255,255,0.85)', ...font(500) },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 44 },
  sideBtn: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sideThumb: { width: '100%', height: '100%' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterCore: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  recent: { gap: 6, paddingHorizontal: 12, paddingTop: 16 },
  recentItem: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  recentImg: { width: '100%', height: '100%' },
  showPhotos: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, height: 36, paddingHorizontal: 14, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  showPhotosText: { fontSize: 13.5, lineHeight: 17, color: '#fff', ...font(500) },

  // The sweeping line: white, with one soft green glow under it.
  scanLine: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: 'rgba(52, 211, 153, 0.85)' }],
  },
  scanChip: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scanText: { fontSize: 14, lineHeight: 18, color: '#fff', ...font(500) },

  errorCard: { position: 'absolute', left: 20, right: 20, padding: 18, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center' },
  errorTitle: { fontSize: 17, lineHeight: 22, color: t.neutral[900], ...font(600) },
  errorText: { marginTop: 4, fontSize: 13.5, lineHeight: 20, color: t.neutral[500], textAlign: 'center', ...font(400) },
  errorActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pill: { height: 40, paddingHorizontal: 22, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pillOutline: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  pillOutlineText: { fontSize: 14.5, lineHeight: 18, color: t.neutral[800], ...font(500) },
  pillPrimary: { backgroundColor: t.primary[600] },
  pillPrimaryText: { fontSize: 14.5, lineHeight: 18, color: '#fff', ...font(500) },

  sheet: {
    position: 'absolute', left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 20, color: 'rgba(0,0,0,0.18)' }],
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: t.neutral[300] },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  sheetThumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: t.neutral[100] },
  sheetTitleBox: { flex: 1 },
  sheetTitle: { fontSize: 17, lineHeight: 22, color: t.neutral[900], ...font(600) },
  sheetSub: { fontSize: 13, lineHeight: 17, color: t.neutral[500], ...font(400) },
  retake: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14, borderRadius: 18,
    borderWidth: 1, borderColor: t.primary[200], backgroundColor: '#fff',
  },
  retakeText: { fontSize: 13.5, lineHeight: 17, color: t.primary[700], ...font(600) },

  // The search results page's sort tabs and filter chips (app/products.js).
  sorts: { flexDirection: 'row', alignItems: 'stretch', gap: 22, paddingHorizontal: 16 },
  sortTab: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 46 },
  sortText: { fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[600] },
  sortTextOn: { ...font(500), color: t.primary[700] },
  sortDir: { flexDirection: 'column' },
  filters: { gap: 8, paddingTop: 2, paddingHorizontal: 16, paddingBottom: 12 },
  row: { gap: GRID_GAP, paddingHorizontal: GRID_EDGE, marginBottom: GRID_GAP },
}));
