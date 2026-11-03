import { useEffect, useState } from 'react';
import {
  AppState, Linking, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CheckIcon, PlusIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import apiClient from '../../../api/client';
import { resolveImg } from '../../../lib/media';
import { IMAGE_OVERLAYS } from '../../../lib/imageOverlays';
import { NEW_DESIGN_URL } from '../../../lib/photoDesign';
import ImageOverlay from '../../product/ImageOverlay';
import { PF, Switch } from './parts';

const FIRST = IMAGE_OVERLAYS[0].key;

/*
 * Photo design (web product-form/PhotoDesign.jsx): the shop's branding (logo,
 * name, colour) drawn over the product's photos wherever buyers see them. A
 * switch turns it on or off; when on, the ten designs are shown on the
 * seller's own first photo to pick from, then the shop's own designs (made
 * in the website's editor; 'custom' with `design` = { id, layers }). The
 * photos themselves are never changed, so it can be turned off or changed
 * any time. onChange(key, design): design is null for a ready one and off.
 */
export default function PhotoDesign({
  value, design = null, onChange, store, cover,
}) {
  const router = useRouter();
  const on = Boolean(value);
  // Turned off and on again: the design picked last (the shop's own too).
  const [last, setLast] = useState(value ? { key: value, design } : { key: FIRST, design: null });
  // The shop's own designs; null while loading or when they could not be
  // had (the section stays hidden then).
  const [own, setOwn] = useState(null);
  const photo = cover ? resolveImg(cover) : null;
  const pick = (key, picked = null) => {
    onChange(key, picked);
    setLast({ key, design: picked });
  };

  // Fetched again on coming back to the app: a design just made on the website.
  useEffect(() => {
    let live = true;
    const load = () => apiClient.get('/photo-designs')
      .then((res) => { if (live) setOwn(Array.isArray(res.data?.designs) ? res.data.designs : []); })
      .catch(() => {});
    load();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const makeOwn = () => Linking.openURL(NEW_DESIGN_URL).catch(() => {});

  return (
    <View style={styles.wrap}>
      <Switch
        checked={on}
        onChange={(next) => (next ? onChange(last.key, last.design) : onChange(null, null))}
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
          {own ? (
            <>
              <Text style={styles.head}>Your designs</Text>
              {own.length ? (
                <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Your designs">
                  {own.map((d) => {
                    const picked = value === 'custom' && design?.id === d.id;
                    return (
                      <Pressable
                        key={d.id}
                        style={styles.opt}
                        onPress={() => pick('custom', { id: d.id, layers: d.layers })}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: picked }}
                        accessibilityLabel={d.name}
                      >
                        <View style={[styles.photo, picked && styles.photoOn]}>
                          {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                          <ImageOverlay design="custom" layers={d.layers} store={store} />
                          {picked ? (
                            <View style={styles.check}><CheckIcon size={13} color="#fff" weight="bold" /></View>
                          ) : null}
                        </View>
                        <Text style={[styles.label, picked && styles.labelOn]} numberOfLines={1}>{d.name}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={styles.opt} onPress={makeOwn} accessibilityRole="link" accessibilityLabel="Make your own design on the website">
                    <View style={[styles.photo, styles.make]}>
                      <PlusIcon size={22} color={PF.greenDark} weight="bold" />
                    </View>
                    <Text style={[styles.label, styles.labelOn]} numberOfLines={1}>Make your own</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable style={styles.makeLink} onPress={makeOwn} accessibilityRole="link" hitSlop={8}>
                    <PlusIcon size={16} color={PF.greenDark} weight="bold" />
                    <Text style={styles.link}>Make your own</Text>
                  </Pressable>
                  <Text style={styles.hint}>Make your own design on the website, then pick it here.</Text>
                </>
              )}
            </>
          ) : null}
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
  make: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: PF.green,
    backgroundColor: PF.greenSoft,
  },
  head: { marginTop: 16, color: PF.ink, fontSize: 14, lineHeight: 20, ...font(600) },
  makeLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 8 },
  hint: { marginTop: 4, color: PF.muted, fontSize: 13, lineHeight: 19, ...font(400) },
  check: {
    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PF.green,
  },
  label: { color: t.neutral[700], fontSize: 12.5, lineHeight: 17, ...font(500) },
  labelOn: { color: PF.greenDark, ...font(600) },
  note: { marginTop: 12, color: PF.muted, fontSize: 13, lineHeight: 19, ...font(400) },
  link: { color: PF.greenDark, ...font(600) },
}));
