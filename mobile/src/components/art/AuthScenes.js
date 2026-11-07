import { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, FeColorMatrix, FeComposite, FeFlood, FeGaussianBlur, FeMerge, FeMergeNode, FeOffset, Filter,
  G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

/*
 * The 3D scenes of the Log in / Sign up sheets' first step (the website's
 * web/src/components/art/PopArt.jsx, D.AuthSignIn / AuthSignUp / AuthSeller
 * / AuthSell, drawn in the emerald tone as Login.jsx and Register.jsx ask).
 * One small scene per door, all the same way: a faint pink-to-mint disc, one
 * main object with a soft shadow under it, one pink or gold accent, a sparkle.
 *
 *   signIn   a phone held at an angle, a product on its screen, a pink
 *            heart popping off it
 *   signUp   a green gift box, its pink-ribboned lid lifting off, a warm
 *            glow and confetti coming out
 *   seller   a little shop with a pink awning and an Open sign, a stack of
 *            gold coins in front
 *   sell     a green megaphone with a pink bell, calling out
 *
 * Lit as PopArt's marks: light from the top left, every face softened by the
 * "puff" filter (a light inner edge at the top left, a shade at the bottom
 * right). The website's feComponentTransfer (not drawn by react-native-svg)
 * is the same alpha flip done with feColorMatrix here. Every colour is a
 * fixed one, the same in light and dark mode (as on the website).
 */

/* Emerald's ramp (PopArt RAMPS['#059669']): lit, the colour, its neighbour, shade. */
const P = {
  hi: '#8FEAC2', mid: '#12B47E', lo: '#0A8C86', side: '#076B68',
};

const WHITE = '#FFFFFF';
const BLACK = '#000000';
const n2 = (v) => Number(v.toFixed(2));

/** a mixed t of the way to b, both #RRGGBB (PopArt's mix). */
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** What a scene paints with (PopArt's kit, the parts these scenes use). */
function kit(id) {
  const defs = [];
  let count = 0;
  const stopsOf = (stops) => stops.map(([o, c, a], i) => (
    <Stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />
  ));
  const lin = (stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) => {
    count += 1;
    const gid = `${id}g${count}`;
    defs.push(<LinearGradient key={gid} id={gid} x1={x1} y1={y1} x2={x2} y2={y2}>{stopsOf(stops)}</LinearGradient>);
    return `url(#${gid})`;
  };
  const rad = (stops, cx = 0.35, cy = 0.3, r = 0.8) => {
    count += 1;
    const gid = `${id}g${count}`;
    defs.push(<RadialGradient key={gid} id={gid} cx={cx} cy={cy} r={r} fx={cx} fy={cy}>{stopsOf(stops)}</RadialGradient>);
    return `url(#${gid})`;
  };

  const sideFar = mix(P.side, BLACK, 0.32);
  const k = {
    p: P,
    lin,
    rad,
    puff: `url(#${id}p)`,
    soft: `url(#${id}s)`,
    body: lin([[0, P.hi], [0.5, P.mid], [1, P.lo]]),
    light: lin([[0, mix(P.hi, WHITE, 0.45)], [0.6, P.hi], [1, mix(P.hi, P.mid, 0.45)]]),
    top: lin([[0, mix(P.hi, WHITE, 0.55)], [1, P.hi]]),
    side: lin([[0, P.side], [1, sideFar]]),
    cone: lin([[0, P.hi], [0.5, P.mid], [1, P.lo]], 0, 0, 0, 1),
    ball: rad([[0, mix(P.hi, WHITE, 0.5)], [0.45, P.mid], [1, P.lo]]),
    paper: lin([[0, WHITE], [1, mix(WHITE, P.hi, 0.4)]]),
    glass: lin([[0, '#F5FCFF'], [1, '#9DCDF5']]),
    gold: lin([[0, '#FFF1A6'], [0.45, '#FFC83D'], [1, '#F39A1B']]),
    goldSide: '#D9770F',
    near: P.side,
    far: sideFar,
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

  /** A solid: its body, then its face, softened. */
  k.solid = (shape, {
    dx = 1.8, dy = 2.2, face = k.body, near = k.near, far = k.far, steps = 8,
  } = {}) => (
    <>
      {k.ext(shape, dx, dy, near, far, steps)}
      <G filter={k.puff}>{shape(face)}</G>
    </>
  );

  /** A box seen from above and to one side: front, top (dy < 0) and the side towards dx. */
  k.cube = ({
    x, y, w, h, dx, dy, front = k.body, top = k.top, side = k.side, r = 1.4,
  }) => {
    const sx = dx > 0 ? x + w : x;
    const tp = `M${x} ${y}L${x + w} ${y}L${x + w + dx} ${y + dy}L${x + dx} ${y + dy}Z`;
    const sp = `M${sx} ${y}L${sx + dx} ${y + dy}L${sx + dx} ${y + h + dy}L${sx} ${y + h}Z`;
    return (
      <>
        <Path d={sp} fill={side} stroke={side} strokeWidth={r} strokeLinejoin="round" />
        <G filter={k.puff}><Path d={tp} fill={top} stroke={top} strokeWidth={r} strokeLinejoin="round" /></G>
        <G filter={k.puff}><Rect x={x} y={y} width={w} height={h} rx={r} fill={front} /></G>
        <Path d={`M${x + r} ${y + 0.5}H${x + w - r}`} stroke={WHITE} strokeOpacity={0.7} strokeWidth={0.8} strokeLinecap="round" />
      </>
    );
  };

  /** A highlight where a curved face catches the light. */
  k.gloss = (d, o = 0.6) => <Path d={d} fill={WHITE} opacity={o} filter={k.soft} />;

  k.defs = () => defs;
  return k;
}

/* ── The scenes ──────────────────────────────────────────────────────── */

const PINK_FACE = [[0, '#FFC6E4'], [0.5, '#F55DB3'], [1, '#D4409E']];
const PINK_SIDE = '#B02C82';
const HEART = 'M24 43S3.5 30.5 3.5 17.6A11 11 0 0 1 24 11a11 11 0 0 1 20.5 6.6C44.5 30.5 24 43 24 43z';

const sparkPath = (cx, cy, r) => {
  const c = r * 0.16;
  return `M${cx} ${cy - r}Q${cx + c} ${cy - c} ${cx + r} ${cy}Q${cx + c} ${cy + c} ${cx} ${cy + r}`
    + `Q${cx - c} ${cy + c} ${cx - r} ${cy}Q${cx - c} ${cy - c} ${cx} ${cy - r}Z`;
};

/** What every scene stands in: the disc, the shadow under the object. */
const stage = (k, { shadowX = 24, shadowW = 13 } = {}) => (
  <>
    <Circle cx="24" cy="24.5" r="20" fill={k.lin([[0, '#FDEEF6'], [1, '#E4F8EF']], 0, 0, 1, 1)} />
    <Ellipse cx={shadowX} cy="43.6" rx={shadowW} ry="1.9" fill="#0E3B2C" opacity={0.13} filter={k.soft} />
  </>
);

const goldSpark = (k, cx, cy, r) => k.solid((f) => <Path d={sparkPath(cx, cy, r)} fill={f} />, {
  dx: 0.5, dy: 0.7, face: k.gold, near: k.goldSide, far: k.goldSide, steps: 3,
});

const SCENE = 'translate(24 24) scale(0.94) translate(-24 -24)';

/** Sign in: a phone held at an angle, a product on it, a heart popping off. */
const signIn = (k) => {
  const pink = k.lin(PINK_FACE);
  return (
    <G transform={SCENE}>
      {stage(k, { shadowX: 23, shadowW: 11 })}
      <G transform="rotate(-9 24 24)">
        {k.solid((f) => <Rect x="13" y="4" width="22" height="39" rx="5.6" fill={f} />, { dx: -2.4, dy: 1.8 })}
        <Rect x="15.3" y="7.4" width="17.4" height="32.2" rx="3.4" fill={k.paper} />
        <Rect x="21" y="5.3" width="6" height="1.3" rx="0.65" fill={k.p.side} />
        {/* The product: a glossy fruit on a soft card. */}
        <Rect x="17.4" y="10" width="13.2" height="11" rx="2.4" fill={k.lin([[0, '#FDE7F2'], [1, '#D9F7E8']])} />
        <Ellipse cx="24" cy="19.4" rx="3.6" ry="0.7" fill="#0E3B2C" opacity={0.12} />
        <G filter={k.puff}><Circle cx="24" cy="15.8" r="3.5" fill={k.ball} /></G>
        <Path d="M24.2 12.4c.6-1.6 2-2.3 3.4-2.1-.4 1.4-1.6 2.4-3.4 2.1z" fill={k.p.lo} />
        <Ellipse cx="22.8" cy="14.6" rx="1" ry="0.7" fill="#fff" opacity={0.8} />
        <Rect x="17.4" y="23.2" width="8.6" height="1.8" rx="0.9" fill="#D5DBE3" />
        <Rect x="17.4" y="26.2" width="5.6" height="1.8" rx="0.9" fill="#E3E8EE" />
        <Rect x="26.4" y="25.4" width="4.2" height="2.8" rx="1.4" fill={pink} />
        <Rect x="17.4" y="30.6" width="13.2" height="4.6" rx="2.3" fill={k.body} />
        <Rect x="21.4" y="32.3" width="5.2" height="1.2" rx="0.6" fill="#fff" />
        {/* Glass: a soft glare across the screen, light on the frame. */}
        <Path d="M15.3 22L32.7 11v6L15.3 28z" fill="#fff" opacity={0.18} />
        {k.gloss('M14.4 9.6c0-2.4 1.3-4 3.6-4.4.8-.1 1 1 .3 1.3-1.4.6-2.1 1.7-2.2 3.3V33c0 1-1.7 1-1.7 0z', 0.6)}
      </G>
      <G transform="translate(31 3.5) rotate(14 6.5 6.5) scale(0.28)">
        {k.solid((f) => <Path d={HEART} fill={f} />, {
          dx: 2.6, dy: 3, face: pink, near: PINK_SIDE, far: mix(PINK_SIDE, BLACK, 0.3),
        })}
        <Path d="M9.6 13.6c2.4-2.2 5.6-2.5 8-1.4.9.4.6 1.7-.4 1.7-2.6 0-4.8 1.1-6.3 3.2-1.2 1.6-3.5-1.3-1.3-3.5z" fill="#fff" opacity={0.85} />
      </G>
      {goldSpark(k, 8.5, 12, 3)}
      <Circle cx="41" cy="33" r="1.1" fill="#6EE7B7" />
    </G>
  );
};

/** Sign up: a gift box, its lid lifting off, a glow and confetti coming out. */
const signUp = (k) => {
  const pink = k.lin(PINK_FACE);
  const pinkTop = k.lin([[0, '#FFD6EB'], [1, '#F27DC0']]);
  const glow = k.rad([[0, '#FFF6CF', 0.95], [0.6, '#FFE9A8', 0.45], [1, '#FFE9A8', 0]], 0.5, 0.5, 0.5);
  return (
    <G transform={SCENE}>
      {stage(k, { shadowX: 25, shadowW: 14 })}
      {/* The box. */}
      {k.cube({
        x: 11, y: 26, w: 20, h: 15.5, dx: 7, dy: -5.5, r: 1.8,
      })}
      <Rect x="19" y="26" width="4" height="15.5" fill={pink} />
      <Path d="M19 26h4l7-5.5h-4z" fill={pinkTop} />
      {/* Light rising out of it. */}
      <Ellipse cx="25" cy="21.5" rx="11" ry="4.5" fill={glow} />
      {/* The lid, lifted and tipped, its bow on top. */}
      <G transform="translate(0 -5.5) rotate(-10 22 18)">
        {k.cube({
          x: 9, y: 16, w: 24, h: 5.5, dx: 7, dy: -5.5, front: k.light, side: k.body, r: 1.6,
        })}
        <Rect x="19" y="16" width="4" height="5.5" fill={pink} />
        <Path d="M19 16h4l7-5.5h-4z" fill={pinkTop} />
        <G filter={k.puff}>
          <Ellipse cx="21.8" cy="11.2" rx="3.8" ry="2.4" transform="rotate(-24 21.8 11.2)" fill={pink} />
          <Ellipse cx="29" cy="10.2" rx="3.8" ry="2.4" transform="rotate(20 29 10.2)" fill={pink} />
          <Circle cx="25.4" cy="12" r="1.8" fill={pink} />
        </G>
      </G>
      {/* Confetti. */}
      <Rect x="7.5" y="19" width="2.6" height="1.2" rx="0.5" fill="#F472B6" transform="rotate(32 8.8 19.6)" />
      <Rect x="37.5" y="23" width="2.6" height="1.2" rx="0.5" fill="#34D399" transform="rotate(-28 38.8 23.6)" />
      <Circle cx="35.5" cy="17" r="0.9" fill="#FBBF24" />
      <Circle cx="12.5" cy="24" r="0.8" fill="#34D399" />
      {goldSpark(k, 39.5, 8, 3)}
      <Path d={sparkPath(7.5, 9.5, 2.2)} fill={pink} />
    </G>
  );
};

/** Seller Login: a little shop, open, a stack of gold coins in front. */
const seller = (k) => {
  const pink = k.lin(PINK_FACE);
  const coin = (cy) => (
    <G key={cy}>
      <Ellipse cx="37" cy={cy + 1.4} rx="4.6" ry="1.7" fill={k.goldSide} />
      <Rect x="32.4" y={cy} width="9.2" height="1.4" fill={k.goldSide} />
      <Ellipse cx="37" cy={cy} rx="4.6" ry="1.7" fill={k.gold} />
      <Ellipse cx="37" cy={cy} rx="2.9" ry="0.95" fill="none" stroke="#FFF3C4" strokeWidth={0.5} />
    </G>
  );
  return (
    <G transform={SCENE}>
      {stage(k, { shadowX: 25, shadowW: 15 })}
      <G transform="rotate(-4 22 28)">
        {k.cube({
          x: 8, y: 22, w: 23, h: 19.5, dx: 6, dy: -4.5, r: 1.8,
        })}
        <Path d="M6 15.5H33L39 11H12z" fill={pink} stroke={pink} strokeWidth={1} strokeLinejoin="round" />
        <Path d="M33 15.5l6-4.5v5.8l-6 5.4z" fill={PINK_SIDE} />
        <G filter={k.puff}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Path
              key={i}
              d={`M${n2(6 + i * (27 / 5))} 15.5h${n2(27 / 5)}v4.2a${n2(27 / 10)} ${n2(27 / 10)} 0 0 1-${n2(27 / 5)} 0z`}
              fill={i % 2 ? WHITE : pink}
            />
          ))}
        </G>
        <Rect x="11" y="28" width="7.4" height="13.5" rx="1.4" fill={k.glass} />
        <Circle cx="16.6" cy="35.2" r="0.7" fill={k.p.side} />
        <Rect x="21" y="27.6" width="7.6" height="7" rx="1.4" fill={k.glass} />
        <Path d="M22.2 33.4l4.4-4.4" stroke="#fff" strokeOpacity={0.8} strokeWidth={0.9} strokeLinecap="round" />
        {/* The Open sign in the window. */}
        <Rect x="22.6" y="30.6" width="4.6" height="2.4" rx="0.7" fill={pink} />
        <Rect x="23.6" y="31.5" width="2.6" height="0.6" rx="0.3" fill="#fff" />
      </G>
      {[40, 37.9, 35.8].map(coin)}
      {goldSpark(k, 8.5, 9, 3)}
      <Circle cx="42" cy="22" r="1" fill="#F9A8D4" />
    </G>
  );
};

