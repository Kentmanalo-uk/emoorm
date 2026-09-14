/**
 * Philippine Standard Geographic Code (PSGC) client.
 *
 * The picker/pages use these helpers to load provinces, cities/municipalities,
 * and barangays from the public PSGC service and normalise them for
 * cross-referencing against the platform's own Municipality catalogue.
 */

export const PSGC_BASE = 'https://psgc.gitlab.io/api';

// Simple in-memory cache to avoid re-fetching the same endpoints during a session.
const cache = new Map();

const cachedFetch = async (url) => {
  if (cache.has(url)) return cache.get(url);
  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PSGC ${res.status}`);
    return res.json();
  })();
  cache.set(url, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(url);
    throw err;
  }
};

export const normalizeName = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .replace(/\s+city$/i, '')
    .replace(/city of\s+/i, '')
    .replace(/[^a-z0-9]+/gi, '')
    .trim();

export const listProvinces = async () => {
  const data = await cachedFetch(`${PSGC_BASE}/provinces/`);
  return (data || [])
    .map((p) => ({ code: p.code, name: p.name, regionCode: p.regionCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const listMunicipalitiesByProvince = async (provinceCode) => {
  if (!provinceCode) return [];
  const [munis, cities] = await Promise.all([
    cachedFetch(`${PSGC_BASE}/provinces/${provinceCode}/municipalities/`).catch(() => []),
    cachedFetch(`${PSGC_BASE}/provinces/${provinceCode}/cities/`).catch(() => []),
  ]);
  return [...(munis || []), ...(cities || [])]
    .map((m) => ({ code: m.code, name: m.name, isCity: !!(cities || []).find((c) => c.code === m.code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const listBarangaysByMunicipality = async (municipalityCode) => {
  if (!municipalityCode) return [];
  let data = await cachedFetch(`${PSGC_BASE}/municipalities/${municipalityCode}/barangays/`).catch(() => null);
  if (!data) {
    data = await cachedFetch(`${PSGC_BASE}/cities/${municipalityCode}/barangays/`).catch(() => []);
  }
  return (data || [])
    .map((b) => ({ code: b.code, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Match a DB municipality (by name) to a PSGC record from the given list. */
export const matchPsgcMunicipality = (dbName, psgcList) => {
  if (!dbName || !Array.isArray(psgcList)) return null;
  const target = normalizeName(dbName);
  return psgcList.find((m) => normalizeName(m.name) === target) || null;
};
