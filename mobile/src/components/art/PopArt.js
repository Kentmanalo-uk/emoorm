import { memo, useId } from 'react';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop,
} from 'react-native-svg';

/**
 * The 3D look of the shortcut marks (shortcutArtStyle POP), as the website
 * draws them (web/src/components/art/PopArt.jsx; keep the two in step): each
 * mark drawn again as a small object -- a truck with its wheels and
 * windscreen, a box showing its lid and one side, a pot with its lid on --
 * seen from a little above and to one side, the side changing from object to
 * object.
 *
 * How they are lit, all the same way so a row reads as one set:
 *
 *   - light from the top left. Faces turned up are lightest, faces turned
 *     to the viewer carry the colour, faces turned away are the deepest.
 *   - colour runs across a face from a light value through the hue into its
 *     neighbour (orange into red, blue into indigo), as on a glossy toy.
 *   - a few materials besides the hue: dark rubber, pale glass, metal, gold,
 *     paper. White only for what is printed on a thing.
 *   - a gloss highlight where a curved face catches the light. No shadow on
 *     the page.
 *
 * The website also softens every face with an SVG filter (an inner glow on
 * its top-left edge, a shade on its bottom-right) and blurs the gloss.
 * react-native-svg has no filters, so here the faces are their gradients
 * alone and the gloss is a little fainter, so it does not read as a cut.
 *
 * FlatArt's marks hand over to these when the look is 'pop'; the names
 * here are the marks' names there. Everything is on FlatArt's 48 grid.
 * The sign-in and sign-up scenes are not here (AuthScenes.js); kit(),
 * rampOf() and mix() are exported for drawings like them.
 */

/* Each hue's ramp: hi (lit), mid (the colour), lo (its neighbour, where a
   face turns away), side (a face in shade). Keyed by FlatArt's deep value. */
const RAMPS = {
  '#F97316': ['#FFC27A', '#FF8A2A', '#F2522E', '#C93F1C'], // orange
  '#EC4899': ['#FFB5DD', '#F25AB5', '#C043D8', '#9A2BAE'], // pink
  '#EF4444': ['#FFA0A0', '#F43F4C', '#D8246A', '#A81B4A'], // red
  '#8B5CF6': ['#D8C8FF', '#9C6BFF', '#6A4BEE', '#4E34C2'], // violet
  '#0EA5E9': ['#A6E6FF', '#2DB3F0', '#2E79EA', '#2056BE'], // sky
  '#3B82F6': ['#A9CAFF', '#4D8CF9', '#5C58EE', '#3B37BF'], // blue
  '#10B981': ['#9BF0CC', '#22C78C', '#0EA3A0', '#0B7F7C'], // green
  '#059669': ['#8FEAC2', '#12B47E', '#0A8C86', '#076B68'], // emerald
  '#F43F5E': ['#FFB0BE', '#FB4D6F', '#DE2F82', '#B0206A'], // rose
  '#F59E0B': ['#FFE38A', '#FDB92B', '#F5871E', '#D2650F'], // amber
  '#0D9488': ['#8FF2E4', '#19C2B0', '#0E93A8', '#0B7189'], // teal
};

/** a mixed t of the way to b, both #RRGGBB. */
export const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
export const WHITE = '#FFFFFF';
export const BLACK = '#000000';
export const n2 = (v) => Number(v.toFixed(2));

/* The pink accent (the envelope's seal; the sign-in scenes use it too). */
export const PINK_FACE = [[0, '#FFC6E4'], [0.5, '#F55DB3'], [1, '#D4409E']];
export const PINK_SIDE = '#B02C82';

/* The gloss without the website's blur: a touch fainter. */
const GLOSS = 0.85;

/** A tone pair ([tint, deep], FlatArt's TONES) as the ramp a drawing paints with. */
export function rampOf([tint, deep]) {
  const known = RAMPS[deep.toUpperCase()];
  const [hi, mid, lo, side] = known || [mix(tint, WHITE, 0.2), deep, mix(deep, BLACK, 0.15), mix(deep, BLACK, 0.32)];
  // Sides lifted a little toward the colour itself: in shade, never near black.
  return {
    hi, mid, lo, side: mix(side, mid, 0.22),
  };
}

/**
 * What a drawing paints with: the hue's paints, the shared materials, and
 * helpers for solids. Gradients are registered as they are used and drawn
 * into <Defs> afterwards (k.defs()). `id` must be unique to the drawing:
 * every gradient id starts with it.
 */
export function kit(id, p) {
  const defs = [];
  let count = 0;
  const stopsOf = (stops) => stops.map(([o, c, a], i) => (
    <Stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />
  ));
  const lin = (stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) => {
    const gid = `${id}g${count += 1}`;
    defs.push(<LinearGradient key={gid} id={gid} x1={x1} y1={y1} x2={x2} y2={y2}>{stopsOf(stops)}</LinearGradient>);
    return `url(#${gid})`;
  };
  const rad = (stops, cx = 0.35, cy = 0.3, r = 0.8) => {
    const gid = `${id}g${count += 1}`;
    defs.push(<RadialGradient key={gid} id={gid} cx={cx} cy={cy} r={r} fx={cx} fy={cy}>{stopsOf(stops)}</RadialGradient>);
    return `url(#${gid})`;
  };

  // A side darkens only a little away from the light, and its far edge catches
  // a soft light from behind (rim), so no face reads as a dark slab.
  const sideFar = mix(p.side, BLACK, 0.1);
  const rim = mix(p.side, p.hi, 0.34);
  const k = {
    p,
    id,
    lin,
    rad,
    // The hue.
    body: lin([[0, p.hi], [0.5, p.mid], [1, p.lo]]),
    light: lin([[0, mix(p.hi, WHITE, 0.45)], [0.6, p.hi], [1, mix(p.hi, p.mid, 0.45)]]),
    top: lin([[0, mix(p.hi, WHITE, 0.55)], [1, p.hi]]),
    side: lin([[0, p.side], [0.62, sideFar], [1, rim]]),
    cyl: lin([[0, p.mid], [0.26, p.hi], [0.62, p.mid], [1, p.lo]], 0, 0, 1, 0),
    cone: lin([[0, p.hi], [0.5, p.mid], [1, p.lo]], 0, 0, 0, 1),
    ball: rad([[0, mix(p.hi, WHITE, 0.5)], [0.45, p.mid], [1, p.lo]]),
    // Materials.
    paper: lin([[0, WHITE], [1, mix(WHITE, p.hi, 0.4)]]),
    paperSide: mix(p.hi, '#B9C2D0', 0.45),
    dark: lin([[0, '#535B6C'], [1, '#1D2230']]),
    metal: lin([[0, WHITE], [0.5, '#DCE1E9'], [1, '#A9B2C0']]),
    glass: lin([[0, '#F5FCFF'], [1, '#9DCDF5']]),
    gold: lin([[0, '#FFF1A6'], [0.45, '#FFC83D'], [1, '#F39A1B']]),
    goldSide: '#D9770F',
    red: lin([[0, '#FF9AAB'], [0.5, '#F43F5E'], [1, '#D02A6E']]),
    redSide: '#A81D55',
    lens: rad([[0, '#64759A'], [0.55, '#262C3D'], [1, '#11141D']], 0.38, 0.32, 0.75),
    // Solid colours for an extruded side.
    near: p.side,
    far: mix(p.side, p.hi, 0.16),
    tintNear: mix(p.hi, p.mid, 0.5),
    tintFar: p.mid,
  };

  /** A shape's body: copies stepped back along (dx, dy), far ones darker. */
  k.ext = (shape, dx, dy, near = k.near, far = k.far, steps = 8) => Array.from({ length: steps }, (_, i) => {
    const t = (steps - i) / steps;
    return (
      <G key={`e${i}`} transform={`translate(${n2(dx * t)} ${n2(dy * t)})`}>
        {shape(mix(near, far, t))}
      </G>
    );
  });

  /** A solid: its body, then its face. */
  k.solid = (shape, {
    dx = 1.8, dy = 2.2, face = k.body, near = k.near, far = k.far, steps = 8,
  } = {}) => (
    <>
      {k.ext(shape, dx, dy, near, far, steps)}
      {shape(face)}
    </>
  );

  /**
   * A box seen from above and to one side: its front, its top (dy < 0) and
   * the side towards dx, each a different value.
   */
  k.cube = ({
    x, y, w, h, dx, dy, front = k.body, top = k.top, side = k.side, r = 1.4,
  }) => {
    const sx = dx > 0 ? x + w : x;
    const tp = `M${x} ${y}L${x + w} ${y}L${x + w + dx} ${y + dy}L${x + dx} ${y + dy}Z`;
    const sp = `M${sx} ${y}L${sx + dx} ${y + dy}L${sx + dx} ${y + h + dy}L${sx} ${y + h}Z`;
    return (
      <>
        <Path d={sp} fill={side} stroke={side} strokeWidth={r} strokeLinejoin="round" />
        <Path d={tp} fill={top} stroke={top} strokeWidth={r} strokeLinejoin="round" />
        <Rect x={x} y={y} width={w} height={h} rx={r} fill={front} />
        <Path d={`M${x + r} ${y + 0.5}H${x + w - r}`} stroke={WHITE} strokeOpacity="0.7" strokeWidth="0.8" strokeLinecap="round" />
      </>
    );
  };

  /** Print on a face: white, pressed in a little. */
  k.print = (shape, shade = p.side) => (
    <>
      <G transform="translate(0.45 0.7)" opacity="0.45">{shape(shade)}</G>
      {shape(WHITE)}
    </>
  );

  /** A highlight where a curved face catches the light. */
  k.gloss = (d, o = 0.6) => <Path d={d} fill={WHITE} opacity={n2(o * GLOSS)} />;

  k.defs = () => defs;
  return k;
}

/* ── The drawings ────────────────────────────────────────────────────── */

const D = {};

/** Today's Menu: a pot with its lid on, steam rising, a fork and spoon on it. */
D.Pot = (k) => (
  <>
    <G fill="none" stroke={k.p.hi} strokeWidth="2.6" strokeLinecap="round">
      <Path d="M16.5 8.5c0-2.6 2.6-3 2.6-5.6" />
      <Path d="M29.5 8.5c0-2.6 2.6-3 2.6-5.6" />
    </G>
    <G>
      <Rect x="2.5" y="24" width="8" height="5.6" rx="2.8" fill={k.side} />
      <Rect x="37.5" y="24" width="8" height="5.6" rx="2.8" fill={k.side} />
    </G>
    <Path d="M7 22v12.5c0 4.1 7.6 7.5 17 7.5s17-3.4 17-7.5V22z" fill={k.cyl} />
    <Ellipse cx="24" cy="22" rx="17" ry="5.4" fill={k.top} />
    <Path d="M9 21.5C9 14.6 15.7 11 24 11s15 3.6 15 10.5c0 2.6-6.7 4.4-15 4.4S9 24.1 9 21.5z" fill={k.body} />
    <Ellipse cx="24" cy="11.4" rx="3.8" ry="2.6" fill={k.side} />
    {k.gloss('M12.5 19.2c1.2-3.2 4.8-5 9-5.4.9 0 1 .9.2 1.2-3.6 1-6.2 2.6-7.6 4.9-.5.8-1.9.3-1.6-.7z', 0.75)}
    {k.gloss('M9.5 27.5c.6 0 1 .4 1 1v6c0 .9-1.6.9-1.8 0-.3-2-.3-4.4 0-6.2.1-.5.4-.8.8-.8z', 0.55)}
    {k.print((c) => (
      <G fill={c}>
        <Rect x="18" y="28.5" width="2.4" height="9.5" rx="1.2" />
        <Rect x="15.7" y="28.5" width="1.8" height="5" rx="0.9" />
        <Rect x="20.9" y="28.5" width="1.8" height="5" rx="0.9" />
        <Path d="M27.2 28.5h2.6a2.4 2.4 0 0 1 2.4 2.4v2.4a2.4 2.4 0 0 1-2.4 2.4h-.2v2.6a1.2 1.2 0 0 1-2.4 0z" />
      </G>
    ))}
  </>
);

