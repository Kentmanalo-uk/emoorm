import { PSGC_BASE, SERVICE_PROVINCE, barangayKey, listServiceMunicipalities, normalizeName } from './phAddress';

/*
 * The address at a map pin, for filling the address form from it: the town
 * and barangay as the address picker lists them (PSGC names and codes, so
 * the picker shows them as picked) and the street, from OpenStreetMap's
 * reverse lookup (Nominatim).
 *
 * OpenStreetMap often names the barangay but not the town outside the
 * cities, so the town comes from the barangay: Oriental Mindoro's barangays
 * (PSGC) say which town each is in. A name two towns share counts only when
 * OpenStreetMap also gave the town.
 *
 * addressFromPin({ latitude, longitude }) →
 *   { outside: true }                                       not in Oriental Mindoro
 *   { municipalityCode, municipalityName, barangay, barangayCode, street }
 *     (any of them '' when the lookup could not tell)
 * Throws when the lookup itself fails (no connection).
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const PROVINCE_BARANGAYS = `${PSGC_BASE}/provinces/${SERVICE_PROVINCE.code}/barangays/`;
// Browsers send their own User-Agent (and the site as Referer), which is how
// OpenStreetMap's usage policy asks a web page to be known.
const HEADERS = { Accept: 'application/json', 'Accept-Language': 'en' };

// "San Vicente East (Pob.)" and "San Vicente East" are the same barangay.
const brgyKey = (name) => barangayKey(String(name || '').replace(/\(.*?\)/g, ' '));

const fetchJson = async (url, ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

// The province's barangays, loaded once (again only after a failed load).
let barangaysOnce = null;
const provinceBarangays = () => {
  if (!barangaysOnce) {
    barangaysOnce = fetchJson(PROVINCE_BARANGAYS, 12000)
      .then((list) => (list || []).map((b) => ({
        code: b.code, name: b.name, town: b.municipalityCode || b.cityCode || '', key: brgyKey(b.name),
      })))
      .catch((err) => { barangaysOnce = null; throw err; });
  }
  return barangaysOnce;
};

const reverseUrl = (latitude, longitude, digits) => `${NOMINATIM}?${new URLSearchParams({
  format: 'jsonv2', lat: Number(latitude).toFixed(digits), lon: Number(longitude).toFixed(digits), addressdetails: '1', zoom: '18',
})}`;

// OpenStreetMap's cache can hold an answer first asked for by an app (not a
// browser), stored without the header that lets a web page read it: the
// browser then refuses it. The same spot written to one more decimal is a
// fresh request.
const reverse = async (latitude, longitude) => {
  try {
    return await fetchJson(reverseUrl(latitude, longitude, 6), 9000);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return fetchJson(reverseUrl(latitude, longitude, 7), 9000);
  }
};

export async function addressFromPin({ latitude, longitude }) {
  // Start the barangay list alongside the lookup; a failed list only costs the barangay.
  const barangays = provinceBarangays().catch(() => []);
  const a = (await reverse(latitude, longitude))?.address || {};

  if (a['ISO3166-2-lvl4'] !== 'PH-MDR' && normalizeName(a.state) !== normalizeName(SERVICE_PROVINCE.name)) {
    return { outside: true };
  }

  // The town, when OpenStreetMap has it.
  const towns = listServiceMunicipalities();
  const townName = a.city || a.town || a.municipality || '';
  let town = townName ? towns.find((m) => normalizeName(m.name) === normalizeName(townName)) || null : null;

  // The barangay: the first of OpenStreetMap's place names that is one (in that town, when known).
  let barangay = null;
  const list = await barangays;
  for (const name of [a.village, a.quarter, a.suburb, a.neighbourhood, a.hamlet, a.city_district]) {
    if (!name) continue;
    const matches = list.filter((b) => b.key === brgyKey(name));
    const pick = town
      ? matches.find((b) => b.town === town.code)
      : (new Set(matches.map((b) => b.town)).size === 1 ? matches[0] : null);
    if (pick) {
      barangay = pick;
      if (!town) town = towns.find((m) => m.code === pick.town) || null;
      break;
    }
  }

  return {
    municipalityCode: town?.code || '',
    municipalityName: town?.name || '',
    barangay: barangay?.name || '',
    barangayCode: barangay?.code || '',
    street: [a.house_number, a.road].filter(Boolean).join(' '),
  };
}

export default addressFromPin;
