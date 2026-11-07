/**
 * The 3D look of the shortcut marks (shortcutArtStyle POP): each mark
 * drawn again as a small object -- a truck with its wheels and windscreen,
 * a box showing its lid and one side, a pot with its lid on -- seen from a
 * little above and to one side, the side changing from object to object.
 *
 * How they are lit, all the same way so a row reads as one set:
 *
 *   - light from the top left. Faces turned up are lightest, faces turned
 *     to the viewer carry the colour, faces turned away are the deepest.
 *   - every face is soft: an inner glow along its top-left edge and a soft
 *     shade along its bottom-right (the puff filter), so edges look rounded
 *     rather than cut.
 *   - colour runs across a face from a light value through the hue into its
 *     neighbour (orange into red, blue into indigo), as on a glossy toy.
 *   - a few materials besides the hue: dark rubber, pale glass, metal, gold,
 *     paper. White only for what is printed on a thing.
 *   - a gloss highlight where a curved face catches the light. No shadow on
 *     the page.
 *
 * FlatArt's marks hand over to these when the look is 'pop'; the names
 * here are the marks' names there. Everything is on FlatArt's 48 grid.
 */

import { useId } from 'react';

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
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const n2 = (v) => Number(v.toFixed(2));

function rampOf([tint, deep]) {
  const known = RAMPS[deep.toUpperCase()];
  const [hi, mid, lo, side] = known || [mix(tint, WHITE, 0.2), deep, mix(deep, BLACK, 0.15), mix(deep, BLACK, 0.32)];
  return {
    hi, mid, lo, side,
  };
}

/**
 * What a drawing paints with: the hue's paints, the shared materials, the
 * filters, and helpers for solids. Gradients are registered as they are
 * used and drawn into <defs> afterwards.
 */
function kit(id, p) {
  const defs = [];
  let count = 0;
  const stopsOf = (stops) => stops.map(([o, c, a], i) => (
    <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />
  ));
  const lin = (stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) => {
    const gid = `${id}g${count += 1}`;
    defs.push(<linearGradient key={gid} id={gid} x1={x1} y1={y1} x2={x2} y2={y2}>{stopsOf(stops)}</linearGradient>);
    return `url(#${gid})`;
  };
  const rad = (stops, cx = 0.35, cy = 0.3, r = 0.8) => {
    const gid = `${id}g${count += 1}`;
    defs.push(<radialGradient key={gid} id={gid} cx={cx} cy={cy} r={r}>{stopsOf(stops)}</radialGradient>);
    return `url(#${gid})`;
  };

  const sideFar = mix(p.side, BLACK, 0.32);
  const k = {
    p,
    lin,
    rad,
    puff: `url(#${id}p)`,
    soft: `url(#${id}s)`,
    // The hue.
    body: lin([[0, p.hi], [0.5, p.mid], [1, p.lo]]),
    light: lin([[0, mix(p.hi, WHITE, 0.45)], [0.6, p.hi], [1, mix(p.hi, p.mid, 0.45)]]),
    top: lin([[0, mix(p.hi, WHITE, 0.55)], [1, p.hi]]),
    side: lin([[0, p.side], [1, sideFar]]),
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
    far: sideFar,
    tintNear: mix(p.hi, p.mid, 0.5),
    tintFar: p.mid,
  };

  /** A shape's body: copies stepped back along (dx, dy), far ones darker. */
  k.ext = (shape, dx, dy, near = k.near, far = k.far, steps = 8) => Array.from({ length: steps }, (_, i) => {
    const t = (steps - i) / steps;
    return (
      <g key={`e${i}`} transform={`translate(${n2(dx * t)} ${n2(dy * t)})`}>
        {shape(mix(near, far, t))}
      </g>
    );
  });

  /** A solid: its body, then its face, softened. */
  k.solid = (shape, {
    dx = 1.8, dy = 2.2, face = k.body, near = k.near, far = k.far, steps = 8,
  } = {}) => (
    <>
      {k.ext(shape, dx, dy, near, far, steps)}
      <g filter={k.puff}>{shape(face)}</g>
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
        <path d={sp} fill={side} stroke={side} strokeWidth={r} strokeLinejoin="round" />
        <g filter={k.puff}><path d={tp} fill={top} stroke={top} strokeWidth={r} strokeLinejoin="round" /></g>
        <g filter={k.puff}><rect x={x} y={y} width={w} height={h} rx={r} fill={front} /></g>
        <path d={`M${x + r} ${y + 0.5}H${x + w - r}`} stroke={WHITE} strokeOpacity="0.7" strokeWidth="0.8" strokeLinecap="round" />
      </>
    );
  };

  /** Print on a face: white, pressed in a little. */
  k.print = (shape, shade = p.side) => (
    <>
      <g transform="translate(0.45 0.7)" opacity="0.45">{shape(shade)}</g>
      {shape(WHITE)}
    </>
  );

  /** A highlight where a curved face catches the light. */
  k.gloss = (d, o = 0.6) => <path d={d} fill={WHITE} opacity={o} filter={k.soft} />;

  k.defs = () => defs;
  return k;
}

/* ── The drawings ────────────────────────────────────────────────────── */

const D = {};

