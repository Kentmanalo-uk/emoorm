/**
 * Courier fees by weight.
 *
 * Philippine couriers price a parcel by its weight bracket and by where it
 * goes (region to region), not by kilometres. Emoorm delivers within
 * Oriental Mindoro, so a rate table has two columns: within the seller's
 * town, and to another town. A table:
 *
 *   {
 *     brackets: [{ upToKg: 0.5, sameTown: 85, otherTown: 85 }, …],  // ascending
 *     extraPerKg: { sameTown: 30, otherTown: 30 } | null,            // past the last bracket
 *     source: 'J&T Express rate card, Luzon to Luzon', asOf: '2025-01',
 *   }
 *
 * No `extraPerKg`: parcels heavier than the last bracket get no quote.
 */

const MAX_BRACKETS = 30;
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};

/**
 * Check and tidy a rate table from the admin form.
 * @returns {{ rates: Object|null, error: String|null }}
 */
const normalizeRates = (input) => {
  if (input == null || input === '') return { rates: null, error: null };
  if (typeof input !== 'object') return { rates: null, error: 'Rates must be a table' };
  const rows = Array.isArray(input.brackets) ? input.brackets : [];
  if (rows.length === 0) return { rates: null, error: null };
  if (rows.length > MAX_BRACKETS) return { rates: null, error: `At most ${MAX_BRACKETS} weight brackets` };

  const brackets = [];
  for (const row of rows) {
    const upToKg = Number(row?.upToKg);
    const sameTown = money(row?.sameTown);
    const otherTown = money(row?.otherTown);
    if (!Number.isFinite(upToKg) || upToKg <= 0 || upToKg > 100) {
      return { rates: null, error: 'Each bracket needs a weight between 0 and 100 kg' };
    }
    if (sameTown == null || otherTown == null) {
      return { rates: null, error: 'Each bracket needs a fee for the same town and for other towns' };
    }
    brackets.push({ upToKg: Math.round(upToKg * 1000) / 1000, sameTown, otherTown });
  }
  brackets.sort((a, b) => a.upToKg - b.upToKg);
  for (let i = 1; i < brackets.length; i += 1) {
    if (brackets[i].upToKg === brackets[i - 1].upToKg) {
      return { rates: null, error: `Two brackets are both up to ${brackets[i].upToKg} kg` };
    }
  }

  let extraPerKg = null;
  const extra = input.extraPerKg;
  if (extra && (extra.sameTown !== '' && extra.sameTown != null)) {
    const sameTown = money(extra.sameTown);
    const otherTown = money(extra.otherTown ?? extra.sameTown);
    if (sameTown == null || otherTown == null) return { rates: null, error: 'Extra kilo fees must be amounts' };
    extraPerKg = { sameTown, otherTown };
  }

  const text = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
  return {
    rates: { brackets, extraPerKg, source: text(input.source, 160), asOf: text(input.asOf, 20) },
    error: null,
  };
};

/**
 * The fee for a parcel, or null when the table can't price it (no table, or
 * heavier than its last bracket with no extra-kilo fee).
 * @param {Object|null} rates
 * @param {Number} grams - Parcel weight
 * @param {Boolean} sameTown - Buyer is in the seller's town
 */
const feeFor = (rates, grams, sameTown) => {
  const brackets = rates?.brackets;
  if (!Array.isArray(brackets) || brackets.length === 0) return null;
  const kg = Math.max(0, Number(grams) || 0) / 1000;
  const col = sameTown ? 'sameTown' : 'otherTown';
  const hit = brackets.find((b) => kg <= Number(b.upToKg));
  if (hit) return Number(hit[col]);
  const last = brackets[brackets.length - 1];
  const extra = rates.extraPerKg?.[col];
  if (extra == null) return null;
  return Number(last[col]) + Math.ceil(kg - Number(last.upToKg)) * Number(extra);
};

/** The heaviest parcel a table prices (Infinity with an extra-kilo fee). */
const maxKg = (rates) => {
  const brackets = rates?.brackets;
  if (!Array.isArray(brackets) || brackets.length === 0) return 0;
  return rates.extraPerKg ? Infinity : Number(brackets[brackets.length - 1].upToKg);
};

/** The cheapest fee in the table: "from ₱85". */
const lowestFee = (rates) => {
  const brackets = rates?.brackets;
  if (!Array.isArray(brackets) || brackets.length === 0) return null;
  return Math.min(...brackets.map((b) => Math.min(Number(b.sameTown), Number(b.otherTown))));
};

module.exports = { normalizeRates, feeFor, maxKg, lowestFee };
