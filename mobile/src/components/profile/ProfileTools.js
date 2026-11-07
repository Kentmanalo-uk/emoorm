import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, t, themed } from '../../theme';
import { PfSection } from './ProfileUI';

/*
 * The Profile tab's shortcuts and its help strip, drawn as the website's
 * phone view draws them (web components/account/ProfileTools.jsx and
 * pages/Profile.css .pf-m-tools*, .pf-m-links*).
 */

const COLUMNS = 4;
const PER_PAGE = 8;
const TRACK = 34;
// 44px times the size a super admin chose (.pf-m-tool svg), the tile 40px
// taller for the gap and the label.
const MARK = 44;

/**
 * Home's marks, four across and two down a page, swiped sideways like Home's
 * shortcuts, with the same little bar under them saying where you are.
 *   tools: [{ key, label, Art, onPress }]
 *   look:  'glass' | 'pop' (shortcutLook), scale: shortcutScale
 */
export function ProfileTools({ tools, look, scale = 1 }) {
  const [width, setWidth] = useState(0);
  const count = Math.max(1, Math.ceil(tools.length / PER_PAGE));
  const pages = useMemo(
    () => Array.from({ length: count }, (_, p) => tools.slice(p * PER_PAGE, (p + 1) * PER_PAGE)),
    [tools, count],
  );
  const mark = Math.round(MARK * scale);

  const scrollX = useRef(new Animated.Value(0)).current;
  // Built once (Animated.event attaches to the view it is given), and on an
  // Animated.ScrollView: a plain one hands the event object to the native
  // view as if it were a function.
  const onScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }),
  ).current;
  // The bar is the scroll itself, scaled down; held across renders.
  const travel = useMemo(() => (width && count > 1
    ? scrollX.interpolate({
      inputRange: [0, width * (count - 1)],
      outputRange: [0, TRACK - TRACK / count],
      extrapolate: 'clamp',
    })
    : 0), [scrollX, width, count]);

  return (
    <PfSection style={styles.section}>
      <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        <Animated.ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {width ? pages.map((page, p) => (
            <View key={`page-${p}`} style={[styles.page, { width }]}>
              {page.map((tool) => (
                <Pressable
                  key={tool.key}
                  accessibilityRole="link"
                  accessibilityLabel={tool.label}
                  onPress={tool.onPress}
                  style={({ pressed }) => [
                    styles.tile,
                    { width: (width - 16) / COLUMNS, minHeight: mark + 40 },
                    pressed && styles.pressed,
                  ]}
                >
                  <tool.Art size={mark} look={look} />
                  <Text style={styles.label} numberOfLines={2}>{tool.label}</Text>
                </Pressable>
              ))}
            </View>
          )) : null}
        </Animated.ScrollView>
      </View>
      {count > 1 ? (
        <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Animated.View style={[styles.thumb, { width: TRACK / count, transform: [{ translateX: travel }] }]} />
        </View>
      ) : null}
    </PfSection>
  );
}

/**
 * Help and the rest, on one strip: an outline icon in the brand colour and a
 * word each, divided by short hairlines, swiped sideways when they do not fit.
 *   links: [{ key, Icon, label, onPress }]
 */
export function ProfileLinks({ links }) {
  return (
    <PfSection style={styles.linksSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.links}
        accessibilityLabel="Help and more"
      >
        {links.map((link, i) => (
          <Pressable
            key={link.key}
            accessibilityRole="link"
            accessibilityLabel={link.label}
            onPress={link.onPress}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            {i > 0 ? <View style={styles.hairline} /> : null}
            <link.Icon size={20} color={t.primary[600]} />
            <Text style={styles.linkText} numberOfLines={1}>{link.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </PfSection>
  );
}

const styles = themed(() => StyleSheet.create({
  section: { paddingTop: 12, paddingBottom: 10, paddingHorizontal: 0 },
  page: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', rowGap: 6, paddingHorizontal: 8 },
  tile: { alignItems: 'center', gap: 6, paddingTop: 6, paddingHorizontal: 2 },
  pressed: { opacity: 0.6 },
  label: { fontSize: 11.5, lineHeight: 14, textAlign: 'center', color: t.neutral[700], ...font(400) },
  track: {
    width: TRACK, height: 3, marginTop: 8, alignSelf: 'center', borderRadius: 2,
    backgroundColor: t.neutral[200], overflow: 'hidden',
  },
  thumb: { height: 3, borderRadius: 2, backgroundColor: t.primary[500] },

  linksSection: { paddingVertical: 0, paddingHorizontal: 0 },
  links: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingHorizontal: 12 },
  hairline: {
    position: 'absolute', left: 0, top: '50%', height: 22, marginTop: -11,
    borderLeftWidth: 1, borderLeftColor: t.neutral[200],
  },
  linkText: { fontSize: 14.5, lineHeight: 23.2, color: t.neutral[700], ...font(400) },
}));
