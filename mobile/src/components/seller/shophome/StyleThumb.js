import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { t } from '../../../theme';

/*
 * Small drawings of each section style, 60 × 40 (web SellerShopHome.jsx
 * StyleThumb + SellerShopHome.css .shb-thumb-*), so a seller sees the layout
 * before picking it.
 */
const THUMBS = {
  'banner:slider': [[4, 6, 52, 24, 'img'], [24, 33, 4, 2, 'dot'], [30, 33, 4, 2, 'dot2'], [36, 33, 4, 2, 'dot2']],
  'banner:wide': [[2, 3, 56, 16, 'img'], [2, 21, 56, 16, 'img2']],
  'banner:cards': [[3, 6, 40, 26, 'img'], [46, 6, 40, 26, 'img2']],
  'spotlight:grid': [[6, 3, 23, 16, 'img'], [31, 3, 23, 16, 'img'], [6, 21, 23, 16, 'img2'], [31, 21, 23, 16, 'img2']],
  'spotlight:carousel': [[3, 8, 18, 24, 'img'], [23, 8, 18, 24, 'img'], [43, 8, 18, 24, 'img2']],
  'spotlight:hero': [[4, 3, 52, 18, 'img'], [4, 23, 25, 14, 'img2'], [31, 23, 25, 14, 'img2']],
  'spotlight:list': [[4, 4, 10, 9, 'img'], [17, 7, 36, 3, 'line'], [4, 16, 10, 9, 'img'], [17, 19, 36, 3, 'line'], [4, 28, 10, 9, 'img'], [17, 31, 36, 3, 'line']],
  'gallery:grid': [[4, 4, 16, 15, 'img'], [22, 4, 16, 15, 'img2'], [40, 4, 16, 15, 'img'], [4, 21, 16, 15, 'img2'], [22, 21, 16, 15, 'img'], [40, 21, 16, 15, 'img2']],
  'gallery:mosaic': [[4, 4, 34, 32, 'img'], [40, 4, 16, 15, 'img2'], [40, 21, 16, 15, 'img2']],
  'gallery:strip': [[3, 8, 30, 24, 'img'], [35, 8, 30, 24, 'img2']],
  'message:card': [[4, 6, 52, 28, 'soft'], [9, 12, 9, 9, 'fill'], [21, 13, 28, 3, 'line'], [21, 19, 22, 3, 'line']],
  'message:highlight': [[4, 6, 52, 28, 'fill'], [10, 14, 30, 3, 'white'], [10, 20, 22, 3, 'white']],
  'message:quote': [[4, 6, 52, 28, 'dash'], [27, 10, 6, 5, 'fill'], [14, 19, 32, 3, 'line'], [18, 25, 24, 3, 'line']],
};

// .shb-thumb-<kind> fills and strokes.
const PAINT = {
  img: { fill: t.primary[200] },
  img2: { fill: t.primary[100] },
  dot: { fill: t.primary[600] },
  dot2: { fill: t.primary[200] },
  line: { fill: '#cbd5e1' },
  white: { fill: 'rgba(255, 255, 255, 0.85)' },
  fill: { fill: t.primary[600] },
  soft: { fill: t.primary[50], stroke: t.primary[200], strokeWidth: 0.8 },
  dash: { fill: '#fff', stroke: t.primary[400], strokeWidth: 0.8, strokeDasharray: '2 1.5' },
};

export default function StyleThumb({ kind, styleKey, on = false }) {
  const boxes = THUMBS[`${kind}:${styleKey}`] || [];
  return (
    <View style={[styles.thumb, on && styles.thumbOn]}>
      <Svg width="100%" height="100%" viewBox="0 0 60 40">
        {boxes.map(([x, y, w, h, k], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} rx={k === 'line' || k === 'white' ? 1.5 : 3} {...PAINT[k]} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', aspectRatio: 60 / 40, overflow: 'hidden', borderRadius: 8, backgroundColor: t.neutral[50] },
  thumbOn: { backgroundColor: '#fff' },
});
