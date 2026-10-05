import { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, FeDropShadow, FeGaussianBlur, Filter, G, LinearGradient, Path, Rect, Stop,
} from 'react-native-svg';
import {
  ArrowCounterClockwiseIcon, ArrowUpRightIcon, BellIcon, CalendarBlankIcon, CameraIcon, ChartBarIcon, ChartLineUpIcon,
  ChatCircleDotsIcon, ChatCircleTextIcon, ChatTeardropTextIcon, CheckCircleIcon, ClockCounterClockwiseIcon, ClockIcon,
  CoffeeIcon, CoinsIcon, CreditCardIcon, DeviceMobileIcon, EnvelopeSimpleIcon, FlagIcon, GearIcon, HeadsetIcon, HeartIcon,
  HeartbeatIcon, HouseIcon, IdentificationCardIcon, ImageSquareIcon, ImagesIcon, KeyIcon, LaptopIcon, LightningIcon,
  MagnifyingGlassIcon, MapPinIcon, MapTrifoldIcon, MegaphoneIcon, NotePencilIcon, PackageIcon, PaperPlaneTiltIcon,
  PercentIcon, PiggyBankIcon, PlusIcon, ReceiptIcon, RocketLaunchIcon, ShieldCheckIcon, ShoppingBagIcon, ShoppingCartIcon,
  SmileyIcon, SparkleIcon, SquaresFourIcon, StarIcon, StorefrontIcon, TagIcon, TicketIcon, TrayIcon, TrendUpIcon,
  TruckIcon, UploadSimpleIcon, UserPlusIcon, UsersThreeIcon, WrenchIcon,
} from 'phosphor-react-native';
import { t } from '../theme';

/**
 * Picture for an empty state (web/src/components/ui/EmptyArt.jsx): a small
 * glassmorphism scene in the theme's greens with a touch of teal, one per
 * topic. Same scene names as the website. Decorative (hidden from screen
 * readers): the heading beside it says what is empty.
 *
 * `size` is the website's prop; the app draws the website's phone size
 * (a quarter larger, then 1.4×, at most 260 tall).
 */
