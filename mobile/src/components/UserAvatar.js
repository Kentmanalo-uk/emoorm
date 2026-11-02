import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Avatar from './avatars/Avatar';
import { resolveImg } from '../lib/media';

/**
 * A person's picture, wherever one is shown.
 *
 * Three things in order, and the last one always works:
 *
 *   1. the photo they uploaded;
 *   2. the avatar they picked, if they picked one;
 *   3. the avatar their own account id works out to.
 *
 * So nobody is ever a blank circle or a grey letter -- including every
 * account that existed before any of this, since the third needs nothing
 * stored. A photo that fails to load falls through to the same place, so
 * a broken link looks like a picture rather than a hole.
 *
 * This is for people. A shop's logo is not a person and does not get a
 * creature: pass a `fallback` for those, or use ChatAvatar's icon.
 *
 * @param {{ id, profilePhoto, avatarKey }} [user]
 * @param {String} [src] - a photo to use instead of the user's own
 */
export default function UserAvatar({ user, src, size = 40, style, fallback = null }) {
  const photo = src !== undefined ? src : user?.profilePhoto;
  const uri = photo ? resolveImg(photo) : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);

  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.box, box, style]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.img} resizeMode="cover" onError={() => setFailed(true)} />
      ) : fallback || <Avatar seed={user?.id} name={user?.avatarKey} size={size} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  img: { width: '100%', height: '100%' },
});
