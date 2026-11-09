import { memo, useId, useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import Svg, {
  Defs, FeGaussianBlur, Filter, LinearGradient, Path, Stop,
} from 'react-native-svg';
import { CaretLeftIcon, MagnifyingGlassIcon, XIcon } from '../../lib/icons';
import { font, t, themed } from '../../theme';
import ShellPageMenu from '../ShellPageMenu';
import WhiteMark from '../sell/WhiteMark';
import { plgColors } from './plgTheme';

/**
 * The search at the top of the band: searches the palengke only (the page
 * sends it with badge=PALENGKE). Mounted again (key) when the address's
 * search changes, so Back or a cleared search shows what is searched.
 */
function BandSearch({ q, onSearch, go }) {
  const [text, setText] = useState(q);
  const submit = () => onSearch(text.trim());
  return (
    <View style={styles.search} accessibilityRole="search">
      <MagnifyingGlassIcon size={18} weight="bold" color={t.neutral[500]} />
      <TextInput
        value={text}
        maxLength={100}
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder="Hanapin sa Palengke"
        placeholderTextColor={t.neutral[500]}
        accessibilityLabel="Search the palengke"
        returnKeyType="search"
        enterKeyHint="search"
        autoCorrect={false}
        style={styles.input}
      />
      {text ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear the search"
          hitSlop={6}
          onPress={() => { setText(''); if (q) onSearch(''); }}
          style={styles.clear}
        >
          <XIcon size={13} weight="bold" color={t.neutral[600]} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        style={({ pressed }) => [styles.go, { backgroundColor: go }, pressed && styles.goPressed]}
      >
        <Text style={styles.goText}>Hanapin</Text>
      </Pressable>
    </View>
  );
}

/*
 * PALENGKE in Archivo Black, semi-expanded, outlined to a path once (as on
 * the website; SIL Open Font License 1.1), so the app loads no font for it.
 * 100 units a size: the caps stand 70 high, from x 7 to 662.
 */
const WORD_PATH = [
  'M30.8 0L7.4 0L7.4-68.8L55.4-68.8Q62-68.8 67.1-65.8Q72.2-62.8 75.1-57.5Q77.9-52.2 77.9-45.2L77.9-45.2Q77.9-38 75-32.6Q72.1-27.2 67-24.2Q61.9-21.3 55.4-21.3L55.4-21.3L30.8-21.3L30.8 0',
  'Z',
  'M30.8-52.1L30.8-37.9L48.2-37.9Q51.9-37.9 53.7-39.7Q55.5-41.5 55.5-45L55.5-45Q55.5-47.4 54.7-48.9Q53.8-50.5 52.3-51.3Q50.7-52.1 48.2-52.1L48.2-52.1L30.8-52.1',
  'ZM98.4 0L74.3 0L103.5-68.8L130-68.8L159.2 0L134.2 0L130.7-9.4L101.8-9.4L98.4 0Z',
  'M111.9-37L107.9-25.7L124.7-25.7L120.7-37Q120.3-38 119.8-39.5Q119.3-41 118.8-42.8Q118.2-44.6 117.7-46.4Q117.2-48.2 116.7-49.6L116.7-49.6L116-49.6Q115.5-47.8 114.8-45.6Q114-43.3 113.3-41.1Q112.6-38.8 111.9-37L111.9-37',
  'ZM230.8 0L167.4 0L167.4-68.8L190.8-68.8L190.8-18.3L230.8-18.3L230.8 0Z',
  'M307.5 0L240.3 0L240.3-68.8L306.8-68.8L306.8-52L263.7-52L263.7-42.8L300.7-42.8L300.7-26.8L263.7-26.8L263.7-16.8L307.5-16.8L307.5 0',
  'Z',
  'M340.9 0L319.2 0L319.2-68.8L339.4-68.8L367.1-42.1Q367.8-41.4 369.1-39.9Q370.4-38.5 371.8-36.9Q373.2-35.4 374.1-34.4L374.1-34.4L374.8-34.5Q374.8-36.6 374.8-39.2Q374.8-41.7 374.8-43.5L374.8-43.5L374.8-68.8L396.4-68.8L396.4 0L376.4 0L348.2-27.3Q346.3-29.2 344.6-31Q342.8-32.9 341.5-34.3L341.5-34.3L340.8-34.2Q340.9-32.6 340.9-30.3Q340.9-28.1 340.9-26.4L340.9-26.4L340.9 0',
  'Z',
  'M446.4 1.2L446.4 1.2Q427.4 1.2 417.9-7.7Q408.3-16.6 408.3-34.4L408.3-34.4Q408.3-46.2 413.3-54.1Q418.3-62 427.8-66Q437.2-70 450.5-70L450.5-70Q458.5-70 465.6-68.4Q472.6-66.7 478-63.4Q483.4-60.2 486.5-55.3Q489.5-50.4 489.5-43.9L489.5-43.9L466.9-43.9Q466.9-46.1 465.7-47.8Q464.5-49.6 462.4-50.8Q460.2-52 457.4-52.6Q454.6-53.2 451.5-53.2L451.5-53.2Q446.7-53.2 443.1-52.1Q439.5-51 437.1-48.8Q434.7-46.7 433.5-43.7Q432.3-40.6 432.3-36.6L432.3-36.6L432.3-32.2Q432.3-26.8 434.4-23.1Q436.4-19.4 440.5-17.5Q444.6-15.6 450.8-15.6L450.8-15.6Q455.1-15.6 458.8-16.6Q462.4-17.6 464.7-19.5Q466.9-21.4 466.9-24L466.9-24L466.9-24.4L448.6-24.4L448.6-38.4L489.5-38.4L489.5 0L476.8 0L474.6-7.2Q471.1-4.5 466.9-2.6Q462.6-0.7 457.6 0.3Q452.5 1.2 446.4 1.2',
  'Z',
  'M526.9 0L503.5 0L503.5-68.8L526.9-68.8L526.9-38.9L555.8-68.8L584.8-68.8L557.3-40.6L585.5 0L557.4 0L540.4-25.8L526.9-14L526.9 0',
  'Z',
  'M662 0L594.8 0L594.8-68.8L661.3-68.8L661.3-52L618.2-52L618.2-42.8L655.2-42.8L655.2-26.8L618.2-26.8L618.2-16.8L662-16.8L662 0',
  'Z',
].join('');

/**
 * The word as the LOKAL banner draws its own: a face from white into a
 * pale mint, top to bottom, over one soft copy of it, down and to the
 * right, in a deep green.
 */
const PalengkeWord = memo(function PalengkeWord({ width, shadow }) {
  const id = `plgw${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={width} height={width * (90 / 672)} viewBox="1 -74 672 90" style={styles.word}>
      <Defs>
        <LinearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1="0" y1="-70" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
          <Stop offset="1" stopColor="#D1FAE5" stopOpacity="1" />
        </LinearGradient>
        <Filter id={`${id}s`} x="-5%" y="-30%" width="110%" height="160%">
          <FeGaussianBlur stdDeviation="2.4" />
        </Filter>
      </Defs>
      <Path d={WORD_PATH} transform="translate(2.5 4.4)" fill={shadow} opacity={0.35} filter={`url(#${id}s)`} />
      <Path d={WORD_PATH} fill={`url(#${id}f)`} />
    </Svg>
  );
});

/*
 * The band's fill: linear-gradient(160deg, g1 -20%, g2 45%, g3 100%), the
 * CSS angle worked out for the band's size once it is laid out.
 */
function BandFill({ w, h, c }) {
  const id = `plgf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!w || !h) return null;
  const a = (160 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  // The line runs from -20% (where g1 sits) to 100%.
  const from = -0.5 - 0.2;
  const to = 0.5;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={w / 2 + dx * len * from}
          y1={h / 2 + dy * len * from}
          x2={w / 2 + dx * len * to}
          y2={h / 2 + dy * len * to}
        >
          <Stop offset="0" stopColor={c.g1} stopOpacity="1" />
          <Stop offset={String(0.65 / 1.2)} stopColor={c.g2} stopOpacity="1" />
          <Stop offset="1" stopColor={c.g3} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Path d={`M0 0H${w}V${h}H0z`} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The top of the Palengke page (web PalengkeBand.jsx, phone layout), a
 * green band: Back, the search and ⋯ in one row, then the E-MOORM logo in
 * a kicker and the word, centred. `top`: the room above it (the status bar).
 */
export default function PalengkeBand({
  q, onSearch, onBack, top = 0,
}) {
  const { width: screenW } = useWindowDimensions();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const c = plgColors();
  return (
    <View
      style={[styles.band, { paddingTop: top, backgroundColor: c.g2 }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
    >
      <BandFill w={size.w} h={size.h} c={c} />
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={({ pressed }) => [styles.round, pressed && styles.roundPressed]}
        >
          <CaretLeftIcon size={22} weight="bold" color="#FFFFFF" />
        </Pressable>
        <BandSearch key={q} q={q} onSearch={onSearch} go={c.go} />
        <ShellPageMenu barInk={{ icon: '#FFFFFF', accent: '#FFFFFF' }} />
      </View>

      <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel="E-MOORM Palengke">
        <View style={styles.kicker}>
          <View style={styles.dash} />
          <WhiteMark size={20} />
          <Text style={styles.kickerText}>E-MOORM</Text>
          <View style={styles.dash} />
        </View>
        <PalengkeWord width={Math.min(screenW * 0.88, 400)} shadow={c.side} />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  band: { alignItems: 'center', paddingBottom: 44, overflow: 'hidden' },
  bar: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', height: 56, paddingLeft: 4, paddingRight: 2,
  },
  round: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  roundPressed: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  search: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, marginHorizontal: 2,
    paddingLeft: 12, paddingRight: 4, borderRadius: 999, backgroundColor: t.neutral[0],
  },
  input: {
    flex: 1, minWidth: 0, height: '100%', padding: 0, fontSize: 15, ...font(400), color: t.neutral[900],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  clear: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: t.neutral[200],
  },
  go: {
    height: 32, paddingHorizontal: 13, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  goPressed: { opacity: 0.88 },
  goText: { fontSize: 13.5, lineHeight: 17, ...font(700), color: '#FFFFFF' },

  title: { alignItems: 'center', marginTop: 14 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dash: { width: 14, height: 2, borderRadius: 2, backgroundColor: '#FFFFFF', opacity: 0.85 },
  kickerText: {
    marginRight: -3.38, fontSize: 13, lineHeight: 13, letterSpacing: 3.38, ...font(700), color: '#FFFFFF',
  },
  word: { marginTop: 10, overflow: 'visible' },
}));
