/*
 * Side-by-side check of the mobile app against the website's phone view.
 *
 *   node mobile/tools/compare.cjs <name> <webPath> <mobilePath> [--as buyer|seller|guest] [--scroll N] [--full]
 *
 * Opens the website (http://localhost:3000) and the mobile app's web build
 * (Expo, http://localhost:8081) at the same phone size (390 × 844), signed in
 * as the same throwaway user (deleted afterwards), and writes
 * mobile/tools/shots/<name>.png: the website on the left, the app on the right.
 *
 * Needs: the backend + website on :3000 and `npx expo start --web --port 8081`
 * in mobile/. Run from the repo root or anywhere: paths are absolute.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const B = path.join(ROOT, 'backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env'), quiet: true });
const { PrismaClient } = require(path.join(B, 'node_modules/@prisma/client'));
const bcrypt = require(path.join(B, 'node_modules/bcryptjs'));
const { generateTokens } = require(path.join(B, 'src/utils/jwt'));
const sharp = require(path.join(B, 'node_modules/sharp'));

const findPuppeteer = () => {
  const tries = [
    path.join(ROOT, 'node_modules/puppeteer-core'),
    path.join(ROOT, 'web/node_modules/puppeteer-core'),
    'C:/Users/Kaye/AppData/Local/Temp/claude/c--laragon-www-emoorm-app-emoorm/a02f6d7b-686e-423a-8e86-7cdf22b9afa7/scratchpad/node_modules/puppeteer-core',
  ];
  for (const t of tries) { try { return require(t); } catch { /* next */ } }
  throw new Error('puppeteer-core not found');
};
const puppeteer = findPuppeteer();

const WEB = process.env.COMPARE_WEB || 'http://localhost:3000';
const APP = process.env.COMPARE_APP || 'http://localhost:8081';
const OUT = path.join(__dirname, 'shots');
const W = 390;
const H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : fallback;
};
const [name, webPath, appPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--full'));
const as = flag('as', 'buyer');
const scroll = Number(flag('scroll', 0)) || 0;
const full = Boolean(flag('full', false));

if (!name || !webPath || !appPath) {
  console.error('usage: compare.cjs <name> <webPath> <mobilePath> [--as buyer|seller|guest] [--scroll N] [--full]');
  process.exit(2);
}

const prisma = new PrismaClient();

async function makeUser(role) {
  const muni = await prisma.municipality.findFirst({ where: { isActive: true }, select: { id: true } });
  const email = `e2e-compare-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash('Testing#123', 4),
      fullName: role === 'SELLER' ? 'Ben Cruz' : 'Ana Reyes',
      role,
      isVerified: true,
      contactNumber: '09171234567',
      municipality: { connect: { id: muni.id } },
    },
  });
  if (role === 'SELLER') {
    await prisma.store.create({
      data: {
        name: `Compare Shop ${Math.random().toString(36).slice(2, 6)}`, slug: `e2e-compare-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ownerId: user.id, municipalityId: muni.id,
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

async function signIn(page, origin, user) {
  await page.goto(`${origin}/favicon.ico`).catch(() => {});
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

async function shoot(browser, origin, route, user) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await signIn(page, origin, user);
  await page.goto(`${origin}${route}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await wait(2500);
  await page.keyboard.press('Escape').catch(() => {});
  if (scroll) {
    // The website scrolls the window; the app scrolls inside its own
    // ScrollView: scroll whichever is the biggest scrollable thing on screen.
    await page.evaluate((y) => {
      const scrollers = [...document.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 200;
      });
      const box = scrollers.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
      if (box && document.documentElement.scrollHeight <= window.innerHeight + 4) box.scrollTop += y;
      else window.scrollBy(0, y);
    }, scroll);
    await wait(700);
  }
  const file = path.join(OUT, `.${name}-${origin === WEB ? 'web' : 'app'}.png`);
  await page.screenshot({ path: file, fullPage: full, captureBeyondViewport: full });
  await ctx.close();
  return { file, errors };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const user = as === 'guest' ? null : await makeUser(as === 'seller' ? 'SELLER' : 'BUYER');
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const web = await shoot(browser, WEB, webPath, user);
    const app = await shoot(browser, APP, appPath, user);
    const meta = async (f) => sharp(f).metadata();
    const [mw, ma] = [await meta(web.file), await meta(app.file)];
    const height = Math.max(mw.height, ma.height);
    const label = (text, width) => Buffer.from(`<svg width="${width}" height="44"><rect width="100%" height="100%" fill="#111"/><text x="14" y="30" font-family="Arial" font-size="24" fill="#fff">${text}</text></svg>`);
    const gap = 24;
    await sharp({ create: { width: mw.width + ma.width + gap, height: height + 44, channels: 3, background: '#888' } })
      .composite([
        { input: label(`WEB ${webPath}`, mw.width), left: 0, top: 0 },
        { input: label(`APP ${appPath}`, ma.width), left: mw.width + gap, top: 0 },
        { input: web.file, left: 0, top: 44 },
        { input: app.file, left: mw.width + gap, top: 44 },
      ])
      .png()
      .toFile(path.join(OUT, `${name}.png`));
    fs.unlinkSync(web.file); fs.unlinkSync(app.file);
    console.log(path.join(OUT, `${name}.png`));
    if (web.errors.length) console.log('web page errors:', web.errors.slice(0, 3));
    if (app.errors.length) console.log('app page errors:', app.errors.slice(0, 3));
  } finally {
    await browser.close();
    if (user) await removeUser(user);
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
