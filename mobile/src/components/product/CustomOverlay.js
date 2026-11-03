import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { font } from '../../theme';
import { resolveImg } from '../../lib/media';
import { brandColor, inkOn, initialsOf } from '../../lib/imageOverlays';
import { layersOf, rgba, textOf } from '../../lib/photoDesign';

/**
 * A shop's own design over a photo (inside ImageOverlay's measured box): its
 * pieces drawn in order, the last on top. Each is centred on x, y (% of the
 * box), sized in u (1% of the box's shorter side), turned and faded.
 * Mirrors web/src/components/product/CustomOverlay.
 *
 * Centring without measuring: each piece sits in the middle of its own
 * stage, a square twice the box's longer side whose centre is the piece's
 * point. Yoga centres a child bigger than its parent too, and text still
 * has room to lay out on one line (a 0×0 holder would squeeze it to
 * nothing). The box clips what spills over.
 */
export default function CustomOverlay({ layers, store, box }) {
  const list = layersOf(layers);
  if (!box || !list.length) return null;
  const u = Math.min(box.width, box.height) / 100;
  const stage = 2 * Math.max(box.width, box.height);
  return list.map((l) => (
    <View
      key={l.id}
      pointerEvents="none"
      style={{
        position: 'absolute', left: (l.x / 100) * box.width - stage / 2, top: (l.y / 100) * box.height - stage / 2,
        width: stage, height: stage, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Piece layer={l} store={store} box={box} u={u} />
    </View>
  ));
}

// The web's drop-shadow(0 0.8u 1.6u rgba(0, 0, 0, 0.35)): Android draws it
// with a filter (Android 12 and up), iOS from the piece's own shape.
const dropShadow = (u) => (Platform.OS === 'android'
  ? { filter: [{ dropShadow: { offsetX: 0, offsetY: 0.8 * u, standardDeviation: 1.6 * u, color: 'rgba(0, 0, 0, 0.35)' } }] }
  : { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 1.6 * u, shadowOffset: { width: 0, height: 0.8 * u } });

function Piece({ layer: l, store, box, u }) {
  let body = null;

  if (l.type === 'text') {
    const size = l.size * u;
    body = (
      <View
        style={l.bg ? {
          backgroundColor: rgba(l.bg, l.bgOpacity ?? 1), paddingVertical: size * 0.28, paddingHorizontal: size * 0.55, borderRadius: l.radius * u,
        } : null}
      >
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={{
            maxWidth: box.width * 0.96, color: l.color, fontSize: size, lineHeight: size * 1.2, ...font(l.weight),
            textTransform: l.upper ? 'uppercase' : 'none',
            ...(l.shadow ? { textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowRadius: 1.4 * u, textShadowOffset: { width: 0, height: 0.4 * u } } : null),
          }}
        >
          {textOf(l, store)}
        </Text>
      </View>
    );
  } else if (l.type === 'logo') {
    const s = l.size * u;
    const brand = brandColor(store);
    const logo = store?.logo ? resolveImg(store.logo) : null;
    const radius = l.frame === 'circle' ? s / 2 : l.frame === 'rounded' ? s * 0.22 : 0;
    // The shadow outside the clip: iOS draws none on a clipped view.
    body = (
      <View style={[{ width: s, height: s }, l.shadow && dropShadow(u)]}>
        <View
          style={{
            width: s, height: s, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
            backgroundColor: logo ? (l.frame === 'none' ? 'transparent' : '#ffffff') : brand,
          }}
        >
          {logo ? (
            <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit={l.frame === 'none' ? 'contain' : 'cover'} />
          ) : (
            <Text allowFontScaling={false} style={{ color: inkOn(brand), fontSize: s * 0.4, letterSpacing: -0.008 * s, ...font(800) }}>
              {initialsOf(store?.name)}
            </Text>
          )}
          {/* The ring over the logo, as the web's border lies over its background. */}
          {l.ring && l.ringW ? (
            <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: l.ringW * u, borderColor: l.ring }]} />
          ) : null}
        </View>
      </View>
    );
  } else if (l.type === 'shape') {
    const circle = l.kind === 'circle';
    const width = l.span === 'x' && !circle ? box.width : l.w * u;
    const height = circle ? l.w * u : l.span === 'y' ? box.height : l.h * u;
    body = (
      <View
        style={[
          { width, height, backgroundColor: l.color || 'transparent', borderRadius: circle ? width / 2 : l.radius * u },
          l.border && l.borderW ? { borderWidth: l.borderW * u, borderColor: l.border } : null,
          l.shadow && dropShadow(u),
        ]}
      />
    );
  } else if (l.type === 'image') {
    const w = l.w * u;
    const h = w / (l.ar || 1);
    const src = l.url ? resolveImg(l.url) || l.url : null;
    body = (
      <View style={[{ width: w, height: h }, l.shadow && dropShadow(u)]}>
        {src ? <Image source={{ uri: src }} style={{ width: w, height: h, borderRadius: l.radius * u }} contentFit="contain" /> : null}
      </View>
    );
  }
  if (!body) return null;
  return (
    <View style={{ opacity: l.opacity ?? 1, transform: [{ rotate: `${l.rotate || 0}deg` }] }}>
      {body}
    </View>
  );
}
