import { MUNICIPALITIES, barangayKey, normalizeName } from '../components/profile/ProfileAddressPicker';

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
const PROVINCE_BARANGAYS = 'https://psgc.gitlab.io/api/provinces/175200000/barangays/';
// OpenStreetMap's usage policy asks apps to name themselves.
const HEADERS = { Accept: 'application/json', 'Accept-Language': 'en', 'User-Agent': 'EmoormApp/1.0 (Oriental Mindoro marketplace)' };

// "San Vicente East (Pob.)" and "San Vicente East" are the same barangay.
const brgyKey = (name) => barangayKey(String(name || '').replace(/\(.*?\)/g, ' '));

let barangaysOnce = null;
const provinceBarangays = () => {
  if (!barangaysOnce) {
    barangaysOnce = fetch(PROVINCE_BARANGAYS)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`PSGC ${r.status}`))))
      .then((list) => list.map((b) => ({
        code: b.code, name: b.name, town: b.municipalityCode || b.cityCode || '', key: brgyKey(b.name),
      })))
      .catch((err) => { barangaysOnce = null; throw err; });
  }
  return barangaysOnce;
};

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), ms); }),
]);

export async function addressFromPin({ latitude, longitude }) {
  const url = `${NOMINATIM}?${new URLSearchParams({
    format: 'jsonv2', lat: String(latitude), lon: String(longitude), addressdetails: '1', zoom: '18',
  })}`;
  const res = await withTimeout(fetch(url, { headers: HEADERS }), 9000);
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const a = (await res.json())?.address || {};

  if (a['ISO3166-2-lvl4'] !== 'PH-MDR' && normalizeName(a.state) !== normalizeName('Oriental Mindoro')) {
    return { outside: true };
  }

  // The town, when OpenStreetMap has it.
  const townName = a.city || a.town || a.municipality || '';
  let town = townName ? MUNICIPALITIES.find((m) => normalizeName(m.name) === normalizeName(townName)) : null;

  // The barangay: the first of OpenStreetMap's place names that is one (in that town, when known).
  let barangay = null;
  const list = await withTimeout(provinceBarangays(), 9000).catch(() => []);
  for (const name of [a.village, a.quarter, a.suburb, a.neighbourhood, a.hamlet, a.city_district]) {
    if (!name) continue;
    const matches = list.filter((b) => b.key === brgyKey(name));
    const pick = town
      ? matches.find((b) => b.town === town.code)
      : (new Set(matches.map((b) => b.town)).size === 1 ? matches[0] : null);
    if (pick) {
      barangay = pick;
      if (!town) town = MUNICIPALITIES.find((m) => m.code === pick.town) || null;
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
