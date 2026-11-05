import { useMemo, useState } from 'react';
import {
  Animated, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Image as Photo } from 'expo-image';
import Svg, { Line } from 'react-native-svg';
import { CheckIcon } from '../../lib/icons';
import { sizedImg } from '../../lib/media';
import HomeCategoryIcon from '../home/HomeCategoryIcon';
import { font, themed } from '../../theme';
import { CssGradient } from './SellPhone';
import { useLoop } from './motion';

/*
 * The pictures of web/src/pages/Sell.jsx's "why" rows and its moving
 * ribbon (Sell.css, phone width): a receipt whose point is the fee line,
 * the barangays a shop delivers to, a buyer's chat, and the live
 * categories running past in two rows.
 *
 * c: the page's colours (app/sell/index.js), read where they are used.
 */

/* A 2px dashed rule, as the receipt's `border: 2px dashed`. */
function Dash({ color }) {
  return (
    <Svg height={2} width="100%">
      <Line x1="0" y1="1" x2="100%" y2="1" stroke={color} strokeWidth={2} strokeDasharray="6 4" />
    </Svg>
  );
}

/* A receipt, the fee line the point of it. */
export function Receipt({ c }) {
  return (
    <View style={[styles.receipt, { backgroundColor: c.card }]}>
      <View style={[styles.receiptRow, styles.receiptHead]}>
        <Text style={[styles.receiptText, styles.receiptHeadText, { color: c.ink }]}>Order #EM-2417</Text>
        <Text style={[styles.receiptPaid, { color: c.green }]}>Paid to you</Text>
      </View>
      <Dash color={c.line} />
      <View style={[styles.receiptRow, styles.receiptFirst]}>
        <Text style={[styles.receiptText, { color: c.ink }]}>Bibingka × 4</Text>
        <Text style={[styles.receiptText, { color: c.ink }]}>₱240.00</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={[styles.receiptText, { color: c.ink }]}>Delivery · Calapan</Text>
        <Text style={[styles.receiptText, { color: c.ink }]}>₱30.00</Text>
      </View>
      <View style={[styles.receiptRow, styles.receiptLast]}>
        <Text style={[styles.receiptText, styles.receiptBold, { color: c.pink }]}>Emoorm fee</Text>
        <Text style={[styles.receiptText, styles.receiptBold, { color: c.pink }]}>₱0.00</Text>
      </View>
      <Dash color={c.line} />
      <View style={[styles.receiptRow, styles.receiptTotal]}>
        <Text style={[styles.receiptTotalText, { color: c.green }]}>You receive</Text>
        <Text style={[styles.receiptTotalText, { color: c.green }]}>₱270.00</Text>
      </View>
    </View>
  );
}

const BARANGAYS = [
  ['Calapan', true], ['Baco', true], ['Naujan', false], ['Victoria', true],
  ['Socorro', false], ['Pola', true], ['Pinamalayan', false], ['Gloria', false],
];

/* Barangays, some served, and pickup switched on. */
export function Areas({ c }) {
  return (
    <View style={styles.areas}>
      {BARANGAYS.map(([name, on]) => (
        <View
          key={name}
          style={[styles.area, { borderColor: c.line, backgroundColor: c.card }, on && { borderColor: c.green, backgroundColor: c.green }]}
        >
          {on ? <CheckIcon size={14} weight="bold" color="#ffffff" /> : null}
          <Text style={[styles.areaText, { color: on ? '#ffffff' : c.muted }]}>{name}</Text>
        </View>
      ))}
      <View style={[styles.area, styles.pickup, { borderColor: c.line, backgroundColor: c.card }]}>
        <View style={[styles.toggle, { backgroundColor: c.pink }]}><View style={styles.knob} /></View>
        <Text style={[styles.areaText, { color: c.ink }]}>Pickup at my stall</Text>
      </View>
    </View>
  );
}

/* A buyer's chat, in the language buyers write. */
export function Chat({ c }) {
  return (
    <View style={styles.chat}>
      <View style={[styles.bubble, styles.bubbleIn, { backgroundColor: c.card }]}>
        <Text style={[styles.bubbleText, { color: c.ink }]}>Pwede pa-reserve ng 2 bilao na biko para bukas?</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleOut, { backgroundColor: c.green }]}>
        <Text style={[styles.bubbleText, { color: '#ffffff' }]}>Opo! Ready po by 3pm. Pickup or deliver?</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleIn, { backgroundColor: c.card }]}>
        <Text style={[styles.bubbleText, { color: c.ink }]}>Deliver po, Brgy. Lazareto 🙏</Text>
      </View>
    </View>
  );
}

