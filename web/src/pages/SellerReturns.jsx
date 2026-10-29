import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, Package, Truck, Wallet, SlidersHorizontal, Check, Clock, Image as ImageIcon,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg, firstImage } from '../lib/media';
import { returnStatus, returnReason } from '../lib/labels';
import { peso } from '../lib/format';
import { confirmAction } from '../lib/confirm';
import EmptyArt from '../components/ui/EmptyArt';
import LoadFailed from '../components/ui/LoadFailed';
import Skeleton from '../components/ui/Skeleton';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSheet from '../components/seller/PhoneSheet';
import { usePhoneLayout } from '../hooks/useMobileNav';
import Select from '../components/ui/Select';
import './SellerReturns.css';

/*
 * Returns & refunds: what buyers asked to send back, in the seller's words.
 * Each request is approved (with the amount, and whether the item comes
 * back) or rejected with a note; a returned parcel is marked received; the
 * refund is recorded once the money is sent. The list is paged by the server,
 * which also counts every status for the tabs.
 */

// Tabs by what the seller does next. A tab may cover several statuses: an
// approved return with nothing to send back is refunded straight away, like
// a received one. Disputed and closed only show once there are some.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'REQUESTED', label: 'To review' },
  { key: 'AWAITING_SHIPMENT', label: 'Waiting for the item' },
  { key: 'APPROVED,RECEIVED', label: 'To refund' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'DISPUTED', label: 'Disputed', hideEmpty: true },
  { key: 'CANCELLED,CLOSED', label: 'Closed', hideEmpty: true },
];
// Phones show these as chips; the other stages sit in a sheet.
const PHONE_QUICK_TABS = ['all', 'REQUESTED', 'APPROVED,RECEIVED'];

// The shared words (lib/labels), seen from the seller's side.
const statusWord = (status) => (status === 'REQUESTED' ? 'To review' : returnStatus(status));

const REFUND_METHODS = [
  ['GCASH', 'GCash'],
  ['BANK', 'Bank transfer'],
  ['COD_CASH', 'Cash'],
  ['MANUAL', 'Other (in person)'],
];
const methodWord = (key) => REFUND_METHODS.find(([k]) => k === key)?.[1] || 'Other';

const PAGE_SIZE = 20;
const DAY_MS = 86400000;
// A request unanswered this long reads as slow to the buyer and the admin
// (the attention badge turns red at the same age).
const SLOW_DAYS = 3;

const photosOf = (request) => (Array.isArray(request?.photos) ? request.photos.filter((p) => typeof p === 'string') : []);
const productPhoto = (request) => firstImage(request?.items?.[0]?.orderItem?.product?.images);
const lineName = (line) => line.orderItem?.productName || line.orderItem?.product?.name || 'Item';
const daysWaiting = (request) => Math.max(0, Math.floor((Date.now() - new Date(request.createdAt).getTime()) / DAY_MS));
const waitingText = (days) => (days === 0 ? 'Asked today' : `Buyer waiting ${days} day${days === 1 ? '' : 's'}`);
const toNumber = (value) => (value === '' || value == null ? NaN : Number(value));

