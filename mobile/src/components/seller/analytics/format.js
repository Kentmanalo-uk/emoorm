import { Share } from 'react-native';

/*
 * web/src/components/analytics/format.js, written out by hand: Intl's
 * currency and date formats are not the same on every phone engine, so the
 * figures here read exactly as the website prints them ("₱1,234", "Oct 9").
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Whole pesos with thousands commas: "₱1,234" (Intl en-PH PHP, no decimals). */
export const peso = (v) => {
  const n = Math.round(Number(v || 0));
  return `${n < 0 ? '-' : ''}₱${group(Math.abs(n))}`;
};

/** A whole number with thousands commas. */
export const num = (v) => {
  const n = Math.round(Number(v || 0));
  return `${n < 0 ? '-' : ''}${group(Math.abs(n))}`;
};

/** Two decimals with thousands commas: "1,234.50" (the CSV amounts). */
export const exact = (v) => {
  const [whole, dec] = Math.abs(Number(v || 0)).toFixed(2).split('.');
  return `${Number(v) < 0 ? '-' : ''}${group(whole)}.${dec}`;
};

/** "Oct 9" (en-US month: short, day: numeric) in this phone's time zone. */
export const shortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/** "10/9/2026", as a browser's toLocaleDateString() prints a date. */
export const numericDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

/** The local calendar day of a date: "2026-10-09". */
export const ymd = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const toCSV = (rows, headers) => {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => esc(h.get(r))).join(',')).join('\n');
  return `${head}\n${body}`;
};

/**
 * The website downloads the CSV file; a phone has no downloads folder to
 * drop it in, so the CSV goes to the share sheet (save to Files, Drive,
 * email it, paste it in Sheets). Resolves false when nothing could share it.
 */
export const shareCsv = async (filename, csv) => {
  try {
    await Share.share({ title: filename, message: csv });
    return true;
  } catch {
    return false;
  }
};

export { MONTHS };
