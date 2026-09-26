import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, Package, Truck, Wallet, SlidersHorizontal, Check } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import EmptyArt from '../components/ui/EmptyArt';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSheet from '../components/seller/PhoneSheet';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './SellerReturns.css';

const TABS = [['all', 'All'], ['REQUESTED', 'Requested'], ['AWAITING_SHIPMENT', 'Awaiting shipment'], ['RECEIVED', 'Received'], ['REFUNDED', 'Refunded'], ['REJECTED', 'Rejected']];
// Phones show these as chips; the other stages sit in a sheet.
const PHONE_QUICK_TABS = ['all', 'REQUESTED'];
const LABELS = { REQUESTED: 'Requested', APPROVED: 'Approved', AWAITING_SHIPMENT: 'Awaiting shipment', RECEIVED: 'Received', REFUNDED: 'Refunded', REJECTED: 'Rejected', CANCELLED: 'Cancelled', CLOSED: 'Closed' };
export default function SellerReturns() {
  const [returns, setReturns] = useState([]); const [tab, setTab] = useState('all'); const [selected, setSelected] = useState(null); const [note, setNote] = useState(''); const [amount, setAmount] = useState(''); const [method, setMethod] = useState('GCASH'); const [reference, setReference] = useState(''); const [physical, setPhysical] = useState(true); const [busy, setBusy] = useState(false);
  const load = () => axios.get('/returns/store', { params: { pageSize: 50 } }).then((res) => setReturns(res.data || [])).catch((err) => toast.error(err.message || 'Unable to load returns'));
  useEffect(() => { load(); }, []);
  const choose = (item) => { setSelected(item); setAmount(String(item.requestedAmount || '')); setNote(item.sellerNote || ''); };
  const [searchParams] = useSearchParams();
  // Deep link from a return notification: /seller/returns?id=<returnId>.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || returns.length === 0 || openedId.current === targetId) return;
    openedId.current = targetId;
    const match = returns.find((item) => item.id === targetId);
    if (match) choose(match);
  }, [returns, searchParams]);
  const call = async (path, body, message) => { setBusy(true); try { await axios.patch(`/returns/${selected.id}/${path}`, body); toast.success(message); setSelected(null); await load(); } catch (err) { toast.error(err.message || 'Action failed'); } finally { setBusy(false); } };
  const decide = (action) => { if (action === 'REJECT' && !note.trim()) return toast.error('Add a rejection note'); call('decision', { action, approvedAmount: Number(amount), requiresPhysicalReturn: physical, sellerNote: note }, action === 'APPROVE' ? 'Return approved' : 'Return rejected'); };
  const visible = tab === 'all' ? returns : returns.filter((r) => r.status === tab);
  const isPhone = usePhoneLayout();
  const [stagesOpen, setStagesOpen] = useState(false);
  const countFor = (key) => (key === 'all' ? returns.length : returns.filter((r) => r.status === key).length);
  const tabLabel = (key) => TABS.find(([k]) => k === key)?.[1];
  const phoneTabs = (
    <>
      <div className="scm-chips" role="group" aria-label="Show returns">
        {PHONE_QUICK_TABS.map((key) => (
          <button type="button" key={key} className={`scm-chip${tab === key ? ' is-on' : ''}`} onClick={() => setTab(key)}>
            {key === 'REQUESTED' ? 'To review' : tabLabel(key)}{countFor(key) > 0 ? ` · ${countFor(key)}` : ''}
          </button>
        ))}
        <button type="button" className={`scm-chip scm-chip--more${PHONE_QUICK_TABS.includes(tab) ? '' : ' is-on'}`} onClick={() => setStagesOpen(true)}>
          <SlidersHorizontal size={16} weight="bold" />
          {PHONE_QUICK_TABS.includes(tab) ? 'More' : tabLabel(tab)}
        </button>
      </div>
      <PhoneSheet open={stagesOpen} title="Show returns" onClose={() => setStagesOpen(false)}>
        {TABS.map(([key, label]) => (
          <button type="button" key={key} className={`scm-choice${tab === key ? ' is-on' : ''}`} onClick={() => { setTab(key); setStagesOpen(false); }}>
            <span>{label}{countFor(key) > 0 ? ` (${countFor(key)})` : ''}</span>
            {tab === key && <Check size={18} weight="bold" />}
          </button>
        ))}
      </PhoneSheet>
    </>
  );
  return <div className="seller-dashboard"><div className="seller-container"><div className="seller-returns"><SellerPageHead title="Returns & refunds" subtitle="Review requests, confirm received parcels, and record refunds." actions={isPhone ? null : (<div className="seller-return-stat"><ArrowIcon /><strong>{returns.filter((r) => r.status === 'REQUESTED').length}</strong><span>to review</span></div>)} />{isPhone ? phoneTabs : <div className="seller-return-tabs">{TABS.map(([key, label]) => <button className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)} key={key}>{label}<b>{key === 'all' ? returns.length : returns.filter((r) => r.status === key).length}</b></button>)}</div>}<div className={`seller-return-layout${selected ? '' : ' is-single'}`}><div className="seller-return-list">{visible.map((item) => <button className={`seller-return-row ${selected?.id === item.id ? 'is-selected' : ''}`} onClick={() => choose(item)} key={item.id}><div><strong>{item.requestNumber}</strong><span>{item.buyer?.fullName || 'Buyer'} · Order #{item.order?.orderNumber}</span></div><div><em className={`seller-status status-${item.status.toLowerCase()}`}>{LABELS[item.status]}</em><b>₱{Number(item.requestedAmount || 0).toFixed(2)}</b></div></button>)}{!visible.length && <div className="seller-return-empty"><EmptyArt name="delivery" size={168} /><strong>No return requests</strong><p>{tab === 'all' ? 'Requests from buyers will appear here, with the refund tools alongside them.' : 'Nothing is in this stage right now.'}</p></div>}</div>{selected && <div className="seller-return-detail"><div className="seller-detail-top"><div><span className="seller-kicker">{selected.requestNumber}</span><h2>{selected.buyer?.fullName || 'Buyer'}’s request</h2><p>Order #{selected.order?.orderNumber} · {selected.reason}</p></div><em className={`seller-status status-${selected.status.toLowerCase()}`}>{LABELS[selected.status]}</em></div><div className="seller-detail-items">{selected.items?.map((line) => <div key={line.id}><Package size={19} /><span>{line.orderItem?.product?.name || line.orderItem?.productName}</span><b>×{line.quantity}</b></div>)}</div>{selected.buyerNote && <p className="buyer-note">“{selected.buyerNote}”</p>}{selected.status === 'REQUESTED' && <div className="seller-action-form"><label>Approved amount<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="seller-check"><input type="checkbox" checked={physical} onChange={(e) => setPhysical(e.target.checked)} /> Requires physical return</label><label>Note<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the buyer" /></label><div className="seller-actions"><button onClick={() => decide('REJECT')} disabled={busy}>Reject</button><button className="seller-approve" onClick={() => decide('APPROVE')} disabled={busy}><CheckCircle size={17} /> Approve</button></div></div>}{selected.status === 'AWAITING_SHIPMENT' && <button className="seller-wide-action" onClick={() => call('received', {}, 'Return marked received')} disabled={busy}><Truck size={19} /> Mark items received</button>}{['APPROVED', 'RECEIVED'].includes(selected.status) && <div className="seller-action-form"><label>Refund method<select value={method} onChange={(e) => setMethod(e.target.value)}><option value="GCASH">GCash</option><option value="BANK">Bank transfer</option><option value="COD_CASH">Cash</option><option value="MANUAL">Manual</option></select></label><label>Refund amount<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label>Reference<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference" /></label><button className="seller-wide-action" onClick={() => call('refund', { refundMethod: method, refundedAmount: Number(amount), refundReference: reference }, 'Refund recorded')} disabled={busy}><Wallet size={19} /> Record refund</button></div>}</div>}</div></div></div></div>;
}
function ArrowIcon() { return <CheckCircle size={21} />; }