export default function SellerReturns() {
  const isPhone = usePhoneLayout();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [returns, setReturns] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [stagesOpen, setStagesOpen] = useState(false);
  // The open request's form.
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('GCASH');
  const [reference, setReference] = useState('');
  const [physical, setPhysical] = useState(true);
  const [busy, setBusy] = useState(false);

  const choose = useCallback((item) => {
    setSelected(item);
    const approved = item.approvedAmount != null ? item.approvedAmount : item.requestedAmount;
    setAmount(String(approved ?? ''));
    setNote(item.sellerNote || '');
    setReference('');
    setPhysical(true);
  }, []);

  // Deep link from a return notification: /seller/returns?id=<returnId>,
  // opened once the list is in, and asked for on its own when it isn't on
  // the page shown.
  const openedId = useRef(null);
  const targetId = searchParams.get('id');

  // Loading is switched on where the list is changed (tab, page, Try
  // again), so a refresh after an action keeps the list on screen.
  const load = useCallback(async () => {
    try {
      const res = await axios.get('/returns/store', {
        params: { page, pageSize: PAGE_SIZE, status: tab === 'all' ? undefined : tab },
      });
      const rows = res.data || [];
      setReturns(rows);
      setCounts(res.counts || {});
      setPagination({ total: res.pagination?.total || 0, totalPages: Math.max(1, res.pagination?.totalPages || 1) });
      setLoadFailed(false);
      if (targetId && openedId.current !== targetId) {
        openedId.current = targetId;
        const match = rows.find((item) => item.id === targetId);
        if (match) choose(match);
        else axios.get(`/returns/${targetId}`).then((one) => { if (one.data) choose(one.data); }).catch(() => {});
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, tab, targetId, choose]);
  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setIsLoading(true);
    load();
  };
  const goPage = (next) => {
    setIsLoading(true);
    setPage(next);
  };

  const selectTab = (key) => {
    if (key === tab) return;
    setIsLoading(true);
    setReturns([]);
    setTab(key);
    setPage(1);
    setSelected(null);
  };

  const call = async (path, body, message) => {
    setBusy(true);
    try {
      await axios.patch(`/returns/${selected.id}/${path}`, body);
      toast.success(message);
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const requested = Number(selected?.requestedAmount || 0);
  const approvedSoFar = selected?.approvedAmount != null ? Number(selected.approvedAmount) : requested;

  const approve = async () => {
    const value = toNumber(amount);
    if (!Number.isFinite(value) || value < 0) { toast.error('Enter the amount to refund'); return; }
    if (value > requested) { toast.error(`The most you can approve is ${peso(requested)}, what the buyer asked for`); return; }
    const ok = await confirmAction({
      title: `Approve a refund of ${peso(value)}?`,
      message: physical
        ? 'The buyer is told to send the item back. You refund them once it arrives.'
        : 'The buyer keeps the item. Send them the money, then record the refund here.',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    call('decision', { action: 'APPROVE', approvedAmount: value, requiresPhysicalReturn: physical, sellerNote: note }, 'Return approved');
  };

  const reject = async () => {
    if (!note.trim()) { toast.error('Write the buyer a note saying why'); return; }
    const ok = await confirmAction({
      title: 'Reject this return?',
      message: 'The buyer sees your note. They can ask the municipal admin to look at it within 7 days.',
      confirmLabel: 'Reject',
      danger: true,
    });
    if (!ok) return;
    call('decision', { action: 'REJECT', sellerNote: note }, 'Return rejected');
  };

  const received = async () => {
    const ok = await confirmAction({
      title: 'Has the item arrived?',
      message: 'Only confirm once you have the parcel in hand. Next you refund the buyer.',
      confirmLabel: 'Yes, it arrived',
    });
    if (!ok) return;
    call('received', {}, 'Marked as received. Now refund the buyer.');
  };

  const refund = async () => {
    const value = toNumber(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error('Enter the amount you sent back'); return; }
    if (value > approvedSoFar) { toast.error(`The most you can refund is ${peso(approvedSoFar)}, the approved amount`); return; }
    const ok = await confirmAction({
      title: `Record a refund of ${peso(value)}?`,
      message: `Only confirm once the buyer has the money (${methodWord(method)}). This can't be undone.`,
      confirmLabel: 'Record refund',
    });
    if (!ok) return;
    call('refund', { refundMethod: method, refundedAmount: value, refundReference: reference }, 'Refund recorded');
  };

  const allCount = Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);
  const countFor = (key) => (key === 'all' ? allCount : key.split(',').reduce((sum, s) => sum + (counts[s] || 0), 0));
  const shownTabs = TABS.filter((t) => !t.hideEmpty || countFor(t.key) > 0 || tab === t.key);
  const tabLabel = (key) => TABS.find((t) => t.key === key)?.label;
  const toReview = counts.REQUESTED || 0;

  const phoneTabs = (
    <>
      <div className="scm-chips" role="group" aria-label="Show returns">
        {PHONE_QUICK_TABS.map((key) => (
          <button type="button" key={key} className={`scm-chip${tab === key ? ' is-on' : ''}`} onClick={() => selectTab(key)}>
            {tabLabel(key)}{countFor(key) > 0 ? ` · ${countFor(key)}` : ''}
          </button>
        ))}
        <button type="button" className={`scm-chip scm-chip--more${PHONE_QUICK_TABS.includes(tab) ? '' : ' is-on'}`} onClick={() => setStagesOpen(true)}>
          <SlidersHorizontal size={16} weight="bold" />
          {PHONE_QUICK_TABS.includes(tab) ? 'More' : tabLabel(tab)}
        </button>
      </div>
      <PhoneSheet open={stagesOpen} title="Show returns" onClose={() => setStagesOpen(false)}>
        {shownTabs.map(({ key, label }) => (
          <button type="button" key={key} className={`scm-choice${tab === key ? ' is-on' : ''}`} onClick={() => { selectTab(key); setStagesOpen(false); }}>
            <span>{label}{countFor(key) > 0 ? ` (${countFor(key)})` : ''}</span>
            {tab === key && <Check size={18} weight="bold" />}
          </button>
        ))}
      </PhoneSheet>
    </>
  );

  const desktopTabs = (
    <div className="seller-return-tabs" role="tablist" aria-label="Show returns">
      {shownTabs.map(({ key, label }) => (
        <button type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => selectTab(key)} key={key}>
          {label}<b>{countFor(key)}</b>
        </button>
      ))}
    </div>
  );

  let list;
  if (isLoading && returns.length === 0) {
    list = <div className="seller-return-loading"><Skeleton.List rows={4} /></div>;
  } else if (loadFailed) {
    list = <div className="seller-return-empty"><LoadFailed onRetry={retry} what="your return requests" compact /></div>;
  } else if (returns.length === 0) {
    list = (
      <div className="seller-return-empty">
        <EmptyArt name="returns" size={168} />
        <strong>{tab === 'all' ? 'No return requests' : `Nothing in ${tabLabel(tab)}`}</strong>
        <p>{tab === 'all' ? 'When a buyer asks to return an item, the request and the refund steps show here.' : 'Nothing is in this stage right now.'}</p>
      </div>
    );
  } else {
    list = (
      <>
        {returns.map((item) => <ReturnRow key={item.id} item={item} isSelected={selected?.id === item.id} onOpen={() => choose(item)} />)}
        {pagination.totalPages > 1 && (
          <div className="so-pagination">
            <button type="button" className="btn-seller-outline so-pagination-btn" disabled={page <= 1 || isLoading} onClick={() => goPage(Math.max(1, page - 1))}>
              Prev
            </button>
            <span>Page {page} of {pagination.totalPages}</span>
            <button type="button" className="btn-seller-outline so-pagination-btn" disabled={page >= pagination.totalPages || isLoading} onClick={() => goPage(page + 1)}>
              Next
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-returns">
          <SellerPageHead
            title="Returns & refunds"
            subtitle="Review requests, confirm returned items and record refunds."
            actions={isPhone ? null : (
              <div className="seller-return-stat">
                <CheckCircle size={21} />
                <strong>{toReview}</strong>
                <span>to review</span>
              </div>
            )}
          />
          {isPhone ? phoneTabs : desktopTabs}
          <div className={`seller-return-layout${selected ? '' : ' is-single'}`}>
            <div className="seller-return-list">{list}</div>
            {selected && (
              <ReturnDetail
                selected={selected}
                busy={busy}
                form={{ note, setNote, amount, setAmount, method, setMethod, reference, setReference, physical, setPhysical }}
                requested={requested}
                approvedSoFar={approvedSoFar}
                onApprove={approve}
                onReject={reject}
                onReceived={received}
                onRefund={refund}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One request in the list: the item, who asked, how long they've waited, the amount. */
function ReturnRow({ item, isSelected, onOpen }) {
  const photos = photosOf(item);
  const thumb = photos[0] || productPhoto(item);
  const first = item.items?.[0];
  const more = (item.items?.length || 0) - 1;
  const days = item.status === 'REQUESTED' ? daysWaiting(item) : null;
  return (
    <button type="button" className={`seller-return-row${isSelected ? ' is-selected' : ''}`} onClick={onOpen} aria-pressed={isSelected}>
      <span className="seller-return-thumb">
        {thumb ? <img src={resolveImg(thumb)} alt="" loading="lazy" /> : <Package size={20} />}
        {photos.length > 0 && (
          <em className="seller-return-photo-count" title={`${photos.length} photo${photos.length === 1 ? '' : 's'} from the buyer`}>
            <ImageIcon size={11} weight="fill" />{photos.length}
          </em>
        )}
      </span>
      <div className="seller-return-row-main">
        <strong>{first ? lineName(first) : 'Return request'}{more > 0 ? ` + ${more} more` : ''}</strong>
        <span>{item.buyer?.fullName || 'Buyer'} · {returnReason(item.reason)} · Order #{item.order?.orderNumber}</span>
        {days != null && (
          <span className={`seller-return-wait${days >= SLOW_DAYS ? ' is-late' : ''}`}>
            <Clock size={12} weight="bold" /> {waitingText(days)}
          </span>
        )}
      </div>
      <div className="seller-return-row-side">
        <em className={`seller-status status-${item.status.toLowerCase()}`}>{statusWord(item.status)}</em>
        <b>{peso(item.requestedAmount)}</b>
      </div>
    </button>
  );
}

/** The open request: what was asked, the buyer's photos, and the next step. */
function ReturnDetail({
  selected, busy, form, requested, approvedSoFar, onApprove, onReject, onReceived, onRefund,
}) {
  const {
    note, setNote, amount, setAmount, method, setMethod, reference, setReference, physical, setPhysical,
  } = form;
  const photos = photosOf(selected);
  const policy = selected.returnPolicySnapshot?.text || (typeof selected.returnPolicySnapshot === 'string' ? selected.returnPolicySnapshot : '');
  const days = selected.status === 'REQUESTED' ? daysWaiting(selected) : null;

  return (
    <div className="seller-return-detail" aria-label="Return request">
      <div className="seller-detail-top">
        <div>
          <span className="seller-kicker">Request {selected.requestNumber}</span>
          <h2>{selected.buyer?.fullName || 'Buyer'}’s request</h2>
          <p>
            {selected.order?.id
              ? <Link to={`/seller/orders?id=${selected.order.id}`}>Order #{selected.order.orderNumber}</Link>
              : `Order #${selected.order?.orderNumber}`}
            {' · '}{returnReason(selected.reason)}
            {days != null && ` · ${waitingText(days)}`}
          </p>
        </div>
        <em className={`seller-status status-${selected.status.toLowerCase()}`}>{statusWord(selected.status)}</em>
      </div>

      <div className="seller-detail-items">
        {selected.items?.map((line) => (
          <div key={line.id}>
            <Package size={19} />
            <span>{lineName(line)}</span>
            <b>×{line.quantity}</b>
          </div>
        ))}
        <div className="seller-detail-sum">
          <span />
          <span>Asked for</span>
          <b>{peso(requested)}</b>
        </div>
        {selected.approvedAmount != null && (
          <div className="seller-detail-sum">
            <span />
            <span>Approved</span>
            <b>{peso(selected.approvedAmount)}</b>
          </div>
        )}
        {selected.refundedAmount != null && (
          <div className="seller-detail-sum">
            <span />
            <span>Refunded{selected.refundMethod ? ` by ${methodWord(selected.refundMethod)}` : ''}</span>
            <b>{peso(selected.refundedAmount)}</b>
          </div>
        )}
      </div>

      {selected.buyerNote && <p className="buyer-note">“{selected.buyerNote}”</p>}

      {photos.length > 0 && (
        <div className="seller-return-photos">
          <span className="seller-return-label">Photos from the buyer</span>
          <div>
            {photos.map((p, i) => (
              <a key={p} href={resolveImg(p)} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1} of ${photos.length}`}>
                <img src={resolveImg(p)} alt={`Return photo ${i + 1}`} loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      )}

      {policy && <p className="seller-return-policy"><b>Your return policy:</b> {policy}</p>}
      {selected.sellerNote && selected.status !== 'REQUESTED' && <p className="buyer-note"><b>Your note:</b> {selected.sellerNote}</p>}
      {selected.disputeReason && <p className="buyer-note"><b>Disputed:</b> “{selected.disputeReason}”</p>}
      {selected.disputeResolution && <p className="buyer-note"><b>Admin decision:</b> {selected.disputeResolution}</p>}

      {selected.status === 'REQUESTED' && (
        <div className="seller-action-form">
          <label>
            Amount to refund
            <span className="seller-money">
              <span aria-hidden="true">₱</span>
              <input type="number" inputMode="decimal" min="0" max={requested} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </span>
            <small>Up to {peso(requested)}, what the buyer asked for.</small>
          </label>
          <label className="seller-check">
            <input type="checkbox" checked={physical} onChange={(e) => setPhysical(e.target.checked)} />
            <span>
              Buyer must send the item back
              <small>{physical ? 'You refund once it arrives.' : 'They keep it; you refund right away.'}</small>
            </span>
          </label>
          <label>
            Note for the buyer
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="How to send it back, or why you reject it" />
            <small>Needed if you reject.</small>
          </label>
          <div className="seller-actions">
            <button type="button" onClick={onReject} disabled={busy}>Reject</button>
            <button type="button" className="seller-approve" onClick={onApprove} disabled={busy}><CheckCircle size={17} /> Approve</button>
          </div>
        </div>
      )}

      {selected.status === 'AWAITING_SHIPMENT' && (
        <button type="button" className="seller-wide-action" onClick={onReceived} disabled={busy}>
          <Truck size={19} /> The item arrived
        </button>
      )}

      {['APPROVED', 'RECEIVED'].includes(selected.status) && (
        <div className="seller-action-form">
          <p className="seller-return-next">
            Send the buyer {peso(approvedSoFar)}, then record it here so they know it's on its way.
          </p>
          <label>
            Refunded by
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {REFUND_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </label>
          <label>
            Amount sent
            <span className="seller-money">
              <span aria-hidden="true">₱</span>
              <input type="number" inputMode="decimal" min="0" max={approvedSoFar} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </span>
            <small>Up to {peso(approvedSoFar)}, the approved amount.</small>
          </label>
          <label>
            Reference number
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GCash or bank reference (optional)" />
          </label>
          <button type="button" className="seller-wide-action" onClick={onRefund} disabled={busy}>
            <Wallet size={19} /> Record refund
          </button>
        </div>
      )}
    </div>
  );
}
