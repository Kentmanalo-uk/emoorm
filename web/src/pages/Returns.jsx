import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowCounterClockwise, CaretRight, Package } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './Returns.css';

const TABS = [
  ['all', 'All'], ['REQUESTED', 'Requested'], ['AWAITING_SHIPMENT', 'Ship back'],
  ['RECEIVED', 'Received'], ['REFUNDED', 'Refunded'], ['REJECTED', 'Rejected'],
];

const STATUS_LABELS = {
  REQUESTED: 'Requested', APPROVED: 'Approved', AWAITING_SHIPMENT: 'Ship items back',
  RECEIVED: 'Received', REFUNDED: 'Refunded', REJECTED: 'Rejected', CANCELLED: 'Cancelled', CLOSED: 'Closed',
};

export default function Returns() {
  const [returns, setReturns] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    axios.get('/returns/my', { params: { pageSize: 50 } })
      .then((res) => active && setReturns(res.data || []))
      .catch((err) => toast.error(err.message || 'Unable to load returns'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const visible = tab === 'all' ? returns : returns.filter((item) => item.status === tab);

  return (
    <div className="returns-page">
      <div className="returns-heading">
        <div><p className="returns-eyebrow">After-sale care</p><h1>Returns & refunds</h1></div>
        <Link className="returns-primary" to="/profile/orders">Start from an order</Link>
      </div>
      <div className="returns-tabs" role="tablist">
        {TABS.map(([key, label]) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {loading ? <div className="returns-empty">Loading your return requests...</div> : visible.length === 0 ? (
        <div className="returns-empty"><ArrowCounterClockwise size={42} /><strong>No return requests here</strong><span>Eligible completed orders can be returned within the seller’s policy window.</span><Link to="/profile/orders">View my orders</Link></div>
      ) : <div className="returns-list">{visible.map((item) => (
        <button className="return-card" key={item.id} onClick={() => navigate(`/profile/returns/${item.id}`)}>
          <div className="return-card-top"><span className="return-number">{item.requestNumber}</span><span className={`return-status status-${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status] || item.status}</span></div>
          <div className="return-card-main"><div className="return-product-stack"><Package size={20} />{item.items?.slice(0, 2).map((line) => <span key={line.id}>{line.orderItem?.product?.name || line.orderItem?.productName}</span>)}</div><div className="return-card-amount">₱{Number(item.refundedAmount || item.approvedAmount || item.requestedAmount || 0).toFixed(2)}<CaretRight size={18} /></div></div>
          <div className="return-card-meta">Order #{item.order?.orderNumber || '—'} · {new Date(item.createdAt).toLocaleDateString()}</div>
        </button>
      ))}</div>}
    </div>
  );
}
