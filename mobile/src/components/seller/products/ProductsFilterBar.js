import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MagnifyingGlassIcon, SlidersHorizontalIcon, XIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { PHONE_QUICK_TABS, countFor, tabLabel } from './productRules';

/*
 * My products' search and status chips on one white panel (web
 * SellerProducts.jsx .spm-filterbar; SellerProducts.css "Phones: the search
 * and the status tabs on one white panel", styled as Chat's): a grey rounded
 * search field, then grey chips with counts that turn green when chosen,
 * and the sliders chip at the end for every other status. The chips scroll
 * sideways; the chosen one is always brought into view.
 */
export default function ProductsFilterBar({
  search, onChangeSearch, onSubmitSearch, onClearSearch, status, summary, onSelect, onOpenSheet,
}) {
  const [focused, setFocused] = useState(false);
  const quick = PHONE_QUICK_TABS.includes(status);

  // Where each chip sits in the row, to scroll the chosen one into view.
  const rowRef = useRef(null);
  const rowWidth = useRef(0);
  const scrollX = useRef(0);
  const chipBoxes = useRef({});
  const [laidOut, setLaidOut] = useState(0);
  const chipKey = quick ? status : 'more';
  useEffect(() => {
    const box = chipBoxes.current[chipKey];
    const width = rowWidth.current;
    if (!box || !width || !rowRef.current) return;
    const { x, w } = box;
    if (x < scrollX.current || x + w > scrollX.current + width) {
      rowRef.current.scrollTo({ x: Math.max(0, x + w - width), animated: false });
    }
  }, [chipKey, summary, laidOut]);
  const keep = (key) => (e) => {
    const { x, width } = e.nativeEvent.layout;
    chipBoxes.current[key] = { x, w: width };
    setLaidOut((n) => n + 1);
  };

  const chipText = (key, on) => {
    const count = countFor(summary, key);
    return (
      <>
        <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{tabLabel(key)}</Text>
        {count != null ? <Text style={[styles.count, on && styles.countOn]}>{count}</Text> : null}
      </>
    );
  };

  return (
    <View style={styles.bar}>
      <View style={styles.toolbar}>
        <View style={[styles.field, focused && styles.fieldFocused]} accessibilityRole="search">
          <MagnifyingGlassIcon size={18} color={t.neutral[500]} />
          <TextInput
            value={search}
            onChangeText={onChangeSearch}
            onSubmitEditing={onSubmitSearch}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search products…"
            placeholderTextColor={t.neutral[400]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search products"
            style={styles.input}
          />
          {search ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClearSearch} hitSlop={8} style={styles.clear}>
              <XIcon size={12} weight="bold" color={t.neutral[0]} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        ref={rowRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => { rowWidth.current = e.nativeEvent.layout.width; setLaidOut((n) => n + 1); }}
        onScroll={(e) => { scrollX.current = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={32}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        accessibilityLabel="Show products"
      >
        {PHONE_QUICK_TABS.map((key) => {
          const on = status === key;
          return (
            <Pressable
              key={key}
              onLayout={keep(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(key)}
              style={[styles.chip, on && styles.chipOn]}
            >
              {chipText(key, on)}
            </Pressable>
          );
        })}
        <Pressable
          onLayout={keep('more')}
          accessibilityRole="button"
          accessibilityLabel={quick ? 'More filters' : undefined}
          accessibilityState={{ selected: !quick }}
          onPress={onOpenSheet}
          style={[styles.chip, styles.more, quick ? styles.moreIcon : styles.chipOn]}
        >
          <SlidersHorizontalIcon size={17} weight="bold" color={quick ? t.neutral[700] : '#fff'} />
          {!quick ? chipText(status, true) : null}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .spm-filterbar: white, inside the page's 12px gutter.
  bar: { backgroundColor: t.neutral[0] },
  toolbar: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 8 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingLeft: 14, paddingRight: 8,
    borderRadius: 12, backgroundColor: t.neutral[100], borderWidth: 1, borderColor: 'transparent',
  },
  // :focus-within → inset 1px green ring.
  fieldFocused: { borderColor: t.primary[600] },
  input: {
    flex: 1, minWidth: 0, height: 44, padding: 0, fontSize: 16, color: t.neutral[900], ...font(400),
  },
  clear: {
    width: 24, height: 24, marginRight: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.neutral[300],
  },

  chipsScroll: { flexGrow: 0 },
  // flexGrow lets the sliders chip sit at the far end (margin-left: auto).
  chips: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, paddingHorizontal: 16, paddingBottom: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: t.neutral[100],
  },
  chipOn: { backgroundColor: t.primary[600] },
  more: { marginLeft: 'auto' },
  moreIcon: { justifyContent: 'center', width: 34, minWidth: 34, paddingHorizontal: 0 },
  chipText: { fontSize: 13.5, lineHeight: 20, color: t.neutral[700], ...font(500) },
  chipTextOn: { color: t.onBrand },
  count: { fontSize: 13.5, lineHeight: 20, color: t.neutral[500], ...font(500), fontVariant: ['tabular-nums'] },
  countOn: { color: 'rgba(255, 255, 255, 0.82)' },
}));
