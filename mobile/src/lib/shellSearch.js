import AsyncStorage from '@react-native-async-storage/async-storage';

// Buyer search history and suggestions (web/src/lib/buyerSearch.js), shared by
// the Home header's quick chips and the search page so both read one list.

export const POPULAR_SUGGESTIONS = [
  'Organic Honey',
  'Banana Chips',
  'Calamansi',
  'Native Bag',
  'Coconut Oil',
];

// The words the Home search box cycles through as its placeholder.
export const PLACEHOLDER_SUGGESTIONS = [
  'Organic Products',
  'Fresh Vegetables',
  'Native Delicacies',
  'Handicrafts',
  'Local Coffee',
  'Dried Fish',
  'Coconut Oil',
];

export const RECENT_KEY = 'emoorm_recent_searches';

export const loadRecent = async () => {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
};

const writeRecent = async (list) => {
  try { await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* best effort */ }
  return list;
};

export const saveRecent = async (query) => {
  const q = String(query || '').trim();
  const cur = await loadRecent();
  if (!q) return cur;
  return writeRecent([q, ...cur.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 8));
};

export const removeRecentTerm = async (term) => writeRecent((await loadRecent()).filter((s) => s !== term));

export const clearRecent = () => writeRecent([]);
