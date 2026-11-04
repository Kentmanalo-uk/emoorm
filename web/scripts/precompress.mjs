// After `vite build`: a brotli (.br) and a gzip (.gz) copy of each built
// script, stylesheet and other text file in dist/assets, made once here at
// the strongest settings. The server sends these as they are
// (backend/src/middleware/webApp.js) instead of compressing the same files
// again on every request, which cost CPU on every visit and, done on the
// fly, used a weaker setting. Files that do not get smaller (or are already
// compressed: images, fonts) get no copy.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');
const TEXT = /\.(?:js|mjs|css|svg|json|txt|xml|wasm)$/i;
const MIN_BYTES = 1024;

const files = (await readdir(ASSETS)).filter((name) => TEXT.test(name));
let before = 0;
let afterBr = 0;
let made = 0;
for (const name of files) {
  const file = path.join(ASSETS, name);
  // eslint-disable-next-line no-await-in-loop
  if ((await stat(file)).size < MIN_BYTES) continue;
  // eslint-disable-next-line no-await-in-loop
  const data = await readFile(file);
  // eslint-disable-next-line no-await-in-loop
  const [br, gz] = await Promise.all([
    brotli(data, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
        [zlib.constants.BROTLI_PARAM_MODE]: /\.(?:wasm)$/i.test(name) ? zlib.constants.BROTLI_MODE_GENERIC : zlib.constants.BROTLI_MODE_TEXT,
      },
    }),
    gzip(data, { level: 9 }),
  ]);
  const writes = [];
  if (br.length < data.length) writes.push(writeFile(`${file}.br`, br));
  if (gz.length < data.length) writes.push(writeFile(`${file}.gz`, gz));
  // eslint-disable-next-line no-await-in-loop
  await Promise.all(writes);
  before += data.length;
  afterBr += Math.min(br.length, data.length);
  made += writes.length;
}
console.log(`precompress: ${made} copies for ${files.length} files, ${Math.round(before / 1024)} kB → ${Math.round(afterBr / 1024)} kB with brotli`);
