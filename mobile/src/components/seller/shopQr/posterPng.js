/*
 * The poster PNG (web/src/lib/shopQrPoster.js withPrintDpi): the Svg's
 * toDataURL gives base64; this adds a pHYs chunk saying 300 dpi, so photo
 * and print apps size it at A6 (10.5 × 14.8 cm) by default.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i += 1) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64) {
  const clean = String(b64).replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < len) out[o++] = (n >> 16) & 0xff;
    if (o < len) out[o++] = (n >> 8) & 0xff;
    if (o < len) out[o++] = n & 0xff;
  }
  return out;
}

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return s;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (arr, at, v) => {
  arr[at] = (v >>> 24) & 0xff;
  arr[at + 1] = (v >>> 16) & 0xff;
  arr[at + 2] = (v >>> 8) & 0xff;
  arr[at + 3] = v & 0xff;
};

/** The PNG with a pHYs chunk (300 dpi) right after IHDR; anything else comes back as it was. */
export function withPrintDpi(png, dpi = 300) {
  if (png.length < 33 || png[12] !== 0x49 || png[13] !== 0x48) return png; // IHDR first, or leave it
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  u32(chunk, 0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  u32(chunk, 8, ppm);
  u32(chunk, 12, ppm);
  chunk[16] = 1; // metres
  u32(chunk, 17, crc32(chunk.subarray(4, 17)));
  const at = 33; // signature + IHDR
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}
