import axios from './axios';

/**
 * What the Seller Center and Admin top-bar search boxes actually look through.
 *
 * Everything here goes through endpoints that already exist and are already
 * scoped by the server — a seller only ever sees their own products and orders,
 * a municipal admin only their municipality — so the search cannot widen what
 * an account can reach.
 *
 * Each result carries the route it opens. Where a page can open a single record
 * (`?id=`) it goes straight there; otherwise it lands on that page's list with
 * the search already applied, which is the closest thing to "the record" those
 * pages can show.
 */

const enc = encodeURIComponent;

const peso = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const PRODUCT_STATUS = {
  APPROVED: 'Live',
  PENDING: 'Awaiting approval',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

const titleCase = (value = '') => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * A product's images are a JSON column. Prisma hands back an array, but
 * older rows can still arrive as the raw string, so both are accepted.
 */
const firstImage = (images) => {
  if (Array.isArray(images)) return images[0] || null;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed[0] || null : images;
    } catch {
      return images;
    }
  }
  return null;
};

/* ── Seller Center ─────────────────────────────────────────── */

export const sellerSearchSources = [
  {
    key: 'products',
    label: 'Products',
    run: async (query, signal) => {
      const res = await axios.get('/products/my/products', {
        params: { search: query, pageSize: 5 },
        signal,
      });
      return (res.data || []).map((product) => ({
        id: product.id,
        title: product.name,
        subtitle: [
          PRODUCT_STATUS[product.status] || titleCase(product.status || ''),
          peso(product.price),
          `${product.stock ?? 0} in stock`,
        ].filter(Boolean).join(' · '),
        kind: 'product',
        image: firstImage(product.images),
        href: `/seller/products?search=${enc(product.name)}`,
      }));
    },
  },
  {
    key: 'orders',
    label: 'Orders',
    run: async (query, signal) => {
      // Orders have no server-side text search, so a page of the seller's most
      // recent ones is matched here on order number and buyer name.
      const res = await axios.get('/orders/store/orders', {
        params: { pageSize: 50 },
        signal,
      });
      const needle = query.toLowerCase();
      return (res.data || [])
        .filter((order) => `${order.orderNumber || ''} ${order.buyer?.fullName || ''}`
          .toLowerCase().includes(needle))
        .slice(0, 5)
        .map((order) => ({
          id: order.id,
          title: `#${order.orderNumber}`,
          subtitle: [
            order.buyer?.fullName,
            titleCase(String(order.status || '').replace(/_/g, ' ')),
            peso(order.total),
          ].filter(Boolean).join(' · '),
          kind: 'order',
          image: firstImage(order.items?.[0]?.product?.images),
          href: `/seller/orders?id=${enc(order.id)}`,
        }));
    },
  },
];

/* ── Admin panel ───────────────────────────────────────────── */

const personHref = (user) => {
  // An applicant opens as an application; everyone else lands on the list they
  // belong to, filtered to them.
  if (user.sellerApplicationStatus) return `/admin/sellers?id=${enc(user.id)}`;
  if (user.role === 'SELLER') return `/admin/all-sellers?search=${enc(user.email)}`;
  return `/admin/buyers?search=${enc(user.email)}`;
};

export const adminSearchSources = [
  {
    key: 'stores',
    label: 'Stores',
    run: async (query, signal) => {
      const res = await axios.get('/stores', { params: { search: query, pageSize: 5 }, signal });
      return (res.data || []).map((store) => ({
        id: store.id,
        title: store.name,
        subtitle: [
          store.owner?.fullName,
          store.municipality?.name,
          `${store._count?.products ?? 0} products`,
        ].filter(Boolean).join(' · '),
        kind: 'store',
        image: store.logo || store.bannerImage || store.coverImage || null,
        href: `/admin/products?storeId=${enc(store.id)}`,
      }));
    },
  },
  {
    key: 'products',
    label: 'Products',
    run: async (query, signal) => {
      const res = await axios.get('/products', { params: { search: query, pageSize: 5 }, signal });
      return (res.data || []).map((product) => ({
        id: product.id,
        title: product.name,
        subtitle: [
          product.store?.name,
          PRODUCT_STATUS[product.status] || titleCase(product.status || ''),
          peso(product.price),
        ].filter(Boolean).join(' · '),
        kind: 'product',
        image: firstImage(product.images),
        href: `/admin/products?search=${enc(product.name)}`,
      }));
    },
  },
  {
    key: 'people',
    label: 'People',
    run: async (query, signal) => {
      const res = await axios.get('/auth/users', { params: { search: query, pageSize: 5 }, signal });
      return (res.data || []).map((user) => ({
        id: user.id,
        title: user.fullName || user.email,
        subtitle: [
          user.email,
          user.sellerApplicationStatus
            ? `Application ${user.sellerApplicationStatus.toLowerCase()}`
            : titleCase(String(user.role || '').replace(/_/g, ' ')),
          user.municipality?.name,
        ].filter(Boolean).join(' · '),
        kind: 'person',
        image: user.profilePhoto || null,
        href: personHref(user),
      }));
    },
  },
];
