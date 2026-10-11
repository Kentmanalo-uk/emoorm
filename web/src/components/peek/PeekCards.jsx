import { useEffect, useState } from 'react';
import {
  CircleNotch, MapPin, Package, Star, Storefront,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { parseImages, resolveImg } from '../../lib/media';
import { saleInfo } from '../../lib/variantPricing';
import { isStockless, productKind } from '../../lib/productKinds';
import KindPrice from '../product/kinds/KindPrice';
import ProductImage from '../ProductImage';
import { SaleWas } from '../ui/SaleTag';
import UserAvatar from '../ui/UserAvatar';
import { ProductTodayTag } from '../today/TodayTag';

/*
 * What the long-press previews show (the use*Peek hooks build the actions):
 * a product, a shop, a chat's latest messages, a notification in full.
 */

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const outOfStock = (p) => p.stock === 0 && !isStockless(p);

/* ── Product ── */

/** A product: its photo, name, price, rating and shop. */
export function ProductPeekCard({ product: p }) {
  const reviews = Number(p.reviewCount || 0);
  const rating = Number(p.averageRating || 0);
  const sold = Number(p.soldCount || 0);
  const town = p.municipality?.name || p.store?.municipality?.name;
  return (
    <div>
      <div className="peek-product-photo">
        <ProductImage src={parseImages(p.images)[0] || p.image} alt={p.name} loading="eager" />
        {outOfStock(p) && <span className="peek-badge">{productKind(p) === 'LIVESTOCK' ? 'Sold out' : 'Out of stock'}</span>}
      </div>
      <div className="peek-body">
        <p className="peek-title"><ProductTodayTag product={p} />{p.name}</p>
        <div className="peek-price-row">
          <span className="peek-price"><KindPrice product={p}>{peso(saleInfo(p).price)}</KindPrice></span>
          <SaleWas product={p} compact />
        </div>
        <div className="peek-stats">
          {reviews > 0 && (
            <span className="peek-stats-rating" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
              <Star size={13} weight="fill" /> {rating.toFixed(1)} <span className="peek-sub">({reviews})</span>
            </span>
          )}
          {sold > 0 && <span>{sold} sold</span>}
          {reviews === 0 && sold === 0 && <span className="peek-stats-new">New</span>}
        </div>
        {(p.store?.name || town) && (
          <div className="peek-place">
            {p.store?.name ? <Storefront size={14} /> : <MapPin size={14} />}
            <span className="peek-sub">{[p.store?.name, town].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shop ── */

const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0])
  .join('')
  .toUpperCase();

/** A shop: logo, name, town, product count, what it says and a few products. */
export function StorePeekCard({ store }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const count = store._count?.products ?? store.productCount ?? null;
  const town = store.municipality?.name;
  const logo = store.logoUrl || store.logo;
  const products = (store.products || []).slice(0, 3);
  return (
    <div>
      <div className="peek-store-head">
        <div className="peek-store-logo">
          {logo && !logoFailed
            ? <img src={resolveImg(logo) || logo} alt="" onError={() => setLogoFailed(true)} />
            : <span>{initialsOf(store.name)}</span>}
        </div>
        <div className="peek-store-text">
          <p className="peek-title">{store.name}</p>
          <div className="peek-store-meta peek-sub">
            {town && <span><MapPin size={13} weight="fill" /> {town}</span>}
            {count != null && <span><Package size={13} weight="fill" /> {count} {count === 1 ? 'product' : 'products'}</span>}
          </div>
        </div>
      </div>
      {(store.description || products.length > 0) && (
        <div className="peek-store-body">
          {store.description && <p className="peek-text">{store.description}</p>}
          {products.length > 0 && (
            <div className="peek-store-products">
              {products.map((p) => (
                <div key={p.id} className="peek-store-product">
                  <ProductImage src={Array.isArray(p.images) ? p.images[0] : p.images} alt={p.name || ''} loading="eager" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chat ── */

const SHOWN = 6;

/** What a message says, in a line (photos, products and orders have no text of their own). */
const lineOf = (m) => {
  if (m.body) return m.body;
  if (m.imageUrl) return 'Photo';
  if (m.product?.name) return `Product: ${m.product.name}`;
  if (m.order?.orderNumber) return `Order #${m.order.orderNumber}`;
  return '';
};

const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if ((now - d) / 86400000 < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString();
};

/** A chat: who it is with and its newest messages, loaded when it opens. */
export function ConversationPeekCard({ item, currentUserId }) {
  const sellerView = item.role === 'seller';
  const title = sellerView ? item.buyer?.fullName || 'Buyer' : item.store?.name || 'Store';
  const [messages, setMessages] = useState(null);
  const [failed, setFailed] = useState(false);

  // GET leaves the chat unread (only POST …/read marks it).
  useEffect(() => {
    let live = true;
    axios.get(`/messages/conversations/${item.id}`, { quiet: true })
      .then((res) => { if (live) setMessages((res.data?.messages || []).filter((m) => lineOf(m)).slice(-SHOWN)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [item.id]);

  return (
    <div>
      <div className="peek-chat-head">
        <div className="peek-chat-avatar">
          <UserAvatar
            src={sellerView ? item.buyer?.profilePhoto : item.store?.logo}
            name={title}
            alt=""
            fallbackIcon={sellerView ? null : Storefront}
          />
        </div>
        <div className="peek-store-text">
          <p className="peek-title">{title}</p>
          {item.lastMessageAt && <span className="peek-sub">{timeOf(item.lastMessageAt)}</span>}
        </div>
      </div>
      <div className="peek-thread">
        {messages === null && !failed && <CircleNotch size={22} className="peek-thread-spin" aria-label="Loading messages" />}
        {failed && <p className="peek-sub peek-thread-note">Couldn’t load the messages. Open the chat to see them.</p>}
        {messages && messages.length === 0 && <p className="peek-sub peek-thread-note">No messages yet.</p>}
        {(messages || []).map((m) => (
          <div key={m.id} className={`peek-bubble ${m.senderId === currentUserId ? 'is-mine' : 'is-theirs'}`}>
            {lineOf(m)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Notification ── */

export function NotificationPeekCard({ notif, art, time }) {
  return (
    <div>
      {art && <div className="peek-notif-art">{art}</div>}
      <div className="peek-body peek-notif-body">
        {notif.title && <p className="peek-title">{notif.title}</p>}
        {notif.message && <p className="peek-text">{notif.message}</p>}
        {time && <p className="peek-sub">{time}</p>}
      </div>
    </div>
  );
}
