import { useId } from 'react';
import {
  ClockCounterClockwise, Lightning, CheckCircle, ChartBar, TrendUp, CalendarBlank, Clock, Tray,
  EnvelopeSimple, Bell, RocketLaunch, Storefront, Sparkle, Wrench, Gear, Heartbeat, ShieldCheck,
  CreditCard, Receipt, MapPin, MapTrifold, House, Package, Tag, Plus, ChartLineUp, Coins,
  ArrowUpRight, PiggyBank, ShoppingBag, Heart, Star, ChatCircleText, ChatCircleDots, PaperPlaneTilt,
  Smiley, Truck, Laptop, Coffee, NotePencil, ArrowCounterClockwise, UsersThree, IdentificationCard,
  MagnifyingGlass, Flag, ChatTeardropText, SquaresFour, ShoppingCart, UserPlus, Megaphone,
  ImageSquare, UploadSimple, Ticket, Percent, Headset, Images, Camera, Key, DeviceMobile, Handshake,
  WifiSlash, ArrowClockwise,
} from '@phosphor-icons/react';
import './EmptyArt.css';

/**
 * Picture for an empty state, in the app's style (mobile/src/components/
 * EmptyArt.js, after the Start selling sticker): flat shapes in the brand's
 * green, pink and gold on a soft pink-to-mint disc, white details, round
 * "coin" badges with a white rim, and one small gold sparkle. Behind the
 * shapes, blurred green and pink blobs show through see-through white
 * panels with a bright rim (frosted glass). No shine or gloss on top.
 *
 * One composition per topic (the app's scene names and layouts): a phone
 * for alerts, a stack of parcels, a chart board, a magnifier, a map, speech
 * bubbles, a shop, and a card for the rest.
 *
 * Decorative: the heading beside it says what is empty, so it is hidden from
 * assistive technology. Phones draw it larger (EmptyArt.css).
 */
const SCENES = {
  // Phone: alerts and inboxes.
  notifications: { layout: 'device', main: Bell, a: CheckCircle, b: Sparkle },
  inbox: { layout: 'device', main: Tray, a: EnvelopeSimple, b: Bell },
  followers: { layout: 'device', main: UserPlus, a: Heart, b: Bell },
  // A stack of parcels / cards: things you list, ship or send back.
  products: { layout: 'stack', main: Package, a: Tag, b: Plus },
  orders: { layout: 'stack', main: Receipt, a: ShoppingBag, b: CheckCircle },
  returns: { layout: 'stack', main: ArrowCounterClockwise, a: Package, b: Receipt },
  delivery: { layout: 'stack', main: Truck, a: Package, b: MapPin },
  categories: { layout: 'stack', main: SquaresFour, a: Tag, b: Plus },
  vouchers: { layout: 'stack', main: Ticket, a: Tag, b: Percent },
  banners: { layout: 'stack', main: ImageSquare, a: UploadSimple, b: Sparkle },
  gallery: { layout: 'stack', main: Images, a: Camera, b: MapPin },
  // A chart board: numbers over time.
  analytics: { layout: 'chart', main: ChartBar, a: TrendUp, b: CalendarBlank },
  revenue: { layout: 'chart', main: ChartLineUp, a: Coins, b: ArrowUpRight },
  savings: { layout: 'chart', main: PiggyBank, a: Coins, b: Sparkle },
  activity: { layout: 'chart', main: ClockCounterClockwise, a: Lightning, b: CheckCircle },
  payments: { layout: 'chart', main: CreditCard, a: Receipt, b: CheckCircle },
  // A magnifier over a product card.
  search: { layout: 'lens', main: MagnifyingGlass, a: Package, b: Sparkle },
  // A folded map with a pin.
  places: { layout: 'map', main: MapPin, a: MapTrifold, b: House },
  addresses: { layout: 'map', main: MapPin, a: House, b: Plus },
  // Speech bubbles: talking, rating, help.
  messages: { layout: 'bubbles', main: ChatCircleDots, a: PaperPlaneTilt, b: Smiley },
  feedback: { layout: 'bubbles', main: ChatTeardropText, a: Smiley, b: Star },
  reviews: { layout: 'bubbles', main: Star, a: ChatCircleText, b: Heart },
  support: { layout: 'bubbles', main: Headset, a: ChatCircleDots, b: ShieldCheck },
  announcements: { layout: 'bubbles', main: Megaphone, a: UsersThree, b: Sparkle },
  // Livestock deals: a handshake over a price, talked over in chat.
  offers: { layout: 'bubbles', main: Handshake, a: Tag, b: ChatCircleDots },
  // A storefront with an awning: shops and shopping.
  stores: { layout: 'shop', main: Storefront, a: MapPin, b: Star },
  following: { layout: 'shop', main: Heart, a: Bell, b: Star },
  cart: { layout: 'shop', main: ShoppingCart, a: Tag, b: Plus },
  wishlist: { layout: 'shop', main: Heart, a: ShoppingBag, b: Sparkle },
  shopping: { layout: 'shop', main: ShoppingBag, a: Tag, b: Heart },
  launch: { layout: 'shop', main: RocketLaunch, a: Sparkle, b: Star },
  // A frosted card holding the icon.
  users: { layout: 'card', main: UsersThree, a: IdentificationCard, b: MagnifyingGlass },
  reports: { layout: 'card', main: Flag, a: ShieldCheck, b: ChatCircleText },
  healthy: { layout: 'card', main: Heartbeat, a: ShieldCheck, b: Storefront },
  maintenance: { layout: 'card', main: Wrench, a: Gear, b: CheckCircle },
  workspace: { layout: 'card', main: Laptop, a: Coffee, b: NotePencil },
  calendar: { layout: 'card', main: CalendarBlank, a: Clock, b: CheckCircle },
  security: { layout: 'card', main: ShieldCheck, a: Key, b: DeviceMobile },
  // Something did not load (components/ui/LoadFailed).
  offline: { layout: 'card', main: WifiSlash, a: ArrowClockwise, b: Clock },
};

