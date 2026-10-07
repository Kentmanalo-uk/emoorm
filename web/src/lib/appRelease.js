import release from '../data/androidApp.json';
import { androidAppVersion } from './inApp';

/**
 * The Android app's latest release (data/androidApp.json) against what this
 * phone has: the app's own version when the site runs inside it, or, in a
 * phone's browser, the version last downloaded from this browser.
 */

export { release };

/** Whether version a ("1.2.0") comes before b ("1.3.0"). */
export const isOlder = (a, b) => {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
};

const DOWNLOADED = 'emoorm-apk-downloaded';

/** Remembers that this browser downloaded the current APK. */
export const rememberDownload = () => {
  try {
    localStorage.setItem(DOWNLOADED, release.version);
  } catch {
    /* private mode: nothing to remember */
  }
};

/** The version this browser last downloaded, or null. */
export const downloadedVersion = () => {
  try {
    return localStorage.getItem(DOWNLOADED);
  } catch {
    return null;
  }
};

/** Inside the app on an older version than the latest release. */
export const appUpdateAvailable = () => {
  const version = androidAppVersion();
  return Boolean(version && isOlder(version, release.version));
};

/**
 * Whether the app is installed on this phone, asked from its browser.
 * Chrome on Android only, and only once the app declares the site
 * (asset_statements); elsewhere it answers false.
 */
export const appInstalledHere = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.getInstalledRelatedApps) return false;
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some((app) => app.id === release.package);
  } catch {
    return false;
  }
};

/** Opens the installed app at this site (Android). */
export const openInAppUrl = (path = '/') => `intent://${window.location.host}${path}#Intent;scheme=https;package=${release.package};end`;
