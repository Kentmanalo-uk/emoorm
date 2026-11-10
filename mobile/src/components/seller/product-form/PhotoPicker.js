import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  CameraIcon, ImagesIcon, LightbulbIcon, XIcon,
} from '../../../lib/icons';
import apiClient from '../../../api/client';
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
 *
 * Each new photo is then checked in the background (POST /ml/images/analyze,
 * the ML engine's photo quality, module 10): a photo that could be better
 * gets a small bulb on its tile and a friendly note under the photos with
 * what to try, which the seller can close. Advice only: it never holds up
 * the upload or saving, and when the check is off or fails nothing shows.
 */

/** A photo's quality advice, or null (switched off, good, or any error). */
const checkPhoto = async (url) => {
  try {
    const res = await apiClient.post('/ml/images/analyze', { url });
    const d = res?.data;
    if (!d || d.status !== 'ok' || !d.verdict || d.verdict === 'good') return null;
    const hints = (Array.isArray(d.checks) ? d.checks : [])
      .filter((c) => c && c.ok === false && c.hint)
      .map((c) => c.hint);
    return hints.length ? { verdict: d.verdict, hints } : null;
  } catch (err) {
    console.warn('Photo check:', err?.message || err);
    return null;
  }
};
export default function PhotoPicker({ images, onChange, empty = 'Add photos' }) {
  const [uploading, setUploading] = useState(0);
  const [asking, setAsking] = useState(false);
  const [width, setWidth] = useState(0);
  // url -> { verdict, hints }; a closed note is taken out.
  const [advice, setAdvice] = useState({});
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const list = Array.isArray(images) ? images : [];

  const check = (url) => {
    checkPhoto(url).then((found) => {
      if (found && live.current) setAdvice((a) => ({ ...a, [url]: found }));
    });
  };
  const dismiss = (url) => setAdvice((a) => {
    const next = { ...a };
    delete next[url];
    return next;
  });
  // Notes for the photos still in the list, in their order.
  const notes = list
    .map((src, idx) => ({ src, idx, tip: advice[src] }))
    .filter((n) => n.tip);

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
        check(res.url);
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
                {advice[src] ? (
                  <View style={styles.tipBadge} accessibilityLabel={`Photo ${idx + 1} could look better: see the note below`}>
                    <LightbulbIcon size={14} weight="fill" color={t.warning[700]} />
                  </View>
                ) : null}
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

      {notes.map(({ src, idx, tip }) => (
        <View key={`tip-${src}`} style={styles.tip} accessibilityLiveRegion="polite">
          <Image source={{ uri: resolveImg(src) || src }} style={styles.tipThumb} accessibilityIgnoresInvertColors />
          <View style={styles.tipBody}>
            <Text style={styles.tipTitle}>
              {tip.verdict === 'poor' ? `Photo ${idx + 1} could be clearer` : `Photo ${idx + 1} could look better`}
            </Text>
            {tip.hints.map((h) => <Text key={h} style={styles.tipText}>{h}</Text>)}
            <Text style={styles.tipFoot}>Just a tip: you can keep this photo.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close the tip for photo ${idx + 1}`}
            hitSlop={8}
            onPress={() => dismiss(src)}
            style={({ pressed }) => [styles.tipClose, pressed && styles.tipClosePressed]}
          >
            <XIcon size={14} weight="bold" color={t.neutral[500]} />
          </Pressable>
        </View>
      ))}

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
  // The photo check's bulb (top left; the remove button is top right).
  tipBadge: {
    position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: t.warning[50], alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.warning[200],
  },
  tip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, padding: 10,
    borderWidth: 1, borderColor: t.warning[200], borderRadius: 12, backgroundColor: t.warning[50],
  },
  tipThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: t.neutral[100] },
  tipBody: { flex: 1, minWidth: 0, gap: 2 },
  tipTitle: { fontSize: 13, lineHeight: 18, color: t.warning[800], ...font(600) },
  tipText: { fontSize: 12.5, lineHeight: 18, color: t.neutral[700], ...font(400) },
  tipFoot: { marginTop: 2, fontSize: 11.5, lineHeight: 16, color: t.neutral[500], ...font(400) },
  tipClose: {
    width: 26, height: 26, marginTop: -2, marginRight: -2, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  tipClosePressed: { backgroundColor: t.warning[100] },
  addCount: { color: t.neutral[500], fontSize: 11.5, lineHeight: 18.4, ...font(500) },
}));
