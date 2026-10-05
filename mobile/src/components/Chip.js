import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretDownIcon } from 'phosphor-react-native';
import { font, t } from '../theme';

/*
 * The website's phone chips, one look per `variant`:
 *
 *   filter   search results' filter chips (Products.css .srch-m-fchip):
 *            square grey, 36 tall; active = light green with a green edge
 *   today    Available Today's filter chips (AvailableToday.css .avt-m-fchip):
 *            34 tall, 8px corners, the label cut short past 210
 *   pill     Available Today's kind chips (.avt-chip): white outlined pill;
 *            on = filled green
 *   seller   Seller Center chips (SellerMobile.css .scm-chip): white pill,
 *            38 tall; on = filled green; `dot` adds the pink dot
 *   suggest  search suggestions (.srch-m-chip): white outlined pill, 34 tall
 *
 * <Chip variant="filter" label="Category" icon={MapPinIcon} caret active onPress />
 * `icon` is a Phosphor icon component (drawn at 15, or 16 in a suggestion).
 * Chips that turn on (pill, seller) pop like the website's (motion.css).
 */

const LOOKS = {
  filter: { iconOff: t.neutral[500], iconOn: t.primary[600] },
  today: { iconOff: t.neutral[700], iconOn: t.primary[700] },
  pill: { iconOff: t.neutral[700], iconOn: '#fff', pops: true },
  seller: { iconOff: t.neutral[700], iconOn: '#fff', pops: true },
  suggest: { iconOff: t.neutral[500], iconOn: t.primary[600] },
};

export default function Chip({
  label, variant = 'filter', active = false, onPress, icon: Icon, iconSize = 15, caret = false, dot = false,
  disabled = false, children, style, textStyle, accessibilityLabel,
}) {
  const look = LOOKS[variant] || LOOKS.filter;
  const scale = useRef(new Animated.Value(1)).current;
  const was = useRef(active);

  useEffect(() => {
    if (look.pops && active && !was.current) {
      scale.setValue(0.9);
      Animated.timing(scale, {
        toValue: 1, duration: 580, easing: Easing.bezier(0.34, 1.4, 0.64, 1), useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    was.current = active;
  }, [active, look.pops, scale]);

  const iconColor = active ? look.iconOn : look.iconOff;
  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={onPress}
        style={[styles.chip, styles[variant], active && styles[`${variant}On`], style]}
      >
        {Icon ? <Icon size={iconSize} color={iconColor} /> : null}
        {label != null ? (
          <Text
            style={[styles.text, styles[`${variant}Text`], active && styles[`${variant}TextOn`], textStyle]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
        {children}
        {dot ? <View style={styles.dot} /> : null}
        {caret ? <CaretDownIcon size={12} color={iconColor} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { flexShrink: 1, ...font(400) },

  filter: { height: 36, paddingHorizontal: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: t.neutral[100] },
  filterOn: { borderColor: t.primary[200], backgroundColor: t.primary[50] },
  filterText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700] },
  filterTextOn: { ...font(500), color: t.primary[700] },

  today: {
    maxWidth: 210, height: 34, paddingHorizontal: 12, borderWidth: 1, borderColor: 'transparent', borderRadius: 8,
    backgroundColor: t.neutral[100],
  },
  todayOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  todayText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[700] },
  todayTextOn: { color: t.primary[700] },

  pill: {
    minHeight: 34, paddingHorizontal: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  pillOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  pillText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700] },
  pillTextOn: { color: '#fff' },

  seller: { minHeight: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.neutral[0] },
  sellerOn: { backgroundColor: t.primary[600] },
  sellerText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[700] },
  sellerTextOn: { color: '#fff' },

  suggest: {
    height: 34, paddingHorizontal: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  suggestOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  suggestText: { fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.neutral[700] },
  suggestTextOn: { color: t.primary[700] },

  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent[500] },
});