/** Today's Menu: a pot with its lid on, steam rising, a fork and spoon on it. */
D.Pot = (k) => (
  <>
    <g fill="none" stroke={k.p.hi} strokeWidth="2.6" strokeLinecap="round">
      <path d="M16.5 8.5c0-2.6 2.6-3 2.6-5.6" />
      <path d="M29.5 8.5c0-2.6 2.6-3 2.6-5.6" />
    </g>
    <g filter={k.puff}>
      <rect x="2.5" y="24" width="8" height="5.6" rx="2.8" fill={k.side} />
      <rect x="37.5" y="24" width="8" height="5.6" rx="2.8" fill={k.side} />
    </g>
    <g filter={k.puff}><path d="M7 22v12.5c0 4.1 7.6 7.5 17 7.5s17-3.4 17-7.5V22z" fill={k.cyl} /></g>
    <ellipse cx="24" cy="22" rx="17" ry="5.4" fill={k.top} />
    <g filter={k.puff}><path d="M9 21.5C9 14.6 15.7 11 24 11s15 3.6 15 10.5c0 2.6-6.7 4.4-15 4.4S9 24.1 9 21.5z" fill={k.body} /></g>
    <g filter={k.puff}><ellipse cx="24" cy="11.4" rx="3.8" ry="2.6" fill={k.side} /></g>
    {k.gloss('M12.5 19.2c1.2-3.2 4.8-5 9-5.4.9 0 1 .9.2 1.2-3.6 1-6.2 2.6-7.6 4.9-.5.8-1.9.3-1.6-.7z', 0.75)}
    {k.gloss('M9.5 27.5c.6 0 1 .4 1 1v6c0 .9-1.6.9-1.8 0-.3-2-.3-4.4 0-6.2.1-.5.4-.8.8-.8z', 0.55)}
    {k.print((c) => (
      <g fill={c}>
        <rect x="18" y="28.5" width="2.4" height="9.5" rx="1.2" />
        <rect x="15.7" y="28.5" width="1.8" height="5" rx="0.9" />
        <rect x="20.9" y="28.5" width="1.8" height="5" rx="0.9" />
        <path d="M27.2 28.5h2.6a2.4 2.4 0 0 1 2.4 2.4v2.4a2.4 2.4 0 0 1-2.4 2.4h-.2v2.6a1.2 1.2 0 0 1-2.4 0z" />
      </g>
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
      {k.solid((f) => <path d={s(38, 10.5, 7)} fill={f} />, {
        dx: 1.1, dy: 1.3, face: k.light, near: k.tintNear, far: k.tintFar,
      })}
      {k.solid((f) => <path d={s(38.5, 37, 6)} fill={f} />, {
        dx: 1, dy: 1.2, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25),
      })}
      <g transform="rotate(8 20 23)">
        {k.solid((f) => <path d={s(20, 23, 17)} fill={f} />, { dx: 2.2, dy: 2.6 })}
        {k.gloss('M18.6 12c.8 0 1.2.8 1 1.6l-1.1 6.2c-.2 1-1.7 1-1.8 0l-.1-5.8c0-1.1.9-2 2-2z', 0.8)}
      </g>
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
      <g fill={f} stroke={f}>
        <path d="M5 21.5l9-7 7.5 4.5 13-10" fill="none" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M31 6.5l9.5-3-1.8 9.8z" strokeWidth="1.6" strokeLinejoin="round" />
      </g>
    ), 0.9, 1.4, k.goldSide, mix(k.goldSide, BLACK, 0.25), 5)}
    <g filter={k.puff}>
      <path d="M5 21.5l9-7 7.5 4.5 13-10" fill="none" stroke={k.gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 6.5l9.5-3-1.8 9.8z" fill={k.gold} stroke={k.gold} strokeWidth="1.6" strokeLinejoin="round" />
    </g>
  </>
);

/** Budget Finds: a round piggy bank, a gold coin going in. */
D.Piggy = (k) => (
  <>
    <g filter={k.puff} fill={k.side}>
      <rect x="10" y="33" width="6" height="10" rx="3" />
      <rect x="27" y="33" width="6" height="10" rx="3" />
    </g>
    <path d="M6.5 25.5c-3 .2-3.6-3-1.2-3.6" fill="none" stroke={k.p.side} strokeWidth="1.8" strokeLinecap="round" />
    <g filter={k.puff}><path d="M9.5 18.5 12 8.8c.3-1.2 1.8-1.5 2.6-.6l5.6 6.6z" fill={k.body} /></g>
    <g filter={k.puff}><ellipse cx="22" cy="27" rx="16.5" ry="13" fill={k.ball} /></g>
    <g filter={k.puff}>
      <rect x="15" y="34.5" width="6.4" height="9.5" rx="3.2" fill={k.body} />
      <rect x="30" y="34" width="6.4" height="9.5" rx="3.2" fill={k.body} />
    </g>
    <g filter={k.puff}><ellipse cx="38.2" cy="28.5" rx="4.6" ry="5.6" fill={k.side} /></g>
    <g filter={k.puff}><ellipse cx="39.6" cy="28.3" rx="3.7" ry="4.8" fill={k.light} /></g>
    <g fill={k.p.side}>
      <ellipse cx="38.6" cy="27.6" rx="0.9" ry="1.3" />
      <ellipse cx="41" cy="27.6" rx="0.9" ry="1.3" />
    </g>
    <ellipse cx="30" cy="22.2" rx="1.5" ry="1.9" fill="#2A2238" />
    <rect x="16" y="15.6" width="11" height="2.6" rx="1.3" fill={k.p.side} />
    {k.solid((f) => <ellipse cx="21.5" cy="9.6" rx="4.4" ry="6" fill={f} />, {
      dx: 2, dy: 0, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 5,
    })}
    <ellipse cx="21.5" cy="9.6" rx="2.4" ry="3.6" fill="none" stroke="#FFF6CF" strokeWidth="1" />
    {k.gloss('M11 22.5c2-4.4 6.2-6.6 10-6.8 1 0 1.2 1.1.3 1.4-3.6 1.1-6.4 3.2-8.1 6.2-.6 1-2.6.4-2.2-.8z', 0.75)}
  </>
);

