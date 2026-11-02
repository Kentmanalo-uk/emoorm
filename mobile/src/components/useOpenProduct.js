import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getCachedData, setCachedData } from '../lib/dataCache';
import { galleryImg } from '../lib/media';
import {
  canFlyHero, launchHero, productGalleryBox, rememberCardPhoto,
} from './HeroFlight';

/**
 * Opening a product from anywhere a photo of it is on screen: a card, a cart
 * line, a shop's row. All of them arrive the same way:
 *
 *  - the page opens whole, from what this card already knows, when it knows
 *    enough (`seed`: a snapshot like Recently Viewed has no shop or options);
 *  - the gallery starts on the very picture that was tapped, which is already
 *    in memory, and the sharp copy begins loading now to fade in over it;
 *  - with `photoRef`, that picture flies there (components/HeroFlight).
 *
 *   const openProduct = useOpenProduct();
 *   openProduct({ slug, photo, shown, seed, photoRef, aspect });
 *
 * photo: the stored path. shown: the address of the picture on screen, exactly
 * as it was asked for, so it comes from memory.
 */
export default function useOpenProduct() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return useCallback(({
    slug, photo, shown, seed, photoRef, aspect,
  }) => {
    const push = () => router.push(`/product/${slug}`);
    const key = `product:${slug}`;
    if (seed?.store && seed.variations !== undefined && !getCachedData(key)) setCachedData(key, seed);
    if (shown) rememberCardPhoto(slug, shown);
    if (photo) Image.prefetch(galleryImg(photo, width)).catch(() => {});

    const node = photoRef?.current;
    if (!shown || !node || !canFlyHero()) {
      push();
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      const flying = launchHero({
        slug, uri: shown, from: { x, y, width: w, height: h }, to: productGalleryBox(insets, width), aspect,
      });
      if (!flying) {
        push();
        return;
      }
      // The flight is on screen and moving (native) before the page is built.
      requestAnimationFrame(() => router.push({ pathname: '/product/[slug]', params: { slug, via: 'card' } }));
    });
  }, [insets, router, width]);
}
