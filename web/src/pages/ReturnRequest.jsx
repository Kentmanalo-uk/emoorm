import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, UploadSimple } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './Returns.css';

const REASONS = [['DAMAGED', 'Damaged item'], ['WRONG_ITEM', 'Wrong item'], ['NOT_AS_DESCRIBED', 'Not as described'], ['MISSING', 'Missing item'], ['OTHER', 'Other']];

export default function ReturnRequest() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState('DAMAGED');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = params.get('orderId');
    if (!id) return;
    axios.get(`/orders/${id}`).then((res) => setOrder(res.data)).catch((err) => toast.error(err.message || 'Unable to load order'));
  }, [params]);

  const toggle = (id, max) => setSelected((current) => current[id] ? { ...current, [id]: 0 } : { ...current, [id]: Math.max(1, Math.min(max, 1)) });
  const submit = async (event) => {
    event.preventDefault();
    const items = Object.entries(selected).filter(([, qty]) => qty > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!order || !items.length) return toast.error('Select at least one item');
    setSaving(true);
    try {
      const uploaded = [];
      for (const file of photos) {
        const body = new FormData(); body.append('image', file);
        const result = await axios.post('/upload/image', body, { headers: { 'Content-Type': 'multipart/form-data' } });
        uploaded.push(result.data?.url || result.data?.path);
      }
      const result = await axios.post('/returns', { orderId: order.id, items, reason, buyerNote: note, photos: uploaded });
      toast.success('Return request submitted');
      navigate(`/profile/returns/${result.data.id}`);
    } catch (err) { toast.error(err.message || 'Could not submit return request'); } finally { setSaving(false); }
  };

  return <div className="return-form-page"><Link to="/profile/orders" className="return-back"><ArrowLeft size={18} /> Back to orders</Link><div className="return-form-card"><p className="returns-eyebrow">Request support</p><h1>Return an order</h1>{!order ? <p className="return-muted">Choose a completed order first to start a request.</p> : <form onSubmit={submit}><div className="request-order-summary"><strong>Order #{order.orderNumber}</strong><span>{order.store?.name}</span></div><fieldset><legend>Which items need help?</legend>{order.items?.map((item) => <label className="request-item" key={item.id}><input type="checkbox" checked={Boolean(selected[item.id])} onChange={() => toggle(item.id, item.quantity)} /><span>{item.productName}</span><small>Qty {item.quantity} · ₱{Number(item.price).toFixed(2)}</small></label>)}</fieldset><fieldset><legend>What went wrong?</legend><div className="reason-grid">{REASONS.map(([value, label]) => <button type="button" key={value} className={reason === value ? 'is-selected' : ''} onClick={() => setReason(value)}>{label}</button>)}</div></fieldset><label className="request-label">Additional details<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Tell the seller what happened" /></label><label className="photo-upload"><UploadSimple size={18} /> Add photos<input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 5))} /><small>{photos.length ? `${photos.length} photo(s) selected` : 'Optional, up to 5 photos'}</small></label><button className="returns-primary returns-submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit return request'}</button></form>}</div></div>;
}
