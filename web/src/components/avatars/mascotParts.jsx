import { useId } from 'react';

/*
 * The mascot's drawing (graphics/mascot.jpg; the app's is
 * mobile/src/components/avatars/MascotRig.js), in pieces, so the waving
 * mascot (Mascot.jsx), Moormy's face (moormy/MoormyFace.jsx) and the Seller
 * Center's Moormy (moormy/MoormyDock.jsx) are all the same fellow. Every
 * piece is in the rig's 120 x 150 units.
 *
 *   const m = useMascotPaint();
 *   <svg viewBox="0 0 120 150">{m.defs}{m.head}{m.eyes}{m.mouth}{m.cap}</svg>
 */

export const MASCOT_INK = '#3A1230';
// The cap a little smaller than the head's width doubled, scaled round its
// brim; the face is drawn for a larger head and scaled onto this one.
export const CAP_SIZE = 'translate(60 52) scale(0.84) translate(-60 -52)';
export const FACE = 'translate(60 63) scale(0.72) translate(-60 -76.5)';
export const SHOULDER = { R: [80, 91], L: [40, 91] };
export const ELBOW = 16;
const HAND = 34;
const SPOTS = [[40, 18, 6.5], [63, 11, 4.5], [83, 21, 7], [26, 34, 5], [96, 36, 4.5], [52, 29, 3.6], [74, 38, 4.2], [36, 46, 2.8]];

const stops = (list) => list.map(([o, color, a = 1]) => <stop key={`${o}${color}`} offset={o} stopColor={color} stopOpacity={a} />);

