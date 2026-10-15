import * as Font from 'expo-font';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';

/*
 * Testing in Expo Go: the fonts by another road. On some iPhones Expo Go's
 * asset downloader (expo-asset, which useFonts uses) fails on every address
 * ("Unable to download asset": it has no file system to save to there),
 * while the app's normal networking works. So each font is fetched from the
 * dev server, saved in the app's cache with expo-file-system and loaded from
 * that file (a file:// font is not downloaded again).
 *
 * Release builds carry their fonts inside the app; they never get here.
 *
 * @param {Object} fonts - the same { name: require(…) } map useFonts takes
 */
export async function loadFontsByFetch(fonts) {
  const local = {};
  await Promise.all(Object.entries(fonts).map(async ([name, mod]) => {
    const { uri } = Asset.fromModule(mod);
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = new File(Paths.cache, `devfont-${name}.ttf`);
    if (!file.exists) file.create();
    file.write(bytes);
    local[name] = file.uri;
  }));
  await Font.loadAsync(local);
}

export default loadFontsByFetch;
