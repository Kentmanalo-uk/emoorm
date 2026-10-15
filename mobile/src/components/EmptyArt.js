import { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop,
} from 'react-native-svg';
import {
  ArrowCounterClockwiseIcon, ArrowUpRightIcon, BellIcon, CalendarBlankIcon, CameraIcon, ChartBarIcon, ChartLineUpIcon,
  ChatCircleDotsIcon, ChatCircleTextIcon, ChatTeardropTextIcon, CheckCircleIcon, ClockCounterClockwiseIcon, ClockIcon,
  CoffeeIcon, CoinsIcon, CreditCardIcon, DeviceMobileIcon, EnvelopeSimpleIcon, FlagIcon, GearIcon, HandshakeIcon, HeadsetIcon, HeartIcon,
  HeartbeatIcon, HouseIcon, IdentificationCardIcon, ImageSquareIcon, ImagesIcon, KeyIcon, LaptopIcon, LightningIcon,
  MagnifyingGlassIcon, MapPinIcon, MapTrifoldIcon, MegaphoneIcon, NotePencilIcon, PackageIcon, PaperPlaneTiltIcon,
  PercentIcon, PiggyBankIcon, PlusIcon, ReceiptIcon, RocketLaunchIcon, ShieldCheckIcon, ShoppingBagIcon, ShoppingCartIcon,
  SmileyIcon, SparkleIcon, SquaresFourIcon, StarIcon, StorefrontIcon, TagIcon, TicketIcon, TrayIcon, TrendUpIcon,
  TruckIcon, UploadSimpleIcon, UserPlusIcon, UsersThreeIcon, WrenchIcon,
} from 'phosphor-react-native';
import { t } from '../theme';

/**
 * Picture for an empty state, in the Start selling sticker's style
 * (home/StartSellingBubble): flat shapes in the brand's green, pink and gold
 * on a soft pink-to-mint disc, white details, round badges with a white rim,
 * and one small sparkle. One per topic; same scene names as the website's
 * (web/src/components/ui/EmptyArt.jsx), which keeps its own glass look.
 * Decorative (hidden from screen readers): the heading beside it says what
 * is empty.
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
  // Livestock deals: a handshake over a price, talked over in chat.
  offers: { layout: 'bubbles', main: HandshakeIcon, a: TagIcon, b: ChatCircleDotsIcon },
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

/** A four-point sparkle centred on (x, y), straight-edged like the Start selling sticker's. */
const sparklePath = (x, y, r) => {
  const p = r * 0.29;
  const q = r * 0.71;
  return `M${x} ${y - r}l${p} ${q} ${q} ${p} ${-q} ${p} ${-p} ${q} ${-p} ${-q} ${-q} ${-p} ${q} ${-p}Z`;
};