const SCENES = {
  // Phone: alerts and inboxes.
  notifications: { layout: 'device', main: BellIcon, a: CheckCircleIcon, b: SparkleIcon },
  inbox: { layout: 'device', main: TrayIcon, a: EnvelopeSimpleIcon, b: BellIcon },
  followers: { layout: 'device', main: UserPlusIcon, a: HeartIcon, b: BellIcon },
  // A stack of parcels / cards: things you list, ship or send back.
  products: { layout: 'stack', main: PackageIcon, a: TagIcon, b: PlusIcon },
  orders: { layout: 'stack', main: ReceiptIcon, a: ShoppingBagIcon, b: CheckCircleIcon },
  returns: { layout: 'stack', main: ArrowCounterClockwiseIcon, a: PackageIcon, b: ReceiptIcon },
  delivery: { layout: 'stack', main: TruckIcon, a: PackageIcon, b: MapPinIcon },
  categories: { layout: 'stack', main: SquaresFourIcon, a: TagIcon, b: PlusIcon },
  vouchers: { layout: 'stack', main: TicketIcon, a: TagIcon, b: PercentIcon },
  banners: { layout: 'stack', main: ImageSquareIcon, a: UploadSimpleIcon, b: SparkleIcon },
  gallery: { layout: 'stack', main: ImagesIcon, a: CameraIcon, b: MapPinIcon },
  // A chart panel: numbers over time.
  analytics: { layout: 'chart', main: ChartBarIcon, a: TrendUpIcon, b: CalendarBlankIcon },
  revenue: { layout: 'chart', main: ChartLineUpIcon, a: CoinsIcon, b: ArrowUpRightIcon },
  savings: { layout: 'chart', main: PiggyBankIcon, a: CoinsIcon, b: SparkleIcon },
  activity: { layout: 'chart', main: ClockCounterClockwiseIcon, a: LightningIcon, b: CheckCircleIcon },
  payments: { layout: 'chart', main: CreditCardIcon, a: ReceiptIcon, b: CheckCircleIcon },
  // A magnifier over blurred results.
  search: { layout: 'lens', main: MagnifyingGlassIcon, a: PackageIcon, b: SparkleIcon },
  // A map tile with a pin.
  places: { layout: 'map', main: MapPinIcon, a: MapTrifoldIcon, b: HouseIcon },
  addresses: { layout: 'map', main: MapPinIcon, a: HouseIcon, b: PlusIcon },
  // Speech bubbles: talking, rating, help.
  messages: { layout: 'bubbles', main: ChatCircleDotsIcon, a: PaperPlaneTiltIcon, b: SmileyIcon },
  feedback: { layout: 'bubbles', main: ChatTeardropTextIcon, a: SmileyIcon, b: StarIcon },
  reviews: { layout: 'bubbles', main: StarIcon, a: ChatCircleTextIcon, b: HeartIcon },
  support: { layout: 'bubbles', main: HeadsetIcon, a: ChatCircleDotsIcon, b: ShieldCheckIcon },
  announcements: { layout: 'bubbles', main: MegaphoneIcon, a: UsersThreeIcon, b: SparkleIcon },
  // A storefront with an awning: shops and shopping.
  stores: { layout: 'shop', main: StorefrontIcon, a: MapPinIcon, b: StarIcon },
  following: { layout: 'shop', main: HeartIcon, a: BellIcon, b: StarIcon },
  cart: { layout: 'shop', main: ShoppingCartIcon, a: TagIcon, b: PlusIcon },
  wishlist: { layout: 'shop', main: HeartIcon, a: ShoppingBagIcon, b: SparkleIcon },
  shopping: { layout: 'shop', main: ShoppingBagIcon, a: TagIcon, b: HeartIcon },
  launch: { layout: 'shop', main: RocketLaunchIcon, a: SparkleIcon, b: StarIcon },
  // A glass card holding the icon.
  users: { layout: 'card', main: UsersThreeIcon, a: IdentificationCardIcon, b: MagnifyingGlassIcon },
  reports: { layout: 'card', main: FlagIcon, a: ShieldCheckIcon, b: ChatCircleTextIcon },
  healthy: { layout: 'card', main: HeartbeatIcon, a: ShieldCheckIcon, b: StorefrontIcon },
  maintenance: { layout: 'card', main: WrenchIcon, a: GearIcon, b: CheckCircleIcon },
  workspace: { layout: 'card', main: LaptopIcon, a: CoffeeIcon, b: NotePencilIcon },
  calendar: { layout: 'card', main: CalendarBlankIcon, a: ClockIcon, b: CheckCircleIcon },
  security: { layout: 'card', main: ShieldCheckIcon, a: KeyIcon, b: DeviceMobileIcon },
};

export const EMPTY_ART_NAMES = Object.keys(SCENES);

// The scene is 200 × 160; the website draws it a quarter larger than `size`,
// and phones 1.4× that (EmptyArt.css), never taller than 260.
const VIEW_W = 200;
const VIEW_H = 160;
const SCALE = 1.25;
const PHONE = 1.4;
const MAX_H = 260;

/** The height the scene takes for a `size` (to lay out around it). */
export const emptyArtHeight = (size = 96) => Math.min(Math.round(size * SCALE) * PHONE, MAX_H);

/** A four-point sparkle centred on (x, y). */
const sparklePath = (x, y, r) => {
  const k = r * 0.18;
  return `M${x} ${y - r}C${x + k} ${y - k} ${x + k} ${y - k} ${x + r} ${y}C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + r}C${x - k} ${y + k} ${x - k} ${y + k} ${x - r} ${y}C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - r}Z`;
};

// A Phosphor icon's filled paths (its 256-unit drawing), to place inside the
// scene's own <Svg> instead of nesting another <Svg>.
const iconPaths = (Icon) => Icon({}).props.weights.get('fill');

