import React, { useEffect, useState, useRef } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import ToolGradients from '../components/ui/ToolGradients';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import {
  Plus, Clock, Truck, CheckCircle, Package,
  TrendUp as TrendingUp, Star, ChartBar as BarChart2, Users, WarningCircle, X,
  IdentificationCard, ArrowRight, Wallet, CaretRight, LockSimple, Bell,
  ArrowCounterClockwise, PaintBrush, Megaphone, ShareNetwork, PlusCircle, Check, ExclamationMark,
  Sparkle, Palette, Heart, UsersThree, LinkSimple, ChatCircleDots, CookingPot,
  GraduationCap, BookOpen, Lightbulb, ArrowClockwise, Handshake, Question, QrCode, ListChecks,
} from '../lib/icons';
import { countLabel } from '../lib/orderLines';
import { useShare } from '../components/ShareSheet';
import { usePhoneLayout } from '../hooks/useMobileNav';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { lineImage } from '../lib/variationImage';
import useAuthStore from '../store/authStore';
import Skeleton from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import { getSellerFollowerStats, subscribeToFollowChanges } from '../lib/follow';
import { completeGuide, shouldShowGuide } from '../lib/sellerGuides';
import { describeStep, sellBlockers, setupNextTo } from '../lib/sellerSetup';
import PageMenu from '../components/layout/PageMenu';
import useFocusTrap from '../hooks/useFocusTrap';

const DASHBOARD_GUIDE = 'dashboard';
import './SellerDashboard.css';
import './Profile.css';
import { readCache, writeCache } from '../lib/pageCache';

