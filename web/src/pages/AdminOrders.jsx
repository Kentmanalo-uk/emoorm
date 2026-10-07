import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, X, DownloadSimple, LockSimple } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import RevealButton from '../components/admin/RevealButton';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import EmptyArt from '../components/ui/EmptyArt';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

/*
 * Orders, as admins see them: what was ordered, where, and how far it got.
 * No amounts and no buyer contact by default; for a case (a report, a
 * dispute, a return) "Show contact" / "Show payment" asks why and the server
 * logs it. Payments are the seller's to check, so there are no payment
 * buttons here.
 */

const STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY',
  'READY_FOR_PICKUP', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED',
];

const statusClass = (status) => {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'admin-badge-approved';
  if (status === 'CANCELLED') return 'admin-badge-rejected';
  if (status === 'PENDING') return 'admin-badge-pending';
  return 'admin-badge-review';
};

const peso = (v) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [exporting, setExporting] = useState(false);
  // Details shown for a case, per order (cleared when another opens).
  const [contact, setContact] = useState(null);
  const [payment, setPayment] = useState(null);

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
        { header: 'Items', value: (o) => o.itemCount },
        { header: 'Fulfillment', value: (o) => o.fulfillmentMethod },
        { header: 'Status', value: (o) => o.status },
        { header: 'Payment Method', value: (o) => o.paymentMethod },
        { header: 'Payment Status', value: (o) => o.paymentStatus },
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
      setContact(null);
      setPayment(null);
      setSelected(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Unable to view this order');
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Orders</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Orders {pagination.total > 0 && <span style={{ fontWeight: 400, color: 'var(--t-neutral-500, #64748b)', fontSize: 14 }}>({pagination.total})</span>}</h2>
          <div className="admin-toolbar">
            <select aria-label="Filter by status" className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
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
          <div className="admin-empty"><EmptyArt name="orders" size={104} /><p>No orders found</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Order</th><th>Buyer</th><th>Store</th><th>Items</th><th>Payment</th><th>Status</th><th>Action</th></tr>
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
                      <td><strong>{order.orderNumber}</strong><div style={{ color: 'var(--t-neutral-500, #636b78)', fontSize: 11 }}>{new Date(order.createdAt).toLocaleDateString('en-PH')}</div></td>
                      <td>{order.buyer?.fullName || '—'}</td>
                      <td>{order.store?.name || '—'}</td>
                      <td>{order.itemCount ?? '—'}</td>
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
        {(order) => (
          <>
            <div className="admin-detail-header"><h3>{order.orderNumber}</h3><button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button></div>
            <div className="admin-detail-body">
              <div className="admin-detail-section">
                <h4>Order</h4>
                <div className="admin-detail-grid">
                  <div><label>Buyer</label><p>{order.buyer?.fullName || '—'}</p></div>
                  <div><label>Store</label><p>{order.store?.name || '—'}</p></div>
                  <div><label>Status</label><p>{order.status?.replaceAll('_', ' ')}</p></div>
                  <div><label>Placed</label><p>{new Date(order.createdAt).toLocaleString('en-PH')}</p></div>
                  <div><label>Fulfillment</label><p>{order.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Delivery'}</p></div>
                  <div><label>Payment</label><p>{order.paymentMethod} · {order.paymentStatus?.replaceAll('_', ' ')}</p></div>
                  {order.courierName && (
                    <div className="admin-detail-full"><label>Courier</label><p>{order.courierName}{order.trackingNumber ? ` · ${order.trackingNumber}` : ''}</p></div>
                  )}
                </div>
              </div>

              <div className="admin-detail-section">
                <h4>Items</h4>
                {(order.items || []).map((item) => <p key={item.id}>{item.productName || item.product?.name} × {item.quantity}</p>)}
              </div>

              <div className="admin-detail-section">
                <h4><LockSimple size={14} weight="fill" /> Contact &amp; address</h4>
                {contact ? (
                  <div className="admin-detail-grid">
                    <div><label>Contact</label><p>{contact.contactNumber || '—'}</p></div>
                    <div className="admin-detail-full"><label>{order.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Delivery address'}</label><p>{contact.deliveryAddress || order.pickupLocation || '—'}</p></div>
                    {contact.deliveryNotes && <div className="admin-detail-full"><label>Notes</label><p>{contact.deliveryNotes}</p></div>}
                    {contact.fulfillmentProofUrl && (
                      <div className="admin-detail-full">
                        <label>Hand-over photo</label>
                        <a href={resolveImg(contact.fulfillmentProofUrl)} target="_blank" rel="noopener noreferrer"><img src={resolveImg(contact.fulfillmentProofUrl)} alt="Hand-over proof" style={{ maxWidth: 300, width: '100%' }} /></a>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="admin-detail-grid">
                      <div><label>Contact</label><p>{order.contactMasked || '—'}</p></div>
                      <div><label>Area</label><p>{order.area || order.pickupLocation || '—'}</p></div>
                    </div>
                    <RevealButton
                      endpoint={`/orders/${order.id}/reveal`}
                      body={{ part: 'contact' }}
                      label="Show contact"
                      title="Show this buyer's contact and address?"
                      onRevealed={setContact}
                    />
                  </>
                )}
              </div>

              <div className="admin-detail-section">
                <h4><LockSimple size={14} weight="fill" /> Payment</h4>
                {payment ? (
                  <>
                    <div className="admin-detail-grid">
                      <div><label>Subtotal</label><p>{peso(payment.subtotal)}</p></div>
                      <div><label>Delivery fee</label><p>{peso(payment.deliveryFee)}</p></div>
                      {Number(payment.discountAmount) > 0 && <div><label>Discount</label><p>−{peso(payment.discountAmount)}</p></div>}
                      <div><label>Total</label><p><strong>{peso(payment.total)}</strong></p></div>
                      {payment.paymentReference && <div className="admin-detail-full"><label>Reference</label><p>{payment.paymentReference}</p></div>}
                    </div>
                    {payment.paymentProofUrl && (
                      <a href={resolveImg(payment.paymentProofUrl)} target="_blank" rel="noopener noreferrer"><img src={resolveImg(payment.paymentProofUrl)} alt="Payment proof" style={{ maxWidth: 300, width: '100%', marginTop: 8 }} /></a>
                    )}
                  </>
                ) : (
                  <>
                    <p className="admin-reveal-note">Amounts and the payment screenshot are private to the buyer and the seller. Sellers check their own payments.</p>
                    <RevealButton
                      endpoint={`/orders/${order.id}/reveal`}
                      body={{ part: 'payment' }}
                      label="Show payment"
                      title="Show this order's amounts and payment?"
                      onRevealed={setPayment}
                    />
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </AdminLayout>
  );
}
