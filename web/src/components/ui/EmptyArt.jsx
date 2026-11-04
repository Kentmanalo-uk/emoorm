import { useId } from 'react';
import {
  UserPlus, Package, CheckCircle, QrCode, Handshake, WifiSlash, Lightning, Plus, ShieldCheck,
} from '../../lib/icons';
import { PALETTES, INK } from '../avatars/avatars';
import './EmptyArt.css';

/**
 * Picture for an empty state, drawn the way the avatars and the About page's
 * "How buying works" pictures are (components/avatars, components/about/
 * StepArt.jsx): a round pastel ground of two hues with a soft light over its
 * top left, every shape a two-stop gradient, nothing outlined, a white
 * highlight where the light falls. The subject is drawn a fifth larger than
 * the circle holds and only the circle's lower half crops it, so it stands
 * in the circle and rises out over its top edge. Still: nothing moves.
 *
 * Every topic has a picture of its own, of the thing the empty page is for:
 * a piggy bank for savings, a megaphone for announcements, a rocket for a
 * launch, a cart for the cart. Its ground is one of the avatars' palettes,
 * so neighbouring pictures differ in colour too.
 *
 * Decorative: the heading beside it says what is empty, so it is hidden from
 * assistive technology. Phones draw it larger, and so do computers where it
 * is a page's main picture (`size` 80 or more, or `roomy`; EmptyArt.css).
 */

// Each topic's ground (components/avatars/avatars.js palettes).
const GROUNDS = {
  notifications: 'sky', inbox: 'peri', followers: 'blush', products: 'sage', orders: 'butter', returns: 'coral',
  delivery: 'aqua', categories: 'pistachio', vouchers: 'apricot', banners: 'corn', gallery: 'orchid',
  analytics: 'lilac', revenue: 'teal', savings: 'blush', activity: 'violet', payments: 'sand', search: 'mushroom',
  places: 'aqua', addresses: 'peach', messages: 'mushroom', feedback: 'butter', reviews: 'apricot',
  support: 'sky', announcements: 'coral', offers: 'sand', stores: 'mushroom', following: 'mauve', cart: 'foam',
  wishlist: 'blush', shopping: 'orchid', launch: 'peri', users: 'pistachio', reports: 'sage', healthy: 'teal',
  maintenance: 'corn', workspace: 'peach', calendar: 'lilac', security: 'violet', offline: 'sky',
  questions: 'corn', today: 'butter', testers: 'foam', designs: 'orchid', audit: 'sand', invites: 'blush', team: 'sky',
};

// The circle is 120 across on the grid and drawn a little larger than the
// `size` callers ask for (the old wide scenes were a quarter larger than it).
const SCALE = 1.15;
// The frame around it: room above and beside the circle for the subject.
const VIEW = { x: -12, y: -18, w: 144, h: 138 };
// The subject, a fifth larger than drawn, grown about a point just under
// the circle's centre.
const GROW = 'translate(60 64) scale(1.2) translate(-60 -64)';

/** A five-point star centred on (cx, cy). */
const starPath = (cx, cy, R, r = R * 0.45) => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
};

// A heart 22 wide, its dip at (0, 0); placed with translate/scale.
const HEART = 'M0 -3c-3.2-5.4-11-3.2-11 2.4 0 5.2 6.8 9.4 11 12.4 4.2-3 11-7.2 11-12.4 0-5.6-7.8-7.8-11-2.4z';

