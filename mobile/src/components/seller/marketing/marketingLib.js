import apiClient from '../../../api/client';

/*
 * What the Marketing page needs from the website's helpers: the follower
 * numbers (web/src/lib/follow.js getSellerFollowerStats), a voucher in words
 * (web/src/lib/vouchers.js voucherSummary), and the short dates and peso
 * amounts the page prints (written out by hand so a phone prints exactly
 * what the website's browser does).
 */

/** { total, last7Days, … } for the shop's followers. */
export const getSellerFollowerStats = async (storeId) => {
  const res = await apiClient.get(`/follows/store/${storeId}/stats`);
  return res.data;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 3" (toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })). */
export const shortDate = (value) => {
  const d = new Date(value);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/** "Oct 31, 2026", for a YYYY-MM-DD day. */
export const dayLabel = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/** "₱1,234.5" (toLocaleString('en-PH', { maximumFractionDigits: 2 })). */
export const peso = (n) => {
  const [whole, part] = String(Math.round(Number(n) * 100) / 100).split('.');
  return `₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part ? `.${part}` : ''}`;
};

/** "₱20 off orders of ₱300" / "10% off, up to ₱50". */
export const voucherSummary = (v) => {
  const off = v.discountType === 'PERCENT' ? `${Number(v.discountValue)}% off` : `${peso(v.discountValue)} off`;
  const cap = v.discountType === 'PERCENT' && v.maxDiscount ? `, up to ${peso(v.maxDiscount)}` : '';
  const min = v.minOrderAmount ? ` orders of ${peso(v.minOrderAmount)}` : '';
  return `${off}${min}${cap}`;
};
