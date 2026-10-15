import { Platform } from 'react-native';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

/*
 * Any photo the phone can open, made ready to upload: HEIC/HEIF (iPhone
 * photos), PNG, WebP, AVIF, TIFF, huge 50 MP shots — all become a JPEG at
 * most `maxEdge` px on its longest side, so every upload passes the server's
 * type and size checks whatever was picked. GIFs are left as they are (an
 * animation would be lost), unless they are too big.
 *
 *   const file = await uploadableImage(asset);          // product, chat, review…
 *   const id = await uploadableImage(asset, ID_PHOTO);  // sharper, for reading an ID
 *
 * asset: an expo-image-picker / camera asset ({ uri, width?, height?,
 * mimeType?, fileName?, fileSize?, file? on the web}).
 * Returns { uri, mimeType: 'image/jpeg', fileName, file? (web) }.
 */

export const ID_PHOTO = { maxEdge: 2400, quality: 0.92 };
const GIF_KEEP_BYTES = 8 * 1024 * 1024;

const typeOf = (asset) => String(asset?.mimeType || asset?.file?.type || '').toLowerCase();
const nameFor = (prefix) => `${prefix}-${Date.now()}.jpg`;

export async function uploadableImage(asset, { maxEdge = 2048, quality = 0.85, prefix = 'photo' } = {}) {
  if (!asset?.uri && !asset?.file) throw new Error('No image selected');
  const size = asset.fileSize || asset.file?.size || 0;
  if (typeOf(asset) === 'image/gif' && (!size || size <= GIF_KEEP_BYTES)) return asset;

  try {
    // The picture's size, when the picker didn't say (a no-op pass reads it).
    let { width, height } = asset;
    const source = asset.uri;
    if (!width || !height) {
      const probe = await manipulateAsync(source, [], {});
      ({ width, height } = probe);
    }
    const longest = Math.max(width || 0, height || 0);
    // Only ever smaller, never blown up.
    const actions = longest > maxEdge
      ? [{ resize: width >= height ? { width: maxEdge } : { height: maxEdge } }]
      : [];
    const out = await manipulateAsync(source, actions, { compress: quality, format: SaveFormat.JPEG });
    const fileName = nameFor(prefix);
    const ready = { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg', fileName };
    if (Platform.OS === 'web') {
      // The web build sends the bytes: a File made from the converted picture.
      const blob = await (await fetch(out.uri)).blob();
      ready.file = new File([blob], fileName, { type: 'image/jpeg' });
    }
    return ready;
  } catch {
    // The phone couldn't convert it: send it as it is (the server re-encodes
    // what it can read, and says so plainly when it can't).
    return asset;
  }
}
