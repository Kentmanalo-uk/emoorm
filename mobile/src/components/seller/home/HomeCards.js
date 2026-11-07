import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon, WarningCircleIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import EmptyState from '../../EmptyState';
import LoadingSkeleton from '../../LoadingSkeleton';
import { GradientIcon } from '../../inbox/InboxGradient';
import { sellerHref } from '../sellerRoutes';
import { OrderState, OrderThumb, orderLook } from '../orders/OrderLook';
import {
  STATUS_META, formatNumber, orderDay,
} from './homeLib';
import { HOME_TOOLS, useToolArt } from './sellerTools';
import { PageLoader } from '../../BrandLoader';

/*
 * The pieces of the phone Home (web SellerDashboard.jsx PhoneHome +
 * SellerApp.css .sh-*), as styles/phone-app.css draws them on phones: each
 * section runs the full screen width, square, with an 8px grey band under it
 * (the Sales card alone keeps its rounded green card inside the gutters).
 * Titles 15.5px medium, names and numbers medium, green for actions.
 */

/** One full-width section (.sh-card / .sh-notice on phones). last: no band under it. */
export function HomeSection({ children, last = false, style, ...rest }) {
  return <View style={[homeStyles.section, last && homeStyles.sectionLast, style]} {...rest}>{children}</View>;
}

