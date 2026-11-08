// iPhone launch screens for the home-screen web app (apple-touch-startup-image):
// the green logo centred on white, one per iPhone screen, and the <link> tags
// to paste into index.html.   node web/scripts/make-splash.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const sharp = require(path.join(ROOT, 'backend', 'node_modules', 'sharp'));
const OUT = path.join(ROOT, 'web/public/splash');
fs.mkdirSync(OUT, { recursive: true });
const logo = fs.readFileSync(path.join(ROOT, 'media/brand/logos/logo-green.svg'));

// CSS width × height (portrait) and pixel ratio.
const PHONES = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 14/15 Pro Max, 15/16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 12/13 Pro
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 736, 3], // 6/7/8 Plus
  [375, 667, 2], // 6/7/8, SE 2nd/3rd
  [320, 568, 2], // SE 1st
];

(async () => {
  const links = [];
  for (const [w, h, r] of PHONES) {
    const W = w * r;
    const H = h * r;
    const size = Math.round(W * 0.3);
    const mark = await sharp(logo, { density: 150 }).resize(size, size, { fit: 'contain', background: '#ffffff00' }).png().toBuffer();
    const file = `splash-${W}x${H}.png`;
    await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite([{ input: mark, left: Math.round((W - size) / 2), top: Math.round((H - size) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(OUT, file));
    links.push(`    <link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="/splash/${file}" />`);
  }
  console.log(links.join('\n'));
  console.log(fs.readdirSync(OUT).map((f) => `${f} ${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} KB`).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