/** All Products: four puffy tiles, one lifted out of the grid. */
D.Grid = (k) => {
  const tile = (x, y, face, light) => k.solid((f) => <rect x={x} y={y} width="17" height="17" rx="5" fill={f} />, {
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
      <g transform="translate(-1 -2)">
        {k.solid((f) => <rect x="26" y="5" width="17" height="17" rx="5" fill={f} />, {
          dx: 2.4, dy: 3.6, face: k.light, near: k.tintNear, far: k.tintFar,
        })}
      </g>
      {k.gloss('M8 7.5h6c1 0 1 1.4 0 1.5-2.4.3-4 1.4-5 3.4-.5 1-1.9.7-1.9-.4V9.4c0-1 .8-1.9 1.9-1.9z', 0.7)}
      {k.gloss('M29 27.5h6c1 0 1 1.4 0 1.5-2.4.3-4 1.4-5 3.4-.5 1-1.9.7-1.9-.4v-2.6c0-1 .8-1.9 1.9-1.9z', 0.7)}
    </>
  );
};

/** Municipals: two buildings on a corner, windows lit. */
D.Town = (k) => {
  const win = (x, y, w = 3.8, h = 4) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1" fill={k.glass} />;
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
      <rect x="25.6" y="37.5" width="5.4" height="5.5" rx="1" fill={k.glass} />
    </>
  );
};

