import {
  ArrowCounterClockwiseIcon, BellIcon, ChartLineUpIcon, ChatCircleDotsIcon, GearIcon, HeadsetIcon, HouseIcon,
  IdentificationCardIcon, MegaphoneIcon, PackageIcon, PaintBrushIcon, PlusIcon, QuestionIcon, ShoppingBagIcon,
  SparkleIcon, StarIcon, StorefrontIcon, TruckIcon, UserIcon, WalletIcon,
} from 'phosphor-react-native';

/*
 * The Seller Center's phone routes, titles, Back targets and ⋯ menus
 * (web/src/components/layout/SellerLayout.jsx and web/src/lib/pageMenus.jsx,
 * seller rules). App paths are the website's paths.
 */

/** Phone: the five tabs on the bottom bar. */
export const PHONE_TABS = ['/seller', '/seller/products', '/seller/messages', '/seller/marketing', '/seller/menu'];

/** Phone: tabs whose page draws its own shop header (Home, Me). */
export const PHONE_OWN_HEADER = ['/seller', '/seller/menu'];

/** Phone header titles: short, plain names. */
export const PHONE_TITLES = {
  '/seller/orders': 'My orders',
  '/seller/products': 'My products',
  '/seller/products/new': 'Add product',
  '/seller/today': "Today's menu",
  '/seller/messages': 'Chat',
  '/seller/assistant': 'Ate Moormy',
  '/seller/marketing': 'Marketing',
  '/seller/menu': 'Me',
  '/seller/decorate': 'Decorate my shop',
  '/seller/decorate/home': 'Shop home',
  '/seller/decorate/templates': 'Choose a template',
  '/seller/returns': 'Returns & refunds',
  '/seller/support': 'Admin messages',
  '/seller/notifications': 'Notifications',
  '/seller/reviews': 'Reviews',
  '/seller/questions': 'Questions',
  '/seller/analytics': 'Analytics',
  '/seller/finance': 'Finance',
  '/seller/store': 'Shop profile',
  '/seller/store/about': 'Name & description',
  '/seller/store/branding': 'Logo & banner',
  '/seller/store/location': 'Location',
  '/seller/store/colors': 'Shop colors',
  '/seller/fulfillment': 'Delivery & payment',
  '/seller/fulfillment/method': 'Delivery & pickup',
  '/seller/fulfillment/pickup': 'Pickup spot',
  '/seller/fulfillment/delivery': 'Delivery',
  '/seller/fulfillment/payment': 'Payment options',
  '/seller/settings': 'Settings',
  '/seller/verification': 'Verify identity',
};

// The breadcrumb labels the website falls back on for a path with no phone title.
const LABELS = {
  '/seller': 'Dashboard',
  '/seller/orders': 'My Orders',
  '/seller/returns': 'Returns & refunds',
  '/seller/messages': 'Messages',
  '/seller/assistant': 'Ate Moormy',
  '/seller/support': 'Admin Messages',
  '/seller/products': 'My Products',
  '/seller/products/new': 'Add Product',
  '/seller/today': "Today's menu",
  '/seller/verification': 'Verify identity',
  '/seller/menu': 'Menu',
  '/seller/marketing': 'Marketing',
  '/seller/decorate': 'Decorate my shop',
  '/seller/decorate/home': 'Shop home',
  '/seller/reviews': 'Reviews',
  '/seller/questions': 'Buyer questions',
  '/seller/analytics': 'Analytics',
  '/seller/finance': 'Finance',
  '/seller/store': 'Shop Profile',
  '/seller/fulfillment': 'Fulfillment & Payment',
  '/seller/settings': 'Settings',
};

/** The shop templates' names (web/src/lib/shopTemplates.js), for the preview's title. */
export const TEMPLATE_NAMES = {
  fresh: 'Fresh Market',
  island: 'Island Blue',
  sunset: 'Sunset Crafts',
  charcoal: 'Charcoal',
  blossom: 'Blossom Pink',
  coffee: 'Coffee & Cacao',
};

export const cleanSellerPath = (pathname = '') => pathname.replace(/\/+$/, '') || '/seller';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');

/**
 * The phone title for a path, as SellerLayout.jsx works it out.
 * editing: the product form editing a product ("Edit product").
 */
export function sellerPhoneTitle(pathname, { editing = false } = {}) {
  const path = cleanSellerPath(pathname);
  if (editing) return 'Edit product';
  if (path.startsWith('/seller/decorate/templates/')) {
    return TEMPLATE_NAMES[path.split('/').pop()] || 'Template';
  }
  if (PHONE_TITLES[path]) return PHONE_TITLES[path];
  if (path === '/seller') return 'Dashboard';
  const last = path.split('/').filter(Boolean).pop();
  return LABELS[path] || (last ? capitalize(last) : 'Seller Center');
}

/** Where Back goes when there is no history (SellerLayout.jsx goBack). */
export function sellerBackTarget(pathname) {
  const path = cleanSellerPath(pathname);
  if (path.startsWith('/seller/decorate/templates/')) return '/seller/decorate/templates';
  // A settings part opened directly: back to its list of parts.
  if (/^\/seller\/(store|fulfillment)\/[a-z]+$/.test(path)) return path.replace(/\/[a-z]+$/, '');
  // Adding or editing a product: back to My products (a tab of its own).
  if (path.startsWith('/seller/products')) return '/seller/products';
  if (/^\/seller\/(orders|returns|reviews|analytics|finance)/.test(path)) return '/seller';
  if (path === '/seller/assistant') return '/seller/messages';
  return '/seller/menu';
}