function RibbonItem({ cat, c, onPress, hidden }) {
  const uri = cat.image ? sizedImg(cat.image, 40) : null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={cat.name}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      onPress={() => onPress(cat)}
      style={({ pressed }) => [styles.item, { borderColor: pressed ? c.green : c.line, backgroundColor: c.card }]}
    >
      <View style={[styles.itemArt, { backgroundColor: c.tint }]}>
        {uri
          ? <Photo source={{ uri }} style={styles.itemImg} contentFit="cover" cachePolicy="memory-disk" />
          : <HomeCategoryIcon category={cat} size={26} />}
      </View>
      <Text style={[styles.itemText, { color: c.ink }]} numberOfLines={1}>{cat.name}</Text>
    </Pressable>
  );
}

const GAP = 14;

function RibbonRow({
  items, c, onPress, reverse, duration, running,
}) {
  const { width: winW } = useWindowDimensions();
  // One copy's run, gap included: moving by it lands on the second copy.
  const [run, setRun] = useState(0);
  const clock = useLoop(duration, { running: running && run > 0 });
  const slide = useMemo(() => (clock && run ? {
    transform: [{
      translateX: clock.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-run, 0] : [0, -run] }),
    }],
  } : null), [clock, run, reverse]);
  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.track, slide]}
        onLayout={(e) => setRun((e.nativeEvent.layout.width + GAP) / 2)}
      >
        {[...items, ...items].map((cat, i) => (
          <RibbonItem
            key={`${cat.id || cat.name}-${i}`}
            cat={cat}
            c={c}
            onPress={onPress}
            hidden={i >= items.length}
          />
        ))}
      </Animated.View>
      {/* mask-image: the row fades out at both ends. */}
      <CssGradient
        width={winW}
        height={56}
        angle={90}
        stops={[[0, c.page, 1], [0.06, c.page, 0], [0.94, c.page, 0], [1, c.page, 1]]}
      />
    </View>
  );
}

/**
 * The live categories, moving: two rows running opposite ways (60s and
 * 70s a lap). With reduced motion, one still, wrapped list.
 */
export function Ribbon({
  categories, c, onPress, running, still,
}) {
  // Enough items to run past the screen's edge: repeated.
  const ribbon = useMemo(() => (categories.length
    ? Array.from({ length: Math.ceil(12 / categories.length) }, () => categories).flat()
    : []), [categories]);
  if (!ribbon.length) return null;
  if (still) {
    return (
      <View style={styles.still}>
        {categories.map((cat) => <RibbonItem key={cat.id || cat.name} cat={cat} c={c} onPress={onPress} />)}
      </View>
    );
  }
  return (
    <View style={styles.ribbon} accessibilityLabel="Categories you can sell in">
      <RibbonRow items={ribbon} c={c} onPress={onPress} duration={60000} running={running} />
      <RibbonRow items={ribbon} c={c} onPress={onPress} duration={70000} running={running} reverse />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  receipt: {
    width: '100%',
    maxWidth: 340,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderRadius: 6,
    boxShadow: [{
      offsetX: 0, offsetY: 18, blurRadius: 40, color: 'rgba(15, 23, 42, 0.12)',
    }],
    transform: [{ rotate: '-2deg' }],
  },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  receiptHead: { paddingTop: 9, paddingBottom: 14 },
  receiptFirst: { marginTop: 6 },
  receiptLast: { marginBottom: 8 },
  receiptText: { fontSize: 15, lineHeight: 24, ...font(400) },
  receiptHeadText: { ...font(700) },
  receiptPaid: { fontSize: 13, lineHeight: 20.8, ...font(600) },
  receiptBold: { ...font(700) },
  receiptTotal: { paddingTop: 14 },
  receiptTotalText: { fontSize: 19, lineHeight: 30.4, ...font(700) },

  areas: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: 400,
  },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  areaText: { fontSize: 14, lineHeight: 22.4, ...font(500) },
  pickup: {
    width: '100%', justifyContent: 'center', marginTop: 8, borderStyle: 'dashed',
  },
  toggle: { width: 34, height: 20, borderRadius: 999 },
  knob: {
    position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#ffffff',
  },

  chat: { width: '100%', maxWidth: 360, gap: 10 },
  bubble: {
    maxWidth: '82%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20,
  },
  bubbleIn: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 6,
    boxShadow: [{
      offsetX: 0, offsetY: 4, blurRadius: 14, color: 'rgba(15, 23, 42, 0.08)',
    }],
  },
  bubbleOut: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21.75, ...font(400) },

  ribbon: { gap: 16 },
  row: { flexDirection: 'row', overflow: 'hidden' },
  track: { flexDirection: 'row', flexShrink: 0, gap: GAP },
  still: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 18,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  itemArt: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  itemImg: { width: '100%', height: '100%' },
  itemText: {
    fontSize: 17, lineHeight: 27.2, letterSpacing: -0.17, ...font(600),
  },
}));

