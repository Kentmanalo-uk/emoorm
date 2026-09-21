import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, X, CheckCircle, XCircle, DownloadSimple } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import EmptyArt from '../components/ui/EmptyArt';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

const STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY',
  'READY_FOR_PICKUP', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED',
];

const statusClass = (status) => {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'admin-badge-approved';
  if (status === 'CANCELLED') return 'admin-badge-rejected';
  if (status === 'PENDING') return 'admin-badge-pending';
  return 'admin-badge-review';
};

export default function AdminOrders() {
  const [searchParams] = useSearchParams();
  const buyerId = searchParams.get('buyerId') || '';
  const storeId = searchParams.get('storeId') || '';
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 20 };
      if (status) params.status = status;
      if (buyerId) params.buyerId = buyerId;
      if (storeId) params.storeId = storeId;
      const res = await axios.get('/orders', { params });
      setOrders(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, status, buyerId, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (buyerId) params.buyerId = buyerId;
      if (storeId) params.storeId = storeId;
      const rows = await fetchAllPages('/orders', params);
      downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, [
        { header: 'Order Number', value: (o) => o.orderNumber },
        { header: 'Date', value: (o) => csvDate(o.createdAt) },
        { header: 'Buyer', value: (o) => o.buyer?.fullName },
        { header: 'Store', value: (o) => o.store?.name },
        { header: 'Status', value: (o) => o.status },
        { header: 'Payment Method', value: (o) => o.paymentMethod },
        { header: 'Payment Status', value: (o) => o.paymentStatus },
        { header: 'Total', value: (o) => Number(o.total).toFixed(2) },
      ], rows);
      toast.success(`Exported ${rows.length} rows`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const viewOrder = async (orderId) => {
    try {
      const res = await axios.get(`/orders/${orderId}`);
      setSelected(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Unable to view this order');
    }
  };

  const verifyPayment = async (paymentStatus) => {
    setProcessing(true);
    try {
      const res = await axios.patch(`/orders/${selected.id}/payment`, { paymentStatus });
      setSelected(res.data);
      toast.success(paymentStatus === 'PAID' ? 'Payment approved' : 'Payment rejected');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Unable to update payment');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Orders & Activity</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Orders {pagination.total > 0 && <span style={{ fontWeight: 400, color: 'var(--t-neutral-500, #64748b)', fontSize: 14 }}>({pagination.total})</span>}</h2>
          <div className="admin-toolbar">
            <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
            <button type="button" className="admin-btn admin-btn-gray" disabled={exporting} onClick={handleExport}>
              <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {loading ? (
          <Skeleton.Table cols={7} rows={7} />
        ) : orders.length === 0 ? (
          <div className="admin-empty"><EmptyArt name="shopping" size={104} /><p>No orders found</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Order</th><th>Buyer</th><th>Store</th><th>Total</th><th>Payment</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="admin-row-clickable"
                      tabIndex={0}
                      onClick={rowOpen(() => viewOrder(order.id))}
                      onKeyDown={rowKeyOpen(() => viewOrder(order.id))}
                    >
                      <td><strong>{order.orderNumber}</strong><div style={{ color: 'var(--t-neutral-400, #94a3b8)', fontSize: 11 }}>{new Date(order.createdAt).toLocaleDateString('en-PH')}</div></td>
                      <td>{order.buyer?.fullName || '—'}</td>
                      <td>{order.store?.name || '—'}</td>
                      <td>₱{Number(order.total).toFixed(2)}</td>
                      <td><span className={`admin-badge ${order.paymentStatus === 'PAID' ? 'admin-badge-approved' : 'admin-badge-pending'}`}>{order.paymentStatus?.replaceAll('_', ' ')}</span></td>
                      <td><span className={`admin-badge ${statusClass(order.status)}`}>{order.status.replaceAll('_', ' ')}</span></td>
                      <td><button type="button" className="admin-btn admin-btn-gray" onClick={() => viewOrder(order.id)}><Eye size={13} /> View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailDrawer item={selected} onClose={() => setSelected(null)}>
        {(selected) => (
          <>
            <div className="admin-detail-header"><h3>{selected.orderNumber}</h3><button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button></div>
            <div className="admin-detail-body">
              <div className="admin-detail-section">
                <h4>Order Information</h4>
                <div className="admin-detail-grid">
                  <div><label>Buyer</label><p>{selected.buyer?.fullName}</p></div>
                  <div><label>Store</label><p>{selected.store?.name}</p></div>
                  <div><label>Status</label><p>{selected.status?.replaceAll('_', ' ')}</p></div>
                  <div><label>Total</label><p>₱{Number(selected.total).toFixed(2)}</p></div>
                  <div><label>Payment</label><p>{selected.paymentMethod} · {selected.paymentStatus?.replaceAll('_', ' ')}</p></div>
                  <div><label>Contact</label><p>{selected.contactNumber || '—'}</p></div>
                  <div className="admin-detail-full"><label>Delivery / Pickup Address</label><p>{selected.deliveryAddress || selected.pickupLocation || '—'}</p></div>
                </div>
              </div>
              <div className="admin-detail-section">
                <h4>Items</h4>
                {(selected.items || []).map((item) => <p key={item.id}>{item.productName || item.product?.name} × {item.quantity} — ₱{Number(item.subtotal).toFixed(2)}</p>)}
              </div>
              {selected.paymentProofUrl && (
                <div className="admin-detail-section">
                  <h4>Payment Proof</h4>
                  <a href={resolveImg(selected.paymentProofUrl)} target="_blank" rel="noopener noreferrer"><img src={resolveImg(selected.paymentProofUrl)} alt="Payment proof" style={{ maxWidth: 300, width: '100%' }} /></a>
                  {selected.paymentStatus === 'PENDING_VERIFICATION' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="admin-btn admin-btn-green" disabled={processing} onClick={() => verifyPayment('PAID')}><CheckCircle size={14} /> Approve</button>
                      <button className="admin-btn admin-btn-red" disabled={processing} onClick={() => verifyPayment('FAILED')}><XCircle size={14} /> Reject</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DetailDrawer>
    </AdminLayout>
  );
}
