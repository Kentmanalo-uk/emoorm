/**
 * A seller's own delivery as one plain list: each line is a place and what
 * delivery costs there ("All of Bongabong · ₱30", "Roxas · Cantil, Bagumbayan
 * · Free delivery", "Bongabong · Brgy. Labasan · ₱50"). No way to charge to
 * pick: the list is turned into the request the server knows
 * (PUT /stores/my/delivery, backend storeDelivery.service), priced by
 * deliveryQuote.service:
 *
 *   every place the same fee   → FLAT (FREE when it is ₱0), the fee kept on each place too
 *   different fees             → PER_BARANGAY: a whole town's line is the town's fee,
 *                                a barangay's line overrides it
 *   "Charge by distance"       → PER_KM; the places stay (where), with their fees kept
 *
 *   plan = {
 *     places: [{ key, municipalityId, barangays: [name] (none: the whole town), fee: Number|null }],
 *     distance: Boolean,
 *     perKm: { baseFee, includedKm, perKm, maxKm } (text as typed),
 *   }
 *
 * A town has at most one whole-town line; its barangays sit in lines of their
 * own, one per fee, and a barangay is in one line only.
 */

export const MAX_FEE = 5000;

/** The fees offered as one tap. */
export const QUICK_FEES = [0, 20, 30, 50];

export const pesos = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** A fee as a form holds it: '' (none) or the amount as text. */
export const feeText = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value)));

/** A typed fee: null (blank), the amount, or undefined when it is not ₱0 to ₱5,000 with up to 2 decimals. */
export const parseFee = (text, max = MAX_FEE) => {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return undefined;
  return Math.round(n * 100) / 100;
};

/** A typed distance: null (blank), km to 0.1, or undefined if not 0 to 100. */
export const parseKm = (text) => {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 10) / 10;
};

/** A barangay's key: its name, trimmed, any case. */
export const brgyKey = (name) => String(name || '').trim().toLowerCase();

/** "Brgy. Poblacion", without doubling a "Brgy." or "Barangay" already there. */
export const brgyLabel = (name) => (/^(brgy\.?|bgy\.?|barangay)\s/i.test(String(name || '')) ? name : `Brgy. ${name}`);

/** "Free delivery", "₱30", or "No fee yet". */
export const feeLabel = (fee) => (fee == null ? 'No fee yet' : Number(fee) === 0 ? 'Free delivery' : pesos(fee));

let seq = 0;
const newKey = () => {
  seq += 1;
  return `place-${seq}`;
};

export const isWhole = (place) => !place.barangays?.length;

export const emptyPlan = () => ({
  places: [],
  distance: false,
  perKm: {
    baseFee: '', includedKm: '', perKm: '', maxKm: '',
  },
});

const sameFee = (a, b) => (a == null ? b == null : b != null && Number(a) === Number(b));
const byName = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });

/**
 * The list for what is saved (GET /stores/my/delivery), each place with what
 * buyers pay there now (as deliveryQuote.service works it out).
 * @param {Object} saved - { mode, flatFee, perKm, areas: [{ municipalityId, barangay, fee }] }
 * @param {Number} [platformFee] - The platform's delivery fee (a place without a fee pays it)
 */
