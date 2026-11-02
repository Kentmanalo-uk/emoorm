import {
  BellArt, BrushArt, BuoyArt, BubbleArt, ChartArt, ChatArt, GearArt, HeadsetArt, IdCardArt, MegaphoneArt,
  PackageArt, PinArt, PlusArt, PotArt, QrArt, QuestionArt, ReceiptArt, ReturnArt, ShopArt, SparkArt,
  StarArt, TagArt, TONES, TruckArt, WalletArt,
} from '../../art/FlatArt';

/**
 * Every tool in the Seller Center, in groups: the full list behind the
 * arrow on Home's Shop tools (app/seller/tools.js), and the eight Home
 * itself shows.
 *
 * One list, not two. Home's eight are picked out of this by key below, so
 * a tool cannot end up on Home pointing somewhere the full page does not
 * know about, and a new tool is added in exactly one place.
 *
 * `tone` is only given where a mark is borrowed from elsewhere and should
 * not arrive in the colour it has there; the rest keep their own.
 */
export const TOOL_SECTIONS = [
  {
    key: 'selling',
    title: 'Selling',
    tools: [
      { key: 'products', to: '/seller/products', label: 'My products', Art: PackageArt },
      { key: 'add', to: '/seller/products/new', label: 'Add product', Art: PlusArt },
      { key: 'today', to: '/seller/today', label: "Today's menu", Art: PotArt, tone: TONES.pink },
      { key: 'offers', to: '/seller/offers', label: 'Offers', Art: TagArt },
    ],
  },
  {
    key: 'orders',
    title: 'Orders',
    tools: [
      { key: 'orders', to: '/seller/orders', label: 'My orders', Art: ReceiptArt },
      { key: 'returns', to: '/seller/returns', label: 'Returns', Art: ReturnArt, tone: TONES.rose },
      { key: 'fulfillment', to: '/seller/fulfillment', label: 'Delivery', Art: TruckArt },
      { key: 'qr', to: '/seller/shop-qr', label: 'Shop QR', Art: QrArt },
    ],
  },
  {
    key: 'shop',
    title: 'My shop',
    tools: [
      { key: 'store', to: '/seller/store', label: 'Shop profile', Art: ShopArt },
      { key: 'decorate', to: '/seller/decorate', label: 'Decorate', Art: BrushArt },
      { key: 'settings', to: '/seller/settings', label: 'Settings', Art: GearArt },
      { key: 'verification', to: '/seller/verification', label: 'Verify ID', Art: IdCardArt },
    ],
  },
  {
    key: 'buyers',
    title: 'Buyers',
    tools: [
      { key: 'messages', to: '/seller/messages', label: 'Chat', Art: ChatArt },
      { key: 'questions', to: '/seller/questions', label: 'Questions', Art: QuestionArt },
      { key: 'reviews', to: '/seller/reviews', label: 'Reviews', Art: StarArt },
      { key: 'marketing', to: '/seller/marketing', label: 'Marketing', Art: MegaphoneArt },
    ],
  },
  {
    key: 'business',
    title: 'Business',
    tools: [
      { key: 'analytics', to: '/seller/analytics', label: 'Performance', Art: ChartArt },
      { key: 'finance', to: '/seller/finance', label: 'Finance', Art: WalletArt },
      { key: 'assistant', to: '/seller/assistant', label: 'Ate Moormy', Art: SparkArt, tone: TONES.violet },
      { key: 'notifications', to: '/seller/notifications', label: 'Notifications', Art: BellArt },
    ],
  },
  {
    key: 'help',
    title: 'Help',
    tools: [
      { key: 'support', to: '/seller/support', label: 'Admin', Art: HeadsetArt },
      { key: 'help', to: '/help-center', label: 'Help centre', Art: BuoyArt },
      { key: 'feedback', to: '/feedback', label: 'Feedback', Art: BubbleArt },
      { key: 'addresses', to: '/addresses', label: 'Addresses', Art: PinArt },
    ],
  },
];

/** Every tool, flat, by key. */
export const TOOLS_BY_KEY = Object.fromEntries(
  TOOL_SECTIONS.flatMap((section) => section.tools).map((tool) => [tool.key, tool]),
);

/**
 * The eight on Home: the ones a seller opens most days. The rest are a
 * tap further on, behind the arrow.
 */
export const HOME_TOOL_KEYS = [
  'products', 'orders', 'analytics', 'finance',
  'reviews', 'returns', 'today', 'add',
];

export const HOME_TOOLS = HOME_TOOL_KEYS.map((key) => {
  const tool = TOOLS_BY_KEY[key];
  if (!tool) throw new Error(`Home asks for a tool that does not exist: ${key}`);
  return tool;
});
