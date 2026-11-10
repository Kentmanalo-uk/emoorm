import { Link } from 'react-router-dom';
import { ShoppingCart } from '../../lib/icons';
import { peso } from '../../lib/format';
import ProductTile from '../product/ProductTile';
import './MoormyGlobal.css';

/*
 * What Moormy shows with an answer (backend/src/moormy turn): product cards,
 * a comparison, the cart, orders. Shared by her floating panel and her chat
 * in Messages. onPick: a link in it was followed (phones close the panel).
 */

export function Cards({ cards, onPick }) {
  if (!cards?.length) return null;
  return (
    <div className="mmg-cards" onClick={(e) => { if (e.target.closest('a')) onPick?.(); }}>
      {cards.map((p) => (
        <div key={p.id} className="mmg-card"><ProductTile product={p} /></div>
      ))}
    </div>
  );
}

export function Compare({ compare }) {
  const [a, b] = compare?.products || [];
  if (!a || !b) return null;
  const rows = [
    ['Price', (p) => peso(p.price)],
    ['Rating', (p) => (p.rating != null ? `${Number(p.rating).toFixed(1)} ★ (${p.reviews})` : 'No reviews yet')],
    ['Sold', (p) => (p.sold ? `${p.sold}` : '—')],
    ['Stock', (p) => (p.stock == null ? 'Made to order' : p.stock > 0 ? `${p.stock}` : 'Out of stock')],
    ['Shop', (p) => p.shop || '—'],
    ['Town', (p) => p.town || '—'],
  ];
  const cheaper = Number(a.price) === Number(b.price) ? null : (Number(a.price) < Number(b.price) ? a.id : b.id);
  return (
    <table className="mmg-compare">
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">Detail</span></th>
          {[a, b].map((p) => <th key={p.id} scope="col" className="mmg-compare-name">{p.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {[a, b].map((p) => (
              <td key={p.id} className={label === 'Price' && cheaper === p.id ? 'is-best' : ''}>
                {label === 'Price' ? <span className="mmg-compare-price">{value(p)}</span> : value(p)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CartSummary({ cart, onPick }) {
  if (!cart?.lines?.length) return null;
  return (
    <div className="mmg-cart">
      <ul>
        {cart.lines.map((l) => (
          <li key={l.id}>
            <span className="mmg-cart-name">{l.name}</span>
            <span className="mmg-cart-qty">× {l.quantity}</span>
            <span className="mmg-cart-price">{peso(l.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mmg-cart-total">
        <span>{cart.items} item{cart.items === 1 ? '' : 's'}</span>
        <strong className="mmg-cart-price">{peso(cart.total)}</strong>
      </div>
      <Link to="/cart" className="mmg-action" onClick={onPick}><ShoppingCart size={15} /> Go to cart</Link>
    </div>
  );
}

export function Orders({ orders, onPick }) {
  if (!orders?.length) return null;
  return (
    <ul className="mmg-orders">
      {orders.map((o) => (
        <li key={o.id}>
          <Link to={`/profile/orders?id=${encodeURIComponent(o.id)}`} onClick={onPick}>
            <span className="mmg-order-top">
              <strong>{o.orderNumber}</strong>
              <span className="mmg-order-price">{peso(o.total)}</span>
            </span>
            <span className="mmg-order-shop">{o.shop}</span>
            <span className={`mmg-order-status is-${String(o.status).toLowerCase()}`}>{o.statusText}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