export const planFromSaved = (saved, platformFee = null) => {
  const plan = emptyPlan();
  const p = saved?.perKm || {};
  plan.perKm = {
    baseFee: feeText(p.baseFee), includedKm: feeText(p.includedKm), perKm: feeText(p.perKm), maxKm: feeText(p.maxKm),
  };
  const areas = saved?.areas || [];
  const mode = saved?.mode || 'PER_KM';
  plan.distance = mode === 'PER_KM' && p.baseFee != null;
  const num = (v) => (v == null ? null : Number(v));
  const shopFee = num(saved?.flatFee);
  const fallback = shopFee ?? num(platformFee);

  const towns = [...new Set(areas.map((a) => a.municipalityId))];
  for (const id of towns) {
    const inTown = areas.filter((a) => a.municipalityId === id);
    const whole = inTown.find((a) => !a.barangay);
    const wholeFee = num(whole?.fee);
    const townFee = wholeFee ?? num(inTown.find((a) => a.fee != null)?.fee);
    // What a place costs now, by the saved way to charge.
    const feeOf = (a) => {
      if (mode === 'FREE') return 0;
      if (mode === 'FLAT') return shopFee ?? num(platformFee);
      if (mode === 'PER_TOWN') return townFee ?? fallback;
      if (mode === 'PER_BARANGAY') return num(a.fee) ?? wholeFee ?? fallback;
      // By distance: the fee kept for the place (shown again when switched back).
      if (plan.distance) return num(a.fee);
      return num(a.fee) ?? fallback;
    };
    if (whole) {
      plan.places.push({
        key: newKey(), municipalityId: id, barangays: [], fee: feeOf(whole),
      });
    }
    // Barangays in one line per fee.
    const groups = [];
    for (const a of inTown.filter((x) => x.barangay)) {
      const fee = feeOf(a);
      const group = groups.find((g) => sameFee(g.fee, fee));
      if (group) group.barangays.push(a.barangay);
      else groups.push({ fee, barangays: [a.barangay] });
    }
    for (const g of groups) {
      plan.places.push({
        key: newKey(), municipalityId: id, barangays: g.barangays.sort(byName), fee: g.fee,
      });
    }
  }
  return plan;
};

/**
 * The list in the order shown: the shop's own town first, then by town name;
 * in a town its whole-town line first, then its barangays.
 */
export const sortPlaces = (places, homeId, nameOf) => [...places].sort((a, b) => {
  if (a.municipalityId !== b.municipalityId) {
    if (a.municipalityId === homeId) return -1;
    if (b.municipalityId === homeId) return 1;
    return byName(nameOf(a.municipalityId), nameOf(b.municipalityId));
  }
  if (isWhole(a) !== isWhole(b)) return isWhole(a) ? -1 : 1;
  return byName(a.barangays[0] || '', b.barangays[0] || '');
});

/** The town's whole-town line, if any. */
export const wholeTown = (plan, townId, exceptKey = null) => plan.places
  .find((p) => p.municipalityId === townId && isWhole(p) && p.key !== exceptKey) || null;

/**
 * The list with a place added or changed (editKey: the line being changed).
 * A whole town that is already listed gets the new fee; barangays leave any
 * other line of the town they were in, and join a line of the town with the
 * same fee.
 * @param {{ municipalityId, barangays, fee }} entry
 */
export const putPlace = (plan, entry, editKey = null) => {
  let places = plan.places.filter((p) => p.key !== editKey);
  const town = entry.municipalityId;
  if (!entry.barangays?.length) {
    const listed = places.find((p) => p.municipalityId === town && isWhole(p));
    if (listed) places = places.map((p) => (p === listed ? { ...p, fee: entry.fee } : p));
    else places.push({ key: editKey || newKey(), municipalityId: town, barangays: [], fee: entry.fee });
    return { ...plan, places };
  }
  const picked = new Set(entry.barangays.map(brgyKey));
  places = places
    .map((p) => (p.municipalityId === town && !isWhole(p)
      ? { ...p, barangays: p.barangays.filter((b) => !picked.has(brgyKey(b))) }
      : p))
    .filter((p) => isWhole(p) || p.barangays.length);
  const same = places.find((p) => p.municipalityId === town && !isWhole(p) && sameFee(p.fee, entry.fee));
  if (same) {
    places = places.map((p) => (p === same ? { ...p, barangays: [...p.barangays, ...entry.barangays].sort(byName) } : p));
  } else {
    places.push({
      key: editKey || newKey(), municipalityId: town, barangays: [...entry.barangays].sort(byName), fee: entry.fee,
    });
  }
  return { ...plan, places };
};

/** Every town not listed yet, whole, at this fee ("All towns in Oriental Mindoro"). */
export const putAllTowns = (plan, townIds, fee) => townIds.reduce(
  (next, id) => (wholeTown(next, id) ? next : putPlace(next, { municipalityId: id, barangays: [], fee })),
  plan,
);

