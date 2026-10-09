import { useId } from 'react';
import {
  ClockCounterClockwise, Lightning, CheckCircle, ChartBar, TrendUp, CalendarBlank, Clock, Tray,
  EnvelopeSimple, Bell, RocketLaunch, Storefront, Sparkle, Wrench, Gear, Heartbeat, ShieldCheck,
  CreditCard, Receipt, MapPin, MapTrifold, House, Package, Tag, Plus, ChartLineUp, Coins,
  ArrowUpRight, PiggyBank, ShoppingBag, Heart, Star, ChatCircleText, ChatCircleDots, PaperPlaneTilt,
  Smiley, Truck, Laptop, Coffee, NotePencil, ArrowCounterClockwise, UsersThree, IdentificationCard,
  MagnifyingGlass, Flag, ChatTeardropText, SquaresFour, ShoppingCart, UserPlus, Megaphone,
  ImageSquare, UploadSimple, Ticket, Percent, Headset, Images, Camera, Key, DeviceMobile, Handshake,
} from '@phosphor-icons/react';
import './EmptyArt.css';

/**
 * Picture for an empty state: a small, minimal glassmorphism scene in the
 * theme's greens (with a touch of teal). Each topic has its own composition: a
 * phone for notifications, a stack of parcels for orders and products, a
 * chart panel for numbers, a magnifier for search, a map tile for places,
 * speech bubbles for conversations, a storefront for shops and shopping,
 * and a glass card for the rest. One frosted shape over a soft blurred glow,
 * the topic's icon in a gradient, at most one small chip, two faint sparkles.
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
  // A chart panel: numbers over time.
  analytics: { layout: 'chart', main: ChartBar, a: TrendUp, b: CalendarBlank },
  revenue: { layout: 'chart', main: ChartLineUp, a: Coins, b: ArrowUpRight },
  savings: { layout: 'chart', main: PiggyBank, a: Coins, b: Sparkle },
  activity: { layout: 'chart', main: ClockCounterClockwise, a: Lightning, b: CheckCircle },
  payments: { layout: 'chart', main: CreditCard, a: Receipt, b: CheckCircle },
  // A magnifier over blurred results.
  search: { layout: 'lens', main: MagnifyingGlass, a: Package, b: Sparkle },
  // A map tile with a pin.
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
  // A glass card holding the icon.
  users: { layout: 'card', main: UsersThree, a: IdentificationCard, b: MagnifyingGlass },
  reports: { layout: 'card', main: Flag, a: ShieldCheck, b: ChatCircleText },
  healthy: { layout: 'card', main: Heartbeat, a: ShieldCheck, b: Storefront },
  maintenance: { layout: 'card', main: Wrench, a: Gear, b: CheckCircle },
  workspace: { layout: 'card', main: Laptop, a: Coffee, b: NotePencil },
  calendar: { layout: 'card', main: CalendarBlank, a: Clock, b: CheckCircle },
  security: { layout: 'card', main: ShieldCheck, a: Key, b: DeviceMobile },
};

// The scene is 200 × 160; it is drawn a quarter larger than the `size`
// (height) callers ask for.
const VIEW_W = 200;
const VIEW_H = 160;
const SCALE = 1.25;

const P = (step, fallback) => `var(--t-primary-${step}, ${fallback})`;

/** A four-point sparkle centred on (x, y). */
const sparklePath = (x, y, r) => {
  const k = r * 0.18;
  return `M${x} ${y - r}C${x + k} ${y - k} ${x + k} ${y - k} ${x + r} ${y}C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + r}C${x - k} ${y + k} ${x - k} ${y + k} ${x - r} ${y}C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - r}Z`;
};

