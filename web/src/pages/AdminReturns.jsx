import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, X, ArrowSquareOut, ChatCircleDots } from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { lineImage } from '../lib/variationImage';
import EmptyState from '../components/ui/EmptyState';
import LoadFailed from '../components/ui/LoadFailed';
import { returnStatus, returnReason } from '../lib/labels';
import { statusLabel as orderStatusLabel } from '../lib/orderProgress';
import { useRefreshAdminShell } from '../hooks/useAdminShellData';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminModeration.css';
import Select from '../components/ui/Select';
import { peso, timeAgo } from '../lib/format';
import { confirmAction } from '../lib/confirm';

const PAGE_SIZE = 20;

const STATUSES = ['DISPUTED', 'REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED', 'CLOSED'];

const STATUS_BADGE = {
  REQUESTED: 'admin-badge-pending',
  APPROVED: 'admin-badge-review',
  AWAITING_SHIPMENT: 'admin-badge-review',
  RECEIVED: 'admin-badge-review',
  REFUNDED: 'admin-badge-approved',
  REJECTED: 'admin-badge-rejected',
  CANCELLED: 'admin-badge-dismissed',
  CLOSED: 'admin-badge-neutral',
  // The one admins act on: its own colour.
  DISPUTED: 'am-badge-disputed',
};

const OPEN_STATUSES = new Set(['REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED']);

const REFUND_LABELS = { COD_CASH: 'Cash (COD)', GCASH: 'GCash', BANK: 'Bank transfer', MANUAL: 'Manual' };

const money = (v) => (v === null || v === undefined || v === ''
  ? '—'
  : peso(v));
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-PH') : '—');

// How long a request has been waiting, in words ("waiting 23 days").
const ageLabel = (createdAt, now) => {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  if (mins < 60) return `waiting ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `waiting ${hours} h`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} day${days === 1 ? '' : 's'}`;
};
// Open three days and still with the seller: "seller slow to reply".
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

const photoUrl = (p) => (typeof p === 'string' ? p : p?.url);

function StatusBadge({ status }) {
  return <span className={`admin-badge ${STATUS_BADGE[status] || ''}`}>{returnStatus(status)}</span>;
}