export default function EmptyArt({
  name, size = 96, roomy = size >= 80, className = '',
}) {
  const topic = GROUNDS[name] ? name : 'inbox';
  const pal = PALETTES[GROUNDS[topic]] || PALETTES.mushroom;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `ea${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;
  const unit = (size * SCALE) / 120;
  const w = Math.round(VIEW.w * unit);
  const h = Math.round(VIEW.h * unit);
  const ramp = (part, stops, axis = { x1: '0.2', y1: '0', x2: '0.7', y2: '1' }) => (
    <linearGradient id={id(part)} {...axis}>
      {stops.map((c, i) => <stop key={`${c}-${i}`} offset={String(i / (stops.length - 1))} stopColor={c} />)}
    </linearGradient>
  );

  // ── Building blocks ──
  // A Phosphor icon, `s` wide, its corner at (x, y). Page rules such as
  // `.admin-empty svg { width: 200px; fill: currentColor }` also reach inner
  // svgs; inline styles keep it as drawn.
  const icon = (Icon, x, y, s, fill = '#ffffff') => (
    <Icon
      x={x}
      y={y}
      size={s}
      weight="fill"
      style={{
        width: s, height: s, margin: 0, padding: 0, opacity: 1, display: 'inline', overflow: 'visible', background: 'none', fill, color: fill,
      }}
    />
  );
  const shine = (cx, cy, rx, ry, rot = -30, op = 0.55) => (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={op} transform={`rotate(${rot} ${cx} ${cy})`} />
  );
  // A round gradient chip with an icon on it.
  const chip = (cx, cy, r, Icon, tone) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={url(tone)} />
      {shine(cx - r * 0.38, cy - r * 0.5, r * 0.34, r * 0.18)}
      {icon(Icon, cx - r * 0.55, cy - r * 0.55, r * 1.1, tone === 'gold' ? '#9A6A00' : '#ffffff')}
    </g>
  );
  const line = (x, y, w, fill = '#D6DBE6', hgt = 3.5) => <rect x={x} y={y} width={w} height={hgt} rx={hgt / 2} fill={fill} />;
  const heart = (cx, cy, s, tone = 'heart') => <path d={HEART} transform={`translate(${cx} ${cy}) scale(${s})`} fill={url(tone)} />;
  const coin = (cx, cy, r) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={url('gold')} />
      <circle cx={cx} cy={cy} r={r * 0.74} fill="none" stroke="#FFF3BF" strokeWidth={r * 0.1} opacity="0.85" />
      <text x={cx} y={cy + r * 0.38} textAnchor="middle" fontSize={r * 1.05} fontWeight="700" fill="#9A6A00" fontFamily="'DM Sans', sans-serif">₱</text>
      {shine(cx - r * 0.4, cy - r * 0.45, r * 0.28, r * 0.15, -35, 0.7)}
    </g>
  );
  // One of the avatars' little creatures (a capped head), centred on (x, y).
  const buddy = (x, y, s, cap, body) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-15" y="-8" width="30" height="34" rx="14" fill={url(body)} />
      <path d="M0 -24c-14 0-23 9-23 16 0 3 3 5 8 5h30c5 0 8-2 8-5 0-7-9-16-23-16z" fill={url(cap)} />
      <ellipse cx="-8" cy="-16" rx="5" ry="2.6" fill="#fff" opacity="0.35" transform="rotate(-20 -8 -16)" />
      <rect x="-6.5" y="2" width="4" height="7" rx="2" fill={INK} />
      <rect x="2.5" y="2" width="4" height="7" rx="2" fill={INK} />
      <path d="M-3.5 13c1.5 2.4 5.5 2.4 7 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  // A parcel (seen from its corner), its top at (x, y), `s` = 1 for 60 wide.
  const parcel = (x, y, s) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 12l30-12 30 12-30 12z" fill={url('lid')} />
      <path d="M0 12v32l30 13V24z" fill={url('box')} />
      <path d="M60 12v32l-30 13V24z" fill={url('boxSide')} />
      <path d="M14 6.4l30 12v9l-6-2.4v-6.6l-30-12z" fill={url('go')} />
      <path d="M30 24v33" stroke="#3BB37A" strokeWidth="5" />
      {shine(14, 30, 5, 2.6, 25, 0.4)}
    </g>
  );
  const sparkle = (x, y, r, fill = '#fff') => (
    <path d={`M${x} ${y - r}l${r * 0.29} ${r * 0.71} ${r * 0.71} ${r * 0.29} ${-r * 0.71} ${r * 0.29} ${-r * 0.29} ${r * 0.71} ${-r * 0.29} ${-r * 0.71} ${-r * 0.71} ${-r * 0.29} ${r * 0.71} ${-r * 0.29}z`} fill={fill} />
  );

  // ── One picture per topic ──
  const scenes = {
    // A phone, its bell ringing over the screen.
    notifications: () => (
      <>
        <rect x="36" y="30" width="44" height="78" rx="11" fill={url('phone')} />
        <rect x="40" y="35" width="36" height="68" rx="7.5" fill="#fff" />
        {[52, 70].map((y, i) => (
          <g key={y}>
            <rect x="44" y={y} width="28" height="13" rx="4" fill={i ? '#F3F5FA' : '#EAF8F1'} />
            <circle cx="50" cy={y + 6.5} r="3.2" fill={url(i ? 'heart' : 'go')} />
            {line(56, y + 4, 13, '#D6DBE6', 2.6)}
            {line(56, y + 8, 9, '#E6E9F0', 2.4)}
          </g>
        ))}
        <g>
          <path d="M68 18c-9 0-15 7-15 15v8l-4 6h38l-4-6v-8c0-8-6-15-15-15z" fill={url('gold')} />
          <circle cx="68" cy="51" r="4.5" fill={url('gold')} />
          {shine(61, 27, 4, 2.2)}
        </g>
        <circle cx="84" cy="22" r="6" fill={url('heart')} />
      </>
    ),
    // An open tray, letters dropping in.
    inbox: () => (
      <>
        <path d="M24 70l10-22h52l10 22v20a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8z" fill={url('sky')} />
        <path d="M24 70h22a14 14 0 0 0 28 0h22v20a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8z" fill={url('skyDeep')} />
        <g>
          <rect x="40" y="26" width="40" height="27" rx="4" fill="#fff" />
          <path d="M40 30l20 13 20-13" fill="none" stroke="#C9D2E3" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="76" cy="28" r="5" fill={url('heart')} />
        </g>
        {shine(34, 78, 5, 2.4, 0, 0.45)}
      </>
    ),
    // Two little creatures, one waving in a third.
    followers: () => (
      <>
        {buddy(44, 70, 0.95, 'heart', 'peach')}
        {buddy(78, 72, 0.85, 'go', 'sky')}
        {chip(90, 34, 12, UserPlus, 'violet')}
        {heart(30, 34, 0.55, 'heart')}
      </>
    ),
    // An open parcel with a mango, a leaf and a price tag peeking out.
    products: () => (
      <>
        <circle cx="48" cy="46" r="11" fill={url('fruit')} />
        <path d="M48 36c1-5 6-7 10-6-1 5-5 7-10 6z" fill="#3BB37A" />
        <ellipse cx="66" cy="44" rx="9" ry="12" fill={url('leaf')} transform="rotate(20 66 44)" />
        {parcel(30, 50, 1)}
        <g>
          <path d="M80 30h16a4 4 0 0 1 4 4v14l-14 14-14-14V34a4 4 0 0 1 4-4z" fill={url('heart')} transform="rotate(20 88 46)" />
          <circle cx="88" cy="38" r="2.6" fill="#fff" />
        </g>
      </>
    ),
    // A long receipt and a shopping bag.
    orders: () => (
      <>
        <g>
          <path d="M34 20h40v78l-5-4-5 4-5-4-5 4-5-4-5 4-5-4-5 4z" fill="#fff" />
          {line(40, 30, 24, '#5FD39A', 4)}
          {[42, 50, 58, 66].map((y) => (
            <g key={y}>
              {line(40, y, 16)}
              {line(62, y, 6, '#C9D2E3')}
            </g>
          ))}
          {line(40, 78, 28, '#F7C431', 4)}
        </g>
        <path d="M70 58h26l3 40H67z" fill={url('heart')} />
        <path d="M76 58c0-8 3-12 7-12s7 4 7 12" fill="none" stroke="#F0568A" strokeWidth="3" strokeLinecap="round" />
        {shine(74, 66, 4, 2.2, -10)}
      </>
    ),
    // A parcel going back round an arrow.
    returns: () => (
      <>
        <g>
          <path d="M60 18a42 42 0 1 1-39 26" fill="none" stroke={url('coralLine')} strokeWidth="7" strokeLinecap="round" />
          <path d="M14 34l7 14 13-8z" fill="#F76C58" />
        </g>
        {parcel(34, 42, 0.86)}
      </>
    ),
    // A delivery truck on its way, dust behind it.
    delivery: () => (
      <>
        <rect x="14" y="94" width="92" height="5" rx="2.5" fill="#fff" opacity="0.6" />
        <g>
          <rect x="22" y="50" width="48" height="36" rx="5" fill={url('box')} />
          <path d="M70 60h16l10 13v13H70z" fill={url('go')} />
          <path d="M74 64h11l6 9H74z" fill="#DDF3FF" />
          <circle cx="38" cy="88" r="8" fill={url('phone')} />
          <circle cx="38" cy="88" r="3" fill="#fff" />
          <circle cx="82" cy="88" r="8" fill={url('phone')} />
          <circle cx="82" cy="88" r="3" fill="#fff" />
          {icon(Package, 36, 58, 20, '#C98E00')}
          {shine(30, 56, 5, 2.4, -10, 0.45)}
        </g>
        {[[12, 64], [8, 74], [14, 82]].map(([x, y]) => <rect key={y} x={x} y={y} width="8" height="3" rx="1.5" fill="#fff" opacity="0.8" />)}
      </>
    ),
    // Four tiles, each a kind of thing sold.
    categories: () => (
      <>
        {[[26, 26, 'go'], [62, 26, 'heart'], [26, 62, 'gold'], [62, 62, 'sky']].map(([x, y, tone]) => (
          <g key={tone}>
            <rect x={x} y={y} width="32" height="32" rx="9" fill="#fff" />
            <circle cx={x + 16} cy={y + 16} r="10" fill={url(tone)} />
            {shine(x + 12, y + 11, 3.6, 2, -30, 0.6)}
          </g>
        ))}
        <path d="M42 33c1-4 5-6 8-5-1 4-4 6-8 5z" fill="#2E9E67" />
      </>
    ),
    // A ticket with a percent, its stub torn off.
    vouchers: () => (
      <>
        <g>
          <path d="M18 44h84v10a8 8 0 0 0 0 16v10H18V70a8 8 0 0 0 0-16z" fill={url('fruit')} transform="rotate(-10 60 62)" />
          <path d="M76 46v34" stroke="#fff" strokeWidth="2.4" strokeDasharray="3 4" transform="rotate(-10 60 62)" />
          <g transform="rotate(-10 60 62)">
            <circle cx="40" cy="56" r="4.5" fill="#fff" />
            <circle cx="56" cy="70" r="4.5" fill="#fff" />
            <path d="M58 52L38 74" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
          </g>
          {shine(30, 52, 6, 2.6, -15, 0.45)}
        </g>
        {sparkle(92, 32, 5, '#F7C431')}
      </>
    ),
    // A banner on a stand: hills and a sun on it.
    banners: () => (
      <>
        <rect x="58" y="74" width="4" height="26" fill="#9AA6BD" />
        <rect x="44" y="98" width="32" height="5" rx="2.5" fill="#9AA6BD" />
        <rect x="18" y="28" width="84" height="50" rx="8" fill="#fff" />
        <rect x="22" y="32" width="76" height="42" rx="5" fill={url('skyLight')} />
        <circle cx="82" cy="45" r="7" fill={url('gold')} />
        <path d="M22 74l22-22 16 14 12-10 26 18z" fill={url('leaf')} />
        {chip(26, 30, 9, Plus, 'go')}
      </>
    ),
    // Photos fanned out and a camera.
    gallery: () => (
      <>
        {[[-14, 30, 'skyLight'], [8, 52, 'blossom']].map(([rot, x, tone]) => (
          <g key={x} transform={`rotate(${rot} ${x + 18} 50)`}>
            <rect x={x} y="26" width="36" height="44" rx="4" fill="#fff" />
            <rect x={x + 4} y="30" width="28" height="28" rx="2" fill={url(tone)} />
            <path d={`M${x + 4} 58l9-10 7 6 6-5 6 9z`} fill={url('leaf')} />
          </g>
        ))}
        <g>
          <rect x="30" y="66" width="52" height="34" rx="8" fill={url('phone')} />
          <rect x="40" y="61" width="16" height="7" rx="3" fill={url('phone')} />
          <circle cx="56" cy="83" r="11" fill="#fff" />
          <circle cx="56" cy="83" r="7.5" fill={url('violet')} />
          {shine(53, 80, 2.6, 1.5, -30, 0.8)}
          <circle cx="74" cy="72" r="2.4" fill="#F7C431" />
        </g>
      </>
    ),
    // Bars growing on a board.
    analytics: () => (
      <>
        <rect x="18" y="26" width="84" height="70" rx="10" fill="#fff" opacity="0.94" />
        {[[28, 26, 'violet'], [44, 40, 'go'], [60, 30, 'violet'], [76, 52, 'go']].map(([x, hb, tone]) => (
          <rect key={x} x={x} y={86 - hb} width="12" height={hb} rx="4" fill={url(tone)} />
        ))}
        {line(26, 88, 66, '#E6E9F0', 2.4)}
        {sparkle(88, 32, 4.5, '#F7C431')}
      </>
    ),
    // A line climbing past a stack of coins.
    revenue: () => (
      <>
        {[96, 88, 80].map((y) => (
          <g key={y}>
            <ellipse cx="38" cy={y + 2} rx="16" ry="5" fill={url('goldSide')} />
            <rect x="22" y={y - 4} width="32" height="6" fill={url('goldSide')} />
            <ellipse cx="38" cy={y - 4} rx="16" ry="5" fill={url('gold')} />
          </g>
        ))}
        <path d="M22 66l20-14 16 8 30-28" fill="none" stroke={url('goLine')} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M80 26l14 2-2 14z" fill="#2E9E67" />
        {coin(84, 74, 13)}
      </>
    ),
    // A piggy bank, a coin dropping in.
    savings: () => (
      <>
        {coin(62, 26, 10)}
        <g>
          <ellipse cx="58" cy="72" rx="34" ry="26" fill={url('heart')} />
          <path d="M40 52l-6-12 14 6z" fill="#F0568A" />
          <rect x="88" y="64" width="10" height="13" rx="5" fill={url('heart')} />
          <circle cx="94" cy="68" r="1.6" fill="#B33A6A" />
          <circle cx="94" cy="73" r="1.6" fill="#B33A6A" />
          <rect x="38" y="90" width="9" height="12" rx="4" fill="#F0568A" />
          <rect x="66" y="90" width="9" height="12" rx="4" fill="#F0568A" />
          <rect x="52" y="48" width="18" height="4" rx="2" fill="#B33A6A" />
          <circle cx="76" cy="64" r="2.6" fill={INK} />
          {shine(44, 60, 9, 4.5, -25, 0.4)}
        </g>
      </>
    ),
    // A clock with a bolt beside it, its hand going round.
    activity: () => (
      <>
        <circle cx="54" cy="62" r="34" fill={url('violet')} />
        <circle cx="54" cy="62" r="27" fill="#fff" />
        {[0, 90, 180, 270].map((a) => <rect key={a} x="52.5" y="38" width="3" height="6" rx="1.5" fill="#C7A9F7" transform={`rotate(${a} 54 62)`} />)}
        <rect x="52.5" y="46" width="3" height="17" rx="1.5" fill={INK} />
        <rect x="52.5" y="60.5" width="13" height="3" rx="1.5" fill={INK} />
        <circle cx="54" cy="62" r="3.2" fill={url('heart')} />
        {chip(90, 32, 13, Lightning, 'gold')}
        {shine(36, 42, 6, 3, -35, 0.4)}
      </>
    ),
    // A bank card and a QR card, and a tick.
    payments: () => (
      <>
        <g transform="rotate(-12 50 56)">
          <rect x="18" y="36" width="62" height="40" rx="7" fill={url('sky')} />
          <rect x="18" y="45" width="62" height="7" fill="#2E6FD8" opacity="0.6" />
          <rect x="24" y="58" width="12" height="9" rx="2" fill={url('gold')} />
          {line(42, 62, 26, '#fff')}
        </g>
        <g>
          <rect x="56" y="48" width="42" height="50" rx="7" fill="#fff" />
          {icon(QrCode, 63, 54, 28, '#2B2640')}
          {line(64, 87, 26, '#5FD39A', 3.5)}
        </g>
        {chip(92, 30, 11, CheckCircle, 'go')}
      </>
    ),
    // A magnifying glass over a fruit, swaying.
    search: () => (
      <g>
        <rect x="73" y="71" width="11" height="34" rx="5.5" fill={url('ring')} transform="rotate(-42 78 88)" />
        <circle cx="54" cy="54" r="27" fill={url('ring')} />
        <circle cx="54" cy="54" r="19.5" fill={url('glass')} />
        <circle cx="55" cy="58" r="9" fill={url('fruit')} />
        <path d="M55 49c1-4 5-6 8-5-1 4-4 6-8 5z" fill="#3BB37A" />
        <ellipse cx="46" cy="45" rx="6" ry="3.4" fill="#fff" opacity="0.9" transform="rotate(-35 46 45)" />
      </g>
    ),
    // A folded map and a pin dropping onto it.
    places: () => (
      <>
        <path d="M18 54l28-9v58l-28 9z" fill={url('mapA')} />
        <path d="M46 45l28 9v58l-28-9z" fill={url('mapB')} />
        <path d="M74 54l28-9v58l-28 9z" fill={url('mapA')} />
        <path d="M26 94c14-12 34 6 68-20" fill="none" stroke="#fff" strokeWidth="2.6" strokeDasharray="4 4" strokeLinecap="round" opacity="0.9" />
        <g>
          <path d="M60 78s-18-18-18-31a18 18 0 0 1 36 0c0 13-18 31-18 31z" fill={url('heart')} />
          <circle cx="60" cy="47" r="7" fill="#fff" />
          {shine(52, 37, 4, 2.2, -35)}
        </g>
      </>
    ),
    // A little house with a pin over its roof.
    addresses: () => (
      <>
        <rect x="14" y="98" width="92" height="6" rx="3" fill="#fff" opacity="0.55" />
        <path d="M30 64l28-22 28 22v36H30z" fill={url('lid')} />
        <path d="M24 66l34-28 34 28-6 4-28-22-28 22z" fill={url('coral')} />
        <rect x="50" y="78" width="16" height="22" rx="3" fill={url('boxSide')} />
        <rect x="36" y="70" width="10" height="10" rx="2" fill="#DDF3FF" />
        <rect x="70" y="70" width="10" height="10" rx="2" fill="#DDF3FF" />
        <g>
          <path d="M84 46s-12-12-12-21a12 12 0 0 1 24 0c0 9-12 21-12 21z" fill={url('go')} />
          <circle cx="84" cy="25" r="4.5" fill="#fff" />
        </g>
      </>
    ),
    // Two chat bubbles, one typing.
    messages: () => (
      <>
        <path d="M66 22h26a12 12 0 0 1 12 12v8a12 12 0 0 1-12 12h-2l3 9-12-9H66a12 12 0 0 1-12-12v-8a12 12 0 0 1 12-12z" fill={url('heart')} />
        {[71, 79, 87].map((x) => <circle key={x} cx={x} cy="38" r="2.6" fill="#fff" />)}
        <g>
          <path d="M30 50h36a16 16 0 0 1 16 16v12a16 16 0 0 1-16 16H44l-16 11 3-12a16 16 0 0 1-17-15V66a16 16 0 0 1 16-16z" fill={url('go')} />
          {line(28, 66, 34, '#fff', 4)}
          {line(28, 75, 22, '#fff', 4)}
          {shine(30, 58, 6, 3)}
        </g>
      </>
    ),
    // A bubble with a smiling face, stars around it.
    feedback: () => (
      <>
        <g>
          <path d="M30 28h52a16 16 0 0 1 16 16v20a16 16 0 0 1-16 16H54l-18 14 4-14h-10a16 16 0 0 1-16-16V44a16 16 0 0 1 16-16z" fill={url('gold')} />
          <circle cx="46" cy="50" r="3.6" fill={INK} />
          <circle cx="66" cy="50" r="3.6" fill={INK} />
          <path d="M44 60c4 6 20 6 24 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          {shine(30, 38, 6, 3)}
        </g>
        <path d={starPath(96, 92, 9)} fill={url('heart')} />
        {sparkle(22, 92, 5, '#fff')}
      </>
    ),
    // A card of five stars, the last one landing.
    reviews: () => (
      <>
        <rect x="16" y="42" width="88" height="42" rx="10" fill="#fff" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={starPath(30 + i * 15, 58, 6.5)} fill={i < 4 ? url('gold') : '#E6E9F0'} />
        ))}
        {line(24, 72, 40, '#E6E9F0', 3)}
        <path d={starPath(90, 32, 11)} fill={url('gold')} />
        {heart(32, 98, 0.5, 'heart')}
      </>
    ),
    // A headset over a help bubble.
    support: () => (
      <>
        <path d="M46 58h40a14 14 0 0 1 14 14v8a14 14 0 0 1-14 14H70l-12 9 2-9h-14a14 14 0 0 1-14-14v-8a14 14 0 0 1 14-14z" fill={url('go')} />
        <text x="66" y="84" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff" fontFamily="'DM Sans', sans-serif">?</text>
        <g>
          <path d="M22 54a24 24 0 0 1 48 0" fill="none" stroke={url('skyDeepLine')} strokeWidth="7" strokeLinecap="round" />
          <rect x="15" y="50" width="14" height="22" rx="6" fill={url('sky')} />
          <rect x="63" y="50" width="14" height="22" rx="6" fill={url('sky')} />
          <path d="M22 72c0 8 8 12 16 12" fill="none" stroke="#5B98F5" strokeWidth="3" strokeLinecap="round" />
          <circle cx="40" cy="84" r="4" fill={url('heart')} />
        </g>
      </>
    ),
    // A megaphone, its sound going out in rings.
    announcements: () => (
      <>
        <g transform="rotate(-14 50 62)">
          <path d="M28 52h12l34-18v56L40 72H28a6 6 0 0 1-6-6v-8a6 6 0 0 1 6-6z" fill={url('coral')} />
          <rect x="74" y="34" width="8" height="56" rx="4" fill={url('coralDeep')} />
          <path d="M34 72l6 20h10l-4-20z" fill="#E04A33" />
          {shine(34, 56, 6, 3, 0, 0.5)}
        </g>
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${88 + i * 7} ${42 - i * 4}a${18 + i * 7} ${18 + i * 7} 0 0 1 0 ${30 + i * 8}`} fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        ))}
      </>
    ),
    // A price tag, coins and a deal being talked over.
    offers: () => (
      <>
        <path d="M24 44h34l20 20-26 26-28-28z" fill={url('box')} />
        <circle cx="34" cy="54" r="4" fill="#fff" />
        <text x="52" y="72" textAnchor="middle" fontSize="16" fontWeight="700" fill="#9A6A00" fontFamily="'DM Sans', sans-serif" transform="rotate(45 52 66)">₱</text>
        {coin(36, 96, 9)}
        {coin(54, 100, 8)}
        <g>
          <path d="M70 22h22a10 10 0 0 1 10 10v8a10 10 0 0 1-10 10h-6l-8 7 1-7h-9a10 10 0 0 1-10-10v-8a10 10 0 0 1 10-10z" fill={url('go')} />
          {icon(Handshake, 72, 25, 22)}
        </g>
      </>
    ),
    // A market stall with a striped awning and a plant.
    stores: () => (
      <>
        <rect x="26" y="56" width="62" height="46" rx="5" fill={url('go')} />
        <path d="M22 38h70l4 18H18z" fill="#fff" />
        {[0, 2, 4].map((i) => <path key={i} d={`M${22 + i * 14} 38h14l${i === 4 ? 4 : 0.8} 18h-${i === 4 ? 18 : 15.6}z`} fill={url('heart')} />)}
        {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={25.8 + i * 15.6} cy="56" r="7.8" fill={i % 2 ? '#fff' : '#F0568A'} />)}
        <rect x="34" y="72" width="17" height="30" rx="3" fill="#fff" />
        <rect x="58" y="72" width="22" height="14" rx="3" fill="#DDF3FF" />
        <rect x="90" y="86" width="12" height="16" rx="3" fill={url('box')} />
        <g>
          <ellipse cx="92" cy="76" rx="5" ry="10" fill={url('leaf')} transform="rotate(-25 92 76)" />
          <ellipse cx="100" cy="78" rx="5" ry="9" fill={url('leaf')} transform="rotate(25 100 78)" />
        </g>
        <rect x="45" y="28" width="24" height="9" rx="3" fill={url('phone')} />
      </>
    ),
    // A shop with hearts rising from it: shops you follow.
    following: () => (
      <>
        <rect x="30" y="60" width="54" height="42" rx="5" fill={url('violet')} />
        <path d="M26 46h62l4 16H22z" fill={url('lid')} />
        {[0, 1, 2, 3].map((i) => <circle key={i} cx={30 + i * 18} cy="62" r="8" fill={i % 2 ? '#F9CF98' : '#FFEBCF'} />)}
        <rect x="38" y="76" width="15" height="26" rx="3" fill="#fff" />
        <rect x="60" y="76" width="18" height="12" rx="3" fill="#EADCFB" />
        {heart(70, 32, 0.9, 'heart')}
        {heart(46, 26, 0.55, 'heart')}
      </>
    ),
    // A cart rolling, a fruit and a bag in it.
    cart: () => (
      <>
        <g>
          <circle cx="44" cy="70" r="11" fill={url('fruit')} />
          <rect x="58" y="56" width="20" height="22" rx="4" fill={url('heart')} />
          <path d="M14 34h12l10 46h50l8-34H32" fill="none" stroke={url('goLine')} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M33 50h59l-6 26H38z" fill={url('mint')} opacity="0.55" />
          <circle cx="42" cy="94" r="7" fill={url('phone')} />
          <circle cx="80" cy="94" r="7" fill={url('phone')} />
          {shine(40, 66, 3.6, 2)}
        </g>
      </>
    ),
    // A heart tied with a ribbon, saved for later.
    wishlist: () => (
      <>
        <g>
          {heart(60, 54, 3, 'heart')}
          <rect x="56" y="38" width="8" height="58" fill="#fff" opacity="0.85" />
          <path d="M60 44c-8-10-18-8-16-2s12 4 16 2c4 2 14 4 16-2s-8-8-16 2z" fill={url('gold')} />
          {shine(40, 48, 6, 3)}
        </g>
        {sparkle(96, 30, 6, '#F7C431')}
        {sparkle(24, 86, 4, '#fff')}
      </>
    ),
    // Two shopping bags.
    shopping: () => (
      <>
        <path d="M24 50h40l4 50H20z" fill={url('go')} />
        <path d="M34 50c0-10 4-15 10-15s10 5 10 15" fill="none" stroke="#2E9E67" strokeWidth="3.4" strokeLinecap="round" />
        {shine(30, 58, 5, 2.4, -10)}
        <g>
          <path d="M56 58h40l4 42H52z" fill={url('heart')} />
          <path d="M66 58c0-9 4-13 10-13s10 4 10 13" fill="none" stroke="#F0568A" strokeWidth="3.4" strokeLinecap="round" />
          {heart(76, 78, 0.5, 'gold')}
        </g>
      </>
    ),
    // A rocket lifting off a puff of cloud.
    launch: () => (
      <>
        <g>
          <path d="M60 16c14 10 18 30 14 50H46c-4-20 0-40 14-50z" fill={url('paper')} />
          <circle cx="60" cy="40" r="8" fill={url('sky')} />
          {shine(57, 37, 3, 1.6, -30, 0.8)}
          <path d="M46 52l-12 16 14-2z" fill={url('heart')} />
          <path d="M74 52l12 16-14-2z" fill={url('heart')} />
          <path d="M50 66h20l-4 10h-12z" fill="#C9D2E3" />
          <path d="M54 76c0 10 6 14 6 14s6-4 6-14z" fill={url('flame')} />
        </g>
        {[[30, 98, 13], [52, 102, 15], [76, 100, 14], [94, 96, 10]].map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} fill="#fff" opacity="0.9" />)}
        {sparkle(24, 36, 5, '#fff')}
      </>
    ),
    // Three of the avatars' creatures, side by side.
    users: () => (
      <>
        {buddy(32, 74, 0.8, 'sky', 'peach')}
        {buddy(88, 74, 0.8, 'violet', 'mint')}
        {buddy(60, 68, 1, 'heart', 'lid')}
      </>
    ),
    // A flag on a little hill, flying.
    reports: () => (
      <>
        <ellipse cx="54" cy="106" rx="40" ry="16" fill={url('leaf')} />
        <rect x="40" y="26" width="5" height="74" rx="2.5" fill="#8A93A8" />
        <circle cx="42.5" cy="25" r="4" fill={url('gold')} />
        <path d="M45 30c14-6 22 6 40 0v28c-18 6-26-6-40 0z" fill={url('heart')} />
        {shine(52, 38, 5, 2.4, -10, 0.45)}
      </>
    ),
    // A heart with a steady pulse running through it.
    healthy: () => (
      <>
        <g>{heart(60, 52, 3, 'go')}</g>
        <path d="M18 66h22l6-12 8 22 8-30 8 20h32" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {chip(92, 30, 11, CheckCircle, 'sky')}
      </>
    ),
    // A gear turning and a wrench beside it.
    maintenance: () => (
      <>
        <g>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="45" y="22" width="14" height="14" rx="3" fill={url('sky')} transform={`rotate(${a} 52 52)`} />)}
          <circle cx="52" cy="52" r="24" fill={url('sky')} />
          <circle cx="52" cy="52" r="10" fill="#fff" />
        </g>
        <g transform="rotate(40 82 78)">
          <rect x="77" y="60" width="10" height="40" rx="5" fill={url('gold')} />
          <path d="M70 52a12 12 0 0 1 24 0l-5 7h-14z" fill={url('gold')} />
        </g>
      </>
    ),
    // A laptop and a cup of coffee, steam rising.
    workspace: () => (
      <>
        <rect x="22" y="36" width="60" height="42" rx="6" fill={url('phone')} />
        <rect x="27" y="41" width="50" height="32" rx="3" fill="#fff" />
        {line(32, 48, 26, '#5FD39A', 4)}
        {line(32, 56, 36)}
        {line(32, 63, 20, '#E6E9F0')}
        <path d="M14 78h76l-6 8H20z" fill="#9AA6BD" />
        <rect x="84" y="66" width="18" height="20" rx="4" fill={url('coral')} />
        <path d="M102 70a5 5 0 0 1 0 10" fill="none" stroke="#F76C58" strokeWidth="3" />
        {[88, 96].map((x) => <path key={x} d={`M${x} 60c-3-4 3-6 0-10`} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />)}
      </>
    ),
    // A calendar page with one day ticked.
    calendar: () => (
      <>
        <rect x="20" y="28" width="72" height="70" rx="10" fill="#fff" />
        <path d="M20 38a10 10 0 0 1 10-10h52a10 10 0 0 1 10 10v8H20z" fill={url('violet')} />
        {[34, 54, 74].map((x) => <rect key={x} x={x} y="22" width="5" height="12" rx="2.5" fill="#6D42D4" />)}
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`${r}-${c}`} x={28 + c * 15} y={54 + r * 13} width="10" height="8" rx="2" fill={r === 1 && c === 2 ? url('go') : '#EEF0F5'} />
        )))}
        {chip(90, 88, 13, CheckCircle, 'go')}
      </>
    ),
    // A shield with a padlock on it.
    security: () => (
      <>
        <path d="M60 18l34 12v26c0 22-15 38-34 46-19-8-34-24-34-46V30z" fill={url('violet')} />
        <path d="M60 26l26 9v21c0 17-11 30-26 37z" fill="#fff" opacity="0.18" />
        <g>
          <path d="M50 58v-6a10 10 0 0 1 20 0v6" fill="none" stroke="#fff" strokeWidth="5" />
          <rect x="44" y="56" width="32" height="26" rx="6" fill={url('gold')} />
          <circle cx="60" cy="67" r="3.6" fill="#9A6A00" />
          <rect x="58.5" y="68" width="3" height="7" rx="1.5" fill="#9A6A00" />
        </g>
        {shine(42, 34, 6, 3, -30, 0.45)}
      </>
    ),
    // A cloud with its signal gone, waiting to try again.
    offline: () => (
      <>
        <g>
          <path d="M34 82a18 18 0 0 1 4-35 24 24 0 0 1 45-4 18 18 0 0 1 3 36z" fill={url('skyLight')} />
          {shine(48, 46, 8, 3.5, -20, 0.6)}
          {icon(WifiSlash, 46, 52, 28, '#2E6FD8')}
        </g>
        <g>
          <path d="M84 96a10 10 0 1 1 8-16" fill="none" stroke={url('goLine')} strokeWidth="4" strokeLinecap="round" />
          <path d="M88 74l6 7-8 2z" fill="#2E9E67" />
        </g>
      </>
    ),
    // A product, and a buyer's question about it.
    questions: () => (
      <>
        <rect x="16" y="40" width="44" height="58" rx="8" fill="#fff" />
        <rect x="21" y="45" width="34" height="26" rx="5" fill={url('mint')} />
        <circle cx="38" cy="58" r="8" fill={url('fruit')} />
        <path d="M38 50c1-4 5-6 8-5-1 4-4 6-8 5z" fill="#3BB37A" />
        {line(21, 78, 26)}
        {line(21, 86, 16, '#5FD39A', 4)}
        <path d="M80 22h14a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-2l2 7-9-7h-5a10 10 0 0 1-10-10v-4a10 10 0 0 1 10-10z" fill={url('heart')} opacity="0.85" />
        <g>
          <path d="M66 44h22a14 14 0 0 1 14 14v8a14 14 0 0 1-14 14H76l-12 10 2-10a14 14 0 0 1-14-14v-8a14 14 0 0 1 14-14z" fill={url('go')} />
          <text x="77" y="72" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff" fontFamily="'DM Sans', sans-serif">?</text>
          {shine(60, 52, 5, 2.4)}
        </g>
      </>
    ),
    // A basket of today's food under a rising sun.
    today: () => (
      <>
        <circle cx="88" cy="34" r="14" fill={url('gold')} />
        <path d="M36 58a24 24 0 0 1 48 0" fill="none" stroke={url('woodLine')} strokeWidth="5" strokeLinecap="round" />
        <circle cx="46" cy="58" r="11" fill={url('fruit')} />
        <path d="M46 47c1-4 5-6 8-5-1 4-4 6-8 5z" fill="#3BB37A" />
        <g>
          <ellipse cx="72" cy="56" rx="14" ry="7" fill={url('ring')} />
          <path d="M84 56l9-7v14z" fill="#5B67E8" />
          <circle cx="64" cy="54" r="1.8" fill="#fff" />
        </g>
        <ellipse cx="58" cy="60" rx="7" ry="11" fill={url('leaf')} transform="rotate(-20 58 60)" />
        <path d="M24 62h72l-8 36a6 6 0 0 1-6 5H38a6 6 0 0 1-6-5z" fill={url('wood')} />
        {[74, 84, 94].map((y) => <rect key={y} x="30" y={y} width="60" height="2.6" rx="1.3" fill="#B7864F" opacity="0.5" />)}
        <rect x="22" y="60" width="76" height="8" rx="4" fill={url('woodLine')} />
        {shine(34, 76, 5, 2.4, -10, 0.35)}
      </>
    ),
    // A phone getting the app, a download on its way down.
    testers: () => (
      <>
        <rect x="36" y="22" width="48" height="86" rx="12" fill={url('phone')} />
        <rect x="40" y="27" width="40" height="76" rx="8" fill="#fff" />
        <rect x="50" y="40" width="20" height="20" rx="6" fill={url('go')} />
        <path d="M60 44c-5 3-6 8-3 12 4-1 7-5 3-12z" fill="#fff" opacity="0.9" />
        {line(48, 66, 24)}
        <rect x="46" y="76" width="28" height="9" rx="4.5" fill={url('go')} />
        <rect x="46" y="76" width="16" height="9" rx="4.5" fill="#2E9E67" />
        <g>
          <circle cx="90" cy="30" r="12" fill={url('sky')} />
          <path d="M90 23v12m-5-5l5 5 5-5" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {sparkle(24, 40, 5, '#fff')}
        {sparkle(98, 84, 4, '#F7C431')}
      </>
    ),
    // A photo being dressed up: a brush, a sticker.
    designs: () => (
      <>
        <rect x="18" y="30" width="66" height="60" rx="8" fill="#fff" transform="rotate(-6 51 60)" />
        <g transform="rotate(-6 51 60)">
          <rect x="23" y="35" width="56" height="42" rx="5" fill={url('skyLight')} />
          <circle cx="66" cy="46" r="6" fill={url('gold')} />
          <path d="M23 77l18-18 12 10 10-8 16 16z" fill={url('leaf')} />
          <rect x="23" y="66" width="56" height="11" fill={url('heart')} opacity="0.92" />
          {line(28, 70, 22, '#fff', 3)}
        </g>
        <path d={starPath(84, 30, 10)} fill={url('gold')} />
        <g>
          <rect x="86" y="54" width="8" height="40" rx="4" fill={url('wood')} transform="rotate(35 90 74)" />
          <path d="M70 58c4-6 12-6 14 0l-6 8z" fill={url('heart')} transform="rotate(35 78 62)" />
        </g>
      </>
    ),
    // A clipboard of ticked entries, looked over.
    audit: () => (
      <>
        <rect x="24" y="24" width="60" height="78" rx="9" fill={url('wood')} />
        <rect x="30" y="32" width="48" height="64" rx="5" fill="#fff" />
        <rect x="42" y="18" width="24" height="12" rx="4" fill={url('phone')} />
        {[44, 58, 72].map((y, i) => (
          <g key={y}>
            <circle cx="38" cy={y + 2} r="4.5" fill={url(i === 2 ? 'gold' : 'go')} />
            <path d={`M35.8 ${y + 2}l1.6 1.6 3-3`} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            {line(46, y - 1, 24)}
            {line(46, y + 4, 14, '#E6E9F0', 2.6)}
          </g>
        ))}
        <g>
          <rect x="88" y="86" width="8" height="20" rx="4" fill={url('ring')} transform="rotate(-42 92 96)" />
          <circle cx="82" cy="82" r="13" fill={url('ring')} />
          <circle cx="82" cy="82" r="9" fill={url('glass')} />
          {shine(78, 78, 3, 1.6, -35, 0.9)}
        </g>
      </>
    ),
    // An envelope, a card with a heart rising out of it.
    invites: () => (
      <>
        <g>
          <rect x="34" y="28" width="52" height="46" rx="6" fill="#fff" />
          {heart(60, 44, 0.9, 'heart')}
          {line(44, 62, 32, '#D6DBE6', 3)}
        </g>
        <path d="M24 56l36 24 36-24v38a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z" fill={url('coral')} />
        <path d="M24 94l28-20h16l28 20" fill={url('coralDeep')} opacity="0.55" />
        <path d="M24 56l36 24 36-24" fill="none" stroke="#FFA99D" strokeWidth="2" />
        {sparkle(20, 36, 5, '#fff')}
        {sparkle(100, 40, 4, '#F7C431')}
      </>
    ),
    // The admin team: three of the creatures and a shield.
    team: () => (
      <>
        {buddy(34, 76, 0.8, 'go', 'lid')}
        {buddy(86, 76, 0.8, 'heart', 'mint')}
        {buddy(60, 70, 1, 'sky', 'peach')}
        {chip(92, 30, 12, ShieldCheck, 'violet')}
      </>
    ),
  };
  const draw = scenes[topic];

  return (
    <span aria-hidden="true" style={{ '--ea-h': `${h}px` }} className={`empty-art${roomy ? ' is-roomy' : ''} ${className}`.trim()}>
      <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} width={w} height={h} focusable="false">
        <defs>
          <clipPath id={id('clip')}><circle cx="60" cy="60" r="60" /></clipPath>
          {/* The subject's crop: the circle below its middle, free above it. */}
          <clipPath id={id('pop')}>
            <circle cx="60" cy="60" r="60" />
            <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={60 - VIEW.y} />
          </clipPath>
          {ramp('bg', pal.bg, { x1: '0', y1: '0', x2: '1', y2: '1' })}
          {ramp('gold', ['#FFE68A', '#F7C431', '#E0A200'])}
          {ramp('goldSide', ['#E8AE12', '#C98E00'])}
          {ramp('glass', ['#FFFFFF', '#DDF3FF'])}
          {ramp('ring', ['#9EA7FF', '#5B67E8'])}
          {ramp('fruit', ['#FFC49A', '#FF8A4C'])}
          {ramp('phone', ['#4A4466', '#2B2640'])}
          {ramp('go', ['#5FD39A', '#2E9E67'])}
          {ramp('goLine', ['#5FD39A', '#2E9E67'], { x1: '0', y1: '1', x2: '1', y2: '0' })}
          {ramp('mint', ['#D7F7E8', '#9FE8C8'])}
          {ramp('heart', ['#FFA6C1', '#F0568A'])}
          {ramp('blossom', ['#FFD9E4', '#F9A8C4'])}
          {ramp('box', ['#FFD9A8', '#F2B06A'])}
          {ramp('boxSide', ['#F4BF83', '#DE9548'])}
          {ramp('lid', ['#FFEBCF', '#F9CF98'])}
          {ramp('peach', ['#FFE0C7', '#FFB98A'])}
          {ramp('leaf', ['#B8E39F', '#5BA53D'])}
          {ramp('mapA', ['#B8E39F', '#7FC65E'])}
          {ramp('mapB', ['#DFF2D4', '#B8E39F'])}
          {ramp('sky', ['#9EC9FF', '#5B98F5'])}
          {ramp('skyDeep', ['#5B98F5', '#2E6FD8'])}
          {ramp('skyDeepLine', ['#5B98F5', '#2E6FD8'], { x1: '0', y1: '0', x2: '1', y2: '0' })}
          {ramp('skyLight', ['#D6E9FF', '#9EC9FF'])}
          {ramp('violet', ['#C7A9F7', '#7E63EB'])}
          {ramp('coral', ['#FFA99D', '#F76C58'])}
          {ramp('coralDeep', ['#F76C58', '#E04A33'])}
          {ramp('coralLine', ['#FFA99D', '#F76C58'], { x1: '0', y1: '0', x2: '1', y2: '1' })}
          {ramp('paper', ['#FFFFFF', '#E6EAF3'])}
          {ramp('flame', ['#FFE68A', '#FF8A4C'])}
          {ramp('wood', ['#E9C79B', '#C99A63'])}
          {ramp('woodLine', ['#C99A63', '#A87A45'], { x1: '0', y1: '0', x2: '1', y2: '0' })}
          <radialGradient id={id('glow')} cx="0.28" cy="0.16" r="0.55">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g clipPath={url('clip')}>
          <rect width="120" height="120" fill={url('bg')} />
          <rect width="120" height="120" fill={url('glow')} />
        </g>
        <g clipPath={url('pop')}>
          <g transform={GROW}>{draw()}</g>
        </g>
      </svg>
    </span>
  );
}

