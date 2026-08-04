import React, { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, ShoppingBag, Package, Users } from 'lucide-react';
import axios from '../lib/axios';
import './SellerDashboard.css';

export default function SellerAnalytics() {
  const [metrics, setMetrics] = useState({
    revenue7d: 0,
    revenue30d: 0,
    ordersTotal: 0,
    completionRate: 0,
    uniqueBuyers: 0,
    avgOrderValue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/orders/store/orders', { params: { pageSize: 200 } });
        const orders = res.data || [];
        const now = Date.now();
        const in7d = orders.filter((o) => now - new Date(o.createdAt).getTime() <= 7 * 864e5);
        const in30d = orders.filter((o) => now - new Date(o.createdAt).getTime() <= 30 * 864e5);
        const completed = orders.filter((o) => o.status === 'COMPLETED');
        const sum = (arr) => arr.reduce((s, o) => s + Number(o.total || 0), 0);
        if (cancelled) return;
        setMetrics({
          revenue7d: sum(in7d.filter((o) => o.status === 'COMPLETED')),
          revenue30d: sum(in30d.filter((o) => o.status === 'COMPLETED')),
          ordersTotal: orders.length,
          completionRate: orders.length ? Math.round((completed.length / orders.length) * 100) : 0,
          uniqueBuyers: new Set(orders.map((o) => o.buyerId)).size,
          avgOrderValue: completed.length ? Math.round(sum(completed) / completed.length) : 0,
        });
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });

  const tiles = [
    { label: 'Revenue (7d)', value: `₱${fmt(metrics.revenue7d)}`, Icon: TrendingUp, tint: 'sc-tint-green' },
    { label: 'Revenue (30d)', value: `₱${fmt(metrics.revenue30d)}`, Icon: BarChart2, tint: 'sc-tint-blue' },
    { label: 'Total Orders', value: fmt(metrics.ordersTotal), Icon: ShoppingBag, tint: 'sc-tint-amber' },
    { label: 'Completion Rate', value: `${metrics.completionRate}%`, Icon: Package, tint: 'sc-tint-green' },
    { label: 'Unique Buyers', value: fmt(metrics.uniqueBuyers), Icon: Users, tint: 'sc-tint-blue' },
    { label: 'Avg. Order', value: `₱${fmt(metrics.avgOrderValue)}`, Icon: TrendingUp, tint: 'sc-tint-amber' },
  ];

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Analytics</h1>
            <p className="seller-welcome">Insight into your store performance</p>
          </div>
        </div>

        <div className="sd-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
          {tiles.map(({ label, value, Icon, tint }) => (
            <div key={label} className="sd-stat" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <span className={`sd-order-icon ${tint}`} style={{ width: 40, height: 40 }}>
                <Icon size={18} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="sd-stat-label">{label}</span>
                <span className="sd-stat-value" style={{ fontSize: 18 }}>
                  {isLoading ? '…' : value}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="seller-card">
          <div className="seller-card-header">
            <h2><BarChart2 size={16} /> Trend chart</h2>
          </div>
          <div className="seller-empty" style={{ padding: '48px 16px' }}>
            <BarChart2 size={36} />
            <p>Charts coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