// Icons on a gold badge are drawn in dark amber (the peso on the sticker's coin).
const GOLD_INK = '#92400e';

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
  // A Phosphor icon, `s` wide, its corner at (x, y).
  const icon = (Icon, x, y, s, fill = '#ffffff') => (
    <G transform={`translate(${x} ${y}) scale(${s / 256})`} fill={fill}>
      {iconPaths(Icon)}
    </G>
  );
  // A round sticker badge (the Start selling coin): a gradient disc with a
  // white rim and its icon in the middle.
  const badge = (cx, cy, r, Icon, tone = 'pink') => (
    <G>
      <Circle cx={cx} cy={cy + 1.5} r={r} fill={t.primary[900]} opacity="0.12" />
      <Circle cx={cx} cy={cy} r={r} fill={url(tone)} stroke="#ffffff" strokeWidth="2.6" />
      {icon(Icon, cx - r * 0.56, cy - r * 0.56, r * 1.12, tone === 'gold' ? GOLD_INK : '#ffffff')}
    </G>
  );
  const bar = (x, y, wBar, hBar, fill) => <Rect x={x} y={y} width={wBar} height={hBar} rx={hBar / 2} fill={fill} />;

  // ── The compositions ──
  const layouts = {
    // A phone with a list on screen, and the topic's badge beside it.
    device: () => (
      <>
        <Rect x="72" y="16" width="58" height="118" rx="13" fill={url('green')} />
        <Rect x="77" y="27" width="48" height="98" rx="7" fill="#ffffff" />
        <Rect x="93" y="20" width="16" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />
        {[[40, t.accent[400], 1], [60, t.primary[400], 1], [80, '#fbbf24', 0.55]].map(([y, dot, op]) => (
          <G key={y} opacity={op}>
            <Rect x="81" y={y} width="40" height="16" rx="5" fill={t.primary[50]} />
            <Circle cx="89" cy={y + 8} r="4" fill={dot} />
            {bar(96, y + 4.5, 20, 3, t.primary[300])}
            {bar(96, y + 10, 13, 2.5, t.primary[200])}
          </G>
        ))}
        <Rect x="88" y="108" width="26" height="8" rx="4" fill={t.primary[500]} />
        {badge(140, 42, 22, scene.main, 'pink')}
        <Circle cx="156" cy="25" r="6" fill={url('gold')} stroke="#ffffff" strokeWidth="2" />
        {badge(60, 106, 13, scene.a, 'gold')}
      </>
    ),
    // Parcels: an amber box with a label in front, a pink one behind.
    stack: () => (
      <>
        <G transform="rotate(7 126 60)">
          <Rect x="98" y="34" width="56" height="50" rx="6" fill={url('pink')} />
          <Rect x="121" y="34" width="10" height="50" fill="#ffffff" opacity="0.45" />
        </G>
        <Rect x="46" y="60" width="84" height="72" rx="6" fill={url('amber')} />
        <Rect x="42" y="52" width="92" height="16" rx="4" fill={url('amberLid')} />
        <Rect x="100" y="52" width="11" height="80" fill="#fde68a" opacity="0.85" />
        <Rect x="54" y="80" width="38" height="38" rx="6" fill="#ffffff" />
        {icon(scene.main, 59, 85, 28, t.primary[600])}
        {badge(146, 116, 16, scene.a, 'green')}
      </>
    ),
    // A chart board: bars, a rising line, and a gold coin with the topic.
    chart: () => (
      <>
        <Rect x="38" y="30" width="116" height="98" rx="12" fill="#ffffff" stroke={t.primary[100]} strokeWidth="2" />
        <Path d="M38 42a12 12 0 0 1 12 -12h92a12 12 0 0 1 12 12v6h-116Z" fill={url('green')} />
        {[50, 58, 66].map((x) => <Circle key={x} cx={x} cy="39" r="2.5" fill="#ffffff" opacity="0.85" />)}
        {[[54, 26, 'green'], [76, 44, 'pink'], [98, 34, 'green'], [120, 56, 'pink']].map(([x, hBar, tone]) => (
          <Rect key={x} x={x} y={116 - hBar} width="15" height={hBar} rx="4" fill={url(tone)} />
        ))}
        <Path d="M61.5 82L83.5 64L105.5 74L127.5 52" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {[[61.5, 82], [83.5, 64], [105.5, 74], [127.5, 52]].map(([x, y]) => (
          <Circle key={x} cx={x} cy={y} r="3.2" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
        ))}
        {badge(154, 32, 20, scene.main, 'gold')}
      </>
    ),
    // A magnifier over a product card.
    lens: () => (
      <>
        <Rect x="100" y="32" width="58" height="74" rx="9" fill="#ffffff" stroke={t.primary[100]} strokeWidth="2" />
        <Rect x="107" y="39" width="44" height="30" rx="5" fill={t.primary[100]} />
        {bar(107, 76, 36, 4, t.primary[200])}
        {bar(107, 85, 26, 4, t.accent[200])}
        <Rect x="107" y="94" width="20" height="7" rx="3.5" fill={t.accent[400]} />
        <Path d="M116 102L140 126" stroke={url('pink')} strokeWidth="13" strokeLinecap="round" />
        <Circle cx="90" cy="74" r="34" fill="#e0f2fe" stroke={url('green')} strokeWidth="9" />
        <Path d="M70 60a24 24 0 0 1 22 -10" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
        {icon(scene.a, 74, 58, 32, t.primary[600])}
      </>
    ),
    // A folded map, a dotted road, and a pink pin.
    map: () => (
      <>
        <Path d="M40 52L80 42L80 122L40 132Z" fill={t.primary[200]} />
        <Path d="M80 42L120 52L120 132L80 122Z" fill={t.primary[50]} />
        <Path d="M120 52L160 42L160 122L120 132Z" fill={t.primary[200]} />
        <Path d="M48 112C70 92 100 114 152 72" fill="none" stroke={t.accent[300]} strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
        <Ellipse cx="100" cy="101" rx="11" ry="3.5" fill={t.primary[900]} opacity="0.2" />
        <Path d="M100 99C100 99 75 73 75 56a25 25 0 0 1 50 0C125 73 100 99 100 99Z" fill={url('pink')} stroke="#ffffff" strokeWidth="2.6" />
        <Circle cx="100" cy="56" r="10" fill="#ffffff" />
        <Circle cx="100" cy="56" r="4.5" fill={t.accent[500]} />
        {badge(150, 108, 15, scene.a, 'green')}
      </>
    ),
    // Two speech bubbles: a pink one typing behind, a green one with the topic.
    bubbles: () => (
      <>
        <Path d="M108 24h40a16 16 0 0 1 16 16v10a16 16 0 0 1 -16 16h-4l5 12l-17 -12h-24a16 16 0 0 1 -16 -16v-10a16 16 0 0 1 16 -16Z" fill={url('pink')} />
        {[116, 128, 140].map((x) => <Circle key={x} cx={x} cy="45" r="3.2" fill="#ffffff" />)}
        <Path d="M60 56h50a22 22 0 0 1 22 22v18a22 22 0 0 1 -22 22h-38l-22 16l4 -16a22 22 0 0 1 -16 -22v-18a22 22 0 0 1 22 -22Z" fill={url('green')} stroke="#ffffff" strokeWidth="3" />
        {icon(scene.main, 68, 70, 34)}
        {badge(148, 110, 14, scene.a, 'gold')}
      </>
    ),
    // The Start selling shop, larger, with the topic's badge.
    shop: () => (
      <>
        <Rect x="68" y="22" width="56" height="14" rx="4" fill={t.primary[700]} />
        <Rect x="79" y="27" width="34" height="4" rx="2" fill="#ffffff" opacity="0.85" />
        <Rect x="58" y="58" width="76" height="72" rx="5" fill={url('green')} />
        <Path d="M54 36H138L142 56H50Z" fill="#ffffff" />
        {[0, 2, 4].map((i) => (
          <Path key={i} d={`M${54 + i * 16.8} 36H${70.8 + i * 16.8}L${50 + (i + 1) * 18.4} 56H${50 + i * 18.4}Z`} fill={t.accent[500]} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <Circle key={i} cx={59.2 + i * 18.4} cy="56" r="9.2" fill={i % 2 ? '#ffffff' : t.accent[500]} />
        ))}
        <Rect x="68" y="80" width="22" height="50" rx="4" fill="#ffffff" opacity="0.95" />
        <Circle cx="84.5" cy="106" r="2" fill={t.primary[600]} />
        <Rect x="98" y="80" width="26" height="20" rx="4" fill="#e0f2fe" />
        <Path d="M111 80V100M98 90H124" stroke={t.primary[500]} strokeWidth="2" />
        {badge(152, 36, 20, scene.main, 'pink')}
        {badge(148, 112, 13, scene.a, 'gold')}
      </>
    ),
    // A card with the topic in a green disc.
    card: () => (
      <>
        <Rect x="66" y="30" width="80" height="96" rx="12" fill={t.accent[100]} transform="rotate(-8 106 78)" />
        <Rect x="56" y="32" width="84" height="100" rx="12" fill="#ffffff" stroke={t.primary[100]} strokeWidth="2" />
        <Circle cx="98" cy="68" r="22" fill={url('green')} />
        {icon(scene.main, 85, 55, 26)}
        {bar(72, 100, 52, 5, t.primary[200])}
        {bar(80, 110, 36, 4, t.accent[200])}
        {badge(142, 120, 15, scene.a, 'gold')}
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
          <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.accent[50]} />
            <Stop offset="1" stopColor={t.primary[50]} />
          </LinearGradient>
          <LinearGradient id={`${id}-green`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.primary[400]} />
            <Stop offset="1" stopColor={t.primary[600]} />
          </LinearGradient>
          <LinearGradient id={`${id}-pink`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.accent[400]} />
            <Stop offset="1" stopColor={t.accent[600]} />
          </LinearGradient>
          <LinearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fde68a" />
            <Stop offset="1" stopColor="#f59e0b" />
          </LinearGradient>
          <LinearGradient id={`${id}-amber`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fcd34d" />
            <Stop offset="1" stopColor="#f59e0b" />
          </LinearGradient>
          <LinearGradient id={`${id}-amberLid`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fbbf24" />
            <Stop offset="1" stopColor="#d97706" />
          </LinearGradient>
        </Defs>

        {/* The soft pink-to-mint disc behind, and the ground shadow. */}
        <Circle cx="100" cy="76" r="70" fill={url('sky')} />
        <Rect x="46" y="136" width="108" height="6" rx="3" fill={t.primary[900]} opacity="0.12" />

        {draw()}

        {/* One small gold sparkle: clean, not busy. */}
        <Path d={sparklePath(32, 40, 4.5)} fill="#fbbf24" />
      </Svg>
    </View>
  );
}
