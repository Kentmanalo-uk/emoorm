/**
 * The website's Philippine address helpers (web/src/lib/phAddress.js), for
 * the sign-up and Google sign-up forms: the one province E-MOORM serves, its
 * municipalities (a fixed list) and their barangays from the public PSGC
 * service.
 */

export const PSGC_BASE = 'https://psgc.gitlab.io/api';

// In-memory cache so the same town's barangays are fetched once per session.
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
