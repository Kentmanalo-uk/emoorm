import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChatCircleDots, Phone } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import UserAvatar from '../ui/UserAvatar';
import EmptyArt from '../ui/EmptyArt';
import {
  dealStatus, heads, peso, telHref, when,
} from './offerText';
import './Offers.css';

/*
 * Livestock deals in tabs, for the seller (Offers) or the buyer (My Offers).
 * Each deal is talked over in its chat, so a row opens it.
 */

const TABS = {
  seller: [
    { key: 'answer', label: 'To answer' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'agreed', label: 'Agreed' },
    { key: 'sold', label: 'Sold' },
    { key: 'closed', label: 'Closed' },
  ],
  buyer: [
    { key: 'talking', label: 'Talking' },
    { key: 'agreed', label: 'Agreed' },
    { key: 'sold', label: 'Bought' },
    { key: 'closed', label: 'Closed' },
  ],
};

// The tabs that ask something of this side get a count.
const NEEDS_YOU = { seller: ['answer', 'agreed'], buyer: ['talking', 'agreed'] };

// An empty tab: what is missing, then what brings the first one.
const EMPTY = {
  answer: ['No offers to answer', 'Buyers make offers on your livestock listings. New ones show up here.'],
  waiting: ['No prices waiting', 'When you answer an offer with your price, it waits here for the buyer.'],
  talking: ['No offers yet', 'On a live animal’s page, tap Make an offer and agree on the price in chat.'],
  agreed: ['No agreed deals yet', 'Deals you and the other side agree on wait here until you meet.'],
  sold: ['Nothing sold through offers yet', 'Deals marked as done after you meet show up here.'],
  closed: ['No closed deals', 'Declined and cancelled offers are kept here.'],
};

export default function DealList({ side }) {
  const navigate = useNavigate();
  const tabs = TABS[side];
  const [tab, setTab] = useState(tabs[0].key);
  const [data, setData] = useState(null);
  const chatBase = side === 'seller' ? '/seller/messages' : '/messages';

  const load = useCallback(() => axios.get(side === 'seller' ? '/offers/store' : '/offers/mine', { params: { status: tab } })
    .then((res) => setData(res.data))
    .catch((err) => { setData({ offers: [], counts: {} }); toast.error(err.message || 'Could not load the deals'); }), [side, tab]);
  useEffect(() => { load(); }, [load]);

  const offers = data?.offers || [];
  const counts = data?.counts || {};
  const chatOf = (d) => (d.conversationId ? `${chatBase}?c=${d.conversationId}` : (side === 'buyer' ? `/messages?store=${d.store?.id}` : chatBase));

  return (
    <>
      <div className="of-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`of-tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => { if (t.key !== tab) { setData(null); setTab(t.key); } }}
          >
            {t.label}
            {NEEDS_YOU[side].includes(t.key) && counts[t.key] > 0 && <b>{counts[t.key]}</b>}
          </button>
        ))}
      </div>

      {data === null ? (
        <p className="of-empty">Loading…</p>
      ) : offers.length === 0 ? (
        <div className="of-empty of-empty--art">
          <EmptyArt name="offers" size={150} />
          <strong>{EMPTY[tab][0]}</strong>
          <p>{EMPTY[tab][1]}</p>
        </div>
      ) : (
        <ul className="of-list">
          {offers.map((d) => {
            const st = dealStatus(d, side);
            const phone = side === 'buyer' ? d.sellerPhone : d.buyerPhone;
            return (
              <li key={d.id} className="of-row">
                <Link to={d.product?.slug ? `/product/${d.product.slug}` : '#'}>
                  <img className="of-row-img" src={resolveImg(d.product?.image) || '/placeholder-product.png'} alt="" />
                </Link>
                <div className="of-row-body">
                  <div className="of-row-top">
                    <span className="of-row-title">{d.product?.name}</span>
                    <span className={`of-badge is-${st.tone}`}>{st.label}</span>
                  </div>
                  {side === 'seller' ? (
                    <span className="of-row-meta of-row-buyer">
                      <UserAvatar src={d.buyer?.profilePhoto} name={d.buyer?.fullName?.[0]} imgClassName="of-mini-avatar" fallbackClassName="of-mini-avatar of-mini-avatar--fallback" />
                      {d.buyer?.fullName || 'A buyer'}
                    </span>
                  ) : (
                    <span className="of-row-meta">{d.store?.name}</span>
                  )}
                  <span className="of-row-prices">
                    {d.finalTotal != null ? (
                      <span className="of-row-total">{`${heads(d.finalQuantity)} · ${peso(d.finalTotal)} paid in person`}</span>
                    ) : (
                      <>
                        <span>{`${heads(d.quantity)} × ${peso(d.price)}`}</span>
                        <span className="of-row-total">{peso(d.total)}</span>
                        {d.price < d.listPrice && <s>{`${peso(d.listPrice)} asked`}</s>}
                      </>
                    )}
                  </span>
                  {d.meetAt && ['ACCEPTED', 'CONFIRMING'].includes(d.status) && (
                    <span className="of-row-meta">{`Meetup: ${when(d.meetAt)} · ${d.meetPlace}`}</span>
                  )}
                  <div className="of-row-actions">
                    <button type="button" className="of-btn of-btn--primary" onClick={() => navigate(chatOf(d))}>
                      <ChatCircleDots size={16} weight="fill" aria-hidden="true" />
                      Open chat
                    </button>
                    {phone && (
                      <a className="of-btn" href={telHref(phone)}>
                        <Phone size={16} weight="fill" aria-hidden="true" />
                        Call
                      </a>
                    )}
                    {d.status === 'SOLD' && d.orderId && (
                      <Link className="of-btn" to={side === 'seller' ? `/seller/orders?id=${d.orderId}` : `/profile/orders?id=${d.orderId}`}>See the order</Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
