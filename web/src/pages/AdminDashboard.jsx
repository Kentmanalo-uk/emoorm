import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Package, Flag, CheckCircle, Clock, TrendingUp, Store, AlertCircle } from 'lucide-react';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentReports, setRecentReports] = useState([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const [pendingSellersRes, pendingProductsRes, reportsRes] = await Promise.allSettled([
        axios.get('/auth/users', { params: { sellerApplicationStatus: 'PENDING', pageSize: 1 } }),
        axios.get('/products', { params: { status: 'PENDING', pageSize: 1 } }),
        axios.get('/reports', { params: { pageSize: 5 } }),
      ]);

      const pendingSellers = pendingSellersRes.status === 'fulfilled'
        ? (pendingSellersRes.value.pagination?.total ?? 0)
        : 0;
      const pendingProducts = pendingProductsRes.status === 'fulfilled'
        ? (pendingProductsRes.value.pagination?.total ?? 0)
        : 0;
      const openReports = reportsRes.status === 'fulfilled'
        ? (reportsRes.value.pagination?.total ?? 0)
        : 0;

      setStats({ pendingSellers, pendingProducts, openReports });

      if (reportsRes.status === 'fulfilled') {
        setRecentReports(reportsRes.value.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const STAT_CARDS = [
    {
      label: 'Pending Sellers',
      value: stats?.pendingSellers ?? '—',
      icon: Users,
      iconBg: '#fef3c7',
      iconColor: '#d97706',
      link: '/admin/sellers',
      linkLabel: 'Review →',
    },
    {
      label: 'Pending Products',
      value: stats?.pendingProducts ?? '—',
      icon: Package,
      iconBg: '#dbeafe',
      iconColor: '#2563eb',
      link: '/admin/products',
      linkLabel: 'Review →',
    },
    {
      label: 'Open Reports',
      value: stats?.openReports ?? '—',
      icon: Flag,
      iconBg: '#fee2e2',
      iconColor: '#dc2626',
      link: '/admin/reports',
      linkLabel: 'Manage →',
    },
  ];

  const REPORT_STATUS_BADGE = {
    PENDING: 'admin-badge-pending',
    UNDER_REVIEW: 'admin-badge-review',
    RESOLVED: 'admin-badge-resolved',
    DISMISSED: 'admin-badge-dismissed',
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Dashboard</h1>
        <p className="admin-page-sub">Municipal Admin — Oriental Mindoro</p>
      </div>

      {/* Stats */}
      <div className="admin-stats-row">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: card.iconBg }}>
                <Icon size={20} color={card.iconColor} />
              </div>
              <div className="admin-stat-label">{card.label}</div>
              <div className="admin-stat-value">
                {isLoading ? '…' : card.value}
              </div>
              <Link to={card.link} className="admin-stat-link">{card.linkLabel}</Link>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Quick Actions</h2>
        </div>
        <div className="admin-quick-actions">
          <Link to="/admin/sellers" className="admin-quick-btn">
            <Users size={18} />
            <span>Review Seller Applications</span>
          </Link>
          <Link to="/admin/products" className="admin-quick-btn">
            <Package size={18} />
            <span>Approve Products</span>
          </Link>
          <Link to="/admin/reports" className="admin-quick-btn">
            <Flag size={18} />
            <span>Manage Reports</span>
          </Link>
        </div>
      </div>

      {/* Recent reports */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Recent Reports</h2>
          <Link to="/admin/reports" className="admin-view-all-link">View all →</Link>
        </div>
        {isLoading ? (
          <div className="admin-loading"><p>Loading…</p></div>
        ) : recentReports.length === 0 ? (
          <div className="admin-empty">
            <CheckCircle size={36} />
            <p>No open reports — great!</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((r) => (
                  <tr key={r.id}>
                    <td><span className="admin-badge admin-badge-pending">{r.type}</span></td>
                    <td>{r.product?.name || r.store?.name || '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason}
                    </td>
                    <td>
                      <span className={`admin-badge ${REPORT_STATUS_BADGE[r.status] || ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