/** Sign up to sell: a megaphone, calling out. */
const sell = (k) => {
  const pink = k.lin(PINK_FACE);
  return (
    <G transform={SCENE}>
      {stage(k, { shadowX: 22, shadowW: 13 })}
      <G transform="rotate(-16 24 26)">
        <G filter={k.puff}><Rect x="15" y="29" width="5" height="11" rx="2.5" fill={k.side} transform="rotate(12 17.5 29)" /></G>
        <G filter={k.puff}><Rect x="5" y="18" width="9" height="13" rx="4.4" fill={pink} /></G>
        <G filter={k.puff}><Path d="M12 19.2L34 9v30L12 29.8z" fill={k.cone} stroke={k.cone} strokeWidth={1.4} strokeLinejoin="round" /></G>
        <Path d="M14 20.1l18-8.3" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.2} strokeLinecap="round" />
        <Rect x="18" y="22.6" width="7" height="2.6" rx="1.3" fill="#fff" opacity={0.9} transform="rotate(-6 21.5 24)" />
        <G filter={k.puff}><Ellipse cx="34.6" cy="24" rx="5.4" ry="15.4" fill={pink} /></G>
        <Ellipse cx="35.4" cy="24.4" rx="3.6" ry="12.6" fill={k.lin([[0, '#0A6B52'], [1, '#063F31']], 0, 0, 1, 0)} />
      </G>
      <G fill="none" stroke="#F472B6" strokeWidth={2} strokeLinecap="round">
        <Path d="M38.6 9.2a8 8 0 0 1 2.4 6" />
        <Path d="M41.4 6.2a12 12 0 0 1 3.2 9.2" opacity={0.7} />
      </G>
      {goldSpark(k, 9, 10, 3)}
      <Circle cx="41" cy="31" r="1.1" fill="#6EE7B7" />
    </G>
  );
};