/**
 * A website link (`/seller/fulfillment/delivery#delivery-fee`) as an app
 * href: the #part becomes a `focus` param the page reads to open that card
 * (useLocalSearchParams().focus), and the first-visit guide waits.
 */
export function sellerHref(to) {
  if (!to || !to.includes('#')) return to;
  const [base, focus] = to.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}focus=${encodeURIComponent(focus)}`;
}

// ── ⋯ page menus (web/src/lib/pageMenus.jsx, Seller Center) ─────────────
const item = (key, Icon, label, to) => ({ key, Icon, label, to });

const S = {
  home: item('s-home', HouseIcon, 'Seller home', '/seller'),
  me: item('s-me', UserIcon, 'Me', '/seller/menu'),
  orders: item('s-orders', PackageIcon, 'Orders', '/seller/orders'),
  returns: item('s-returns', ArrowCounterClockwiseIcon, 'Returns & refunds', '/seller/returns'),
  products: item('s-products', ShoppingBagIcon, 'My products', '/seller/products'),
  add: item('s-add', PlusIcon, 'Add product', '/seller/products/new'),
  reviews: item('s-reviews', StarIcon, 'Reviews', '/seller/reviews'),
  analytics: item('s-analytics', ChartLineUpIcon, 'Performance', '/seller/analytics'),
  finance: item('s-finance', WalletIcon, 'Finance', '/seller/finance'),
  marketing: item('s-marketing', MegaphoneIcon, 'Marketing', '/seller/marketing'),
  decorate: item('s-decorate', PaintBrushIcon, 'Decorate my shop', '/seller/decorate'),
  store: item('s-store', StorefrontIcon, 'Shop profile', '/seller/store'),
  fulfillment: item('s-fulfillment', TruckIcon, 'Delivery & payment', '/seller/fulfillment'),
  settings: item('s-settings', GearIcon, 'Shop settings', '/seller/settings'),
  verify: item('s-verify', IdentificationCardIcon, 'Verify identity', '/seller/verification'),
  chat: item('s-chat', ChatCircleDotsIcon, 'Chat with buyers', '/seller/messages'),
  admin: item('s-admin', HeadsetIcon, 'Message the admin', '/seller/support'),
  moormy: item('s-moormy', SparkleIcon, 'Ate Moormy (AI)', '/seller/assistant'),
  notifications: item('s-notifs', BellIcon, 'Notifications', '/seller/notifications'),
  // The website's Help Center (/help) is the app's /help-center.
  help: item('s-help', QuestionIcon, 'Help Center', '/help-center'),
};

const SELLER_RULES = [
  [/^\/seller$/, [S.orders, S.add, S.analytics, S.settings, S.admin]],
  [/^\/seller\/menu/, [S.settings, S.notifications, S.admin, S.help]],
  [/^\/seller\/orders/, [S.returns, S.fulfillment, S.finance, S.analytics]],
  [/^\/seller\/products\/new/, [S.products, S.fulfillment]],
  [/^\/seller\/products/, [S.add, S.reviews, S.marketing, S.decorate]],
  [/^\/seller\/marketing/, [S.decorate, S.products, S.analytics]],
  [/^\/seller\/decorate/, [S.store, S.marketing, S.products]],
  [/^\/seller\/returns/, [S.orders, S.finance, S.admin]],
  [/^\/seller\/messages/, [S.moormy, S.admin, S.notifications]],
  [/^\/seller\/assistant/, [S.chat, S.admin, S.help]],
  [/^\/seller\/support/, [S.chat, S.moormy, S.help]],
  [/^\/seller\/notifications/, [S.orders, S.chat, S.settings]],
  [/^\/seller\/reviews/, [S.products, S.orders, S.analytics]],
  [/^\/seller\/analytics/, [S.finance, S.orders, S.products]],
  [/^\/seller\/finance/, [S.analytics, S.orders, item('s-payment', WalletIcon, 'Payment options', '/seller/fulfillment/payment')]],
  [/^\/seller\/store/, [S.decorate, S.fulfillment, S.verify, S.settings]],
  [/^\/seller\/fulfillment/, [S.store, S.orders, S.settings]],
  [/^\/seller\/settings/, [S.store, S.fulfillment, S.verify, S.admin]],
  [/^\/seller\/verification/, [S.settings, S.admin]],
  [/^\/seller\/setup/, [S.admin, S.help]],
];
const SELLER_FALLBACK = [S.home, S.me, S.help];

/** The ⋯ menu items for a Seller Center path; a link to the page itself is left out. */
export function sellerMenuItems(pathname) {
  const path = cleanSellerPath(pathname);
  let items = SELLER_FALLBACK;
  for (const [re, list] of SELLER_RULES) {
    if (re.test(path)) { items = list; break; }
  }
  return items.filter((it) => it.to.split('?')[0] !== path);
}
