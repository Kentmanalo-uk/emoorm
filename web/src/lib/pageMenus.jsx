import {
  ArrowCounterClockwise, Bell, ChartLineUp, ChatCircleDots, ClipboardText, FileText, Flag, Gear, Headset, Heart,
  House, IdentificationCard, Image as ImageIcon, Images, Info, MapPin, Megaphone, Package, PaintBrush, Plus,
  Question, ShieldCheck, ShoppingBag, ShoppingCart, Sparkle, Star, Storefront, Tag, Ticket, Truck,
  User, Users, UserGear, Wallet, Buildings, ClockCounterClockwise, Camera, Envelope,
} from '@phosphor-icons/react';

/**
 * Phones: what the ⋯ menu at the right end of each page header offers, page
 * by page. Each entry links to the pages that go with the one you are on
 * (Orders → Returns, Reviews, Addresses…). A page is matched by its path;
 * the first matching rule wins, and a link to the page itself is left out.
 */

const I = { size: 18 };
const item = (key, Icon, label, to) => ({ key, icon: <Icon {...I} />, label, to });

// ── Buyer ────────────────────────────────────────────────────────────────
const B = {
  home: item('home', House, 'Home', '/'),
  products: item('products', ShoppingBag, 'Browse products', '/products'),
  stores: item('stores', Storefront, 'Browse stores', '/stores'),
  cart: item('cart', ShoppingCart, 'My cart', '/cart'),
  orders: item('orders', Package, 'My orders', '/profile/orders'),
  returns: item('returns', ArrowCounterClockwise, 'Returns & refunds', '/profile/returns'),
  reviews: item('reviews', Star, 'My reviews', '/profile/reviews'),
  addresses: item('addresses', MapPin, 'Delivery addresses', '/profile/addresses'),
  wishlist: item('wishlist', Heart, 'My wishlist', '/profile/wishlist'),
  followed: item('followed', Storefront, 'Followed stores', '/profile/followed-stores'),
  settings: item('settings', Gear, 'Account settings', '/profile/settings'),
  editProfile: item('edit', User, 'Edit profile', '/profile/settings/profile'),
  verify: item('verify', IdentificationCard, 'Verify identity', '/profile/verification'),
  support: item('support', Headset, 'Help & support', '/profile/support'),
  reports: item('reports', Flag, 'My reports', '/profile/reports'),
  help: item('help', Question, 'Help Center', '/help'),
  messages: item('messages', ChatCircleDots, 'Messages', '/messages'),
  notifications: item('notifications', Bell, 'Notifications', '/notifications'),
  about: item('about', Info, 'About Emoorm', '/about'),
  privacy: item('privacy', ShieldCheck, 'Privacy Policy', '/privacy'),
  terms: item('terms', FileText, 'Terms of Service', '/terms'),
  cookies: item('cookies', FileText, 'Cookie Policy', '/cookies'),
  sell: item('sell', Storefront, 'Sell on Emoorm', '/sell'),
  apply: item('apply', ClipboardText, 'Apply to sell', '/seller/apply'),
  sellerLogin: item('seller-login', Storefront, 'Seller login', '/seller/login'),
  imageSearch: item('image-search', Camera, 'Search by image', '/search/image'),
};