export default function EmptyArt({ name, size = 96, style }) {
  const scene = SCENES[name] || SCENES.inbox;
  const id = `ea${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const h = emptyArtHeight(size);
  const w = (h * VIEW_W) / VIEW_H;
  const url = (part) => `url(#${id}-${part})`;

  // ── Building blocks ──
  const icon = (Icon, x, y, s) => (
    <G transform={`translate(${x} ${y}) scale(${s / 256})`} fill={url('main')}>
      {iconPaths(Icon)}
    </G>
  );
  const glass = { fill: url('glass'), stroke: url('edge'), strokeWidth: 1.3 };
  const chip = (cx, cy, r, Icon) => (
    <G>
      <Circle cx={cx} cy={cy} r={r} {...glass} filter={url('lift')} />
      {icon(Icon, cx - r * 0.6, cy - r * 0.6, r * 1.2)}
    </G>
  );
  const sparkle = (x, y, r, fill) => <Path d={sparklePath(x, y, r)} fill={fill} />;
  const bar = (x, y, wBar, hBar, fill = t.primary[200], opacity = 0.9) => (
    <Rect x={x} y={y} width={wBar} height={hBar} rx={hBar / 2} fill={fill} opacity={opacity} />
  );

  // ── The compositions ──
  const layouts = {
    card: () => (
      <>
        <Rect x="62" y="30" width="84" height="96" rx="20" transform="rotate(-9 104 78)" {...glass} opacity="0.5" />
        <Rect x="56" y="34" width="88" height="96" rx="22" {...glass} strokeWidth="1.4" filter={url('lift')} />
        <Path d="M56 34h52L56 112Z" fill="#ffffff" opacity="0.3" clipPath={url('clip-card')} />
        {icon(scene.main, 70, 52, 60)}
        {chip(148, 112, 16, scene.a)}
      </>
    ),
    device: () => (
      <>
        <Rect x="70" y="14" width="62" height="128" rx="16" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <Rect x="91" y="21" width="20" height="4" rx="2" fill="#ffffff" opacity="0.9" />
        {[52, 78].map((y, i) => (
          <G key={y} opacity={1 - i * 0.35}>
            <Rect x="77" y={y} width="48" height="18" rx="7" fill="#ffffff" opacity="0.75" />
            <Circle cx="86" cy={y + 9} r="4.5" fill={t.primary[300]} />
            {bar(94, y + 7.25, 24, 3.5)}
          </G>
        ))}
        <Circle cx="138" cy="46" r="25" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 122, 30, 32)}
        <Circle cx="157" cy="27" r="5.5" fill={t.primary[500]} stroke="#ffffff" strokeWidth="2" />
      </>
    ),
    stack: () => (
      <>
        <Rect x="80" y="30" width="76" height="70" rx="16" transform="rotate(8 118 65)" {...glass} opacity="0.6" />
        <Rect x="50" y="48" width="86" height="82" rx="18" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <Path d="M50 48h44L50 102Z" fill="#ffffff" opacity="0.3" clipPath={url('clip-stack')} />
        {icon(scene.main, 67, 63, 52)}
        {chip(150, 112, 16, scene.a)}
      </>
    ),
    chart: () => (
      <>
        <Rect x="40" y="34" width="120" height="94" rx="18" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {[[60, 30], [82, 48], [104, 38], [126, 60]].map(([x, hBar], i) => (
          <Rect key={x} x={x} y={114 - hBar} width="14" height={hBar} rx="5" fill={url('main')} opacity={0.55 + i * 0.15} />
        ))}
        <Circle cx="156" cy="36" r="21" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 143, 23, 26)}
      </>
    ),
    lens: () => (
      <>
        <Rect x="104" y="34" width="56" height="64" rx="13" {...glass} opacity="0.55" />
        <Circle cx="94" cy="72" r="38" fill="#ffffff" opacity="0.6" filter={url('lift')} />
        <Circle cx="94" cy="72" r="38" fill="none" stroke={url('main')} strokeWidth="8" />
        <Path d="M74 54a26 26 0 0 1 30 -8" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        <Path d="M122 100L146 124" stroke={url('main')} strokeWidth="13" strokeLinecap="round" />
        {icon(scene.a, 78, 56, 32)}
      </>
    ),
    map: () => (
      <>
        <Path d="M100 116L34 90L100 64L166 90Z" fill={t.primary[300]} opacity="0.4" transform="translate(0 7)" />
        <Path d="M100 116L34 90L100 64L166 90Z" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <Ellipse cx="100" cy="90" rx="14" ry="5" fill={t.primary[800]} opacity="0.18" />
        {icon(scene.main, 70, 22, 62)}
      </>
    ),
    bubbles: () => (
      <>
        <Path d="M100 24h44a20 20 0 0 1 20 20v12a20 20 0 0 1 -20 20h-4l4 14l-18 -14h-26a20 20 0 0 1 -20 -20v-12a20 20 0 0 1 20 -20Z" {...glass} opacity="0.6" />
        <Path d="M60 56h50a22 22 0 0 1 22 22v18a22 22 0 0 1 -22 22h-38l-22 16l4 -16a22 22 0 0 1 -16 -22v-18a22 22 0 0 1 22 -22Z" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 66, 63, 48)}
      </>
    ),
    shop: () => (
      <>
        <Rect x="52" y="60" width="96" height="76" rx="10" {...glass} strokeWidth="1.5" filter={url('lift')} />
        <Rect x="44" y="42" width="112" height="22" rx="8" fill={url('main')} />
        {[58, 86, 114, 142].map((x) => <Rect key={x} x={x - 7} y="42" width="14" height="22" fill="#ffffff" opacity="0.3" />)}
        <Rect x="87" y="92" width="26" height="44" rx="6" fill="#ffffff" opacity="0.6" />
        <Circle cx="160" cy="36" r="22" {...glass} strokeWidth="1.5" filter={url('lift')} />
        {icon(scene.main, 146, 22, 28)}
      </>
    ),
  };
  const draw = layouts[scene.layout] || layouts.card;

  return (
    <View
      style={[{ width: w, height: h, alignSelf: 'center', flexShrink: 0 }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width={w} height={h} style={{ overflow: 'visible' }}>
        <Defs>
          <LinearGradient id={`${id}-main`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.primary[300]} />
            <Stop offset="1" stopColor={t.primary[700]} />
          </LinearGradient>
          <LinearGradient id={`${id}-blob`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.primary[200]} />
            <Stop offset="1" stopColor={t.primary[500]} />
          </LinearGradient>
          <LinearGradient id={`${id}-teal`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#a5f3fc" />
            <Stop offset="1" stopColor="#14b8a6" />
          </LinearGradient>
          <LinearGradient id={`${id}-glass`} x1="0" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0.4" />
          </LinearGradient>
          <LinearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0.25" />
          </LinearGradient>
          <Filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <FeGaussianBlur stdDeviation="9" />
          </Filter>
          <Filter id={`${id}-lift`} x="-40%" y="-40%" width="180%" height="190%">
            <FeDropShadow dx="0" dy="6" stdDeviation="6" floodColor={t.primary[800]} floodOpacity={0.16} />
          </Filter>
          <ClipPath id={`${id}-clip-card`}><Rect x="56" y="34" width="88" height="96" rx="22" /></ClipPath>
          <ClipPath id={`${id}-clip-stack`}><Rect x="48" y="54" width="84" height="78" rx="17" /></ClipPath>
        </Defs>

        {/* Colour behind the glass, and the ground shadow. */}
        <G filter={url('blur')}>
          <Circle cx="76" cy="64" r="44" fill={url('blob')} opacity="0.65" />
          <Circle cx="134" cy="104" r="34" fill={url('teal')} opacity="0.42" />
        </G>
        <Ellipse cx="100" cy="148" rx="50" ry="6" fill={t.primary[800]} opacity="0.1" />

        {draw()}

        {/* Two faint sparkles. */}
        {sparkle(176, 92, 5.5, t.primary[300])}
        {sparkle(28, 54, 4.5, '#5eead4')}
      </Svg>
    </View>
  );
}
