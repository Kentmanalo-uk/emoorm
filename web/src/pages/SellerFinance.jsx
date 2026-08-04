import React, { useEffect, useState } from 'react';
import { Wallet, TrendingUp, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import axios from '../lib/axios';
import './SellerDashboard.css';

export default function SellerFinance() {
  const [summary, setSummary] = useState({
    balance: 0,
    pendingPayout: 0,
    lifetimeEarnings: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/orders/store/orders', { params: { pageSize: 100 } });
        const orders = res.data || [];
        const completed = orders.filter((o) => o.status === 'COMPLETED');
        const pending = orders.filter((o) =>
          ['CONFIRMED', 'PREPARING', 'READY'].includes(o.status),
        );
        const lifetime = completed.reduce((s, o) => s + Number(o.total || 0), 0);
        const pendingSum = pending.reduce((s, o) => s + Number(o.total || 0), 0);

        if (cancelled) return;
        setSummary({
          balance: lifetime, // placeholder — real payout logic pending
          pendingPayout: pendingSum,
          lifetimeEarnings: lifetime,
        });
        setTransactions(
          completed.slice(0, 10).map((o) => ({
            id: o.id,
            date: o.createdAt,
            desc: `Order #${(o.orderNumber || o.id).toString().slice(-8)}`,
            amount: Number(o.total || 0),
            type: 'credit',
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

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Finance</h1>
            <p className="seller-welcome">Balance, payouts, and transaction history</p>
          </div>
        </div>

        <div className="sd-stats" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="sd-stat">
            <span className="sd-stat-label">
              <Wallet size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Available Balance
            </span>
            <span className="sd-stat-value sd-stat-value--big">
              {isLoading ? '…' : fmt(summary.balance)}
            </span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Pending Payout</span>
            <span className="sd-stat-value">
              {isLoading ? '…' : fmt(summary.pendingPayout)}
            </span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Lifetime Earnings</span>
            <span className="sd-stat-value">
              {isLoading ? '…' : fmt(summary.lifetimeEarnings)}
            </span>
          </div>
        </div>

        <div className="seller-card">
          <div className="seller-card-header">
            <h2><TrendingUp size={16} /> Recent Transactions</h2>
          </div>
          {isLoading ? (
            <div className="seller-loading">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="seller-empty" style={{ padding: '48px 16px' }}>
              <Wallet size={36} />
              <p>No transactions yet.</p>
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
                    <td style={{ textAlign: 'right', color: t.type === 'credit' ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                      {t.type === 'credit' ? (
                        <ArrowUpRight size={12} style={{ verticalAlign: -1 }} />
                      ) : (
                        <ArrowDownRight size={12} style={{ verticalAlign: -1 }} />
                      )}
                      {' '}
                      {fmt(t.amount)}
                    </td>
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
