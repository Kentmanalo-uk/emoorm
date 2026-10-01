/**
 * Makes every E-MOORM brand icon from the two official logos in icon/:
 *
 *   icon/logo-green.svg  the green logo, drawn on white: for white and light
 *                        backgrounds (site header, footer, admin, receipts,
 *                        sign-in pages, splash screens, the browser tab)
 *   icon/logo-white.svg  the white logo, drawn on the brand green: for app
 *                        icons and anything else on green
 *
 * Each file carries its own background (a full-size rect). App icons keep the
 * white logo's green; logos placed in a page drop the background so they sit
 * on whatever is behind them.
 *
 * Where each one goes:
 *   - In the page (brand-icon.svg / .png): the green logo, transparent.
 *     brand-icon-white.svg / .png: the white logo, transparent, for green areas.
 *   - As an app (installed web app, iPhone home screen, Android launcher, the
 *     app's download page): the white logo on the brand green.
 *   - Browser tab: the green logo; with a dark browser theme the SVG favicon
 *     switches to the white logo so it stays visible.
 *
 * Run it again after the logo changes, from the repo root:
 *
 *   node web/scripts/make-brand-icons.cjs
 *
 * It writes web/public, mobile/assets and, when the Android project is there,
 * apk/app/src/main/res (then rebuild the APK). Uses sharp from the backend.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const sharp = require(path.join(ROOT, 'backend', 'node_modules', 'sharp'));

const SRC = path.join(ROOT, 'icon');
const GREEN_LOGO = path.join(SRC, 'logo-green.svg');
const WHITE_LOGO = path.join(SRC, 'logo-white.svg');
const PUBLIC = path.join(ROOT, 'web', 'public');
const MOBILE = path.join(ROOT, 'mobile', 'assets');
const APK_RES = path.join(ROOT, 'apk', 'app', 'src', 'main', 'res');

// Logo height as a share of the icon.
const LOGO_APP = 0.68; // square app icons (any, iPhone, download page)
const LOGO_MASKABLE = 0.64; // maskable: stays inside the 80% safe circle
const LOGO_ROUND = 0.62; // round icons (Android 7 launchers)
const LOGO_ADAPTIVE = 0.453; // Android adaptive layer: 49dp of the 72dp shown

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const written = [];
const save = async (file, buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  written.push(path.relative(ROOT, file));
};

/* ── The SVG masters ─────────────────────────────────────────────────── */

const BG_RECT = /\s*<rect width="(\d+)" height="(\d+)" fill="(#[0-9A-Fa-f]{6})"\s*\/>/;

/** A master: its background colour, the logo without it, and its parts. */
const master = (file) => {
  const svg = fs.readFileSync(file, 'utf8');
  const bg = svg.match(BG_RECT);
  if (!bg) throw new Error(`${path.relative(ROOT, file)}: no full-size background rect`);
  const bare = svg.replace(BG_RECT, '');
  const open = bare.match(/<svg[^>]*>/)[0];
  const [, , vw, vh] = open.match(/viewBox="([\d.\s-]+)"/)[1].trim().split(/\s+/).map(Number);
  const inner = bare.slice(bare.indexOf(open) + open.length, bare.lastIndexOf('</svg>'));
  return { svg: bare, inner, background: bg[3].toUpperCase(), size: { w: vw, h: vh } };
};

/** The drawing rendered transparent, cropped to its edges, and that box in SVG units. */
const rendered = async (m) => {
  const scale = 2;
  const png = await sharp(Buffer.from(m.svg), { density: 72 * scale, limitInputPixels: false }).png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width; let y0 = info.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width + x] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const crop = await sharp(png).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer();
  const k = info.width / m.size.w;
  return { png: crop, box: { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k } };
};

/** A square viewBox around the drawing, with a little room. */
const squareBox = (box, pad = 0.02) => {
  const side = Math.max(box.w, box.h) * (1 + pad * 2);
  const cx = box.x + box.w / 2; const cy = box.y + box.h / 2;
  return { x: cx - side / 2, y: cy - side / 2, side };
};
const vb = (b) => `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.side.toFixed(1)} ${b.side.toFixed(1)}`;