/** Store Map: a folded map with a red pin standing on it. */
D.Map = (k) => (
  <>
    {k.ext((f) => <path d="M3 15l14-5 14 5 14-5v29l-14 5-14-5-14 5z" fill={f} stroke={f} strokeWidth="1.2" strokeLinejoin="round" />, 0, 2.2)}
    <g filter={k.puff} strokeWidth="1.2" strokeLinejoin="round">
      <path d="M3 15l14-5v29L3 44z" fill={k.light} stroke={k.light} />
      <path d="M17 10l14 5v29l-14-5z" fill={k.body} stroke={k.body} />
      <path d="M31 15l14-5v29l-14 5z" fill={k.light} stroke={k.light} />
    </g>
    <g fill="none" stroke={WHITE} strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round">
      <path d="M5 30l10-4" />
      <path d="M33 24l10-4.5" />
      <path d="M34 36l9-3.2" />
    </g>
    <ellipse cx="24" cy="33.5" rx="4.6" ry="1.6" fill="#1D1430" opacity="0.28" filter={k.soft} />
    {k.ext((f) => <path d="M24 5.5a8.2 8.2 0 0 1 8.2 8.2c0 6-8.2 19.5-8.2 19.5S15.8 19.7 15.8 13.7A8.2 8.2 0 0 1 24 5.5z" fill={f} />, 1.4, 0.6, k.redSide, mix(k.redSide, BLACK, 0.25), 5)}
    <g filter={k.puff}><path d="M24 5.5a8.2 8.2 0 0 1 8.2 8.2c0 6-8.2 19.5-8.2 19.5S15.8 19.7 15.8 13.7A8.2 8.2 0 0 1 24 5.5z" fill={k.red} /></g>
    <circle cx="24" cy="13.6" r="3.2" fill={k.redSide} />
    <circle cx="24.4" cy="14.1" r="2.8" fill={WHITE} />
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
    <g filter={k.puff}><ellipse cx="34.5" cy="14.4" rx="2.6" ry="1.2" fill={k.red} /></g>
    <rect x="30" y="21" width="5" height="3.4" rx="1" fill={k.glass} />
    {k.ext((f) => <circle cx="21" cy="30" r="10" fill={f} />, 1.6, -1.4, '#9AA3B2', '#6B7383', 5)}
    <g filter={k.puff}><circle cx="21" cy="30" r="10" fill={k.metal} /></g>
    <circle cx="21" cy="30" r="7" fill={k.lens} />
    <circle cx="21" cy="30" r="3.4" fill="none" stroke="#7F90B8" strokeOpacity="0.5" strokeWidth="1" />
    <ellipse cx="18.4" cy="27.4" rx="2" ry="1.4" fill={WHITE} opacity="0.85" transform="rotate(-35 18.4 27.4)" />
    <circle cx="24" cy="33" r="0.9" fill={WHITE} opacity="0.6" />
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
      <path d="M3 11L40 11L46 6.5L9 6.5Z" fill={k.top} stroke={k.top} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M40 11l6-4.5v7.5l-6 6z" fill={k.side} />
      <g filter={k.puff}>
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${n2(3 + i * w)} 11h${n2(w)}v6.5a${n2(w / 2)} ${n2(w / 2)} 0 0 1-${n2(w)} 0z`}
            fill={i % 2 ? k.paper : k.body}
          />
        ))}
      </g>
      <rect x="11" y="27" width="10" height="16" rx="1.6" fill={k.glass} />
      <circle cx="19" cy="35.5" r="0.9" fill={k.p.side} />
      <rect x="25" y="27" width="9" height="8" rx="1.6" fill={k.glass} />
      <path d="M26.2 33.5l5-5" stroke={WHITE} strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round" />
    </>
  );
};

/** Wishlist: a puffy heart, leaning. */
D.Heart = (k) => (
  <g transform="rotate(-9 24 25)">
    {k.solid((f) => (
      <path d="M24 43S3.5 30.5 3.5 17.6A11 11 0 0 1 24 11a11 11 0 0 1 20.5 6.6C44.5 30.5 24 43 24 43z" fill={f} />
    ), { dx: 2.4, dy: 2.4, face: k.ball })}
    {k.gloss('M9.6 13.6c2.4-2.2 5.6-2.5 8-1.4.9.4.6 1.7-.4 1.7-2.6 0-4.8 1.1-6.3 3.2-1.2 1.6-3.5-1.3-1.3-3.5z', 0.85)}
    <ellipse cx="11" cy="21" rx="1.3" ry="1.8" fill={WHITE} opacity="0.7" filter={k.soft} />
  </g>
);

/** My Orders: a closed carton, lid and one side showing, taped. */
D.Parcel = (k) => (
  <>
    {k.cube({
      x: 4, y: 19, w: 28, h: 24, dx: 10, dy: -8, r: 1.8,
    })}
    <path d="M9 15l28 0" stroke={k.p.mid} strokeOpacity="0.5" strokeWidth="0.8" />
    <path d="M15 19h6l10-8h-6z" fill={WHITE} opacity="0.92" />
    <rect x="15" y="19" width="6" height="8.5" fill={WHITE} opacity="0.92" />
    <rect x="23.5" y="33" width="6" height="5" rx="1" fill={WHITE} opacity="0.85" />
    <path d="M24.8 35h3.4M24.8 36.6h2.2" stroke={k.p.mid} strokeWidth="0.7" strokeLinecap="round" />
  </>
);

/** My Offers: a price tag on its string, a tick on it. */
D.Tag = (k) => {
  const tag = 'M25 3.5h15.5A4 4 0 0 1 44.5 7.5V23a5 5 0 0 1-1.5 3.6L26.6 43a5 5 0 0 1-7.1 0L5 28.5a5 5 0 0 1 0-7.1L21.4 5a5 5 0 0 1 3.6-1.5z';
  return (
    <g transform="rotate(-6 24 24) translate(0 1)">
      {k.solid((f) => <path d={tag} fill={f} transform="matrix(.92 0 0 .92 1 1)" />, { dx: 2, dy: 2.6 })}
      <circle cx="34.5" cy="12.6" r="4.2" fill={k.p.side} />
      <circle cx="35" cy="13.2" r="3.6" fill={WHITE} />
      <path d="M35 13c3-5 6.5-8 10-9.5" fill="none" stroke={k.p.hi} strokeWidth="1.6" strokeLinecap="round" />
      {k.print((c) => <path d="M14.5 25.5l5 5 9-9" fill="none" stroke={c} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />)}
      {k.gloss('M24.2 6.4h6.6c1 0 1 1.4 0 1.5-3.3.4-6.6 1.6-9.6 4-1 .8-2.3-.4-1.4-1.4l2.8-3c.5-.7 1-1.1 1.6-1.1z', 0.7)}
    </g>
  );
};

/** Returns: a carton turned the other way, an arrow coming back on it. */
D.Return = (k) => (
  <>
    {k.cube({
      x: 14, y: 19, w: 29, h: 24, dx: -9, dy: -7, r: 1.8,
    })}
    <path d="M25 19h6l-9-7h-6z" fill={WHITE} opacity="0.92" />
    {k.ext((f) => (
      <g fill={f} stroke={f}>
        <path d="M25 27.5h6.5a5 5 0 0 1 0 10H26" fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M26.2 23v9l-7.4-4.5z" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
    ), 0.6, 0.9, k.p.side, mix(k.p.side, BLACK, 0.2), 4)}
    <g>
      <path d="M25 27.5h6.5a5 5 0 0 1 0 10H26" fill="none" stroke={WHITE} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26.2 23v9l-7.4-4.5z" fill={WHITE} stroke={WHITE} strokeWidth="1.2" strokeLinejoin="round" />
    </g>
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
  const shape = (cx, cy, r) => (f) => <polygon points={star(cx, cy, r)} fill={f} stroke={f} strokeWidth="3.4" strokeLinejoin="round" />;
  return (
    <>
      {k.solid(shape(38, 11, 6.5), {
        dx: 1.1, dy: 1.4, face: k.light, near: k.tintNear, far: k.tintFar, steps: 5,
      })}
      <g transform="rotate(10 21 25)">
        {k.solid(shape(21, 25, 17), { dx: 2.2, dy: 2.8 })}
        {k.gloss('M19.2 12.4c.6-1.2 2.2-1.2 2.6.1l1.4 4.1c.3 1-1 1.6-1.6.8l-2.4-3.4c-.3-.5-.3-1.1 0-1.6z', 0.85)}
      </g>
    </>
  );
};

/** Addresses: a round pin standing on its spot. */
D.Pin = (k) => (
  <>
    {k.ext((f) => <ellipse cx="24" cy="40.5" rx="12" ry="4" fill={f} />, 0, 1.8, k.tintNear, k.tintFar, 4)}
    <ellipse cx="24" cy="40.5" rx="12" ry="4" fill={k.light} />
    <ellipse cx="24" cy="40.5" rx="5.6" ry="1.8" fill="#1D1430" opacity="0.28" filter={k.soft} />
    <g transform="rotate(6 24 40)">
      <g filter={k.puff}><path d="M24 3a14 14 0 0 1 14 14c0 10.5-14 23.5-14 23.5S10 27.5 10 17A14 14 0 0 1 24 3z" fill={k.ball} /></g>
      <circle cx="24" cy="16.6" r="5.8" fill={k.p.side} />
      <circle cx="24.5" cy="17.2" r="5.1" fill={WHITE} />
      {k.gloss('M14.8 12.2c1.5-3.4 4.6-5.4 7.8-5.8.9-.1 1.2 1.1.3 1.4-2.6 1-4.7 2.8-6 5.4-.5.9-2.4.2-2.1-1z', 0.85)}
    </g>
  </>
);

/** Get the App: a phone held at an angle, a code on its screen. */
D.Qr = (k) => (
  <g transform="rotate(-11 24 24)">
    {k.solid((f) => <rect x="11" y="3" width="26" height="42" rx="6" fill={f} />, { dx: -2.6, dy: 1.8 })}
    <rect x="13.6" y="7.5" width="20.8" height="33" rx="3.2" fill={k.paper} />
    <rect x="20.5" y="4.6" width="7" height="1.6" rx="0.8" fill={k.p.side} />
    <g fill={k.p.mid}>
      {[[16, 11], [25.5, 11], [16, 20.5]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="6.5" height="6.5" rx="1.8" />
          <rect x={x + 2} y={y + 2} width="2.5" height="2.5" rx="0.6" fill={WHITE} />
        </g>
      ))}
      <rect x="25.5" y="20.5" width="2.8" height="2.8" rx="0.7" />
      <rect x="29.2" y="24.2" width="2.8" height="2.8" rx="0.7" />
      <rect x="25.5" y="24.2" width="2.8" height="2.8" rx="0.7" fill={k.p.lo} />
    </g>
    <rect x="16" y="31" width="16" height="3" rx="1.5" fill={k.p.hi} />
    <rect x="19" y="36" width="10" height="2.4" rx="1.2" fill={k.p.hi} opacity="0.7" />
    {k.gloss('M12.6 9c0-2.6 1.4-4.2 3.8-4.6.8-.1 1 1 .3 1.3-1.5.7-2.3 1.9-2.4 3.6V22c0 1-1.7 1-1.7 0z', 0.7)}
  </g>
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
    <g transform="rotate(-12 24 24)">
      <defs><clipPath id={clip}><path d={ring} fillRule="evenodd" /></clipPath></defs>
      {k.ext((f) => <path d={ring} fillRule="evenodd" fill={f} />, 0, 3.6, '#C5CEDB', '#97A3B5', 7)}
      <g filter={k.puff}>
        <path d={ring} fillRule="evenodd" fill={k.paper} />
        <g clipPath={`url(#${clip})`}>
          {[45, 135, 225, 315].map((a) => <path key={a} d={wedge(a)} fill={k.body} />)}
        </g>
      </g>
      {k.gloss('M9.2 15.6c2.6-4.4 7.6-7 12.8-7.4 1 0 1.1 1.3.2 1.5-4.6 1-8.6 3.4-11 7-.6.9-2.5.2-2-1.1z', 0.75)}
    </g>
  );
};

