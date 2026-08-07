import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ChevronLeft } from 'lucide-react';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import './OrderReceipt.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (d) => new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const paymentLabel = (m) => ({
  COD: 'Cash on Delivery / Pickup',
  GCASH: 'GCash (QR)',
  QRPH: 'QR Ph',
  BANK_TRANSFER: 'Bank Transfer',
})[m] || m || '—';

const fulfillmentLabel = (m) => (m === 'PICKUP' ? 'Store Pickup' : 'Delivery');

export default function OrderReceipt() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`/orders/${id}`);
        setOrder(res.data);
      } catch (err) {
        setError(err.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="receipt-loading">Loading receipt…</div>;
  if (error || !order) return <div className="receipt-loading">{error || 'Order not found'}</div>;

  const items = order.items || [];
  const itemsSubtotal = items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const totalAmount = Number(order.totalAmount || itemsSubtotal + deliveryFee);

  const store = order.store || {};
  const buyer = order.buyer || {};
  const orderNumber = order.orderNumber || order.id;

  return (
    <div className="receipt-page">
      <div className="receipt-toolbar">
        <Link to={-1} className="receipt-back"><ChevronLeft size={16} /> Back</Link>
        <button className="receipt-print-btn" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      <div className="receipt-paper">
        <header className="receipt-header">
          <div className="receipt-brand">
            <img src="/logo.png" alt="Emoorm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div>
              <div className="receipt-brand-name">EMOORM</div>
              <div className="receipt-brand-sub">Oriental Mindoro Marketplace</div>
            </div>
          </div>
          <div className="receipt-title">
            <div className="receipt-title-main">OFFICIAL RECEIPT</div>
            <div className="receipt-title-sub">Order #{orderNumber}</div>
          </div>
        </header>

        <section className="receipt-parties">
          <div>
            <h3>Seller</h3>
            <p><strong>{store.name || '—'}</strong></p>
            {store.owner?.fullName && <p>{store.owner.fullName}</p>}
            {store.address && <p>{store.address}</p>}
            {store.contactNumber && <p>Tel: {store.contactNumber}</p>}
          </div>
          <div>
            <h3>Buyer</h3>
            <p><strong>{buyer.fullName || '—'}</strong></p>
            {order.contactNumber && <p>Tel: {order.contactNumber}</p>}
            {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
          </div>
        </section>

        <section className="receipt-meta">
          <div><span className="meta-label">Order Date</span><span>{dateFmt(order.createdAt)}</span></div>
          <div><span className="meta-label">Fulfillment</span><span>{fulfillmentLabel(order.fulfillmentMethod)}</span></div>
          <div><span className="meta-label">Payment</span><span>{paymentLabel(order.paymentMethod)}</span></div>
          {order.paymentReference && (
            <div><span className="meta-label">Reference</span><span>{order.paymentReference}</span></div>
          )}
          <div><span className="meta-label">Status</span><span>{order.status}</span></div>
        </section>

        <section className="receipt-items">
          <table>
            <thead>
              <tr>
                <th className="col-name">Item</th>
                <th className="col-qty">Qty</th>
                <th className="col-price">Unit Price</th>
                <th className="col-total">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="item-name">{it.product?.name || it.productName || 'Item'}</div>
                    {it.product?.unit && <div className="item-unit">per {it.product.unit}</div>}
                  </td>
                  <td className="col-qty">{it.quantity}</td>
                  <td className="col-price">{peso(it.price)}</td>
                  <td className="col-total">{peso(Number(it.price) * Number(it.quantity))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="receipt-totals">
          <div className="totals-row"><span>Items Subtotal</span><span>{peso(itemsSubtotal)}</span></div>
          <div className="totals-row"><span>{order.fulfillmentMethod === 'PICKUP' ? 'Pickup Fee' : 'Delivery Fee'}</span><span>{deliveryFee === 0 ? 'FREE' : peso(deliveryFee)}</span></div>
          <div className="totals-row totals-grand"><span>TOTAL</span><span>{peso(totalAmount)}</span></div>
        </section>

        {order.paymentProofUrl && (
          <section className="receipt-proof">
            <h4>Payment Proof</h4>
            <img src={resolveImg(order.paymentProofUrl)} alt="Payment proof" />
          </section>
        )}

        {order.deliveryNotes && (
          <section className="receipt-notes">
            <h4>Order Notes</h4>
            <p>{order.deliveryNotes}</p>
          </section>
        )}

        <section className="receipt-signatures">
          <div>
            <div className="sig-line" />
            <div className="sig-label">Seller Signature</div>
          </div>
          <div>
            <div className="sig-line" />
            <div className="sig-label">Buyer Signature</div>
          </div>
        </section>

        <footer className="receipt-footer">
          <p>Thank you for supporting local sellers in Oriental Mindoro.</p>
          <p className="receipt-footer-small">Generated by Emoorm on {dateFmt(new Date())}</p>
        </footer>
      </div>
    </div>
  );
}
