import { useId } from 'react';
import {
  SquaresFour, Package, Camera, ClipboardText, ArrowCounterClockwise, ChatCircleDots, Lightbulb,
  Megaphone, PaintBrush, UserCircle, Storefront, Truck, ChartLineUp, Wallet, Star, Question,
  Bell, Headset, GearSix, CookingPot, IdentificationCard, Briefcase, Image as ImageIcon, NotePencil,
  MapPin, QrCode, RocketLaunch, Confetti,
} from '@phosphor-icons/react';
import './SellerGuideArt.css';

/**
 * Pictures for the Seller Center's first-visit sheets on phones: minimal
 * glass. One frosted shape holding the page's icon in the pink-to-green
 * gradient, a tilted pane behind it, and soft glows of colour underneath.
 * It floats gently (still for reduced motion). Nothing else: no chips,
 * no sparkles. Decorative: the sheet's title says what the page is.
 */
const SCENES = {
  home: { Icon: SquaresFour, shape: 'square', tilt: -10 },
  products: { Icon: Package, shape: 'square', tilt: 9 },
  newProduct: { Icon: Camera, shape: 'circle', tilt: 0 },
  orders: { Icon: ClipboardText, shape: 'phone', tilt: 10 },
  today: { Icon: CookingPot, shape: 'circle', tilt: 0 },
  // The guided setup (/seller/welcome).
  welcome: { Icon: Confetti, shape: 'circle', tilt: 0 },
  identity: { Icon: IdentificationCard, shape: 'wide', tilt: -7 },
  business: { Icon: Briefcase, shape: 'square', tilt: 9 },
  payout: { Icon: Wallet, shape: 'square', tilt: -9 },
  branding: { Icon: ImageIcon, shape: 'wide', tilt: 7 },
  about: { Icon: NotePencil, shape: 'bubble', tilt: -8 },
  delivery: { Icon: Truck, shape: 'wide', tilt: -6 },
  pickup: { Icon: MapPin, shape: 'circle', tilt: 0 },
  payment: { Icon: QrCode, shape: 'square', tilt: 8 },
  product: { Icon: Camera, shape: 'circle', tilt: 0 },
  ready: { Icon: RocketLaunch, shape: 'circle', tilt: 0 },
  returns: { Icon: ArrowCounterClockwise, shape: 'circle', tilt: 0 },
  messages: { Icon: ChatCircleDots, shape: 'bubble', tilt: 8 },
  assistant: { Icon: Lightbulb, shape: 'bubble', tilt: -8 },
  marketing: { Icon: Megaphone, shape: 'wide', tilt: -7 },
  decorate: { Icon: PaintBrush, shape: 'phone', tilt: -10 },
  menu: { Icon: UserCircle, shape: 'phone', tilt: 9 },
  store: { Icon: Storefront, shape: 'square', tilt: -9 },
  fulfillment: { Icon: Truck, shape: 'wide', tilt: 7 },
  analytics: { Icon: ChartLineUp, shape: 'wide', tilt: -6 },
  finance: { Icon: Wallet, shape: 'square', tilt: 10 },
  reviews: { Icon: Star, shape: 'circle', tilt: 0 },
  questions: { Icon: Question, shape: 'bubble', tilt: -8 },
  notifications: { Icon: Bell, shape: 'circle', tilt: 0 },
  support: { Icon: Headset, shape: 'circle', tilt: 0 },
  settings: { Icon: GearSix, shape: 'square', tilt: 8 },
};

// The front shape, centred on (140, 80) in a 280 × 168 scene, with the box
// the icon sits in. `back` is the pane behind it (before tilting).
const SHAPES = {
  square: {
    front: (p) => <rect x="94" y="34" width="92" height="92" rx="26" {...p} />,
    back: (p) => <rect x="112" y="24" width="84" height="84" rx="24" {...p} />,
    icon: { cx: 140, cy: 80, s: 66 },
  },
  circle: {
    front: (p) => <circle cx="140" cy="80" r="48" {...p} />,
    back: (p) => <circle cx="170" cy="62" r="34" {...p} />,
    icon: { cx: 140, cy: 80, s: 64 },
  },
  bubble: {
    front: (p) => <path d="M118 38h44a28 28 0 0 1 28 28v18a28 28 0 0 1 -28 28h-30l-24 18l4 -20a28 28 0 0 1 -22 -26v-18a28 28 0 0 1 28 -28Z" {...p} />,
    back: (p) => <rect x="128" y="26" width="76" height="60" rx="26" {...p} />,
    icon: { cx: 140, cy: 75, s: 58 },
  },
  phone: {
    front: (p) => <rect x="108" y="20" width="64" height="118" rx="18" {...p} />,
    back: (p) => <rect x="128" y="28" width="58" height="104" rx="16" {...p} />,
    icon: { cx: 140, cy: 82, s: 50 },
    notch: true,
  },
  wide: {
    front: (p) => <rect x="80" y="40" width="120" height="80" rx="24" {...p} />,
    back: (p) => <rect x="100" y="26" width="104" height="68" rx="22" {...p} />,
    icon: { cx: 140, cy: 80, s: 64 },
  },
};

export default function SellerGuideArt({ name, className = '' }) {
  const id = `sga${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const url = (part) => `url(#${id}-${part})`;
  const { Icon, shape, tilt } = SCENES[name] || SCENES.home;
  const geo = SHAPES[shape];
  const glass = { fill: url('glass'), stroke: url('edge'), strokeWidth: 1.5 };
  const { cx, cy, s } = geo.icon;

  return (
    <svg className={`sga ${className}`.trim()} viewBox="0 0 280 168" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-icon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="sga-stop-p" />
          <stop offset="1" className="sga-stop-g" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.42" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={`${id}-lift`} x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" className="sga-lift" />
        </filter>
        <clipPath id={`${id}-clip`}>{geo.front({})}</clipPath>
      </defs>

      {/* Colour behind the glass. */}
      <g filter={url('blur')}>
        <circle className="sga-glow sga-glow-g" cx="112" cy="70" r="46" />
        <circle className="sga-glow sga-glow-p" cx="178" cy="100" r="36" />
      </g>
      <ellipse className="sga-ground" cx="140" cy="152" rx="56" ry="6" />

      {/* The pane behind, tilted. */}
      <g className="sga-sway">
        <g transform={`rotate(${tilt || 12} 150 70)`} opacity="0.6">{geo.back(glass)}</g>
      </g>

      {/* The glass with the icon, floating. */}
      <g className="sga-float">
        {geo.front({ ...glass, filter: url('lift') })}
        <path d="M60 10h110L60 120Z" fill="#ffffff" opacity="0.28" clipPath={url('clip')} />
        {geo.notch && <rect x="130" y="27" width="20" height="4" rx="2" fill="#ffffff" opacity="0.9" />}
        <Icon
          x={cx - s / 2}
          y={cy - s / 2}
          size={s}
          weight="fill"
          style={{ fill: `${url('icon')} var(--t-primary-600, #059669)`, overflow: 'visible' }}
        />
      </g>
    </svg>
  );
}