/** New Arrivals: a big puffy sparkle and two small ones. */
D.Spark = (k) => {
  const s = (cx, cy, r) => {
    const c = r * 0.16;
    return `M${cx} ${cy - r}Q${cx + c} ${cy - c} ${cx + r} ${cy}Q${cx + c} ${cy + c} ${cx} ${cy + r}`
      + `Q${cx - c} ${cy + c} ${cx - r} ${cy}Q${cx - c} ${cy - c} ${cx} ${cy - r}Z`;
  };
  return (
    <>
      {k.solid((f) => <Path d={s(38, 10.5, 7)} fill={f} />, {
        dx: 1.1, dy: 1.3, face: k.light, near: k.tintNear, far: k.tintFar,
      })}
      {k.solid((f) => <Path d={s(38.5, 37, 6)} fill={f} />, {
        dx: 1, dy: 1.2, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25),
      })}
      <G transform="rotate(8 20 23)">
        {k.solid((f) => <Path d={s(20, 23, 17)} fill={f} />, { dx: 2.2, dy: 2.6 })}
        {k.gloss('M18.6 12c.8 0 1.2.8 1 1.6l-1.1 6.2c-.2 1-1.7 1-1.8 0l-.1-5.8c0-1.1.9-2 2-2z', 0.8)}
      </G>
    </>
  );
};

