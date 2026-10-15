import { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { uploadImage } from '../../../lib/upload';
import { toast } from '../../../lib/toast';
import { MAX_PHOTOS, P } from './pkfLib';
import { Thumb, pkfStyles } from './PkfBits';

/*
 * Step 3's photos (web PackageForm.jsx PackagePhotos, PackageForm.css
 * .pkf-autocover, .pkf-photos, ≤768px): the seller's own photos, or the
 * items' photos standing in until they add one (the "auto cover").
 */

const GAP = 8;

export default function PackagePhotos({ images, itemPhotos, onChange }) {
  const [uploading, setUploading] = useState(0);
  const [width, setWidth] = useState(0);
  const list = Array.isArray(images) ? images : [];
  // Three photos a row (.pkf-photos: repeat(3, 1fr), gap 8px).
  const tile = width > 0 ? Math.floor((width - GAP * 2) / 3) : 0;

  const pick = async () => {
    const room = MAX_PHOTOS - list.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos`);
      return;
    }
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.85,
      });
    } catch (err) {
      toast.error(err.message || 'Could not open your photos');
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    const chosen = result.assets.slice(0, room);
    setUploading(chosen.length);
    const uploaded = [];
    for (const asset of chosen) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await uploadImage(asset);
        uploaded.push(res.url);
      } catch (err) {
        toast.error(err.message || 'A photo could not be uploaded');
      }
      setUploading((n) => Math.max(0, n - 1));
    }
    setUploading(0);
    if (uploaded.length) onChange([...list, ...uploaded]);
  };

  const makeCover = (idx) => {
    const next = [...list];
    const [moved] = next.splice(idx, 1);
    onChange([moved, ...next]);
  };

  if (list.length === 0 && !uploading) {
    return (
      <View style={styles.autocover}>
        {itemPhotos.length > 0 ? (
          <View style={styles.autoPics}>
            {itemPhotos.map((src, i) => <Thumb key={`${src}-${i}`} src={src} style={styles.autoPic} />)}
          </View>
        ) : null}
        <Text style={styles.autoText}>
          {itemPhotos.length ? 'For now, buyers see these photos of your items.' : 'Buyers see your items\' photos until you add one.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={pick} style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}>
          <CameraIcon size={18} color={P.greenDark} />
          <Text style={styles.photoBtnText}>Add your own photo</Text>
        </Pressable>
      </View>
    );
  }

  const tileSize = tile ? { width: tile, height: tile } : styles.tileGuess;
  return (
    <View style={styles.wrap}>
      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {list.map((src, idx) => (
          <View key={`${src}-${idx}`} style={[styles.photoRing, tileSize, idx === 0 && styles.photoCover]}>
            <View style={styles.photo}>
              <Image source={{ uri: resolveImg(src) || src }} style={styles.photoImg} resizeMode="cover" accessibilityLabel={`Package photo ${idx + 1}`} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}
                hitSlop={4}
                onPress={() => onChange(list.filter((_, i) => i !== idx))}
                style={styles.remove}
              >
                <XIcon size={14} weight="bold" color="#fff" />
              </Pressable>
              {idx === 0 ? (
                <View style={[styles.badge, styles.badgeCover]}>
                  <Text style={[styles.badgeText, styles.badgeTextCover]}>Cover</Text>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => makeCover(idx)} style={[styles.badge, styles.badgeMake]}>
                  <Text style={styles.badgeText}>Make cover</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
        {uploading > 0 ? (
          <View style={[styles.photo, styles.loading, tileSize]} accessibilityLiveRegion="polite">
            <ActivityIndicator size={22} color={P.muted} />
            <Text style={styles.loadingText}>Uploading…</Text>
          </View>
        ) : null}
        {list.length + uploading < MAX_PHOTOS && !uploading ? (
          <Pressable accessibilityRole="button" onPress={pick} style={[styles.add, tileSize]}>
            <CameraIcon size={22} color={P.green} />
            <Text style={styles.addText}>Add photo</Text>
          </Pressable>
        ) : null}
      </View>
      {!uploading ? (
        <Pressable accessibilityRole="button" onPress={() => onChange([])} style={pkfStyles.link}>
          <Text style={pkfStyles.linkText}>Use my items&apos; photos instead</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  autocover: {
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.neutral[300],
    borderRadius: 14,
    backgroundColor: t.neutral[50],
  },
  autoPics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  autoPic: { width: 64, height: 64, borderRadius: 12 },
  autoText: { fontSize: 13, lineHeight: 20.8, color: P.muted, ...font(400) },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: P.green,
    borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  photoBtnText: { fontSize: 14, lineHeight: 22.4, color: P.greenDark, ...font(500) },
  pressed: { opacity: 0.85 },

  wrap: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tileGuess: { width: '31%', aspectRatio: 1 },
  photoRing: { borderRadius: 12 },
  // .pkf-photo.is-cover: a 2px green ring around the cover.
  photoCover: { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: P.green }] },
  photo: { flex: 1, overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[100] },
  photoImg: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  badge: { position: 'absolute', bottom: 6, left: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  badgeCover: { backgroundColor: P.green },
  badgeMake: { backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  badgeText: { fontSize: 11.5, lineHeight: 13.8, color: P.ink, ...font(600) },
  badgeTextCover: { color: '#fff' },
  loading: { flex: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  loadingText: { fontSize: 12, lineHeight: 19.2, color: P.muted, ...font(400) },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.neutral[300],
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  addText: { fontSize: 13, lineHeight: 20.8, color: P.green, ...font(600) },
});
