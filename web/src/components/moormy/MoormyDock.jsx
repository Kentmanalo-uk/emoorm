import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretLeft, CaretRight } from '../../lib/icons';
import './MoormyDock.css';

/**
 * Computers, in the Seller Center: Ate Moormy floating where the homepage's
 * chat sits (bottom right), on a round button that opens her chat.
 *
 * She is drawn here as herself, chibi and softly shaded (WavingMoormy), with
 * an arm up, waving, and only the lower half of her green disc crops her: now and
 * then she grows and rises out over the disc's top edge to wave, then
 * settles back. Coming near, she stays out, waves harder and looks the way
 * the pointer is, and a line pops up saying what the button does.
 *
 * "Tuck away" slides her into a small tab on the right edge (her face and
 * an arrow); the tab brings her back. The choice is remembered on this
 * device.
 */

const TUCKED = 'emoorm.moormyTucked';

const readTucked = () => {
  try {
    return localStorage.getItem(TUCKED) === '1';
  } catch {
    return false;
  }
};

const saveTucked = (on) => {
  try {
    if (on) localStorage.setItem(TUCKED, '1');
    else localStorage.removeItem(TUCKED);
  } catch {
    // Private windows and blocked storage: it just isn't remembered.
  }
};

// Her colours (MoormyFace.jsx), each with a lighter and a deeper value so
// she reads as round: the light comes from the top left.
const INK = '#2A1A15';

/**
 * Ate Moormy, chibi: the same ate (her bun, round glasses, pink shirt, the
 * green disc) with a big head on a small body, big shining eyes, rosy
 * cheeks and a little open smile, one arm up, waving. Soft gradients and
 * highlights give her a rounded, almost 3D look. Her disc is 120 across,
 * centred on 60, 60.
 */
