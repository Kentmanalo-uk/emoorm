import { activeScheme, t } from '../../theme';

/*
 * The Palengke page's own colours (web/src/pages/Palengke.css .plg): tokens,
 * swapped for their mirrored steps in dark mode so the band stays a deep
 * green there. Read on each render (they follow the mode).
 */
export const plgColors = () => {
  const dark = activeScheme() === 'dark';
  return {
    g1: t.primary[500],
    g2: dark ? t.primary[300] : t.primary[600],
    g3: dark ? t.primary[200] : t.primary[700],
    side: dark ? t.primary[50] : t.primary[900],
    b1: dark ? t.primary[500] : t.primary[400],
    b2: dark ? t.primary[300] : t.primary[600],
    go: dark ? t.primary[400] : t.primary[600],
    gold: '#F5B301',
  };
};

/** CSS color-mix(in srgb, a p%, b) for two #RRGGBB colours. */
export const colorMix = (a, p, b) => {
  const rgb = (h) => {
    const s = h.replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v * p + y[i] * (1 - p)).toString(16).padStart(2, '0')).join('')}`;
};
