import {
  ArchiveIcon, CheckCircleIcon, ClockIcon, EyeSlashIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import { t } from '../../../theme';
import { isTodayProduct } from '../../../lib/availability';
import { isStockless, productKind } from '../productKinds';

/*
 * My products' rules, as web/src/pages/SellerProducts.jsx has them: the
 * status badges, the filter tabs and their counts, stock levels and the
 * words each kind of product counts its stock in.
 */

// .seller-badge tones (SellerDashboard.css .status-*).
const TONES = {
  pending: { bg: t.warning[100], fg: t.warning[700] },
  confirmed: { bg: t.info[100], fg: t.info[700] },
  cancelled: { bg: t.danger[100], fg: t.danger[700] },
};

export const STATUS_LABELS = {
  PENDING: { label: 'Pending Approval', tone: TONES.pending, Icon: ClockIcon },
  APPROVED: { label: 'Live', tone: TONES.confirmed, Icon: CheckCircleIcon },
  HIDDEN: { label: 'Hidden', tone: TONES.pending, Icon: EyeSlashIcon },
  SUSPENDED: { label: 'Suspended', tone: TONES.cancelled, Icon: WarningCircleIcon },
  ARCHIVED: { label: 'Archived', tone: TONES.cancelled, Icon: ArchiveIcon },
};
export const BADGE_TONES = TONES;

export const statusOf = (product) => STATUS_LABELS[product?.status] || STATUS_LABELS.PENDING;

// Filter tabs. A status key is sent as `status` to GET /products/my/products;
// "restock" (out of stock or running low) is sent as `stock=restock`.
export const PRODUCT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'APPROVED', label: 'Live' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'restock', label: 'Needs restock' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'ARCHIVED', label: 'Archived' },
];

export const tabLabel = (key) => PRODUCT_TABS.find((tab) => tab.key === key)?.label;
export const isTabKey = (key) => PRODUCT_TABS.some((tab) => tab.key === key);

// Phones show these as chips; the rest of PRODUCT_TABS sit in a sheet.
export const PHONE_QUICK_TABS = ['all', 'APPROVED', 'PENDING'];

// How many products each tab holds, from GET /products/my/summary.
export const countFor = (summary, key) => {
  if (!summary) return null;
  if (key === 'all') return summary.total;
  if (key === 'restock') return (summary.outOfStock || 0) + (summary.lowStock || 0);
  return summary.byStatus?.[key] ?? 0;
};

export const stockLevel = (product) => {
  // Available Today: at 0 between posts on purpose, never "out of stock";
  // cooked-to-order food keeps no stock at all.
  if (isTodayProduct(product) || isStockless(product)) return 'ok';
  const stock = Number(product?.stock ?? 0);
  if (stock <= 0) return 'out';
  const threshold = Number(product?.lowStockThreshold ?? 0);
  return stock <= threshold ? 'low' : 'ok';
};

export const hasStockPerChoice = (product) => Array.isArray(product?.variations)
  && product.variations.some((v) => v?.stocks && Object.keys(v.stocks).length);

// What a product's stock counts, in the words of its kind: live animals by
// the head, packages by the package.
export const stockWords = (product) => {
  const kind = productKind(product);
  if (kind === 'LIVESTOCK') return { add: 'Add heads', now: 'Heads available now', unit: (n) => (n === 1 ? 'head' : 'heads') };
  if (kind === 'PACKAGE') return { add: 'Add packages', now: 'Packages available now', unit: (n) => (n === 1 ? 'package' : 'packages') };
  return { add: 'Add stock', now: 'In stock now', unit: null };
};

// How many different products a package holds.
export const itemsLabel = (product) => {
  const n = Array.isArray(product?.packageItems) ? product.packageItems.length : 0;
  return `${n} ${n === 1 ? 'item' : 'items'}`;
};

// A package item deleted or taken off show since: the seller should fix the package.
export const packageIssue = (product) => (Array.isArray(product?.packageItems)
  && product.packageItems.some((it) => it.product?.deletedAt
    || ['HIDDEN', 'SUSPENDED', 'ARCHIVED'].includes(it.product?.status)));

// "₱1200.00" as the website prints it (toFixed, no thousands commas).
export const priceText = (price) => `₱${Number(price || 0).toFixed(2)}`;
