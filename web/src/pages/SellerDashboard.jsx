import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import {
  Plus, Clock, Truck, CheckCircle, Package,
  ShoppingBag, TrendUp as TrendingUp, Star, ChartBar as BarChart2, User, Users, WarningCircle,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import Skeleton from '../components/ui/Skeleton';
import { getSellerFollowerStats, subscribeToFollowChanges } from '../lib/follow';
import './SellerDashboard.css';

const STATUS_META = {
  PENDING: { label: 'To Pay', tint: 'sc-tint-amber', Icon: Clock },
  CONFIRMED: { label: 'To Pay', tint: 'sc-tint-amber', Icon: Clock },
  PREPARING: { label: 'To Ship', tint: 'sc-tint-blue', Icon: Package },
  READY: { label: 'To Ship', tint: 'sc-tint-blue', Icon: Truck },
  COMPLETED: { label: 'Completed', tint: 'sc-tint-green', Icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', tint: 'sc-tint-red', Icon: Clock },
};

export default function SellerDashboard() {
  const { user } = useAuthStore();
  const ctx = useOutletContext();
  const store = ctx?.store;
  const navigate = useNavigate();

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
        // Fallback if the analytics endpoint is unavailable
        const completed = orders.filter((o) => o.status === 'COMPLETED');
        const lifetimeSales = completed.reduce((sum, o) => sum + Number(o.total || 0), 0);
        setStats({
          lifetimeSales,
          completedOrders: completed.length,
          activeProducts: products.filter((p) => p.status === 'APPROVED').length,
          avgOrderValue: completed.length ? lifetimeSales / completed.length : 0,
        });
      }

      // Prefer best sellers from analytics, fall back to rating sort
      if (analytics?.topProducts?.length) {
        const byId = Object.fromEntries(products.map((p) => [p.id, p]));
        setTopProducts(
          analytics.topProducts
            .slice(0, 3)
            .map((tp) => byId[tp.id] || tp)
        );
      } else {
        setTopProducts(
          [...products]
            .sort((a, b) => (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0))
            .slice(0, 3)
        );
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

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Seller Dashboard</h1>
            <p className="seller-welcome">Overview of {shopName}</p>
          </div>
          <div className="seller-header-actions">
            <Link to="/seller/products/new" className="btn-seller-primary">
              <Plus size={16} /> Add Product
            </Link>
          </div>
        </div>

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

          {/* Stats grid */}
          <div className="sd-stats">
            {isLoading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div className="sd-stat" key={i}>
                    <Skeleton width="55%" height={11} />
                    <Skeleton width="70%" height={22} radius={4} />
                  </div>
                ))}
              </>
            ) : (
              <>
                <StatCard label="Total Sales" value={`₱${formatNumber(stats.lifetimeSales)}`} big />
                <StatCard label="Completed Orders" value={formatNumber(stats.completedOrders)} />
                <StatCard label="Active Products" value={formatNumber(stats.activeProducts)} />
                <StatCard label="Avg. Order Value" value={`₱${formatNumber(stats.avgOrderValue)}`} />
              </>
            )}
          </div>

          {/* Body grid */}
          <div className="sd-body">
            <div className="sd-main">
            <section className="sd-card sd-orders">
              <header className="sd-card-header">
                <h2>Recent Orders</h2>
                <Link to="/seller/orders" className="sd-view-all">View All</Link>
              </header>

              {isLoading ? (
                <Skeleton.OrderList rows={4} />
              ) : recentOrders.length === 0 ? (
                <div className="sd-empty">
                  <ShoppingBag size={28} />
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
                  <BarChart2 size={22} />
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
                    <Users size={22} />
                    <p>Couldn't load follower stats.</p>
                  </div>
                ) : !followerStats ? (
                  <div className="sd-empty sd-empty--sm">
                    <Users size={22} />
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
                              {r.buyer.profilePhoto ? (
                                <img src={r.buyer.profilePhoto} alt={r.buyer.fullName} />
                              ) : (
                                <span>
                                  {(r.buyer.fullName || '?').slice(0, 1).toUpperCase()}
                                </span>
                              )}
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
                    <Package size={22} />
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
                            <Star size={11} weight="fill" color="#f59e0b" />
                            {p.averageRating != null ? Number(p.averageRating).toFixed(1) : '—'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="sd-card sd-quick">
                <header className="sd-card-header sd-card-header--slim">
                  <h2>Quick Actions</h2>
                </header>
                <ul className="sd-quick-list">
                  <li>
                    <Link to="/seller/products">
                      <Package size={15} /> Manage Products
                    </Link>
                  </li>
                  <li>
                    <Link to="/seller/orders">
                      <ShoppingBag size={15} /> View Orders
                    </Link>
                  </li>
                  <li>
                    <Link to="/seller/analytics">
                      <BarChart2 size={15} /> Analytics
                    </Link>
                  </li>
                  <li>
                    <Link to="/seller/store">
                      <User size={15} /> Shop Profile
                    </Link>
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, big }) {
  return (
    <div className="sd-stat">
      <span className="sd-stat-label">{label}</span>
      <span className={`sd-stat-value ${big ? 'sd-stat-value--big' : ''}`}>{value}</span>
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
