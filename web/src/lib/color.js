/**
 * Colour maths for the theme system.
 *
 * Small and dependency-free on purpose: the theme editor needs to parse what
 * someone types, build a ten-step ramp from one colour, and say whether the
 * result is readable. None of that needs a library, and a theme that can be
 * edited by an administrator is not somewhere to add a supply-chain risk.
 *
 * Everything here is pure. Nothing touches the DOM.
 */

/* ── Parsing ──────────────────────────────────────────────────────────────
   Accepts what a person would plausibly type or paste: #abc, #aabbcc,
   #aabbccdd, rgb(0 0 0), rgb(0, 0, 0), rgba(...), hsl(...), hsla(...) and
   the handful of bare words that turn up in stylesheets. Returns null on
   anything it does not understand, so callers can tell "not a colour yet"
   from "black". */

const NAMED = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 1000) / 1000;

const parseHex = (input) => {
  const hex = input.slice(1);
  if (!/^[0-9a-f]+$/i.test(hex)) return null;

  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b, a] = hex.split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: hex.length === 4 ? a / 255 : 1 };
  }
  if (hex.length === 6 || hex.length === 8) {
    const pair = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: pair(0), g: pair(2), b: pair(4), a: hex.length === 8 ? pair(6) / 255 : 1 };
  }
  return null;
};

// Both the legacy comma form and the modern space form, with optional alpha.
const numbers = (body) => body
  .trim()
  .replace(/\//g, ' ')
  .split(/[,\s]+/)
  .filter(Boolean);

const channel = (token) => (
  token.endsWith('%') ? (parseFloat(token) / 100) * 255 : parseFloat(token)
);

const alpha = (token) => {
  if (token === undefined) return 1;
  return clamp(token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token), 0, 1);
};

export const parseColor = (input) => {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (NAMED[value]) return { ...NAMED[value] };
  if (value.startsWith('#')) return parseHex(value);

  const fn = value.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (!fn) return null;
  const parts = numbers(fn[2]);
  if (parts.length < 3) return null;

  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.map(channel);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: alpha(parts[3]) };
  }

  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if ([h, s, l].some(Number.isNaN)) return null;
  return { ...hslToRgb({ h, s: clamp(s, 0, 1), l: clamp(l, 0, 1) }), a: alpha(parts[3]) };
};

export const isColor = (input) => parseColor(input) !== null;

/* ── Conversion ──────────────────────────────────────────────────────── */

export const rgbToHex = ({ r, g, b }) => (
  `#${[r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')}`
);

export const rgbToHsl = ({ r, g, b }) => {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h;
  if (max === rf) h = ((gf - bf) / delta) % 6;
  else if (max === gf) h = (bf - rf) / delta + 2;
  else h = (rf - gf) / delta + 4;

  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
};

export const hslToRgb = ({ h, s, l }) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = (
    hp < 1 ? [c, x, 0]
      : hp < 2 ? [x, c, 0]
        : hp < 3 ? [0, c, x]
          : hp < 4 ? [0, x, c]
            : hp < 5 ? [x, 0, c]
              : [c, 0, x]
  );
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
};

export const toHex = (input) => {
  const rgb = parseColor(input);
  return rgb ? rgbToHex(rgb) : null;
};

/** "rgb(5, 150, 105)" — the form the editor shows when RGB is selected. */
export const toRgbString = (input) => {
  const rgb = parseColor(input);
  if (!rgb) return null;
  const parts = [rgb.r, rgb.g, rgb.b].map((c) => clamp(Math.round(c), 0, 255));
  return rgb.a < 1 ? `rgba(${parts.join(', ')}, ${round(rgb.a)})` : `rgb(${parts.join(', ')})`;
};