const SCENES = {
  signIn, signUp, seller, sell,
};

/**
 * One of the four doors' scenes, `size` px square.
 * name: 'signIn' | 'signUp' | 'seller' | 'sell'
 */
export default function AuthScene({ name, size = 170, style }) {
  const id = `as${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const k = kit(id);
  const draw = SCENES[name] || SCENES.signIn;
  const body = draw(k);
  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Defs>
          {/* The puff: a light inner edge at the top left, a soft shade at the bottom right. */}
          <Filter id={`${id}p`} x="-4" y="-4" width="56" height="56" filterUnits="userSpaceOnUse">
            {/* Outside the shape: the website's feFuncA table "1 0". */}
            <FeColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 1" result="out" />
            <FeGaussianBlur in="out" stdDeviation="1.3" result="soft" />
            <FeOffset in="soft" dx="1" dy="1.3" result="litEdge" />
            <FeFlood floodColor={WHITE} floodOpacity="0.7" result="litFlood" />
            <FeComposite in="litFlood" in2="litEdge" operator="in" result="litIn" />
            <FeComposite in="litIn" in2="SourceAlpha" operator="in" result="lit" />
            <FeOffset in="soft" dx="-1.2" dy="-1.6" result="shadeEdge" />
            <FeFlood floodColor="#1B1035" floodOpacity="0.26" result="shadeFlood" />
            <FeComposite in="shadeFlood" in2="shadeEdge" operator="in" result="shadeIn" />
            <FeComposite in="shadeIn" in2="SourceAlpha" operator="in" result="shade" />
            <FeMerge>
              <FeMergeNode in="SourceGraphic" />
              <FeMergeNode in="shade" />
              <FeMergeNode in="lit" />
            </FeMerge>
          </Filter>
          <Filter id={`${id}s`} x="-4" y="-4" width="56" height="56" filterUnits="userSpaceOnUse">
            <FeGaussianBlur stdDeviation="0.6" />
          </Filter>
          {k.defs()}
        </Defs>
        {body}
      </Svg>
    </View>
  );
}
