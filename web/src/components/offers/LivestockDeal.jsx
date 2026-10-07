import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Handshake, ChatCircleDots, Storefront, ChatCircle,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import { PriceSheet } from './DealSheets';
import { dealStatus, peso } from './offerText';
import './Offers.css';

/*
 * A live animal's way to buy: no cart and no fixed price. "Send offer"
 * opens the offer sheet; sent, the deal goes on in the chat with the seller.
 * Once there is a deal, the button says where it stands and opens the chat.
 *
 *   variant="bar"   the phone's bottom bar: Shop · Chat · Send offer
 *   variant="panel" computers: Send offer · Message seller
 */

const chatLink = (deal) => (deal?.conversationId ? `/messages?c=${deal.conversationId}` : '/messages');

export default function LivestockDeal({
  product, listPrice, cannotBuy = false, closedLabel = 'Not available', variant = 'panel', shopLogo = null, chatUnread = 0,
}) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [deal, setDeal] = useState(null);
  const [making, setMaking] = useState(false);
  const own = Boolean(user?.id && (product?.store?.owner?.id === user.id || product?.store?.ownerId === user.id));
  const productId = product?.id;

  const load = useCallback(() => {
    if (!isAuthenticated || own || !productId) return undefined;
    let live = true;
    axios.get('/offers/mine', { params: { productId, status: 'open' }, quiet: true })
      .then((res) => { if (live) setDeal(res.data?.offers?.[0] || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [isAuthenticated, own, productId]);
  useEffect(() => load(), [load]);

  const start = () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (deal) { navigate(chatLink(deal)); return; }
    setMaking(true);
  };

  const send = async (body) => {
    const res = await axios.post('/offers', { productId, ...body });
    setMaking(false);
    toast.success('Offer sent. Talk it over with the seller here.');
    navigate(chatLink(res.data));
  };

  const status = deal ? dealStatus(deal, 'buyer') : null;
  const messageSeller = product?.store ? `/messages?store=${product.store.id}` : '/messages';

  const offerButton = (className) => (
    // The seller's own listing: buyers' offers are in Seller Center › Offers.
    own ? (
      <button type="button" className={className} onClick={() => navigate('/seller/offers')}>
        <Handshake size={20} weight="fill" aria-hidden="true" />
        <span>
          See offers
          <small>Your listing</small>
        </span>
      </button>
    ) : cannotBuy && !deal ? (
      <button type="button" className={`${className} is-closed`} disabled><span>{closedLabel}</span></button>
    ) : (
      <button type="button" className={className} onClick={start}>
        {deal ? <ChatCircleDots size={20} weight="fill" aria-hidden="true" /> : <Handshake size={20} weight="fill" aria-hidden="true" />}
        <span>
          {deal ? 'Continue in chat' : 'Send offer'}
          <small>{deal ? status.label : `Asking ${peso(listPrice)} a head`}</small>
        </span>
      </button>
    )
  );

  const sheet = making && (
    <PriceSheet
      deal={{
        productId,
        name: product.name,
        image: Array.isArray(product.images) ? product.images[0] : null,
        listPrice,
        stock: product.stock,
        weightKg: product.details?.weightKg,
      }}
      onSubmit={send}
      onClose={() => setMaking(false)}
    />
  );

  if (variant === 'bar') {
    return (
      <div className="pdp-m-actionbar of-bar">
        <Link to={product?.store ? `/store/${product.store.slug}` : '/stores'} className="pdp-m-action">
          {shopLogo ? <img className="pdp-m-shoplogo" src={shopLogo} alt="" /> : <Storefront size={21} />}
          <span>Shop</span>
        </Link>
        <Link to={deal ? chatLink(deal) : messageSeller} className="pdp-m-action">
          <span className="pdp-m-action-icon">
            <ChatCircle size={21} />
            {chatUnread > 0 && <b className="pdp-m-action-badge">{chatUnread > 99 ? '99+' : chatUnread}</b>}
          </span>
          <span>Chat</span>
        </Link>
        {offerButton('of-bar-offer')}
        {sheet}
      </div>
    );
  }

  return (
    <div className="of-panel">
      {offerButton('of-make')}
      <Link to={deal ? chatLink(deal) : messageSeller} className="of-panel-chat">
        <ChatCircle size={18} aria-hidden="true" />
        Message seller
      </Link>
      <p className="of-panel-hint">
        {own
          ? 'This is your listing. Buyers make offers, and you answer them in Chat.'
          : 'No fixed price: name yours, agree in chat, meet to see the animals and pay in person.'}
      </p>
      {sheet}
    </div>
  );
}
