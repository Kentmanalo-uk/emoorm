// Buyer-side product search history and suggestions, shared by the site
// header and the phone search page so both read and write the same list.
// (The Seller Center / admin search boxes keep theirs in searchHistory.js.)

export const POPULAR_SUGGESTIONS = [
  'Organic Honey',
  'Banana Chips',
  'Calamansi',
  'Native Bag',
  'Coconut Oil',
];

export const RECENT_KEY = 'emoorm_recent_searches';

export const loadRecent = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
};

const writeRecent = (list) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* silent */ }
  return list;
};

export const saveRecent = (query) => {
  const q = query.trim();
  if (!q) return loadRecent();
  const cur = loadRecent().filter((s) => s.toLowerCase() !== q.toLowerCase());
  return writeRecent([q, ...cur].slice(0, 8));
};

export const removeRecentTerm = (term) => writeRecent(loadRecent().filter((s) => s !== term));

export const clearRecent = () => writeRecent([]);