/** The same drawing with its ids prefixed, so two logos can share one file. */
const prefixIds = (inner, prefix) => inner
  .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
  .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
  .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`);

/** The logo as its own SVG, cropped square, transparent. */
const croppedSvg = (m, box) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb(squareBox(box))}">${m.inner}</svg>\n`);

/* ── Raster helpers ──────────────────────────────────────────────────── */

/** The logo at a given height, centred on a square canvas. */
const placed = async (logo, size, share, background = CLEAR) => {
  const meta = await sharp(logo).metadata();
  let height = Math.round(size * share);
  let width = Math.round((meta.width / meta.height) * height);
  if (width > size) { width = size; height = Math.round((meta.height / meta.width) * width); }
  const art = await sharp(logo).resize(width, height, { kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png().toBuffer();
};

const shapeSvg = (size, fill, shape = 'square') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape === 'circle'
  ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/>`
  : `<rect width="${size}" height="${size}" rx="${shape === 'rounded' ? size * 0.18 : 0}" fill="${fill}"/>`}</svg>`);

/** The app icon: the white logo on the brand green. */
const appIcon = async (white, green, size, share, shape = 'square') => {
  const logo = await placed(white, size, share);
  const img = sharp(shapeSvg(size, green, shape)).composite([{ input: logo }]);
  // Full-bleed squares have no transparency (iPhone and maskable icons need that).
  return shape === 'square' ? img.flatten({ background: green }).png().toBuffer() : img.png().toBuffer();
};

/** One colour silhouette of the logo (Android themed icons). */
const silhouette = async (logo, size, share) => {
  const shape = await placed(logo, size, share);
  const alpha = await sharp(shape).extractChannel(3).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha).png().toBuffer();
};

/** A .ico holding PNG images (every current browser reads these). */
const ico = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.png)]);
};

/* ── Outputs ─────────────────────────────────────────────────────────── */

async function web(L) {
  const { greenM, whiteM, green, white, brand } = L;
  // In-page logos, transparent: green for light areas, white for green ones.
  await save(path.join(PUBLIC, 'brand-icon.svg'), croppedSvg(greenM, green.box));
  await save(path.join(PUBLIC, 'brand-icon.png'), await placed(green.png, 1024, 0.96));
  await save(path.join(PUBLIC, 'brand-icon-white.svg'), croppedSvg(whiteM, white.box));
  await save(path.join(PUBLIC, 'brand-icon-white.png'), await placed(white.png, 1024, 0.96));

  // Browser tab: .ico (16/32/48) and an SVG that follows the browser's theme.
  const tab = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await placed(green.png, size, 1) })));
  await save(path.join(PUBLIC, 'favicon.ico'), ico(tab));
  await save(path.join(PUBLIC, 'favicon.svg'), Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb(squareBox(green.box, 0))}">
  <style>.on-dark{display:none}@media (prefers-color-scheme:dark){.on-light{display:none}.on-dark{display:inline}}</style>
  <g class="on-light">${prefixIds(greenM.inner, 'g-')}</g>
  <g class="on-dark">${prefixIds(whiteM.inner, 'w-')}</g>
</svg>
`));

  // App icons: installed web app (manifest), iPhone home screen, install bar, download page.
  for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
    await save(path.join(PUBLIC, `icon-${size}x${size}.png`), await appIcon(white.png, brand, size, LOGO_APP));
    await save(path.join(PUBLIC, `icon-${size}x${size}-maskable.png`), await appIcon(white.png, brand, size, LOGO_MASKABLE));
  }
  await save(path.join(PUBLIC, 'apple-touch-icon.png'), await appIcon(white.png, brand, 180, LOGO_APP));
  for (const size of [192, 512]) {
    await save(path.join(PUBLIC, 'icons', `icon-${size}x${size}.png`), await appIcon(white.png, brand, size, LOGO_APP));
    await save(path.join(PUBLIC, 'icons', `icon-${size}x${size}-maskable.png`), await appIcon(white.png, brand, size, LOGO_MASKABLE));
  }
  await save(path.join(PUBLIC, 'icons', 'icon-base.png'), await appIcon(white.png, brand, 1024, LOGO_APP));
  // The same app icon as a vector (manifest's SVG icon): the white logo,
  // LOGO_APP of the height, centred on the green.
  const b = white.box;
  const h = 1024 * LOGO_APP; const w = (b.w / b.h) * h;
  await save(path.join(PUBLIC, 'icons', 'icon.svg'), Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${brand}"/>
  <svg x="${((1024 - w) / 2).toFixed(1)}" y="${((1024 - h) / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}">${whiteM.inner}</svg>
</svg>
`));
}

