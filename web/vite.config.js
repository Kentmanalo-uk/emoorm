import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import postcss from 'postcss'

/**
 * Phones: bold text reads heavy on a small screen, so in the buyer-facing
 * stylesheets every bold weight (600–900) is written as
 * `var(--phone-bold, <weight>)`; on phones the buyer app's roots set
 * --phone-bold to medium (500, src/index.css), everywhere else the weight
 * stays. Built from the stylesheets themselves, so new styles are covered
 * without a hand-kept list. (It used to add a phone-only copy of every bold
 * selector, some 50 kB of repeated selectors.)
 *
 * Left alone: the Seller Center and admin panel, the Sell landing page and the
 * app's download page (their display type is part of the design), keyframes,
 * and rules that only apply on wider screens. Scoped to the buyer app's roots
 * (.layout and the Log in / Sign up pages) so shared components elsewhere are
 * untouched (outside those roots the variable is not set). Headings are set
 * to regular weight separately, in index.css, and win over this (except on
 * the download page, whose titles stay bold).
 *
 * Runs only on buyer stylesheets; a file it cannot parse is left as it is.
 */
function phoneMediumWeights() {
  const SRC_CSS = /[\\/]web[\\/]src[\\/].*\.css$/;
  const SKIP_FILE = /[\\/]components[\\/](admin|seller)[\\/]|[\\/]pages[\\/](Admin|Seller|Sell|AppDownload)[^\\/]*\.css$|(Admin|Seller)Layout/i;
  const weightOf = (v) => {
    const t = String(v).replace('!important', '').trim();
    if (t === 'bold' || t === 'bolder') return 700;
    return parseInt(t, 10) || 0;
  };

  return {
    name: 'phone-medium-weights',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!SRC_CSS.test(file) || SKIP_FILE.test(file)) return null;
      let root;
      try {
        root = postcss.parse(code, { from: file });
      } catch (err) {
        this.warn(`phone-medium-weights: skipped ${file} (${err.reason || err.message})`);
        return null;
      }
      let changed = false;
      root.walkDecls('font-weight', (decl) => {
        const weight = weightOf(decl.value);
        if (weight < 600) return;
        const rule = decl.parent;
        if (!rule || rule.type !== 'rule') return;
        for (let a = rule.parent; a && a.type !== 'root'; a = a.parent) {
          if (a.type === 'atrule' && (/keyframes/i.test(a.name) || /min-width/.test(a.params))) return;
        }
        // A rule for the page itself is left as it is.
        if (rule.selectors.every((raw) => /^(html|body|:root)\b/.test(raw.trim()))) return;
        decl.value = `var(--phone-bold, ${weight})`;
        changed = true;
      });
      if (!changed) return null;
      return { code: root.toString(), map: null };
    },
  };
}

/**
 * Every build gets an id of its own, baked into the page (__BUILD_ID__) and
 * written next to it as /version.json. A page that has been open since
 * before a deploy (the Android app kept in the background, a tab left open)
 * compares the two and reloads itself when they differ (src/lib/freshness.js),
 * so a website update reaches the app without a new APK and without anyone
 * pressing refresh.
 */
const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
function buildStamp() {
  return {
    name: 'build-stamp',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: BUILD_ID, builtAt: new Date().toISOString() }),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), phoneMediumWeights(), buildStamp()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // Listen on the LAN as well, so phones on the same Wi-Fi can open the dev site.
  server: {
    host: true,
  },
  build: {
    // Keep classic media-query syntax (max-width: 768px) in the built CSS.
    // The default minifier emits `(width <= 768px)`, which older phone
    // browsers ignore — dropping every responsive rule on those devices.
    cssTarget: ['chrome87', 'safari14', 'firefox78', 'edge88'],
  },
})
