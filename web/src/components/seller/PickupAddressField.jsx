import { useState } from 'react';
import PhAddressPicker from '../common/PhAddressPicker';
import {
  SERVICE_PROVINCE,
  listServiceMunicipalities,
  normalizeName,
} from '../../lib/phAddress';

/**
 * The pickup address as one line, the way checkout writes addresses:
 * street, barangay, town, province.
 */
export const joinPickup = (p) => [p.street, p.barangay, p.municipalityName, SERVICE_PROVINCE.name]
  .map((s) => String(s || '').trim())
  .filter(Boolean)
  .join(', ');

/**
 * A saved pickup address split back into the picker's town, barangay and
 * street. Text typed before the picker keeps its words on the street line,
 * with the shop's own town chosen.
 * @param {String} text
 * @param {String} [shopTown] - The shop's municipality name
 */
export const splitPickup = (text, shopTown) => {
  const towns = listServiceMunicipalities();
  const findTown = (name) => towns.find((t) => normalizeName(t.name) === normalizeName(name));
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length && normalizeName(parts[parts.length - 1]) === normalizeName(SERVICE_PROVINCE.name)) parts.pop();
  let town = parts.length ? findTown(parts[parts.length - 1]) : null;
  let barangay = '';
  if (town) {
    parts.pop();
    barangay = parts.length ? parts.pop().replace(/^(brgy\.?|barangay)\s+/i, '') : '';
  } else {
    town = findTown(shopTown) || null;
  }
  return {
    province: SERVICE_PROVINCE.name,
    provinceCode: '',
    municipalityId: '',
    municipalityName: town?.name || '',
    municipalityCode: town?.code || '',
    barangay,
    barangayCode: '',
    street: parts.join(', '),
  };
};

/** What a pickup address chosen with the picker still needs, or null. */
export const pickupGap = (parts) => {
  if (!parts?.municipalityName) return 'Choose the town of your pickup spot.';
  if (!String(parts.barangay || '').trim()) return 'Choose the barangay of your pickup spot.';
  if (!String(parts.street || '').trim()) return 'Add the street, building or landmark so buyers can find your pickup spot.';
  return null;
};

/**
 * Phones: the pickup address picked like every other address in the app (the
 * town and barangay from the lists, then the street or a landmark) instead
 * of typed. The address text changes only when the seller changes something;
 * `onChange(text, parts)` gets the new line and its parts.
 */
export default function PickupAddressField({ value, shopTown, municipalities, onChange }) {
  // The picker finds the saved barangay on its list by itself.
  const [parts, setParts] = useState(() => splitPickup(value, shopTown));

  const handleChange = (next) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    // The picker also settles the province and the codes by itself; only the
    // seller's own changes rewrite the address.
    const moved = ['municipalityName', 'barangay', 'street']
      .some((k) => String(merged[k] || '') !== String(parts[k] || ''));
    if (moved) onChange(joinPickup(merged), merged);
  };

  return (
    <PhAddressPicker
      value={parts}
      onChange={handleChange}
      dbMunicipalities={municipalities}
      streetLabel="Street, building or landmark"
      streetPlaceholder="e.g. Stall 4, public market"
    />
  );
}
