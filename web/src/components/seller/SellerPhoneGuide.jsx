import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useFocusTrap from '../../hooks/useFocusTrap';
import useAccountSwitchStore from '../../store/accountSwitchStore';
import { completeGuide, shouldShowGuide } from '../../lib/sellerGuides';
import SellerGuideArt from './SellerGuideArt';
import './SellerPhoneGuide.css';

/**
 * Phones: the first time a shop opens a Seller Center page, a small sheet
 * rises with a picture of what the page is for, a title and a line or two.
 * One sheet per page, saved on the shop like the computer tours (the same
 * keys, so a page toured on one device is done on the other).
 */
const PAGES = {
  '/seller': {
    key: 'dashboard',
    art: 'home',
    title: 'Your shop at a glance',
    text: 'Orders waiting, today\'s sales and tips show here first. The shop tools below take you everywhere else.',
  },
  '/seller/products': {
    art: 'products',
    title: 'Your products',
    text: 'Everything you sell, with its stock and status. Tap Add product to list something new.',
  },
  '/seller/products/new': {
    art: 'newProduct',
    title: 'Add a product',
    text: 'Answer a few easy questions, one step at a time: name, photos and price first, then the details for your kind of product. Check how buyers will see it, then save.',
  },
  '/seller/today': {
    art: 'today',
    title: "Today's menu",
    text: 'Post fresh food or harvests with how many you have and until when. Buyers order until it ends or sells out; you confirm each order quickly.',
  },
  '/seller/orders': {
    art: 'orders',
    title: 'Orders, step by step',
    text: 'Each tab is a step. Every order shows one button for what to do next, and the buyer is told as it moves on.',
  },
  '/seller/returns': {
    art: 'returns',
    title: 'Returns & refunds',
    text: 'Look over a buyer\'s request, confirm the parcel when it comes back, then record the refund.',
  },
  '/seller/messages': {
    art: 'messages',
    title: 'Chat with buyers',
    text: 'Questions about products, delivery and orders arrive here. Quick, kind replies bring buyers back.',
  },
  '/seller/assistant': {
    art: 'assistant',
    title: 'Ask Ate Moormy',
    text: 'Not sure how something works? Ask in English or Tagalog and she will walk you through it.',
  },
  '/seller/marketing': {
    art: 'marketing',
    title: 'Bring buyers in',
    text: 'Announce news to your followers, promote a product or share your shop link.',
  },
  '/seller/decorate': {
    art: 'decorate',
    title: 'Decorate your shop',
    text: 'Choose what buyers see first on your shop page and how it looks.',
  },
  '/seller/menu': {
    art: 'menu',
    title: 'Everything about your shop',
    text: 'Shop health, earnings, delivery and payment, help and settings, all in one list.',
  },
  '/seller/store': {
    art: 'store',
    title: 'Your shop profile',
    text: 'Name, logo, banner and description: what buyers see. Tap a row to change just that part.',
  },
  '/seller/fulfillment': {
    art: 'fulfillment',
    title: 'Delivery & payment',
    text: 'Delivery, pickup or both, where you deliver and for how much, and how buyers pay you.',
  },
  '/seller/analytics': {
    art: 'analytics',
    title: 'How your shop is doing',
    text: 'Sales, orders and best sellers over time, so you know what to restock and promote.',
  },
  '/seller/finance': {
    art: 'finance',
    title: 'Your earnings',
    text: 'Money from completed orders, kept apart from orders still on the way. Download it anytime.',
  },
  '/seller/reviews': {
    art: 'reviews',
    title: 'Buyer reviews',
    text: 'Read what buyers say and reply. Replies are public, so keep them helpful and kind.',
  },
  '/seller/questions': {
    art: 'questions',
    title: 'Buyer questions',
    text: 'Answer questions about your products. Answers show on the product page for the next buyer too.',
  },
  '/seller/notifications': {
    art: 'notifications',
    title: 'Shop notifications',
    text: 'New orders, messages, reviews and news from Emoorm, all in one place.',
  },
  '/seller/support': {
    art: 'support',
    title: 'Your municipal admin',
    text: 'Talk to your town\'s admin about your shop, your verification or anything you need help with.',
  },
  '/seller/settings': {
    art: 'settings',
    title: 'Shop settings',
    text: 'Account-level controls for your shop, separate from your public shop profile.',
  },
};

const OPEN_DELAY_MS = 600;
const CLOSE_MS = 220;

export default function SellerPhoneGuide({ store, setStore }) {
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const page = PAGES[path];
  const guideKey = page?.key || path;
  // Sent by a link to one part of the page to do one thing: the sheet waits
  // for a later visit. Nor does it open under the account switch.
  const focused = Boolean(location.hash);
  const switching = useAccountSwitchStore((s) => Boolean(s.request));
  const eligible = Boolean(page) && shouldShowGuide(store, guideKey) && !focused && !switching;

  // { key, closing } for the sheet on screen.
  const [shown, setShown] = useState(null);
  const open = Boolean(shown && shown.key === guideKey);
  const trapRef = useFocusTrap(open && !shown.closing);

  useEffect(() => {
    if (!eligible) return undefined;
    const timer = setTimeout(() => setShown({ key: guideKey, closing: false }), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eligible, guideKey]);

  const close = () => {
    if (!open || shown.closing) return;
    completeGuide(guideKey, setStore);
    setShown({ key: guideKey, closing: true });
    setTimeout(() => setShown(null), CLOSE_MS);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  return (
    <div className={`spg${shown.closing ? ' is-closing' : ''}`}>
      <button type="button" className="spg-backdrop" aria-label="Close" tabIndex={-1} onClick={close} />
      <section className="spg-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="spg-title" aria-describedby="spg-text">
        <span className="spg-handle" aria-hidden="true" />
        <SellerGuideArt name={page.art} className="spg-art" />
        <h2 id="spg-title" className="spg-title">{page.title}</h2>
        <p id="spg-text" className="spg-text">{page.text}</p>
        <button type="button" className="spg-ok" onClick={close}>Got it</button>
      </section>
    </div>
  );
}
