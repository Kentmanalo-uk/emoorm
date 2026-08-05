import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart2, TrendingUp, ShoppingBag, Package } from 'lucide-react';
import axios from '../lib/axios';
import './SellerDashboard.css';

export default function SellerAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/analytics/seller');
        if (!cancelled) setAnalytics(res.data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });

  const totalRevenue = analytics?.totalRevenue || 0;
  const totalOrders = analytics?.totalOrders || 0;
  const completedOrders = analytics?.completedOrders || 0;
  const revenue30d = (analytics?.salesByDay || []).reduce((s, d) => s + Number(d.total || 0), 0);
  const completionRate = totalOrders ? Math.round((completedOrders / totalOrders) * 100) : 0;
  const avgOrderValue = completedOrders ? Math.round(totalRevenue / completedOrders) : 0;

  const tiles = [
    { label: 'Revenue (30d)', value: `₱${fmt(revenue30d)}`, Icon: BarChart2, tint: 'sc-tint-blue' },
    { label: 'Total Revenue', value: `₱${fmt(totalRevenue)}`, Icon: TrendingUp, tint: 'sc-tint-green' },
    { label: 'Total Orders', value: fmt(totalOrders), Icon: ShoppingBag, tint: 'sc-tint-amber' },
    { label: 'Completion Rate', value: `${completionRate}%`, Icon: Package, tint: 'sc-tint-green' },
    { label: 'Avg. Order', value: `₱${fmt(avgOrderValue)}`, Icon: TrendingUp, tint: 'sc-tint-amber' },
    { label: 'Live Products', value: fmt(analytics?.productCounts?.APPROVED), Icon: Package, tint: 'sc-tint-blue' },
  ];

  const salesByDay = analytics?.salesByDay || [];
  const maxDay = Math.max(...salesByDay.map((d) => Number(d.total)), 1);
  const topProducts = analytics?.topProducts || [];
  const lowStock = analytics?.lowStockProducts || [];

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Analytics</h1>
            <p className="seller-welcome">Insight into your store performance</p>
          </div>
        </div>

        <div className="sd-stats sd-stats--3" style={{ marginBottom: 16 }}>
          {tiles.map(({ label, value, Icon, tint }) => (
            <div key={label} className="sd-stat seller-stat-inline">
              <span className={`seller-stat-icon ${tint}`}>
                <Icon size={18} />
              </span>
              <div>
                <span className="sd-stat-label">{label}</span>
                <span className="sd-stat-value">
                  {isLoading ? '…' : value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 30-day sales trend */}
        <div className="seller-card" style={{ marginBottom: 16 }}>
          <div className="seller-card-header">
            <h2>Sales — last 30 days</h2>
          </div>
          {salesByDay.length === 0 ? (
            <div className="seller-empty">
              <BarChart2 size={36} />
              <p>No completed sales in the last 30 days.</p>
            </div>
          ) : (
            <div className="seller-chart">
              {salesByDay.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ₱${fmt(d.total)}`}
                  className="seller-chart-bar"
                  style={{ height: `${Math.max((Number(d.total) / maxDay) * 100, 4)}%` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="seller-grid-2">
          {/* Top products */}
          <div className="seller-card">
            <div className="seller-card-header">
              <h2>Top Products</h2>
            </div>
            {topProducts.length === 0 ? (
              <div className="seller-empty">
                <Package size={28} />
                <p>No sales yet.</p>
              </div>
            ) : (
              <ul className="seller-list">
                {topProducts.map(({ product, quantitySold, revenue }) => (
                  <li key={product.id} className="seller-list-row">
                    <span>{product.name || 'Unknown product'}</span>
                    <span className="seller-list-meta">{quantitySold} sold · ₱{fmt(revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Low stock */}
          <div className="seller-card">
            <div className="seller-card-header">
              <h2>Low Stock</h2>
            </div>
            {lowStock.length === 0 ? (
              <div className="seller-empty">
                <Package size={28} />
                <p>All products are well stocked.</p>
              </div>
            ) : (
              <ul className="seller-list">
                {lowStock.map((p) => (
                  <li key={p.id} className="seller-list-row">
                    <Link to="/seller/products">{p.name}</Link>
                    <span className={p.stock === 0 ? 'seller-stock-out' : 'seller-stock-warn'}>
                      {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
