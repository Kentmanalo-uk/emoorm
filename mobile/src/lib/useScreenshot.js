import { useCallback, useEffect, useRef } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { captureRef } from 'react-native-view-shot';

/**
 * Calls back when the person takes a screenshot of this screen, with a
 * picture of what they captured.
 *
 * Shops here are shared by screenshot constantly -- a photo of the page
 * sent to someone on Messenger -- and a screenshot carries no link, so
 * whoever receives it has to search for the thing by name. Noticing the
 * screenshot lets the app offer the link at the moment it is wanted, and
 * show what was captured so it is obvious what is about to be sent.
 *
 * The system never hands the app the screenshot it just took -- not on
 * iOS, not on Android -- and going after it through the photo library
 * would mean asking for the whole library to get at one picture. So the
 * app takes its own picture of the same screen instead, which needs no
 * permission at all and is what the preview shows.
 *
 *   const shot = useRef(null);
 *   useScreenshot(({ preview }) => share(what(), { preview }), ready);
 *   <View ref={shot} collapsable={false}>…the page…</View>
 *
 * @param {Function} onShot - called with { preview }, preview being a
 *   file:// path or null when the capture did not work
 * @param {Boolean} [enabled] - false while the screen is not in front
 * @returns {Object} the ref to put on the view that should be captured
 */
export default function useScreenshot(onShot, enabled = true) {
  const target = useRef(null);
  const latest = useRef(onShot);
  latest.current = onShot;

  const take = useCallback(async () => {
    let preview = null;
    try {
      if (target.current) {
        preview = await captureRef(target.current, { format: 'png', quality: 0.9 });
      }
    } catch {
      // A page mid-layout, or a view the platform will not draw: the
      // sheet still opens, just without the picture.
      preview = null;
    }
    latest.current?.({ preview });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let subscription = null;
    try {
      subscription = ScreenCapture.addScreenshotListener(() => { take(); });
    } catch {
      // Not available in this build; the rest of the screen is unaffected.
    }
    return () => subscription?.remove?.();
  }, [enabled, take]);

  return target;
}
