import React, { useEffect, useState } from 'react';
import { Users, Store, Package, ShoppingBag, TrendingUp } from 'lucide-react';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminAnalytics.css';

const peso = (v) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
    .format(Number(v || 0));

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/analytics/platform');
        setData(res.data ?? res);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const maxSales = Math.max(1, ...((data?.salesByDay || []).map((d) => d.total)));

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Platform Analytics</h1>
      </div>

      {isLoading ? (
        <div className="admin-stats-row">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-stat-card"><Skeleton width="60%" /></div>
          ))}
        </div>
      ) : !data ? (
        <div className="admin-card"><p>Unable to load platform analytics.</p></div>
      ) : (
        <>
          <div className="admin-stats-row">
            <StatCard icon={Users} label="Buyers" value={data.usersByRole.BUYER} />
            <StatCard icon={Store} label="Sellers" value={data.usersByRole.SELLER} />
            <StatCard icon={Users} label="Municipal Admins" value={data.usersByRole.MUNICIPAL_ADMIN} />
            <StatCard icon={Store} label="Stores" value={data.stores.total} />
            <StatCard icon={Package} label="Products" value={data.products.total} />
            <StatCard icon={ShoppingBag} label="Orders" value={data.orders.total} />
            <StatCard icon={TrendingUp} label="Revenue" value={peso(data.revenue.total)} />
          </div>

          {data.salesByDay?.length > 0 && (
            <div className="admin-card">
              <div className="admin-card-header">
                <h2 className="admin-card-title">Sales — last 30 days</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, padding: '12px 16px' }}>
                {data.salesByDay.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${peso(d.total)}`}
                    style={{
                      flex: 1, minWidth: 6,
                      height: `${(d.total / maxSales) * 100}%`,
                      background: '#059669', borderRadius: '2px 2px 0 0',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {data.salesByMunicipality?.length > 0 && (
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
                    {data.salesByMunicipality
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
        </>
      )}
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-icon">
        <Icon size={18} />
      </div>
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value ?? 0}</div>
    </div>
  );
}