/** Customer Care: a headset, the near cup bigger, the mic swung down. */
D.Headset = (k) => (
  <>
    <g filter={k.puff}><path d="M9.5 25v-4a15 15 0 0 1 30 0v3" fill="none" stroke={k.body} strokeWidth="5" strokeLinecap="round" /></g>
    <path d="M12 16.6a13 13 0 0 1 8-6" fill="none" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
    <g filter={k.puff}><rect x="33" y="19" width="10" height="16.5" rx="5" fill={k.side} /></g>
    <rect x="30.4" y="21" width="4.4" height="12.5" rx="2.2" fill={k.dark} />
    <path d="M9 38c0 5 3.6 6.5 9 6.5" fill="none" stroke={k.p.side} strokeWidth="2.4" strokeLinecap="round" />
    <g filter={k.puff}><rect x="17" y="41.6" width="8" height="5" rx="2.5" fill={k.dark} /></g>
    <rect x="11.6" y="20" width="5" height="17" rx="2.5" fill={k.dark} />
    <g filter={k.puff}><rect x="2.5" y="17.5" width="12" height="21" rx="6" fill={k.body} /></g>
    {k.gloss('M5.6 22c0-1.6 1-2.8 2.6-3.1.8-.1 1.1.9.4 1.3-.8.4-1.2 1.1-1.2 2v7c0 1-1.8 1-1.8 0z', 0.75)}
  </>
);

