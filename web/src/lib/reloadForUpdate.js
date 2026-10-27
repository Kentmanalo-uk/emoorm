const RELOADED_KEY = 'emoorm.reloadedForUpdate';

/**
 * Code that a deploy replaced while this tab was open (the old file is gone):
 * reload once, every few minutes at most, for the new version.
 * @returns {Boolean} true when it reloads
 */
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) || 0);
    if (Date.now() - last < 5 * 60 * 1000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    // No storage: reload anyway; the next failure shows the error card.
  }
  window.location.reload();
  return true;
}

/** Errors that mean "this page's code could not be fetched". */
export const STALE_CODE = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk|Unable to preload CSS/i;