/** A section's head: the title, and a small grey link at the right (.sh-card-head). */
export function HomeHead({ title, link, onLink, style }) {
  return (
    <View style={[homeStyles.head, style]}>
      <Text style={homeStyles.h2} accessibilityRole="header">{title}</Text>
      {link ? (
        <Pressable accessibilityRole="link" onPress={onLink} hitSlop={8} style={homeStyles.headLink}>
          <Text style={homeStyles.headLinkText}>{link}</Text>
          <CaretRightIcon size={13} weight="bold" color={t.neutral[500]} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* The notice's icon stands on its own, filled with a gradient in its tone
   (web styles/iconTiles.css + ui/IconGradients.jsx: the tile's old colour,
   light at the top left into deep at the bottom right). */
const NOTICE_GRADIENTS = {
  amber: ['#FCD34D', '#D97706'],
  red: ['#FCA5A5', '#DC2626'],
  bad: ['#FCA5A5', '#DC2626'],
  blue: ['#93C5FD', '#2563EB'],
  green: ['#34D399', '#047857'],
  good: ['#34D399', '#047857'],
  none: ['#CBD5E1', '#64748B'],
};

/** The one thing Home asks for first (.sh-notice): icon, title, hint, a green pill or ›. */
export function HomeNotice({ notice }) {
  const router = useRouter();
  const gradient = NOTICE_GRADIENTS[notice.tone] || NOTICE_GRADIENTS.amber;
  const Icon = notice.Icon;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${notice.title}. ${notice.hint}${notice.cta ? `. ${notice.cta}` : ''}`}
      onPress={() => router.push(sellerHref(notice.to))}
      style={({ pressed }) => [homeStyles.section, styles.notice, pressed && styles.pressed]}
    >
      {/* The tile keeps its size, so nothing around it moves; the icon
          grows into the room its colour took (--icon-zoom 1.3). */}
      <View style={styles.noticeIcon}>
        <GradientIcon Icon={Icon} size={29} colors={gradient} />
      </View>
      <View style={styles.noticeText}>
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text style={styles.noticeHint}>{notice.hint}</Text>
      </View>
      {notice.cta ? (
        <View style={styles.noticeCta}><Text style={styles.noticeCtaText}>{notice.cta}</Text></View>
      ) : <CaretRightIcon size={16} color={t.neutral[300]} />}
    </Pressable>
  );
}

/** "Some numbers couldn't load right now." (.sdm-note) */
export function HomeLoadNote() {
  return (
    <View style={styles.note}>
      <WarningCircleIcon size={15} color={t.warning[700]} />
      <Text style={styles.noteText}>Some numbers couldn't load right now.</Text>
    </View>
  );
}

/** The numbers that need action (.sh-numbers): four columns split by hairlines. */
export function HomeNumbers({ numbers }) {
  const router = useRouter();
  return (
    <HomeSection style={styles.numbers} accessibilityLabel="Needs your action">
      {numbers.map(({ label, value, to }, i) => {
        const due = value > 0;
        return (
          <Pressable
            key={label}
            accessibilityRole="link"
            accessibilityLabel={`${label}: ${value == null ? 'unknown' : value}`}
            onPress={() => router.push(to)}
            style={({ pressed }) => [styles.number, i > 0 && styles.numberLine, pressed && styles.pressed]}
          >
            <Text style={[styles.numberValue, due && styles.numberDue]}>{value == null ? '–' : value}</Text>
            <Text style={styles.numberLabel} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </HomeSection>
  );
}

/**
 * Shop tools (.sh-tools): the tool's own mark, nothing behind it, in the
 * look and size the super admin chose (glass or 3D; 44px on phones times
 * shortcutIconScale).
 *
 * Eight here, the ones a seller opens most days; the arrow opens the
 * rest, grouped (app/seller/tools.js).
 */
export function HomeTools() {
  const router = useRouter();
  const { look, size } = useToolArt();
  return (
    <HomeSection>
      <HomeHead title="Shop tools" link="All tools" onLink={() => router.push('/seller/tools')} />
      <View style={styles.tools}>
        {HOME_TOOLS.map(({ to, label, Art, tone }) => (
          <Pressable key={to} accessibilityRole="link" accessibilityLabel={label} onPress={() => router.push(to)} style={styles.tool}>
            {({ pressed }) => (
              <>
                <View style={[styles.toolIcon, { height: size }, pressed && styles.toolIconPressed]}>
                  <Art size={size} tone={tone} look={look} />
                </View>
                <Text style={styles.toolLabel}>{label}</Text>
              </>
            )}
          </Pressable>
        ))}
      </View>
    </HomeSection>
  );
}

/** Sales (.sh-sales): the green card, the total, a 14-day spark and two counts. */
export function HomeSales({
  isLoading, analyticsAvailable, stats, recentSales, salesByDay, live,
}) {
  const router = useRouter();
  const trend = salesByDay.slice(-14).map((day) => Number(day.total || 0));
  const maxTrend = Math.max(1, ...trend);
  const done = Number(stats.completedOrders);
  return (
    <View style={styles.sales}>
      <View style={homeStyles.head}>
        <Text style={[homeStyles.h2, styles.white]} accessibilityRole="header">Sales</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/seller/analytics')} hitSlop={8} style={homeStyles.headLink}>
          <Text style={[homeStyles.headLinkText, styles.salesLink]}>Details</Text>
          <CaretRightIcon size={13} weight="bold" color="rgba(255, 255, 255, 0.85)" />
        </Pressable>
      </View>
      <View style={styles.salesRow}>
        <View style={styles.salesCol}>
          {isLoading
            ? <LoadingSkeleton width={120} height={28} borderRadius={6} style={styles.salesSkeleton} />
            : <Text style={styles.salesTotal}>{analyticsAvailable ? `₱${formatNumber(stats.lifetimeSales)}` : '—'}</Text>}
          <Text style={styles.salesSub}>
            {analyticsAvailable ? `₱${formatNumber(recentSales)} in the last 14 days` : 'Not available right now'}
          </Text>
        </View>
        {trend.length > 0 ? (
          <View style={styles.spark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {trend.map((amount, i) => (
              <View
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                style={[styles.sparkBar, i === trend.length - 1 && styles.sparkLast, { height: `${Math.max(10, (amount / maxTrend) * 100)}%` }]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.salesStats}>
        <Text style={styles.salesStat}>
          <Text style={styles.salesStatStrong}>{isLoading ? '–' : formatNumber(stats.completedOrders)}</Text>
          {` ${done === 1 ? 'order' : 'orders'} done`}
        </Text>
        <Text style={styles.salesStat}>
          <Text style={styles.salesStatStrong}>{isLoading ? '–' : formatNumber(live)}</Text>
          {` live ${Number(live) === 1 ? 'product' : 'products'}`}
        </Text>
      </View>
    </View>
  );
}

/** Recent orders (.sh-orders): the product's photo and name, the day and buyer, the total and where it stands. */
export function HomeRecentOrders({ isLoading, orders, last }) {
  const router = useRouter();
  return (
    <HomeSection last={last}>
      <HomeHead
        title="Recent orders"
        link={orders.length > 0 ? 'See all' : null}
        onLink={() => router.push('/seller/orders')}
      />
      {isLoading ? (
        <OrderListSkeleton rows={3} />
      ) : orders.length === 0 ? (
        <EmptyState compact art="orders" text="No orders yet. They show up here as soon as a buyer orders." />
      ) : (
        <View style={styles.orders}>
          {orders.map((o, i) => (
            <OrderRow key={o.id} order={o} first={i === 0} onPress={() => router.push({ pathname: '/seller/orders', params: { id: o.id } })} />
          ))}
        </View>
      )}
    </HomeSection>
  );
}

/**
 * A recent order as the seller thinks of it: the product's photo (where the
 * order stands as a badge on its corner) and name, who ordered and when, the
 * total over where it stands and how far along. The order number stays on
 * the order itself.
 */
function OrderRow({ order, first, onPress }) {
  const { label } = STATUS_META[order.status] || { label: order.status };
  const { photo, name, more, qty } = orderLook(order);
  // The day first, so a long name is what gets cut.
  const meta = [orderDay(order.createdAt), order.buyer?.fullName].filter(Boolean).join(' · ');
  const extra = more > 0 ? ` + ${more} more` : qty > 1 ? ` × ${qty}` : '';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.order, !first && styles.orderLine, pressed && styles.pressed]}
    >
      {({ pressed }) => (
        <>
          <OrderThumb photo={photo} status={order.status} size={48} ring={pressed ? t.neutral[50] : t.neutral[0]} />
          <View style={styles.orderBody}>
            <Text style={styles.orderName} numberOfLines={1}>
              {name}
              {extra ? <Text style={styles.orderSmall}>{extra}</Text> : null}
            </Text>
            <Text style={styles.orderMeta} numberOfLines={1}>{meta}</Text>
          </View>
          <View style={styles.orderRight}>
            <Text style={styles.orderTotal}>₱{formatNumber(order.total)}</Text>
            <OrderState status={order.status} label={label} />
          </View>
        </>
      )}
    </Pressable>
  );
}

/** Web Skeleton.OrderList: a square, two lines, and a price over a pill. */
function OrderListSkeleton({ rows = 3 }) {
  return <PageLoader size={40} minHeight={120} label="Loading orders" />;
}

/** Running low (.sh-list): plain rows, a warning icon, the name and how many are left. */
export function HomeRunningLow({ items, last }) {
  const router = useRouter();
  return (
    <HomeSection last={last} style={styles.lowSection}>
      <HomeHead title="Running low" style={styles.lowHead} />
      {items.map((prod, i) => (
        <Pressable
          key={prod.id}
          accessibilityRole="link"
          accessibilityLabel={`${prod.name}, ${prod.stock} left`}
          onPress={() => router.push('/seller/products')}
          style={({ pressed }) => [styles.lowRow, i > 0 && styles.lowLine, pressed && styles.pressed]}
        >
          <View style={styles.lowIcon}><WarningCircleIcon size={29} weight="fill" color={t.warning[500]} /></View>
          <Text style={styles.lowLabel} numberOfLines={1}>{prod.name}</Text>
          <Text style={styles.lowHint}>{prod.stock} left</Text>
          <CaretRightIcon size={16} color={t.neutral[300]} />
        </Pressable>
      ))}
    </HomeSection>
  );
}

export const homeStyles = themed(() => StyleSheet.create({
  // .sh-card on phones (styles/phone-app.css): out to the screen edges.
  section: {
    marginHorizontal: -12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 8,
    borderBottomColor: t.neutral[100],
  },
  sectionLast: { borderBottomWidth: 0 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12,
  },
  h2: { flexShrink: 1, fontSize: 15.5, lineHeight: 18, color: t.neutral[900], ...font(500) },
  headLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headLinkText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(500) },
}));

const styles = themed(() => StyleSheet.create({
  pressed: { backgroundColor: t.neutral[50] },
  white: { color: t.onBrand },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
  },
  noticeIcon: {
    width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
  },
  noticeText: { flex: 1, minWidth: 0, gap: 1 },
  noticeTitle: { fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900], ...font(400) },
  noticeHint: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  noticeCta: { flexShrink: 0, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.primary[600] },
  noticeCtaText: { fontSize: 13, lineHeight: 20.8, color: t.onBrand, ...font(500) },

  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 20.8, color: t.warning[700], ...font(400) },

  numbers: { flexDirection: 'row', paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  number: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 1, paddingVertical: 14, paddingHorizontal: 2,
  },
  numberLine: { borderLeftWidth: 1, borderLeftColor: t.neutral[100] },
  numberValue: { fontSize: 18, lineHeight: 28.8, color: t.neutral[900], ...font(500) },
  numberDue: { color: t.primary[700] },
  numberLabel: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], textAlign: 'center', ...font(400) },

  // Four columns, 18px between rows and 4px between columns.
  tools: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, marginHorizontal: -2, paddingBottom: 2 },
  tool: { width: '25%', minWidth: 0, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  toolIcon: { height: 36, alignItems: 'center', justifyContent: 'center' },
  toolIconPressed: { opacity: 0.7 },
  toolLabel: { fontSize: 12.5, lineHeight: 15.6, color: t.neutral[700], textAlign: 'center', ...font(400) },

  sales: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.primary[700] },
  salesLink: { color: 'rgba(255, 255, 255, 0.85)' },
  salesRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  salesCol: { flexShrink: 1, gap: 2 },
  salesSkeleton: { backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  salesTotal: { fontSize: 26, lineHeight: 29.9, color: t.onBrand, ...font(500) },
  salesSub: { fontSize: 13, lineHeight: 20.8, color: 'rgba(255, 255, 255, 0.86)', ...font(400) },
  spark: { flexDirection: 'row', flexShrink: 0, alignItems: 'flex-end', gap: 3, width: 112, height: 40 },
  sparkBar: {
    flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  sparkLast: { backgroundColor: t.neutral[0] },
  salesStats: {
    flexDirection: 'row', gap: 18, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  salesStat: { fontSize: 13, lineHeight: 20.8, color: 'rgba(255, 255, 255, 0.76)', ...font(400) },
  salesStatStrong: { color: t.onBrand, ...font(500) },

  orders: { marginHorizontal: -16, marginBottom: -8 },
  order: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16,
  },
  orderLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  orderBody: { flex: 1, minWidth: 0, gap: 2 },
  orderName: { fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900], ...font(500) },
  orderSmall: { fontSize: 12.5, color: t.neutral[500], ...font(400) },
  orderMeta: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  orderRight: { flexShrink: 0, alignItems: 'flex-end', gap: 4 },
  orderTotal: { fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900], ...font(500) },

  skRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4,
  },
  skLine: { borderBottomWidth: 1, borderBottomColor: t.neutral[100] },
  skLines: { flex: 1, minWidth: 0, gap: 6 },
  skRight: { alignItems: 'flex-end', gap: 6 },

  lowSection: { paddingBottom: 2 },
  lowHead: { marginBottom: 2 },
  lowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48,
  },
  lowLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  lowIcon: { width: 24, height: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  lowLabel: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 24, color: t.neutral[800], ...font(400) },
  lowHint: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
}));
