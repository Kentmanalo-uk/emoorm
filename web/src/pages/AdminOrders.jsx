import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Eye, X, DownloadSimple, LockSimple, MagnifyingGlass as Search, ChatCircleDots, ArrowCounterClockwise,
} from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import RevealButton from '../components/admin/RevealButton';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import EmptyArt from '../components/ui/EmptyArt';
import useAuthStore from '../store/authStore';
import { useAdminAttention } from '../hooks/useAdminShellData';
import { useMunicipalities } from '../hooks/useReferenceData';
import { statusLabel, payLabel } from '../lib/orderProgress';
import { paymentStatus, returnStatus } from '../lib/labels';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminModeration.css';
import Select from '../components/ui/Select';
import { peso, timeAgo } from '../lib/format';

/*
 * Orders, as admins see them: what was ordered, where, and how far it got.
 * No amounts and no buyer contact by default; for a case (a report, a
 * dispute, a return) "Show contact" / "Show payment" asks why and the server
 * logs it. Payments are the seller's to check, so there are no payment
 * buttons here. (That is also why the list has no total column.)
 */

const STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY',
  'READY_FOR_PICKUP', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED',
];
const PAYMENT_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

const statusClass = (status) => {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'admin-badge-approved';
  if (status === 'CANCELLED') return 'admin-badge-rejected';
  if (status === 'PENDING') return 'admin-badge-pending';
  return 'admin-badge-review';
};

const fulfilment = (method) => (method === 'PICKUP' ? 'Pickup' : 'Delivery');
// "ORD-20261028-8F3K2A" → "…8F3K2A": the row shows the end people read out;
// the drawer and the search keep the whole number.
const shortNumber = (n) => (n && n.length > 10 ? `…${n.slice(-6)}` : n);
const fullDate = (v) => (v ? new Date(v).toLocaleString('en-PH') : '');

function When({ value }) {
  return <time className="am-time" dateTime={value} title={fullDate(value)}>{timeAgo(value)}</time>;
}

