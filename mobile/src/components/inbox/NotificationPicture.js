import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';
import { GradientIcon, TOOL_GRADIENTS } from './InboxGradient';

const initialsOf = (name) => String(name || '?').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('')
  .toUpperCase();

/**
 * A notification's picture (web/src/components/NotificationPicture.jsx, as
 * the phone list draws it): the product or shop in a rounded square, the
 * person (messages) in a circle, each with a small round badge in the kind's
 * colour; without a picture, the kind's icon filled with its gradient
 * (`gradient`, a ToolGradients tone) on a grey tile.
 *
 * picture: the API's { url, name, kind } (kind: product, store, person).
 */
export default function NotificationPicture({
  picture, Icon, color, gradient = 'slate', size = 44, tileBg = t.neutral[100], style,
}) {
  const [broken, setBroken] = useState(false);
  const url = picture?.url && !broken ? resolveImg(picture.url) : null;
  const person = picture?.kind === 'person';
  const box = { width: size, height: size };

  if (!picture || (!url && !person)) {
    return (
      <View style={[styles.tile, box, { borderRadius: size * 0.28, backgroundColor: tileBg }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <GradientIcon Icon={Icon} size={24} colors={TOOL_GRADIENTS[gradient] || TOOL_GRADIENTS.slate} />
      </View>
    );
  }

  const badge = Math.max(18, Math.round(size * 0.46));
  const radius = person ? size / 2 : size * 0.24;
  return (
    <View style={[box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {url ? (
        <View style={[box, { borderRadius: radius, overflow: 'hidden', backgroundColor: t.neutral[100] }]}>
          <Image source={{ uri: url }} style={box} resizeMode="cover" onError={() => setBroken(true)} />
          {!person ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.outline, { borderRadius: radius }]} /> : null}
        </View>
      ) : (
        <View style={[box, styles.initials, { borderRadius: size / 2 }]}>
          <Text style={[styles.initialsText, { fontSize: size * 0.36, lineHeight: size * 0.576, letterSpacing: size * 0.0072 }]}>
            {initialsOf(picture.name)}
          </Text>
        </View>
      )}
      <View style={[styles.badge, { width: badge + 4, height: badge + 4, borderRadius: (badge + 4) / 2 }]}>
        <View style={[styles.badgeInner, { width: badge, height: badge, borderRadius: badge / 2, backgroundColor: color }]}>
          <Icon size={Math.max(10, Math.round(size * 0.24))} weight="fill" color="#fff" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  outline: { borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.06)' },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[100] },
  initialsText: { color: t.primary[700], ...font(500) },
  // The badge's 2px white ring: a white disc 4px wider, centred where the
  // website's badge sits (right/bottom -4px).
  badge: {
    position: 'absolute', right: -6, bottom: -6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  badgeInner: { alignItems: 'center', justifyContent: 'center' },
});
