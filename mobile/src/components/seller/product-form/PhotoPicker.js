import { useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraIcon, ImagesIcon, XIcon } from '../../../lib/icons';
import { font, t, themed, veil } from '../../../theme';
import { toast } from '../../../lib/toast';
import { uploadImage } from '../../../lib/upload';
import { resolveImg } from '../../../lib/media';
import Sheet, { SheetOption } from '../../Sheet';
import { MAX_IMAGES } from './formState';
import { PF } from './parts';

/*
 * The product's photos (web product-form/PhotoPicker.jsx): add from the
 * camera or gallery, remove, pick the cover. The website's file input lets
 * a phone choose the camera or the gallery; here a small sheet asks which.
 */
export default function PhotoPicker({ images, onChange, empty = 'Add photos' }) {
  const [uploading, setUploading] = useState(0);
  const [asking, setAsking] = useState(false);
  const [width, setWidth] = useState(0);
  const list = Array.isArray(images) ? images : [];

  const upload = async (assets) => {
    if (!assets.length) return;
    const room = MAX_IMAGES - list.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_IMAGES} photos`);
      return;
    }
    const chosen = assets.slice(0, room);
    if (assets.length > room) toast.info(`Only ${room} more photo${room === 1 ? '' : 's'} can be added`);

    setUploading(chosen.length);
    const uploaded = [];
    for (const asset of chosen) {
      try {
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

  const open = async (source) => {
    if (asking) {
      setAsking(false);
      // iOS will not show the picker while the sheet is still sliding away.
      await new Promise((resolve) => { setTimeout(resolve, 320); });
    }
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          toast.error('Camera permission is required');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: Math.max(1, MAX_IMAGES - list.length),
          quality: 0.85,
        });
      if (result.canceled) return;
      await upload(result.assets || []);
    } catch {
      toast.error('Could not open your photos');
    }
  };

  // The web build has no camera to ask for: straight to the files.
  const pick = () => (Platform.OS === 'web' ? open('library') : setAsking(true));

  // Three to a row, 8px apart (.pf-photos on phones).
  const tile = width ? Math.floor((width - 16) / 3) : 0;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {list.length === 0 && !uploading ? (
        <Pressable accessibilityRole="button" onPress={pick} style={styles.empty}>
          <View style={styles.emptyIcon}><CameraIcon size={26} color={PF.green} /></View>
          <Text style={styles.emptyTitle}>{empty}</Text>
          <Text style={styles.emptyHint}>Take a photo or choose from your gallery · up to {MAX_IMAGES}</Text>
        </Pressable>
      ) : tile ? (
        <View style={styles.grid}>
          {list.map((src, idx) => (
            <View key={`${src}-${idx}`} style={[styles.photoOuter, { width: tile, height: tile }, idx === 0 && styles.cover]}>
              <View style={styles.photo}>
                <Image source={{ uri: resolveImg(src) || src }} style={styles.img} accessibilityLabel={`Photo ${idx + 1}`} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${idx + 1}`}
                  hitSlop={6}
                  onPress={() => onChange(list.filter((_, i) => i !== idx))}
                  style={styles.remove}
                >
                  <XIcon size={14} weight="bold" color="#fff" />
                </Pressable>
                {idx === 0 ? (
                  <Text style={[styles.tag, styles.coverTag]}>Cover</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      const next = [...list];
                      const [picked] = next.splice(idx, 1);
                      onChange([picked, ...next]);
                    }}
                    style={styles.makeCover}
                  >
                    <Text style={[styles.tagText, styles.makeCoverText]}>Make cover</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          {uploading > 0 ? (
            <View style={[styles.photo, styles.loading, { width: tile, height: tile }]} accessibilityLiveRegion="polite">
              <ActivityIndicator size={22} color={PF.muted} />
              <Text style={styles.loadingText}>Uploading…</Text>
            </View>
          ) : null}
          {list.length + uploading < MAX_IMAGES && !uploading ? (
            <Pressable accessibilityRole="button" onPress={pick} style={[styles.add, { width: tile, height: tile }]}>
              <CameraIcon size={22} color={PF.green} />
              <Text style={styles.addText}>Add photo</Text>
              <Text style={styles.addCount}>{list.length}/{MAX_IMAGES}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Sheet variant="seller" open={asking} title="Add photos" onClose={() => setAsking(false)}>
        <SheetOption
          variant="seller"
          label="Take a photo"
          onPress={() => open('camera')}
          right={<CameraIcon size={20} color={t.neutral[500]} />}
        />
        <SheetOption
          variant="seller"
          label="Choose from your gallery"
          onPress={() => open('library')}
          right={<ImagesIcon size={20} color={t.neutral[500]} />}
        />
      </Sheet>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  empty: {
    alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', minHeight: 168, padding: 20,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 14, backgroundColor: t.neutral[50],
  },
  emptyIcon: {
    width: 56, height: 56, marginBottom: 4, borderRadius: 28, backgroundColor: PF.greenSoft, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, lineHeight: 24, color: PF.ink, ...font(600) },
  emptyHint: { fontSize: 12.5, lineHeight: 20, color: PF.muted, textAlign: 'center', ...font(400) },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoOuter: { borderRadius: 12 },
  // The cover's 2px green ring (box-shadow 0 0 0 2px).
  cover: { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: PF.green }] },
  photo: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100] },
  img: { width: '100%', height: '100%', resizeMode: 'cover' },
  remove: {
    position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.62)', alignItems: 'center', justifyContent: 'center',
  },
  tag: {
    position: 'absolute', left: 6, bottom: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    fontSize: 11.5, lineHeight: 13.8, ...font(600),
  },
  coverTag: { backgroundColor: PF.green, color: t.onBrand },
  makeCover: {
    position: 'absolute', left: 6, bottom: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999,
    backgroundColor: veil(0.92),
  },
  tagText: { fontSize: 11.5, lineHeight: 13.8, ...font(600) },
  makeCoverText: { color: PF.ink },
  loading: { flex: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  loadingText: { color: PF.muted, fontSize: 12, lineHeight: 19, ...font(400) },
  add: {
    alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  addText: { color: PF.green, fontSize: 13, lineHeight: 20.8, ...font(600) },
  addCount: { color: t.neutral[500], fontSize: 11.5, lineHeight: 18.4, ...font(500) },
}));
