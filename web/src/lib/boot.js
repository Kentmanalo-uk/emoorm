/*
 * What the server put into the page for the first screen (backend
 * middleware/webApp.js): app settings, categories and banners, the same for
 * every visitor, in <script type="application/json" id="emoorm-boot">. The
 * first screen starts from them instead of asking for each in turn after
 * the page has loaded.
 *
 * A page can be older than it looks (the service worker keeps one to open
 * at once), so the data counts only while it is a few minutes old; after
 * that the app asks as before.
 */

const FRESH_MS = 5 * 60 * 1000;
let boot;

/** The page's data ({ at, appSettings, categories, banners }), or null. */
export const bootData = () => {
  if (boot !== undefined) return boot;
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('emoorm-boot') : null;
    boot = el ? JSON.parse(el.textContent) : null;
  } catch {
    boot = null;
  }
  return boot;
};

/** One piece of it while it is fresh, else undefined. */
export const freshBoot = (key) => {
  const data = bootData();
  if (!data || data[key] === undefined || !(Date.now() - Number(data.at) < FRESH_MS)) return undefined;
  return data[key];
};