/** Feedback: two speech bubbles, the front one with dots in it. */
D.Bubble = (k) => (
  <>
    <g transform="rotate(6 32 30)">
      {k.solid((f) => <path d="M20 16h21a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-1v6l-7-6H20a5 5 0 0 1-5-5V21a5 5 0 0 1 5-5z" fill={f} />, {
        dx: 1.6, dy: 2, face: k.light, near: k.tintNear, far: k.tintFar,
      })}
    </g>
    <g transform="rotate(-5 18 18)">
      {k.solid((f) => <path d="M7 4h22a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H17l-8 7v-7H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={f} />, { dx: 2, dy: 2.4 })}
      {k.print((c) => (
        <g fill={c}>
          <circle cx="11" cy="15" r="2.6" />
          <circle cx="18" cy="15" r="2.6" />
          <circle cx="25" cy="15" r="2.6" />
        </g>
      ))}
      {k.gloss('M6.2 6.6h7c1 0 1 1.4 0 1.5-2.4.3-4 1.2-5 2.8-.5.9-2 .6-2-.5v-2c0-1 .8-1.8 1.8-1.8z', 0.7)}
    </g>
  </>
);

/** Start Selling: a megaphone, its bell opening towards you. */
D.Megaphone = (k) => (
  <>
    <g fill="none" stroke={k.p.hi} strokeWidth="2.4" strokeLinecap="round">
      <path d="M44 17a10 10 0 0 1 0 14" />
    </g>
    <g filter={k.puff}><rect x="14" y="29" width="5.4" height="12" rx="2.7" fill={k.side} transform="rotate(14 16.7 29)" /></g>
    <g filter={k.puff}><rect x="5" y="17" width="10" height="14" rx="4.6" fill={k.light} /></g>
    <g filter={k.puff}><path d="M13 18.5L36 8v32L13 29.5z" fill={k.cone} stroke={k.cone} strokeWidth="1.4" strokeLinejoin="round" /></g>
    <path d="M15 19.4l19-8.6" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round" />
    <g filter={k.puff}><ellipse cx="36.5" cy="24" rx="5.6" ry="16.4" fill={k.top} /></g>
    <ellipse cx="37.4" cy="24.4" rx="3.8" ry="13.6" fill={k.lin([[0, k.p.side], [1, mix(k.p.side, BLACK, 0.45)]], 0, 0, 1, 0)} />
    {k.print((c) => <rect x="20" y="21.5" width="8" height="3" rx="1.5" fill={c} transform="rotate(-5 24 23)" />)}
  </>
);

/** Go live: a video camera turned a little, lens forward, the on-air light. */
D.Live = (k) => (
  <>
    <g filter={k.puff}><path d="M33 20l11-6.5v22L33 29z" fill={k.side} stroke={k.side} strokeWidth="1.4" strokeLinejoin="round" /></g>
    {k.cube({
      x: 3, y: 16, w: 28, h: 22, dx: 5, dy: -5, r: 2.4,
    })}
    {k.ext((f) => <circle cx="17" cy="27" r="7.6" fill={f} />, 1.2, -1.2, '#9AA3B2', '#6B7383', 4)}
    <g filter={k.puff}><circle cx="17" cy="27" r="7.6" fill={k.metal} /></g>
    <circle cx="17" cy="27" r="5.2" fill={k.lens} />
    <ellipse cx="15.2" cy="25.2" rx="1.5" ry="1" fill={WHITE} opacity="0.85" transform="rotate(-35 15.2 25.2)" />
    <circle cx="27.5" cy="20.5" r="2.4" fill={WHITE} />
    <circle cx="27.5" cy="20.5" r="1.4" fill="#FF3355" />
  </>
);

/** My products: cartons of stock, two on the floor, one on top. */
D.Package = (k) => {
  const tape = (x, y, w) => <rect x={x + w / 2 - 2} y={y} width="4" height="5.5" fill={WHITE} opacity="0.9" />;
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
      <path d="M20 11h4l5-4h-4z" fill={WHITE} opacity="0.9" />
    </>
  );
};

/** My orders: a receipt curling a little, a coin by it. */
D.Receipt = (k) => {
  const paper = 'M9 4h28a3 3 0 0 1 3 3v35l-5-3-5 3-5-3-5 3-5-3-5 3V7a3 3 0 0 1 3-3z';
  return (
    <>
      <g transform="rotate(-7 24 24)">
        {k.solid((f) => <path d={paper} fill={f} />, {
          dx: 1.8, dy: 2, face: k.paper, near: k.paperSide, far: mix(k.paperSide, BLACK, 0.2),
        })}
        <path d="M9 4h28a3 3 0 0 1 3 3v6H6V7a3 3 0 0 1 3-3z" fill={k.body} />
        <g fill={k.p.hi}>
          <rect x="10" y="18" width="22" height="2.8" rx="1.4" />
          <rect x="10" y="24" width="16" height="2.8" rx="1.4" />
        </g>
        <rect x="10" y="30" width="12" height="3.2" rx="1.6" fill={k.p.mid} />
      </g>
      {k.solid((f) => <circle cx="37.5" cy="37" r="7" fill={f} />, {
        dx: 1.2, dy: 1.6, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 5,
      })}
      <circle cx="37.5" cy="37" r="4.4" fill="none" stroke="#FFF6CF" strokeWidth="1.1" />
      <path d="M36 34.5v5M36 34.5h2a1.6 1.6 0 0 1 0 3.2h-2" fill="none" stroke="#C26A0A" strokeWidth="1.1" strokeLinecap="round" />
    </>
  );
};

/** Performance: a pie lying on its side, a gold slice lifted out. */
D.Chart = (k) => {
  const main = 'M21 26L39 26A18 13 0 1 1 21 13Z';
  const slice = 'M25 22L25 9A18 13 0 0 1 43 22Z';
  return (
    <>
      {k.solid((f) => <path d={slice} fill={f} />, {
        dx: 0, dy: 5, face: k.gold, near: k.goldSide, far: mix(k.goldSide, BLACK, 0.25), steps: 7,
      })}
      {k.solid((f) => <path d={main} fill={f} />, { dx: 0, dy: 6, steps: 9 })}
      <path d="M21 26L21 13" stroke={WHITE} strokeOpacity="0.5" strokeWidth="0.8" />
      {k.gloss('M7 21c2-4 6.2-6.6 11-7.4.9-.1 1.2 1.2.3 1.5-4 1.2-7.2 3.4-9 6.6-.5.9-2.6.4-2.3-.7z', 0.75)}
    </>
  );
};

/** Finance: a wallet, a note sticking out, the clasp in gold. */
D.Wallet = (k) => (
  <>
    <g transform="rotate(-9 22 12)">
      {k.solid((f) => <rect x="10" y="4" width="25" height="15" rx="2.4" fill={f} />, {
        dx: 0.8, dy: 1, face: k.light, near: k.tintNear, far: k.tintFar, steps: 4,
      })}
      <ellipse cx="22.5" cy="9.5" rx="4" ry="3" fill={WHITE} opacity="0.85" />
    </g>
    {k.solid((f) => <rect x="3" y="14" width="39" height="29" rx="7" fill={f} />, { dx: 2.4, dy: 2 })}
    <rect x="6" y="17" width="33" height="23" rx="5" fill="none" stroke={WHITE} strokeOpacity="0.55" strokeWidth="0.9" strokeDasharray="2 1.6" />
    <g filter={k.puff}><path d="M29 22h16v14H29a7 7 0 0 1 0-14z" fill={k.light} /></g>
    {k.solid((f) => <circle cx="31" cy="29" r="3" fill={f} />, {
      dx: 0.6, dy: 0.8, face: k.gold, near: k.goldSide, far: k.goldSide, steps: 3,
    })}
    {k.gloss('M6.5 19c0-2 1.2-3.4 3.2-3.8.8-.1 1.1 1 .4 1.3-1 .5-1.7 1.3-1.8 2.6v6c0 1-1.8 1-1.8 0z', 0.7)}
  </>
);

/** Add product: a round button, a plus standing up on it. */
D.Plus = (k) => (
  <>
    {k.solid((f) => <ellipse cx="24" cy="21" rx="20" ry="16.5" fill={f} />, {
      dx: 0, dy: 6, face: k.ball, steps: 9,
    })}
    {k.ext((f) => (
      <g fill={f}>
        <rect x="12" y="17.8" width="24" height="6.4" rx="3.2" />
        <rect x="20.8" y="9" width="6.4" height="24" rx="3.2" />
      </g>
    ), 0, 1.8, k.tintNear, k.tintFar, 4)}
    <g fill={WHITE}>
      <rect x="12" y="17.8" width="24" height="6.4" rx="3.2" />
      <rect x="20.8" y="9" width="6.4" height="24" rx="3.2" />
    </g>
    {k.gloss('M8 15c2.4-4.4 7.4-7.6 13.6-8 1 0 1.2 1.3.2 1.5-5 1-9 3.4-11.6 7-.7.9-2.7.5-2.2-.5z', 0.75)}
  </>
);

/** Decorate my shop: a paintbrush, its bristles dipped in the hue. */
D.Brush = (k) => (
  <>
    <ellipse cx="11" cy="42" rx="7" ry="2.6" fill={k.p.mid} opacity="0.9" />
    <ellipse cx="9.4" cy="41.4" rx="2.6" ry="0.9" fill={WHITE} opacity="0.5" />
    <g transform="rotate(-45 24 24)">
      <g filter={k.puff}><rect x="22" y="20.5" width="23" height="7" rx="3.5" fill={k.lin([[0, k.p.hi], [0.45, k.p.mid], [1, k.p.side]], 0, 0, 0, 1)} /></g>
      <circle cx="41" cy="24" r="1.2" fill={WHITE} />
      <g filter={k.puff}><rect x="14.5" y="19.3" width="8.5" height="9.4" rx="1.6" fill={k.lin([[0, WHITE], [0.45, '#D9DEE6'], [1, '#98A2B3']], 0, 0, 0, 1)} /></g>
      <g filter={k.puff}><path d="M15 19.5c-6.4 0-10.4 1.8-12.2 4.5 1.8 2.7 5.8 4.5 12.2 4.5z" fill={k.lin([[0, '#FFF4E2'], [0.5, '#F2C994'], [1, '#C98B52']], 0, 0, 0, 1)} /></g>
      <path d="M8.5 20.4c-3 .6-4.9 1.9-5.7 3.6.8 1.7 2.7 3 5.7 3.6z" fill={k.body} />
      <path d="M24 21.6h18" stroke={WHITE} strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" />
    </g>
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
  const gear = (f) => <polygon points={pts.join(' ')} fill={f} stroke={f} strokeWidth="2.4" strokeLinejoin="round" />;
  return (
    <g transform="translate(0 -2) rotate(-8 24 24) translate(24 24) scale(1 .84) translate(-24 -24)">
      {k.solid(gear, { dx: 0, dy: 6, steps: 9 })}
      <circle cx="24" cy="24" r="12.5" fill="none" stroke={WHITE} strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="24" cy="25.6" r="7" fill={k.p.side} />
      <g filter={k.puff}><circle cx="24" cy="24" r="7" fill={k.light} /></g>
      <circle cx="24" cy="24" r="2.6" fill={k.p.mid} />
      {k.gloss('M10.5 16c2.2-3.6 5.8-6 10-6.8.9-.1 1.2 1.1.3 1.4-3.6 1.2-6.4 3.2-8.4 6.2-.6.9-2.4.3-1.9-.8z', 0.75)}
    </g>
  );
};

/** Verify identity: an ID card tipped forward, photo and lines on it. */
D.IdCard = (k) => (
  <g transform="rotate(-8 24 24)">
    {k.solid((f) => <rect x="3" y="9" width="40" height="30" rx="5" fill={f} />, {
      dx: 1.6, dy: 2.4, face: k.paper, near: k.paperSide, far: mix(k.paperSide, BLACK, 0.2),
    })}
    <path d="M8 9h30a5 5 0 0 1 5 5v2H3v-2a5 5 0 0 1 5-5z" fill={k.body} />
    <rect x="7.5" y="20" width="12" height="14" rx="3" fill={k.light} />
    <circle cx="13.5" cy="25" r="3" fill={WHITE} />
    <path d="M8.5 33c.6-2.8 2.6-4.2 5-4.2s4.4 1.4 5 4.2z" fill={WHITE} />
    <g fill={k.p.hi}>
      <rect x="23.5" y="21.5" width="15" height="3" rx="1.5" />
      <rect x="23.5" y="27.5" width="10" height="3" rx="1.5" />
    </g>
    <rect x="33" y="31.5" width="6" height="4.4" rx="1" fill={k.gold} />
  </g>
);

/** Chat: a bubble with a reply behind it, lines of text in the front one. */
D.Chat = (k) => (
  <>
    <g transform="rotate(-6 30 28)">
      {k.solid((f) => <path d="M20 14h21a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-8l-7 6v-6h-6a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5z" fill={f} />, {
        dx: -1.6, dy: 2, face: k.light, near: k.tintNear, far: k.tintFar,
      })}
    </g>
    <g transform="rotate(5 17 17)">
      {k.solid((f) => <path d="M7 4h20a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-8l-7 6v-6H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={f} />, { dx: -2, dy: 2.4 })}
      {k.print((c) => (
        <g fill={c}>
          <rect x="8" y="9.5" width="17" height="3" rx="1.5" />
          <rect x="8" y="15.5" width="10" height="3" rx="1.5" />
        </g>
      ))}
    </g>
  </>
);

/** Questions: a round bubble, a question mark standing out of it. */
D.Question = (k) => (
  <>
    {k.solid((f) => <path d="M23 4a18.5 18 0 1 1-9.4 33.6L5 41l2.8-8.2A18.5 18 0 0 1 23 4z" fill={f} />, { dx: 2.2, dy: 2.6, face: k.ball })}
    {k.ext((f) => (
      <g fill={f} stroke={f}>
        <path d="M17.6 17a5.6 5.6 0 1 1 7.8 5.2c-1.4.6-2.4 1.6-2.4 3.4v.8" fill="none" strokeWidth="4.2" strokeLinecap="round" />
        <circle cx="23" cy="32.6" r="2.7" stroke="none" />
      </g>
    ), 0.8, 1.2, k.tintNear, k.tintFar, 4)}
    <path d="M17.6 17a5.6 5.6 0 1 1 7.8 5.2c-1.4.6-2.4 1.6-2.4 3.4v.8" fill="none" stroke={WHITE} strokeWidth="4.2" strokeLinecap="round" />
    <circle cx="23" cy="32.6" r="2.7" fill={WHITE} />
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
    <path d="M41 21l4-3.4v6.4l-4 3.6z" fill={k.glass} stroke={k.glass} strokeWidth="0.8" strokeLinejoin="round" />
    <rect x="31" y="20.5" width="6.4" height="5.4" rx="1.4" fill={k.glass} />
    <ellipse cx="44.2" cy="29.4" rx="0.9" ry="1.4" fill="#FFE27A" />
    {k.print((c) => (
      <g fill={c}>
        <rect x="6" y="18" width="16" height="3.2" rx="1.6" />
        <rect x="6" y="23.5" width="10" height="3.2" rx="1.6" />
      </g>
    ))}
    {[10.5, 34].map((x) => (
      <g key={x}>
        <g filter={k.puff}><circle cx={x} cy="34.5" r="5.6" fill={k.dark} /></g>
        <circle cx={x} cy="34.5" r="2.5" fill={k.metal} />
      </g>
    ))}
  </>
);

/** Notifications: a gold-lit bell swinging, its clapper showing. */
D.Bell = (k) => (
  <>
    <g fill="none" stroke={k.p.hi} strokeWidth="2.2" strokeLinecap="round">
      <path d="M41.5 11.5a10 10 0 0 1 3 7" />
      <path d="M6.5 11.5a10 10 0 0 0-3 7" />
    </g>
    <g transform="rotate(12 24 22)">
      <g filter={k.puff}><circle cx="24" cy="39.6" r="3.8" fill={k.side} /></g>
      <g filter={k.puff}><path d="M24 6c-8 0-12.5 6.5-12.5 14v7c0 3-2 5-5 7.5h35c-3-2.5-5-4.5-5-7.5v-7c0-7.5-4.5-14-12.5-14z" fill={k.cyl} /></g>
      <ellipse cx="24" cy="34.5" rx="17.5" ry="3.4" fill={k.side} />
      <ellipse cx="24" cy="34" rx="16.4" ry="2.4" fill={k.top} />
      <g filter={k.puff}><ellipse cx="24" cy="6" rx="3.2" ry="2.6" fill={k.side} /></g>
      {k.gloss('M15.2 15c.8-3 2.8-5.2 5.4-6.2.8-.3 1.4.8.7 1.3-1.8 1.4-3 3.4-3.4 5.6-.1 1-1.6 1-1.7 0V15z', 0.8)}
      {k.gloss('M14.6 20.4c.6 0 1 .4 1 1v6.4c0 .9-1.6.9-1.8 0-.3-2.1-.3-4.4 0-6.6.1-.5.4-.8.8-.8z', 0.55)}
    </g>
  </>
);

/** A mark drawn as its 3D object. `name` is FlatArt's name for the mark. */
export default function PopArt({ name, size, tone }) {
  const id = `pp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const k = kit(id, rampOf(tone));
  k.id = id;
  const draw = D[name];
  const body = draw ? draw(k) : null;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <filter id={`${id}p`} x="-4" y="-4" width="56" height="56" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feComponentTransfer in="SourceAlpha" result="out">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feGaussianBlur in="out" stdDeviation="1.3" result="soft" />
          <feOffset in="soft" dx="1" dy="1.3" result="litEdge" />
          <feFlood floodColor={WHITE} floodOpacity="0.7" />
          <feComposite in2="litEdge" operator="in" />
          <feComposite in2="SourceAlpha" operator="in" result="lit" />
          <feOffset in="soft" dx="-1.2" dy="-1.6" result="shadeEdge" />
          <feFlood floodColor="#1B1035" floodOpacity="0.26" />
          <feComposite in2="shadeEdge" operator="in" />
          <feComposite in2="SourceAlpha" operator="in" result="shade" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="shade" />
            <feMergeNode in="lit" />
          </feMerge>
        </filter>
        <filter id={`${id}s`} x="-4" y="-4" width="56" height="56" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        {k.defs()}
      </defs>
      {body}
    </svg>
  );
}
