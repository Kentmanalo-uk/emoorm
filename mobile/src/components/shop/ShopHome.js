import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QuotesIcon, ShoppingCartIcon, StarIcon, StorefrontIcon } from 'phosphor-react-native';
import ProductImage from '../ProductImage';
import { SaleWas, peso } from '../SaleTag';
import { resolveImg } from '../../lib/media';
import { saleInfo } from '../../lib/variantPricing';
import { font, t } from '../../theme';
import { ShopGradient, alpha, mix } from './shopTheme';

/*
 * A shop's Home tab (web/src/components/shop/ShopHome.jsx + ShopHome.css):
 * the sections its seller arranged in Decorate my shop, each in its chosen
 * style, at the website's phone sizes (the narrow container rules).
 *
 * <ShopHome sections={home} accent={primary} onAddToCart={(product) => …} />
 */
export default function ShopHome({ sections = [], accent = t.primary[600], onAddToCart = null }) {
  const [width, setWidth] = useState(0);
  if (!sections.length) return null;
  return (
    <View style={styles.home} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? sections.map((s) => (
        <Section key={s.id} section={s} width={width} accent={accent} onAddToCart={onAddToCart} />
      )) : null}
    </View>
  );
}

function Title({ text, accent }) {
  if (!text) return null;
  return (
    <View style={styles.titleWrap}>
      <Text style={styles.title}>{text}</Text>
      <View style={[styles.titleBar, { backgroundColor: accent }]} />
    </View>
  );
}

function Section({ section: s, width, accent, onAddToCart }) {
  if (s.type === 'banner') {
    const images = s.images || [];
    if (!images.length) return null;
    return (
      <View style={styles.sec}>
        <Title text={s.title} accent={accent} />
        {s.style === 'slider' ? <Slider images={images} width={width} /> : s.style === 'cards' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={Math.round(width * 0.82) + 10}
            decelerationRate="fast"
            style={styles.bleed}
            contentContainerStyle={styles.cardsTrack}
          >
            {images.map((img, i) => {
              const w = images.length === 1 ? width : Math.round(width * 0.82);
              return <Photo key={`${img.url}-${i}`} img={img} style={[styles.bannerCard, { width: w, height: w / 1.6 }]} />;
            })}
          </ScrollView>
        ) : (
          <View style={styles.wideList}>
            {images.map((img, i) => (
              <Photo key={`${img.url}-${i}`} img={img} style={[styles.wideItem, { height: width * 9 / 16 }]} />
            ))}
          </View>
        )}
      </View>
    );
  }
  if (s.type === 'spotlight') {
    const products = s.products || [];
    if (!products.length) return null;
    const half = (width - 10) / 2;
    const tile = (p, i, extra = {}) => (
      <ProductTile key={p.id} product={p} accent={accent} onAddToCart={onAddToCart} {...extra} />
    );
    let list;
    if (s.style === 'carousel') {
      const w = width * 0.42;
      list = (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={w + 10}
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
        >
          {products.map((p, i) => tile(p, i, { style: { width: w } }))}
        </ScrollView>
      );
    } else if (s.style === 'list') {
      list = <View style={styles.rowList}>{products.map((p, i) => tile(p, i, { row: true }))}</View>;
    } else {
      // grid, or hero: the first one big across the row, the rest two by two.
      const hero = s.style === 'hero';
      list = (
        <View style={styles.grid}>
          {products.map((p, i) => (hero && i === 0
            ? tile(p, i, { big: true, style: { width } })
            : tile(p, i, { style: { width: half } })))}
        </View>
      );
    }
    return (
      <View style={styles.sec}>
        <Title text={s.title} accent={accent} />
        {list}
      </View>
    );
  }
  if (s.type === 'gallery') {
    const images = s.images || [];
    if (!images.length) return null;
    return (
      <View style={styles.sec}>
        <Title text={s.title} accent={accent} />
        <Gallery images={images} styleName={s.style} width={width} />
      </View>
    );
  }
  if (s.type === 'message') {
    if (!String(s.body || '').trim()) return null;
    return <Message section={s} accent={accent} />;
  }
  return null;
}

