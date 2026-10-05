import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';

/**
 * A round picture with the website's fallbacks (web/src/components/ui/
 * UserAvatar.jsx inside .msgr-avatar): the photo, or when there is none or
 * it fails to load, the icon (filled) or the name's first letter.
 *
 * fallback: a node shown instead when there is no photo (the chat header's
 * outlined shop icon).
 * size, bg, color: the circle and the fallback's colour (the list's
 * .msgr-avatar on phones is success-100 / primary-600).
 */
export default function ChatAvatar({
  src, name, size = 40, bg = t.neutral[200], color = t.neutral[600], fallbackIcon: Icon = null, iconSize = 18, fallback = null, style,
}) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  useEffect(() => { setFailed(false); }, [uri]);
  const box = { width: size, height: size, borderRadius: size / 2, backgroundColor: bg };
  return (
    <View style={[styles.box, box, style]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.img} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={name || ''} />
      ) : fallback || (Icon ? (
        <Icon size={iconSize} weight="fill" color={color} />
      ) : (
        <Text style={[styles.initial, { color }]}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  img: { width: '100%', height: '100%' },
  initial: { fontSize: 14, lineHeight: 18, ...font(500) },
});
