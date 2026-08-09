const entries = new Map();
const pending = new Map();

export function getCacheEntry(key) {
  return entries.get(key) || null;
}

export function getCachedData(key, maxAge = Infinity) {
  const entry = getCacheEntry(key);
  if (!entry || Date.now() - entry.updatedAt > maxAge) return null;
  return entry.data;
}

export function setCachedData(key, data) {
  entries.set(key, { data, updatedAt: Date.now() });
  return data;
}

export function updateCachedData(key, updater) {
  const entry = getCacheEntry(key);
  if (!entry) return null;
  return setCachedData(key, updater(entry.data));
}

export function invalidateCachedData(prefix) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

export function clearCachedData() {
  entries.clear();
  pending.clear();
}

export async function refreshCachedData(key, loader) {
  if (pending.has(key)) return pending.get(key);
  const request = loader()
    .then((data) => setCachedData(key, data))
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
