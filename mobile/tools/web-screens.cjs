/*
 * Full-page phone screenshots (390 × 844, 2×) of every page of the website,
 * as a guest, a buyer, a seller and a super admin, into <repo>/screenshot/<role>/.
 *
 *   node mobile/tools/web-screens.cjs [guest|buyer|seller|admin ...]
 *
 * Throwaway accounts are made for the run and deleted afterwards; detail
 * pages use real products, shops and municipalities from the database.
 * Needs the backend + website on http://localhost:3000.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const B = path.join(ROOT, 'backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env'), quiet: true });
const { PrismaClient } = require(path.join(B, 'node_modules/@prisma/client'));
const bcrypt = require(path.join(B, 'node_modules/bcryptjs'));
const { generateTokens } = require(path.join(B, 'src/utils/jwt'));

const findPuppeteer = () => {
  for (const t of [
    path.join(ROOT, 'node_modules/puppeteer-core'),
    path.join(ROOT, 'web/node_modules/puppeteer-core'),
    'C:/Users/Kaye/AppData/Local/Temp/claude/c--laragon-www-emoorm-app-emoorm/a02f6d7b-686e-423a-8e86-7cdf22b9afa7/scratchpad/node_modules/puppeteer-core',
  ]) { try { return require(t); } catch { /* next */ } }
  throw new Error('puppeteer-core not found');
};
const puppeteer = findPuppeteer();