function WavingMoormy() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `mmd${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;
  const lin = (part, stops, x1 = '0.2', y1 = '0', x2 = '0.75', y2 = '1') => (
    <linearGradient id={id(part)} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
    </linearGradient>
  );
  const rad = (part, stops, cx = '0.35', cy = '0.3', r = '0.75') => (
    <radialGradient id={id(part)} cx={cx} cy={cy} r={r}>
      {stops.map(([o, c, a = 1]) => <stop key={o} offset={o} stopColor={c} stopOpacity={a} />)}
    </radialGradient>
  );

  return (
    <svg className="mmd-art" viewBox="-14 -30 148 150" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={id('disc')}><circle cx="60" cy="60" r="60" /></clipPath>
        {/* Her crop: the disc below its middle, nothing above it. */}
        <clipPath id={id('pop')}>
          <circle cx="60" cy="60" r="60" />
          <rect x="-14" y="-30" width="148" height="90" />
        </clipPath>
        {rad('discFill', [[0, '#8AF0C8'], [0.55, '#22C58E'], [1, '#059669']], '0.32', '0.25', '0.85')}
        {rad('skin', [[0, '#FFE1C8'], [0.6, '#F2C29C'], [1, '#D99A72']], '0.38', '0.3', '0.8')}
        {rad('hand', [[0, '#FFE1C8'], [1, '#E2AA82']], '0.35', '0.3', '0.8')}
        {lin('hair', [[0, '#5A3D33'], [0.5, '#35231D'], [1, '#1E120E']])}
        {rad('bun', [[0, '#6B4A3E'], [0.6, '#36241D'], [1, '#1E120E']], '0.35', '0.3', '0.8')}
        {lin('shirt', [[0, '#FFC2DF'], [0.45, '#F784BF'], [1, '#E2559E']], '0.1', '0', '0.6', '1')}
        {lin('sleeve', [[0, '#FFB1D4'], [1, '#EC5FA5']], '0', '0', '1', '0')}
        {rad('lens', [[0, '#FFFFFF'], [1, '#E3F1FF']], '0.35', '0.3', '0.8')}
        {rad('blush', [[0, '#FF7FAE', 0.95], [0.55, '#FF8DB5', 0.6], [1, '#FF8DB5', 0]], '0.5', '0.5', '0.5')}
        {rad('shade', [[0, '#9A2F68', 0.35], [1, '#9A2F68', 0]], '0.5', '0.5', '0.5')}
      </defs>

      {/* The disc: glossy green, lit from the top left. */}
      <g clipPath={url('disc')}>
        <circle cx="60" cy="60" r="60" fill={url('discFill')} />
        <ellipse cx="34" cy="26" rx="26" ry="14" fill="#fff" opacity="0.22" transform="rotate(-35 34 26)" />
      </g>

      <g clipPath={url('pop')}>
        <g className="mmd-figure">
          {/* Her body: small, round shoulders in her pink shirt. */}
          <path d="M60 88c17 0 30 9 32 32H28c2-23 15-32 32-32z" fill={url('shirt')} />
          <path d="M48 89c4 6 20 6 24 0-3 7-21 7-24 0z" fill="#fff" opacity="0.55" />
          <ellipse cx="60" cy="90" rx="17" ry="6" fill={url('shade')} />

          {/* The waving arm: a short round sleeve and a little hand. */}
          <g className="mmd-arm">
            <path d="M82 102c5-7 8-15 9-24" fill="none" stroke={url('sleeve')} strokeWidth="13" strokeLinecap="round" />
            <circle cx="92" cy="70" r="8.5" fill={url('hand')} />
            <ellipse cx="88.5" cy="66" rx="3" ry="2" fill="#fff" opacity="0.5" transform="rotate(-30 88.5 66)" />
          </g>

          {/* Hair behind her head, and the bun, glossy. */}
          <ellipse cx="60" cy="54" rx="32" ry="31" fill={url('hair')} />
          <circle cx="60" cy="19" r="13" fill={url('bun')} />
          <ellipse cx="55" cy="13" rx="5" ry="3" fill="#fff" opacity="0.3" transform="rotate(-25 55 13)" />

          {/* Her face: big and round. */}
          <ellipse cx="60" cy="60" rx="27" ry="25" fill={url('skin')} />
          <ellipse cx="47" cy="46" rx="9" ry="5" fill="#fff" opacity="0.28" transform="rotate(-25 47 46)" />

          {/* The fringe, parted, with a shine across it. */}
          <path d="M33 56c0-17 12-28 27-28s27 11 27 28c-5-10-14-15-25-16-9 3-19 8-29 16z" fill={url('hair')} />
          <path d="M42 39c5-5 11-7 18-7-7 3-12 7-14 12-2-1-4-3-4-5z" fill="#fff" opacity="0.25" />

          {/* Round glasses over big shining eyes that follow the pointer. */}
          <circle cx="48" cy="61" r="11" fill={url('lens')} />
          <circle cx="72" cy="61" r="11" fill={url('lens')} />
          <g className="mmd-eyes">
            <ellipse cx="48" cy="62" rx="5" ry="5.6" fill={INK} />
            <ellipse cx="72" cy="62" rx="5" ry="5.6" fill={INK} />
            <circle cx="46.3" cy="59.8" r="2" fill="#fff" />
            <circle cx="70.3" cy="59.8" r="2" fill="#fff" />
            <circle cx="49.6" cy="64.4" r="0.9" fill="#fff" />
            <circle cx="73.6" cy="64.4" r="0.9" fill="#fff" />
          </g>
          <g fill="none" stroke="#3A2620" strokeWidth="2.6" strokeLinecap="round">
            <circle cx="48" cy="61" r="11" />
            <circle cx="72" cy="61" r="11" />
            <path d="M59 60h2" />
          </g>
          <path d="M41 55a9 9 0 0 1 6-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
          <path d="M65 55a9 9 0 0 1 6-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />

          {/* Rosy cheeks, and a little open smile. */}
          <ellipse cx="38" cy="73" rx="7.5" ry="5" fill={url('blush')} />
          <ellipse cx="82" cy="73" rx="7.5" ry="5" fill={url('blush')} />
          <path d="M54.5 75c1.6 5 9.4 5 11 0z" fill={INK} />
          <path d="M57 78c1.5 1.6 4.5 1.6 6 0-1-1.3-5-1.3-6 0z" fill="#FF7FA8" />
        </g>
      </g>
    </svg>
  );
}

export default function MoormyDock({ to = '/seller/assistant' }) {
  const [tucked, setTucked] = useState(readTucked);
  // Where the pointer is across the dock, -1 to 1 each way: she looks there.
  const [look, setLook] = useState({ x: 0, y: 0 });

  const tuck = (on) => {
    setTucked(on);
    saveTucked(on);
  };

  const follow = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 2 - 1;
    const y = ((e.clientY - box.top) / box.height) * 2 - 1;
    setLook({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  };

  if (tucked) {
    return (
      <button type="button" className="mmd-tab" onClick={() => tuck(false)} aria-label="Show Ate Moormy">
        <CaretLeft size={14} weight="bold" />
        <span className="mmd-tab-face"><WavingMoormy /></span>
      </button>
    );
  }

  return (
    <div
      className="mmd"
      style={{ '--look-x': look.x.toFixed(2), '--look-y': look.y.toFixed(2) }}
      onPointerMove={follow}
      onPointerLeave={() => setLook({ x: 0, y: 0 })}
    >
      <span className="mmd-say" aria-hidden="true">
        Need a hand? <b>Ask Ate Moormy</b>
      </span>
      <Link to={to} className="mmd-btn" aria-label="Ask Ate Moormy, your AI assistant">
        <WavingMoormy />
      </Link>
      <button type="button" className="mmd-tuck" onClick={() => tuck(true)} aria-label="Tuck Ate Moormy away" title="Tuck away">
        <CaretRight size={12} weight="bold" />
      </button>
    </div>
  );
}