/** The gradients (once per drawing: ids are unique per instance) and every piece. */
export function useMascotPaint(prefix = 'ms') {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `${prefix}${uid}${part}`;
  const u = (part) => `url(#${id(part)})`;
  const ball = (part, list, cx = '0.36', cy = '0.3', r = '0.78') => (
    <radialGradient id={id(part)} cx={cx} cy={cy} r={r} fx={cx} fy={cy}>{stops(list)}</radialGradient>
  );

  const defs = (
    <defs>
      {ball('head', [[0, '#FFE6F3'], [0.45, '#FFC2E1'], [0.8, '#FF9CCF'], [1, '#F77DBC']])}
      <linearGradient id={id('limb')} x1="0" y1="0" x2="1" y2="0">{stops([[0, '#F98BC3'], [0.5, '#FFCBE6'], [1, '#F98BC3']])}</linearGradient>
      <radialGradient id={id('shine')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#FFFFFF', 0.85], [1, '#FFFFFF', 0]])}</radialGradient>
      <radialGradient id={id('blush')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#FF7FBE', 0.9], [1, '#FF7FBE', 0]])}</radialGradient>
      {ball('spot', [[0, '#FFFFFF'], [0.7, '#FAFFF6'], [1, '#DDF6CF']], '0.4', '0.35', '0.7')}
      {ball('cap', [[0, '#F2FFB0'], [0.3, '#DCFF62'], [0.62, '#8DF22E'], [1, '#4DC41B']], '0.34', '0.22', '0.85')}
      <linearGradient id={id('band')} x1="0.2" y1="0" x2="0.7" y2="1">{stops([[0, '#69D922'], [1, '#3DAA17']])}</linearGradient>
      <linearGradient id={id('brim')} x1="0" y1="0" x2="0" y2="1">{stops([[0, '#3DAF4C'], [1, '#1C7A47']])}</linearGradient>
      {ball('shirt', [[0, '#DAFF96'], [0.4, '#B4FF55'], [0.75, '#62DA20'], [1, '#3EB515']])}
      {ball('white', [[0, '#FFFFFF'], [0.55, '#F4F5FC'], [1, '#D6DBF2']])}
      <clipPath id={id('dome')}><path d="M15 49C15 22 35 5 60 5S105 22 105 49C105 53 95 55 60 55S15 53 15 49Z" /></clipPath>
    </defs>
  );

  const shoe = (x, y) => (
    <g>
      <rect x={x - 10} y={y} width="20" height="10" rx="5" fill={u('white')} />
      <rect x={x - 10} y={y + 7.4} width="20" height="3" rx="1.5" fill="#CBD0EA" />
      <path d={`M${x - 3.2} ${y + 2.6}h6.4M${x - 3.2} ${y + 4.6}h6.4`} stroke="#CDD2EA" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx={x - 4.5} cy={y + 3.5} rx="2.6" ry="1.6" fill="#fff" />
    </g>
  );

  // Legs hanging over an edge (sitting).
  const legL = <g><rect x="45" y="116" width="9" height="19" rx="4.5" fill={u('limb')} />{shoe(49.5, 133)}</g>;
  const legR = <g><rect x="66" y="116" width="9" height="19" rx="4.5" fill={u('limb')} />{shoe(70.5, 133)}</g>;

  // An arm: the lime sleeve and pink upper arm (turning at the shoulder),
  // then the forearm and white glove (turning at the elbow).
  const upperArm = (side) => {
    const [sx, sy] = SHOULDER[side];
    const ey = sy - ELBOW;
    return (
      <g>
        <rect x={sx - 4.5} y={ey - 3} width="9" height="14" rx="4.5" fill={u('limb')} />
        <path d={`M${sx - 6.5} ${sy + 5}L${sx - 8} ${sy - 11.5}Q${sx} ${sy - 13.5} ${sx + 8} ${sy - 11.5}L${sx + 6.5} ${sy + 5}Z`} fill={u('shirt')} />
        <path d={`M${sx - 8} ${sy - 10.5}Q${sx} ${sy - 12.5} ${sx + 8} ${sy - 10.5}`} stroke="#3EB515" strokeWidth="2.4" fill="none" opacity="0.5" />
        <ellipse cx={sx - 3} cy={sy - 4} rx="2" ry="4" fill="#fff" opacity="0.25" />
      </g>
    );
  };
  const forearm = (side) => {
    const [sx, sy] = SHOULDER[side];
    const ey = sy - ELBOW;
    const thumb = side === 'R' ? 5.5 : -5.5;
    return (
      <g>
        <circle cx={sx} cy={ey} r="4.5" fill={u('limb')} />
        <rect x={sx - 4.5} y={sy - 30} width="9" height={30 - ELBOW} rx="4.5" fill={u('limb')} />
        <rect x={sx - 6.5} y={sy - 30} width="13" height="5" rx="2.5" fill={u('white')} />
        <circle cx={sx + thumb} cy={sy - HAND + 3.5} r="3.4" fill={u('white')} />
        <circle cx={sx} cy={sy - HAND} r="8" fill={u('white')} />
        <path d={`M${sx - 2.6} ${sy - HAND - 7}v3.2M${sx + 1.4} ${sy - HAND - 7.3}v3.2`} stroke="#DDE1F2" strokeWidth="1.1" strokeLinecap="round" />
        <ellipse cx={sx - 2.5} cy={sy - HAND - 2.5} rx="4.5" ry="3.5" fill={u('shine')} />
      </g>
    );
  };

  // The polo shirt and white shorts.
  const body = (
    <g>
      <path d="M40 107H80V117C80 119.5 78.5 121 76 121H63.5L60 115 56.5 121H44C41.5 121 40 119.5 40 117Z" fill={u('white')} />
      <path d="M60 109V114.5" stroke="#D5D9EE" strokeWidth="1.2" />
      <path d="M47 83C40 83 37 86 36.4 92L35.8 107C35.6 111.5 38 113.6 42 113.6H78C82 113.6 84.4 111.5 84.2 107L83.6 92C83 86 80 83 73 83Z" fill={u('shirt')} />
      <ellipse cx="60" cy="92" rx="15" ry="4" fill="#3EB515" opacity="0.18" />
      <path d="M36 110.6Q60 113.6 84 110.6" stroke="#3EB515" strokeWidth="1.6" fill="none" opacity="0.45" />
      <ellipse cx="45" cy="97" rx="8" ry="6" fill={u('shine')} />
      <path d="M53 83L60 90L67 83Z" fill="#3EA716" opacity="0.55" />
      <rect x="58.8" y="89" width="2.4" height="9" rx="1.2" fill="#3EB515" opacity="0.45" />
      <circle cx="60" cy="94.5" r="1" fill="#E9FFD6" />
      <path d="M60 89.5L46 81.5Q43.5 85 45.5 90L53 95Z" fill="#CFFF86" />
      <path d="M60 89.5L74 81.5Q76.5 85 74.5 90L67 95Z" fill="#CFFF86" />
      <path d="M48.5 84.5L55 88.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </g>
  );

  const head = (
    <g>
      <rect x="37" y="40" width="46" height="46" rx="21" fill={u('head')} />
      <ellipse cx="48" cy="54" rx="11" ry="7.5" fill={u('shine')} transform="rotate(-18 48 54)" />
      <ellipse cx="60" cy="84" rx="15" ry="2.5" fill="#E0559C" opacity="0.14" />
      <ellipse cx="45" cy="72" rx="6.5" ry="4" fill={u('blush')} />
      <ellipse cx="75" cy="72" rx="6.5" ry="4" fill={u('blush')} />
      <ellipse cx="60" cy="52" rx="22" ry="4" fill="#D24A90" opacity="0.16" />
    </g>
  );

  const eyes = (
    <g transform={FACE}>
      {[52, 68].map((x) => (
        <g key={x}>
          <rect x={x - 4.5} y="69" width="9" height="15" rx="4.5" fill={MASCOT_INK} />
          <circle cx={x + 1.5} cy="73" r="2" fill="#fff" />
        </g>
      ))}
    </g>
  );

  const mouth = (
    <g transform={FACE}>
      <path d="M52.5 88.5h15c0 6.2-3.6 9.5-7.5 9.5s-7.5-3.3-7.5-9.5z" fill={MASCOT_INK} />
      <path d="M55.6 95.2c1.3-2.2 7.5-2.2 8.8 0-1.2 1.6-2.8 2.3-4.4 2.3s-3.2-.7-4.4-2.3z" fill="#FF6E93" />
    </g>
  );

  const cap = (
    <g transform={CAP_SIZE}>
      <ellipse cx="60" cy="50" rx="43" ry="8.5" fill={u('brim')} />
      <path d="M15 49C15 22 35 5 60 5S105 22 105 49C105 53 95 55 60 55S15 53 15 49Z" fill={u('cap')} />
      <g clipPath={u('dome')}>
        <path d="M10 40C24 31 38 44 60 36S94 25 110 34V46C96 38 82 48 60 46S24 52 10 52Z" fill={u('band')} opacity="0.45" />
        <ellipse cx="60" cy="55" rx="48" ry="7" fill="#2F9E2A" opacity="0.25" />
      </g>
      {SPOTS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={u('spot')} />)}
      <ellipse cx="42" cy="17" rx="20" ry="9" fill={u('shine')} transform="rotate(-22 42 17)" />
      <ellipse cx="34" cy="21" rx="3" ry="1.8" fill="#fff" opacity="0.85" transform="rotate(-30 34 21)" />
      <path d="M20 47.5Q60 56.5 100 47.5" stroke="#E8FF9A" strokeWidth="2.2" fill="none" opacity="0.35" />
    </g>
  );

  return {
    defs, u, legL, legR, upperArm, forearm, body, head, eyes, mouth, cap,
  };
}
