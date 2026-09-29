/**
 * Makes every E-MOORM brand icon from the two master logos in icon/:
 *
 *   icon/logo-official.png  green logo, for white and light backgrounds
 *   icon/logo-invert.png    white/mint logo, for green and dark backgrounds
 *   icon/logo-official.svg  the same logo as a vector (favicon, SVG icons)
 *
 * Where each one goes:
 *   - On white (site header, footer, admin, receipts, splash screens): the
 *     official logo on its own.
 *   - As an app (installed web app, iPhone home screen, Android launcher,
 *     the app's download page): the invert logo on the brand green.
 *   - Browser tab: the official logo; with a dark browser theme the SVG
 *     favicon switches to the invert logo so it stays visible.
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
const OFFICIAL = path.join(SRC, 'logo-official.png');
const INVERT = path.join(SRC, 'logo-invert.png');
const OFFICIAL_SVG = path.join(SRC, 'logo-official.svg');
const PUBLIC = path.join(ROOT, 'web', 'public');
const MOBILE = path.join(ROOT, 'mobile', 'assets');
const APK_RES = path.join(ROOT, 'apk', 'app', 'src', 'main', 'res');

// The app icon's green: the official logo's own gradient, a shade deeper so
// the white logo reads everywhere on it. Bottom-left → top-right.
const GREEN_FROM = '#004a2c';
const GREEN_TO = '#009b3a';
const GREEN_SOLID = '#00632f'; // where one flat colour is needed

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

/** The logo cropped to its own edges (both masters share one outline). */
const trimmed = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width; let y0 = info.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width + x] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return sharp(file).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer();
};

