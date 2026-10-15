import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { CheckIcon, DownloadSimpleIcon, ShareNetworkIcon } from 'phosphor-react-native';
import SellerPage, { SellerPrivateLine, sellerPageStyles } from '../../src/components/seller/SellerPage';
import PhoneSaveBar, { PhoneSaveButton, savebarSpace } from '../../src/components/seller/PhoneSaveBar';
import { useSellerShell } from '../../src/components/seller/SellerShell';
import ShopQrPoster, {
  DEFAULT_TEMPLATE, POSTER_H, POSTER_W, TEMPLATES, shopQrLabel,
} from '../../src/components/seller/shopQr/ShopQrPoster';
import { base64ToBytes, bytesToBase64, withPrintDpi } from '../../src/components/seller/shopQr/posterPng';
import EmptyState from '../../src/components/EmptyState';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';

/*
 * /seller/shop-qr (web/src/pages/SellerShopQr.jsx, phones): the shop's QR
 * poster to print for the stall or counter. Buyers scan it to open the shop
 * at emoorm.shop/store/<slug>, in the app when they have it.
 *
 * The poster is an Svg (ShopQrPoster.js); its toDataURL gives the PNG at
 * full size (1240 × 1748, marked 300 dpi), written to the app's cache, then:
 * - Save to Photos: expo-media-library (write-only permission). Where saving
 *   is not possible (Expo Go on Android, permission refused) the share sheet
 *   opens instead, so the seller can still keep or send it.
 * - Share: the system share sheet with the PNG (a print shop, Messenger…).
 * The website has Download PNG and Print instead.
 *
 * The shop logo is downloaded and drawn from a data: URI, so the PNG always
 * carries it; if it cannot be loaded the poster shows the shop's initial.
 *
 * Six designs (shopQr/shopQrTemplates.js, the website's file): the posters
 * page sideways (swipe), with dots under them and a row of thumbnails to pick
 * one; the two stay in step. Save to Photos and Share use the chosen design,
 * named <slug>-qr-<design>.png, and the app remembers it (AsyncStorage).
 */

const LOGO_WAIT_MS = 6000;
const SAVED_KEY = 'emoorm.shopQrTemplate';
const COUNT = TEMPLATES.length;
const THUMB_W = 58;
const indexOf = (key) => Math.max(0, TEMPLATES.findIndex((tp) => tp.key === key));

const townOf = (store) => {
  const town = String(store?.municipality?.name || '').trim();
  if (!town) return '';
  return /oriental mindoro/i.test(town) ? town : `${town}, Oriental Mindoro`;
};

const mimeOf = (url) => {
  const ext = /\.([a-z0-9]+)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
};

/** The shop logo as a data: URI (null when there is none or it cannot be fetched). */
async function logoDataUri(url) {
  if (!url) return null;
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    const file = new File(Paths.cache, 'shop-qr-logo');
    const saved = await File.downloadFileAsync(url, file, { idempotent: true });
    const b64 = await saved.base64();
    return b64 ? `data:${mimeOf(url)};base64,${b64}` : null;
  } catch {
    return null;
  }
}

