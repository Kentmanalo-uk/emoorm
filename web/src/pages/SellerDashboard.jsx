import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import {
  Plus, Clock, Truck, CheckCircle, Package,
  ShoppingBag, TrendingUp, Star, BarChart2, User,
} from 'lucide-react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import Skeleton from '../components/ui/Skeleton';
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
  const [stats, setStats] = useState({
    totalSales: 0,
    ordersCount: 0,
    productsCount: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [analyticsRes, ordersRes, productsRes] = await Promise.allSettled([
        axios.get('/analytics/seller'),
        axios.get('/orders/store/orders', { params: { pageSize: 5 } }),
        axios.get('/products/my/products', { params: { pageSize: 100 } }),
      ]);
      if (cancelled) return;

      const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value.data : null;
      const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
      const products = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];

      setRecentOrders(orders.slice(0, 5));

      if (analytics) {
        setStats({
          totalSales: analytics.totalRevenue,
          ordersCount: analytics.totalOrders,
          productsCount: analytics.totalProducts,
          completed: analytics.completedOrders,
        });
      } else {
        // Fallback if the analytics endpoint is unavailable
        const completedOrders = orders.filter((o) => o.status === 'COMPLETED');
        setStats({
          totalSales: completedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
          ordersCount: orders.length,
          productsCount: products.length,
          completed: completedOrders.length,
        });
      }

      // Prefer best sellers from analytics, fall back to rating sort
      if (analytics?.topProducts?.length) {
        const byId = Object.fromEntries(products.map((p) => [p.id, p]));
        setTopProducts(
          analytics.topProducts
            .slice(0, 3)
            .map(({ product }) => byId[product.id] || product)
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

        <div className="sd">

        {/* Stats grid */}
        <div className="sd-stats">
        <StatCard label="Total Sales" value={`₱${formatNumber(stats.totalSales)}`} big />
        <StatCard label="Orders" value={stats.ordersCount} />
        <StatCard label="Products" value={stats.productsCount} />
        <StatCard label="Completed" value={stats.completed} />
      </div>

      {/* Body grid */}
      <div className="sd-body">
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

        <aside className="sd-right">
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
                        <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                        {p.averageRating != null ? Number(p.averageRating).toFixed(0) : '—'}
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
