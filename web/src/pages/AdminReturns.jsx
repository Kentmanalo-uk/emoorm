import { useEffect, useState } from 'react';
import { Eye, X, ArrowSquareOut } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminModeration.css';

const PAGE_SIZE = 20;

const STATUSES = ['REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED', 'CLOSED'];

const STATUS_BADGE = {
  REQUESTED: 'admin-badge-pending',
  APPROVED: 'admin-badge-review',
  AWAITING_SHIPMENT: 'admin-badge-review',
  RECEIVED: 'admin-badge-review',
  REFUNDED: 'admin-badge-approved',
  REJECTED: 'admin-badge-rejected',
  CANCELLED: 'admin-badge-dismissed',
  CLOSED: 'admin-badge-neutral',
};

const OPEN_STATUSES = new Set(['REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED']);

const REASON_LABELS = {
  DAMAGED: 'Damaged item',
  WRONG_ITEM: 'Wrong item',
  NOT_AS_DESCRIBED: 'Not as described',
  MISSING: 'Missing item',
  OTHER: 'Other',
};

const REFUND_LABELS = { COD_CASH: 'Cash (COD)', GCASH: 'GCash', BANK: 'Bank transfer', MANUAL: 'Manual' };

const statusLabel = (s) => (s || '').replace(/_/g, ' ');
const money = (v) => (v === null || v === undefined || v === ''
  ? '—'
  : `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-PH') : '—');

const ageLabel = (createdAt, now) => {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const photoUrl = (p) => (typeof p === 'string' ? p : p?.url);

function StatusBadge({ status }) {
  return <span className={`admin-badge ${STATUS_BADGE[status] || ''}`}>{statusLabel(status)}</span>;
}

export default function AdminReturns() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ key: null, rows: [], pagination: { total: 0, totalPages: 0 }, now: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const queryKey = `${status}|${page}`;
  const isLoading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    const params = { page, pageSize: PAGE_SIZE };
    if (status) params.status = status;
    axios.get('/moderation/returns', { params })
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: queryKey,
          rows: res.data || [],
          pagination: res.pagination || { total: 0, totalPages: 0 },
          now: Date.now(),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message || 'Failed to load return requests');
        setResult({ key: queryKey, rows: [], pagination: { total: 0, totalPages: 0 }, now: Date.now() });
      });
    return () => { cancelled = true; };
  }, [queryKey, status, page]);

  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    axios.get(`/returns/${selectedId}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message || 'Failed to load return details');
        setSelectedId(null);
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  const closePanel = () => { setSelectedId(null); setDetail(null); };
  const summary = result.rows.find((r) => r.id === selectedId);
  const shown = detail && detail.id === selectedId ? detail : null;
  const { rows, pagination, now } = result;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Returns &amp; Refunds</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Return requests
            {pagination.total > 0 && <span className="am-count">({pagination.total})</span>}
          </h2>
          <div className="admin-toolbar">
            <select
              className="admin-select"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
        </div>
        <p className="am-note">Read-only oversight. Sellers approve, receive and refund returns from their dashboard.</p>

        {isLoading ? (
          <Skeleton.Table cols={7} rows={6} />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="delivery" size={104} />
            <p>{status ? `No ${statusLabel(status).toLowerCase()} return requests` : 'No return requests yet'}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table am-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Buyer</th>
                    <th>Store</th>
                    <th>Reason</th>
                    <th>Amounts</th>
                    <th>Age</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const qty = (r.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
                    const stale = OPEN_STATUSES.has(r.status) && now - new Date(r.createdAt).getTime() > 3 * 24 * 60 * 60 * 1000;
                    return (
                      <tr
                      key={r.id}
                      className="admin-row-clickable"
                      tabIndex={0}
                      onClick={rowOpen(() => setSelectedId(r.id))}
                      onKeyDown={rowKeyOpen(() => setSelectedId(r.id))}
                    >
                        <td data-label="Request">
                          <strong className="am-mono">{r.requestNumber}</strong>
                          <small className="am-sub">Order {r.order?.orderNumber || '—'} · {qty} item{qty === 1 ? '' : 's'}</small>
                        </td>
                        <td data-label="Buyer">
                          {r.buyer?.fullName || '—'}
                          <small className="am-sub">{r.buyer?.email}</small>
                        </td>
                        <td data-label="Store">{r.store?.name || '—'}</td>
                        <td data-label="Reason">{REASON_LABELS[r.reason] || r.reason}</td>
                        <td data-label="Amounts" className="am-nowrap">
                          <span className="am-amount">Req. {money(r.requestedAmount)}</span>
                          {r.approvedAmount != null && <small className="am-sub">Approved {money(r.approvedAmount)}</small>}
                          {r.refundedAmount != null && <small className="am-sub">Refunded {money(r.refundedAmount)}</small>}
                        </td>
                        <td data-label="Age" className="am-nowrap">
                          <span className={stale ? 'am-stale' : ''} title={dateTime(r.createdAt)}>
                            {ageLabel(r.createdAt, now)}
                          </span>
                        </td>
                        <td data-label="Status"><StatusBadge status={r.status} /></td>
                        <td className="am-actions">
                          <button type="button" className="admin-btn admin-btn-gray" onClick={() => setSelectedId(r.id)}>
                            <Eye size={13} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailDrawer item={selectedId} onClose={closePanel}>
        {() => (
          <>
            <div className="admin-detail-header">
              <h3>Return {shown?.requestNumber || summary?.requestNumber || ''}</h3>
              <button className="admin-detail-close" onClick={closePanel} aria-label="Close"><X size={18} /></button>
            </div>

            {!shown ? (
              <div className="admin-detail-body"><p className="am-muted">Loading details…</p></div>
            ) : (
              <div className="admin-detail-body">
                <div className="admin-detail-section">
                  <h4>Request</h4>
                  <div className="admin-detail-grid">
                    <div><label>Status</label><p><StatusBadge status={shown.status} /></p></div>
                    <div><label>Reason</label><p>{REASON_LABELS[shown.reason] || shown.reason}</p></div>
                    <div><label>Submitted</label><p>{dateTime(shown.createdAt)}</p></div>
                    <div><label>Physical return</label><p>{shown.requiresPhysicalReturn ? 'Required' : 'Not required'}</p></div>
                    {shown.buyerNote && (
                      <div className="admin-detail-full"><label>Buyer note</label><p className="am-pre">{shown.buyerNote}</p></div>
                    )}
                    {shown.sellerNote && (
                      <div className="admin-detail-full"><label>Seller note</label><p className="am-pre">{shown.sellerNote}</p></div>
                    )}
                  </div>
                </div>

                <div className="admin-detail-section">
                  <h4>Parties</h4>
                  <div className="admin-detail-grid">
                    <div><label>Buyer</label><p>{shown.buyer?.fullName || '—'}</p></div>
                    <div><label>Contact</label><p>{shown.buyer?.email || '—'}{shown.buyer?.contactNumber ? ` · ${shown.buyer.contactNumber}` : ''}</p></div>
                    <div>
                      <label>Store</label>
                      <p>
                        {shown.store?.slug ? (
                          <a className="admin-link" href={`/store/${shown.store.slug}`} target="_blank" rel="noopener noreferrer">
                            {shown.store.name} <ArrowSquareOut size={12} />
                          </a>
                        ) : (shown.store?.name || '—')}
                      </p>
                    </div>
                    <div><label>Order</label><p>{shown.order?.orderNumber || '—'} · {statusLabel(shown.order?.status)}</p></div>
                  </div>
                </div>

                <div className="admin-detail-section">
                  <h4>Items</h4>
                  <div className="am-items">
                    {(shown.items || []).map((it) => {
                      const product = it.orderItem?.product;
                      const img = Array.isArray(product?.images) ? photoUrl(product.images[0]) : null;
                      return (
                        <div key={it.id} className="am-item">
                          {img ? <img src={resolveImg(img)} alt="" /> : <span className="am-item-ph" />}
                          <div>
                            <strong>{it.orderItem?.productName || product?.name || 'Item'}</strong>
                            <small>{it.quantity} × {money(it.unitPrice)}</small>
                          </div>
                          <span className="am-amount">{money(it.subtotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-detail-section">
                  <h4>Refund</h4>
                  <div className="admin-detail-grid">
                    <div><label>Order total</label><p>{money(shown.order?.total)}</p></div>
                    <div><label>Requested</label><p>{money(shown.requestedAmount)}</p></div>
                    <div><label>Approved</label><p>{money(shown.approvedAmount)}</p></div>
                    <div><label>Refunded</label><p>{money(shown.refundedAmount)}</p></div>
                    {shown.refundMethod && <div><label>Method</label><p>{REFUND_LABELS[shown.refundMethod] || shown.refundMethod}</p></div>}
                    {shown.refundReference && <div><label>Reference</label><p className="am-mono">{shown.refundReference}</p></div>}
                  </div>
                </div>

                {Array.isArray(shown.photos) && shown.photos.length > 0 && (
                  <div className="admin-detail-section">
                    <h4>Buyer photos</h4>
                    <div className="am-photos">
                      {shown.photos.map(photoUrl).filter(Boolean).map((p) => (
                        <a key={p} href={resolveImg(p)} target="_blank" rel="noopener noreferrer">
                          <img src={resolveImg(p)} alt="Return evidence" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(shown.history) && shown.history.length > 0 && (
                  <div className="admin-detail-section">
                    <h4>History</h4>
                    <ol className="am-history">
                      {shown.history.map((h, i) => (
                        <li key={`${h.status}-${h.at}-${i}`}>
                          <StatusBadge status={h.status} />
                          <time>{dateTime(h.at)}</time>
                          {h.note && <p>{h.note}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DetailDrawer>
    </AdminLayout>
  );
}