const WEB = process.env.SCREENS_WEB || 'http://localhost:3000';
const OUT = path.join(ROOT, 'screenshot');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prisma = new PrismaClient();
const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function makeUser(role) {
  const muni = await prisma.municipality.findFirst({ where: { isActive: true }, select: { id: true } });
  const user = await prisma.user.create({
    data: {
      email: `e2e-screens-${role.toLowerCase()}-${tag}@example.test`,
      password: await bcrypt.hash('Testing#123', 4),
      fullName: role === 'SELLER' ? 'Ben Cruz' : role === 'SUPER_ADMIN' ? 'Admin Reyes' : 'Ana Reyes',
      role,
      isVerified: true,
      contactNumber: '09171234567',
      municipality: { connect: { id: muni.id } },
    },
  });
  if (role === 'SELLER') {
    await prisma.store.create({
      data: {
        name: `Screens Shop ${tag.slice(-4)}`, slug: `e2e-screens-${tag}`, ownerId: user.id, municipalityId: muni.id,
        isApproved: true, sellerGuides: { all: true },
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { sellerApplicationStatus: 'APPROVED' } });
  }
  return user;
}

async function removeUser(user) {
  const store = await prisma.store.findUnique({ where: { ownerId: user.id } });
  for (const t of ['notification', 'cartItem', 'wishlist', 'searchHistory', 'auditLog', 'refreshToken', 'userSession', 'productView', 'storeFollow', 'address']) {
    if (!prisma[t]) continue;
    for (const key of ['userId', 'actorId', 'buyerId']) await prisma[t].deleteMany({ where: { [key]: user.id } }).catch(() => {});
  }
  if (store) await prisma.store.delete({ where: { id: store.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch((e) => console.error('cleanup:', e.message.split('\n').pop()));
}

async function routes() {
  const product = await prisma.product.findFirst({ where: { status: 'APPROVED', deletedAt: null, listingKind: 'REGULAR', NOT: [{ slug: { startsWith: 'e2e' } }, { slug: { startsWith: 'sample-' } }] }, orderBy: { createdAt: 'desc' }, select: { slug: true } });
  const today = await prisma.product.findFirst({ where: { slug: { startsWith: 'sample-today-' }, deletedAt: null }, select: { slug: true } });
  const store = await prisma.store.findFirst({ where: { isActive: true, isApproved: true, deletedAt: null, NOT: { slug: { startsWith: 'e2e' } } }, select: { slug: true, ownerId: true } });
  const muni = await prisma.municipality.findFirst({ where: { isActive: true }, select: { id: true } });
  const P = product?.slug;
  const S = store?.slug;

  const PUBLIC = [
    '/', '/search', '/products?q=honey', '/search/image', '/today', '/stores',
    P && `/product/${P}`, P && `/product/${P}/reviews`, today && `/product/${today.slug}`,
    S && `/store/${S}`, store && `/u/${store.ownerId}`,
    `/municipality/${muni.id}`, `/municipality/${muni.id}/gallery`,
    '/sell', '/about', '/privacy', '/terms', '/cookies', '/app', '/customer-care', '/feedback', '/help',
    '/this-page-does-not-exist',
  ].filter(Boolean);

  return {
    guest: [
      ...PUBLIC, '/cart',
      '/login', '/seller/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
    ],
    buyer: [
      '/', '/profile', '/profile/orders', '/profile/returns', '/profile/returns/request', '/profile/addresses',
      '/profile/reviews', '/profile/wishlist', '/profile/followed-stores', '/profile/messages', '/profile/notifications',
      '/profile/settings', '/profile/settings/profile', '/profile/settings/contact', '/profile/settings/address',
      '/profile/settings/password', '/profile/settings/data', '/profile/verification', '/profile/support', '/profile/reports',
      '/cart', '/checkout', '/messages', '/wishlist', '/notifications', '/seller/apply',
      P && `/product/${P}`, S && `/store/${S}`, '/today',
    ].filter(Boolean),
    seller: [
      '/seller', '/seller/welcome', '/seller/verification', '/seller/menu', '/seller/marketing',
      '/seller/decorate', '/seller/decorate/home', '/seller/decorate/templates', '/seller/decorate/templates/fresh',
      '/seller/orders', '/seller/returns', '/seller/messages', '/seller/assistant', '/seller/support', '/seller/notifications',
      '/seller/products', '/seller/products/new', '/seller/today', '/seller/reviews', '/seller/questions',
      '/seller/analytics', '/seller/finance',
      '/seller/store', '/seller/store/about', '/seller/store/branding', '/seller/store/location', '/seller/store/colors',
      '/seller/fulfillment', '/seller/fulfillment/method', '/seller/fulfillment/pickup', '/seller/fulfillment/delivery', '/seller/fulfillment/payment',
      '/seller/settings',
    ],
    admin: [
      '/admin', '/admin/menu', '/admin/sellers', '/admin/all-sellers', '/admin/buyers', '/admin/products', '/admin/orders',
      '/admin/reports', '/admin/support', '/admin/users', '/admin/categories', '/admin/municipalities', '/admin/analytics',
      '/admin/messages', '/admin/feedback', '/admin/announcements', '/admin/banners', '/admin/couriers', '/admin/vouchers',
      '/admin/junior-admins', '/admin/audit-logs', '/admin/notifications', '/admin/reviews', '/admin/returns',
      '/admin/settings', '/admin/tools',
    ],
  };
}

const fileName = (route) => (route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?=&]+/g, '_').replace(/[^a-z0-9_.-]/gi, '')) || 'home';

async function signIn(page, user) {
  await page.goto(`${WEB}/brand-icon.png`).catch(() => {});
  if (!user) return;
  const { accessToken } = generateTokens(user);
  const pub = { id: user.id, email: user.email, fullName: user.fullName, role: user.role, isVerified: true, tokenVersion: user.tokenVersion ?? 0, contactNumber: user.contactNumber, municipalityId: user.municipalityId };
  await page.evaluate((token, usr) => {
    localStorage.setItem('emoorm-auth', JSON.stringify({ state: { user: usr, accessToken: token, isAuthenticated: true }, version: 0 }));
    localStorage.setItem('token', token);
    localStorage.setItem('accessToken', token);
    localStorage.setItem('user', JSON.stringify(usr));
  }, accessToken, pub);
}

(async () => {
  const wanted = process.argv.slice(2);
  const roles = wanted.length ? wanted : ['guest', 'buyer', 'seller', 'admin'];
  const list = await routes();
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, protocolTimeout: 90000 });
  const made = [];
  let count = 0;
  const failures = [];
  try {
    for (const role of roles) {
      const user = role === 'guest' ? null
        : await makeUser(role === 'seller' ? 'SELLER' : role === 'admin' ? 'SUPER_ADMIN' : 'BUYER');
      if (user) made.push(user);
      const dir = path.join(OUT, role);
      fs.mkdirSync(dir, { recursive: true });
      const ctx = await browser.createBrowserContext();
      // One tab per page: a page that hangs cannot take the rest down.
      const open = async () => {
        const tab = await ctx.newPage();
        await tab.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        return tab;
      };
      const first = await open();
      for (let i = 0; i < 3; i += 1) {
        try { await signIn(first, user); break; } catch { await wait(1000); }
      }
      await first.close();
      for (const route of list[role]) {
        const page = await open();
        try {
          await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
          await wait(2200);
          await page.keyboard.press('Escape').catch(() => {});
          await wait(300);
          const landed = await page.evaluate(() => location.pathname + location.search);
          await page.screenshot({ path: path.join(dir, `${fileName(route)}.png`), fullPage: true, captureBeyondViewport: true });
          count += 1;
          console.log(`${role} ${route}${landed !== route ? `  (shown: ${landed})` : ''}`);
        } catch (err) {
          failures.push(`${role} ${route}: ${err.message.split('\n')[0]}`);
        } finally {
          await page.close().catch(() => {});
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    for (const u of made) await removeUser(u);
    await prisma.$disconnect();
    console.log(`\n${count} screenshots in ${OUT}`);
    if (failures.length) console.log('failed:\n' + failures.join('\n'));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
