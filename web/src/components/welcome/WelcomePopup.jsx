import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PopArt from '../art/PopArt';
import { TONES } from '../art/FlatArt';
import useFocusTrap from '../../hooks/useFocusTrap';
import {
  ChatCircle, Money, Plus, Sparkle, Storefront, Truck, Wallet, X,
} from '../../lib/icons';
import './WelcomePopup.css';

/*
 * The welcome pop-up: a pink card with the sign-up gift box bursting out of
 * its top, two "tickets" (what every shopper gets), one button, and three
 * small promises under it. Only what is true of E-MOORM: no vouchers, no
 * peso amounts, no free shipping.
 *
 *   variant="visitor"  Home, signed out (pages/Home.jsx): "Create my account"
 *   variant="new"      just made an account (NewAccountWelcome.jsx): "Start shopping"
 *
 * onAction runs after the card has closed; onClose for ×, the backdrop and Escape.
 */

const TICKETS = [
  { key: 'cod', tone: 'pink', Icon: Money, title: 'Cash on delivery', sub: 'Pay when it arrives' },
  { key: 'fulfil', tone: 'mint', Icon: Truck, title: 'Delivery or pickup', sub: 'Choose at checkout' },
];

const PERKS = [
  { key: 'local', Icon: Storefront, lines: ['Local', 'shops'] },
  { key: 'chat', Icon: ChatCircle, lines: ['Chat with', 'sellers'] },
  { key: 'pay', Icon: Wallet, lines: ['Cash or', 'GCash'] },
];

const CLOSE_MS = 200;

const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function WelcomePopup({
  variant = 'visitor', name = '', onClose, onAction,
}) {
  const titleId = useId();
  const lineId = useId();
  const [closing, setClosing] = useState(false);
  const done = useRef(false);

  // Fade out, then hand back (the action, or a plain close).
  const finish = (then) => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    window.setTimeout(then || onClose, reducedMotion() ? 0 : CLOSE_MS);
  };
  const close = () => finish(onClose);
  const trapRef = useFocusTrap(true, { onClose: close });

  // Focus starts on the dialog itself (read out by its headline), not on
  // the button, so no focus ring greets a tap; Tab goes on from there.
  useEffect(() => {
    trapRef.current?.focus({ preventScroll: true });
  }, [trapRef]);

  // The page stays put underneath.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);

  const isNew = variant === 'new';
  const first = String(name || '').trim().split(/\s+/)[0];

  return createPortal(
    <div className={`wp-backdrop${closing ? ' is-closing' : ''}`} onClick={close}>
      <div
        ref={trapRef}
        className="wp-stack"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={lineId}
      >
        <div className="wp-card" onClick={(e) => e.stopPropagation()}>
          <div className="wp-art" aria-hidden="true">
            <PopArt name="AuthSignUp" size={168} tone={TONES.emerald} />
            <Sparkle className="wp-spark wp-spark--a" weight="fill" />
            <Sparkle className="wp-spark wp-spark--b" weight="fill" />
            <Sparkle className="wp-spark wp-spark--c" weight="fill" />
          </div>

          <h2 className="wp-kicker" id={titleId}>
            {isNew
              ? (first ? <>Welcome, <span className="wp-first-name">{first}</span>!</> : 'Welcome to E-MOORM!')
              : 'Welcome to E-MOORM'}
          </h2>
          <p className="wp-big" id={lineId}>
            {isNew ? 'Your account is ready' : 'Shop local, Mindoro-made'}
          </p>

          <div className="wp-tickets">
            {TICKETS.map(({ key, tone, Icon, title, sub }) => (
              <div key={key} className={`wp-ticket is-${tone}`}>
                <div className="wp-ticket-face">
                  <span className="wp-ticket-icon"><Icon size={18} weight="fill" /></span>
                  <strong className="wp-ticket-title">{title}</strong>
                </div>
                <span className="wp-ticket-pocket"><span>{sub}</span></span>
              </div>
            ))}
            <span className="wp-plus" aria-hidden="true"><Plus size={16} weight="bold" /></span>
          </div>

          <button type="button" className="wp-cta" onClick={() => finish(onAction || onClose)}>
            {isNew ? 'Start shopping' : 'Create my account'}
          </button>
        </div>

        <ul className="wp-perks">
          {PERKS.map(({ key, Icon, lines }) => (
            <li key={key}>
              <Icon size={22} weight="fill" aria-hidden="true" />
              <span>{lines[0]}<br />{lines[1]}</span>
            </li>
          ))}
        </ul>

        <button type="button" className="wp-close" onClick={(e) => { e.stopPropagation(); close(); }} aria-label="Close">
          <X size={20} weight="bold" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
