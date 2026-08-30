import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Package, Flag, Storefront as Store, ShoppingCart, Wallet,
  CheckCircle, WarningCircle as AlertCircle, TrendUp as TrendingUp,
} from '@phosphor-icons/react';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import '../components/admin/AdminLayout.css';

const peso = (v) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
    .format(Number(v || 0));

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [data, setData] = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const endpoint = isSuperAdmin ? '/analytics/platform' : '/analytics/municipality';
        const [analyticsRes, reportsRes] = await Promise.allSettled([
          axios.get(endpoint),
          axios.get('/reports', { params: { pageSize: 5, status: 'PENDING' } }),
        ]);
        if (cancelled) return;

        if (analyticsRes.status === 'fulfilled') {
          setData(analyticsRes.value.data ?? analyticsRes.value);
        } else {
          setError(analyticsRes.reason?.response?.data?.message || 'Failed to load analytics');
        }
        if (reportsRes.status === 'fulfilled') {
          setRecentReports(reportsRes.value.data || []);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  // Normalize both platform + municipality shapes into a single view
  const view = data
    ? {
      title: isSuperAdmin
        ? 'Platform Overview'
        : `Municipality — ${data.municipality?.name || ''}`,
      pendingSellers: isSuperAdmin ? data.pending?.sellers : data.users?.pendingSellers,
      pendingProducts: isSuperAdmin ? data.pending?.products : data.products?.counts?.PENDING,
      pendingReports: isSuperAdmin ? data.pending?.reports : data.reports?.pending,
      activeStores: data.stores?.active,
      suspendedStores: data.stores?.suspended,
      totalOrders: data.orders?.total,
      completedOrders: data.revenue?.completedOrders,
      revenue: data.revenue?.total,
      totalProducts: data.products?.total,
      approvedSellers: !isSuperAdmin ? data.users?.approvedSellers : null,
      salesByDay: data.salesByDay || [],
      salesByMunicipality: isSuperAdmin ? data.salesByMunicipality || [] : null,
      recentSellers: !isSuperAdmin ? data.recentSellerApplications || [] : null,
      recentPendingProducts: !isSuperAdmin ? data.recentPendingProducts || [] : null,
      usersByRole: isSuperAdmin ? data.usersByRole : null,
    }
    : null;

  const STAT_CARDS = view
    ? [
      {
        label: 'Pending Sellers',
        value: view.pendingSellers ?? 0,
        icon: Users,
        link: '/admin/sellers',
        linkLabel: 'Review →',
      },
      {
        label: 'Pending Products',
        value: view.pendingProducts ?? 0,
        icon: Package,
        link: '/admin/products',
        linkLabel: 'Review →',
      },
      {
        label: 'Open Reports',
        value: view.pendingReports ?? 0,
        icon: Flag,
        link: '/admin/reports',
        linkLabel: 'Manage →',
      },
      {
        label: 'Active Stores',
        value: view.activeStores ?? 0,
        icon: Store,
        link: '/admin/sellers',
        linkLabel: 'View →',
      },
      {
        label: 'Orders',
        value: view.totalOrders ?? 0,
        icon: ShoppingCart,
        link: '#',
        linkLabel: `${view.completedOrders ?? 0} completed`,
      },
      {
        label: 'Total Revenue',
        value: peso(view.revenue),
        icon: Wallet,
        link: '#',
        linkLabel: 'From completed orders',
      },
    ]
    : [];

  const maxSales = Math.max(1, ...(view?.salesByDay || []).map((d) => d.total));

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Dashboard</h1>
      </div>

      {error && (
        <div className="admin-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <AlertCircle size={18} color="#b91c1c" />
            <div>
              <strong>Failed to load analytics.</strong>
              <div style={{ fontSize: 13, color: '#64748b' }}>{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Stat grid */}
      <div className="admin-stats-row">
        {isLoading && !view
          ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-stat-card"><Skeleton width="60%" /></div>
          ))
          : STAT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="admin-stat-card">
                <div className="admin-stat-icon">
                  <Icon size={18} />
                </div>
                <div className="admin-stat-label">{card.label}</div>
                <div className="admin-stat-value">{card.value}</div>
                {card.link !== '#' ? (
                  <Link to={card.link} className="admin-stat-link">{card.linkLabel}</Link>
                ) : (
                  <span className="admin-stat-link" style={{ color: '#94a3b8', cursor: 'default' }}>
                    {card.linkLabel}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {/* Sales trend */}
      {view?.salesByDay?.length > 0 && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Sales — last 30 days</h2>
            <TrendingUp size={16} color="#64748b" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, padding: '12px 16px' }}>
            {view.salesByDay.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${peso(d.total)}`}
                style={{
                  flex: 1,
                  minWidth: 6,
                  height: `${(d.total / maxSales) * 100}%`,
                  background: '#059669',
                  borderRadius: '2px 2px 0 0',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Platform: sales by municipality */}
      {isSuperAdmin && view?.salesByMunicipality?.length > 0 && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Sales by Municipality</h2>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Municipality</th>
                  <th>Admin</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {view.salesByMunicipality
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>
                        {m.hasAdmin ? (
                          <span className="admin-badge admin-badge-resolved">Assigned</span>
                        ) : (
                          <span className="admin-badge admin-badge-pending">Unassigned</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{m.orders}</td>
                      <td style={{ textAlign: 'right' }}>{peso(m.revenue)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Municipal: pending seller applications */}
      {!isSuperAdmin && view?.recentSellers?.length > 0 && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Recent Seller Applications</h2>
            <Link to="/admin/sellers" className="admin-view-all-link">View all →</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Business</th>
                  <th>Applied</th>
                </tr>
              </thead>
              <tbody>
                {view.recentSellers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.fullName}<br /><small style={{ color: '#6b7280' }}>{s.email}</small></td>
                    <td>{s.shopName || '—'}</td>
                    <td>
                      {s.sellerApplicationDate
                        ? new Date(s.sellerApplicationDate).toLocaleDateString('en-PH')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Municipal: pending products */}
      {!isSuperAdmin && view?.recentPendingProducts?.length > 0 && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Products Awaiting Approval</h2>
            <Link to="/admin/products" className="admin-view-all-link">View all →</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Store</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {view.recentPendingProducts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.store?.name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{peso(p.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent open reports */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Open Reports</h2>
          <Link to="/admin/reports" className="admin-view-all-link">View all →</Link>
        </div>
        {isLoading ? (
          <Skeleton.Table cols={4} rows={3} />
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
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((r) => (
                  <tr key={r.id}>
                    <td><span className="admin-badge admin-badge-pending">{r.type}</span></td>
                    <td>{r.product?.name || r.product?.store?.name || '—'}</td>
                    <td style={{
                      maxWidth: 220, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.reason}</td>
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
