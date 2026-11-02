import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { resolveImg } from './media';

/**
 * The picture shown for a product with no photo of its own, which the
 * admin can set (App settings → productPlaceholder).
 *
 * One fetch for the whole app, kept here. Four components wanted this
 * value -- ProductImage, CartProductImage, ShopTileImage and
 * ChatProductThumb -- and each had its own copy of the same code with
 * its own module-level cache, so opening a screen that used several of
 * them asked the server for /app-settings several times over. The
 * promise below is made once and shared; later callers get the answer
 * already in hand.
 */
let value = null;
let asked = null;

const load = () => {
  asked = asked || apiClient.get('/app-settings')
    .then((res) => {
      const custom = res?.data?.productPlaceholder;
      value = custom && custom !== '/brand-icon.png' ? resolveImg(custom) : null;
      return value;
    })
    .catch(() => null);
  return asked;
};

/**
 * The admin's placeholder, or null for the app's own brand mark.
 * Asked for only while something actually needs it.
 * @param {Boolean} needed - whether a photo is missing or broken
 */
export default function useProductPlaceholder(needed) {
  const [custom, setCustom] = useState(value);
  useEffect(() => {
    if (!needed) return undefined;
    let live = true;
    load().then(() => { if (live) setCustom(value); });
    return () => { live = false; };
  }, [needed]);
  return custom;
}
