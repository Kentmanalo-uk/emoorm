import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, Package, Scales } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './Returns.css';

const LABELS = {
  REQUESTED: 'Request submitted',
  APPROVED: 'Return approved',
  AWAITING_SHIPMENT: 'Ship items back',
  RECEIVED: 'Items received',
  REFUNDED: 'Refund issued',
  REJECTED: 'Request rejected',
  CANCELLED: 'Request cancelled',
  CLOSED: 'Return closed',
  DISPUTED: 'With the municipal admin',
};

// A rejection can be taken to the municipal admin within a week of it.
const DISPUTE_DAYS = 7;

export default function ReturnDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  // When it was loaded: the dispute window is checked against this.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(() => axios.get(`/returns/${id}`)
    .then((res) => { setItem(res.data); setLoadedAt(Date.now()); setFailed(false); })
    .catch(() => setFailed(true)), [id]);
  useEffect(() => { load(); }, [load]);

  const action = async (path, message, body) => {
    setBusy(true);
    try {
      await axios.post(`/returns/${id}/${path}`, body);
      toast.success(message);
      await load();
      return true;
    } catch (err) {
      toast.error(err.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!item && failed) {
    return (
      <div className="returns-empty">
        <p>This return request couldn&rsquo;t be loaded.</p>
        <button type="button" className="returns-primary" onClick={() => { setFailed(false); load(); }}>Try again</button>
      </div>
    );
  }
  if (!item) return <div className="returns-empty">Loading return request…</div>;

  const canDispute = item.status === 'REJECTED' && !item.disputedAt && item.decidedAt
    && loadedAt - new Date(item.decidedAt).getTime() < DISPUTE_DAYS * 86400e3;

  return (
    <div className="return-detail-page">
      <Link to="/profile/returns" className="return-back"><ArrowLeft size={18} /> All returns</Link>
      <div className="return-detail-head">
        <div>
          <p className="returns-eyebrow">{item.requestNumber}</p>
          <h1>Return request</h1>
          <span>Order #{item.order?.orderNumber}</span>
        </div>
        <span className={`return-status status-${item.status.toLowerCase()}`}>{LABELS[item.status] || item.status}</span>
      </div>

      <section className="return-detail-panel">
        <h2>Progress</h2>
        <div className="return-timeline">
          {(item.history || []).map((event, index) => (
            <div className="timeline-row" key={`${event.at}-${index}`}>
              <span className="timeline-dot"><CheckCircle size={17} /></span>
              <div>
                <strong>{LABELS[event.status] || event.event || event.status}</strong>
                <small>{event.at ? new Date(event.at).toLocaleString() : ''}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="return-detail-panel">
        <h2>Items</h2>
        {item.items?.map((line) => (
          <div className="detail-item" key={line.id}>
            <Package size={20} />
            <span>{line.orderItem?.product?.name || line.orderItem?.productName}</span>
            <small>Qty {line.quantity}</small>
            <strong>₱{Number(line.subtotal).toFixed(2)}</strong>
          </div>
        ))}
        <div className="detail-total">
          <span>{item.status === 'REFUNDED' ? 'Refunded amount' : 'Requested amount'}</span>
          <strong>₱{Number(item.refundedAmount || item.approvedAmount || item.requestedAmount || 0).toFixed(2)}</strong>
        </div>
      </section>

      {item.sellerNote && <section className="return-note"><strong>Seller note</strong><p>{item.sellerNote}</p></section>}
      {item.disputeReason && <section className="return-note"><strong>Why you disputed it</strong><p>{item.disputeReason}</p></section>}
      {item.disputeResolution && (
        <section className="return-note is-decision"><strong>The admin&rsquo;s decision</strong><p>{item.disputeResolution}</p></section>
      )}

      {canDispute && (
        <section className="return-detail-panel return-dispute">
          <h2><Scales size={18} /> Think the rejection is wrong?</h2>
          {!disputing ? (
            <>
              <p>The municipal admin of the shop&rsquo;s town can look at your photos and the shop&rsquo;s reason, and decide. You can ask within {DISPUTE_DAYS} days of the rejection.</p>
              <button type="button" className="returns-primary" onClick={() => setDisputing(true)}>Ask the admin to decide</button>
            </>
          ) : (
            <>
              <textarea
                rows={4}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What is wrong with the shop's reason? e.g. The photos show the jar arrived cracked."
              />
              <div className="return-dispute-actions">
                <button type="button" disabled={busy} onClick={() => setDisputing(false)}>Cancel</button>
                <button
                  type="button"
                  className="returns-primary"
                  disabled={busy || reason.trim().length < 10}
                  onClick={async () => { if (await action('dispute', 'Sent to the municipal admin', { reason })) setDisputing(false); }}
                >
                  Send to the admin
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="return-detail-actions">
        {item.status === 'REQUESTED' && <button disabled={busy} onClick={() => action('cancel', 'Return request cancelled')}>Cancel request</button>}
        {item.status === 'REFUNDED' && <button className="returns-primary" disabled={busy} onClick={() => action('close', 'Return closed')}>Close return</button>}
        {item.status === 'AWAITING_SHIPMENT' && <div className="return-hint"><Clock size={18} /> Ship the items back and wait for the seller to confirm receipt.</div>}
        {item.status === 'DISPUTED' && <div className="return-hint"><Scales size={18} /> The municipal admin is looking at this. You&rsquo;ll be notified of the decision.</div>}
      </div>
    </div>
  );
}