export default function SellerShopQrScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { store } = useSellerShell();
  // The big posters' Svgs, by design key (toDataURL comes from the chosen one).
  const svgRefs = useRef({});
  const pagerRef = useRef(null);
  // A scroll the screen started (thumbnail, dot): { index, until } while it runs.
  const steering = useRef(null);
  // The logo for the poster: { key: which logo, uri, loaded }.
  const [logo, setLogo] = useState({ key: null, uri: null, loaded: false });
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState(DEFAULT_TEMPLATE);
  const [pageW, setPageW] = useState(screenW);

  const canShare = Boolean(store?.slug && store?.isApproved !== false);
  const slug = store?.slug || '';
  const name = store?.name || 'My shop';
  const town = townOf(store);
  const logoUrl = store?.logo ? resolveImg(store.logo) : null;
  const current = indexOf(selected);
  const fileName = `${slug || 'shop'}-qr-${TEMPLATES[current].key}.png`;
  const posterW = Math.max(200, Math.min(pageW - 64, 400));

  /** Page the posters to design `index`. */
  const scrollToIndex = useCallback((index, animated) => {
    steering.current = animated ? { index, until: Date.now() + 900 } : null;
    pagerRef.current?.scrollTo({ x: index * pageW, y: 0, animated });
  }, [pageW]);

  /** Choose design `i` and bring it into view. */
  const choose = (i) => {
    const index = Math.min(COUNT - 1, Math.max(0, i));
    setSelected(TEMPLATES[index].key);
    scrollToIndex(index, true);
  };

  // The design chosen last time on this device.
  const savedRead = useRef(false);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SAVED_KEY)
      .then((key) => {
        if (!cancelled && TEMPLATES.some((tp) => tp.key === key)) setSelected(key);
      })
      .catch(() => {})
      .finally(() => { savedRead.current = true; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (savedRead.current) AsyncStorage.setItem(SAVED_KEY, selected).catch(() => {});
  }, [selected]);

  // Keep the chosen poster in view when the page width settles or the saved choice arrives.
  useEffect(() => {
    scrollToIndex(indexOf(selected), false);
    // Not on every choice: swipes and taps scroll by themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageW, canShare]);

  /** A swipe: the page nearest the middle is the chosen design. */
  const onPagerScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.min(COUNT - 1, Math.max(0, Math.round(x / Math.max(1, pageW))));
    const steer = steering.current;
    if (steer) {
      // The screen's own scroll passes other designs on the way: do not pick them.
      if (index !== steer.index && Date.now() < steer.until) return;
      steering.current = null;
    }
    const key = TEMPLATES[index].key;
    setSelected((k) => (k === key ? k : key));
  };

  // Fetch the logo; if it never draws, fall back to the initial.
  useEffect(() => {
    if (!canShare) return undefined;
    let cancelled = false;
    let timer = null;
    (async () => {
      const uri = await logoDataUri(logoUrl);
      if (cancelled) return;
      setLogo({ key: logoUrl, uri, loaded: !uri });
      if (uri) {
        timer = setTimeout(() => {
          if (!cancelled) setLogo((l) => (l.key === logoUrl && !l.loaded ? { key: logoUrl, uri: null, loaded: true } : l));
        }, LOGO_WAIT_MS);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canShare, logoUrl]);

  const ready = logo.key === logoUrl && logo.loaded;

  /** The poster as a PNG file in the cache; its uri. */
  const makePng = () => new Promise((resolve, reject) => {
    const svg = svgRefs.current[TEMPLATES[current].key];
    if (!svg?.toDataURL) {
      reject(new Error('The poster is not ready'));
      return;
    }
    svg.toDataURL((b64) => {
      try {
        if (!b64) throw new Error('No picture');
        const bytes = withPrintDpi(base64ToBytes(b64));
        if (Platform.OS === 'web') {
          resolve(`data:image/png;base64,${bytesToBase64(bytes)}`);
          return;
        }
        const file = new File(Paths.cache, fileName);
        if (file.exists) file.delete();
        file.create();
        file.write(bytes);
        resolve(file.uri);
      } catch (err) {
        reject(err);
      }
    }, { width: POSTER_W, height: POSTER_H });
  });

  const webDownload = (uri) => {
    const a = document.createElement('a');
    a.href = uri;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const shareFile = async (uri) => {
    if (Platform.OS === 'web') {
      webDownload(uri);
      return;
    }
    try {
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your shop QR' });
        return;
      }
    } catch { /* the plain share sheet below */ }
    await Share.share(Platform.OS === 'ios'
      ? { url: uri, title: `${name} – Shop QR` }
      : { message: `Scan to shop at ${name}: https://${shopQrLabel(slug)}`, title: `${name} – Shop QR` });
  };

  const run = async (kind, job) => {
    if (!ready || busy) return;
    setBusy(kind);
    try {
      await job(await makePng());
    } catch {
      toast.error('Could not make the picture.', 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const saveToPhotos = () => run('save', async (uri) => {
    if (Platform.OS === 'web') {
      webDownload(uri);
      toast.success(`Saved ${fileName}`);
      return;
    }
    let saved = false;
    try {
      // Loaded only when used: Expo Go warns about the library as soon as it loads.
      const MediaLibrary = require('expo-media-library/legacy');
      const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (perm?.granted) {
        await MediaLibrary.saveToLibraryAsync(uri);
        saved = true;
      }
    } catch { /* not possible here: share instead */ }
    if (saved) {
      toast.success('Saved to Photos', 'Your shop QR poster is ready to print.');
      return;
    }
    toast.info('Could not save to Photos', 'Pick where to keep it instead.');
    await shareFile(uri);
  });

  const share = () => run('share', shareFile);

  if (!store) {
    return (
      <SellerPage>
        <View style={styles.wait}><ActivityIndicator color={t.primary[600]} /></View>
      </SellerPage>
    );
  }

  if (!canShare) {
    return (
      <SellerPage>
        <EmptyState
          art="stores"
          title="Your shop QR comes with approval"
          text="Buyers can open your shop once an admin approves it. Your QR poster will be ready here then."
          actions={[{ label: 'Back to Me', onPress: () => router.replace('/seller/menu'), variant: 'outline' }]}
          page
        />
      </SellerPage>
    );
  }

  return (
    <SellerPage scroll={false} privateLine={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={[sellerPageStyles.content, styles.content, { paddingBottom: 16 + savebarSpace(insets) }]}
      >
        <SellerPrivateLine />
        <Text style={styles.lead}>Pick a design, then print it where buyers can see it. A scan opens your shop.</Text>

        {/* The posters, one design per page: swipe sideways for the others. */}
        <View style={styles.pagerWrap} onLayout={(e) => setPageW(Math.round(e.nativeEvent.layout.width))}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onPagerScroll}
            scrollEventThrottle={32}
            accessibilityLabel="Poster designs. Swipe to see the others."
          >
            {TEMPLATES.map((tp, i) => (
              <View
                key={tp.key}
                style={[styles.page, { width: pageW }]}
                accessibilityLabel={`${tp.name}, ${i + 1} of ${COUNT}`}
              >
                <View style={[styles.sheet, { width: posterW, height: (posterW * POSTER_H) / POSTER_W }]}>
                  {logo.key === logoUrl ? (
                    <ShopQrPoster
                      ref={(el) => { svgRefs.current[tp.key] = el; }}
                      name={name}
                      town={town}
                      slug={slug}
                      template={tp.key}
                      logoUri={logo.uri}
                      width={posterW}
                      onLogoLoad={() => setLogo((l) => (l.key === logoUrl && !l.loaded ? { ...l, loaded: true } : l))}
                    />
                  ) : null}
                  {!ready ? (
                    <View style={styles.sheetWait} pointerEvents="none">
                      <ActivityIndicator color={t.primary[600]} />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.dots}>
          {TEMPLATES.map((tp, i) => (
            <Pressable
              key={tp.key}
              onPress={() => choose(i)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Show ${tp.name}`}
              style={[styles.dot, i === current && styles.dotOn]}
            />
          ))}
        </View>

        {/* The designs, small, to pick one. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pickerScroll}
          contentContainerStyle={styles.picker}
          accessibilityRole="radiogroup"
          accessibilityLabel="Poster design"
        >
          {TEMPLATES.map((tp, i) => {
            const on = i === current;
            return (
              <Pressable
                key={tp.key}
                onPress={() => choose(i)}
                accessibilityRole="radio"
                aria-checked={on}
                accessibilityLabel={tp.name}
                style={styles.thumb}
              >
                <View style={styles.thumbArt}>
                  <View style={styles.thumbClip}>
                    {logo.key === logoUrl ? (
                      <ShopQrPoster name={name} slug={slug} template={tp.key} logoUri={logo.uri} width={THUMB_W} />
                    ) : null}
                  </View>
                  <View style={on ? styles.thumbRingOn : styles.thumbRing} pointerEvents="none" />
                  {on ? (
                    <View style={styles.thumbTick}>
                      <CheckIcon size={10} weight="bold" color="#fff" />
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.thumbName, on && styles.thumbNameOn]}>{tp.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.link} selectable>{shopQrLabel(slug)}</Text>
      </ScrollView>

      <PhoneSaveBar>
        <PhoneSaveButton label="Share" onPress={share} disabled={!ready || Boolean(busy)} busy={busy === 'share'}>
          {busy === 'share' ? null : (
            <View style={styles.btnRow}>
              <ShareNetworkIcon size={18} color={t.neutral[700]} />
              <Text style={[styles.btnText, styles.btnTextPlain]}>Share</Text>
            </View>
          )}
        </PhoneSaveButton>
        <PhoneSaveButton primary label="Save to Photos" busyLabel="Saving…" onPress={saveToPhotos} disabled={!ready || Boolean(busy)} busy={busy === 'save'}>
          {busy === 'save' ? null : (
            <View style={styles.btnRow}>
              <DownloadSimpleIcon size={18} weight="bold" color={ready ? '#fff' : t.neutral[500]} />
              <Text style={[styles.btnText, { color: ready ? '#fff' : t.neutral[500] }]}>Save to Photos</Text>
            </View>
          )}
        </PhoneSaveButton>
      </PhoneSaveBar>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignItems: 'center' },
  wait: { paddingVertical: 48, alignItems: 'center' },
  lead: {
    alignSelf: 'stretch', marginTop: 2, marginBottom: 14, marginHorizontal: 8, textAlign: 'center',
    fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[600],
  },
  sheet: {
    borderRadius: 18, overflow: 'hidden', backgroundColor: t.neutral[0],
    boxShadow: [
      { offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(15, 23, 42, 0.06)' },
      { offsetX: 0, offsetY: 14, blurRadius: 34, color: 'rgba(15, 23, 42, 0.08)' },
    ],
  },
  sheetWait: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  // Edge to edge (the page content is padded 12 at the sides).
  pagerWrap: { alignSelf: 'stretch', marginHorizontal: -12 },
  page: { alignItems: 'center', paddingTop: 4, paddingBottom: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.neutral[300] },
  dotOn: { width: 20, backgroundColor: t.primary[600] },
  pickerScroll: { alignSelf: 'stretch', marginHorizontal: -12, marginTop: 8, flexGrow: 0 },
  picker: { flexGrow: 1, justifyContent: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  thumb: { alignItems: 'center', gap: 6 },
  thumbArt: { width: THUMB_W, height: (THUMB_W * POSTER_H) / POSTER_W },
  thumbClip: { ...StyleSheet.absoluteFillObject, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[0] },
  thumbRing: { ...StyleSheet.absoluteFillObject, borderRadius: 8, borderWidth: 1, borderColor: t.neutral[200] },
  thumbRingOn: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 12, borderWidth: 2, borderColor: t.primary[600],
  },
  thumbTick: {
    position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[600], borderWidth: 2, borderColor: '#fff',
  },
  thumbName: { fontSize: 12, lineHeight: 15, ...font(400), color: t.neutral[600] },
  thumbNameOn: { ...font(500), color: t.neutral[900] },
  link: {
    marginTop: 10, marginHorizontal: 8, textAlign: 'center', fontSize: 13, lineHeight: 19, ...font(400), color: t.neutral[500],
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 15, lineHeight: 20, ...font(500) },
  btnTextPlain: { color: t.neutral[700] },
});
