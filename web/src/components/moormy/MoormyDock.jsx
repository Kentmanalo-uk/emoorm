import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretLeft, CaretRight } from '../../lib/icons';
import { useMascotPaint } from '../avatars/mascotParts';
import './MoormyDock.css';

/**
 * Computers, in the Seller Center: Moormy, the mascot, floating where the
 * homepage's chat sits (bottom right), on a round button that opens the
 * assistant.
 *
 * Drawn in its green disc with an arm up, waving (WavingMoormy); the lower
 * half of the disc crops it, and now and then it grows and rises out over
 * the disc's top edge to wave, then settles back. Coming near, it stays
 * out, waves harder and looks the way the pointer is, and a line pops up
 * saying what the button does.
 *
 * "Tuck away" slides it into a small tab on the right edge (its face and
 * an arrow); the tab brings it back. The choice is remembered on this
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

/**
 * Moormy, the mascot (avatars/mascotParts.jsx), in its green disc: the lower
 * half of the disc crops it, and now and then it grows and rises out over
 * the disc's top edge to wave (MoormyDock.css). The waving arm turns at its
 * shoulder (80, 102 here), the eyes follow the pointer. The disc is 120
 * across, centred on 60, 60; the mascot stands 11 lower than in its own
 * drawing, so its shirt fills the disc's bottom.
 */
export function WavingMoormy() {
  const m = useMascotPaint('mmd');
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `mmd${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;

  return (
    <svg className="mmd-art" viewBox="-14 -30 148 150" aria-hidden="true" focusable="false">
      {m.defs}
      <defs>
        <clipPath id={id('disc')}><circle cx="60" cy="60" r="60" /></clipPath>
        {/* The crop: the disc below its middle, nothing above it. */}
        <clipPath id={id('pop')}>
          <circle cx="60" cy="60" r="60" />
          <rect x="-14" y="-30" width="148" height="90" />
        </clipPath>
        <radialGradient id={id('discFill')} cx="0.32" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#3FD9A2" />
          <stop offset="0.55" stopColor="#0A8F6A" />
          <stop offset="1" stopColor="#065F46" />
        </radialGradient>
      </defs>

      {/* The disc: glossy green, lit from the top left. */}
      <g clipPath={url('disc')}>
        <circle cx="60" cy="60" r="60" fill={url('discFill')} />
        <ellipse cx="40" cy="24" rx="34" ry="16" fill="#fff" opacity="0.22" transform="rotate(-24 40 24)" />
      </g>

      <g clipPath={url('pop')}>
        <g className="mmd-figure">
          <g transform="translate(0 11)">
            {/* The resting arm behind, the shirt, then the waving arm. */}
            <g transform="rotate(-172 40 91)">
              {m.upperArm('L')}
              <g transform="rotate(6 40 75)">{m.forearm('L')}</g>
            </g>
            {m.body}
            <g className="mmd-arm">
              <g transform="rotate(34 80 91)">
                {m.upperArm('R')}
                <g transform="rotate(-14 80 75)">{m.forearm('R')}</g>
              </g>
            </g>
            {m.head}
            <g className="mmd-eyes">{m.eyes}</g>
            {m.mouth}
            {m.cap}
          </g>
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
      <button type="button" className="mmd-tab" onClick={() => tuck(false)} aria-label="Show Moormy">
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
        Need a hand? <b>Ask Moormy</b>
      </span>
      <Link to={to} className="mmd-btn" aria-label="Ask Moormy, your AI assistant">
        <WavingMoormy />
      </Link>
      <button type="button" className="mmd-tuck" onClick={() => tuck(true)} aria-label="Tuck Moormy away" title="Tuck away">
        <CaretRight size={12} weight="bold" />
      </button>
    </div>
  );
}
