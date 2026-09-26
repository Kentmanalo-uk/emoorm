import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import {
  Plus, Clock, Truck, CheckCircle, Package,
  ShoppingBag, TrendUp as TrendingUp, Star, ChartBar as BarChart2, User, Users, WarningCircle, X,
  IdentificationCard, ArrowRight, Wallet, CaretRight, LockSimple, Bell, Receipt,
  ArrowCounterClockwise, PaintBrush, Megaphone, ShareNetwork, ListChecks, PlusCircle,
} from '@phosphor-icons/react';
import { useShare } from '../components/ShareSheet';
import { usePhoneLayout } from '../hooks/useMobileNav';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useAuthStore from '../store/authStore';
import Skeleton from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import { getSellerFollowerStats, subscribeToFollowChanges } from '../lib/follow';
import { completeGuide, shouldShowGuide } from '../lib/sellerGuides';
import { describeStep } from '../lib/sellerSetup';

const DASHBOARD_GUIDE = 'dashboard';
import './SellerDashboard.css';
import './Profile.css';

const STATUS_META = {
  PENDING: { label: 'New', tint: 'sc-tint-amber', Icon: Clock },
  CONFIRMED: { label: 'Confirmed', tint: 'sc-tint-blue', Icon: CheckCircle },
  PREPARING: { label: 'Preparing', tint: 'sc-tint-blue', Icon: Package },
  TO_SHIP: { label: 'To ship', tint: 'sc-tint-blue', Icon: Truck },
  READY: { label: 'To ship', tint: 'sc-tint-blue', Icon: Truck },
  OUT_FOR_DELIVERY: { label: 'On the way', tint: 'sc-tint-blue', Icon: Truck },
  READY_FOR_PICKUP: { label: 'Ready for pickup', tint: 'sc-tint-blue', Icon: Package },
  DELIVERED: { label: 'Delivered', tint: 'sc-tint-green', Icon: CheckCircle },
  PICKED_UP: { label: 'Picked up', tint: 'sc-tint-green', Icon: CheckCircle },
  COMPLETED: { label: 'Completed', tint: 'sc-tint-green', Icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', tint: 'sc-tint-red', Icon: Clock },
};

const TOUR_STEPS = [
  {
    target: '[data-tour="add-product"]',
    title: 'List your first product',
    text: 'Add products here, then manage their stock, photos, and visibility from Products.',
  },
  {
    target: '[data-tour="store-overview"]',
    title: 'Your store at a glance',
    text: 'Track sales, completed orders, active products, and average order value here.',
  },
  {
    target: '[data-tour="recent-orders"]',
    title: 'Keep orders moving',
    text: 'Open recent orders to confirm them and update each fulfillment status.',
  },
];

export default function SellerDashboard() {
  const { user } = useAuthStore();
  const ctx = useOutletContext();
  const store = ctx?.store;
  const setStore = ctx?.setStore;
  const setup = ctx?.setup;
  const navigate = useNavigate();

  // A new seller sees Shop setup before the dashboard: the first visit goes
  // there (it marks itself seen), and the tour waits until after it.
  const setupUnseen = shouldShowGuide(store, 'setup-intro');
  useEffect(() => {
    if (setupUnseen && setup && !setup.complete) navigate('/seller/setup', { replace: true });
  }, [setupUnseen, setup, navigate]);
  const tourEligible = shouldShowGuide(store, DASHBOARD_GUIDE) && (!setupUnseen || setup?.complete === true);

  // Reminders from the setup checklist: the ID check until it is done, and
  // overall progress until the shop is ready (the seller may hide that one).
  const identityStep = setup?.steps?.find((step) => step.key === 'identity') || null;
  const identityMeta = identityStep && !identityStep.done ? describeStep(identityStep) : null;
  const showSetupCard = Boolean(setup && !setup.complete && shouldShowGuide(store, 'setup-card'));
  const setupNext = setup?.steps?.find(
    (step) => !step.done && !step.optional && !step.waiting && step.key !== 'identity',
  ) || null;

  const [recentOrders, setRecentOrders] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [salesByDay, setSalesByDay] = useState([]);
  const [stats, setStats] = useState({
    lifetimeSales: 0,
    completedOrders: 0,
    activeProducts: 0,
    avgOrderValue: 0,
  });
  const [followerStats, setFollowerStats] = useState(null);
  const [followerStatsLoading, setFollowerStatsLoading] = useState(true);
  const [followerStatsError, setFollowerStatsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [analyticsAvailable, setAnalyticsAvailable] = useState(true);
  const [showTour, setShowTour] = useState(false);

  // Shown once, only after the shop exists; progress is saved on the shop.
  useEffect(() => {
    if (!tourEligible) return undefined;
    const timer = window.setTimeout(() => setShowTour(true), 500);
    return () => window.clearTimeout(timer);
  }, [tourEligible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(false);
      const [analyticsRes, ordersRes, productsRes] = await Promise.allSettled([
        axios.get('/analytics/seller'),
        axios.get('/orders/store/orders', { params: { pageSize: 5 } }),
        axios.get('/products/my/products', { params: { pageSize: 100 } }),
      ]);
      if (cancelled) return;

      const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value.data : null;
      const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
      const products = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];

      if (analyticsRes.status === 'rejected' && ordersRes.status === 'rejected') {
        setLoadError(true);
      }
      setAnalyticsAvailable(Boolean(analytics?.kpis));

      setRecentOrders(orders.slice(0, 5));
      setLowStock(analytics?.lowStock?.slice(0, 5) || []);
      setSalesByDay(analytics?.salesByDay?.slice(-14) || []);

      if (analytics?.kpis) {
        setStats({
          lifetimeSales: analytics.kpis.lifetimeRevenue?.value ?? 0,
          completedOrders: analytics.kpis.orders?.value ?? 0,
          activeProducts: analytics.kpis.activeProducts?.value ?? products.length,
          avgOrderValue: analytics.kpis.avgOrderValue?.value ?? 0,
        });
      } else {
        setStats({
          lifetimeSales: 0,
          completedOrders: 0,
          activeProducts: products.filter((p) => p.status === 'APPROVED').length,
          avgOrderValue: 0,
        });
      }

      // Product performance is only meaningful when supplied by seller analytics.
      if (analytics?.topProducts?.length) {
        const byId = Object.fromEntries(products.map((p) => [p.id, p]));
        setTopProducts(
          analytics.topProducts
            .slice(0, 3)
            .map((tp) => byId[tp.id] || tp)
        );
      } else {
        setTopProducts([]);
      }

      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load follower stats once we have a store id, and refetch on cross-tab follow changes
  useEffect(() => {
    if (!store?.id) return undefined;
    let cancelled = false;
    const load = async () => {
      setFollowerStatsLoading(true);
      setFollowerStatsError(false);
      try {
        const data = await getSellerFollowerStats(store.id);
        if (!cancelled) setFollowerStats(data);
      } catch {
        if (!cancelled) setFollowerStatsError(true);
      } finally {
        if (!cancelled) setFollowerStatsLoading(false);
      }
    };
    load();
    const unsub = subscribeToFollowChanges((msg) => {
      if (msg?.storeId === store.id) load();
    });
    return () => { cancelled = true; unsub(); };
  }, [store?.id]);

  const shopName = store?.name || (user?.fullName ? `${user.fullName}'s Shop` : 'Your Shop');
  const recentSales = salesByDay.reduce((sum, day) => sum + Number(day.total || 0), 0);
  const todayLabel = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());

  // Phones: the counts on Home (orders to confirm / ship, reviews to answer).
  const isPhone = usePhoneLayout();
  const [homeCounts, setHomeCounts] = useState({});
  useEffect(() => {
    if (!isPhone) return undefined;
    let cancelled = false;
    const total = (res) => res.pagination?.total ?? (res.data || []).length;
    Promise.all([
      ...HOME_ORDER_STATUSES.map((status) => axios
        .get('/orders/store/orders', { params: { status, pageSize: 1 } })
        .then((res) => [status, total(res)])
        .catch(() => [status, 0])),
      axios.get('/reviews/seller/mine', { params: { unrepliedOnly: true, pageSize: 1 } })
        .then((res) => ['reviews', total(res)])
        .catch(() => ['reviews', 0]),
    ]).then((entries) => { if (!cancelled) setHomeCounts(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [isPhone]);

  if (isPhone) {
    return (
      <PhoneHome
        store={store}
        user={user}
        setup={setup}
        waiting={ctx?.waiting || {}}
        unreadCount={ctx?.unreadCount || 0}
        switchToPersonal={ctx?.switchToPersonal}
        isLoading={isLoading}
        loadError={loadError}
        analyticsAvailable={analyticsAvailable}
        stats={stats}
        salesByDay={salesByDay}
        recentSales={recentSales}
        recentOrders={recentOrders}
        lowStock={lowStock}
        counts={homeCounts}
        onOpenOrder={(id) => navigate(`/seller/orders?id=${id}`)}
      />
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Hi, {user?.fullName?.split(' ')[0] || 'Seller'}</h1>
            <p className="seller-welcome">Here is an overview of {shopName} as of {todayLabel}.</p>
          </div>
          <div className="seller-header-actions">
            <Link to="/seller/products/new" className="btn-seller-primary" data-tour="add-product">
              <Plus size={16} /> Add Product
            </Link>
          </div>
        </div>

        {/* Identity reminder: sellers verify after applying */}
        {identityMeta && (
          <section className={`sd-idv is-${identityMeta.tone}`} aria-label="Identity verification">
            <span className="sd-idv-icon"><IdentificationCard size={24} weight="fill" /></span>
            <div className="sd-idv-body">
              <strong>
                {identityMeta.tone === 'failed'
                  ? "We couldn't confirm your ID"
                  : identityMeta.tone === 'waiting' ? 'Checking your ID' : 'Verify your identity'}
              </strong>
              <p>
                {identityMeta.tone === 'todo'
                  ? 'Scan a valid ID so the admin can approve your shop faster. It takes about a minute.'
                  : identityMeta.text}
              </p>
            </div>
            {identityMeta.tone !== 'waiting' && (
              <Link to="/seller/verification" className="sd-card-btn">
                {identityMeta.action} <ArrowRight size={15} weight="bold" />
              </Link>
            )}
          </section>
        )}

        {/* Shop setup progress, until the shop is ready */}
        {showSetupCard && (
          <section className="sd-setup" aria-label="Shop setup">
            <div className="sd-setup-body">
              <div className="sd-setup-head">
                <strong>Finish setting up your shop</strong>
                <button
                  type="button"
                  className="sd-card-hide"
                  aria-label="Hide shop setup from the dashboard"
                  title="Hide (Shop setup stays in the menu)"
                  onClick={() => completeGuide('setup-card', setStore)}
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
              <p>
                {setup.doneCount} of {setup.total} done
                {setupNext ? ` · Next: ${describeStep(setupNext, { municipality: setup.municipality }).title}` : ''}
              </p>
              <div className="sd-setup-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((setup.doneCount / Math.max(1, setup.total)) * 100)}%` }} />
              </div>
            </div>
            <div className="sd-setup-actions">
              <Link to="/seller/setup" className="sd-card-btn">
                Continue setup <ArrowRight size={15} weight="bold" />
              </Link>
            </div>
          </section>
        )}

        {/* Pending-review banner */}
        {store && !store.isActive && (
          <div className="sd-review-banner">
            <Clock size={16} />
            <span>
              Your seller application is <strong>awaiting admin approval</strong>.
              You can add products now — they stay hidden from buyers until your store is approved.
            </span>
          </div>
        )}

        {loadError && (
          <div className="sd-review-banner sd-error-banner">
            <WarningCircle size={16} />
            <span>Some dashboard data couldn't be loaded. Try refreshing the page.</span>
          </div>
        )}

        <div className="sd">

          {/* Store overview */}
          <div className="sd-kpi-layout" data-tour="store-overview">
            {isLoading ? (
              <>
                <div className="sd-stat sd-stat--sales" key="sales-loading">
                  <Skeleton width="45%" height={12} />
                  <Skeleton width="72%" height={38} radius={4} />
                  <Skeleton width="100%" height={80} radius={4} />
                </div>
                <div className="sd-kpi-side">
                  <div className="sd-kpi-metrics">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div className="sd-stat sd-stat--compact" key={i}>
                        <Skeleton width="55%" height={11} />
                        <Skeleton width="70%" height={22} radius={4} />
                      </div>
                    ))}
                  </div>
                  <div className="sd-stat sd-kpi-quick" aria-label="Quick Actions">
                    <Skeleton width="55%" height={11} />
                    <Skeleton width="100%" height={52} radius={4} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <StatCard
                  label="Total Sales"
                  value={analyticsAvailable ? `₱${formatNumber(stats.lifetimeSales)}` : '—'}
                  big
                  trend={salesByDay}
                  featured
                  meta={[
                    { label: 'Last 14 days', value: analyticsAvailable ? `₱${formatNumber(recentSales)}` : 'Unavailable' },
                    { label: 'Low stock', value: analyticsAvailable ? `${formatNumber(lowStock.length)} item${lowStock.length === 1 ? '' : 's'}` : 'Unavailable' },
                    { label: 'Top product', value: analyticsAvailable ? topProducts[0]?.name || 'No sales yet' : 'Unavailable' },
                  ]}
                />
                <div className="sd-kpi-side">
                  <div className="sd-kpi-metrics">
                    <StatCard label="Completed Orders" value={analyticsAvailable ? formatNumber(stats.completedOrders) : '—'} compact />
                    <StatCard label="Active Products" value={formatNumber(stats.activeProducts)} compact />
                    <StatCard label="Avg. Order Value" value={analyticsAvailable ? `₱${formatNumber(stats.avgOrderValue)}` : '—'} compact />
                  </div>
                  <section className="sd-stat sd-kpi-quick" aria-label="Quick Actions">
                    <span className="sd-stat-label">Quick Actions</span>
                    <div className="sd-kpi-quick-actions">
                      <Link to="/seller/products"><Package size={16} /><span>Products</span></Link>
                      <Link to="/seller/orders"><ShoppingBag size={16} /><span>Orders</span></Link>
                      <Link to="/seller/analytics"><BarChart2 size={16} /><span>Analytics</span></Link>
                      <Link to="/seller/store"><User size={16} /><span>Store</span></Link>
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>

          {/* Body grid */}
          <div className="sd-body">
            <div className="sd-main">
              <section className="sd-card sd-orders" data-tour="recent-orders">
                <header className="sd-card-header">
                  <h2>Recent Orders</h2>
                  <Link to="/seller/orders" className="sd-view-all">View All</Link>
                </header>

                {isLoading ? (
                  <Skeleton.OrderList rows={4} />
                ) : recentOrders.length === 0 ? (
                  <div className="sd-empty">
                    <ShoppingBag size={28} weight="fill" />
                    <p>No orders yet.</p>
                  </div>
                ) : (
                  <ul className="sd-order-list">
                    {recentOrders.map((o) => (
                      <OrderRow
                        key={o.id}
                        order={o}
                        onClick={() => navigate(`/seller/orders?id=${o.id}`)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="sd-card sd-sales-trend">
                <header className="sd-card-header">
                  <h2>Sales Trend (14 days)</h2>
                  <TrendingUp size={15} className="sd-header-icon" />
                </header>
                {isLoading ? (
                  <div style={{ padding: 16 }}>
                    <Skeleton height={120} radius={8} />
                  </div>
                ) : salesByDay.length === 0 ? (
                  <div className="sd-empty sd-empty--sm">
                    <BarChart2 size={22} weight="fill" />
                    <p>No sales data yet.</p>
                  </div>
                ) : (
                  <div className="sd-chart">
                    {salesByDay.map((day) => {
                      const max = Math.max(1, ...salesByDay.map((d) => Number(d.total || 0)));
                      const pct = Math.max(2, (Number(day.total || 0) / max) * 100);
                      return (
                        <div key={day.date} className="sd-chart-col" title={`₱${formatNumber(day.total)} on ${new Date(day.date).toLocaleDateString()}`}>
                          <div className="sd-chart-bar-wrap">
                            <div className="sd-chart-bar" style={{ height: `${pct}%` }} />
                          </div>
                          <span className="sd-chart-label">{new Date(day.date).getDate()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <aside className="sd-right">
              <section className="sd-card sd-followers">
                <header className="sd-card-header">
                  <h2>Followers</h2>
                  <Users size={15} className="sd-header-icon" />
                </header>
                {followerStatsLoading ? (
                  <div className="sd-empty sd-empty--sm">
                    <Skeleton.Text lines={3} height={12} />
                  </div>
                ) : followerStatsError ? (
                  <div className="sd-empty sd-empty--sm">
                    <Users size={22} weight="fill" />
                    <p>Couldn't load follower stats.</p>
                  </div>
                ) : !followerStats ? (
                  <div className="sd-empty sd-empty--sm">
                    <Users size={22} weight="fill" />
                    <p>No follower data yet.</p>
                  </div>
                ) : (
                  <div className="sd-followers-body">
                    <div className="sd-followers-hero">
                      <span className="sd-followers-total">{followerStats.total}</span>
                      <span className="sd-followers-label">total followers</span>
                    </div>
                    <div className="sd-followers-metrics">
                      <div>
                        <span className="sd-followers-metric-value">+{followerStats.last7Days}</span>
                        <span className="sd-followers-metric-label">last 7 days</span>
                      </div>
                      <div>
                        <span className="sd-followers-metric-value">+{followerStats.last30Days}</span>
                        <span className="sd-followers-metric-label">last 30 days</span>
                      </div>
                      <div>
                        <span
                          className={`sd-followers-metric-value ${followerStats.growthPct >= 0 ? 'is-up' : 'is-down'}`}
                        >
                          {followerStats.growthPct >= 0 ? '+' : ''}{followerStats.growthPct}%
                        </span>
                        <span className="sd-followers-metric-label">growth</span>
                      </div>
                    </div>
                    {followerStats.recent?.length > 0 && (
                      <div className="sd-followers-recent">
                        <span className="sd-followers-recent-label">Recent followers</span>
                        <div className="sd-followers-avatars">
                          {followerStats.recent.slice(0, 6).map((r) => (
                            <div
                              key={r.buyer.id}
                              className="sd-followers-avatar"
                              title={r.buyer.fullName}
                            >
                              <UserAvatar src={r.buyer.profilePhoto} name={r.buyer.fullName} alt={r.buyer.fullName} />
                            </div>
                          ))}
                          {followerStats.recent.length > 6 && (
                            <span className="sd-followers-more">+{followerStats.recent.length - 6}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {lowStock.length > 0 && (
                <section className="sd-card sd-lowstock">
                  <header className="sd-card-header">
                    <h2>Low Stock</h2>
                    <WarningCircle size={15} className="sd-header-icon sd-header-icon--warn" />
                  </header>
                  <ul className="sd-top-list">
                    {lowStock.map((p) => (
                      <li key={p.id} className="sd-top-item">
                        <span className="sd-top-rank sd-top-rank--warn"><WarningCircle size={13} /></span>
                        <div className="sd-top-info">
                          <strong>{p.name}</strong>
                          <span className="sd-top-meta">{p.stock} left in stock</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="sd-card sd-topprod">
                <header className="sd-card-header">
                  <h2>Top Products</h2>
                  <TrendingUp size={15} className="sd-header-icon" />
                </header>
                {topProducts.length === 0 ? (
                  <div className="sd-empty sd-empty--sm">
                    <Package size={22} weight="fill" />
                    <p>No products yet.</p>
                  </div>
                ) : (
                  <ol className="sd-top-list">
                    {topProducts.map((p, i) => (
                      <li key={p.id} className="sd-top-item">
                        <span className="sd-top-rank">{i + 1}</span>
                        <div className="sd-top-info">
                          <strong>{p.name}</strong>
                          <span className="sd-top-meta">
                            ₱{formatNumber(p.price)} · Stock: {p.stock ?? 0}
                          </span>
                          <span className="sd-top-rating">
                            <Star size={11} weight="fill" color="var(--t-warning-500, #f59e0b)" />
                            {p.averageRating != null ? Number(p.averageRating).toFixed(1) : '—'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

            </aside>
          </div>
        </div>
      </div>
      {showTour && (
        <DashboardTour
          steps={TOUR_STEPS}
          onFinish={() => completeGuide(DASHBOARD_GUIDE, setStore)}
          onClose={() => setShowTour(false)}
        />
      )}
    </div>
  );
}

function DashboardTour({ steps, onFinish, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const step = steps[stepIndex];

  useEffect(() => {
    const updatePosition = () => {
      const target = document.querySelector(step.target);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const tooltipWidth = Math.min(320, window.innerWidth - 24);
      const estimatedHeight = 175;
      const below = rect.bottom + 14;
      const top = below + estimatedHeight <= window.innerHeight
        ? below
        : Math.max(12, rect.top - estimatedHeight - 14);
      const left = Math.min(
        Math.max(12, rect.left),
        window.innerWidth - tooltipWidth - 12,
      );
      setPosition({ rect, top, left, tooltipWidth });
    };

    const target = document.querySelector(step.target);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(updatePosition, 280);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [step]);

  const finish = () => {
    onFinish();
    onClose();
  };

  const next = () => {
    if (stepIndex === steps.length - 1) finish();
    else setStepIndex((current) => current + 1);
  };

  if (!position) return null;
  const { rect, top, left, tooltipWidth } = position;

  return (
    <div className="sd-tour" role="dialog" aria-modal="true" aria-labelledby="sd-tour-title">
      <div
        className="sd-tour-spotlight"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
      />
      <div className="sd-tour-tooltip" style={{ top, left, width: tooltipWidth }}>
        <div className="sd-tour-topline">
          <span>{stepIndex + 1} of {steps.length}</span>
          <button type="button" onClick={finish} aria-label="Skip dashboard guide"><X size={16} /></button>
        </div>
        <h2 id="sd-tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="sd-tour-actions">
          <button type="button" className="sd-tour-skip" onClick={finish}>Skip</button>
          <button type="button" className="sd-tour-next" onClick={next} autoFocus>
            {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Phones: the order statuses counted on Home. */
const HOME_ORDER_STATUSES = ['PENDING', 'TO_SHIP'];

/** Phones: Home's shop tools, each a filled icon in its own colour. */
const HOME_TOOLS = [
  { to: '/seller/products', label: 'My products', Icon: Package, tone: 'orange' },
  { to: '/seller/orders', label: 'My orders', Icon: Receipt, tone: 'blue' },
  { to: '/seller/analytics', label: 'Performance', Icon: BarChart2, tone: 'violet' },
  { to: '/seller/finance', label: 'Finance', Icon: Wallet, tone: 'green' },
  { to: '/seller/reviews', label: 'Reviews', Icon: Star, tone: 'amber' },
  { to: '/seller/returns', label: 'Returns', Icon: ArrowCounterClockwise, tone: 'rose' },
  { to: '/seller/decorate', label: 'Decorate', Icon: PaintBrush, tone: 'pink' },
  { to: '/seller/products/new', label: 'Add product', Icon: PlusCircle, tone: 'teal', tour: 'add-product' },
];

/** The one thing Home asks for first, or null: shop private, ID, then setup. */
const homeNotice = (store, setup) => {
  const identity = setup?.steps?.find((step) => step.key === 'identity');
  if (store?.isApproved === false) {
    return {
      Icon: LockSimple,
      tone: 'amber',
      title: 'Your shop is private',
      hint: "It's hidden from buyers until the admin approves it.",
      cta: 'Set up',
      to: '/seller/setup',
    };
  }
  if (identity && !identity.done) {
    if (identity.status === 'FAILED') {
      return { Icon: IdentificationCard, tone: 'red', title: "We couldn't confirm your ID", hint: 'Send a clear photo of a valid ID.', cta: 'Retry', to: '/seller/verification' };
    }
    if (identity.status === 'PENDING') {
      return { Icon: IdentificationCard, tone: 'blue', title: 'Checking your ID', hint: "We'll let you know when it's done.", cta: null, to: '/seller/verification' };
    }
    return { Icon: IdentificationCard, tone: 'amber', title: 'Verify your identity', hint: 'Buyers and admins trust verified shops.', cta: 'Verify', to: '/seller/verification' };
  }
  if (setup && !setup.complete) {
    return {
      Icon: ListChecks,
      tone: 'green',
      title: 'Finish setting up your shop',
      hint: `${setup.doneCount} of ${setup.total} done`,
      cta: 'Continue',
      to: '/seller/setup',
    };
  }
  return null;
};

/** Tips: real things a seller can do, each one tap away. Swipe or wait. */
function HomeTips({ onShare }) {
  const slides = [
    { key: 'decorate', title: 'Decorate your shop', text: 'Pick a ready-made look in one tap.', cta: 'Choose a template', to: '/seller/decorate', Icon: PaintBrush, tone: 'pink' },
    { key: 'announce', title: 'Tell your followers', text: 'Share news or promote a product.', cta: 'Open Marketing', to: '/seller/marketing', Icon: Megaphone, tone: 'violet' },
    { key: 'share', title: 'Share your shop', text: 'Send your shop link to friends and groups.', cta: 'Share now', onClick: onShare, Icon: ShareNetwork, tone: 'blue' },
  ];
  const [index, setIndex] = useState(0);
  const trackRef = React.useRef(null);

  // The dots follow whichever slide is in view.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <section className="sh-banners" aria-label="Tips">
      <div className="sh-banner-track" ref={trackRef} onScroll={onScroll}>
        {slides.map(({ key, title, text, cta, to, onClick, Icon, tone }) => {
          const body = (
            <>
              <span className="sh-banner-text">
                <strong>{title}</strong>
                <span>{text}</span>
                <em>{cta} <CaretRight size={12} weight="bold" /></em>
              </span>
              <span className="sh-banner-art" aria-hidden="true"><Icon size={30} weight="fill" /></span>
            </>
          );
          return to
            ? <Link key={key} to={to} className={`sh-banner is-${tone}`}>{body}</Link>
            : <button key={key} type="button" className={`sh-banner is-${tone}`} onClick={onClick}>{body}</button>;
        })}
      </div>
      <div className="sh-dots" aria-hidden="true">
        {slides.map((slide, i) => <span key={slide.key} className={i === index ? 'is-on' : ''} />)}
      </div>
    </section>
  );
}

/*
 * Home on a phone: the seller-app layout (the shop at the top, one notice,
 * the numbers that need action, the shop tools, tips, then sales, recent
 * orders and low stock) drawn with the buyer pages' pieces: white cards on
 * grey, bare icons, round header buttons, green for actions.
 */
function PhoneHome({
  store, user, setup, unreadCount, switchToPersonal, waiting,
  isLoading, loadError, analyticsAvailable, stats, salesByDay, recentSales, recentOrders, lowStock,
  counts, onOpenOrder,
}) {
  const { share, shareSheet } = useShare();
  const notice = homeNotice(store, setup);
  const name = store?.name || 'My shop';
  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const trend = salesByDay.slice(-14).map((day) => Number(day.total || 0));
  const maxTrend = Math.max(1, ...trend);
  const shareShop = () => store?.slug && share({
    title: name,
    text: `Shop at ${name} on Emoorm`,
    url: `${window.location.origin}/store/${store.slug}`,
  });
  const numbers = [
    { label: 'To confirm', value: counts.PENDING, to: '/seller/orders?status=PENDING' },
    { label: 'To ship', value: counts.TO_SHIP, to: '/seller/orders?status=TO_SHIP' },
    { label: 'Returns', value: waiting['/seller/returns']?.count, to: '/seller/returns' },
    { label: 'Reviews', value: counts.reviews, to: '/seller/reviews?filter=reply' },
  ];

  return (
    <div className="seller-dashboard sh">
      <header className="sh-head">
        <Link to="/seller/menu" className="sh-shop" aria-label="Your shop">
          <span className="sh-avatar">
            {store?.logo ? <img src={resolveImg(store.logo)} alt="" /> : name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="sh-shop-text">
            <small>{firstName ? `Hi, ${firstName}` : 'Seller Center'}</small>
            <strong>{name}</strong>
          </span>
        </Link>
        <div className="sh-actions">
          <Link to="/seller/notifications" className="sh-icon" aria-label="Notifications">
            <Bell size={20} />
            {unreadCount > 0 && <b className="sh-badge">{unreadCount > 9 ? '9+' : unreadCount}</b>}
          </Link>
          <button type="button" className="sh-icon sh-me" onClick={switchToPersonal} aria-label="Switch to my buyer account" title="Switch to my buyer account">
            <UserAvatar src={user?.profilePhoto} name={(user?.fullName || 'U').charAt(0)} alt="" imgClassName="sh-me-img" fallbackClassName="sh-me-img sh-me-fallback" />
          </button>
        </div>
      </header>

      <div className="sh-body">
        {notice && (
          <Link to={notice.to} className={`sh-notice is-${notice.tone}`}>
            <span className="sh-notice-icon"><notice.Icon size={22} weight="fill" /></span>
            <span className="sh-notice-text">
              <b>{notice.title}</b>
              <span>{notice.hint}</span>
            </span>
            {notice.cta
              ? <span className="sh-notice-cta">{notice.cta}</span>
              : <CaretRight size={16} className="sh-chev" />}
          </Link>
        )}

        {loadError && <p className="sdm-note"><WarningCircle size={15} /> Some numbers couldn't load right now.</p>}

        <section className="sh-card sh-numbers" aria-label="Needs your action">
          {numbers.map(({ label, value, to }) => (
            <Link key={label} to={to} className={value > 0 ? 'is-due' : undefined}>
              <strong>{value == null ? '–' : value}</strong>
              <span>{label}</span>
            </Link>
          ))}
        </section>

        <section className="sh-card">
          <div className="sh-card-head"><h2>Shop tools</h2></div>
          <div className="sh-tools">
            {HOME_TOOLS.map(({ to, label, Icon, tone, tour }) => (
              <Link key={to} to={to} className="sh-tool" {...(tour ? { 'data-tour': tour } : {})}>
                <span className={`sh-tool-icon is-${tone}`}><Icon size={30} weight="fill" /></span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>

        <HomeTips onShare={shareShop} />

        <section className="sh-card sh-sales" data-tour="store-overview">
          <div className="sh-card-head">
            <h2>Sales</h2>
            <Link to="/seller/analytics">Details <CaretRight size={13} weight="bold" /></Link>
          </div>
          <div className="sh-sales-row">
            <div>
              {isLoading
                ? <Skeleton width={120} height={28} radius={6} />
                : <strong className="sh-sales-total">{analyticsAvailable ? `₱${formatNumber(stats.lifetimeSales)}` : '—'}</strong>}
              <span className="sh-sales-sub">
                {analyticsAvailable ? `₱${formatNumber(recentSales)} in the last 14 days` : 'Not available right now'}
              </span>
            </div>
            {trend.length > 0 && (
              <span className="sh-spark" aria-hidden="true">
                {trend.map((amount, i) => <span key={i} style={{ height: `${Math.max(10, (amount / maxTrend) * 100)}%` }} />)}
              </span>
            )}
          </div>
          <div className="sh-sales-stats">
            <span><strong>{isLoading ? '–' : formatNumber(stats.completedOrders)}</strong> {Number(stats.completedOrders) === 1 ? 'order' : 'orders'} done</span>
            <span><strong>{isLoading ? '–' : formatNumber(stats.activeProducts)}</strong> live {Number(stats.activeProducts) === 1 ? 'product' : 'products'}</span>
          </div>
        </section>

        <section className="sh-card sdm-list" data-tour="recent-orders">
          <div className="sh-card-head">
            <h2>Recent orders</h2>
            {recentOrders.length > 0 && <Link to="/seller/orders">See all <CaretRight size={13} weight="bold" /></Link>}
          </div>
          {isLoading ? (
            <Skeleton.OrderList rows={3} />
          ) : recentOrders.length === 0 ? (
            <p className="sdm-empty">No orders yet. They show up here as soon as a buyer orders.</p>
          ) : (
            <ul className="sh-orders">
              {recentOrders.map((o) => <PhoneOrderRow key={o.id} order={o} onClick={() => onOpenOrder(o.id)} />)}
            </ul>
          )}
        </section>

        {lowStock.length > 0 && (
          <section className="sh-card sh-list">
            <div className="sh-card-head"><h2>Running low</h2></div>
            {lowStock.map((prod) => (
              <Link key={prod.id} to="/seller/products" className="sh-row">
                <span className="sh-row-icon"><WarningCircle size={19} weight="fill" /></span>
                <span className="sh-row-label">{prod.name}</span>
                <span className="sh-row-hint">{prod.stock} left</span>
                <CaretRight size={16} className="sh-chev" />
              </Link>
            ))}
          </section>
        )}
      </div>
      {shareSheet}
    </div>
  );
}

/** "Today, 3:20 PM", "Yesterday", or "Sep 26". */
const orderDay = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `Today, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

/**
 * Phones: a recent order as the seller thinks of it: the product's photo
 * and name, who ordered and when, the total and where it stands. The order
 * number stays on the order itself.
 */
function PhoneOrderRow({ order, onClick }) {
  const { label, tint } = STATUS_META[order.status] || STATUS_META.PENDING;
  const items = order.items || [];
  const first = items[0];
  const photo = first?.product?.images?.[0];
  const name = first?.productName || first?.product?.name || 'Order';
  const more = items.length - 1;
  const qty = items.reduce((sum, it) => sum + (it.quantity || 0), 0);

  return (
    <li
      className="sh-order"
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      role="button"
      tabIndex={0}
    >
      <span className="sh-order-img">
        {photo ? <img src={resolveImg(photo)} alt="" /> : <Package size={22} weight="fill" />}
      </span>
      <span className="sh-order-body">
        <strong>
          {name}
          {more > 0 ? <small> + {more} more</small> : qty > 1 && <small> × {qty}</small>}
        </strong>
        {/* The day first, so a long name is what gets cut. */}
        <span>{[orderDay(order.createdAt), order.buyer?.fullName].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="sh-order-right">
        <b>₱{formatNumber(order.total)}</b>
        <em className={`sh-order-status is-${tint.replace('sc-tint-', '')}`}>{label}</em>
      </span>
    </li>
  );
}

function StatCard({ label, value, big, compact, featured, meta = [], trend = [] }) {
  const trendValues = trend.slice(-10).map((day) => Number(day.total || 0));
  const maxTrend = Math.max(1, ...trendValues);

  return (
    <div className={`sd-stat ${featured ? 'sd-stat--sales' : ''} ${compact ? 'sd-stat--compact' : ''}`}>
      <span className={`sd-stat-value ${big ? 'sd-stat-value--big' : ''}`}>{value}</span>
      <span className="sd-stat-label">{label}</span>
      {trendValues.length > 0 && (
        <span className="sd-stat-trend" aria-label={`${label} trend for the last ${trendValues.length} days`}>
          {trendValues.map((amount, index) => (
            <span
              key={`${amount}-${index}`}
              className="sd-stat-trend-bar"
              style={{ height: `${Math.max(18, (amount / maxTrend) * 100)}%` }}
            />
          ))}
        </span>
      )}
      {meta.length > 0 && (
        <span className="sd-stat-meta">
          {meta.map((item) => <span key={item.label}><small>{item.label}</small><strong>{item.value}</strong></span>)}
        </span>
      )}
    </div>
  );
}

function OrderRow({ order, onClick }) {
  const meta = STATUS_META[order.status] || STATUS_META.PENDING;
  const { Icon, label, tint } = meta;
  const qty = order.items?.reduce((s, it) => s + (it.quantity || 0), 0) ?? order.itemsCount ?? 1;
  const short = (order.orderNumber || order.id || '').toString().slice(-8);
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric',
    })
    : '';

  return (
    <li
      className="sd-order"
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      role="button"
      tabIndex={0}
    >
      <span className={`sd-order-icon ${tint}`}>
        <Icon size={16} />
      </span>
      <div className="sd-order-body">
        <strong>Order #{short}</strong>
        <span>Qty: {qty} · {date}</span>
      </div>
      <div className="sd-order-right">
        <span className="sd-order-total">₱{formatNumber(order.total)}</span>
        <span className={`sd-order-status ${tint}`}>{label}</span>
      </div>
    </li>
  );
}

function formatNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-PH', { maximumFractionDigits: 0 });
}
