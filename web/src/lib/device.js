/**
 * What kind of device this is, for features only a phone can use (opening
 * another app). A computer with a narrow window is not a phone.
 */

const userAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');

/** A phone or tablet: a touch screen and a mobile browser. */
export const isTouchPhone = () => typeof window !== 'undefined'
  && window.matchMedia('(pointer: coarse)').matches
  && /Android|iPhone|iPad|iPod/i.test(userAgent());

/** Android, where apps are opened by their package name. */
export const isAndroid = () => /Android/i.test(userAgent());
