import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import postcss from 'postcss'

/**
 * Phones: bold text reads heavy on a small screen, so in the buyer-facing
 * stylesheets every rule that sets a bold weight (600–900) also gets a
 * phone-only copy at medium (500). Built from the stylesheets themselves, so
 * new styles are covered without a hand-kept list.
 *
 * Left alone: the Seller Center and admin panel, the Sell landing page (its
 * display type is part of the design), keyframes, and rules that only apply
 * on wider screens. Scoped to the buyer app's roots (.layout and the Log in /
 * Sign up pages) so shared components elsewhere are untouched. Headings are
 * set to regular weight separately, in index.css, and win over this.
 *
 * Runs only on buyer stylesheets; a file it cannot parse is left as it is.
 */
function phoneMediumWeights() {
  const SRC_CSS = /[\\/]web[\\/]src[\\/].*\.css$/;
  const SKIP_FILE = /[\\/]components[\\/](admin|seller)[\\/]|[\\/]pages[\\/](Admin|Seller|Sell)[^\\/]*\.css$|(Admin|Seller)Layout/i;
  const ROOTS = ':where(.layout, .login-page, .register-page)';
  const OWN_ROOT = /^\.(layout|login-page|register-page)\b/;
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
      const selectors = new Set();
      root.walkDecls('font-weight', (decl) => {
        if (weightOf(decl.value) < 600) return;
        const rule = decl.parent;
        if (!rule || rule.type !== 'rule') return;
        for (let a = rule.parent; a && a.type !== 'root'; a = a.parent) {
          if (a.type === 'atrule' && (/keyframes/i.test(a.name) || /min-width/.test(a.params))) return;
        }
        rule.selectors.forEach((raw) => {
          const s = raw.trim();
          if (/^(html|body|:root)\b/.test(s)) return;
          selectors.add(OWN_ROOT.test(s) ? s : `${ROOTS} ${s}`);
        });
      });
      if (!selectors.size) return null;
      return {
        code: `${code}\n\n/* phone-medium-weights (vite.config.js) */\n@media (max-width: 768px) {\n  ${[...selectors].join(',\n  ')} {\n    font-weight: 500 !important;\n  }\n}\n`,
        map: null,
      };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), phoneMediumWeights()],
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