export const removePlace = (plan, key) => ({ ...plan, places: plan.places.filter((p) => p.key !== key) });

/**
 * One fee for every place. A town's barangay lines join into one, and go
 * when the whole town is listed (the town's fee covers them now).
 */
export const setAllFees = (plan, fee) => {
  const places = [];
  for (const p of plan.places) {
    if (isWhole(p)) {
      places.push({ ...p, fee });
    } else if (!plan.places.some((x) => x.municipalityId === p.municipalityId && isWhole(x))) {
      const joined = places.find((x) => x.municipalityId === p.municipalityId && !isWhole(x));
      if (joined) joined.barangays = [...joined.barangays, ...p.barangays].sort(byName);
      else places.push({ ...p, barangays: [...p.barangays], fee });
    }
  }
  return { ...plan, places };
};

/** Places without a fee (added while charging by distance) get this one. */
export const fillMissingFees = (plan, fee) => plan.places.reduce(
  (next, p) => (p.fee == null ? putPlace(next, { ...p, fee }, p.key) : next),
  plan,
);

export const unpricedPlaces = (plan) => plan.places.filter((p) => p.fee == null);

/** Every barangay delivered to, as the request's areas. */
const planAreas = (plan) => plan.places.flatMap((p) => (isWhole(p)
  ? [{ municipalityId: p.municipalityId, barangay: null, fee: p.fee }]
  : p.barangays.map((b) => ({ municipalityId: p.municipalityId, barangay: b, fee: p.fee }))));

/** The fees the list uses, once each. */
export const planFees = (plan) => [...new Set(plan.places.map((p) => p.fee).filter((f) => f != null).map(Number))].sort((a, b) => a - b);

/** The request that saves the list (PUT /stores/my/delivery). */
export const planRequest = (plan) => {
  const areas = planAreas(plan);
  const km = {};
  const base = parseFee(plan.perKm.baseFee);
  const perKm = parseFee(plan.perKm.perKm);
  const included = parseKm(plan.perKm.includedKm);
  const max = parseKm(plan.perKm.maxKm);
  if (base !== undefined) km.baseFee = base;
  if (perKm !== undefined) km.perKm = perKm;
  if (included !== undefined) km.includedKm = included;
  if (max !== undefined && !(max !== null && max < 0.5)) km.maxKm = max;
  if (plan.distance) return { mode: 'PER_KM', areas, perKm: km };
  const fees = planFees(plan);
  const priced = plan.places.every((p) => p.fee != null);
  if (priced && fees.length === 1) {
    return fees[0] === 0
      ? { mode: 'FREE', areas, perKm: km }
      : {
        mode: 'FLAT', flatFee: fees[0], areas, perKm: km,
      };
  }
  // No places at all: nothing to price.
  if (!areas.length) return { mode: 'FREE', areas, perKm: km };
  return { mode: 'PER_BARANGAY', areas, perKm: km };
};

/**
 * What still needs fixing before the list can be saved: [{ key, message }].
 * @param {Function} nameOf - A town's name from its id
 */
export const planProblems = (plan, nameOf) => {
  const problems = [];
  if (!plan.places.length) problems.push({ key: 'places', message: 'Add at least one place you deliver to.' });
  if (!plan.distance) {
    for (const p of unpricedPlaces(plan)) {
      problems.push({ key: p.key, message: `Choose a delivery fee for ${placeName(p, nameOf)}.` });
    }
  } else {
    problems.push(...distanceProblems(plan.perKm));
  }
  return problems;
};

/** By distance: what is wrong with the fields, [{ key, message }]. */
export const distanceProblems = (k) => {
  const problems = [];
  const add = (key, message) => problems.push({ key, message });
  const max = parseKm(k.maxKm);
  if (parseFee(k.baseFee) == null) add('perKm.baseFee', `Enter your starting fee (₱0 to ₱${MAX_FEE.toLocaleString('en-PH')}).`);
  if (parseKm(k.includedKm) === undefined) add('perKm.includedKm', 'The km included must be 0 to 100.');
  if (parseFee(k.perKm) === undefined) add('perKm.perKm', `Each extra km must cost ₱0 to ₱${MAX_FEE.toLocaleString('en-PH')}.`);
  if (max === undefined || (max !== null && max < 0.5)) add('perKm.maxKm', 'The farthest distance must be 0.5 to 100 km, or left blank.');
  return problems;
};

