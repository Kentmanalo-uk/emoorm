import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Info } from '@phosphor-icons/react';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import './SellerDashboard.css';

/**
 * Earnings Summary — E-MOORM is a direct-payment marketplace (buyers pay sellers
 * directly via COD/GCash/QR Ph). There is no in-app wallet or payout system, so this
 * page reports honest, real order data instead of a fabricated "available balance".
 */
export default function SellerFinance() {
  const [kpis, setKpis] = useState(null);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [analyticsRes, ordersRes] = await Promise.all([
          axios.get('/analytics/seller'),
          axios.get('/orders/store/orders', { params: { status: 'COMPLETED', pageSize: 10 } }),
        ]);
        if (cancelled) return;
        setKpis(analyticsRes.data.kpis || {});
        setOrdersByStatus(analyticsRes.data.ordersByStatus || {});
        setTransactions(
          (ordersRes.data || []).map((o) => ({
            id: o.id,
            date: o.createdAt,
            desc: `Order #${(o.orderNumber || o.id).toString().slice(-8)}`,
            amount: Number(o.total || 0),
          })),
        );
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

  const inProgressCount =
    (ordersByStatus.PENDING || 0) +
    (ordersByStatus.CONFIRMED || 0) +
    (ordersByStatus.PREPARING || 0) +
    (ordersByStatus.READY || 0);

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Earnings Summary</h1>
            <p className="seller-welcome">Revenue from your completed orders</p>
          </div>
        </div>

        <div
          className="seller-card"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 18px', marginBottom: 16 }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: '#0284c7' }} />
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
            E-MOORM does not hold or process your money — buyers pay you directly via Cash on
            Delivery, GCash, or QR Ph (configured in <Link to="/seller/fulfillment">Fulfillment &amp; Payment</Link>).
            This page is a summary of your order revenue, not a wallet balance.
          </p>
        </div>

        <div className="sd-stats sd-stats--3" style={{ marginBottom: 16 }}>
          <div className="sd-stat">
            <span className="sd-stat-label">Total Earnings (Completed Orders)</span>
            <span className="sd-stat-value sd-stat-value--big">
              {isLoading ? '…' : fmt(kpis?.lifetimeRevenue?.value)}
            </span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Orders In Progress</span>
            <span className="sd-stat-value">
              {isLoading ? '…' : inProgressCount}
            </span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Average Order Value</span>
            <span className="sd-stat-value">
              {isLoading ? '…' : fmt(kpis?.avgOrderValue?.value)}
            </span>
          </div>
        </div>

        <div className="seller-card">
          <div className="seller-card-header">
            <h2>Recent Completed Orders</h2>
            <Link to="/seller/orders" className="btn-seller-outline">View all orders</Link>
          </div>
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <Skeleton.Table cols={3} rows={5} showHeader={false} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="seller-empty">
              <Wallet size={36} />
              <p>No completed orders yet.</p>
            </div>
          ) : (
            <table className="seller-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date ? new Date(t.date).toLocaleDateString() : ''}</td>
                    <td>{t.desc}</td>
                    <td className="txn-credit">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