// The scene is 200 × 160; it is drawn a quarter larger than the `size`
// (height) callers ask for.
const VIEW_W = 200;
const VIEW_H = 160;
const SCALE = 1.25;

// The theme's ramps (tokens.css), with their defaults.
const PRIMARY = {
  50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#047857', 700: '#03684c', 900: '#064e3b',
};
const ACCENT = {
  50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777',
};
const P = (step) => `var(--t-primary-${step}, ${PRIMARY[step]})`;
const A = (step) => `var(--t-accent-${step}, ${ACCENT[step]})`;
// A theme colour goes in `style`: an SVG attribute cannot read var().
const tint = (fill) => ({ style: { fill } });

// Icons on a gold badge are drawn in dark amber (the peso on the sticker's coin).
const GOLD_INK = '#92400e';

/** A four-point sparkle centred on (x, y), straight-edged like the Start selling sticker's. */
const sparklePath = (x, y, r) => {
  const p = r * 0.29;
  const q = r * 0.71;
  return `M${x} ${y - r}l${p} ${q} ${q} ${p} ${-q} ${p} ${-p} ${q} ${-p} ${-q} ${-q} ${-p} ${q} ${-p}Z`;
};

export default function EmptyArt({ name, size = 96, className = '' }) {
  const scene = SCENES[name] || SCENES.inbox;
  const id = `ea${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const h = Math.round(size * SCALE);
  const w = Math.round((h * VIEW_W) / VIEW_H);
  const url = (part) => `url(#${id}-${part})`;

  // ── Building blocks ──
  // A Phosphor icon, `s` wide, its corner at (x, y). Page rules such as
  // `.admin-empty svg { width: 200px; fill: currentColor }` also reach these
  // inner icons; inline styles keep them as drawn.
  const icon = (Icon, x, y, s, fill = '#ffffff') => (
    <Icon
      x={x}
      y={y}
      size={s}
      weight="fill"
      style={{
        width: s, height: s, margin: 0, padding: 0, opacity: 1, display: 'inline', overflow: 'visible', background: 'none', fill,
      }}
    />
  );
  // A round sticker badge (the Start selling coin): a gradient disc with a
  // white rim and its icon in the middle.
  const badge = (cx, cy, r, Icon, tone = 'pink') => (
    <g>
      <circle cx={cx} cy={cy + 1.5} r={r} {...tint(P(900))} opacity="0.12" />
      <circle cx={cx} cy={cy} r={r} fill={url(tone)} stroke="#ffffff" strokeWidth="2.6" />
      {icon(Icon, cx - r * 0.56, cy - r * 0.56, r * 1.12, tone === 'gold' ? GOLD_INK : '#ffffff')}
    </g>
  );
  const bar = (x, y, wBar, hBar, fill) => <rect x={x} y={y} width={wBar} height={hBar} rx={hBar / 2} {...tint(fill)} />;
  // Frosted glass: see-through white with a bright rim, the blobs showing through.
  const glass = { fill: url('glass'), stroke: url('rim'), strokeWidth: 1.6 };

  // ── The compositions ──
  const layouts = {
    // A phone with a list on screen, and the topic's badge beside it.
    device: () => (
      <>
        <rect x="72" y="16" width="58" height="118" rx="13" fill={url('green')} />
        <rect x="77" y="27" width="48" height="98" rx="7" fill="#ffffff" />
        <rect x="93" y="20" width="16" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />
        {[[40, A(400), 1], [60, P(400), 1], [80, '#fbbf24', 0.55]].map(([y, dot, op]) => (
          <g key={y} opacity={op}>
            <rect x="81" y={y} width="40" height="16" rx="5" {...tint(P(50))} />
            <circle cx="89" cy={y + 8} r="4" {...tint(dot)} />
            {bar(96, y + 4.5, 20, 3, P(300))}
            {bar(96, y + 10, 13, 2.5, P(200))}
          </g>
        ))}
        <rect x="88" y="108" width="26" height="8" rx="4" {...tint(P(500))} />
        {badge(140, 42, 22, scene.main, 'pink')}
        <circle cx="156" cy="25" r="6" fill={url('gold')} stroke="#ffffff" strokeWidth="2" />
        {badge(60, 106, 13, scene.a, 'gold')}
      </>
    ),
    // Parcels: an amber box with a label in front, a pink one behind.
    stack: () => (
      <>
        <g transform="rotate(7 126 60)">
          <rect x="98" y="34" width="56" height="50" rx="6" fill={url('pink')} />
          <rect x="121" y="34" width="10" height="50" fill="#ffffff" opacity="0.45" />
        </g>
        <rect x="46" y="60" width="84" height="72" rx="6" fill={url('amber')} />
        <rect x="42" y="52" width="92" height="16" rx="4" fill={url('amberLid')} />
        <rect x="100" y="52" width="11" height="80" fill="#fde68a" opacity="0.85" />
        <rect x="54" y="80" width="38" height="38" rx="6" fill="#ffffff" />
        {icon(scene.main, 59, 85, 28, P(600))}
        {badge(146, 116, 16, scene.a, 'green')}
      </>
    ),
    // A frosted chart board: bars, a rising line, and a gold coin with the topic.
    chart: () => (
      <>
        <rect x="38" y="30" width="116" height="98" rx="12" {...glass} />
        <path d="M38 42a12 12 0 0 1 12 -12h92a12 12 0 0 1 12 12v6h-116Z" fill={url('green')} />
        {[50, 58, 66].map((x) => <circle key={x} cx={x} cy="39" r="2.5" fill="#ffffff" opacity="0.85" />)}
        {[[54, 26, 'green'], [76, 44, 'pink'], [98, 34, 'green'], [120, 56, 'pink']].map(([x, hBar, tone]) => (
          <rect key={x} x={x} y={116 - hBar} width="15" height={hBar} rx="4" fill={url(tone)} />
        ))}
        <path d="M61.5 82L83.5 64L105.5 74L127.5 52" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {[[61.5, 82], [83.5, 64], [105.5, 74], [127.5, 52]].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="3.2" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
        ))}
        {badge(154, 32, 20, scene.main, 'gold')}
      </>
    ),
    // A magnifier over a frosted product card.
    lens: () => (
      <>
        <rect x="100" y="32" width="58" height="74" rx="9" {...glass} />
        <rect x="107" y="39" width="44" height="30" rx="5" {...tint(P(100))} />
        {bar(107, 76, 36, 4, P(200))}
        {bar(107, 85, 26, 4, A(200))}
        <rect x="107" y="94" width="20" height="7" rx="3.5" {...tint(A(400))} />
        <path d="M116 102L140 126" stroke={url('pink')} strokeWidth="13" strokeLinecap="round" />
        <circle cx="90" cy="74" r="34" fill={url('lensGlass')} stroke={url('green')} strokeWidth="9" />
        {icon(scene.a, 74, 58, 32, P(600))}
      </>
    ),
    // A folded map (its middle panel frosted), a dotted road, and a pink pin.
    map: () => (
      <>
        <path d="M40 52L80 42L80 122L40 132Z" {...tint(P(200))} />
        <path d="M80 42L120 52L120 132L80 122Z" {...glass} strokeWidth="1.2" />
        <path d="M120 52L160 42L160 122L120 132Z" {...tint(P(200))} />
        <path d="M48 112C70 92 100 114 152 72" fill="none" style={{ stroke: A(300) }} strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
        <ellipse cx="100" cy="101" rx="11" ry="3.5" {...tint(P(900))} opacity="0.2" />
        <path d="M100 99C100 99 75 73 75 56a25 25 0 0 1 50 0C125 73 100 99 100 99Z" fill={url('pink')} stroke="#ffffff" strokeWidth="2.6" />
        <circle cx="100" cy="56" r="10" fill="#ffffff" />
        <circle cx="100" cy="56" r="4.5" {...tint(A(500))} />
        {badge(150, 108, 15, scene.a, 'green')}
      </>
    ),
    // Two speech bubbles: a pink one typing behind, a green one with the topic.
    bubbles: () => (
      <>
        <path d="M108 24h40a16 16 0 0 1 16 16v10a16 16 0 0 1 -16 16h-4l5 12l-17 -12h-24a16 16 0 0 1 -16 -16v-10a16 16 0 0 1 16 -16Z" fill={url('pink')} />
        {[116, 128, 140].map((x) => <circle key={x} cx={x} cy="45" r="3.2" fill="#ffffff" />)}
        <path d="M60 56h50a22 22 0 0 1 22 22v18a22 22 0 0 1 -22 22h-38l-22 16l4 -16a22 22 0 0 1 -16 -22v-18a22 22 0 0 1 22 -22Z" fill={url('green')} stroke="#ffffff" strokeWidth="3" />
        {icon(scene.main, 68, 70, 34)}
        {badge(148, 110, 14, scene.a, 'gold')}
      </>
    ),
    // The Start selling shop, larger, with the topic's badge.
    shop: () => (
      <>
        <rect x="68" y="22" width="56" height="14" rx="4" {...tint(P(700))} />
        <rect x="79" y="27" width="34" height="4" rx="2" fill="#ffffff" opacity="0.85" />
        <rect x="58" y="58" width="76" height="72" rx="5" fill={url('green')} />
        <path d="M54 36H138L142 56H50Z" fill="#ffffff" />
        {[0, 2, 4].map((i) => (
          <path key={i} d={`M${54 + i * 16.8} 36H${70.8 + i * 16.8}L${50 + (i + 1) * 18.4} 56H${50 + i * 18.4}Z`} {...tint(A(500))} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={59.2 + i * 18.4} cy="56" r="9.2" {...tint(i % 2 ? '#ffffff' : A(500))} />
        ))}
        <rect x="68" y="80" width="22" height="50" rx="4" fill="#ffffff" opacity="0.95" />
        <circle cx="84.5" cy="106" r="2" {...tint(P(600))} />
        <rect x="98" y="80" width="26" height="20" rx="4" fill="#e0f2fe" />
        <path d="M111 80V100M98 90H124" style={{ stroke: P(500) }} strokeWidth="2" />
        {badge(152, 36, 20, scene.main, 'pink')}
        {badge(148, 112, 13, scene.a, 'gold')}
      </>
    ),
    // A frosted card with the topic in a green disc.
    card: () => (
      <>
        <rect x="66" y="30" width="80" height="96" rx="12" {...tint(A(100))} transform="rotate(-8 106 78)" />
        <rect x="56" y="32" width="84" height="100" rx="12" {...glass} />
        <circle cx="98" cy="68" r="22" fill={url('green')} />
        {icon(scene.main, 85, 55, 26)}
        {bar(72, 100, 52, 5, P(200))}
        {bar(80, 110, 36, 4, A(200))}
        {badge(142, 120, 15, scene.a, 'gold')}
      </>
    ),
  };
  const draw = layouts[scene.layout] || layouts.card;

  const stop = (offset, color, opacity) => (
    <stop offset={offset} style={{ stopColor: color, ...(opacity != null ? { stopOpacity: opacity } : null) }} />
  );
  const down = { x1: '0', y1: '0', x2: '0', y2: '1' };
  const across = { x1: '0', y1: '0', x2: '1', y2: '1' };

  return (
    <span aria-hidden="true" style={{ '--ea-h': `${h}px` }} className={`empty-art ${className}`.trim()}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width={w} height={h} focusable="false">
        <defs>
          <linearGradient id={`${id}-sky`} {...down}>{stop(0, A(50))}{stop(1, P(50))}</linearGradient>
          <linearGradient id={`${id}-green`} {...down}>{stop(0, P(400))}{stop(1, P(600))}</linearGradient>
          <linearGradient id={`${id}-pink`} {...down}>{stop(0, A(400))}{stop(1, A(600))}</linearGradient>
          <linearGradient id={`${id}-gold`} {...across}>{stop(0, '#fde68a')}{stop(1, '#f59e0b')}</linearGradient>
          <linearGradient id={`${id}-amber`} {...down}>{stop(0, '#fcd34d')}{stop(1, '#f59e0b')}</linearGradient>
          <linearGradient id={`${id}-amberLid`} {...down}>{stop(0, '#fbbf24')}{stop(1, '#d97706')}</linearGradient>
          {/* Frosted glass: white the blobs show through, and its bright rim. */}
          <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0.6" y2="1">{stop(0, '#ffffff', 0.86)}{stop(1, '#ffffff', 0.58)}</linearGradient>
          <linearGradient id={`${id}-rim`} {...across}>{stop(0, '#ffffff', 1)}{stop(1, '#ffffff', 0.5)}</linearGradient>
          <linearGradient id={`${id}-lensGlass`} {...across}>{stop(0, '#ffffff', 0.72)}{stop(1, '#e0f2fe', 0.6)}</linearGradient>
          <filter id={`${id}-blur`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <clipPath id={`${id}-disc`}><circle cx="100" cy="76" r="70" /></clipPath>
        </defs>

        {/* The soft pink-to-mint disc, the blurred green and pink blobs that
            show through the glass, and the ground shadow. */}
        <circle cx="100" cy="76" r="70" fill={url('sky')} />
        <g filter={url('blur')} clipPath={url('disc')}>
          <circle cx="78" cy="60" r="30" {...tint(P(300))} opacity="0.6" />
          <circle cx="130" cy="98" r="26" {...tint(A(300))} opacity="0.55" />
        </g>
        <rect x="46" y="136" width="108" height="6" rx="3" {...tint(P(900))} opacity="0.12" />

        {draw()}

        {/* One small gold sparkle: clean, not busy. */}
        <path d={sparklePath(32, 40, 4.5)} fill="#fbbf24" />
      </svg>
    </span>
  );
}