const kmWords = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;

/** By distance, filled in with the platform's numbers where blank. */
export const distanceRate = (k, platformRate) => {
  const base = parseFee(k.baseFee);
  const included = parseKm(k.includedKm);
  const perKm = parseFee(k.perKm);
  const max = parseKm(k.maxKm);
  if (base === undefined || included === undefined || perKm === undefined || max === undefined) return null;
  return {
    base: base ?? platformRate.base,
    included: included ?? platformRate.included,
    perKm: perKm ?? platformRate.perKm,
    max: max || null,
  };
};

/** "₱40 for the first 3 km, then ₱10 per km (up to 15 km)". */
export const distanceWords = (k, platformRate) => {
  const r = distanceRate(k, platformRate);
  if (!r) return '';
  const first = r.included > 0 ? `${pesos(r.base)} for the first ${kmWords(r.included)}` : `${pesos(r.base)} to start`;
  return `${first}, then ${pesos(r.perKm)} per km${r.max ? ` (up to ${kmWords(r.max)})` : ''}`;
};

/** What a delivery of `km` costs, to the whole peso (deliveryQuote.service feeFor). */
export const distanceFeeAt = (rate, km) => Math.round(Math.round((rate.base + Math.max(0, km - rate.included) * rate.perKm) * 100) / 100);

/** "Cantil, Bagumbayan and San Mariano", or "Cantil, Bagumbayan and 5 more". */
export const brgyList = (names, show = 3) => {
  if (names.length <= show) {
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] || '');
  }
  return `${names.slice(0, show - 1).join(', ')} and ${names.length - show + 1} more`;
};

/**
 * A place's line: { town, title, detail }. title: "All of Bongabong",
 * "Bongabong · Brgy. Labasan", "Roxas · Cantil, Odiong", "Roxas · 5 barangays";
 * detail: the barangays' names when there are more than three.
 */
export const placeTitle = (place, nameOf) => {
  const town = nameOf(place.municipalityId) || 'Town';
  if (isWhole(place)) return { town, title: `All of ${town}`, detail: '' };
  if (place.barangays.length === 1) return { town, title: `${town} · ${brgyLabel(place.barangays[0])}`, detail: '' };
  if (place.barangays.length <= 3) return { town, title: `${town} · ${place.barangays.join(', ')}`, detail: '' };
  return { town, title: `${town} · ${plural(place.barangays.length, 'barangay')}`, detail: place.barangays.join(', ') };
};

/** A place in a sentence: "Bongabong", "Brgy. Labasan in Bongabong", "3 barangays in Roxas". */
export const placeName = (place, nameOf) => {
  const town = nameOf(place.municipalityId) || 'Town';
  if (isWhole(place)) return town;
  return place.barangays.length === 1 ? `${brgyLabel(place.barangays[0])} in ${town}` : `${plural(place.barangays.length, 'barangay')} in ${town}`;
};

