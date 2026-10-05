import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';

/*
 * A selectable card (web/src/components/ui/ChoiceCard.jsx + .css): an icon
 * or logo, a title and a line under it, an amount on the right and a check
 * circle. Checked: green border, mint fill and a soft ring.
 *
 * media: (color) => element, so the icon can take the card's colour
 * mediaColor: the icon colour when not checked (payment methods have their own)
 * flush: no gap between cards (the phone payment list), so no ring either
 */
export default function CheckoutChoiceCard({
  checked, disabled, onPress, media, mediaColor, plainMedia, title, desc, aside, style,
}) {
  const iconColor = checked ? t.primary[700] : (mediaColor || t.neutral[600]);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: Boolean(checked), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.card, checked && styles.cardOn, disabled && styles.cardOff, style]}
    >
      {media ? (
        <View style={[styles.media, plainMedia ? styles.mediaPlain : checked && styles.mediaOn]}>
          {typeof media === 'function' ? media(iconColor) : media}
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
      {aside != null && aside !== '' ? <Text style={styles.aside}>{aside}</Text> : null}
      <View style={[styles.check, checked && styles.checkOn]}>
        {checked ? <CheckIcon size={12} weight="bold" color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

/** A courier's logo, or its initial on a mint chip (web CourierMark). */
export function CheckoutCourierMark({ courier, size = 30 }) {
  const name = courier?.name || 'Courier';
  const width = Math.round(size * 1.75);
  if (courier?.logoUrl) {
    return <Image source={{ uri: resolveImg(courier.logoUrl) }} resizeMode="contain" style={[styles.mark, styles.markLogo, { width, height: size }]} />;
  }
  return (
    <View style={[styles.mark, styles.markInitial, { width, height: size }]}>
      <Text style={[styles.markText, { fontSize: Math.round(size * 0.42) }]}>
        {name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'C'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 14,
    backgroundColor: t.neutral[0],
  },
  cardOn: {
    borderColor: t.primary[600],
    backgroundColor: t.primary[50],
    boxShadow: '0px 0px 0px 3px rgba(16, 185, 129, 0.12)',
  },
  cardOff: { opacity: 0.55 },
  media: {
    minWidth: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: t.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mediaOn: { backgroundColor: '#fff' },
  mediaPlain: { minWidth: 0, backgroundColor: 'transparent' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 19.5, ...font(500), color: t.neutral[900] },
  desc: { fontSize: 13, lineHeight: 18.2, ...font(400), color: t.neutral[500] },
  aside: { flexShrink: 0, fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900] },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.neutral[300],
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  mark: { borderRadius: 8, backgroundColor: '#fff' },
  markLogo: { borderWidth: 1, borderColor: t.neutral[200] },
  markInitial: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[100] },
  markText: { ...font(500), color: t.primary[700] },
});