/** "hsl(160, 94%, 30%)" — same, for HSL. */
export const toHslString = (input) => {
  const rgb = parseColor(input);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);
  const parts = `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
  return rgb.a < 1 ? `hsla(${parts}, ${round(rgb.a)})` : `hsl(${parts})`;
};

export const formatColor = (input, notation) => {
  if (notation === 'rgb') return toRgbString(input);
  if (notation === 'hsl') return toHslString(input);
  return toHex(input);
};

/** A colour with an alpha channel, for tints laid over a surface. */
export const withAlpha = (input, a) => {
  const rgb = parseColor(input);
  if (!rgb) return null;
  const parts = [rgb.r, rgb.g, rgb.b].map((c) => clamp(Math.round(c), 0, 255));
  return `rgba(${parts.join(', ')}, ${round(clamp(a, 0, 1))})`;
};

/* ── Contrast ─────────────────────────────────────────────────────────────
   WCAG 2.1 relative luminance and contrast ratio. Used to warn before a
   palette ships text nobody can read. */

const channelLuminance = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const luminance = (input) => {
  const rgb = parseColor(input);
  if (!rgb) return 0;
  return 0.2126 * channelLuminance(rgb.r)
    + 0.7152 * channelLuminance(rgb.g)
    + 0.0722 * channelLuminance(rgb.b);
};

/**
 * Contrast ratio between two colours, 1 (identical) to 21 (black on white).
 *
 * A translucent foreground is composited onto the background first, because
 * that is what the eye actually sees — measuring the raw colour would report
 * a ratio no reader ever gets.
 */
export const contrastRatio = (foreground, background) => {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return 1;

  const flat = fg.a < 1
    ? rgbToHex({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
    })
    : foreground;

  const a = luminance(flat);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
};

/** AA needs 4.5:1 for body text, 3:1 for large text and UI boundaries. */
export const WCAG = { AA_TEXT: 4.5, AA_LARGE: 3, AAA_TEXT: 7 };

export const contrastGrade = (ratio, size = 'text') => {
  const floor = size === 'large' ? WCAG.AA_LARGE : WCAG.AA_TEXT;
  if (ratio >= WCAG.AAA_TEXT && size !== 'large') return 'AAA';
  if (ratio >= floor) return 'AA';
  return 'fail';
};

/** Whichever of the two reads better on the given background. */
export const readableOn = (background, options = ['#ffffff', '#111827']) => {
  let best = options[0];
  let bestRatio = 0;
  for (const option of options) {
    const ratio = contrastRatio(option, background);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = option;
    }
  }
  return best;
};

/* ── Ramps ────────────────────────────────────────────────────────────────
   A custom palette gives one colour per role. Everything a stylesheet needs
   — the faint tint behind a badge, the darker hover, the border on a
   selected row — is derived from it here, so the person editing the theme
   picks eleven colours rather than a hundred.

   The curve is lightness-first with saturation eased off at the pale end:
   holding saturation flat makes the 50 and 100 steps look radioactive, and
   dropping it linearly makes them look muddy. */

export const RAMP_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// Target lightness for each stop. The seed keeps its own lightness at the
// stop nearest to it, so a palette that is already mid-range is not shifted.
const RAMP_LIGHTNESS = {
  50: 0.97, 100: 0.94, 200: 0.86, 300: 0.75, 400: 0.63,
  500: 0.52, 600: 0.43, 700: 0.35, 800: 0.28, 900: 0.21, 950: 0.13,
};

const nearestStop = (lightness) => RAMP_STOPS.reduce(
  (best, stop) => (
    Math.abs(RAMP_LIGHTNESS[stop] - lightness) < Math.abs(RAMP_LIGHTNESS[best] - lightness)
      ? stop
      : best
  ),
  RAMP_STOPS[0],
);

/**
 * Build the full ramp for one seed colour.
 *
 * The seed is placed at whichever stop its own lightness is closest to and
 * reproduced there exactly, so a palette built from a brand colour still
 * contains that brand colour rather than an approximation of it.
 */
export const buildRamp = (seed) => {
  const rgb = parseColor(seed);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);
  const anchor = nearestStop(l);

  const ramp = {};
  for (const stop of RAMP_STOPS) {
    if (stop === anchor) {
      ramp[stop] = rgbToHex(rgb);
      continue;
    }
    const target = RAMP_LIGHTNESS[stop];
    // Pale steps lose saturation slowly, dark steps keep nearly all of it.
    const distance = Math.abs(target - l);
    const saturation = target > l
      ? clamp(s * (1 - distance * 0.45), 0, 1)
      : clamp(s * (1 + distance * 0.18), 0, 1);
    ramp[stop] = rgbToHex(hslToRgb({ h, s: saturation, l: target }));
  }
  return ramp;
};

/**
 * A neutral ramp, which needs its own treatment: greys carry a trace of the
 * brand hue in most design systems, and a pure grey next to a warm brand
 * reads as cold. The seed's hue is kept, its saturation capped low.
 */
export const buildNeutralRamp = (seed) => {
  const rgb = parseColor(seed);
  if (!rgb) return null;
  const { h, s } = rgbToHsl(rgb);
  const tint = clamp(s, 0, 0.14);

  const ramp = {};
  for (const stop of RAMP_STOPS) {
    const l = RAMP_LIGHTNESS[stop];
    // Mid greys can carry a little more tint than the near-white surfaces,
    // where any saturation at all shows up as a colour cast.
    const saturation = tint * (l > 0.9 ? 0.35 : l > 0.7 ? 0.6 : 1);
    ramp[stop] = rgbToHex(hslToRgb({ h, s: saturation, l }));
  }
  return ramp;
};

export const mix = (a, b, weight = 0.5) => {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const w = clamp(weight, 0, 1);
  return rgbToHex({
    r: ca.r * (1 - w) + cb.r * w,
    g: ca.g * (1 - w) + cb.g * w,
    b: ca.b * (1 - w) + cb.b * w,
  });
};

export const lighten = (input, amount) => mix(input, '#ffffff', amount);
export const darken = (input, amount) => mix(input, '#000000', amount);