const STATUS_META = {
  PENDING: { label: 'New', tint: 'sc-tint-amber', Icon: Clock },
  CONFIRMED: { label: 'Confirmed', tint: 'sc-tint-blue', Icon: CheckCircle },
  PREPARING: { label: 'Preparing', tint: 'sc-tint-blue', Icon: Package },
  TO_SHIP: { label: 'To ship', tint: 'sc-tint-blue', Icon: Truck },
  READY: { label: 'Ready', tint: 'sc-tint-blue', Icon: Truck },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tint: 'sc-tint-blue', Icon: Truck },
  SHIPPED: { label: 'Shipped', tint: 'sc-tint-blue', Icon: Truck },
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

  const tourEligible = shouldShowGuide(store, DASHBOARD_GUIDE);

  // Reminders from the setup checklist: the ID check until it is done, and
  // overall progress until the shop is ready (the seller may hide that one).
  const identityStep = setup?.steps?.find((step) => step.key === 'identity') || null;
  const identityMeta = identityStep && !identityStep.done ? describeStep(identityStep) : null;
  // While the shop cannot sell, buyers see none of its products: the card
  // says so and stays up until it can.
  const blockers = sellBlockers(setup);
  const showSetupCard = Boolean(setup && !setup.complete
    && (blockers.length > 0 || shouldShowGuide(store, 'setup-card')));
  const setupNext = setup?.steps?.find(
    (step) => !step.done && !step.optional && !step.waiting && step.key !== 'identity',
  ) || null;

  // What Home showed last time: shown at once while it is asked for again.
  const [saved] = useState(() => readCache('seller:home') || null);
  const [recentOrders, setRecentOrders] = useState(() => saved?.recentOrders || []);
  const [topProducts, setTopProducts] = useState(() => saved?.topProducts || []);
  const [lowStock, setLowStock] = useState(() => saved?.lowStock || []);
  const [salesByDay, setSalesByDay] = useState(() => saved?.salesByDay || []);
  const [stats, setStats] = useState(() => saved?.stats || {
    lifetimeSales: 0,
    completedOrders: 0,
    activeProducts: 0,
    avgOrderValue: 0,
  });
  const [followerStats, setFollowerStats] = useState(() => readCache('seller:followers') || null);
  const [followerStatsLoading, setFollowerStatsLoading] = useState(() => !readCache('seller:followers'));
  const [followerStatsError, setFollowerStatsError] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [loadError, setLoadError] = useState(false);
  const [analyticsAvailable, setAnalyticsAvailable] = useState(() => saved?.analyticsAvailable ?? true);
  const hasFollowerStats = useRef(Boolean(readCache('seller:followers')));
  const [showTour, setShowTour] = useState(false);
  // Try again after a failed load: asks for everything once more.
  const [reloadKey, setReloadKey] = useState(0);
  const retryLoad = () => {
    setLoadError(false);
    setReloadKey((n) => n + 1);
  };

  // Shown once, only after the shop exists; progress is saved on the shop.
  useEffect(() => {
    if (!tourEligible) return undefined;
    const timer = window.setTimeout(() => setShowTour(true), 500);
    return () => window.clearTimeout(timer);
  }, [tourEligible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [analyticsRes, ordersRes, productsRes] = await Promise.allSettled([
        axios.get('/analytics/seller'),
        axios.get('/orders/store/orders', { params: { pageSize: 5 } }),
        axios.get('/products/my/products', { params: { pageSize: 100 } }),
      ]);
      if (cancelled) return;

      const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value.data : null;
      const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
      const products = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];

      // Either part missing is worth saying (with Try again): a zero where a
      // number failed to load looks like a real zero.
      const failed = analyticsRes.status === 'rejected' || ordersRes.status === 'rejected';
      setLoadError(failed);

      const next = {
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
            lifetimeSales: 0,
            completedOrders: 0,
            activeProducts: products.filter((p) => p.status === 'APPROVED').length,
            avgOrderValue: 0,
          },
        // Product performance is only meaningful when supplied by seller analytics.
        topProducts: analytics?.topProducts?.length
          ? (() => {
            const byId = Object.fromEntries(products.map((p) => [p.id, p]));
            return analytics.topProducts.slice(0, 3).map((tp) => byId[tp.id] || tp);
          })()
          : [],
      };
      setAnalyticsAvailable(next.analyticsAvailable);
      setRecentOrders(next.recentOrders);
      setLowStock(next.lowStock);
      setSalesByDay(next.salesByDay);
      setStats(next.stats);
      setTopProducts(next.topProducts);
      // A failed load is not remembered: the saved copy stays as it was.
      if (!failed) writeCache('seller:home', next);

      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Today's prep list: what the open orders add up to, per product.
  const [prep, setPrep] = useState(() => readCache('seller:prep') || null);
  useEffect(() => {
    let cancelled = false;
    axios.get('/orders/store/orders', { params: { status: PREP_STATUSES, pageSize: 100 } })
      .then((res) => {
        if (cancelled) return;
        const next = { rows: prepRows(res.data || []), total: res.pagination?.total ?? (res.data || []).length };
        setPrep(next);
        writeCache('seller:prep', next);
      })
      .catch(() => { /* the card keeps what it showed last; the page's own error covers the rest */ });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Load follower stats once we have a store id, and refetch on cross-tab follow changes
  useEffect(() => {
    if (!store?.id) return undefined;
    let cancelled = false;
    const load = async () => {
      // With stats on screen they stay while fresh ones load.
      if (!hasFollowerStats.current) setFollowerStatsLoading(true);
      setFollowerStatsError(false);
      try {
        const data = await getSellerFollowerStats(store.id);
        if (!cancelled) {
          setFollowerStats(data);
          hasFollowerStats.current = true;
          writeCache('seller:followers', data);
        }
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

  // What is waiting on the seller (the sidebar's badges, GET
  // /stores/my/attention): the "Needs your action" numbers on both layouts.
  const isPhone = usePhoneLayout();
  const waiting = ctx?.waiting || {};
  const sellsLivestock = Boolean(store?.sellsLivestock || waiting['/seller/offers']?.count);
  const actions = actionTiles(waiting, sellsLivestock);
  // One card at the top, not a pile: the most pressing of private shop,
  // can't take orders, setup left, ID to verify.
  const lead = leadCard({ store, setup, blockers, showSetupCard, setupNext, identityMeta });
  const showAcademy = shouldShowGuide(store, ACADEMY_CARD) || !store?.id;

  if (isPhone) {
    return (
      <PhoneHome
        store={store}
        user={user}
        setup={setup}
        waiting={waiting}
        sellsLivestock={sellsLivestock}
        unreadCount={ctx?.unreadCount || 0}
        switchToPersonal={ctx?.switchToPersonal}
        isLoading={isLoading}
        loadError={loadError}
        onRetry={retryLoad}
        analyticsAvailable={analyticsAvailable}
        stats={stats}
        salesByDay={salesByDay}
        recentSales={recentSales}
        recentOrders={recentOrders}
        lowStock={lowStock}
        prep={prep}
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

        {/* The one thing to finish first (SE-6: one card, not three). */}
        {lead && <LeadCard lead={lead} onHide={lead.hideable ? () => completeGuide('setup-card', setStore) : null} />}

        {/* The shop stopped selling (Settings › Take a break or close). */}
        {store && store.isActive === false && store.isApproved !== false && (
          <div className="sd-review-banner">
            <Clock size={16} />
            <span>
              You stopped selling for now: buyers can&apos;t order from your shop.{' '}
              <Link to="/seller/settings#shop-status">Start selling again</Link>
            </span>
          </div>
        )}

        {loadError && (
          <div className="sd-review-banner sd-error-banner" role="alert">
            <WarningCircle size={16} />
            <span>Some dashboard numbers couldn&apos;t be loaded.</span>
            <button type="button" className="sd-retry" onClick={retryLoad}>
              <ArrowClockwise size={14} weight="bold" /> Try again
            </button>
          </div>
        )}

        {/* What is waiting on the seller, each opening its own list. */}
        <ActionRow tiles={actions} />

        <PrepList prep={prep} />

        {/* Seller Academy: free lessons, one click away (can be hidden). */}
        {showAcademy && (
          <section className="sd-idv is-academy" aria-label="Seller Academy">
            <span className="sd-idv-icon"><GraduationCap size={24} weight="fill" /></span>
            <div className="sd-idv-body">
              <strong>Seller Academy</strong>
              <p>Free, simple lessons: better photos, faster orders, more buyers.</p>
            </div>
            <Link to="/sell/academy" className="sd-card-btn">
              Start learning <ArrowRight size={15} weight="bold" />
            </Link>
            {store?.id && (
              <button
                type="button"
                className="sd-card-hide"
                aria-label="Hide Seller Academy from the dashboard"
                title="Hide (Seller Academy stays in the sidebar)"
                onClick={() => completeGuide(ACADEMY_CARD, setStore)}
              >
                <X size={16} weight="bold" />
              </button>
            )}
          </section>
        )}

        <div className="sd">

          {/* Overview: the shop's numbers as one strip, and the sales of the
              last 14 days under them on the same surface. */}
          <section className="sd-panel sd-overview" data-tour="store-overview" aria-label="Overview">
            <div className="sd-ov-stats">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div className="sd-ov-stat" key={i}>
                    <Skeleton width="50%" height={26} radius={4} />
                    <Skeleton width="70%" height={12} />
                  </div>
                ))
              ) : (
                <>
                  <OverviewStat
                    label="Total sales"
                    value={analyticsAvailable ? `₱${formatNumber(stats.lifetimeSales)}` : '—'}
                    sub={analyticsAvailable ? `₱${formatNumber(recentSales)} in the last 14 days` : 'Unavailable right now'}
                  />
                  <OverviewStat
                    label="Completed orders"
                    value={analyticsAvailable ? formatNumber(stats.completedOrders) : '—'}
                    sub="Received by the buyer"
                  />
                  <OverviewStat
                    label="Active products"
                    value={formatNumber(liveProducts(stats))}
                    sub={lowStock.length ? `${formatNumber(lowStock.length)} low on stock` : 'Live in your shop'}
                    warn={lowStock.length > 0}
                  />
                  <OverviewStat
                    label="Average order"
                    value={analyticsAvailable ? `₱${formatNumber(stats.avgOrderValue)}` : '—'}
                    sub={analyticsAvailable && topProducts[0]?.name ? `Top product: ${topProducts[0].name}` : 'Per completed order'}
                  />
                </>
              )}
            </div>
              <section className="sd-card sd-sales-trend">
                <header className="sd-card-header">
                  <h2>Sales, last 14 days</h2>
                  <TrendingUp size={15} className="sd-header-icon" />
                </header>
                {isLoading ? (
                  <div className="sd-pad">
                    <Skeleton height={120} radius={8} />
                  </div>
                ) : salesByDay.length === 0 ? (
                  <div className="sd-empty sd-empty--sm">
                    <EmptyArt name="analytics" size={56} />
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
          </section>

          {/* Orders and the people following the shop, side by side. */}
          <p className="sd-panel-label">Orders and followers</p>
          <div className="sd-panel sd-panel-row is-2">
              <section className="sd-card sd-orders" data-tour="recent-orders">
                <header className="sd-card-header">
                  <h2>Recent orders</h2>
                  <Link to="/seller/orders" className="sd-view-all">See all</Link>
                </header>

                {isLoading ? (
                  <Skeleton.OrderList rows={4} />
                ) : recentOrders.length === 0 ? (
                  <div className="sd-empty">
                    <EmptyArt name="orders" size={84} />
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
                    <EmptyArt name="followers" size={56} />
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
          </div>

          {/* What sells, and what is running out. */}
          <p className="sd-panel-label">Products</p>
          <div className={`sd-panel sd-panel-row ${lowStock.length > 0 ? 'is-2' : 'is-1'}`}>
              <section className="sd-card sd-topprod">
                <header className="sd-card-header">
                  <h2>Top products</h2>
                  <TrendingUp size={15} className="sd-header-icon" />
                </header>
                {topProducts.length === 0 ? (
                  <div className="sd-empty sd-empty--sm">
                    <EmptyArt name="products" size={56} />
                    <p>No sales yet. Your best sellers show here.</p>
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
              {lowStock.length > 0 && (
                <section className="sd-card sd-lowstock">
                  <header className="sd-card-header">
                    <h2>Running low</h2>
                    <Link to="/seller/products?stock=low" className="sd-view-all">See all</Link>
                  </header>
                  {/* Each row opens a quick restock for that product. */}
                  <ul className="sd-top-list">
                    {lowStock.map((p) => (
                      <li key={p.id}>
                        <Link to={`/seller/products?restock=${p.id}`} className="sd-top-item sd-top-item--link" title={`Restock ${p.name}`}>
                          <span className="sd-top-rank sd-top-rank--warn"><WarningCircle size={13} /></span>
                          <div className="sd-top-info">
                            <strong>{p.name}</strong>
                            <span className="sd-top-meta">{Number(p.stock) === 0 ? 'Out of stock' : `${p.stock} left in stock`}</span>
                          </div>
                          <span className="sd-restock">Restock <CaretRight size={13} weight="bold" /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
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

  const tourRef = useFocusTrap(Boolean(position), { onClose: finish });

  if (!position) return null;
  const { rect, top, left, tooltipWidth } = position;

  return (
    <div className="sd-tour" role="dialog" aria-modal="true" aria-labelledby="sd-tour-title" ref={tourRef}>
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

/**
 * Phones: Home's shop tools, each a filled icon in its own colour. Orders
 * has its own tab, so Marketing (no longer a tab) takes its place; shops
 * that sell livestock also get Offers.
 */
const HOME_TOOLS = [
  { to: '/seller/products', label: 'My products', Icon: Package, tone: 'orange' },
  { to: '/seller/marketing', label: 'Marketing', Icon: Megaphone, tone: 'blue' },
  { to: '/seller/analytics', label: 'Analytics', Icon: BarChart2, tone: 'violet' },
  { to: '/seller/finance', label: 'Earnings', Icon: Wallet, tone: 'green' },
  { to: '/seller/reviews', label: 'Reviews', Icon: Star, tone: 'amber' },
  { to: '/seller/returns', label: 'Returns', Icon: ArrowCounterClockwise, tone: 'rose' },
  { to: '/seller/today', label: 'Available today', Icon: CookingPot, tone: 'pink' },
  { to: '/seller/products/new', label: 'Add product', Icon: PlusCircle, tone: 'teal', tour: 'add-product' },
];
const OFFERS_TOOL = { to: '/seller/offers', label: 'Offers', Icon: Handshake, tone: 'teal' };

const ACADEMY_CARD = 'academy-card';

/**
 * "Needs your action": what is waiting, each opening its filtered list.
 * The counts are the sidebar's (GET /stores/my/attention), by link.
 */
const actionTiles = (waiting, sellsLivestock) => {
  const count = (link) => waiting[link]?.count;
  return [
    { key: 'confirm', label: 'To confirm', value: count('/seller/orders'), to: '/seller/orders?status=PENDING', Icon: Clock },
    { key: 'payments', label: 'Payments to check', value: count('/seller/orders?status=payment'), to: '/seller/orders?status=payment', Icon: QrCode },
    { key: 'pack', label: 'To pack', value: count('/seller/orders?status=to_ship'), to: '/seller/orders?status=to_ship', Icon: Package },
    { key: 'returns', label: 'Returns', value: count('/seller/returns'), to: '/seller/returns', Icon: ArrowCounterClockwise },
    ...(sellsLivestock ? [{ key: 'offers', label: 'Offers', value: count('/seller/offers'), to: '/seller/offers', Icon: Handshake }] : []),
    { key: 'questions', label: 'Questions', value: count('/seller/questions'), to: '/seller/questions', Icon: Question },
    { key: 'reviews', label: 'Reviews to reply', value: count('/seller/reviews'), to: '/seller/reviews?filter=reply', Icon: Star },
  ];
};

/** Computers: the "Needs your action" row; a zero is quiet, a count stands out. */
function ActionRow({ tiles }) {
  const due = tiles.reduce((n, t) => n + (t.value || 0), 0);
  return (
    <section className="sd-actions" aria-labelledby="sd-actions-title">
      <div className="sd-actions-head">
        <h2 id="sd-actions-title">Needs your action</h2>
        <span>{due > 0 ? `${due} waiting` : 'All caught up'}</span>
      </div>
      <div className="sd-actions-row">
        {tiles.map(({ key, label, value, to, Icon }) => (
          <Link key={key} to={to} className={`sd-action${value > 0 ? ' is-due' : ''}`}>
            <Icon size={18} weight={value > 0 ? 'fill' : 'regular'} />
            <strong>{value == null ? '–' : value}</strong>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The orders the prep list counts: new ones and those not yet handed over. */
const PREP_STATUSES = 'PENDING,CONFIRMED,PREPARING,TO_SHIP';

/**
 * Open orders added up per product (and choice): "Tilapia · 12 across 5
 * orders", so the seller knows how much to prepare. A package counts as
 * itself; new orders not yet confirmed are counted apart.
 */
const prepRows = (orders) => {
  const rows = new Map();
  for (const order of orders) {
    for (const line of order.items || []) {
      const choice = line.selectedVariations && typeof line.selectedVariations === 'object'
        ? Object.values(line.selectedVariations).filter(Boolean).join(', ')
        : '';
      const key = `${line.productId}|${choice}`;
      const row = rows.get(key) || {
        key, name: line.productName || line.product?.name || 'Product', choice, line, qty: 0, unconfirmed: 0, orders: new Set(),
      };
      row.qty += Number(line.quantity) || 0;
      if (order.status === 'PENDING') row.unconfirmed += Number(line.quantity) || 0;
      row.orders.add(order.id);
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map(({ orders: ids, line, ...row }) => {
      // "2 heads", "3 packages"; other kinds as "× 12".
      const label = countLabel(line, row.qty);
      return { ...row, orderCount: ids.size, label: /^\d+$/.test(label) ? `× ${label}` : label };
    })
    .sort((a, b) => b.qty - a.qty);
};

/** Today's prep list: how much of each product the open orders need. */
function PrepList({ prep, phone = false }) {
  const [showAll, setShowAll] = useState(false);
  if (!prep?.rows?.length) return null;
  const rows = showAll ? prep.rows : prep.rows.slice(0, 6);
  return (
    <section className={phone ? 'sh-card sd-prep is-phone' : 'sd-prep'} aria-labelledby="sd-prep-title">
      <div className="sd-prep-head">
        <h2 id="sd-prep-title"><ListChecks size={18} weight="fill" /> Today&apos;s prep list</h2>
        <Link to="/seller/orders?status=to_ship">To pack <CaretRight size={13} weight="bold" /></Link>
      </div>
      <p className="sd-prep-sub">
        What your open orders need, per product.
        {prep.total > 100 ? ' Counted from your 100 newest open orders.' : ''}
      </p>
      <ul className="sd-prep-list">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="sd-prep-name">
              {row.name}
              {row.choice && <small>{row.choice}</small>}
            </span>
            <span className="sd-prep-qty">
              <strong>{row.label}</strong>
              <small>
                across {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'}
                {row.unconfirmed > 0 ? ` · ${row.unconfirmed} not confirmed yet` : ''}
              </small>
            </span>
          </li>
        ))}
      </ul>
      {prep.rows.length > 6 && (
        <button type="button" className="sd-prep-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${prep.rows.length} products`}
        </button>
      )}
    </section>
  );
}

/**
 * Computers: the one card at the top of the dashboard, or null. In order:
 * the shop is private until approved; buyers can't order yet; setup is not
 * finished (this one can be hidden); the ID still needs doing.
 */
const leadCard = ({ store, setup, blockers, showSetupCard, setupNext, identityMeta }) => {
  const progress = setup ? Math.round((setup.doneCount / Math.max(1, setup.total)) * 100) : null;
  const idTodo = identityMeta && identityMeta.tone !== 'waiting' ? { to: '/seller/verification', label: identityMeta.action } : null;
  if (store?.isApproved === false) {
    return {
      tone: 'amber',
      Icon: LockSimple,
      title: 'Your shop is private until an admin approves it',
      text: blockers.length
        ? `Add products and finish ${blockers.map((b) => b.label).join(', ')} now, so buyers can order as soon as it's approved.`
        : 'Add products and set up delivery and payment now. Buyers see your shop as soon as it is approved.',
      progress: setup && !setup.complete ? progress : null,
      primary: setup && !setup.complete ? { to: setupNextTo(setup), label: 'Continue setup' } : null,
      secondary: idTodo && { ...idTodo, label: identityMeta.tone === 'failed' ? 'Send your ID again' : 'Verify your ID (faster approval)' },
    };
  }
  if (blockers.length) {
    return {
      tone: 'amber',
      Icon: WarningCircle,
      title: "Buyers can't order yet",
      text: `Buyers can see your products, but can't order until you finish: ${blockers.map((b) => b.label).join(', ')}.`,
      progress,
      primary: { to: setupNextTo(setup), label: 'Finish setup' },
    };
  }
  if (showSetupCard) {
    return {
      tone: 'green',
      Icon: ListChecks,
      title: 'Finish setting up your shop',
      text: `${setup.doneCount} of ${setup.total} done${setupNext ? ` · Next: ${describeStep(setupNext, { municipality: setup.municipality }).title}` : ''}`,
      progress,
      primary: { to: setupNextTo(setup), label: 'Continue setup' },
      hideable: true,
    };
  }
  if (identityMeta) {
    return {
      tone: identityMeta.tone === 'failed' ? 'red' : identityMeta.tone === 'waiting' ? 'blue' : 'amber',
      Icon: IdentificationCard,
      title: identityMeta.tone === 'failed'
        ? "We couldn't confirm your ID"
        : identityMeta.tone === 'waiting' ? 'Checking your ID' : 'Verify your identity',
      text: identityMeta.tone === 'todo'
        ? 'Scan a valid ID so buyers and the admin can trust your shop. It takes about a minute.'
        : identityMeta.text,
      primary: idTodo,
    };
  }
  return null;
};

function LeadCard({ lead, onHide }) {
  const { tone, Icon, title, text, progress, primary, secondary } = lead;
  return (
    <section className={`sd-lead is-${tone}`} aria-label={title}>
      <span className="sd-idv-icon"><Icon size={24} weight="fill" /></span>
      <div className="sd-lead-body">
        <div className="sd-setup-head">
          <strong>{title}</strong>
          {onHide && (
            <button
              type="button"
              className="sd-card-hide"
              aria-label="Hide shop setup from the dashboard"
              title="Hide (Shop setup stays in the menu)"
              onClick={onHide}
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
        <p>{text}</p>
        {progress != null && (
          <div
            className="sd-setup-bar"
            role="progressbar"
            aria-label="Shop setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {(primary || secondary) && (
        <div className="sd-lead-actions">
          {secondary && <Link to={secondary.to} className="btn-seller-outline">{secondary.label}</Link>}
          {primary && (
            <Link to={primary.to} className="sd-card-btn">
              {primary.label} <ArrowRight size={15} weight="bold" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** Products buyers can see (ready to sell or not: that only decides ordering). */
const liveProducts = (stats) => stats.activeProducts;

/**
 * The one thing Home asks for first, or null: the shop is private, buyers
 * cannot order yet because something an order needs is missing, or the ID
 * needs doing. The rest is the "Complete your shop" card.
 */
const homeNotice = (store, setup) => {
  const identity = setup?.steps?.find((step) => step.key === 'identity');
  if (store?.isApproved === false) {
    return {
      Icon: LockSimple,
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
      Icon: WarningCircle,
      tone: 'amber',
      title: "Buyers can't order yet",
      hint: `Finish: ${blockers.map((b) => b.label).join(', ')}`,
      cta: 'Finish',
      to: setupNextTo(setup),
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
  return null;
};

/**
 * Phones: "Complete your shop", every setup step on one line with a tick
 * (done) or an empty circle (to do), in the order a shop gets ready for
 * orders. Each line opens the card where it is done. Gone once complete.
 */
function HomeSetupCard({ setup }) {
  const context = { municipality: setup.municipality };
  const rows = setup.steps.map((step) => ({ step, meta: describeStep(step, context) }));
  // The same count as Shop setup and the menu (optional steps left out).
  const { doneCount: done, total } = setup;
  const percent = Math.round((done / Math.max(1, total)) * 100);

  return (
    <section className="sh-card sh-setup" aria-label="Complete your shop">
      <div className="sh-card-head">
        <h2>Complete your shop</h2>
        <span className="sh-setup-count">{done} of {total} done</span>
      </div>
      <div className="sh-setup-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Shop setup progress">
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="sh-setup-list">
        {rows.map(({ step, meta }) => {
          const tag = meta.tone === 'waiting' ? 'Waiting'
            : meta.tone === 'failed' ? 'Needs attention'
              : meta.tone === 'done' ? null
                : meta.optional ? 'Optional'
                  : meta.neededToSell ? 'Needed to sell' : null;
          const body = (
            <>
              <span className={`sh-setup-mark is-${meta.tone}`} aria-hidden="true">
                {meta.tone === 'done' && <Check size={12} weight="bold" />}
                {meta.tone === 'waiting' && <Clock size={12} weight="bold" />}
                {meta.tone === 'failed' && <ExclamationMark size={12} weight="bold" />}
              </span>
              <span className="sh-setup-label">
                {meta.label}
                <span className="sh-sr">{meta.tone === 'done' ? ' (done)' : ' (not done yet)'}</span>
              </span>
              {tag && <em className={`sh-setup-tag is-${meta.tone}${tag === 'Needed to sell' ? ' is-sell' : ''}`}>{tag}</em>}
              {meta.to && <CaretRight size={16} className="sh-chev" />}
            </>
          );
          return (
            <li key={step.key} data-step={step.key}>
              {meta.to
                ? <Link to={meta.to} className={`sh-setup-row is-${meta.tone}`}>{body}</Link>
                : <div className={`sh-setup-row is-${meta.tone}`}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Tips: real things a seller can do, each one tap away. Swipe or wait. */
function HomeTips({ onShare }) {
  // Each tip is a little poster: a big title, the main icon on a frosted tile,
  // and two small accents floating around it.
  const slides = [
    { key: 'academy', title: 'Seller Academy', text: 'Free, simple lessons to sell more.', cta: 'Start learning', to: '/sell/academy', Icon: GraduationCap, accents: [BookOpen, Lightbulb], tone: 'green' },
    { key: 'decorate', title: 'Decorate your shop', text: 'Pick a ready-made look in one tap.', cta: 'Choose a template', to: '/seller/decorate', Icon: PaintBrush, accents: [Palette, Sparkle], tone: 'pink' },
    { key: 'announce', title: 'Tell your followers', text: 'Share news or promote a product.', cta: 'Open Marketing', to: '/seller/marketing', Icon: Megaphone, accents: [UsersThree, Heart], tone: 'violet' },
    { key: 'share', title: 'Share your shop', text: 'Send your shop link to friends and groups.', cta: 'Share now', onClick: onShare, Icon: ShareNetwork, accents: [LinkSimple, ChatCircleDots], tone: 'blue' },
  ];
  // The position in the track: 0…n-1 are the tips, n is a copy of the first
  // one after the last, so the carousel only ever moves forward.
  const [pos, setPos] = useState(0);
  // Set while the copy hands over to the real first tip: no entrance replay.
  const [looped, setLooped] = useState(false);
  const trackRef = React.useRef(null);
  const settleTimer = React.useRef(null);
  const count = slides.length;
  const index = pos % count;

  // The dots follow whichever tip is in view. Once the scroll comes to rest
  // on the copy, the track jumps (no animation) to the real first tip.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const now = Math.round(el.scrollLeft / el.clientWidth);
    setPos(now);
    if (now !== 0) setLooped(false);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (Math.round(el.scrollLeft / el.clientWidth) >= count) {
        setLooped(true);
        el.scrollTo({ left: 0, behavior: 'instant' });
      }
    }, 140);
  };
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const next = Math.min(Math.round(el.scrollLeft / el.clientWidth) + 1, count);
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [count]);

  return (
    <section className="sh-banners" aria-label="Tips">
      <div className="sh-banner-track" ref={trackRef} onScroll={onScroll}>
        {[...slides, { ...slides[0], key: `${slides[0].key}-again`, copy: true }].map(({ key, title, text, cta, to, onClick, Icon, accents, tone, copy }, i) => {
          const [AccentA, AccentB] = accents;
          const body = (
            <>
              <span className="sh-banner-deco" aria-hidden="true">
                <i className="sh-banner-ring" />
                <i className="sh-banner-blob" />
                <i className="sh-banner-dots" />
              </span>
              <span className="sh-banner-text">
                <strong>{title}</strong>
                <span>{text}</span>
                <em>{cta} <CaretRight size={12} weight="bold" /></em>
              </span>
              <span className="sh-banner-art" aria-hidden="true">
                <span className="sh-banner-tile"><Icon size={34} weight="fill" /></span>
                <span className="sh-banner-accent is-a"><AccentA size={15} weight="fill" /></span>
                <span className="sh-banner-accent is-b"><AccentB size={13} weight="fill" /></span>
              </span>
            </>
          );
          const cls = `sh-banner is-${tone}${i === pos ? ' is-active' : ''}${i === 0 && looped ? ' is-looped' : ''}`;
          // The copy is only there to slide onto: hidden from screen readers and Tab.
          const hide = copy ? { 'aria-hidden': true, tabIndex: -1 } : {};
          return to
            ? <Link key={key} to={to} className={cls} {...hide}>{body}</Link>
            : <button key={key} type="button" className={cls} onClick={onClick} {...hide}>{body}</button>;
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
  store, user, setup, unreadCount, switchToPersonal, waiting, sellsLivestock,
  isLoading, loadError, onRetry, analyticsAvailable, stats, salesByDay, recentSales, recentOrders, lowStock,
  prep, onOpenOrder,
}) {
  const { share, shareSheet } = useShare();
  const notice = homeNotice(store, setup);
  const live = liveProducts(stats);
  const name = store?.name || 'My shop';
  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const trend = salesByDay.slice(-14).map((day) => Number(day.total || 0));
  const maxTrend = Math.max(1, ...trend);
  const shareShop = () => store?.slug && share({
    title: name,
    text: `Shop at ${name} on Emoorm`,
    url: `${window.location.origin}/store/${store.slug}`,
  });
  // The same counts as the sidebar's badges, each opening its list.
  const numbers = [
    { label: 'To confirm', value: waiting['/seller/orders']?.count, to: '/seller/orders?status=PENDING' },
    { label: 'To pack', value: waiting['/seller/orders?status=to_ship']?.count, to: '/seller/orders?status=to_ship' },
    { label: 'Returns', value: waiting['/seller/returns']?.count, to: '/seller/returns' },
    { label: 'Reviews', value: waiting['/seller/reviews']?.count, to: '/seller/reviews?filter=reply' },
  ];
  // Rarer, but each one holds an order or a buyer up: a line of its own
  // when there is something.
  const extra = [
    { key: 'payments', n: waiting['/seller/orders?status=payment']?.count || 0, one: 'payment to check', many: 'payments to check', to: '/seller/orders?status=payment', Icon: QrCode },
    { key: 'questions', n: waiting['/seller/questions']?.count || 0, one: 'buyer question to answer', many: 'buyer questions to answer', to: '/seller/questions', Icon: Question },
    ...(sellsLivestock ? [{ key: 'offers', n: waiting['/seller/offers']?.count || 0, one: 'offer to answer', many: 'offers to answer', to: '/seller/offers', Icon: Handshake }] : []),
  ].filter((x) => x.n > 0);
  const tools = sellsLivestock ? [...HOME_TOOLS.slice(0, 7), OFFERS_TOOL, HOME_TOOLS[7]] : HOME_TOOLS;

  return (
    <div className="seller-dashboard sh">
      <h1 className="sr-only">Seller Center home</h1>
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
          <PageMenu area="seller" />
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

        {loadError && (
          <p className="sdm-note" role="alert">
            <WarningCircle size={15} /> Some numbers couldn&apos;t load.
            <button type="button" className="sdm-retry" onClick={onRetry}>Try again</button>
          </p>
        )}

        <section className="sh-card sh-numbers" aria-label="Needs your action">
          {numbers.map(({ label, value, to }) => (
            <Link key={label} to={to} className={value > 0 ? 'is-due' : undefined}>
              <strong>{value == null ? '–' : value}</strong>
              <span>{label}</span>
            </Link>
          ))}
        </section>

        {extra.length > 0 && (
          <section className="sh-card sh-list sh-due" aria-label="Also waiting">
            {extra.map(({ key, n, one, many, to, Icon }) => (
              <Link key={key} to={to} className="sh-row">
                <span className="sh-row-icon"><Icon size={19} weight="fill" /></span>
                <span className="sh-row-label">{n} {n === 1 ? one : many}</span>
                <CaretRight size={16} className="sh-chev" />
              </Link>
            ))}
          </section>
        )}

        <PrepList prep={prep} phone />

        <section className="sh-card">
          <div className="sh-card-head"><h2>Shop tools</h2></div>
          <ToolGradients />
          <div className="sh-tools">
            {tools.map(({ to, label, Icon, tone, tour }) => (
              <Link key={to} to={to} className="sh-tool" {...(tour ? { 'data-tour': tour } : {})}>
                <span className={`sh-tool-icon is-${tone}`}><Icon size={30} weight="fill" /></span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>

        <HomeTips onShare={shareShop} />

        {setup && !setup.complete && <HomeSetupCard setup={setup} />}

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
            <span><strong>{isLoading ? '–' : formatNumber(live)}</strong> live {Number(live) === 1 ? 'product' : 'products'}</span>
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
            <div className="sdm-empty">
              <EmptyArt name="orders" size={72} />
              <span>No orders yet. They show up here as soon as a buyer orders.</span>
            </div>
          ) : (
            <ul className="sh-orders">
              {recentOrders.map((o) => <PhoneOrderRow key={o.id} order={o} onClick={() => onOpenOrder(o.id)} />)}
            </ul>
          )}
        </section>

        {lowStock.length > 0 && (
          <section className="sh-card sh-list">
            <div className="sh-card-head">
              <h2>Running low</h2>
              <Link to="/seller/products?stock=low">See all <CaretRight size={13} weight="bold" /></Link>
            </div>
            {/* Each row opens a quick restock for that product. */}
            {lowStock.map((prod) => (
              <Link key={prod.id} to={`/seller/products?restock=${prod.id}`} className="sh-row" aria-label={`Restock ${prod.name}, ${prod.stock} left`}>
                <span className="sh-row-icon"><WarningCircle size={19} weight="fill" /></span>
                <span className="sh-row-label">{prod.name}</span>
                <span className="sh-row-hint">{Number(prod.stock) === 0 ? 'Out of stock' : `${prod.stock} left`}</span>
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
  const photo = first ? lineImage(first.product, first.selectedVariations) : null;
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

/** Computers: one number of the overview strip. */
function OverviewStat({ label, value, sub, warn }) {
  return (
    <div className="sd-ov-stat">
      <span className="sd-ov-value">{value}</span>
      <span className="sd-ov-label">{label}</span>
      {sub && <span className={`sd-ov-sub${warn ? ' is-warn' : ''}`}>{sub}</span>}
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
