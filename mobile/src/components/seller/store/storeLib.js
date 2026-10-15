import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../../api/client';
import { t } from '../../../theme';
import { listServiceMunicipalities, normalizeName, SERVICE_PROVINCE } from '../../auth/authAddress';

/*
 * Shop profile (web/src/pages/SellerStore.jsx + lib/pickupAddress.js): the
 * parts phones edit one page at a time, the form loaded from the saved shop,
 * and the pickup address helpers.
 */

// The website saves these exact strings when a shop keeps Emoorm's colours.
export const DEFAULT_PRIMARY = 'var(--t-primary-600, #059669)';
export const DEFAULT_SECONDARY = 'var(--t-warning-500, #f59e0b)';
export const DESCRIPTION_MAX = 500;
export const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

/** Phones: each part of the profile on a page of its own, saving only its own fields. */
export const PARTS = {
  about: { anchor: 'shop-info', fields: ['name', 'description', 'contactNumber', 'isActive'] },
  branding: { anchor: 'branding', fields: ['logo', 'bannerImage', 'coverImage'] },
  location: { anchor: 'shop-location', fields: ['pickupAddress', 'latitude', 'longitude'] },
  colors: { anchor: 'theme', fields: ['primaryColor', 'secondaryColor'] },
};

/** Links written for the one-page layout (/seller/store#branding → ?focus=branding). */
export const PART_OF_ANCHOR = {
  'shop-info': 'about',
  branding: 'branding',
  'shop-location': 'location',
  theme: 'colors',
};

export const partPath = (part) => `/seller/store/${part}`;

/**
 * A saved colour as the app can paint it: `var(--t-primary-600, #059669)`
 * becomes the token the website's CSS would use (t.primary[600]), a hex
 * stays as it is, anything else falls back.
 */
export const paintColor = (value, fallback = t.neutral[900]) => {
  const v = String(value || '').trim();
  if (!v) return fallback;
  const token = v.match(/^var\(--t-([a-z]+)-(\d+)\s*(?:,\s*([^)]+))?\)$/i);
  if (token) return t[token[1]]?.[token[2]] || token[3]?.trim() || fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  if (/^rgba?\(/i.test(v)) return v;
  return fallback;
};

/** A 6-digit hex for a colour (the colour input's value), black when unknown. */
export const hexOf = (value) => {
  const c = paintColor(value, '#000000');
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).split('').map((h) => h + h).join('')}`;
  return '#000000';
};

const formOf = (s) => ({
  name: s?.name || '',
  description: s?.description || '',
  pickupAddress: s?.pickupAddress || '',
  latitude: s?.latitude ?? null,
  longitude: s?.longitude ?? null,
  contactNumber: s?.contactNumber || '',
  isActive: s?.isActive ?? true,
  logo: s?.logo || '',
  coverImage: s?.coverImage || '',
  bannerImage: s?.bannerImage || '',
  primaryColor: s?.primaryColor || DEFAULT_PRIMARY,
  secondaryColor: s?.secondaryColor || DEFAULT_SECONDARY,
});

/**
 * The shop as saved (GET /stores/my/store) and the form started from it.
 * Each page starts from the saved profile: nothing unsaved carries over.
 * isNew: the seller has no shop yet (404).
 */
export function useStoreForm() {
  const [store, setStore] = useState(null);
  const [form, setForm] = useState(() => formOf(null));
  const [saved, setSaved] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/stores/my/store');
      const next = formOf(res.data);
      setStore(res.data);
      setForm(next);
      setSaved(next);
      setIsNew(false);
    } catch (err) {
      if (err?.status === 404 || (typeof err?.message === 'string' && err.message.includes('404'))) setIsNew(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { store, setStore, form, setForm, saved, setSaved, isLoading, isNew, setIsNew, reload: load };
}

/** Whether a part's own fields differ from the saved profile. */
export const partDirty = (part, form, saved) => Boolean(saved && PARTS[part])
  && PARTS[part].fields.some((f) => JSON.stringify(form[f] ?? null) !== JSON.stringify(saved[f] ?? null));

/** Name and contact number checks (validate in SellerStore.jsx); the problem, or null. */
export const aboutProblem = (form) => {
  if (!form.name.trim()) return 'Store name is required';
  if (form.contactNumber && !PH_MOBILE_REGEX.test(form.contactNumber.trim())) {
    return 'Enter a valid PH mobile number (e.g. 09171234567)';
  }
  return null;
};

// ── The pickup address (web/src/lib/pickupAddress.js) ──────────────────

/** The pickup address as one line, the way checkout writes addresses: street, barangay, town, province. */
export const joinPickup = (p) => [p.street, p.barangay, p.municipalityName, SERVICE_PROVINCE.name]
  .map((s) => String(s || '').trim())
  .filter(Boolean)
  .join(', ');

/**
 * A saved pickup address split back into the picker's town, barangay and
 * street. Text typed before the picker keeps its words on the street line,
 * with the shop's own town chosen.
 */
export const splitPickup = (text, shopTown) => {
  const towns = listServiceMunicipalities();
  const findTown = (name) => towns.find((x) => normalizeName(x.name) === normalizeName(name));
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