/** "Buyers in A, B and 3 more towns". */
const townList = (names) => (names.length <= 3 ? brgyList(names) : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more towns`);

/**
 * What buyers pay, in plain sentences: "Buyers in Bongabong pay ₱30 (₱50 in
 * Labasan).", "Buyers in Roxas (3 barangays) get free delivery."
 * @param {Array<String>} [allTownIds] - Every town the platform serves (for "every town")
 */
export const summaryLines = (plan, nameOf, homeId, platformRate, allTownIds = []) => {
  const places = sortPlaces(plan.places, homeId, nameOf);
  if (!places.length) return [];
  const towns = [...new Set(places.map((p) => p.municipalityId))];
  const pay = (fee) => (fee == null ? 'have no fee yet' : Number(fee) === 0 ? 'get free delivery' : `pay ${pesos(fee)}`);
  const at = (fee) => (fee == null ? 'no fee yet' : Number(fee) === 0 ? 'free' : pesos(fee));

  if (plan.distance) {
    const where = towns.map((id) => {
      const inTown = places.filter((p) => p.municipalityId === id);
      if (inTown.some(isWhole)) return nameOf(id);
      const n = inTown.reduce((sum, p) => sum + p.barangays.length, 0);
      return `${nameOf(id)} (${plural(n, 'barangay')})`;
    });
    const words = distanceWords(plan.perKm, platformRate);
    return [`Buyers in ${townList(where)} pay by distance${words ? `: ${words}` : ''}.`];
  }

  const lines = [];
  // Whole towns with no barangay of their own fee: one line per fee.
  const plain = new Map();
  for (const id of towns) {
    const inTown = places.filter((p) => p.municipalityId === id);
    const whole = inTown.find(isWhole);
    const groups = inTown.filter((p) => !isWhole(p));
    if (whole && !groups.length) {
      const k = whole.fee == null ? 'none' : String(Number(whole.fee));
      if (!plain.has(k)) {
        plain.set(k, { fee: whole.fee, names: [], at: lines.length });
        lines.push(null);
      }
      plain.get(k).names.push(nameOf(id));
      continue;
    }
    if (whole) {
      const extra = groups.map((g) => `${at(g.fee)} in ${brgyList(g.barangays)}`).join('; ');
      lines.push(`Buyers in ${nameOf(id)} ${pay(whole.fee)} (${extra}).`);
    } else if (groups.length === 1) {
      const g = groups[0];
      const which = g.barangays.length === 1 ? brgyLabel(g.barangays[0]) : plural(g.barangays.length, 'barangay');
      lines.push(`Buyers in ${nameOf(id)} (${which}) ${pay(g.fee)}.`);
    } else {
      const parts = groups.map((g) => `${at(g.fee)} in ${g.barangays.length === 1 ? brgyLabel(g.barangays[0]) : plural(g.barangays.length, 'barangay')}`);
      lines.push(`Buyers in ${nameOf(id)}: ${brgyList(parts, parts.length)}.`);
    }
  }
  for (const { fee, names, at: index } of plain.values()) {
    const everyTown = allTownIds.length > 1 && names.length === allTownIds.length;
    lines[index] = `Buyers in ${everyTown ? 'every town of Oriental Mindoro' : townList(names)} ${pay(fee)}.`;
  }
  return lines;
};

/** Where, in a few words, for the settings list: "Only Bongabong", "Bongabong and Roxas", "4 towns". */
export const whereShort = (plan, nameOf, homeId, allTownIds = []) => {
  const towns = [...new Set(sortPlaces(plan.places, homeId, nameOf).map((p) => p.municipalityId))];
  if (!towns.length) return '';
  const wholeIds = plan.places.filter(isWhole).map((p) => p.municipalityId);
  if (allTownIds.length > 1 && allTownIds.every((id) => wholeIds.includes(id))) return 'All of Oriental Mindoro';
  if (towns.length === 1) {
    const inTown = plan.places.filter((p) => p.municipalityId === towns[0]);
    if (inTown.some(isWhole)) return `Only ${nameOf(towns[0])}`;
    const n = inTown.reduce((sum, p) => sum + p.barangays.length, 0);
    return `${plural(n, 'barangay')} in ${nameOf(towns[0])}`;
  }
  return towns.length === 2 ? `${nameOf(towns[0])} and ${nameOf(towns[1])}` : plural(towns.length, 'town');
};

/** How much, in a few words: "Free delivery", "₱30", "₱20 to ₱50", "By distance, from ₱40". */
export const costShort = (plan, platformRate) => {
  if (!plan.places.length) return '';
  if (plan.distance) {
    const r = distanceRate(plan.perKm, platformRate);
    return r ? `By distance, from ${pesos(r.base)}` : '';
  }
  if (unpricedPlaces(plan).length) return '';
  const fees = planFees(plan);
  if (fees.length === 1) return feeLabel(fees[0]);
  return `${fees[0] === 0 ? 'Free' : pesos(fees[0])} to ${pesos(fees[fees.length - 1])}`;
};
