import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, UploadSimple } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './Returns.css';

const REASONS = [['DAMAGED', 'Damaged item'], ['WRONG_ITEM', 'Wrong item'], ['NOT_AS_DESCRIBED', 'Not as described'], ['MISSING', 'Missing item'], ['OTHER', 'Other']];

/**
 * Ask the shop to take back items from an order: which items and how many,
 * what went wrong, details and photos. Photos are uploaded once; trying again
 * after an error reuses them.
 */
export default function ReturnRequest() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get('orderId');
  const [order, setOrder] = useState(null);
  const [loadState, setLoadState] = useState(orderId ? 'loading' : 'none'); // loading | ready | error | none
  const [selected, setSelected] = useState({}); // orderItemId -> quantity
  const [reason, setReason] = useState('DAMAGED');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const uploadedRef = useRef(new Map()); // File -> uploaded URL

  const fetchOrder = useCallback(() => axios.get(`/orders/${orderId}`)
    .then((res) => { setOrder(res.data); setLoadState('ready'); })
    .catch(() => setLoadState('error')), [orderId]);

  useEffect(() => { if (orderId) fetchOrder(); }, [orderId, fetchOrder]);

  const loadOrder = () => {
    setLoadState('loading');
    fetchOrder();
  };

  const toggle = (id) => setSelected((cur) => ({ ...cur, [id]: cur[id] ? 0 : 1 }));
  const setQty = (id, qty, max) => setSelected((cur) => ({ ...cur, [id]: Math.max(1, Math.min(max, qty)) }));

  const submit = async (event) => {
    event.preventDefault();
    const items = Object.entries(selected).filter(([, qty]) => qty > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!order || !items.length) {
      toast.error('Select at least one item');
      return;
    }
    setSaving(true);
    try {
      const urls = [];
      for (const file of photos) {
        if (!uploadedRef.current.has(file)) {
          const body = new FormData();
          body.append('file', file);
          const result = await axios.post('/upload/image', body, { headers: { 'Content-Type': 'multipart/form-data' } });
          uploadedRef.current.set(file, result.data?.url);
        }
        urls.push(uploadedRef.current.get(file));
      }
      const result = await axios.post('/returns', { orderId: order.id, items, reason, buyerNote: note, photos: urls.filter(Boolean) });
      toast.success('Return request submitted');
      navigate(`/profile/returns/${result.data.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not submit return request');
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (loadState === 'none') {
    body = <p className="return-muted">Open My Orders and tap <strong>Request return</strong> on the order that needs help.</p>;
  } else if (loadState === 'loading') {
    body = <p className="return-muted">Loading the order…</p>;
  } else if (loadState === 'error') {
    body = (
      <div className="return-muted">
        <p>This order couldn&rsquo;t be loaded.</p>
        <button type="button" className="returns-primary" onClick={loadOrder}>Try again</button>
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit}>
        <div className="request-order-summary">
          <strong>Order #{order.orderNumber}</strong>
          <span>{order.store?.name}</span>
        </div>
        <fieldset>
          <legend>Which items need help?</legend>
          {order.items?.map((item) => {
            const qty = selected[item.id] || 0;
            return (
              <div className="request-item-row" key={item.id}>
                <label className="request-item">
                  <input type="checkbox" checked={qty > 0} onChange={() => toggle(item.id)} />
                  <span>{item.productName}</span>
                  <small>Qty {item.quantity} · ₱{Number(item.price).toFixed(2)}</small>
                </label>
                {qty > 0 && item.quantity > 1 && (
                  <div className="request-qty" role="group" aria-label={`How many of ${item.productName}`}>
                    <button type="button" onClick={() => setQty(item.id, qty - 1, item.quantity)} disabled={qty <= 1} aria-label="Fewer"><Minus size={14} /></button>
                    <span>{qty} of {item.quantity}</span>
                    <button type="button" onClick={() => setQty(item.id, qty + 1, item.quantity)} disabled={qty >= item.quantity} aria-label="More"><Plus size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
        <fieldset>
          <legend>What went wrong?</legend>
          <div className="reason-grid">
            {REASONS.map(([value, label]) => (
              <button type="button" key={value} className={reason === value ? 'is-selected' : ''} onClick={() => setReason(value)}>{label}</button>
            ))}
          </div>
        </fieldset>
        <label className="request-label">
          Additional details
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Tell the seller what happened" />
        </label>
        <label className="photo-upload">
          <UploadSimple size={18} /> Add photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 5))} />
          <small>{photos.length ? `${photos.length} photo(s) selected` : 'Optional, up to 5 photos'}</small>
        </label>
        <button className="returns-primary returns-submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit return request'}</button>
      </form>
    );
  }

  return (
    <div className="return-form-page">
      <Link to="/profile/orders" className="return-back"><ArrowLeft size={18} /> Back to orders</Link>
      <div className="return-form-card">
        <h1>Return an order</h1>
        {body}
      </div>
    </div>
  );
}
