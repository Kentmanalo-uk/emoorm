/*
 * Image search hand-offs, kept for this app run (the website uses router
 * state and sessionStorage 'emoorm.image-search'):
 *
 *   pending file   the search page's image sheet → /search-by-image
 *   last results   /search-by-image → /products?imageSearch=1
 */

let pendingFile = null;
let lastSearch = { results: [], previewUrl: '' };

/** The picked image (an expo-image-picker asset) for /search-by-image to search. */
export const setPendingImage = (asset) => { pendingFile = asset || null; };

/** Takes the picked image once, so going Back does not search it again. */
export const takePendingImage = () => {
  const asset = pendingFile;
  pendingFile = null;
  return asset;
};

export const saveImageSearch = ({ results, previewUrl }) => {
  lastSearch = { results: Array.isArray(results) ? results : [], previewUrl: previewUrl || '' };
};

export const readImageSearch = () => lastSearch;

export const clearImageSearch = () => { lastSearch = { results: [], previewUrl: '' }; };