export default function AdminOrders() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const [searchParams, setSearchParams] = useSearchParams();
  const buyerId = searchParams.get('buyerId') || '';
  const storeId = searchParams.get('storeId') || '';
  // ?payment=stale: payment proofs nobody has checked for a day (the
  // attention queue's link lands here).
  const stale = searchParams.get('payment') === 'stale';
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [payment, setPaymentFilter] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  // Details shown for a case, per order (cleared when another opens).
  const [contact, setContact] = useState(null);
  const [revealedPayment, setRevealedPayment] = useState(null);
  const [orderReturns, setOrderReturns] = useState({ id: null, rows: [] });
  const { municipalities } = useMunicipalities({ enabled: isSuperAdmin });
  const attention = useAdminAttention();
  const staleCount = Number((attention.data || []).find((i) => i.key === 'stalePayments')?.count || 0);

  const filters = () => {
    const params = {};
    if (stale) params.payment = 'stale';
    if (status) params.status = status;
    if (payment && !stale) params.paymentStatus = payment;
    if (buyerId) params.buyerId = buyerId;
    if (storeId) params.storeId = storeId;
    if (search.trim()) params.search = search.trim();
    if (from) params.from = from;
    if (to) params.to = to;
    // Ignored by the API for a municipal admin (always their own town).
    if (isSuperAdmin && municipalityId) params.municipalityId = municipalityId;
    return params;
  };

  // Only the newest request fills the list.
  const latest = useRef(0);
  const load = async () => {
    const request = ++latest.current;
    setLoading(true);
    try {
      const res = await axios.get('/orders', { params: { page, pageSize: 20, ...filters() } });
      if (request !== latest.current) return;
      setOrders(res.data || []);
      setFailed(false);
      if (res.pagination) setPagination(res.pagination);
    } catch {
      if (request === latest.current) setFailed(true);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  };

  // Typing waits for a pause; every other filter asks at once.
  const lastSearch = useRef(search);
  useEffect(() => {
    const typed = search !== lastSearch.current;
    lastSearch.current = search;
    if (!typed) { load(); return undefined; }
    const timer = setTimeout(load, 350);
    return () => clearTimeout(timer);
  }, [page, status, payment, municipalityId, search, from, to, buyerId, storeId, stale]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages('/orders', filters());
      downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, [
        { header: 'Order Number', value: (o) => o.orderNumber },
        { header: 'Date', value: (o) => csvDate(o.createdAt) },
        { header: 'Buyer', value: (o) => o.buyer?.fullName },
        { header: 'Store', value: (o) => o.store?.name },
        { header: 'Items', value: (o) => o.itemCount },
        { header: 'Fulfillment', value: (o) => fulfilment(o.fulfillmentMethod) },
        { header: 'Status', value: (o) => statusLabel(o.status, o.fulfillmentMethod) },
        { header: 'Payment Method', value: (o) => payLabel(o.paymentMethod, o.fulfillmentMethod === 'PICKUP') },
        { header: 'Payment Status', value: (o) => paymentStatus(o.paymentStatus) },
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
      setRevealedPayment(null);
      setSelected(res.data);
      // Any return request on it, to link from the drawer.
      axios.get('/moderation/returns', { params: { orderId, pageSize: 5 }, quiet: true })
        .then((r) => setOrderReturns({ id: orderId, rows: r.data || [] }))
        .catch(() => setOrderReturns({ id: orderId, rows: [] }));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Unable to view this order');
    }
  };

  // Deep link from a notification: /admin/orders?id=<orderId>.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || openedId.current === targetId) return;
    openedId.current = targetId;
    viewOrder(targetId);
  }, [searchParams]);

  const buyerName = orders.find((o) => o.buyer?.id === buyerId)?.buyer?.fullName;
  const storeName = orders.find((o) => o.store?.id === storeId)?.store?.name;
  const filtered = Boolean(status || payment || search || from || to || municipalityId || buyerId || storeId || stale);
  const returnsHere = orderReturns.id === selected?.id ? orderReturns.rows : [];

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Orders</h1>
          <p className="admin-page-sub">Follow an order for a case: amounts and contact stay private unless you ask</p>
        </div>
        <button type="button" className="admin-btn admin-btn-gray" disabled={exporting} onClick={handleExport}>
          <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Orders
            {pagination.total > 0 && <span className="am-count">({pagination.total.toLocaleString('en-PH')})</span>}
          </h2>
          <div className="admin-toolbar">
            <label className="am-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search orders"
                placeholder="Order no., buyer or store…"
                value={search}
                maxLength={40}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <Select aria-label="Filter by status" className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </Select>
            <Select
              aria-label="Filter by payment"
              className="admin-select"
              value={stale ? 'stale' : payment}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'stale') { setPaymentFilter(''); setParam('payment', 'stale'); return; }
                if (stale) setParam('payment', '');
                setPaymentFilter(value);
                setPage(1);
              }}
            >
              <option value="">Any payment</option>
              <option value="stale">Payment not checked (over a day)</option>
              {PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{paymentStatus(value)}</option>)}
            </Select>
            {isSuperAdmin && (
              <Select aria-label="Filter by municipality" className="admin-select" value={municipalityId} onChange={(e) => { setMunicipalityId(e.target.value); setPage(1); }}>
                <option value="">All municipalities</option>
                {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
            <div className="admin-date-range">
              <label className="admin-date-field">
                <span>From</span>
                <input aria-label="Placed from" type="date" className="admin-input" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
              </label>
              <label className="admin-date-field">
                <span>To</span>
                <input aria-label="Placed until" type="date" className="admin-input" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
              </label>
            </div>
          </div>
        </div>

        <div className="am-presets" role="group" aria-label="Quick views">
          <button
            type="button"
            className={`am-preset${stale ? ' is-on' : ''}`}
            aria-pressed={stale}
            onClick={() => { setPaymentFilter(''); setParam('payment', stale ? '' : 'stale'); }}
          >
            Payment not checked
            {staleCount > 0 && <span className="am-preset-count">{staleCount}</span>}
          </button>
        </div>

        {(buyerId || storeId) && (
          <div className="am-chips">
            {buyerId && (
              <span className="am-chip">
                Buyer: {buyerName || 'this person'}
                <button type="button" onClick={() => setParam('buyerId', '')} aria-label="Show every buyer's orders"><X size={12} /></button>
              </span>
            )}
            {storeId && (
              <span className="am-chip">
                Store: {storeName || 'this shop'}
                <button type="button" onClick={() => setParam('storeId', '')} aria-label="Show every shop's orders"><X size={12} /></button>
              </span>
            )}
          </div>
        )}
        {stale && (
          <p className="am-note">Payment screenshots the seller has not checked for over a day. Sellers check their own payments: message the seller if one is stuck.</p>
        )}

        {loading ? (
          <Skeleton.Table cols={7} rows={7} />
        ) : failed ? (
          <LoadFailed what="the orders" onRetry={load} compact />
        ) : orders.length === 0 ? (
          <div className="admin-empty"><EmptyArt name="orders" size={104} /><p>{filtered ? 'No orders match these filters' : 'No orders yet'}</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Order</th><th>Buyer</th><th>Store</th><th>Items</th><th>Delivery</th><th>Payment</th><th>Status</th><th>Action</th></tr>
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
                      <td>
                        <strong title={order.orderNumber}>{shortNumber(order.orderNumber)}</strong>
                        <div><When value={order.createdAt} /></div>
                      </td>
                      <td>{order.buyer?.fullName || '—'}</td>
                      <td>{order.store?.name || '—'}</td>
                      <td className="am-phone-hide">{order.itemCount ?? '—'}</td>
                      <td className="am-phone-hide">{fulfilment(order.fulfillmentMethod)}</td>
                      <td><span className={`admin-badge ${order.paymentStatus === 'PAID' ? 'admin-badge-approved' : 'admin-badge-pending'}`}>{paymentStatus(order.paymentStatus)}</span></td>
                      <td><span className={`admin-badge ${statusClass(order.status)}`}>{statusLabel(order.status, order.fulfillmentMethod)}</span></td>
                      <td className="am-phone-hide"><button type="button" className="admin-btn admin-btn-gray" onClick={() => viewOrder(order.id)}><Eye size={13} /> View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailDrawer item={selected} onClose={() => setSelected(null)}>
        {(order) => (
          <>
            <div className="admin-detail-header"><h3>Order {order.orderNumber}</h3><button type="button" className="admin-detail-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button></div>
            <div className="admin-detail-body">
              <div className="admin-detail-section">
                <h4>Order</h4>
                <div className="admin-detail-grid">
                  <div>
                    <label>Buyer</label>
                    <p>
                      {order.buyer?.id
                        ? <Link className="admin-link" to={`/admin/buyers?search=${encodeURIComponent(order.buyer.fullName || '')}`}>{order.buyer.fullName}</Link>
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <label>Store</label>
                    <p>
                      {order.store?.slug
                        ? <Link className="admin-link" to={`/store/${order.store.slug}`} target="_blank">{order.store.name}</Link>
                        : order.store?.name || '—'}
                    </p>
                  </div>
                  <div><label>Status</label><p>{statusLabel(order.status, order.fulfillmentMethod)}</p></div>
                  <div><label>Placed</label><p>{fullDate(order.createdAt)}</p></div>
                  <div><label>Delivery</label><p>{fulfilment(order.fulfillmentMethod)}</p></div>
                  <div><label>Payment</label><p>{payLabel(order.paymentMethod, order.fulfillmentMethod === 'PICKUP')} · {paymentStatus(order.paymentStatus)}</p></div>
                  {order.courierName && (
                    <div className="admin-detail-full"><label>Courier</label><p>{order.courierName}{order.trackingNumber ? ` · ${order.trackingNumber}` : ''}</p></div>
                  )}
                </div>
                <div className="am-detail-actions">
                  {order.buyer?.id && (
                    <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(order.buyer.id)}`}>
                      <ChatCircleDots size={14} /> Message buyer
                    </Link>
                  )}
                  {order.store?.ownerId && (
                    <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(order.store.ownerId)}`}>
                      <ChatCircleDots size={14} /> Message seller
                    </Link>
                  )}
                  {order.store?.id && (
                    <Link className="admin-btn admin-btn-gray" to={`/admin/orders?storeId=${encodeURIComponent(order.store.id)}`} onClick={() => setSelected(null)}>
                      Store&apos;s orders
                    </Link>
                  )}
                </div>
              </div>

              {returnsHere.length > 0 && (
                <div className="admin-detail-section">
                  <h4><ArrowCounterClockwise size={14} /> Return request</h4>
                  {returnsHere.map((r) => (
                    <p key={r.id}>
                      <Link className="admin-link" to={`/admin/returns?id=${encodeURIComponent(r.id)}`}>{r.requestNumber}</Link>
                      {' · '}{returnStatus(r.status)}
                    </p>
                  ))}
                </div>
              )}

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
                        <a href={resolveImg(contact.fulfillmentProofUrl)} target="_blank" rel="noopener noreferrer"><img className="am-photo" src={resolveImg(contact.fulfillmentProofUrl)} alt="Hand-over proof" /></a>
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
                {revealedPayment ? (
                  <>
                    <div className="admin-detail-grid">
                      <div><label>Subtotal</label><p>{peso(revealedPayment.subtotal)}</p></div>
                      <div><label>Delivery fee</label><p>{peso(revealedPayment.deliveryFee)}</p></div>
                      {Number(revealedPayment.discountAmount) > 0 && <div><label>Discount</label><p>−{peso(revealedPayment.discountAmount)}</p></div>}
                      <div><label>Total</label><p><strong>{peso(revealedPayment.total)}</strong></p></div>
                      {revealedPayment.paymentReference && <div className="admin-detail-full"><label>Reference</label><p>{revealedPayment.paymentReference}</p></div>}
                    </div>
                    {revealedPayment.paymentProofUrl && (
                      <a href={resolveImg(revealedPayment.paymentProofUrl)} target="_blank" rel="noopener noreferrer"><img className="am-photo" src={resolveImg(revealedPayment.paymentProofUrl)} alt="Payment proof" /></a>
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
                      onRevealed={setRevealedPayment}
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