async function mobile(L) {
  if (!fs.existsSync(MOBILE)) return;
  const { green, white, brand } = L;
  await save(path.join(MOBILE, 'icon.png'), await appIcon(white.png, brand, 1024, LOGO_APP));
  // Expo's adaptive icon: 1024² layers, same proportions as Android's 108dp.
  await save(path.join(MOBILE, 'android-icon-foreground.png'), await placed(white.png, 1024, LOGO_ADAPTIVE));
  await save(path.join(MOBILE, 'android-icon-background.png'), await sharp(shapeSvg(1024, brand)).png().toBuffer());
  await save(path.join(MOBILE, 'android-icon-monochrome.png'), await silhouette(white.png, 1024, LOGO_ADAPTIVE));
  await save(path.join(MOBILE, 'favicon.png'), await placed(green.png, 196, 1));
  await save(path.join(MOBILE, 'splash-icon.png'), await placed(green.png, 1024, 0.96));
  await save(path.join(MOBILE, 'brand-icon.png'), await placed(green.png, 1024, 0.96));
}

async function android(L) {
  if (!fs.existsSync(APK_RES)) return;
  const { green, white, brand } = L;
  const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  const mask = (size, radius) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(APK_RES, `mipmap-${density}`);
    // Adaptive icon (Android 8+): the logo on its own over the green layer
    // (drawable/ic_launcher_background.xml), inside every launcher's mask.
    const layer = Math.round(108 * scale);
    await save(path.join(dir, 'ic_launcher_foreground.png'), await placed(white.png, layer, LOGO_ADAPTIVE));
    await save(path.join(dir, 'ic_launcher_monochrome.png'), await silhouette(white.png, layer, LOGO_ADAPTIVE));
    // Older launchers (Android 7): a rounded square and a round icon, 48dp.
    const legacy = Math.round(48 * scale);
    const square = await appIcon(white.png, brand, legacy, LOGO_APP, 'square');
    await save(path.join(dir, 'ic_launcher.png'), await sharp(square).composite([{ input: mask(legacy, Math.round(legacy * 0.18)), blend: 'dest-in' }]).png().toBuffer());
    await save(path.join(dir, 'ic_launcher_round.png'), await appIcon(white.png, brand, legacy, LOGO_ROUND, 'circle'));
  }
  // The green layer as a drawable, so it is sharp at every size.
  await save(path.join(APK_RES, 'drawable', 'ic_launcher_background.xml'), Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<!-- The app icon's green: the white logo's own background (icon/logo-white.svg). -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${brand}" />
</shape>
`));
  // Splash (logo on white): a 288dp square, the logo inside the 192dp circle
  // Android 12+ shows; the app's own splash uses the same image.
  for (const density of ['xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const size = Math.round(288 * DENSITIES[density]);
    await save(path.join(APK_RES, `drawable-${density}`, 'splash_icon.png'), await placed(green.png, size, 150 / 288));
  }
}

(async () => {
  for (const file of [GREEN_LOGO, WHITE_LOGO]) if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(ROOT, file)}`);
  const greenM = master(GREEN_LOGO);
  const whiteM = master(WHITE_LOGO);
  const L = {
    greenM,
    whiteM,
    green: await rendered(greenM),
    white: await rendered(whiteM),
    brand: whiteM.background, // the app icon's green
  };
  await web(L);
  await mobile(L);
  await android(L);
  console.log(`App icon green ${L.brand}; ${written.length} files written:\n  ${written.join('\n  ')}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