/** Best Sellers: bars rising on a stand, a gold arrow climbing over them. */
D.Trend = (k) => (
  <>
    {k.cube({
      x: 4, y: 37, w: 32, h: 5, dx: 6, dy: -5, front: k.light, top: k.top, side: k.body,
    })}
    {k.cube({
      x: 8, y: 26, w: 7, h: 11.5, dx: 3.4, dy: -3,
    })}
    {k.cube({
      x: 18, y: 21, w: 7, h: 16.5, dx: 3.4, dy: -3,
    })}
    {k.cube({
      x: 28, y: 15.5, w: 7, h: 22, dx: 3.4, dy: -3,
    })}
    {k.ext((f) => (
      <G fill={f} stroke={f}>
        <Path d="M5 21.5l9-7 7.5 4.5 13-10" fill="none" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M31 6.5l9.5-3-1.8 9.8z" strokeWidth="1.6" strokeLinejoin="round" />
      </G>
    ), 0.9, 1.4, k.goldSide, mix(k.goldSide, BLACK, 0.25), 5)}
    <G>
      <Path d="M5 21.5l9-7 7.5 4.5 13-10" fill="none" stroke={k.gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M31 6.5l9.5-3-1.8 9.8z" fill={k.gold} stroke={k.gold} strokeWidth="1.6" strokeLinejoin="round" />
    </G>
  </>
);

/** Budget Finds: a round piggy bank, a gold coin going in. */
D.Piggy = (k) => (
  <>
    <G fill={k.side}>
      <Rect x="10" y="33" width="6" height="10" rx="3" />
      <Rect x="27" y="33" width="6" height="10" rx="3" />
    </G>
    <Path d="M6.5 25.5c-3 .2-3.6-3-1.2-3.6" fill="none" stroke={k.p.side} strokeWidth="1.8" strokeLinecap="round" />
    <Path d="M9.5 18.5 12 8.8c.3-1.2 1.8-1.5 2.6-.6l5.6 6.6z" fill={k.body} />
    <Ellipse cx="22" cy="27" rx="16.5" ry="13" fill={k.ball} />
    <G>
      <Rect x="15" y="34.5" width="6.4" height="9.5" rx="3.2" fill={k.body} />
      <Rect x="30" y="34" width="6.4" height="9.5" rx="3.2" fill={k.body} />
    </G>
    <Ellipse cx="38.2" cy="28.5" rx="4.6" ry="5.6" fill={k.side} />
    <Ellipse cx="39.6" cy="28.3" rx="3.7" ry="4.8" fill={k.light} />
    <G fill={k.p.side}>
      <Ellipse cx="38.6" cy="27.6" rx="0.9" ry="1.3" />
      <Ellipse cx="41" cy="27.6" rx="0.9" ry="1.3" />
    </G>
    <Ellipse cx="30" cy="22.2" rx="1.5" ry="1.9" fill="#2A2238" />
    <Rect x="16" y="15.6" width="11" height="2.6" rx="1.3" fill={k.p.side} />
    {k.solid((f) => <Ellipse cx="21.5" cy="9.6" rx="4.4" ry="6" fill={f} />, {
      dx: 2, dy: 0, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 5,
    })}
    <Ellipse cx="21.5" cy="9.6" rx="2.4" ry="3.6" fill="none" stroke="#FFF6CF" strokeWidth="1" />
    {k.gloss('M11 22.5c2-4.4 6.2-6.6 10-6.8 1 0 1.2 1.1.3 1.4-3.6 1.1-6.4 3.2-8.1 6.2-.6 1-2.6.4-2.2-.8z', 0.75)}
  </>
);

/** All Products: four puffy tiles, one lifted out of the grid. */
D.Grid = (k) => {
  const tile = (x, y, face, light) => k.solid((f) => <Rect x={x} y={y} width="17" height="17" rx="5" fill={f} />, {
    dx: 1.6,
    dy: 2.2,
    face,
    near: light ? k.tintNear : k.near,
    far: light ? k.tintFar : k.far,
  });
  return (
    <>
      {tile(4, 25, k.light, true)}
      {tile(25, 25, k.body, false)}
      {tile(4, 4, k.body, false)}
      <G transform="translate(-1 -2)">
        {k.solid((f) => <Rect x="26" y="5" width="17" height="17" rx="5" fill={f} />, {
          dx: 2.4, dy: 3.6, face: k.light, near: k.tintNear, far: k.tintFar,
        })}
      </G>
      {k.gloss('M8 7.5h6c1 0 1 1.4 0 1.5-2.4.3-4 1.4-5 3.4-.5 1-1.9.7-1.9-.4V9.4c0-1 .8-1.9 1.9-1.9z', 0.7)}
      {k.gloss('M29 27.5h6c1 0 1 1.4 0 1.5-2.4.3-4 1.4-5 3.4-.5 1-1.9.7-1.9-.4v-2.6c0-1 .8-1.9 1.9-1.9z', 0.7)}
    </>
  );
};

/** Municipals: two buildings on a corner, windows lit. */
D.Town = (k) => {
  const win = (x, y, w = 3.8, h = 4) => <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1" fill={k.glass} />;
  return (
    <>
      {k.cube({
        x: 4, y: 12, w: 15, h: 31, dx: 5, dy: -5, front: k.light, side: k.body,
      })}
      {[16.5, 23, 29.5].flatMap((y) => [win(7, y), win(12.6, y)])}
      {k.cube({
        x: 19, y: 22, w: 18, h: 21, dx: 6, dy: -5,
      })}
      {[26.5, 32.5].flatMap((y) => [win(22, y, 3.4, 3.6), win(27.3, y, 3.4, 3.6), win(32.6, y, 3.4, 3.6)])}
      <Rect x="25.6" y="37.5" width="5.4" height="5.5" rx="1" fill={k.glass} />
    </>
  );
};

/** Store Map: a folded map with a red pin standing on it. */
D.Map = (k) => (
  <>
    {k.ext((f) => <Path d="M3 15l14-5 14 5 14-5v29l-14 5-14-5-14 5z" fill={f} stroke={f} strokeWidth="1.2" strokeLinejoin="round" />, 0, 2.2)}
    <G strokeWidth="1.2" strokeLinejoin="round">
      <Path d="M3 15l14-5v29L3 44z" fill={k.light} stroke={k.light} />
      <Path d="M17 10l14 5v29l-14-5z" fill={k.body} stroke={k.body} />
      <Path d="M31 15l14-5v29l-14 5z" fill={k.light} stroke={k.light} />
    </G>
    <G fill="none" stroke={WHITE} strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round">
      <Path d="M5 30l10-4" />
      <Path d="M33 24l10-4.5" />
      <Path d="M34 36l9-3.2" />
    </G>
    <Ellipse cx="24" cy="33.5" rx="4.6" ry="1.6" fill="#1D1430" opacity="0.28" />
    {k.ext((f) => <Path d="M24 5.5a8.2 8.2 0 0 1 8.2 8.2c0 6-8.2 19.5-8.2 19.5S15.8 19.7 15.8 13.7A8.2 8.2 0 0 1 24 5.5z" fill={f} />, 1.4, 0.6, k.redSide, mix(k.redSide, BLACK, 0.25), 5)}
    <Path d="M24 5.5a8.2 8.2 0 0 1 8.2 8.2c0 6-8.2 19.5-8.2 19.5S15.8 19.7 15.8 13.7A8.2 8.2 0 0 1 24 5.5z" fill={k.red} />
    <Circle cx="24" cy="13.6" r="3.2" fill={k.redSide} />
    <Circle cx="24.4" cy="14.1" r="2.8" fill={WHITE} />
    {k.gloss('M19.6 10.6c.8-1.6 2.2-2.6 3.6-2.9.8-.1 1 .9.3 1.2-1 .5-1.8 1.3-2.4 2.3-.5.7-1.8.3-1.5-.6z', 0.8)}
  </>
);

/** Photo Search: a camera turned a little, its lens standing out. */
D.Camera = (k) => (
  <>
    {k.cube({
      x: 4, y: 17, w: 34, h: 25, dx: 5, dy: -4, r: 2.4,
    })}
    {k.cube({
      x: 10, y: 10.5, w: 12, h: 6, dx: 5, dy: -4, front: k.light, side: k.body, r: 1.6,
    })}
    <Ellipse cx="34.5" cy="14.4" rx="2.6" ry="1.2" fill={k.red} />
    <Rect x="30" y="21" width="5" height="3.4" rx="1" fill={k.glass} />
    {k.ext((f) => <Circle cx="21" cy="30" r="10" fill={f} />, 1.6, -1.4, '#9AA3B2', '#6B7383', 5)}
    <Circle cx="21" cy="30" r="10" fill={k.metal} />
    <Circle cx="21" cy="30" r="7" fill={k.lens} />
    <Circle cx="21" cy="30" r="3.4" fill="none" stroke="#7F90B8" strokeOpacity="0.5" strokeWidth="1" />
    <Ellipse cx="18.4" cy="27.4" rx="2" ry="1.4" fill={WHITE} opacity="0.85" transform="rotate(-35 18.4 27.4)" />
    <Circle cx="24" cy="33" r="0.9" fill={WHITE} opacity="0.6" />
  </>
);

/** Following: a little shop with a striped awning. */
D.Shop = (k) => {
  const w = 37 / 5;
  return (
    <>
      {k.cube({
        x: 5, y: 19, w: 32, h: 24, dx: 6, dy: -4, front: k.paper, top: k.paper, side: k.paperSide,
      })}
      <Path d="M3 11L40 11L46 6.5L9 6.5Z" fill={k.top} stroke={k.top} strokeWidth="1.2" strokeLinejoin="round" />
      <Path d="M40 11l6-4.5v7.5l-6 6z" fill={k.side} />
      <G>
        {[0, 1, 2, 3, 4].map((i) => (
          <Path
            key={i}
            d={`M${n2(3 + i * w)} 11h${n2(w)}v6.5a${n2(w / 2)} ${n2(w / 2)} 0 0 1-${n2(w)} 0z`}
            fill={i % 2 ? k.paper : k.body}
          />
        ))}
      </G>
      <Rect x="11" y="27" width="10" height="16" rx="1.6" fill={k.glass} />
      <Circle cx="19" cy="35.5" r="0.9" fill={k.p.side} />
      <Rect x="25" y="27" width="9" height="8" rx="1.6" fill={k.glass} />
      <Path d="M26.2 33.5l5-5" stroke={WHITE} strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round" />
    </>
  );
};

/** Wishlist: a puffy heart, leaning. */
D.Heart = (k) => (
  <G transform="rotate(-9 24 25)">
    {k.solid((f) => (
      <Path d="M24 43S3.5 30.5 3.5 17.6A11 11 0 0 1 24 11a11 11 0 0 1 20.5 6.6C44.5 30.5 24 43 24 43z" fill={f} />
    ), { dx: 2.4, dy: 2.4, face: k.ball })}
    {k.gloss('M9.6 13.6c2.4-2.2 5.6-2.5 8-1.4.9.4.6 1.7-.4 1.7-2.6 0-4.8 1.1-6.3 3.2-1.2 1.6-3.5-1.3-1.3-3.5z', 0.85)}
    <Ellipse cx="11" cy="21" rx="1.3" ry="1.8" fill={WHITE} opacity="0.7" />
  </G>
);

/** My Orders: a closed carton, lid and one side showing, taped. */
D.Parcel = (k) => (
  <>
    {k.cube({
      x: 4, y: 19, w: 28, h: 24, dx: 10, dy: -8, r: 1.8,
    })}
    <Path d="M9 15l28 0" stroke={k.p.mid} strokeOpacity="0.5" strokeWidth="0.8" />
    <Path d="M15 19h6l10-8h-6z" fill={WHITE} opacity="0.92" />
    <Rect x="15" y="19" width="6" height="8.5" fill={WHITE} opacity="0.92" />
    <Rect x="23.5" y="33" width="6" height="5" rx="1" fill={WHITE} opacity="0.85" />
    <Path d="M24.8 35h3.4M24.8 36.6h2.2" stroke={k.p.mid} strokeWidth="0.7" strokeLinecap="round" />
  </>
);

/** My Offers: a price tag on its string, a tick on it. */
D.Tag = (k) => {
  const tag = 'M25 3.5h15.5A4 4 0 0 1 44.5 7.5V23a5 5 0 0 1-1.5 3.6L26.6 43a5 5 0 0 1-7.1 0L5 28.5a5 5 0 0 1 0-7.1L21.4 5a5 5 0 0 1 3.6-1.5z';
  return (
    <G transform="rotate(-6 24 24) translate(0 1)">
      {k.solid((f) => <Path d={tag} fill={f} transform="matrix(.92 0 0 .92 1 1)" />, { dx: 2, dy: 2.6 })}
      <Circle cx="34.5" cy="12.6" r="4.2" fill={k.p.side} />
      <Circle cx="35" cy="13.2" r="3.6" fill={WHITE} />
      <Path d="M35 13c3-5 6.5-8 10-9.5" fill="none" stroke={k.p.hi} strokeWidth="1.6" strokeLinecap="round" />
      {k.print((c) => <Path d="M14.5 25.5l5 5 9-9" fill="none" stroke={c} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />)}
      {k.gloss('M24.2 6.4h6.6c1 0 1 1.4 0 1.5-3.3.4-6.6 1.6-9.6 4-1 .8-2.3-.4-1.4-1.4l2.8-3c.5-.7 1-1.1 1.6-1.1z', 0.7)}
    </G>
  );
};

/** Returns: a carton turned the other way, an arrow coming back on it. */
D.Return = (k) => (
  <>
    {k.cube({
      x: 14, y: 19, w: 29, h: 24, dx: -9, dy: -7, r: 1.8,
    })}
    <Path d="M25 19h6l-9-7h-6z" fill={WHITE} opacity="0.92" />
    {k.ext((f) => (
      <G fill={f} stroke={f}>
        <Path d="M25 27.5h6.5a5 5 0 0 1 0 10H26" fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M26.2 23v9l-7.4-4.5z" strokeWidth="1.2" strokeLinejoin="round" />
      </G>
    ), 0.6, 0.9, k.p.side, mix(k.p.side, BLACK, 0.2), 4)}
    <G>
      <Path d="M25 27.5h6.5a5 5 0 0 1 0 10H26" fill="none" stroke={WHITE} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M26.2 23v9l-7.4-4.5z" fill={WHITE} stroke={WHITE} strokeWidth="1.2" strokeLinejoin="round" />
    </G>
  </>
);

/** My Reviews: a puffy star, a little one behind it. */
D.Star = (k) => {
  const star = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const rr = i % 2 ? r * 0.48 : r;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${n2(cx + rr * Math.cos(a))},${n2(cy + rr * Math.sin(a))}`);
    }
    return pts.join(' ');
  };
  const shape = (cx, cy, r) => (f) => <Polygon points={star(cx, cy, r)} fill={f} stroke={f} strokeWidth="3.4" strokeLinejoin="round" />;
  return (
    <>
      {k.solid(shape(38, 11, 6.5), {
        dx: 1.1, dy: 1.4, face: k.light, near: k.tintNear, far: k.tintFar, steps: 5,
      })}
      <G transform="rotate(10 21 25)">
        {k.solid(shape(21, 25, 17), { dx: 2.2, dy: 2.8 })}
        {k.gloss('M19.2 12.4c.6-1.2 2.2-1.2 2.6.1l1.4 4.1c.3 1-1 1.6-1.6.8l-2.4-3.4c-.3-.5-.3-1.1 0-1.6z', 0.85)}
      </G>
    </>
  );
};

/** Addresses: a round pin standing on its spot. */
D.Pin = (k) => (
  <>
    {k.ext((f) => <Ellipse cx="24" cy="40.5" rx="12" ry="4" fill={f} />, 0, 1.8, k.tintNear, k.tintFar, 4)}
    <Ellipse cx="24" cy="40.5" rx="12" ry="4" fill={k.light} />
    <Ellipse cx="24" cy="40.5" rx="5.6" ry="1.8" fill="#1D1430" opacity="0.28" />
    <G transform="rotate(6 24 40)">
      <Path d="M24 3a14 14 0 0 1 14 14c0 10.5-14 23.5-14 23.5S10 27.5 10 17A14 14 0 0 1 24 3z" fill={k.ball} />
      <Circle cx="24" cy="16.6" r="5.8" fill={k.p.side} />
      <Circle cx="24.5" cy="17.2" r="5.1" fill={WHITE} />
      {k.gloss('M14.8 12.2c1.5-3.4 4.6-5.4 7.8-5.8.9-.1 1.2 1.1.3 1.4-2.6 1-4.7 2.8-6 5.4-.5.9-2.4.2-2.1-1z', 0.85)}
    </G>
  </>
);

/** Get the App: a phone held at an angle, a code on its screen. */
D.Qr = (k) => (
  <G transform="rotate(-11 24 24)">
    {k.solid((f) => <Rect x="11" y="3" width="26" height="42" rx="6" fill={f} />, { dx: -2.6, dy: 1.8 })}
    <Rect x="13.6" y="7.5" width="20.8" height="33" rx="3.2" fill={k.paper} />
    <Rect x="20.5" y="4.6" width="7" height="1.6" rx="0.8" fill={k.p.side} />
    <G fill={k.p.mid}>
      {[[16, 11], [25.5, 11], [16, 20.5]].map(([x, y]) => (
        <G key={`${x}-${y}`}>
          <Rect x={x} y={y} width="6.5" height="6.5" rx="1.8" />
          <Rect x={x + 2} y={y + 2} width="2.5" height="2.5" rx="0.6" fill={WHITE} />
        </G>
      ))}
      <Rect x="25.5" y="20.5" width="2.8" height="2.8" rx="0.7" />
      <Rect x="29.2" y="24.2" width="2.8" height="2.8" rx="0.7" />
      <Rect x="25.5" y="24.2" width="2.8" height="2.8" rx="0.7" fill={k.p.lo} />
    </G>
    <Rect x="16" y="31" width="16" height="3" rx="1.5" fill={k.p.hi} />
    <Rect x="19" y="36" width="10" height="2.4" rx="1.2" fill={k.p.hi} opacity="0.7" />
    {k.gloss('M12.6 9c0-2.6 1.4-4.2 3.8-4.6.8-.1 1 1 .3 1.3-1.5.7-2.3 1.9-2.4 3.6V22c0 1-1.7 1-1.7 0z', 0.7)}
  </G>
);

/** Help Centre: a lifebuoy lying tilted, its stripes in the hue. */
D.Buoy = (k) => {
  const ring = 'M24 6a20 17 0 1 0 .01 0zM24 15.5a8.6 7.2 0 1 1-.01 0z';
  const wedge = (a) => {
    const r = (deg) => (deg * Math.PI) / 180;
    const p1 = [24 + 30 * Math.cos(r(a - 22)), 23 + 30 * Math.sin(r(a - 22))];
    const p2 = [24 + 30 * Math.cos(r(a + 22)), 23 + 30 * Math.sin(r(a + 22))];
    return `M24 23L${n2(p1[0])} ${n2(p1[1])}L${n2(p2[0])} ${n2(p2[1])}Z`;
  };
  const clip = `${k.id}c`;
  return (
    <G transform="rotate(-12 24 24)">
      <Defs><ClipPath id={clip}><Path d={ring} fillRule="evenodd" /></ClipPath></Defs>
      {k.ext((f) => <Path d={ring} fillRule="evenodd" fill={f} />, 0, 3.6, '#C5CEDB', '#97A3B5', 7)}
      <G>
        <Path d={ring} fillRule="evenodd" fill={k.paper} />
        <G clipPath={`url(#${clip})`}>
          {[45, 135, 225, 315].map((a) => <Path key={a} d={wedge(a)} fill={k.body} />)}
        </G>
      </G>
      {k.gloss('M9.2 15.6c2.6-4.4 7.6-7 12.8-7.4 1 0 1.1 1.3.2 1.5-4.6 1-8.6 3.4-11 7-.6.9-2.5.2-2-1.1z', 0.75)}
    </G>
  );
};

/** Customer Care: a headset, the near cup bigger, the mic swung down. */
D.Headset = (k) => (
  <>
    <Path d="M9.5 25v-4a15 15 0 0 1 30 0v3" fill="none" stroke={k.body} strokeWidth="5" strokeLinecap="round" />
    <Path d="M12 16.6a13 13 0 0 1 8-6" fill="none" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
    <Rect x="33" y="19" width="10" height="16.5" rx="5" fill={k.side} />
    <Rect x="30.4" y="21" width="4.4" height="12.5" rx="2.2" fill={k.dark} />
    <Path d="M9 38c0 5 3.6 6.5 9 6.5" fill="none" stroke={k.p.side} strokeWidth="2.4" strokeLinecap="round" />
    <Rect x="17" y="41.6" width="8" height="5" rx="2.5" fill={k.dark} />
    <Rect x="11.6" y="20" width="5" height="17" rx="2.5" fill={k.dark} />
    <Rect x="2.5" y="17.5" width="12" height="21" rx="6" fill={k.body} />
    {k.gloss('M5.6 22c0-1.6 1-2.8 2.6-3.1.8-.1 1.1.9.4 1.3-.8.4-1.2 1.1-1.2 2v7c0 1-1.8 1-1.8 0z', 0.75)}
  </>
);

/** Feedback: two speech bubbles, the front one with dots in it. */
D.Bubble = (k) => (
  <>
    <G transform="rotate(6 32 30)">
      {k.solid((f) => <Path d="M20 16h21a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-1v6l-7-6H20a5 5 0 0 1-5-5V21a5 5 0 0 1 5-5z" fill={f} />, {
        dx: 1.6, dy: 2, face: k.light, near: k.tintNear, far: k.tintFar,
      })}
    </G>
    <G transform="rotate(-5 18 18)">
      {k.solid((f) => <Path d="M7 4h22a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H17l-8 7v-7H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={f} />, { dx: 2, dy: 2.4 })}
      {k.print((c) => (
        <G fill={c}>
          <Circle cx="11" cy="15" r="2.6" />
          <Circle cx="18" cy="15" r="2.6" />
          <Circle cx="25" cy="15" r="2.6" />
        </G>
      ))}
      {k.gloss('M6.2 6.6h7c1 0 1 1.4 0 1.5-2.4.3-4 1.2-5 2.8-.5.9-2 .6-2-.5v-2c0-1 .8-1.8 1.8-1.8z', 0.7)}
    </G>
  </>
);

/** Start Selling: a megaphone, its bell opening towards you. */
D.Megaphone = (k) => (
  <>
    <G fill="none" stroke={k.p.hi} strokeWidth="2.4" strokeLinecap="round">
      <Path d="M44 17a10 10 0 0 1 0 14" />
    </G>
    <Rect x="14" y="29" width="5.4" height="12" rx="2.7" fill={k.side} transform="rotate(14 16.7 29)" />
    <Rect x="5" y="17" width="10" height="14" rx="4.6" fill={k.light} />
    <Path d="M13 18.5L36 8v32L13 29.5z" fill={k.cone} stroke={k.cone} strokeWidth="1.4" strokeLinejoin="round" />
    <Path d="M15 19.4l19-8.6" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round" />
    <Ellipse cx="36.5" cy="24" rx="5.6" ry="16.4" fill={k.top} />
    <Ellipse cx="37.4" cy="24.4" rx="3.8" ry="13.6" fill={k.lin([[0, k.p.side], [1, mix(k.p.side, BLACK, 0.45)]], 0, 0, 1, 0)} />
    {k.print((c) => <Rect x="20" y="21.5" width="8" height="3" rx="1.5" fill={c} transform="rotate(-5 24 23)" />)}
  </>
);

/** Go live: a video camera turned a little, lens forward, the on-air light. */
D.Live = (k) => (
  <>
    <Path d="M33 20l11-6.5v22L33 29z" fill={k.side} stroke={k.side} strokeWidth="1.4" strokeLinejoin="round" />
    {k.cube({
      x: 3, y: 16, w: 28, h: 22, dx: 5, dy: -5, r: 2.4,
    })}
    {k.ext((f) => <Circle cx="17" cy="27" r="7.6" fill={f} />, 1.2, -1.2, '#9AA3B2', '#6B7383', 4)}
    <Circle cx="17" cy="27" r="7.6" fill={k.metal} />
    <Circle cx="17" cy="27" r="5.2" fill={k.lens} />
    <Ellipse cx="15.2" cy="25.2" rx="1.5" ry="1" fill={WHITE} opacity="0.85" transform="rotate(-35 15.2 25.2)" />
    <Circle cx="27.5" cy="20.5" r="2.4" fill={WHITE} />
    <Circle cx="27.5" cy="20.5" r="1.4" fill="#FF3355" />
  </>
);

/** My products: cartons of stock, two on the floor, one on top. */
D.Package = (k) => {
  const tape = (x, y, w) => <Rect x={x + w / 2 - 2} y={y} width="4" height="5.5" fill={WHITE} opacity="0.9" />;
  return (
    <>
      {k.cube({
        x: 3, y: 28, w: 18, h: 15, dx: 5, dy: -4,
      })}
      {tape(3, 28, 18)}
      {k.cube({
        x: 21, y: 28, w: 18, h: 15, dx: 5, dy: -4,
      })}
      {tape(21, 28, 18)}
      {k.cube({
        x: 13, y: 11, w: 18, h: 15, dx: 5, dy: -4, front: k.light, side: k.body,
      })}
      {tape(13, 11, 18)}
      <Path d="M20 11h4l5-4h-4z" fill={WHITE} opacity="0.9" />
    </>
  );
};

/** My orders: a receipt curling a little, a coin by it. */
D.Receipt = (k) => {
  const paper = 'M9 4h28a3 3 0 0 1 3 3v35l-5-3-5 3-5-3-5 3-5-3-5 3V7a3 3 0 0 1 3-3z';
  return (
    <>
      <G transform="rotate(-7 24 24)">
        {k.solid((f) => <Path d={paper} fill={f} />, {
          dx: 1.8, dy: 2, face: k.paper, near: k.paperSide, far: mix(k.paperSide, BLACK, 0.2),
        })}
        <Path d="M9 4h28a3 3 0 0 1 3 3v6H6V7a3 3 0 0 1 3-3z" fill={k.body} />
        <G fill={k.p.hi}>
          <Rect x="10" y="18" width="22" height="2.8" rx="1.4" />
          <Rect x="10" y="24" width="16" height="2.8" rx="1.4" />
        </G>
        <Rect x="10" y="30" width="12" height="3.2" rx="1.6" fill={k.p.mid} />
      </G>
      {k.solid((f) => <Circle cx="37.5" cy="37" r="7" fill={f} />, {
        dx: 1.2, dy: 1.6, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 5,
      })}
      <Circle cx="37.5" cy="37" r="4.4" fill="none" stroke="#FFF6CF" strokeWidth="1.1" />
      <Path d="M36 34.5v5M36 34.5h2a1.6 1.6 0 0 1 0 3.2h-2" fill="none" stroke="#C26A0A" strokeWidth="1.1" strokeLinecap="round" />
    </>
  );
};

/** Performance: a pie lying on its side, a gold slice lifted out. */
D.Chart = (k) => {
  const main = 'M21 26L39 26A18 13 0 1 1 21 13Z';
  const slice = 'M25 22L25 9A18 13 0 0 1 43 22Z';
  return (
    <>
      {k.solid((f) => <Path d={slice} fill={f} />, {
        dx: 0, dy: 5, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 7,
      })}
      {k.solid((f) => <Path d={main} fill={f} />, { dx: 0, dy: 6, steps: 9 })}
      <Path d="M21 26L21 13" stroke={WHITE} strokeOpacity="0.5" strokeWidth="0.8" />
      {k.gloss('M7 21c2-4 6.2-6.6 11-7.4.9-.1 1.2 1.2.3 1.5-4 1.2-7.2 3.4-9 6.6-.5.9-2.6.4-2.3-.7z', 0.75)}
    </>
  );
};

/** Finance: a wallet, a note sticking out, the clasp in gold. */
D.Wallet = (k) => (
  <>
    <G transform="rotate(-9 22 12)">
      {k.solid((f) => <Rect x="10" y="4" width="25" height="15" rx="2.4" fill={f} />, {
        dx: 0.8, dy: 1, face: k.light, near: k.tintNear, far: k.tintFar, steps: 4,
      })}
      <Ellipse cx="22.5" cy="9.5" rx="4" ry="3" fill={WHITE} opacity="0.85" />
    </G>
    {k.solid((f) => <Rect x="3" y="14" width="39" height="29" rx="7" fill={f} />, { dx: 2.4, dy: 2 })}
    <Rect x="6" y="17" width="33" height="23" rx="5" fill="none" stroke={WHITE} strokeOpacity="0.55" strokeWidth="0.9" strokeDasharray="2 1.6" />
    <Path d="M29 22h16v14H29a7 7 0 0 1 0-14z" fill={k.light} />
    {k.solid((f) => <Circle cx="31" cy="29" r="3" fill={f} />, {
      dx: 0.6, dy: 0.8, face: k.gold, near: k.goldSide, far: k.goldSide, steps: 3,
    })}
    {k.gloss('M6.5 19c0-2 1.2-3.4 3.2-3.8.8-.1 1.1 1 .4 1.3-1 .5-1.7 1.3-1.8 2.6v6c0 1-1.8 1-1.8 0z', 0.7)}
  </>
);

/** Add product: a round button, a plus standing up on it. */
D.Plus = (k) => (
  <>
    {k.solid((f) => <Ellipse cx="24" cy="21" rx="20" ry="16.5" fill={f} />, {
      dx: 0, dy: 6, face: k.ball, steps: 9,
    })}
    {k.ext((f) => (
      <G fill={f}>
        <Rect x="12" y="17.8" width="24" height="6.4" rx="3.2" />
        <Rect x="20.8" y="9" width="6.4" height="24" rx="3.2" />
      </G>
    ), 0, 1.8, k.tintNear, k.tintFar, 4)}
    <G fill={WHITE}>
      <Rect x="12" y="17.8" width="24" height="6.4" rx="3.2" />
      <Rect x="20.8" y="9" width="6.4" height="24" rx="3.2" />
    </G>
    {k.gloss('M8 15c2.4-4.4 7.4-7.6 13.6-8 1 0 1.2 1.3.2 1.5-5 1-9 3.4-11.6 7-.7.9-2.7.5-2.2-.5z', 0.75)}
  </>
);

/** Decorate my shop: a paintbrush, its bristles dipped in the hue. */
D.Brush = (k) => (
  <>
    <Ellipse cx="11" cy="42" rx="7" ry="2.6" fill={k.p.mid} opacity="0.9" />
    <Ellipse cx="9.4" cy="41.4" rx="2.6" ry="0.9" fill={WHITE} opacity="0.5" />
    <G transform="rotate(-45 24 24)">
      <Rect x="22" y="20.5" width="23" height="7" rx="3.5" fill={k.lin([[0, k.p.hi], [0.45, k.p.mid], [1, k.p.side]], 0, 0, 0, 1)} />
      <Circle cx="41" cy="24" r="1.2" fill={WHITE} />
      <Rect x="14.5" y="19.3" width="8.5" height="9.4" rx="1.6" fill={k.lin([[0, WHITE], [0.45, '#D9DEE6'], [1, '#98A2B3']], 0, 0, 0, 1)} />
      <Path d="M15 19.5c-6.4 0-10.4 1.8-12.2 4.5 1.8 2.7 5.8 4.5 12.2 4.5z" fill={k.lin([[0, '#FFF4E2'], [0.5, '#F2C994'], [1, '#C98B52']], 0, 0, 0, 1)} />
      <Path d="M8.5 20.4c-3 .6-4.9 1.9-5.7 3.6.8 1.7 2.7 3 5.7 3.6z" fill={k.body} />
      <Path d="M24 21.6h18" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" />
    </G>
  </>
);

/** Settings: a cog lying tilted, its hub raised. */
D.Gear = (k) => {
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const a = i * 45;
    [[-17, 15.5], [-9.5, 21], [9.5, 21], [17, 15.5]].forEach(([da, r]) => {
      const t = ((a + da) * Math.PI) / 180;
      pts.push(`${n2(24 + r * Math.cos(t))},${n2(24 + r * Math.sin(t))}`);
    });
  }
  const gear = (f) => <Polygon points={pts.join(' ')} fill={f} stroke={f} strokeWidth="2.4" strokeLinejoin="round" />;
  return (
    <G transform="translate(0 -2) rotate(-8 24 24) translate(24 24) scale(1 .84) translate(-24 -24)">
      {k.solid(gear, { dx: 0, dy: 6, steps: 9 })}
      <Circle cx="24" cy="24" r="12.5" fill="none" stroke={WHITE} strokeOpacity="0.35" strokeWidth="1" />
      <Circle cx="24" cy="25.6" r="7" fill={k.p.side} />
      <Circle cx="24" cy="24" r="7" fill={k.light} />
      <Circle cx="24" cy="24" r="2.6" fill={k.p.mid} />
      {k.gloss('M10.5 16c2.2-3.6 5.8-6 10-6.8.9-.1 1.2 1.1.3 1.4-3.6 1.2-6.4 3.2-8.4 6.2-.6.9-2.4.3-1.9-.8z', 0.75)}
    </G>
  );
};

/** Verify identity: an ID card tipped forward, photo and lines on it. */
D.IdCard = (k) => (
  <G transform="rotate(-8 24 24)">
    {k.solid((f) => <Rect x="3" y="9" width="40" height="30" rx="5" fill={f} />, {
      dx: 1.6, dy: 2.4, face: k.paper, near: k.paperSide, far: mix(k.paperSide, BLACK, 0.2),
    })}
    <Path d="M8 9h30a5 5 0 0 1 5 5v2H3v-2a5 5 0 0 1 5-5z" fill={k.body} />
    <Rect x="7.5" y="20" width="12" height="14" rx="3" fill={k.light} />
    <Circle cx="13.5" cy="25" r="3" fill={WHITE} />
    <Path d="M8.5 33c.6-2.8 2.6-4.2 5-4.2s4.4 1.4 5 4.2z" fill={WHITE} />
    <G fill={k.p.hi}>
      <Rect x="23.5" y="21.5" width="15" height="3" rx="1.5" />
      <Rect x="23.5" y="27.5" width="10" height="3" rx="1.5" />
    </G>
    <Rect x="33" y="31.5" width="6" height="4.4" rx="1" fill={k.gold} />
  </G>
);

/** Chat: a bubble with a reply behind it, lines of text in the front one. */
D.Chat = (k) => (
  <>
    <G transform="rotate(-6 30 28)">
      {k.solid((f) => <Path d="M20 14h21a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-8l-7 6v-6h-6a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5z" fill={f} />, {
        dx: -1.6, dy: 2, face: k.light, near: k.tintNear, far: k.tintFar,
      })}
    </G>
    <G transform="rotate(5 17 17)">
      {k.solid((f) => <Path d="M7 4h20a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-8l-7 6v-6H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={f} />, { dx: -2, dy: 2.4 })}
      {k.print((c) => (
        <G fill={c}>
          <Rect x="8" y="9.5" width="17" height="3" rx="1.5" />
          <Rect x="8" y="15.5" width="10" height="3" rx="1.5" />
        </G>
      ))}
    </G>
  </>
);

/** Questions: a round bubble, a question mark standing out of it. */
D.Question = (k) => (
  <>
    {k.solid((f) => <Path d="M23 4a18.5 18 0 1 1-9.4 33.6L5 41l2.8-8.2A18.5 18 0 0 1 23 4z" fill={f} />, { dx: 2.2, dy: 2.6, face: k.ball })}
    {k.ext((f) => (
      <G fill={f} stroke={f}>
        <Path d="M17.6 17a5.6 5.6 0 1 1 7.8 5.2c-1.4.6-2.4 1.6-2.4 3.4v.8" fill="none" strokeWidth="4.2" strokeLinecap="round" />
        <Circle cx="23" cy="32.6" r="2.7" stroke="none" />
      </G>
    ), 0.8, 1.2, k.tintNear, k.tintFar, 4)}
    <Path d="M17.6 17a5.6 5.6 0 1 1 7.8 5.2c-1.4.6-2.4 1.6-2.4 3.4v.8" fill="none" stroke={WHITE} strokeWidth="4.2" strokeLinecap="round" />
    <Circle cx="23" cy="32.6" r="2.7" fill={WHITE} />
    {k.gloss('M8.6 15c2-4.6 6-7.6 10.6-8.4.9-.1 1.2 1.1.3 1.4-3.8 1.2-6.8 3.6-8.6 7.2-.5 1-2.6.5-2.3-.2z', 0.75)}
  </>
);

/** Delivery: a truck seen from the front corner, cab on the right. */
D.Truck = (k) => (
  <>
    {k.cube({
      x: 2, y: 11, w: 27, h: 22, dx: 6, dy: -5, r: 2,
    })}
    {k.cube({
      x: 29, y: 18, w: 11, h: 15, dx: 6, dy: -5, front: k.light, side: k.body, r: 2,
    })}
    <Path d="M41 21l4-3.4v6.4l-4 3.6z" fill={k.glass} stroke={k.glass} strokeWidth="0.8" strokeLinejoin="round" />
    <Rect x="31" y="20.5" width="6.4" height="5.4" rx="1.4" fill={k.glass} />
    <Ellipse cx="44.2" cy="29.4" rx="0.9" ry="1.4" fill="#FFE27A" />
    {k.print((c) => (
      <G fill={c}>
        <Rect x="6" y="18" width="16" height="3.2" rx="1.6" />
        <Rect x="6" y="23.5" width="10" height="3.2" rx="1.6" />
      </G>
    ))}
    {[10.5, 34].map((x) => (
      <G key={x}>
        <Circle cx={x} cy="34.5" r="5.6" fill={k.dark} />
        <Circle cx={x} cy="34.5" r="2.5" fill={k.metal} />
      </G>
    ))}
  </>
);

/** Notifications: a gold-lit bell swinging, its clapper showing. */
D.Bell = (k) => (
  <>
    <G fill="none" stroke={k.p.hi} strokeWidth="2.2" strokeLinecap="round">
      <Path d="M41.5 11.5a10 10 0 0 1 3 7" />
      <Path d="M6.5 11.5a10 10 0 0 0-3 7" />
    </G>
    <G transform="rotate(12 24 22)">
      <Circle cx="24" cy="39.6" r="3.8" fill={k.side} />
      <Path d="M24 6c-8 0-12.5 6.5-12.5 14v7c0 3-2 5-5 7.5h35c-3-2.5-5-4.5-5-7.5v-7c0-7.5-4.5-14-12.5-14z" fill={k.cyl} />
      <Ellipse cx="24" cy="34.5" rx="17.5" ry="3.4" fill={k.side} />
      <Ellipse cx="24" cy="34" rx="16.4" ry="2.4" fill={k.top} />
      <Ellipse cx="24" cy="6" rx="3.2" ry="2.6" fill={k.side} />
      {k.gloss('M15.2 15c.8-3 2.8-5.2 5.4-6.2.8-.3 1.4.8.7 1.3-1.8 1.4-3 3.4-3.4 5.6-.1 1-1.6 1-1.7 0V15z', 0.8)}
      {k.gloss('M14.6 20.4c.6 0 1 .4 1 1v6.4c0 .9-1.6.9-1.8 0-.3-2.1-.3-4.4 0-6.6.1-.5.4-.8.8-.8z', 0.55)}
    </G>
  </>
);

/** Invite friends: a gift box, lid on, tied with a gold ribbon and bow. */
D.Gift = (k) => {
  const gold = { fill: k.gold, stroke: k.gold, strokeWidth: 0.8, strokeLinejoin: 'round' };
  return (
    <>
      {k.cube({
        x: 6, y: 25, w: 28, h: 18, dx: 8, dy: -6, r: 1.8,
      })}
      {k.cube({
        x: 4, y: 18, w: 32, h: 8, dx: 8, dy: -6, front: k.light, side: k.body, r: 1.8,
      })}
      <Rect x="17" y="26" width="6" height="17" fill={k.gold} />
      <Rect x="16.5" y="18" width="7" height="8" fill={k.gold} />
      <Path d="M16.5 18h7l8-6h-7z" {...gold} />
      <G>
        <Ellipse cx="18.6" cy="10.6" rx="5.6" ry="3.6" transform="rotate(-22 18.6 10.6)" fill={k.gold} />
        <Ellipse cx="29.4" cy="9.4" rx="5.6" ry="3.6" transform="rotate(18 29.4 9.4)" fill={k.gold} />
      </G>
      <Ellipse cx="18.8" cy="10.6" rx="2.4" ry="1.3" transform="rotate(-22 18.8 10.6)" fill={k.goldSide} opacity="0.7" />
      <Ellipse cx="29.2" cy="9.4" rx="2.4" ry="1.3" transform="rotate(18 29.2 9.4)" fill={k.goldSide} opacity="0.7" />
      <Circle cx="24" cy="12.6" r="2.8" fill={k.gold} />
      {k.gloss('M9 29.5c0-1.6 1-2.6 2.4-2.8.8-.1 1 .9.4 1.2-.6.3-1 .9-1 1.6v6c0 .9-1.8.9-1.8 0z', 0.6)}
    </>
  );
};

/** My Reports: a flag waving from a metal pole with a gold knob. */
D.Flag = (k) => {
  const flag = 'M11.6 9c6-3 11.4-2 15.8 0s9.8 3 15.6 0v18c-5.8 3-11.2 2-15.6 0s-9.8-3-15.8 0z';
  return (
    <>
      <Ellipse cx="9.4" cy="44" rx="6" ry="1.8" fill={k.paperSide} />
      <G>
        <Rect x="7" y="5" width="4.8" height="39" rx="2.4" fill={k.lin([[0, '#F2F4F7'], [0.45, '#C3CAD5'], [1, '#848E9C']], 0, 0, 1, 0)} />
      </G>
      <Circle cx="9.4" cy="5" r="3.1" fill={k.gold} />
      {k.solid((f) => <Path d={flag} fill={f} />, { dx: 1.6, dy: 2.4 })}
      {k.print((c) => (
        <G fill={c}>
          <Rect x="25.4" y="11.5" width="3.8" height="9" rx="1.9" />
          <Circle cx="27.3" cy="24.4" r="2.1" />
        </G>
      ))}
      {k.gloss('M14 11.6c3.4-1.4 6.6-1.4 9.4-.4.9.3.6 1.5-.3 1.4-2.8-.3-5.6.1-8.2 1.2-1 .4-1.9-1.8-.9-2.2z', 0.75)}
    </>
  );
};

/** Language: a shiny globe, a gold speech bubble with a letter in it. */
D.Globe = (k) => {
  const clip = `${k.id}gc`;
  return (
    <>
      <Defs><ClipPath id={clip}><Circle cx="21" cy="21" r="18" /></ClipPath></Defs>
      <Circle cx="21" cy="21" r="18" fill={k.ball} />
      <G clipPath={`url(#${clip})`} fill="none" stroke={WHITE} strokeOpacity="0.6" strokeWidth="1.6">
        <Ellipse cx="21" cy="21" rx="7.5" ry="18" />
        <Path d="M3 21h36M4 12.5h34M4 29.5h34" />
      </G>
      {k.gloss('M8.4 13.4c2.2-4.4 6.4-7.2 11-7.8.9-.1 1.2 1.1.3 1.4-3.8 1.2-7 3.6-8.8 7-.5 1-2.9.4-2.5-.6z', 0.8)}
      {k.solid((f) => <Path d="M32 26h11a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-4l-4 3.5V40h-3a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" fill={f} />, {
        dx: 1, dy: 1.4, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 4,
      })}
      <Path d="M34.6 37l3-7.6 3 7.6M35.6 34.6h4" fill="none" stroke={WHITE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
};

/* ── The admins' tools ── */

/** Buyers, users, a team: two round little people, the nearer one deeper. */
D.People = (k) => (
  <>
    <G>
      <Path d="M20 40c.6-8.4 5.2-13 11-13s10.4 4.6 11 13a2.6 2.6 0 0 1-2.6 2.6H22.6A2.6 2.6 0 0 1 20 40z" fill={k.light} />
    </G>
    <Circle cx="31" cy="15" r="6.2" fill={k.light} />
    {k.gloss('M27.6 12.2c.8-1.6 2.2-2.4 3.6-2.6.8-.1 1 .9.3 1.2-1 .4-1.7 1.1-2.1 2-.4.8-2.1.3-1.8-.6z', 0.8)}
    <G>
      <Path d="M5 41.4c.7-9.6 6.2-15 13-15s12.3 5.4 13 15A2.8 2.8 0 0 1 28.2 44H7.8A2.8 2.8 0 0 1 5 41.4z" fill={k.body} />
    </G>
    <Circle cx="18" cy="17.4" r="7.2" fill={k.ball} />
    {k.gloss('M13.4 14.6c1-2 2.8-3 4.6-3.2.9-.1 1.1 1 .3 1.3-1.2.5-2.2 1.4-2.7 2.6-.4.9-2.6.3-2.2-.7z', 0.85)}
  </>
);

/** Email: an envelope tipped toward you, a pink seal on its flap. */
D.Envelope = (k) => {
  const pink = k.lin(PINK_FACE);
  return (
    <G transform="rotate(-7 24 25)">
      {k.solid((f) => <Rect x="3" y="10" width="42" height="29" rx="6" fill={f} />, { dx: 1.8, dy: 2.6 })}
      <Path d="M5 37.2L19 24.6M43 37.2L29 24.6" stroke={k.p.side} strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
      <Path d="M4.2 12.6A5 5 0 0 1 9 10h30a5 5 0 0 1 4.8 2.6L24 28z" fill={k.light} />
      <Circle cx="24" cy="25.6" r="3.8" fill={pink} />
      <Path d="M22.4 25.4l1.2 1.2 2.2-2.4" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      {k.gloss('M7.6 14.6c2.6-.4 5.2.6 7.2 2.4.7.6 0 1.6-.8 1.2-2-.9-4-1.3-6-1.1-1 .1-1.4-2.3-.4-2.5z', 0.6)}
    </G>
  );
};

/** Audit log: a round clock standing a little turned. */
D.Clock = (k) => (
  <>
    {k.solid((f) => <Circle cx="23" cy="23" r="19" fill={f} />, { dx: 2.4, dy: 2.4, face: k.ball })}
    <Circle cx="23" cy="23" r="13.6" fill={k.paper} />
    {[0, 90, 180, 270].map((a) => (
      <Rect key={a} x="22.2" y="11" width="1.6" height="3" rx="0.8" fill={k.p.hi} transform={`rotate(${a} 23 23)`} />
    ))}
    <Path d="M23 14.6V23l5.6 3.8" stroke={k.p.mid} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Circle cx="23" cy="23" r="2.2" fill={k.p.side} />
    {k.gloss('M8.6 15.6c1.8-4.2 5.4-7.2 9.6-8.2.9-.2 1.3 1 .4 1.4-3.8 1.4-6.6 4-8.2 7.6-.5.9-2.2.2-1.8-.8z', 0.8)}
  </>
);

/** Town admins: a glossy shield with a person on it. */
D.Shield = (k) => (
  <>
    {k.solid((f) => <Path d="M24 3l17 6v13c0 11-7.4 19.4-17 23C14.4 41.4 7 33 7 22V9z" fill={f} />, { dx: 1.8, dy: 2.4 })}
    <Path d="M24 3v42C14.4 41.4 7 33 7 22V9z" fill="#fff" opacity="0.14" />
    {k.print((c) => (
      <G fill={c}>
        <Circle cx="24" cy="19" r="5" />
        <Path d="M15.5 33c1-5.2 4.4-8 8.5-8s7.5 2.8 8.5 8a1.2 1.2 0 0 1-1.2 1.4H16.7a1.2 1.2 0 0 1-1.2-1.4z" />
      </G>
    ))}
    {k.gloss('M10 11.4l6.6-2.4c.9-.3 1.4 1 .6 1.5-2.4 1.2-4.4 2.8-5.8 4.8-.6.8-2.4.3-2.2-.7z', 0.75)}
  </>
);

/** Banners: a picture in a white frame, gold sun, green hills. */
D.Picture = (k) => (
  <G transform="rotate(-6 24 24)">
    {k.solid((f) => <Rect x="3" y="7" width="42" height="34" rx="6" fill={f} />, {
      dx: 1.8, dy: 2.4, face: k.paper, near: k.paperSide, far: mix(k.paperSide, BLACK, 0.2),
    })}
    <Rect x="7.5" y="11.5" width="33" height="25" rx="3.4" fill={k.lin([[0, '#FDE7F2'], [1, '#FBCFE8']], 0, 0, 0, 1)} />
    <Circle cx="31.5" cy="19" r="3.8" fill={k.gold} />
    <Path d="M7.5 32l9.5-9.5 7.5 7.5 4-4L40.5 37v-1.5H11A3.5 3.5 0 0 1 7.5 32z" fill={k.lin([[0, '#6EE7B7'], [1, '#059669']], 0, 0, 0, 1)} />
    <Path d="M7.5 33l9.5-9.5 7.5 7.5 4-4 12 11.5v1a3.4 3.4 0 0 1-3.4 3H10.9a3.4 3.4 0 0 1-3.4-3.4z" fill={k.lin([[0, '#34D399'], [1, '#047857']], 0, 0, 0, 1)} />
    {k.gloss('M5.6 12.4c0-2 1.2-3.4 3.2-3.8.8-.1 1.1 1 .4 1.3-1 .5-1.7 1.3-1.8 2.6v18c0 1-1.8 1-1.8 0z', 0.6)}
  </G>
);

/* ── More of Home's shortcuts ── */

/** Palengke: a woven market basket, greens, an eggplant and a tomato in it. */
D.Basket = (k) => {
  const clip = `${k.id}bk`;
  const mouth = 'M5.5 25a18.5 5 0 0 0 37 0';
  const body = `${mouth}l-3.4 14.4a4 4 0 0 1-3.9 3.1H12.8a4 4 0 0 1-3.9-3.1z`;
  const leaf = k.lin([[0, '#EEFFB8'], [0.5, '#8FD63E'], [1, '#3F9A2E']]);
  const eggplant = k.lin([[0, '#E2B8FA'], [0.45, '#9446D6'], [1, '#55208F']]);
  const tomato = k.rad([[0, '#FFC0B2'], [0.45, '#F4473F'], [1, '#B8162F']]);
  return (
    <>
      <Path d="M9.6 25C9.6 11.5 16 6 24 6s14.4 5.5 14.4 19" fill="none" stroke={k.body} strokeWidth="3" strokeLinecap="round" />
      <Ellipse cx="24" cy="25" rx="18.5" ry="5" fill={k.lin([[0, mix(k.p.side, BLACK, 0.3)], [1, k.p.side]], 0, 0, 0, 1)} />
      <G>
        <Path d="M17.5 25C10.6 22.6 8.4 15 11.4 8.8c5 2.6 8 9 6.1 16.2z" fill={leaf} />
        <Path d="M20.6 25.4c-3.6-5.6-3.4-13 1.4-17.6 4.2 4.8 4.4 12.4.6 17.6z" fill={leaf} />
      </G>
      <Path d="M17 24c-2.6-4-3.6-8.4-3.2-12.6M21.6 24.6c-.6-4.6-.2-9.6 1.2-13.6" fill="none" stroke="#2F7A26" strokeOpacity="0.5" strokeWidth="0.9" strokeLinecap="round" />
      <G transform="rotate(38 27 19)">
        <Ellipse cx="27" cy="19" rx="4.2" ry="8.4" fill={eggplant} />
        <Path d="M24.4 11.6c1-1.4 4.2-1.4 5.2 0l-1 2.2h-3.2z" fill="#4E9B2E" />
        <Rect x="26.2" y="8.4" width="1.6" height="3.4" rx="0.8" fill="#3F7F24" />
        <Ellipse cx="25.4" cy="17" rx="1" ry="3" fill={WHITE} opacity={n2(0.55 * GLOSS)} />
      </G>
      <Circle cx="33.6" cy="21" r="5.6" fill={tomato} />
      <Path d="M33.6 15.8l1.4 1.6 1.8-.6-.6 1.4-2.6.2-2.6-.2-.6-1.4 1.8.6z" fill="#3F9A2E" />
      <Ellipse cx="31.6" cy="19.2" rx="1.6" ry="1.1" fill={WHITE} opacity={n2(0.75 * GLOSS)} />
      <Defs><ClipPath id={clip}><Path d={body} /></ClipPath></Defs>
      <Path d={body} fill={k.cyl} />
      <G clipPath={`url(#${clip})`} fill="none" strokeLinecap="round">
        {[31, 35.4, 39.8].map((y) => (
          <Path key={y} d={`M4 ${y}a20 4.2 0 0 0 40 0`} stroke={k.p.side} strokeOpacity="0.55" strokeWidth="1.1" />
        ))}
        {[9, 14, 19, 24, 29, 34, 39].map((x) => (
          <Path key={x} d={`M${x} 27.5L${n2(x + (x - 24) * 0.12)} 43`} stroke={WHITE} strokeOpacity="0.22" strokeWidth="1.2" />
        ))}
      </G>
      <Path d={mouth} fill="none" stroke={k.top} strokeWidth="2.8" strokeLinecap="round" />
      {k.gloss('M9.4 31c.5 0 .9.3 1 .8l1.2 6.4c.2.9-1.2 1.3-1.6.5-.9-1.9-1.4-4.1-1.5-6.6 0-.7.4-1.1.9-1.1z', 0.6)}
    </>
  );
};

/** Pre-order: a desk calendar tipped back, a tick on the day, a gold clock. */
D.Calendar = (k) => (
  <>
    <G transform="rotate(-7 24 25)">
      {k.solid((f) => <Rect x="4" y="8" width="37" height="34" rx="5.5" fill={f} />, {
        dx: 1.8, dy: 2.6, face: k.paper, near: k.paperSide, far: mix(k.paperSide, BLACK, 0.2),
      })}
      <Path d="M9.5 8h26a5.5 5.5 0 0 1 5.5 5.5V19H4v-5.5A5.5 5.5 0 0 1 9.5 8z" fill={k.body} />
      <Path d="M8.5 9.4h28" stroke={WHITE} strokeOpacity="0.6" strokeWidth="0.9" strokeLinecap="round" />
      {[13.5, 31.5].map((x) => (
        <G key={x}>
          <Circle cx={x} cy="12.4" r="1.9" fill={k.p.side} />
          <Rect x={x - 1.5} y="3.6" width="3" height="9.6" rx="1.5" fill={k.metal} />
        </G>
      ))}
      <G fill={k.p.hi} opacity="0.75">
        {[23, 29, 35].flatMap((y) => [8.5, 14.5, 20.5, 26.5, 32.5].map((x) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width="3.4" height="3" rx="1" />
        )))}
      </G>
      {k.ext((f) => <Path d="M12.5 29.5l5.4 5.4 11-11" fill="none" stroke={f} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />, 0.7, 1, k.p.side, mix(k.p.side, BLACK, 0.2), 4)}
      <Path d="M12.5 29.5l5.4 5.4 11-11" fill="none" stroke={k.p.mid} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </G>
    {k.solid((f) => <Circle cx="37.5" cy="36.5" r="8" fill={f} />, {
      dx: 1.2, dy: 1.6, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 5,
    })}
    <Circle cx="37.5" cy="36.5" r="5.6" fill={k.paper} />
    <Path d="M37.5 33v3.5l2.6 1.8" fill="none" stroke="#C26A0A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    {k.gloss('M31.6 33.6c.8-1.8 2.4-3 4.2-3.4.8-.2 1.1.9.4 1.3-1.3.6-2.3 1.5-2.9 2.7-.4.8-2 .3-1.7-.6z', 0.8)}
  </>
);

/** Ready to Eat: a bowl of rice, an egg on top, chopsticks across it. */
D.Bowl = (k) => {
  const wood = k.lin([[0, '#FBE3BA'], [0.5, '#DDA468'], [1, '#A96B35']], 0, 0, 0, 1);
  const rim = 'M5 24a19 5.2 0 0 0 38 0';
  return (
    <>
      <G fill="none" stroke={k.p.hi} strokeWidth="2.4" strokeLinecap="round">
        <Path d="M30 9.5c0-2.6 2.6-3 2.6-5.6" />
        <Path d="M36.5 11c0-2.6 2.6-3 2.6-5.6" />
      </G>
      <Ellipse cx="24" cy="24" rx="19" ry="5.2" fill={k.lin([[0, mix(k.p.side, BLACK, 0.25)], [1, k.p.side]], 0, 0, 0, 1)} />
      <Path d="M7.6 24.4c0-7 7.4-11.4 16.4-11.4s16.4 4.4 16.4 11.4c0 2.4-7.4 4-16.4 4s-16.4-1.6-16.4-4z" fill={k.paper} />
      <G fill="#DCE2EA">
        {[[30, 17.5], [34.5, 21], [27.5, 22.5], [12.5, 23.5], [36, 25], [23, 25.5]].map(([x, y]) => (
          <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.4" ry="0.7" transform={`rotate(-20 ${x} ${y})`} />
        ))}
      </G>
      <Path d="M11.6 18.6c1.6-3.4 6-4.8 9.6-3.6 3.4.9 5.6 3.4 5 6.2-.7 2.8-4.6 4-8.4 3.6-4-.3-7.6-3-6.2-6.2z" fill={k.lin([[0, WHITE], [1, '#E9EDF3']])} />
      <Circle cx="18.4" cy="19.8" r="3.4" fill={k.gold} />
      <Ellipse cx="17.4" cy="18.6" rx="1.2" ry="0.8" fill={WHITE} opacity="0.85" />
      <Path d="M15.6 38.2h16.8l-1.2 4.2a2.2 2.2 0 0 1-2.1 1.6H18.9a2.2 2.2 0 0 1-2.1-1.6z" fill={k.side} />
      <Path d={`${rim}c0 9.6-8.4 16.6-19 16.6S5 33.6 5 24z`} fill={k.cyl} />
      <Path d={rim} fill="none" stroke={k.top} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M8.6 31.4a17 4.6 0 0 0 30.8 0" fill="none" stroke={WHITE} strokeOpacity="0.75" strokeWidth="1.5" strokeDasharray="0.1 3.2" strokeLinecap="round" />
      {k.gloss('M8.4 27.6c.6-.1 1.1.3 1.2.9.5 2.6 1.6 4.8 3.3 6.6.6.7-.3 1.7-1.1 1.1-2-1.6-3.3-4.2-3.9-7.4-.1-.6.2-1.1.5-1.2z', 0.6)}
      <G strokeLinecap="round">
        <Path d="M24 21.5L45 9" stroke={wood} strokeWidth="2.4" />
        <Path d="M27 23.4L46.4 13" stroke={wood} strokeWidth="2.4" />
      </G>
    </>
  );
};

/* The sale sticker's points, round its edge. */
const SALE_PTS = Array.from({ length: 32 }, (_, i) => {
  const r = i % 2 ? 17 : 20.4;
  const a = (Math.PI / 16) * i - Math.PI / 2;
  return `${n2(24 + r * Math.cos(a))},${n2(24 + r * Math.sin(a))}`;
}).join(' ');

/** On Sale: a puffy sale sticker, tipped, a per cent sign on it. */
D.Sale = (k) => (
  <G transform="rotate(-10 24 24) translate(-0.8 -1)">
    {k.solid((f) => <Polygon points={SALE_PTS} fill={f} stroke={f} strokeWidth="2.6" strokeLinejoin="round" />, { dx: 2, dy: 2.6, face: k.ball })}
    <Circle cx="24" cy="24" r="13.2" fill="none" stroke={WHITE} strokeOpacity="0.6" strokeWidth="1.1" strokeDasharray="1.6 1.8" />
    {k.print((c) => (
      <G fill={c} stroke={c}>
        <Circle cx="18.4" cy="18.4" r="3.1" stroke="none" />
        <Circle cx="29.6" cy="29.6" r="3.1" stroke="none" />
        <Path d="M30.2 17.2L17.8 30.8" strokeWidth="3.2" strokeLinecap="round" />
      </G>
    ), k.p.lo)}
    {k.gloss('M10.2 15.4c2-4 5.6-6.8 9.8-7.8.9-.2 1.3 1 .4 1.4-3.6 1.4-6.4 3.8-8.2 7.2-.5.9-2.4.2-2-.8z', 0.8)}
  </G>
);

/** Seafood: a round glossy fish swimming up, bubbles rising. */
D.Fish = (k) => {
  const body = 'M9.5 26c4.8-7.6 11.8-11.5 19-11.5 7.6 0 13.2 4.6 16.5 11.5-3.3 6.9-8.9 11.5-16.5 11.5-7.2 0-14.2-3.9-19-11.5z';
  return (
    <>
      <G fill={k.glass}>
        <Circle cx="41.5" cy="8.4" r="2.6" />
        <Circle cx="36" cy="4.4" r="1.7" />
      </G>
      <G transform="rotate(-10 26 26)">
        {k.solid((f) => <Path d="M14 26L4.4 15.4c-1-1.1-2.8-.4-2.7 1.1L2.6 26l-.9 9.5c-.1 1.5 1.7 2.2 2.7 1.1z" fill={f} />, {
          dx: 1.2, dy: 1.6, face: k.light, near: k.tintNear, far: k.tintFar, steps: 5,
        })}
        <Path d="M19 17.6c1.6-5.4 6.6-8.8 12.8-8.6-.6 3.4-1.8 6-3.8 8.2z" fill={k.side} />
        <Path d="M22.6 35l-2.8 6.6c3.4.4 6.4-.4 8.8-2.8z" fill={k.side} />
        {k.solid((f) => <Path d={body} fill={f} />, { dx: 1.6, dy: 2.2, face: k.ball })}
        <Path d="M14.5 29.6c4.4 4 9.4 5.8 14.4 5.8 5.2 0 9.4-2 12.8-6-3.6 2-7.6 2.8-12.8 2.8-5 0-9.8-.8-14.4-2.6z" fill={WHITE} opacity="0.35" />
        <Path d="M30.6 19.4c2 4 2 9.2 0 13.2" fill="none" stroke={k.p.lo} strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
        <G fill="none" stroke={WHITE} strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round">
          <Path d="M19 22.6a3 3 0 0 1 0 4.4M23.6 21.4a3 3 0 0 1 0 4.4M21.4 26.8a3 3 0 0 1 0 4.4M26 25.8a3 3 0 0 1 0 4.4" />
        </G>
        <Circle cx="37" cy="23.6" r="3.4" fill={WHITE} />
        <Circle cx="37.7" cy="23.8" r="1.9" fill="#1D2230" />
        <Circle cx="37.1" cy="23" r="0.7" fill={WHITE} />
        {k.gloss('M15.6 21.4c3-3.2 7-5 11.4-5.4.9-.1 1.1 1.2.2 1.4-4 .8-7.4 2.6-10 5.2-.7.7-2.3-.4-1.6-1.2z', 0.8)}
      </G>
    </>
  );
};

/** Livestock: a friendly round cow's head, cream horns, a pink muzzle. */
D.Livestock = (k) => {
  const horn = k.lin([[0, '#FFFDF4'], [1, '#E3CF9E']]);
  const muzzle = k.lin([[0, '#FFE6EA'], [0.55, '#FFB8C6'], [1, '#F08CA4']]);
  const head = 'M24 8c8.8 0 13.5 5.6 13.5 12.6 0 4.4-1.2 7.4-3 10.4H13.5c-1.8-3-3-6-3-10.4C10.5 13.6 15.2 8 24 8z';
  return (
    <G transform="rotate(-5 24 26)">
      <G fill={horn}>
        <Path d="M15.4 12.6C10.6 12 8 8.4 8.4 3.6c2.8 2.4 5.8 3.4 9.6 3.2z" />
        <Path d="M32.6 12.6c4.8-.6 7.4-4.2 7-9-2.8 2.4-5.8 3.4-9.6 3.2z" />
      </G>
      <G transform="rotate(-18 7.6 20)">
        <Ellipse cx="7.6" cy="20" rx="6.4" ry="3.6" fill={k.body} />
        <Ellipse cx="8.4" cy="20.2" rx="3.8" ry="1.7" fill={muzzle} />
      </G>
      <G transform="rotate(18 40.4 20)">
        <Ellipse cx="40.4" cy="20" rx="6.4" ry="3.6" fill={k.side} />
        <Ellipse cx="39.6" cy="20.2" rx="3.8" ry="1.7" fill={muzzle} opacity="0.85" />
      </G>
      {k.solid((f) => <Path d={head} fill={f} />, { dx: 1.6, dy: 2, face: k.ball })}
      <Path d="M24 8c3 0 5.4.7 7.2 1.9-1.6 2.6-4 4.4-7.2 4.4s-5.6-1.8-7.2-4.4C18.6 8.7 21 8 24 8z" fill={WHITE} opacity="0.9" />
      <G fill="#2A2238">
        <Ellipse cx="18.2" cy="21" rx="1.9" ry="2.3" />
        <Ellipse cx="29.8" cy="21" rx="1.9" ry="2.3" />
      </G>
      <G fill={WHITE}>
        <Circle cx="17.6" cy="20.2" r="0.7" />
        <Circle cx="29.2" cy="20.2" r="0.7" />
      </G>
      {k.solid((f) => <Ellipse cx="24" cy="33.5" rx="12.5" ry="8.6" fill={f} />, {
        dx: 1, dy: 1.6, face: muzzle, near: '#D9758E', far: '#C4627C', steps: 5,
      })}
      <G fill="#B4566E">
        <Ellipse cx="19.4" cy="33" rx="1.9" ry="2.5" transform="rotate(-12 19.4 33)" />
        <Ellipse cx="28.6" cy="33" rx="1.9" ry="2.5" transform="rotate(12 28.6 33)" />
      </G>
      <Path d="M20.6 38.4c2.2 1.2 4.6 1.2 6.8 0" fill="none" stroke="#B4566E" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" />
      {k.gloss('M13.4 15.6c1.4-3 3.8-5 6.4-5.8.9-.3 1.4.9.6 1.4-2 1.2-3.6 2.8-4.6 5-.4.9-2.8.4-2.4-.6z', 0.75)}
      {k.gloss('M14.8 28.8c1.4-1.4 3.4-2.2 5.6-2.4.9 0 1 1.2.2 1.4-1.6.4-3 1.2-4.2 2.2-.7.6-2.2-.4-1.6-1.2z', 0.7)}
    </G>
  );
};

/** Pickup Near Me: a shopping bag on the counter, a red pin standing by it. */
const PICKUP_PIN = 'M36.5 16a8.6 8.6 0 0 1 8.6 8.6c0 6.4-8.6 18.4-8.6 18.4s-8.6-12-8.6-18.4A8.6 8.6 0 0 1 36.5 16z';
D.Pickup = (k) => (
  <>
    <G fill="none" stroke={k.p.side} strokeWidth="2.2" strokeLinecap="round">
      <Path d="M10 20.5v-5a5.6 5.6 0 0 1 11.2 0v5" />
    </G>
    {k.cube({
      x: 3, y: 18, w: 25, h: 25, dx: 5, dy: -3.6, r: 1.8,
      top: k.lin([[0, mix(k.p.side, BLACK, 0.35)], [1, k.p.side]], 0, 0, 0, 1),
    })}
    <G fill="none" stroke={k.p.hi} strokeWidth="2.2" strokeLinecap="round">
      <Path d="M8 21.5v-6a6 6 0 0 1 12 0v6" />
    </G>
    <G fill={k.p.side}>
      <Circle cx="8" cy="22" r="1.3" />
      <Circle cx="20" cy="22" r="1.3" />
    </G>
    {k.gloss('M5.6 22.4c.6 0 1 .4 1 1v12c0 1-1.8 1-1.8 0V23.4c0-.6.4-1 .8-1z', 0.55)}
    <Ellipse cx="36.5" cy="43" rx="5.6" ry="1.7" fill="#1D1430" opacity="0.28" />
    {k.ext((f) => <Path d={PICKUP_PIN} fill={f} />, 1.4, 0.6, k.redSide, mix(k.redSide, BLACK, 0.25), 5)}
    <Path d={PICKUP_PIN} fill={k.red} />
    <Circle cx="36.5" cy="24.4" r="3.4" fill={k.redSide} />
    <Circle cx="36.9" cy="24.9" r="3" fill={WHITE} />
    {k.gloss('M31.8 21.2c.8-1.7 2.3-2.8 3.8-3.1.8-.1 1 .9.3 1.2-1 .5-1.9 1.4-2.5 2.4-.5.7-1.9.3-1.6-.5z', 0.8)}
  </>
);

/** Explore Mindoro: a green mountain by a blue sea, the sun behind. */
const MOUNTAIN_SEA_EDGE = 'M1.5 35.5c3.8 0 4.6-2.2 7.9-2.2s4.1 2.2 7.9 2.2 4.6-2.2 7.9-2.2 4.1 2.2 7.9 2.2 4.6-2.2 7.9-2.2 3.5 2.2 5.5 2.2';
D.Mountain = (k) => {
  const grass = k.lin([[0, '#D2F9A8'], [0.5, '#4FCB6B'], [1, '#1F9A5B']]);
  const grassSide = k.lin([[0, '#2A9F5F'], [0.65, '#1C7E4E'], [1, '#3FA56F']]);
  const glow = k.rad([[0, '#FFF6CF', 0.95], [0.55, '#FFE9A8', 0.5], [1, '#FFE9A8', 0]], 0.5, 0.5, 0.5);
  const sea = `${MOUNTAIN_SEA_EDGE}V41a4 4 0 0 1-4 4h-37a4 4 0 0 1-4-4z`;
  return (
    <>
      <Circle cx="36" cy="11" r="10" fill={glow} />
      <Circle cx="36" cy="11" r="5.6" fill={k.gold} />
      <Path d="M20 36L31.4 18.6a2.6 2.6 0 0 1 4.3 0L47 36z" fill={k.light} />
      <Path d="M33.6 17.4c.8 0 1.6.4 2.1 1.2L47 36H37z" fill={k.body} opacity="0.85" />
      <Path d="M1.5 37L15.5 12a2.9 2.9 0 0 1 5 0L35.5 37z" fill={grass} />
      <Path d="M18 10.6c1 0 2 .5 2.5 1.4L35.5 37H22z" fill={grassSide} />
      <Path d="M12.4 17.4c.9-1.5 2-3.2 3.1-5.4.4-.8 1.2-1.3 2-1.4-1.6 2.6-3 5.4-4.1 8.2-.4.9-1.6-.5-1-1.4z" fill={WHITE} opacity={n2(0.7 * GLOSS)} />
      <G fill={k.paper}>
        <Path d="M4.6 19.6a3 3 0 0 1 3.4-3.4 4 4 0 0 1 7.4 1.2 2.6 2.6 0 0 1 .4 5.2H6.6a2.4 2.4 0 0 1-2-3z" />
      </G>
      {k.solid((f) => <Path d={sea} fill={f} />, { dx: 0, dy: 1.6, face: k.body, steps: 4 })}
      <Path d={MOUNTAIN_SEA_EDGE} fill="none" stroke={WHITE} strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M11 40.6c2.4 0 3-1.5 5.2-1.5s2.8 1.5 5.2 1.5M27 41.4c2.4 0 3-1.5 5.2-1.5s2.8 1.5 5.2 1.5" fill="none" stroke={WHITE} strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
    </>
  );
};

/** Seller Academy: a graduation cap tipped toward you, a gold tassel. */
const CAP_BOARD = 'M24 7.5l20 8.8-20 8.8-20-8.8z';
D.Cap = (k) => (
  <G transform="rotate(-6 24 24) translate(0 1.5)">
    <Path d="M11.5 19v9.6c0 4 5.6 7.2 12.5 7.2s12.5-3.2 12.5-7.2V19z" fill={k.cyl} />
    <Path d="M11.5 19.4c3.4 2.4 7.6 3.6 12.5 3.6s9.1-1.2 12.5-3.6" fill="none" stroke={k.p.side} strokeOpacity="0.6" strokeWidth="1.2" />
    {k.ext((f) => <Path d={CAP_BOARD} fill={f} stroke={f} strokeWidth="2" strokeLinejoin="round" />, 0, 2.6, k.near, k.far, 5)}
    <Path d={CAP_BOARD} fill={k.body} stroke={k.body} strokeWidth="2" strokeLinejoin="round" />
    <Path d="M6.4 16.1L24 8.4l17.6 7.7" fill="none" stroke={WHITE} strokeOpacity="0.55" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    {k.gloss('M10.6 15.4l9-4c.9-.4 1.6.8.8 1.4l-6.4 4.4c-.8.6-2.2.4-3.4-.4-.6-.4-.6-1.1 0-1.4z', 0.7)}
    <Path d="M24 16.3l15.6 2.6v12.6" fill="none" stroke={k.goldSide} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(0.4 0.5)" />
    <Path d="M24 16.3l15.6 2.6v12.6" fill="none" stroke="#FFC83D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <Ellipse cx="24" cy="16.3" rx="2.6" ry="1.6" fill={k.gold} />
    <Path d="M37.4 30.6h4.4l1.3 7.4a1.6 1.6 0 0 1-1.6 1.9h-3.8a1.6 1.6 0 0 1-1.6-1.9z" fill={k.gold} />
    <Path d="M38.4 33v5.4M40.8 33v5.4" stroke={k.goldSide} strokeOpacity="0.7" strokeWidth="0.8" strokeLinecap="round" />
    <Rect x="37.2" y="29.6" width="4.8" height="2.2" rx="1.1" fill={k.goldSide} />
  </G>
);

/** A mark drawn as its 3D object. `name` is FlatArt's name for the mark. */
function PopArt({ name, size = 34, tone }) {
  const id = `pp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const draw = D[name];
  if (!draw || !tone) return <Svg width={size} height={size} viewBox="0 0 48 48" />;
  const k = kit(id, rampOf(tone));
  const body = draw(k);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>{k.defs()}</Defs>
      {body}
    </Svg>
  );
}

export default memo(PopArt);

/** The names PopArt can draw. */
export const POP_NAMES = Object.keys(D);
