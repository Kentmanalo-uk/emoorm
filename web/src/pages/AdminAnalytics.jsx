import React, { useState, useEffect } from 'react';
import {
  Users, Store, Package, ShoppingBag, TrendingUp,
  Flag, Star, CheckCircle, Clock, XCircle, BarChart2
} from 'lucide-react';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminAnalytics.css';

export default function AdminAnalytics() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const [usersRes, sellersRes, productsRes, ordersRes, storesRes, reportsRes, reviewsRes] =
        await Promise.allSettled([
          axios.get('/auth/users', { params: { pageSize: 1 } }),
          axios.get('/auth/users', { params: { role: 'SELLER', pageSize: 1 } }),
          axios.get('/products', { params: { pageSize: 1 } }),
          axios.get('/orders', { params: { pageSize: 10 } }),
          axios.get('/stores', { params: { pageSize: 1 } }),
          axios.get('/reports', { params: { pageSize: 1, status: 'PENDING' } }),
          axios.get('/products', { params: { pageSize: 5, sortBy: 'orderCount', sortOrder: 'desc' } }),
        ]);

      const v = (r) => (r.status === 'fulfilled' ? r.value : null);
      const total = (r) => v(r)?.pagination?.total ?? 0;

      const orders = v(ordersRes)?.data || [];
      const completedRevenue = orders
        .filter((o) => o.status === 'COMPLETED')
        .reduce((sum, o) => sum + Number(o.total || 0), 0);

      const byStatus = orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      }, {});

      setStats({
        totalUsers: total(usersRes),
        totalSellers: total(sellersRes),
        totalProducts: total(productsRes),
        totalStores: total(storesRes),
        openReports: total(reportsRes),
        totalOrders: total(ordersRes),
        sampleRevenue: completedRevenue,
        byStatus,
      });

      setRecentOrders(orders.slice(0, 8));
      setTopProducts(v(reviewsRes)?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const STATUS_BADGE = {
    PENDING: { cls: 'admin-badge-pending', label: 'Pending' },
    CONFIRMED: { cls: 'admin-badge-review', label: 'Confirmed' },
    PREPARING: { cls: 'admin-badge-review', label: 'Preparing' },
    READY: { cls: 'admin-badge-active', label: 'Ready' },
    COMPLETED: { cls: 'admin-badge-resolved', label: 'Completed' },
    CANCELLED: { cls: 'admin-badge-rejected', label: 'Cancelled' },
  };

  const STAT_CARDS = [
    { label: 'Total Users', value: stats?.totalUsers, icon: Users, bg: '#dbeafe', color: '#1d4ed8' },
    { label: 'Active Sellers', value: stats?.totalSellers, icon: Store, bg: '#d1fae5', color: '#065f46' },
    { label: 'Active Stores', value: stats?.totalStores, icon: Store, bg: '#e0e7ff', color: '#3730a3' },
    { label: 'Products', value: stats?.totalProducts, icon: Package, bg: '#fef3c7', color: '#92400e' },
    { label: 'Orders (sample)', value: stats?.totalOrders, icon: ShoppingBag, bg: '#f3e8ff', color: '#6d28d9' },
    { label: 'Open Reports', value: stats?.openReports, icon: Flag, bg: '#fee2e2', color: '#991b1b' },
  ];

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Platform Analytics</h1>
        <p className="admin-page-sub">Platform-wide overview — Oriental Mindoro E-Commerce</p>
      </div>

      {/* Stats */}
      <div className="admin-stats-row">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: card.bg }}>
                <Icon size={20} color={card.color} />
              </div>
              <div className="admin-stat-label">{card.label}</div>
              <div className="admin-stat-value">
                {isLoading ? '…' : (card.value ?? 0).toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order status breakdown */}
      {!isLoading && stats?.byStatus && Object.keys(stats.byStatus).length > 0 && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <div className="admin-card-header">
            <h2 className="admin-card-title">Recent Order Status Breakdown</h2>
          </div>
          <div className="analytics-status-row">
            {Object.entries(stats.byStatus).map(([status, count]) => {
              const cfg = STATUS_BADGE[status] || { cls: 'admin-badge-dismissed', label: status };
              return (
                <div key={status} className="analytics-status-card">
                  <span className={`admin-badge ${cfg.cls}`}>{cfg.label}</span>
                  <span className="analytics-status-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revenue note */}
      {!isLoading && stats?.sampleRevenue > 0 && (
        <div className="admin-card analytics-revenue-card" style={{ marginBottom: 24 }}>
          <TrendingUp size={20} />
          <div>
            <p className="analytics-revenue-label">Revenue from sample (completed orders)</p>
            <p className="analytics-revenue-value">₱{stats.sampleRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* Recent orders table */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Recent Orders</h2>
        </div>
        {isLoading ? (
          <Skeleton.Table cols={5} rows={5} />
        ) : recentOrders.length === 0 ? (
          <div className="admin-empty"><ShoppingBag size={36} /><p>No orders yet</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Store</th>
                  <th>Buyer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const cfg = STATUS_BADGE[o.status] || { cls: 'admin-badge-dismissed', label: o.status };
                  return (
                    <tr key={o.id}>
                      <td><code style={{ fontSize: 12 }}>{o.orderNumber || o.id.slice(0, 8)}</code></td>
                      <td style={{ fontSize: 13 }}>{o.store?.name || '—'}</td>
                      <td style={{ fontSize: 13 }}>{o.buyer?.fullName || '—'}</td>
                      <td style={{ fontWeight: 600, color: '#059669' }}>₱{Number(o.total || 0).toFixed(2)}</td>
                      <td><span className={`admin-badge ${cfg.cls}`}>{cfg.label}</span></td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {new Date(o.createdAt).toLocaleDateString('en-PH')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