/** A banner photo, opening its product when it has one. */
function Photo({ img, style }) {
  const router = useRouter();
  const pic = <Image source={{ uri: resolveImg(img.url) }} style={styles.fill} resizeMode="cover" />;
  if (img.productSlug) {
    return (
      <Pressable style={[styles.photo, style]} onPress={() => router.push(`/product/${img.productSlug}`)} accessibilityRole="link">
        {pic}
      </Pressable>
    );
  }
  return <View style={[styles.photo, style]}>{pic}</View>;
}

/** One photo at a time, moving on every few seconds; swipe to change it. */
function Slider({ images, width }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const at = useRef(0);

  useEffect(() => {
    if (images.length < 2 || paused) return undefined;
    const timer = setInterval(() => {
      const next = (at.current + 1) % images.length;
      track.current?.scrollTo({ x: next * width, animated: true });
    }, 4500);
    return () => clearInterval(timer);
  }, [images.length, paused, width]);

  const onScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    at.current = i;
    if (i !== index) setIndex(i);
  };

  return (
    <View style={styles.slider}>
      <ScrollView
        ref={track}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onTouchStart={() => setPaused(true)}
      >
        {images.map((img, i) => (
          <Photo key={`${img.url}-${i}`} img={img} style={{ width, height: width / 2, backgroundColor: t.neutral[100] }} />
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {images.map((img, i) => <View key={`${img.url}-${i}`} style={[styles.dot, i === index && styles.dotOn]} />)}
        </View>
      ) : null}
    </View>
  );
}

