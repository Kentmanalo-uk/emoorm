import { useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CubeIcon } from '../../lib/icons';
import { resolveImg } from '../../lib/media';
import { toast } from '../../lib/toast';
import { font, ink, t, themed, veil } from '../../theme';
import { SheetFrame } from '../Sheet';
import Model3dView from './Model3dView';
import { STAGE_BG } from './model3dHtml';

/*
 * The product page's 3D view (web components/model3d/Product3dSheet.jsx), in
 * the app's sheet: the model to turn round and pinch closer and, where the
 * phone can do AR, "View in your space" at its real size: Android opens
 * Google's Scene Viewer with the GLB, iPhone opens the USDZ in AR Quick Look
 * (through Safari). An iPhone with no USDZ for it gets the spin only.
 * Mounted while open; onClose runs after it has slid away.
 */

// Made in the seller's browser from the shop's own photos or video (not a preset shape).
const isGenerated = (model) => model?.source === 'generated' || model?.shape === 'scan';

// The size, short: its height (a box's and a pouch's faces in full).
const sizeLine = (model) => {
  const d = model?.dims || {};
  if (isGenerated(model)) return d.heightCm ? `${d.heightCm} cm` : '';
  if (model?.shape === 'box') return `${d.width} × ${d.height} × ${d.depth} cm`;
  if (model?.shape === 'pouch') return `${d.width} × ${d.height} cm`;
  return d.height ? `${d.height} cm` : '';
};

// The same, in words, for screen readers.
const sizeWords = (model) => {
  const d = model?.dims || {};
  if (isGenerated(model)) return [d.heightCm && `${d.heightCm} cm tall`, d.widthCm && `${d.widthCm} cm wide`].filter(Boolean).join(', ');
  return sizeLine(model);
};

/** The website's cube (ProductDetails.jsx CubeMark), for the 3D chip and the AR button. */
export function CubeMark({ size = 17, color = t.neutral[900], strokeWidth = 2.2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.5 3.5 7.2v9.6l8.5 4.7 8.5-4.7V7.2z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M3.5 7.2 12 12l8.5-4.8M12 12v9.5" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

/** The product page's "3D" chip over the gallery (.pdp-3d-chip). */
export function Product3dChip({ onPress, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="See it in 3D"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, style]}
    >
      <CubeMark />
      <Text style={styles.chipText}>3D</Text>
    </Pressable>
  );
}

// Scene Viewer at the model's real size (the website's ar-scale="fixed").
const sceneViewerUrl = (glb, title) => {
  const q = [
    `file=${encodeURIComponent(glb)}`,
    'mode=ar_preferred',
    'resizable=false',
    title ? `title=${encodeURIComponent(title)}` : '',
  ].filter(Boolean).join('&');
  return `https://arvr.google.com/scene-viewer/1.0?${q}`;
};

export default function Product3dSheet({ model, name, onClose }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const closed = useRef(false);

  const glb = resolveImg(model.glbUrl);
  const usdz = model.usdzUrl ? resolveImg(model.usdzUrl) : null;
  const poster = model.posterUrl ? resolveImg(model.posterUrl) : null;
  const ar = Platform.OS === 'android' ? !!glb : Platform.OS === 'ios' ? !!usdz : false;
  const stageH = Math.round(Math.min(screenH * 0.6, screenW * 1.25));

  const close = () => {
    setOpen(false);
    setTimeout(() => {
      if (closed.current) return;
      closed.current = true;
      onClose();
    }, 300);
  };

  const viewInSpace = () => {
    // Quick Look opens a USDZ at its real size when told not to scale it.
    const url = Platform.OS === 'ios' ? `${usdz}#allowsContentScaling=0` : sceneViewerUrl(glb, name);
    Linking.openURL(url).catch(() => toast.error("Couldn't open View in your space."));
  };

  const generated = isGenerated(model);
  const size = sizeLine(model);

  return (
    <SheetFrame
      open={open}
      onClose={close}
      title={null}
      scroll={false}
      padded={false}
      safeBottom={false}
      maxHeight={0.94}
    >
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={2} accessibilityRole="header">{name}</Text>
        <View
          style={styles.sub}
          accessible
          accessibilityLabel={`3D model, ${sizeWords(model)}${generated ? ", made from the shop's own photos or video of it" : ''}`}
        >
          <Text style={styles.subText}>{['3D', size].filter(Boolean).join(' · ')}</Text>
          {generated ? <Text style={styles.tag}>From the real item</Text> : null}
        </View>
      </View>

      <View style={[styles.stage, { height: stageH }]}>
        {glb ? (
          <Model3dView
            src={glb}
            poster={poster}
            alt={`3D view of ${name}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : null}
        {failed || !glb ? (
          <View style={[StyleSheet.absoluteFill, styles.state]} pointerEvents="none">
            <CubeIcon size={30} color={t.neutral[500]} />
            <Text style={styles.stateText}>Couldn&apos;t load 3D.</Text>
          </View>
        ) : !loaded && !poster ? (
          <View style={[StyleSheet.absoluteFill, styles.state]} pointerEvents="none" accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={t.neutral[500]} />
            <Text style={styles.stateText}>Loading 3D…</Text>
          </View>
        ) : null}
        {ar && loaded && !failed ? (
          <View style={styles.arRow} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              onPress={viewInSpace}
              style={({ pressed }) => [styles.arBtn, pressed && styles.arBtnPressed]}
            >
              <CubeMark size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.arText}>View in your space</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Text style={[styles.hint, { paddingBottom: Math.max(16, 12 + insets.bottom) }]}>Drag to turn</Text>
    </SheetFrame>
  );
}

const styles = themed(() => StyleSheet.create({
  // .pdp-3d-chip
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingLeft: 12, paddingRight: 14,
    borderWidth: 1, borderColor: ink(0.08), borderRadius: 999, backgroundColor: veil(0.94),
    shadowColor: ink(1), shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  chipPressed: { backgroundColor: t.neutral[0] },
  chipText: { fontSize: 14, lineHeight: 18, ...font(600), color: t.neutral[900], letterSpacing: 0.28 },

  // .p3d-head
  head: { gap: 2, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 12 },
  name: { fontSize: 17, lineHeight: 22, ...font(500), color: t.neutral[900] },
  sub: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  subText: { fontSize: 13.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  tag: {
    paddingVertical: 1, paddingHorizontal: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: t.neutral[100],
    fontSize: 11.5, lineHeight: 16, ...font(500), color: t.neutral[600],
  },

  stage: { position: 'relative', backgroundColor: STAGE_BG },
  state: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  stateText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[500] },

  // .m3d-ar-btn
  arRow: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' },
  arBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 46, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.primary[600],
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  arBtnPressed: { backgroundColor: t.primary[700] },
  arText: { fontSize: 15.5, lineHeight: 20, ...font(500), color: t.onBrand },

  // .p3d-hint
  hint: { paddingTop: 8, paddingHorizontal: 20, fontSize: 12, lineHeight: 16.8, ...font(400), color: t.neutral[400], textAlign: 'center' },
}));
