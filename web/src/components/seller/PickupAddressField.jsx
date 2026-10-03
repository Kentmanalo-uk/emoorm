import { useState } from 'react';
import PhAddressPicker from '../common/PhAddressPicker';
import { joinPickup, splitPickup } from '../../lib/pickupAddress';

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
