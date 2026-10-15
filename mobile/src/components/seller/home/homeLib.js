import {
  ArrowCounterClockwiseIcon, ChartBarIcon, CookingPotIcon, IdentificationCardIcon, LockSimpleIcon, PackageIcon,
  PlusCircleIcon, ReceiptIcon, StarIcon, WalletIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import { t } from '../../../theme';
import { sellBlockers, setupNextTo } from '../sellerSetup';

/*
 * The phone Home's facts and words (web/src/pages/SellerDashboard.jsx,
 * PhoneHome and the helpers beside it): the order statuses, the shop tools,
 * the one notice Home asks for first, and how numbers and days are written.
 */

/** Where an order stands, as coloured words (.sh-order-status.is-<tint>). */
export const STATUS_META = {
  PENDING: { label: 'New', tint: 'amber' },
  CONFIRMED: { label: 'Confirmed', tint: 'blue' },
  PREPARING: { label: 'Preparing', tint: 'blue' },
  TO_SHIP: { label: 'To ship', tint: 'blue' },
  READY: { label: 'Ready', tint: 'blue' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tint: 'blue' },
  SHIPPED: { label: 'Shipped', tint: 'blue' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', tint: 'blue' },
  DELIVERED: { label: 'Delivered', tint: 'green' },
  PICKED_UP: { label: 'Picked up', tint: 'green' },
  COMPLETED: { label: 'Completed', tint: 'green' },
  CANCELLED: { label: 'Cancelled', tint: 'red' },
};

export const STATUS_COLORS = {
  amber: t.warning[700],
  blue: t.info[700],
  green: t.primary[700],
  red: t.danger[700],
};

/** Home's shop tools, each a filled icon in its own colour (a ToolGradients tone). */
export const HOME_TOOLS = [
  { to: '/seller/products', label: 'My products', Icon: PackageIcon, tone: 'orange' },
  { to: '/seller/orders', label: 'My orders', Icon: ReceiptIcon, tone: 'blue' },
  { to: '/seller/analytics', label: 'Performance', Icon: ChartBarIcon, tone: 'violet' },
  { to: '/seller/finance', label: 'Finance', Icon: WalletIcon, tone: 'green' },
  { to: '/seller/reviews', label: 'Reviews', Icon: StarIcon, tone: 'amber' },
  { to: '/seller/returns', label: 'Returns', Icon: ArrowCounterClockwiseIcon, tone: 'rose' },
  { to: '/seller/today', label: "Today's menu", Icon: CookingPotIcon, tone: 'pink' },
  { to: '/seller/products/new', label: 'Add product', Icon: PlusCircleIcon, tone: 'teal' },
];

/** Products buyers can see (ready to sell or not: that only decides ordering). */
export const liveProducts = (stats) => stats.activeProducts;

/**
 * The one thing Home asks for first, or null: the shop is private, buyers
 * cannot order yet because something an order needs is missing, or the ID
 * needs doing. The rest is the "Complete your shop" card.
 */
export const homeNotice = (store, setup) => {
  const identity = setup?.steps?.find((step) => step.key === 'identity');
  if (store?.isApproved === false) {
    return {
      Icon: LockSimpleIcon,
      tone: 'amber',
      title: 'Your shop is private',
      hint: "It's hidden from buyers until the admin approves it.",
      cta: 'Set up',
      to: setupNextTo(setup),
    };
  }
  const blockers = sellBlockers(setup);
  if (blockers.length) {
    return {
      Icon: WarningCircleIcon,
      tone: 'amber',
      title: "Buyers can't order yet",
      hint: `Finish: ${blockers.map((b) => b.label).join(', ')}`,
      cta: 'Finish',
      to: setupNextTo(setup),
    };
  }
  if (identity && !identity.done) {
    if (identity.status === 'FAILED') {
      return { Icon: IdentificationCardIcon, tone: 'red', title: "We couldn't confirm your ID", hint: 'Send a clear photo of a valid ID.', cta: 'Retry', to: '/seller/verification' };
    }
    if (identity.status === 'PENDING') {
      return { Icon: IdentificationCardIcon, tone: 'blue', title: 'Checking your ID', hint: "We'll let you know when it's done.", cta: null, to: '/seller/verification' };
    }
    return { Icon: IdentificationCardIcon, tone: 'amber', title: 'Verify your identity', hint: 'Buyers and admins trust verified shops.', cta: 'Verify', to: '/seller/verification' };
  }
  return null;
};

/** 1,234 (whole pesos and counts, as the website writes them). */
export function formatNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-PH', { maximumFractionDigits: 0 });
}

/** "Today, 3:20 PM", "Yesterday", or "Sep 26". */
export const orderDay = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `Today, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

/** What Home shows before anything has loaded. */
export const EMPTY_STATS = {
  lifetimeSales: 0,
  completedOrders: 0,
  activeProducts: 0,
  avgOrderValue: 0,
};

/**
 * Home's numbers from the three answers (analytics, recent orders, the
 * seller's products), as the website builds them. Each answer is the
 * settled promise ({ status, value }).
 */
export function buildHome(analyticsRes, ordersRes, productsRes) {
  const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value.data : null;
  const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
  const products = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];
  const failed = analyticsRes.status === 'rejected' && ordersRes.status === 'rejected';
  return {
    failed,
    next: {
      analyticsAvailable: Boolean(analytics?.kpis),
      recentOrders: orders.slice(0, 5),
      lowStock: analytics?.lowStock?.slice(0, 5) || [],
      salesByDay: analytics?.salesByDay?.slice(-14) || [],
      stats: analytics?.kpis
        ? {
          lifetimeSales: analytics.kpis.lifetimeRevenue?.value ?? 0,
          completedOrders: analytics.kpis.orders?.value ?? 0,
          activeProducts: analytics.kpis.activeProducts?.value ?? products.length,
          avgOrderValue: analytics.kpis.avgOrderValue?.value ?? 0,
        }
        : {
          ...EMPTY_STATS,
          activeProducts: products.filter((p) => p.status === 'APPROVED').length,
        },
    },
  };
}
