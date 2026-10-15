import { t } from '../../../theme';
import { activeSalePrice } from '../../../lib/variantPricing';
import { productKind } from '../productKinds';

/*
 * The package form's rules and helpers (web/src/components/seller/
 * PackageForm.jsx, the constants and small functions at its top).
 */

export const NAME_MIN = 2;
export const NAME_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;
export const MAX_LINES = 20;
export const MAX_EACH = 99;
export const MAX_PHOTOS = 10;
export const STOCK_MAX = 1000000;
export const LAST_STEP = 4;

// Picking what a package is for offers a name to start from.
export const NAME_FOR_KIND = {
  FAMILY_MEAL: 'Family Meal Package',
  BIRTHDAY: 'Birthday Package',
  FIESTA: 'Fiesta Package',
  BREAKFAST: 'Breakfast Package',
  FARM_BUNDLE: 'Farm Produce Bundle',
  GIFT_SET: 'Local Product Gift Set',
};

// How far ahead buyers must order (details.noticeHours).
export const NOTICE_HOURS = ['2', '6', '12', '24', '48', '72', '168'];

export const KIND_TAGS = { READY_TO_EAT: 'Ready to eat', COOK_TO_ORDER: 'Paluto' };

/** The form's colours (.pkf custom properties). */
export const P = {
  green: t.primary[600],
  greenDark: t.primary[700],
  greenSoft: t.primary[50],
  line: t.neutral[200],
  ink: t.neutral[900],
  muted: t.neutral[500],
  danger: t.danger[600],
};

/** "1 day", "2 days", "6 hours", "1 week". */
export const aheadText = (hours) => {
  const h = Number(hours) || 0;
  if (h % 168 === 0) return h === 168 ? '1 week' : `${h / 168} weeks`;
  if (h % 24 === 0) return h === 24 ? '1 day' : `${h / 24} days`;
  return h === 1 ? '1 hour' : `${h} hours`;
};

/** ₱2,500 or ₱12.50 (written out by hand: no locale differences between phones). */
export const peso = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const neg = v < 0;
  const text = Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}₱${text}`;
};

export const priceOf = (p) => activeSalePrice(p) ?? (Number(p?.price) || 0);
export const firstImage = (p) => (Array.isArray(p?.images) ? p.images.find(Boolean) : null) || null;
export const isWhole = (v) => /^\d+$/.test(String(v).trim());

// What a package can hold: the shop's own products, but neither live animals
// nor other packages, nor ones buyers can't get any more.
export const canHold = (p) => !!p && !p.deletedAt
  && !['PACKAGE', 'LIVESTOCK'].includes(productKind(p))
  && !['SUSPENDED', 'ARCHIVED'].includes(p.status);

export const toFormState = (product) => {
  const d = product?.details || {};
  return {
    items: (Array.isArray(product?.packageItems) ? product.packageItems : [])
      .map((it) => ({ productId: it.productId, quantity: Number(it.quantity) || 1, product: it.product || null })),
    packageKind: d.packageKind || '',
    name: product?.name || '',
    price: product ? String(Number(product.price) || '') : '',
    stock: product ? String(product.stock ?? '') : '',
    noticeHours: Number(d.noticeHours) > 0 ? String(d.noticeHours) : '',
    fulfillment: product?.fulfillment || null,
    // The seller's own photos and words: empty while the items' stand in.
    images: product && !d.autoCover && Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    description: product && !d.autoDescription ? product.description || '' : '',
  };
};
