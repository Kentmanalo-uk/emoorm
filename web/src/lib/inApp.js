/**
 * Whether the site is running inside the E-MOORM Android app (apk/): its web
 * view's user agent ends in "EmoormApp/<version>".
 */
export const inAndroidApp = () => typeof navigator !== 'undefined' && /\bEmoormApp\/\d/.test(navigator.userAgent);

/** The app's version ("1.3.0") when running inside it, else null. */
export const androidAppVersion = () => (typeof navigator === 'undefined'
  ? null
  : /\bEmoormApp\/(\d[\d.]*)/.exec(navigator.userAgent)?.[1] || null);

/**
 * Where a page keeps what it remembers of this visit (scroll spots, the tab
 * picked…): the browser tab's session storage — or, inside the app, the
 * phone's local storage, since closing an app ends its session and people
 * expect it to reopen where they left it.
 * @returns {Storage|null}
 */
export const visitStorage = () => {
  try {
    return inAndroidApp() ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};
