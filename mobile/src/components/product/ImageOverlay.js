import { useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { font } from '../../theme';
import { resolveImg } from '../../lib/media';
import {
  brandColor, inkOn, initialsOf, overlayOf,
} from '../../lib/imageOverlays';

/**
 * A shop's branding drawn over a product photo: the design the seller chose
 * for the product (`product.imageOverlay`), from the shop's logo, name and
 * colour. Nothing when the product has none. The photo is untouched; this
 * fills its parent over it and lets every touch through. Sizes are shares of
 * the photo's shorter side (u = 1%), so a design looks the same on a small
 * card and on the product page. Mirrors web/src/components/product/ImageOverlay.
 *
 * `design` overrides the product's own (the seller's preview).
 */
export default function ImageOverlay({ product, store = product?.store, design }) {
  const key = design === undefined ? overlayOf(product) : design;
  const [box, setBox] = useState(null);
  if (!key || !store) return null;

  const onLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || box.width !== width || box.height !== height) setBox({ width, height });
  };

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none" onLayout={onLayout} accessible={false}>
      {box ? <Design design={key} store={store} box={box} /> : null}
    </View>
  );
}

function Design({ design, store, box }) {
  // Each band its own gradient: two shops' colours on one screen.
  const gradient = `iov-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const u = Math.min(box.width, box.height) / 100;
  const name = store.name || '';
  const color = brandColor(store);
  const ink = inkOn(color);
  const logo = store.logo ? resolveImg(store.logo) : null;
  const nameSize = Math.min(26, Math.max(7, 4.6 * u));
  const nameStyle = (extra) => [{ fontSize: nameSize, lineHeight: nameSize * 1.2, ...font(700) }, extra];

  const mark = (size, extra) => (logo ? (
    <Image source={{ uri: logo }} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff' }, extra]} contentFit="cover" />
  ) : (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }, extra]}>
      <Text style={{ color: ink, fontSize: size * 0.4, ...font(800) }}>{initialsOf(name)}</Text>
    </View>
  ));
  const chip = (textColor) => (
    <>
      {mark(9 * u)}
      <Text style={nameStyle({ color: textColor, flexShrink: 1 })} numberOfLines={1}>{name}</Text>
    </>
  );
  const shadow = (blur) => ({
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: blur, shadowOffset: { width: 0, height: blur / 3 }, elevation: 3,
  });

  switch (design) {
    case 'logo-corner':
      return mark(19 * u, { position: 'absolute', left: 4 * u, bottom: 4 * u, borderWidth: u, borderColor: '#fff', ...shadow(3 * u) });

    case 'logo-watermark':
      return logo ? (
        <Image source={{ uri: logo }} style={{ position: 'absolute', right: 5 * u, bottom: 5 * u, width: 30 * u, height: 30 * u, opacity: 0.55 }} contentFit="contain" />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            position: 'absolute', right: 5 * u, bottom: 4 * u, maxWidth: '80%', color: '#fff', opacity: 0.7, fontSize: 9 * u, ...font(800),
            textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 2 * u, textShadowOffset: { width: 0, height: 0.5 * u },
          }}
        >
          {name}
        </Text>
      );

    case 'name-pill':
      return (
        <View
          style={{
            position: 'absolute', left: 4 * u, bottom: 4 * u, maxWidth: box.width - 8 * u, flexDirection: 'row', alignItems: 'center', gap: 2.4 * u,
            paddingVertical: 1.4 * u, paddingLeft: 1.4 * u, paddingRight: 3.6 * u, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.62)',
          }}
        >
          {chip('#fff')}
        </View>
      );

    case 'brand-bar':
      return (
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.4 * u,
            paddingVertical: 2.4 * u, paddingHorizontal: 4 * u, backgroundColor: color,
          }}
        >
          {chip(ink)}
        </View>
      );

    case 'frame':
      return (
        <View style={[StyleSheet.absoluteFill, { borderWidth: 2.6 * u, borderColor: color, alignItems: 'center', justifyContent: 'flex-end' }]}>
          <View
            style={{
              maxWidth: '76%', paddingTop: 1.6 * u, paddingBottom: u, paddingHorizontal: 4.5 * u, backgroundColor: color,
              borderTopLeftRadius: 2.6 * u, borderTopRightRadius: 2.6 * u, marginBottom: -2.6 * u,
            }}
          >
            <Text style={nameStyle({ color: ink })} numberOfLines={1}>{name}</Text>
          </View>
        </View>
      );

    case 'ribbon':
      return (
        <View
          style={{
            position: 'absolute', top: 11 * u, right: -17 * u, width: 70 * u, paddingVertical: 1.6 * u, paddingHorizontal: 12 * u,
            backgroundColor: color, alignItems: 'center', transform: [{ rotate: '45deg' }], ...shadow(2 * u),
          }}
        >
          <Text style={nameStyle({ color: ink, fontSize: Math.min(22, Math.max(7, 4 * u)) })} numberOfLines={1}>{name}</Text>
        </View>
      );

    case 'top-band':
      return (
        <>
          <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={box.width} height={30 * u}>
            <Defs>
              <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.92} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={box.width} height={30 * u} fill={`url(#${gradient})`} />
          </Svg>
          <View style={{ position: 'absolute', top: 3.6 * u, left: 4 * u, maxWidth: box.width - 8 * u, flexDirection: 'row', alignItems: 'center', gap: 2.4 * u }}>
            {chip(ink)}
          </View>
        </>
      );

    case 'label-strip':
      return (
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 2.4 * u,
            paddingVertical: 2.2 * u, paddingHorizontal: 4 * u, borderLeftWidth: 2.4 * u, borderLeftColor: color, backgroundColor: 'rgba(255,255,255,0.94)',
          }}
        >
          {mark(9 * u)}
          <View style={{ flexShrink: 1 }}>
            <Text style={nameStyle({ color: '#111827' })} numberOfLines={1}>{name}</Text>
            <Text style={{ color: '#6b7280', fontSize: Math.min(16, Math.max(6, 3 * u)), ...font(500) }} numberOfLines={1}>Shop on Emoorm</Text>
          </View>
        </View>
      );

    case 'hang-tag':
      return (
        <View
          style={{
            position: 'absolute', top: 5 * u, left: 4 * u, maxWidth: '70%', flexDirection: 'row', alignItems: 'center',
            paddingVertical: 1.6 * u, paddingLeft: 6.6 * u, paddingRight: 3.6 * u, backgroundColor: color,
            borderTopLeftRadius: 1.2 * u, borderBottomLeftRadius: 1.2 * u, borderTopRightRadius: 2.4 * u, borderBottomRightRadius: 2.4 * u,
            transform: [{ rotate: '-6deg' }], ...shadow(2.4 * u),
          }}
        >
          <View style={{ position: 'absolute', left: 2.2 * u, width: 2.4 * u, height: 2.4 * u, borderRadius: 1.2 * u, backgroundColor: '#fff' }} />
          <Text style={nameStyle({ color: ink, flexShrink: 1 })} numberOfLines={1}>{name}</Text>
        </View>
      );

    case 'seal':
      return (
        <View
          style={{
            position: 'absolute', top: 4 * u, right: 4 * u, width: 23 * u, height: 23 * u, borderRadius: 11.5 * u,
            backgroundColor: color, alignItems: 'center', justifyContent: 'center', ...shadow(3 * u),
          }}
        >
          <View
            style={{
              position: 'absolute', top: 1.5 * u, left: 1.5 * u, right: 1.5 * u, bottom: 1.5 * u, borderRadius: 10 * u,
              borderWidth: Math.max(1, 0.6 * u), borderStyle: 'dashed', borderColor: ink, opacity: 0.75,
            }}
          />
          {logo ? mark(14 * u) : <Text style={{ color: ink, fontSize: 6 * u, ...font(800) }}>{initialsOf(name)}</Text>}
        </View>
      );

    default:
      return null;
  }
}
