import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CheckIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { IMAGE_OVERLAYS } from '../../../lib/imageOverlays';
import ImageOverlay from '../../product/ImageOverlay';
import { PF, Switch } from './parts';

const FIRST = IMAGE_OVERLAYS[0].key;

/*
 * Photo design (web product-form/PhotoDesign.jsx): the shop's branding (logo,
 * name, colour) drawn over the product's photos wherever buyers see them. A
 * switch turns it on or off; when on, the ten designs are shown on the
 * seller's own first photo to pick from. The photos themselves are never
 * changed, so it can be turned off or changed any time.
 */
export default function PhotoDesign({
  value, onChange, store, cover,
}) {
  const router = useRouter();
  const on = Boolean(value);
  // Turned off and on again: the design picked last.
  const [last, setLast] = useState(value || FIRST);
  const photo = cover ? resolveImg(cover) : null;
  const pick = (key) => {
    onChange(key);
    setLast(key);
  };

  return (
    <View style={styles.wrap}>
      <Switch
        checked={on}
        onChange={(next) => onChange(next ? last : null)}
        label="Brand your photos"
        sub="Your shop's logo, name and colour over this product's photos. Your photos stay as they are."
      />
      {on ? (
        <>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Photo design">
            {IMAGE_OVERLAYS.map(({ key, label }) => {
              const picked = value === key;
              return (
                <Pressable
                  key={key}
                  style={styles.opt}
                  onPress={() => pick(key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: picked }}
                  accessibilityLabel={label}
                >
                  <View style={[styles.photo, picked && styles.photoOn]}>
                    {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    <ImageOverlay design={key} store={store} />
                    {picked ? (
                      <View style={styles.check}><CheckIcon size={13} color="#fff" weight="bold" /></View>
                    ) : null}
                  </View>
                  <Text style={[styles.label, picked && styles.labelOn]} numberOfLines={1}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {!store?.logo ? (
            <Text style={styles.note}>
              Your shop has no logo yet, so its initials show instead.{' '}
              <Text style={styles.link} onPress={() => router.push('/seller/store/branding')}>Add a logo</Text>
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: PF.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  opt: { width: '31%', gap: 6, alignItems: 'center' },
  photo: {
    width: '100%', aspectRatio: 1, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: PF.line,
    backgroundColor: t.neutral[100],
  },
  photoOn: { borderWidth: 3, borderColor: PF.green },
  check: {
    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PF.green,
  },
  label: { color: t.neutral[700], fontSize: 12.5, lineHeight: 17, ...font(500) },
  labelOn: { color: PF.greenDark, ...font(600) },
  note: { marginTop: 12, color: PF.muted, fontSize: 13, lineHeight: 19, ...font(400) },
  link: { color: PF.greenDark, ...font(600) },
}));