export default function EmptyArt({ name, size = 96, className = '' }) {
  const scene = SCENES[name] || SCENES.inbox;
  const id = `ea${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const h = Math.round(size * SCALE);
  const w = Math.round((h * VIEW_W) / VIEW_H);
  const url = (part) => `url(#${id}-${part})`;

  // ── Building blocks ──
  // Page rules such as `.admin-empty svg { width: 200px; fill: currentColor }`
  // also reach these inner icons; inline styles keep them as drawn.
  const icon = (Icon, x, y, s, key) => (
    <Icon
      key={key}
      x={x}
      y={y}
      size={s}
      weight="fill"
      style={{
        width: s, height: s, margin: 0, padding: 0, opacity: 1, display: 'inline', overflow: 'visible',
        background: 'none', fill: `${url('main')} ${P(600, '#059669')}`,
      }}
    />
  );
  const glass = { fill: url('glass'), stroke: url('edge'), strokeWidth: 1.3 };
  const chip = (cx, cy, r, Icon) => (
    <g>
      <circle cx={cx} cy={cy} r={r} {...glass} filter={url('lift')} />
      {icon(Icon, cx - r * 0.6, cy - r * 0.6, r * 1.2)}
    </g>
  );
  const sparkle = (x, y, r, fill) => <path d={sparklePath(x, y, r)} style={{ fill }} />;
  const bar = (x, y, wBar, hBar, step = 200, fallback = '#a7f3d0', opacity = 0.9) => (
    <rect x={x} y={y} width={wBar} height={hBar} rx={hBar / 2} style={{ fill: P(step, fallback) }} opacity={opacity} />
  );

  // ── The compositions ──
  const layouts = {
    card: () => (
      <>
        <rect x="62" y="30" width="84" height="96" rx="20" transform="rotate(-9 104 78)" {...glass} opacity="0.5" />
        <rect x="56" y="34" width="88" height="96" rx="22" {...glass} strokeWidth="1.4" filter={url('lift')} />
        <path d="M56 34h52L56 112Z" fill="#ffffff" opacity="0.3" clipPath={url('clip-card')} />
        {icon(scene.main, 70, 52, 60)}
        {chip(148, 112, 16, scene.a)}
      </>
    ),
    device: () => (
      <>
        <rect x="70" y="14" width="62" height="128" rx="16" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <rect x="91" y="21" width="20" height="4" rx="2" fill="#ffffff" opacity="0.9" />
        {[52, 78].map((y, i) => (
          <g key={y} opacity={1 - i * 0.35}>
            <rect x="77" y={y} width="48" height="18" rx="7" fill="#ffffff" opacity="0.75" />
            <circle cx="86" cy={y + 9} r="4.5" style={{ fill: P(300, '#6ee7b7') }} />
            {bar(94, y + 7.25, 24, 3.5, 200)}
          </g>
        ))}
        <circle cx="138" cy="46" r="25" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 122, 30, 32)}
        <circle cx="157" cy="27" r="5.5" style={{ fill: P(500, '#10b981') }} stroke="#ffffff" strokeWidth="2" />
      </>
    ),
    stack: () => (
      <>
        <rect x="80" y="30" width="76" height="70" rx="16" transform="rotate(8 118 65)" {...glass} opacity="0.6" />
        <rect x="50" y="48" width="86" height="82" rx="18" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <path d="M50 48h44L50 102Z" fill="#ffffff" opacity="0.3" clipPath={url('clip-stack')} />
        {icon(scene.main, 67, 63, 52)}
        {chip(150, 112, 16, scene.a)}
      </>
    ),
    chart: () => (
      <>
        <rect x="40" y="34" width="120" height="94" rx="18" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {[[60, 30], [82, 48], [104, 38], [126, 60]].map(([x, hBar], i) => (
          <rect key={x} x={x} y={114 - hBar} width="14" height={hBar} rx="5" fill={url('main')} opacity={0.55 + i * 0.15} />
        ))}
        <circle cx="156" cy="36" r="21" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 143, 23, 26)}
      </>
    ),
    lens: () => (
      <>
        <rect x="104" y="34" width="56" height="64" rx="13" {...glass} opacity="0.55" />
        <circle cx="94" cy="72" r="38" fill="#ffffff" opacity="0.6" filter={url('lift')} />
        <circle cx="94" cy="72" r="38" fill="none" stroke={url('main')} strokeWidth="8" />
        <path d="M74 54a26 26 0 0 1 30 -8" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <path d="M122 100L146 124" stroke={url('main')} strokeWidth="13" strokeLinecap="round" />
        {icon(scene.a, 78, 56, 32)}
      </>
    ),
    map: () => (
      <>
        <path d="M100 116L34 90L100 64L166 90Z" style={{ fill: P(300, '#6ee7b7') }} opacity="0.4" transform="translate(0 7)" />
        <path d="M100 116L34 90L100 64L166 90Z" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <ellipse cx="100" cy="90" rx="14" ry="5" style={{ fill: P(800, '#065f46') }} opacity="0.18" />
        {icon(scene.main, 70, 22, 62)}
      </>
    ),
    bubbles: () => (
      <>
        <path d="M100 24h44a20 20 0 0 1 20 20v12a20 20 0 0 1 -20 20h-4l4 14l-18 -14h-26a20 20 0 0 1 -20 -20v-12a20 20 0 0 1 20 -20Z" {...glass} opacity="0.6" />
        <path d="M60 56h50a22 22 0 0 1 22 22v18a22 22 0 0 1 -22 22h-38l-22 16l4 -16a22 22 0 0 1 -16 -22v-18a22 22 0 0 1 22 -22Z" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 66, 63, 48)}
      </>
    ),
    shop: () => (
      <>
        <rect x="52" y="60" width="96" height="76" rx="10" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <rect x="44" y="42" width="112" height="22" rx="8" fill={url('main')} />
        {[58, 86, 114, 142].map((x) => <rect key={x} x={x - 7} y="42" width="14" height="22" fill="#ffffff" opacity="0.3" />)}
        <rect x="87" y="92" width="26" height="44" rx="6" fill="#ffffff" opacity="0.6" />
        <circle cx="160" cy="36" r="22" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 146, 22, 28)}
      </>
    ),
  };
  const draw = layouts[scene.layout] || layouts.card;

  return (
    <span aria-hidden="true" style={{ '--ea-h': `${h}px` }} className={`empty-art ${className}`.trim()}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width={w} height={h} focusable="false">
        <defs>
          <linearGradient id={`${id}-main`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: P(300, '#6ee7b7') }} />
            <stop offset="1" style={{ stopColor: P(700, '#047857') }} />
          </linearGradient>
          <linearGradient id={`${id}-blob`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: P(200, '#a7f3d0') }} />
            <stop offset="1" style={{ stopColor: P(500, '#10b981') }} />
          </linearGradient>
          <linearGradient id={`${id}-teal`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a5f3fc" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.25" />
          </linearGradient>
          <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id={`${id}-lift`} x="-40%" y="-40%" width="180%" height="190%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" style={{ floodColor: P(800, '#065f46'), floodOpacity: 0.16 }} />
          </filter>
          <clipPath id={`${id}-clip-card`}><rect x="56" y="34" width="88" height="96" rx="22" /></clipPath>
          <clipPath id={`${id}-clip-stack`}><rect x="48" y="54" width="84" height="78" rx="17" /></clipPath>
        </defs>

        {/* Colour behind the glass, and the ground shadow. */}
        <g filter={url('blur')}>
          <circle cx="76" cy="64" r="44" fill={url('blob')} opacity="0.65" />
          <circle cx="134" cy="104" r="34" fill={url('teal')} opacity="0.42" />
        </g>
        <ellipse cx="100" cy="148" rx="50" ry="6" style={{ fill: P(800, '#065f46') }} opacity="0.1" />

        {draw()}

        {/* Two faint sparkles. */}
        {sparkle(176, 92, 5.5, P(300, '#6ee7b7'))}
        {sparkle(28, 54, 4.5, '#5eead4')}
      </svg>
    </span>
  );
}
