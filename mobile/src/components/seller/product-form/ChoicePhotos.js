import { useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraIcon, ImagesIcon, TrashIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { toast } from '../../../lib/toast';
import { uploadImage } from '../../../lib/upload';
import { resolveImg } from '../../../lib/media';
import Sheet, { SheetOption } from '../../Sheet';
import { PF } from './parts';

const TILE = 64;

/*
 * A photo for each choice (optional), e.g. Color: Red with a red one.
 * Buyers see it when they pick that choice. Only one choice type can have
 * photos; `photosOn` names the one that has them now (adding here moves them).
 * onPhoto(choice, url | null)
 */
export default function ChoicePhotos({ group, onPhoto, photosOn = null }) {
  const [busy, setBusy] = useState(null);
  const [asking, setAsking] = useState(null);
  const images = group.images || {};

  const open = async (choice, source) => {
    if (asking) {
      setAsking(null);
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
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      setBusy(choice);
      try {
        const res = await uploadImage(result.assets[0]);
        onPhoto(choice, res.url);
      } catch (err) {
        toast.error(err.message || 'The photo could not be uploaded');
      } finally {
        setBusy(null);
      }
    } catch {
      toast.error('Could not open your photos');
    }
  };

  // The web build has no camera to ask for: straight to the files.
  const pick = (choice) => {
    if (busy) return;
    if (Platform.OS === 'web' && !images[choice]) open(choice, 'library');
    else setAsking(choice);
  };

  if (!group.choices.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Photo for each choice <Text style={styles.optional}>(optional)</Text></Text>
      <Text style={styles.hint}>
        {photosOn
          ? `Photos are on ${photosOn} now. Adding one here moves them to this type.`
          : 'Buyers see it when they pick that choice.'}
      </Text>
      <View style={styles.tiles}>
        {group.choices.map((c) => {
          const src = images[c];
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={src ? `Change the photo for ${c}` : `Add a photo for ${c}`}
              onPress={() => pick(c)}
              style={styles.item}
            >
              <View style={[styles.tile, src ? styles.tileOn : null]}>
                {busy === c ? (
                  <ActivityIndicator size={18} color={PF.muted} />
                ) : src ? (
                  <Image source={{ uri: resolveImg(src) || src }} style={styles.img} />
                ) : (
                  <CameraIcon size={20} color={PF.green} />
                )}
              </View>
              <Text style={styles.name} numberOfLines={1}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      <Sheet variant="seller" open={!!asking} title={asking ? `Photo for ${asking}` : 'Photo'} onClose={() => setAsking(null)}>
        {Platform.OS !== 'web' ? (
          <SheetOption
            variant="seller"
            label="Take a photo"
            onPress={() => open(asking, 'camera')}
            right={<CameraIcon size={20} color={t.neutral[500]} />}
          />
        ) : null}
        <SheetOption
          variant="seller"
          label="Choose from your gallery"
          onPress={() => open(asking, 'library')}
          right={<ImagesIcon size={20} color={t.neutral[500]} />}
        />
        {asking && images[asking] ? (
          <SheetOption
            variant="seller"
            danger
            label="Remove photo"
            onPress={() => {
              onPhoto(asking, null);
              setAsking(null);
            }}
            right={<TrashIcon size={20} color={PF.danger} />}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, minWidth: 0, paddingTop: 10, borderTopWidth: 1, borderTopColor: PF.line },
  label: { fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(600) },
  optional: { color: PF.muted, ...font(400) },
  hint: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(400) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 2 },
  item: { width: TILE, gap: 4, alignItems: 'center' },
  tile: {
    width: TILE, height: TILE, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  tileOn: { borderStyle: 'solid', borderColor: PF.line },
  img: { width: '100%', height: '100%', resizeMode: 'cover' },
  name: {
    width: TILE, fontSize: 12, lineHeight: 16, color: PF.ink, textAlign: 'center', ...font(500),
  },
});