function ProductTile({ product: p, accent, big = false, row = false, onAddToCart, style }) {
  const router = useRouter();
  const images = Array.isArray(p.images) ? p.images : [];
  const rating = Number(p.averageRating || 0);
  const reviews = Number(p.reviewCount || 0);
  const sold = Number(p.soldCount || 0);
  const out = Number(p.stock) === 0;
  return (
    <View style={[styles.tileWrap, style]}>
      <Pressable
        onPress={p.slug ? () => router.push(`/product/${p.slug}`) : undefined}
        accessibilityRole="link"
        style={[
          styles.tile,
          big && { flexDirection: 'row', borderColor: alpha(accent, 0.35), backgroundColor: mix(accent, 0.06, '#fff') },
          row && styles.tileRow,
        ]}
      >
        <View style={[styles.tileImg, big && styles.tileImgBig, row && styles.tileImgRow]}>
          <ProductImage src={images[0] || null} />
          {big ? <Text style={[styles.badge, { backgroundColor: accent }]}>Top pick</Text> : null}
          {out ? <Text style={styles.out}>Sold out</Text> : null}
        </View>
        <View style={[styles.tileInfo, big && styles.tileInfoBig, row && styles.tileInfoRow]}>
          <Text style={[styles.tileName, big && styles.tileNameBig]} numberOfLines={big ? 3 : 2}>{p.name}</Text>
          <View style={styles.tileMeta}>
            {reviews > 0 ? (
              <>
                <StarIcon size={12} weight="fill" color="#f59e0b" />
                <Text style={styles.tileRating}>{rating.toFixed(1)}</Text>
              </>
            ) : <Text style={styles.tileNew}>New</Text>}
            {sold > 0 ? <Text style={styles.tileSold}>· {sold} sold</Text> : null}
          </View>
          <View style={styles.tilePriceRow}>
            <Text style={[styles.tilePrice, big && styles.tilePriceBig, { color: accent }]}>{peso(saleInfo(p).price)}</Text>
            <SaleWas product={p} compact />
          </View>
        </View>
      </Pressable>
      {onAddToCart && !out ? (
        <Pressable
          style={[styles.cart, { backgroundColor: accent }, row && styles.cartRow]}
          onPress={() => onAddToCart(p)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${p.name} to cart`}
        >
          <ShoppingCartIcon size={16} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

function GalleryItem({ img, style }) {
  return (
    <View style={[styles.galleryItem, style]}>
      <Image source={{ uri: resolveImg(img.url) }} style={styles.fill} resizeMode="cover" />
      {img.caption ? (
        <View style={styles.caption}>
          <ShopGradient angle={180} stops={[['rgba(0,0,0,0)', 0], ['rgba(0,0,0,0.6)', 1]]} />
          <Text style={styles.captionText}>{img.caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Gallery({ images, styleName, width }) {
  const key = (img, i) => `${img.url}-${i}`;
  // Height / width of the first photo (the mosaic's big tile).
  const [firstRatio, setFirstRatio] = useState(0);
  const firstUrl = images[0]?.url;
  useEffect(() => {
    if (styleName !== 'mosaic' || !firstUrl) return undefined;
    let live = true;
    Image.getSize(resolveImg(firstUrl), (w, h) => { if (live && w > 0) setFirstRatio(h / w); }, () => {});
    return () => { live = false; };
  }, [styleName, firstUrl]);
  if (styleName === 'strip') {
    const w = images.length === 1 ? width : width * 0.64;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + 10} decelerationRate="fast" contentContainerStyle={styles.carouselGap}>
        {images.map((img, i) => <GalleryItem key={key(img, i)} img={img} style={{ width: w, height: w * 0.75 }} />)}
      </ScrollView>
    );
  }
  const cell = (width - 12) / 3;
  if (styleName === 'mosaic') {
    if (images.length === 1) return <GalleryItem img={images[0]} style={{ width, height: width * 9 / 16 }} />;
    // Three columns; the first photo takes two by two.
    const spots = images.map((img, i) => {
      if (i === 0) return { col: 0, row: 0, span: 2 };
      if (i <= 2) return { col: 2, row: i - 1, span: 1 };
      const k = i - 3;
      return { col: k % 3, row: 2 + Math.floor(k / 3), span: 1 };
    });
    const rows = Math.max(...spots.map((sp) => sp.row + sp.span));
    // The website's grid has equal rows (grid-auto-rows: 1fr) and the first
    // photo keeps its own shape (aspect-ratio: auto), so a tall first photo
    // makes every row taller; the small squares sit at the top of theirs.
    const bigW = 2 * cell + 6;
    const rowH = firstRatio ? Math.max(cell, (bigW * firstRatio - 6) / 2) : cell;
    return (
      <View style={{ height: rows * rowH + (rows - 1) * 6 }}>
        {images.map((img, i) => {
          const sp = spots[i];
          const big = sp.span === 2;
          return (
            <GalleryItem
              key={key(img, i)}
              img={img}
              style={{ position: 'absolute', left: sp.col * (cell + 6), top: sp.row * (rowH + 6), width: big ? bigW : cell, height: big ? 2 * rowH + 6 : cell }}
            />
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.galleryGrid}>
      {images.map((img, i) => <GalleryItem key={key(img, i)} img={img} style={{ width: cell, height: cell }} />)}
    </View>
  );
}

function Message({ section: s, accent }) {
  const kind = s.style === 'quote' ? 'quote' : s.style === 'highlight' ? 'highlight' : 'card';
  const box = {
    card: { backgroundColor: mix(accent, 0.08, '#fff'), borderWidth: 1, borderColor: alpha(accent, 0.22) },
    highlight: {
      overflow: 'hidden',
      boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 24, color: alpha(accent, 0.3) }],
    },
    quote: {
      flexDirection: 'column', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 18,
      backgroundColor: '#fff', borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(accent, 0.45),
    },
  }[kind];
  const icon = {
    card: { backgroundColor: accent },
    highlight: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
    quote: { width: 'auto', height: 'auto' },
  }[kind];
  const strong = {
    card: { color: t.neutral[900] },
    highlight: { color: '#fff' },
    quote: { color: accent, fontSize: 13, lineHeight: 20.8, letterSpacing: 0.78, textTransform: 'uppercase', textAlign: 'center' },
  }[kind];
  const body = {
    card: { color: t.neutral[700] },
    highlight: { color: 'rgba(255, 255, 255, 0.92)' },
    quote: { color: t.neutral[800], fontSize: 16, lineHeight: 24.8, fontStyle: 'italic', textAlign: 'center' },
  }[kind];
  return (
    <View style={styles.sec}>
      <View style={[styles.msgBox, box]}>
        {kind === 'highlight' ? (
          <ShopGradient style={{ borderRadius: 18 }} angle={135} stops={[[accent, 0], [mix(accent, 0.7, '#000'), 1]]} />
        ) : null}
        <View style={[styles.msgIcon, icon]}>
          {kind === 'quote'
            ? <QuotesIcon size={26} weight="fill" color={accent} />
            : <StorefrontIcon size={20} weight="fill" color="#fff" />}
        </View>
        <View style={[styles.msgText, kind === 'quote' && { alignItems: 'center' }]}>
          {s.title ? <Text style={[styles.msgTitle, strong]}>{s.title}</Text> : null}
          <Text style={[styles.msgBody, body]}>{s.body}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  home: { width: '100%', gap: 22, paddingTop: 4, paddingBottom: 12 },
  sec: { gap: 10, minWidth: 0 },
  titleWrap: { paddingHorizontal: 2 },
  title: { fontSize: 17, lineHeight: 19.55, ...font(500), color: t.neutral[900], letterSpacing: -0.17 },
  titleBar: { width: 28, height: 3, marginTop: 6, borderRadius: 3 },
  fill: { width: '100%', height: '100%' },
  photo: { overflow: 'hidden' },
  bleed: { overflow: 'visible' },

  slider: { position: 'relative', borderRadius: 18, overflow: 'hidden' },
  dots: { position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: {
    width: 7, height: 7, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.6)',
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: 'rgba(0, 0, 0, 0.08)' }],
  },
  dotOn: { width: 20, backgroundColor: '#fff' },

  wideList: { gap: 10 },
  wideItem: { width: '100%', borderRadius: 14, backgroundColor: t.neutral[100] },
  cardsTrack: { gap: 10, paddingBottom: 8 },
  bannerCard: {
    borderRadius: 18, backgroundColor: t.neutral[100],
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 18, color: 'rgba(15, 23, 42, 0.12)' }],
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rowList: { gap: 8 },
  carousel: { gap: 10, paddingBottom: 6 },
  carouselGap: { gap: 10 },

  tileWrap: { position: 'relative', minWidth: 0 },
  tile: {
    flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: '#fff',
  },
  tileRow: { flexDirection: 'row', alignItems: 'center' },
  tileImg: { position: 'relative', width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  tileImgBig: { width: '52%' },
  tileImgRow: { width: 84, height: 84, aspectRatio: undefined },
  badge: {
    position: 'absolute', top: 8, left: 8, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden',
    color: '#fff', fontSize: 11, lineHeight: 17.6, ...font(500),
  },
  out: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 4, backgroundColor: 'rgba(17, 24, 39, 0.7)',
    color: '#fff', fontSize: 11, lineHeight: 17.6, ...font(400), textAlign: 'center',
  },
  tileInfo: { gap: 3, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  tileInfoBig: { flex: 1, justifyContent: 'center', padding: 14, gap: 6 },
  tileInfoRow: { flex: 1, paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 52 },
  tileName: { fontSize: 13.5, lineHeight: 17.55, ...font(500), color: t.neutral[900] },
  tileNameBig: { fontSize: 16, lineHeight: 20.8 },
  tileMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileRating: { fontSize: 12, lineHeight: 19.2, ...font(500), color: '#f59e0b' },
  tileNew: { fontSize: 12, lineHeight: 19.2, ...font(500), color: t.neutral[500] },
  tileSold: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  tilePriceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  tilePrice: { fontSize: 15, lineHeight: 24, ...font(500) },
  tilePriceBig: { fontSize: 19, lineHeight: 30.4 },
  cart: {
    position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 10, color: 'rgba(15, 23, 42, 0.18)' }],
  },
  cartRow: { top: '50%', bottom: undefined, marginTop: -16 },

  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  galleryItem: { position: 'relative', overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[100] },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 18, paddingHorizontal: 10, paddingBottom: 8 },
  captionText: { color: '#fff', fontSize: 12, lineHeight: 19.2, ...font(500) },

  msgBox: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 18 },
  msgIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  msgText: { flex: 1, gap: 4, minWidth: 0 },
  msgTitle: { fontSize: 15.5, lineHeight: 24.8, ...font(500) },
  msgBody: { fontSize: 14, lineHeight: 21.7, ...font(400) },
});