const BUYER_RULES = [
  [/^\/profile$/, [B.editProfile, B.orders, B.wishlist, B.followed, B.help]],
  [/^\/profile\/orders/, [B.returns, B.reviews, B.addresses, B.support, B.products]],
  [/^\/profile\/returns\/./, [item('all-returns', ArrowCounterClockwise, 'All returns', '/profile/returns'), B.orders, B.support]],
  [/^\/profile\/returns$/, [B.orders, B.support, B.help]],
  [/^\/profile\/addresses/, [B.settings, B.orders, B.cart]],
  [/^\/profile\/reviews/, [B.orders, B.wishlist, B.products]],
  [/^(\/profile)?\/wishlist/, [B.cart, B.followed, B.products]],
  [/^\/profile\/followed-stores/, [B.stores, B.wishlist, B.notifications]],
  [/^\/profile\/settings/, [B.addresses, B.verify, B.support, B.privacy, B.terms]],
  [/^\/profile\/verification/, [B.settings, B.support, B.privacy]],
  [/^\/profile\/support/, [B.help, B.reports, B.orders]],
  [/^\/profile\/reports/, [B.support, B.help]],
  [/^\/profile\/messages/, [B.notifications, B.support]],
  [/^\/profile\/notifications/, [B.messages, B.followed]],
  [/^\/help/, [B.support, B.orders, B.about, B.privacy, B.terms]],
  [/^\/(about|privacy|terms|cookies)$/, [B.about, B.privacy, B.terms, B.cookies, B.help]],
  [/^\/sell$/, [B.apply, B.sellerLogin, B.help]],
  [/^\/seller\/apply/, [B.sellerLogin, B.help]],
  [/^\/app$/, [B.about, B.help]],
  [/^\/checkout/, [B.cart, B.addresses, B.help]],
  [/^\/orders\/[^/]+\/receipt/, [B.orders, B.support]],
  [/^\/notifications\/./, [item('all-notifs', Bell, 'All notifications', '/notifications'), B.messages]],
  [/^\/municipality\/([^/]+)\/gallery/, (m) => [
    item('town', Buildings, 'Town page', `/municipality/${m[1]}`),
    item('town-products', ShoppingBag, 'Products from here', `/search?municipalityId=${m[1]}`),
  ]],
  [/^\/municipality\/([^/]+)/, (m) => [
    item('town-products', ShoppingBag, 'Products from here', `/search?municipalityId=${m[1]}`),
    item('gallery', Images, 'Photo gallery', `/municipality/${m[1]}/gallery`),
    B.stores,
  ]],
  [/^\/stores/, [B.followed, B.products, B.sell]],
  [/^\/product\/([^/]+)\/reviews/, (m) => [
    item('product', ShoppingBag, 'Back to the product', `/product/${m[1]}`),
    B.reviews, B.cart,
  ]],
  [/^\/search\/image/, [B.products, B.stores]],
  // Search results already have the camera in their search bar.
  [/^\/search$/, [B.stores, B.cart, B.wishlist]],
  [/^\/products/, [B.imageSearch, B.stores, B.cart]],
  [/^\/u\//, [B.stores, B.products]],
];
const BUYER_FALLBACK = [B.home, B.help];
// A visitor's Profile tab: nothing here needs an account.
const GUEST_PROFILE = [B.products, B.stores, B.sell, B.about];

// ── Seller Center ────────────────────────────────────────────────────────
const S = {
  home: item('s-home', House, 'Seller home', '/seller'),
  me: item('s-me', User, 'Me', '/seller/menu'),
  orders: item('s-orders', Package, 'Orders', '/seller/orders'),
  returns: item('s-returns', ArrowCounterClockwise, 'Returns & refunds', '/seller/returns'),
  products: item('s-products', ShoppingBag, 'My products', '/seller/products'),
  add: item('s-add', Plus, 'Add product', '/seller/products/new'),
  reviews: item('s-reviews', Star, 'Reviews', '/seller/reviews'),
  analytics: item('s-analytics', ChartLineUp, 'Performance', '/seller/analytics'),
  finance: item('s-finance', Wallet, 'Finance', '/seller/finance'),
  marketing: item('s-marketing', Megaphone, 'Marketing', '/seller/marketing'),
  decorate: item('s-decorate', PaintBrush, 'Decorate my shop', '/seller/decorate'),
  store: item('s-store', Storefront, 'Shop profile', '/seller/store'),
  fulfillment: item('s-fulfillment', Truck, 'Delivery & payment', '/seller/fulfillment'),
  settings: item('s-settings', Gear, 'Shop settings', '/seller/settings'),
  verify: item('s-verify', IdentificationCard, 'Verify identity', '/seller/verification'),
  chat: item('s-chat', ChatCircleDots, 'Chat with buyers', '/seller/messages'),
  admin: item('s-admin', Headset, 'Message the admin', '/seller/support'),
  moormy: item('s-moormy', Sparkle, 'Ate Moormy (AI)', '/seller/assistant'),
  notifications: item('s-notifs', Bell, 'Notifications', '/seller/notifications'),
  help: item('s-help', Question, 'Help Center', '/help'),
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
  [/^\/seller\/finance/, [S.analytics, S.orders, item('s-payment', Wallet, 'Payment options', '/seller/fulfillment/payment')]],
  [/^\/seller\/store/, [S.decorate, S.fulfillment, S.verify, S.settings]],
  [/^\/seller\/fulfillment/, [S.store, S.orders, S.settings]],
  [/^\/seller\/settings/, [S.store, S.fulfillment, S.verify, S.admin]],
  [/^\/seller\/verification/, [S.settings, S.admin]],
  [/^\/seller\/setup/, [S.admin, S.help]],
];
const SELLER_FALLBACK = [S.home, S.me, S.help];

// ── Admin ────────────────────────────────────────────────────────────────
const A = {
  home: item('a-home', House, 'Dashboard', '/admin'),
  tools: item('a-tools', ClipboardText, 'Tools', '/admin/tools'),
  orders: item('a-orders', Package, 'Orders', '/admin/orders'),
  returns: item('a-returns', ArrowCounterClockwise, 'Returns', '/admin/returns'),
  products: item('a-products', ShoppingBag, 'Products', '/admin/products'),
  reviews: item('a-reviews', Star, 'Reviews', '/admin/reviews'),
  reports: item('a-reports', Flag, 'Reports', '/admin/reports'),
  support: item('a-support', Headset, 'Buyer support', '/admin/support'),
  messages: item('a-messages', Envelope, 'Messages', '/admin/messages'),
  announcements: item('a-announce', Megaphone, 'Announcements', '/admin/messages?tab=announcements'),
  notifications: item('a-notifs', Bell, 'Notifications', '/admin/notifications'),
  analytics: item('a-analytics', ChartLineUp, 'Analytics', '/admin/analytics'),
  audit: item('a-audit', ClockCounterClockwise, 'Audit logs', '/admin/audit-logs'),
  settings: item('a-settings', Gear, 'Settings', '/admin/settings'),
  applications: item('a-apps', ClipboardText, 'Seller applications', '/admin/sellers'),
  sellers: item('a-sellers', Storefront, 'All sellers', '/admin/all-sellers'),
  buyers: item('a-buyers', Users, 'Buyers', '/admin/buyers'),
  // Super admin only (filtered out for municipal admins below).
  users: item('a-users', Users, 'All users', '/admin/users'),
  categories: item('a-categories', Tag, 'Categories', '/admin/categories'),
  municipalities: item('a-munis', Buildings, 'Municipalities', '/admin/municipalities'),
  juniors: item('a-juniors', UserGear, 'Municipal admins', '/admin/junior-admins'),
  feedback: item('a-feedback', ChatCircleDots, 'Feedback', '/admin/feedback'),
  banners: item('a-banners', ImageIcon, 'Banners', '/admin/banners'),
  couriers: item('a-couriers', Truck, 'Couriers', '/admin/couriers'),
  vouchers: item('a-vouchers', Ticket, 'Vouchers', '/admin/vouchers'),
};
const SUPER_ONLY = ['/admin/users', '/admin/categories', '/admin/municipalities', '/admin/junior-admins',
  '/admin/feedback', '/admin/banners', '/admin/couriers', '/admin/vouchers'];

const ADMIN_RULES = [
  [/^\/admin$/, [A.tools, A.orders, A.analytics, A.audit, A.settings]],
  [/^\/admin\/menu/, [A.settings, A.notifications, A.messages]],
  [/^\/admin\/tools/, [A.analytics, A.audit, A.settings]],
  [/^\/admin\/sellers/, [A.sellers, A.products, A.reports]],
  [/^\/admin\/all-sellers/, [A.applications, A.buyers, A.products]],
  [/^\/admin\/buyers/, [A.sellers, A.orders, A.reports]],
  [/^\/admin\/users/, [A.juniors, A.audit]],
  [/^\/admin\/products/, [A.categories, A.reviews, A.reports]],
  [/^\/admin\/orders/, [A.returns, A.couriers, A.analytics]],
  [/^\/admin\/reports/, [A.reviews, A.products, A.support]],
  [/^\/admin\/support/, [A.messages, A.feedback, A.reports]],
  [/^\/admin\/categories/, [A.products]],
  [/^\/admin\/municipalities/, [A.juniors, A.analytics]],
  [/^\/admin\/analytics/, [A.orders, A.audit]],
  [/^\/admin\/messages/, [A.announcements, A.support, A.notifications]],
  [/^\/admin\/feedback/, [A.support, A.messages]],
  [/^\/admin\/banners/, [A.vouchers, A.settings]],
  [/^\/admin\/couriers/, [A.orders, A.returns]],
  [/^\/admin\/vouchers/, [A.banners, A.orders]],
  [/^\/admin\/junior-admins/, [A.municipalities, A.audit]],
  [/^\/admin\/audit-logs/, [A.analytics, A.users]],
  [/^\/admin\/notifications/, [A.messages, A.support]],
  [/^\/admin\/reviews/, [A.products, A.reports]],
  [/^\/admin\/returns/, [A.orders, A.support]],
  [/^\/admin\/settings/, [A.notifications, A.audit]],
];
const ADMIN_FALLBACK = [A.home, A.tools];

/**
 * The menu items for a page. `area` is 'buyer' | 'seller' | 'admin';
 * `isSuperAdmin` keeps super-admin-only pages out of a municipal admin's menu;
 * `signedIn` false gives a visitor's Profile tab links of its own.
 */
export function pageMenuItems(pathname, { area = 'buyer', isSuperAdmin = false, signedIn = true } = {}) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (area === 'buyer' && !signedIn && path === '/profile') return GUEST_PROFILE;
  const [rules, fallback] = area === 'seller'
    ? [SELLER_RULES, SELLER_FALLBACK]
    : area === 'admin' ? [ADMIN_RULES, ADMIN_FALLBACK] : [BUYER_RULES, BUYER_FALLBACK];
  let items = fallback;
  for (const [re, list] of rules) {
    const m = path.match(re);
    if (m) { items = typeof list === 'function' ? list(m) : list; break; }
  }
  return items.filter((it) => {
    const to = it.to.split('?')[0];
    if (to === path && !it.to.includes('?')) return false;
    if (area === 'admin' && !isSuperAdmin && SUPER_ONLY.includes(to)) return false;
    return true;
  });
}