export default function AdminReturns() {
  const [searchParams] = useSearchParams();
  // Opens on Disputed: the only requests an admin decides. ?status= (the
  // attention queue's "seller slow to reply" link) opens another, and ?id=
  // (a notification, an order's drawer) opens that request.
  const [status, setStatus] = useState(() => searchParams.get('status') || 'DISPUTED');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ key: null, rows: [], pagination: { total: 0, totalPages: 0 }, now: 0, failed: false });
  const [selectedId, setSelectedId] = useState(() => searchParams.get('id'));
  const [detail, setDetail] = useState(null);
  // Deciding a dispute: for whom, how much, and why.
  const [verdict, setVerdict] = useState({ decision: '', amount: '', physical: true, note: '' });
  const [deciding, setDeciding] = useState(false);
  // Bumped after a decision (or Retry): the list loads again.
  const [reloadTick, setReloadTick] = useState(0);
  // A decision changes the waiting count beside Returns.
  const refreshShell = useRefreshAdminShell();

  // Follows ?status= when a link changes it while the page is open
  // (adjusted while rendering, as the URL is already the new one).
  const urlStatus = searchParams.get('status');
  const [seenUrlStatus, setSeenUrlStatus] = useState(urlStatus);
  if (urlStatus !== seenUrlStatus) {
    setSeenUrlStatus(urlStatus);
    if (urlStatus) { setStatus(urlStatus); setPage(1); }
  }

  const queryKey = `${status}|${page}|${reloadTick}`;
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
          failed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // A failed load says so, with Retry, rather than "No return requests".
        setResult({ key: queryKey, rows: [], pagination: { total: 0, totalPages: 0 }, now: Date.now(), failed: true });
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

  const closePanel = () => { setSelectedId(null); setDetail(null); setVerdict({ decision: '', amount: '', physical: true, note: '' }); };

  const decideDispute = async () => {
    // A decision cannot be taken back, and both sides are told at once.
    const forBuyer = verdict.decision === 'BUYER';
    const ok = await confirmAction({
      title: forBuyer ? `Decide for the buyer: refund ${peso(verdict.amount)}?` : 'Decide for the seller?',
      message: forBuyer
        ? `The return is approved${verdict.physical ? ' and the items go back to the shop first' : ''}. The buyer and the seller see your reason. This cannot be undone.`
        : 'The seller\'s rejection stands. The buyer and the seller see your reason. This cannot be undone.',
      confirmLabel: 'Decide',
    });
    if (!ok) return;
    setDeciding(true);
    try {
      const res = await axios.post(`/returns/${selectedId}/resolve-dispute`, {
        decision: verdict.decision,
        note: verdict.note,
        ...(verdict.decision === 'BUYER' ? { approvedAmount: Number(verdict.amount), requiresPhysicalReturn: verdict.physical } : {}),
      });
      toast.success('Dispute decided. Both sides are told.');
      setDetail((d) => ({ ...d, ...res.data }));
      setVerdict({ decision: '', amount: '', physical: true, note: '' });
      setReloadTick((t) => t + 1);
      refreshShell('attention');
    } catch (err) {
      toast.error(err.message || 'Could not decide the dispute');
    } finally {
      setDeciding(false);
    }
  };
  const summary = result.rows.find((r) => r.id === selectedId);
  const shown = detail && detail.id === selectedId ? detail : null;
  const { rows, pagination, now, failed } = result;
  const messageSeller = (r) => r?.store?.ownerId && (
    <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(r.store.ownerId)}`}>
      <ChatCircleDots size={13} /> Message seller
    </Link>
  );

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Returns</h1>
          <p className="admin-page-sub">Decide disputed returns; sellers handle the rest themselves</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Return requests
            {pagination.total > 0 && <span className="am-count">({pagination.total})</span>}
          </h2>
          <div className="admin-toolbar">
            <Select
              aria-label="Filter by status"
              className="admin-select"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{returnStatus(s)}</option>)}
              <option value="">All statuses</option>
            </Select>
          </div>
        </div>
        <p className="am-note">
          Sellers approve, receive and refund returns from their dashboard. When a buyer disputes a rejection, you decide it here.
          {' '}An age in red means the request has waited over three days for the seller: message them.
        </p>

        {isLoading ? (
          <Skeleton.Table cols={7} rows={6} />
        ) : failed ? (
          <LoadFailed what="the return requests" onRetry={() => setReloadTick((t) => t + 1)} compact />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyState
              className="ui-empty--inset"
              art="returns"
              title={status === 'DISPUTED'
                ? 'No disputes to decide'
                : status ? `No return requests: ${returnStatus(status).toLowerCase()}` : 'No return requests yet'}
              text={status === 'DISPUTED'
                ? 'When a buyer disputes a seller\'s rejection, it waits here for you. Choose "All statuses" to see every request.'
                : 'Return requests buyers make show up here, with any dispute for you to decide.'}
            />
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
                    const stale = OPEN_STATUSES.has(r.status) && now - new Date(r.createdAt).getTime() > STALE_MS;
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
                        <td data-label="Buyer">{r.buyer?.fullName || '—'}</td>
                        <td data-label="Store">{r.store?.name || '—'}</td>
                        <td data-label="Reason" className="am-phone-hide">{returnReason(r.reason)}</td>
                        <td data-label="Amounts" className="am-nowrap">
                          <span className="am-amount">Req. {money(r.requestedAmount)}</span>
                          {r.approvedAmount != null && <small className="am-sub">Approved {money(r.approvedAmount)}</small>}
                          {r.refundedAmount != null && <small className="am-sub">Refunded {money(r.refundedAmount)}</small>}
                        </td>
                        <td data-label="Age" className="am-nowrap">
                          <span
                            className={stale ? 'am-stale' : 'am-time'}
                            title={`Asked ${dateTime(r.createdAt)}${stale ? ': over three days with no answer from the seller' : ''}`}
                          >
                            {OPEN_STATUSES.has(r.status) ? ageLabel(r.createdAt, now) : timeAgo(r.createdAt)}
                          </span>
                          {stale && r.status === 'REQUESTED' && <small className="am-sub">Seller slow to reply</small>}
                        </td>
                        <td data-label="Status"><StatusBadge status={r.status} /></td>
                        <td className="am-actions">
                          <div className="am-row-actions">
                            {stale && r.status === 'REQUESTED' && messageSeller(r)}
                            <button type="button" className="admin-btn admin-btn-gray" onClick={() => setSelectedId(r.id)}>
                              <Eye size={13} /> View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
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
              <button type="button" className="admin-detail-close" onClick={closePanel} aria-label="Close"><X size={18} /></button>
            </div>

            {!shown ? (
              <div className="admin-detail-body"><p className="am-muted">Loading details…</p></div>
            ) : (
              <div className="admin-detail-body">
                <div className="admin-detail-section">
                  <h4>Request</h4>
                  <div className="admin-detail-grid">
                    <div><label>Status</label><p><StatusBadge status={shown.status} /></p></div>
                    <div><label>Reason</label><p>{returnReason(shown.reason)}</p></div>
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

                {(shown.status === 'DISPUTED' || shown.disputeReason) && (
                  <div className="admin-detail-section am-dispute">
                    <h4>Dispute</h4>
                    <div className="admin-detail-grid">
                      <div><label>Disputed</label><p>{dateTime(shown.disputedAt)}</p></div>
                      <div className="admin-detail-full"><label>Buyer says</label><p className="am-pre">{shown.disputeReason}</p></div>
                      {shown.disputeResolution && (
                        <div className="admin-detail-full"><label>Decision</label><p className="am-pre">{shown.disputeResolution}</p></div>
                      )}
                    </div>
                    {shown.status === 'DISPUTED' && (
                      <div className="am-verdict">
                        <div className="am-verdict-choice" role="radiogroup" aria-label="Decide for">
                          {[['BUYER', 'For the buyer (approve the return)'], ['SELLER', 'For the seller (keep the rejection)']].map(([key, label]) => (
                            <label key={key} className={verdict.decision === key ? 'is-on' : ''}>
                              <input
                                type="radio"
                                name="verdict"
                                checked={verdict.decision === key}
                                onChange={() => setVerdict((v) => ({ ...v, decision: key, amount: v.amount || String(Number(shown.requestedAmount)) }))}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        {verdict.decision === 'BUYER' && (
                          <div className="am-verdict-row">
                            <label>Refund amount (₱)
                              <input type="number" min="0" max={Number(shown.requestedAmount)} value={verdict.amount} onChange={(e) => setVerdict((v) => ({ ...v, amount: e.target.value }))} />
                            </label>
                            <label className="am-verdict-check">
                              <input type="checkbox" checked={verdict.physical} onChange={(e) => setVerdict((v) => ({ ...v, physical: e.target.checked }))} />
                              Items go back to the shop first
                            </label>
                          </div>
                        )}
                        <label className="am-verdict-note">Reason (both sides see it)
                          <textarea rows={3} value={verdict.note} onChange={(e) => setVerdict((v) => ({ ...v, note: e.target.value }))} placeholder="e.g. The photos show the item arrived broken." />
                        </label>
                        <button
                          type="button"
                          className="admin-btn admin-btn-green"
                          disabled={!verdict.decision || verdict.note.trim().length < 5 || deciding}
                          onClick={decideDispute}
                        >
                          {deciding ? 'Deciding…' : 'Decide'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

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
                    <div>
                      <label>Order</label>
                      <p>
                        {shown.order?.id
                          ? <Link className="admin-link" to={`/admin/orders?id=${encodeURIComponent(shown.order.id)}`}>{shown.order.orderNumber}</Link>
                          : shown.order?.orderNumber || '—'}
                        {shown.order?.status ? ` · ${orderStatusLabel(shown.order.status)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="am-detail-actions">
                    {messageSeller(summary || shown)}
                    {shown.buyer?.id && (
                      <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(shown.buyer.id)}`}>
                        <ChatCircleDots size={13} /> Message buyer
                      </Link>
                    )}
                  </div>
                </div>

                <div className="admin-detail-section">
                  <h4>Items</h4>
                  <div className="am-items">
                    {(shown.items || []).map((it) => {
                      const product = it.orderItem?.product;
                      const img = Array.isArray(product?.images) ? photoUrl(lineImage(product, it.orderItem?.selectedVariations)) : null;
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
