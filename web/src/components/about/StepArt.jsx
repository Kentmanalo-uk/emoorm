import { useId } from 'react';
import { PALETTES } from '../avatars/avatars';

/*
 * Pictures for the steps of buying (About › How buying works), in the
 * avatars' style (components/avatars): a round pastel ground, every fill a
 * two-stop gradient, nothing outlined, one white highlight. Each is the
 * thing its step is about, and that thing moves a little (About.css
 * .ab-art-*), still when motion is reduced.
 *
 *   <StepArt kind="find" size={120} />   find · order · pay · receive
 */

const GROUNDS = { find: 'mushroom', order: 'sky', pay: 'lilac', receive: 'sage' };

export default function StepArt({ kind, size = 120, className = '' }) {
  const pal = PALETTES[GROUNDS[kind] || GROUNDS.find];
  // Own ids per picture, so four on a page do not share fills.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `sa${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;
  const ramp = (part, stops, axis = { x1: '0.2', y1: '0', x2: '0.7', y2: '1' }) => (
    <linearGradient id={id(part)} {...axis}>
      {stops.map((c, i) => <stop key={`${c}-${i}`} offset={String(i / (stops.length - 1))} stopColor={c} />)}
    </linearGradient>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={`ab-art ab-art--${kind} ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={id('clip')}><circle cx="60" cy="60" r="60" /></clipPath>
        {ramp('bg', pal.bg, { x1: '0', y1: '0', x2: '1', y2: '1' })}
        {ramp('gold', ['#FFE68A', '#F7C431', '#E0A200'])}
        {ramp('goldSide', ['#E8AE12', '#C98E00'])}
        {ramp('glass', ['#FFFFFF', '#DDF3FF'])}
        {ramp('ring', ['#9EA7FF', '#5B67E8'])}
        {ramp('fruit', ['#FFC49A', '#FF8A4C'])}
        {ramp('phone', ['#4A4466', '#2B2640'])}
        {ramp('card', ['#FFD9A8', '#F2B06A'])}
        {ramp('go', ['#5FD39A', '#2E9E67'])}
        {ramp('box', ['#FFD9A8', '#F2B06A'])}
        {ramp('boxSide', ['#F4BF83', '#DE9548'])}
        {ramp('lid', ['#FFEBCF', '#F9CF98'])}
        {ramp('heart', ['#FFA6C1', '#F0568A'])}
        <radialGradient id={id('glow')} cx="0.28" cy="0.16" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g clipPath={url('clip')}>
        <rect width="120" height="120" fill={url('bg')} />
        <rect width="120" height="120" fill={url('glow')} />

        {kind === 'find' && (
          <g className="ab-art-sway">
            {/* A magnifying glass over a fruit. */}
            <rect x="73" y="71" width="11" height="34" rx="5.5" fill={url('ring')} transform="rotate(-42 78 88)" />
            <circle cx="54" cy="54" r="27" fill={url('ring')} />
            <circle cx="54" cy="54" r="19.5" fill={url('glass')} />
            <circle cx="55" cy="58" r="9" fill={url('fruit')} />
            <path d="M55 49c1-4 5-6 8-5-1 4-4 6-8 5z" fill="#3BB37A" />
            <ellipse cx="46" cy="45" rx="6" ry="3.4" fill="#fff" opacity="0.9" transform="rotate(-35 46 45)" />
          </g>
        )}
        {kind === 'find' && (
          <path d="M92 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" className="ab-art-twinkle" />
        )}

        {kind === 'order' && (
          <g>
            {/* A phone, a tap on its order button. */}
            <g transform="rotate(9 60 60)">
              <rect x="38" y="20" width="44" height="80" rx="11" fill={url('phone')} />
              <rect x="42" y="25" width="36" height="70" rx="7.5" fill="#fff" />
              <rect x="48" y="31" width="24" height="18" rx="4" fill={url('card')} />
              <rect x="48" y="54" width="16" height="3.5" rx="1.75" fill="#D6DBE6" />
              <rect x="48" y="61" width="22" height="3.5" rx="1.75" fill="#D6DBE6" />
              <rect x="48" y="73" width="24" height="11" rx="5.5" fill={url('go')} />
              <ellipse cx="54" cy="35" rx="4" ry="2.2" fill="#fff" opacity="0.55" />
            </g>
            <circle cx="58" cy="81" r="7" fill="none" stroke="#fff" strokeWidth="2.4" className="ab-art-ripple" />
          </g>
        )}

        {kind === 'pay' && (
          <g>
            {/* A stack of peso coins, one hopping off the top. */}
            <g>
              <ellipse cx="60" cy="96" rx="22" ry="7" fill={url('goldSide')} />
              <rect x="38" y="88" width="44" height="8" fill={url('goldSide')} />
              <ellipse cx="60" cy="88" rx="22" ry="7" fill={url('gold')} />
              <ellipse cx="60" cy="86" rx="22" ry="7" fill={url('goldSide')} />
              <rect x="38" y="78" width="44" height="8" fill={url('goldSide')} />
              <ellipse cx="60" cy="78" rx="22" ry="7" fill={url('gold')} />
            </g>
            <g className="ab-art-hop">
              <circle cx="60" cy="46" r="21" fill={url('gold')} />
              <circle cx="60" cy="46" r="15.5" fill="none" stroke="#FFF3BF" strokeWidth="2" opacity="0.85" />
              <text x="60" y="54" textAnchor="middle" fontSize="23" fontWeight="700" fill="#9A6A00" fontFamily="'DM Sans', sans-serif">₱</text>
              <ellipse cx="52" cy="37" rx="5" ry="2.8" fill="#fff" opacity="0.75" transform="rotate(-35 52 37)" />
            </g>
          </g>
        )}

        {kind === 'receive' && (
          <g>
            {/* A parcel, bouncing as it lands; a heart rising from it. */}
            <path className="ab-art-float" d="M60 20c-3.2-5.4-11-3.2-11 2.4 0 5.2 6.8 9.4 11 12.4 4.2-3 11-7.2 11-12.4 0-5.6-7.8-7.8-11-2.4z" fill={url('heart')} />
            <g className="ab-art-bounce">
              <path d="M30 58l30-12 30 12-30 12z" fill={url('lid')} />
              <path d="M30 58v34l30 13V70z" fill={url('box')} />
              <path d="M90 58v34l-30 13V70z" fill={url('boxSide')} />
              <path d="M44 52.4l30 12v9l-6-2.4v-6.6l-30-12z" fill={url('go')} />
              <path d="M60 70v35" stroke="#3BB37A" strokeWidth="5" />
              <ellipse cx="44" cy="76" rx="5" ry="2.6" fill="#fff" opacity="0.4" transform="rotate(25 44 76)" />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
