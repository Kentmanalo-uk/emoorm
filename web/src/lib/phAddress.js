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

/**
 * The one province the platform serves, and its municipalities.
 *
 * The PSGC codes are real — the barangay lookup keys on them — while the
 * names match the platform's own municipality catalogue, so the two line up
 * without surprises (PSGC spells Calapan "City of Calapan").
 *
 * A constant rather than a fetch: a province's municipalities do not change,
 * and every address form used to wait on two PSGC round trips before it could
 * offer a single option.
 */
export const SERVICE_REGION = Object.freeze({
  code: '170000000',
  name: 'MIMAROPA Region',
  shortName: 'MIMAROPA',
});

export const SERVICE_PROVINCE = Object.freeze({
  code: '175200000',
  name: 'Oriental Mindoro',
  regionCode: SERVICE_REGION.code,
});

export const SERVICE_MUNICIPALITIES = Object.freeze([
  { code: '175201000', name: 'Baco' },
  { code: '175202000', name: 'Bansud' },
  { code: '175203000', name: 'Bongabong' },
  { code: '175204000', name: 'Bulalacao' },
  { code: '175205000', name: 'Calapan City', isCity: true },
  { code: '175206000', name: 'Gloria' },
  { code: '175207000', name: 'Mansalay' },
  { code: '175208000', name: 'Naujan' },
  { code: '175209000', name: 'Pinamalayan' },
  { code: '175210000', name: 'Pola' },
  { code: '175211000', name: 'Puerto Galera' },
  { code: '175212000', name: 'Roxas' },
  { code: '175213000', name: 'San Teodoro' },
  { code: '175214000', name: 'Socorro' },
  { code: '175215000', name: 'Victoria' },
].map(Object.freeze));

/** The served municipalities, in the order the picker lists them. */
export const listServiceMunicipalities = () => SERVICE_MUNICIPALITIES.slice();

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