/** The logo at a given height, centred on a square canvas. */
const placed = async (logo, size, share, background = CLEAR) => {
  const meta = await sharp(logo).metadata();
  const height = Math.round(size * share);
  const width = Math.round((meta.width / meta.height) * height);
  const art = await sharp(logo).resize(width, height, { kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png().toBuffer();
};

const greenSvg = (size, shape = 'square') => {
  const body = shape === 'circle'
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>`
    : `<rect width="${size}" height="${size}" rx="${shape === 'rounded' ? size * 0.18 : 0}" fill="url(#g)"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${GREEN_FROM}"/><stop offset="1" stop-color="${GREEN_TO}"/></linearGradient></defs>
  ${body}</svg>`);
};

/** The app icon: the invert logo on the green. */
const appIcon = async (invert, size, share, shape = 'square') => {
  const logo = await placed(invert, size, share);
  const img = sharp(greenSvg(size, shape)).composite([{ input: logo }]);
  // Full-bleed squares have no transparency (iPhone and maskable icons need that).
  return shape === 'square' ? img.flatten({ background: GREEN_SOLID }).png().toBuffer() : img.png().toBuffer();
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

/** The vector logo: its path, gradients and the box around the drawing. */
const vector = () => {
  const svg = fs.readFileSync(OFFICIAL_SVG, 'utf8');
  const d = svg.match(/<path[^>]*\sd="([^"]+)"/)[1];
  return { d, box: { x: 56.25, y: 26, w: 893.75, h: 961.75 } }; // the logo's edges in its 1024 space
};
const OFFICIAL_STOPS = ['#004c2d', '#006130', '#007532', '#008a35', '#009f38', '#00ae38', '#00ba26'];
const INVERT_STOPS = ['#bdedc8', '#c7f0d0', '#d3f3da', '#e4f8e9', '#f2fbf4', '#fafefb', '#ffffff'];
const gradient = (id, stops, [x1, y1, x2, y2]) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${((i + 0.5) / stops.length).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const OFFICIAL_AXIS = [186, 852, 838, 205];
const INVERT_AXIS = [255, 930, 763, 120];

async function web(official, invert) {
  // In-page logo (header, footer, admin, receipts, product placeholder).
  await save(path.join(PUBLIC, 'brand-icon.png'), await sharp(OFFICIAL).resize(1024, 1024, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer());
  await save(path.join(PUBLIC, 'brand-icon.svg'), fs.readFileSync(OFFICIAL_SVG));

  // Browser tab: .ico (16/32/48) and an SVG that follows the browser's theme.
  const tab = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await placed(official, size, 1) })));
  await save(path.join(PUBLIC, 'favicon.ico'), ico(tab));
  const { d, box } = vector();
  const side = box.h; const vx = box.x + box.w / 2 - side / 2;
  await save(path.join(PUBLIC, 'favicon.svg'), Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${box.y} ${side} ${side}">
  <style>path{fill:url(#official)}@media (prefers-color-scheme:dark){path{fill:url(#invert)}}</style>
  <defs>${gradient('official', OFFICIAL_STOPS, OFFICIAL_AXIS)}${gradient('invert', INVERT_STOPS, INVERT_AXIS)}</defs>
  <path fill-rule="evenodd" d="${d}"/>
</svg>
`));

  // App icons: installed web app (manifest), iPhone home screen, install bar, download page.
  for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
    await save(path.join(PUBLIC, `icon-${size}x${size}.png`), await appIcon(invert, size, LOGO_APP));
    await save(path.join(PUBLIC, `icon-${size}x${size}-maskable.png`), await appIcon(invert, size, LOGO_MASKABLE));
  }
  await save(path.join(PUBLIC, 'apple-touch-icon.png'), await appIcon(invert, 180, LOGO_APP));
  for (const size of [192, 512]) {
    await save(path.join(PUBLIC, 'icons', `icon-${size}x${size}.png`), await appIcon(invert, size, LOGO_APP));
    await save(path.join(PUBLIC, 'icons', `icon-${size}x${size}-maskable.png`), await appIcon(invert, size, LOGO_MASKABLE));
  }
  await save(path.join(PUBLIC, 'icons', 'icon-base.png'), await appIcon(invert, 1024, LOGO_APP));
  // The same app icon as a vector (manifest's SVG icon).
  const k = (1024 * LOGO_APP) / box.h;
  const tx = 512 - k * (box.x + box.w / 2); const ty = 512 - k * (box.y + box.h / 2);
  await save(path.join(PUBLIC, 'icons', 'icon.svg'), Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="green" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${GREEN_FROM}"/><stop offset="1" stop-color="${GREEN_TO}"/></linearGradient>
    ${gradient('logo', INVERT_STOPS, INVERT_AXIS)}
  </defs>
  <rect width="1024" height="1024" fill="url(#green)"/>
  <path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})" fill="url(#logo)" fill-rule="evenodd" d="${d}"/>
</svg>
`));
}

async function mobile(official, invert) {
  if (!fs.existsSync(MOBILE)) return;
  await save(path.join(MOBILE, 'icon.png'), await appIcon(invert, 1024, LOGO_APP));
  // Expo's adaptive icon: 1024² layers, same proportions as Android's 108dp.
  await save(path.join(MOBILE, 'android-icon-foreground.png'), await placed(invert, 1024, LOGO_ADAPTIVE));
  await save(path.join(MOBILE, 'android-icon-background.png'), await sharp(greenSvg(1024)).png().toBuffer());
  await save(path.join(MOBILE, 'android-icon-monochrome.png'), await silhouette(invert, 1024, LOGO_ADAPTIVE));
  await save(path.join(MOBILE, 'favicon.png'), await placed(official, 196, 1));
  await save(path.join(MOBILE, 'splash-icon.png'), await placed(official, 1024, 0.96));
  await save(path.join(MOBILE, 'brand-icon.png'), await sharp(OFFICIAL).resize(1024, 1024, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer());
}

async function android(official, invert) {
  if (!fs.existsSync(APK_RES)) return;
  const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  const mask = (size, radius) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(APK_RES, `mipmap-${density}`);
    // Adaptive icon (Android 8+): the logo on its own over the green layer
    // (drawable/ic_launcher_background.xml), inside every launcher's mask.
    const layer = Math.round(108 * scale);
    await save(path.join(dir, 'ic_launcher_foreground.png'), await placed(invert, layer, LOGO_ADAPTIVE));
    await save(path.join(dir, 'ic_launcher_monochrome.png'), await silhouette(invert, layer, LOGO_ADAPTIVE));
    // Older launchers (Android 7): a rounded square and a round icon, 48dp.
    const legacy = Math.round(48 * scale);
    const square = await appIcon(invert, legacy, LOGO_APP, 'square');
    await save(path.join(dir, 'ic_launcher.png'), await sharp(square).composite([{ input: mask(legacy, Math.round(legacy * 0.18)), blend: 'dest-in' }]).png().toBuffer());
    await save(path.join(dir, 'ic_launcher_round.png'), await appIcon(invert, legacy, LOGO_ROUND, 'circle'));
  }
  // The green layer as a drawable, so it is sharp at every size.
  await save(path.join(APK_RES, 'drawable', 'ic_launcher_background.xml'), Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<!-- The app icon's green: bottom-left ${GREEN_FROM} to top-right ${GREEN_TO}. -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:type="linear" android:angle="45" android:startColor="${GREEN_FROM.toUpperCase()}" android:endColor="${GREEN_TO.toUpperCase()}" />
</shape>
`));
  // Splash (logo on white): a 288dp square, the logo inside the 192dp circle
  // Android 12+ shows; the app's own splash uses the same image.
  for (const density of ['xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const size = Math.round(288 * DENSITIES[density]);
    await save(path.join(APK_RES, `drawable-${density}`, 'splash_icon.png'), await placed(official, size, 150 / 288));
  }
}

(async () => {
  for (const file of [OFFICIAL, INVERT, OFFICIAL_SVG]) if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(ROOT, file)}`);
  const official = await trimmed(OFFICIAL);
  const invert = await trimmed(INVERT);
  await web(official, invert);
  await mobile(official, invert);
  await android(official, invert);
  console.log(`${written.length} files written:\n  ${written.join('\n  ')}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
