import { useEffect, useRef } from 'react';
import {
  Clock, Heart, Moped, Receipt, TrendUp, Wallet,
} from '@phosphor-icons/react';
import AppLogo from '../AppLogo';
import './AuthHero.css';

const SCENES = {
  buyer: {
    main: { src: '/assets/vegetables.jpg', name: 'Fresh broccoli', town: 'Naujan' },
    pill: { Icon: Clock, text: 'Ready today' },
    back: '/assets/handicrafts.jpg',
    round: '/assets/snacks.jpg',
    note: { Icon: Moped, title: 'On the way', sub: 'Delivered to your barangay' },
    sticker: Heart,
    lead: 'Fresh finds from',
    highlight: 'Mindoro.',
  },
  seller: {
    main: { src: '/assets/handicrafts.jpg', name: 'Woven bilao', town: 'Bongabong' },
    pill: { Icon: Receipt, text: 'New order' },
    back: '/assets/vegetables.jpg',
    round: '/assets/snacks.jpg',
    note: { Icon: Wallet, title: 'Payment received', sub: 'Straight to your GCash' },
    sticker: TrendUp,
    lead: 'Sell to all of',
    highlight: 'Mindoro.',
  },
};

/** The card behind, the main card and the round piece of a scene. */
function shopPieces(v) {
  const { Icon: PillIcon } = v.pill;
  return {
    back: (
      <div className="auth-card auth-card-back">
        <img className="auth-card-img" src={v.back} alt="" draggable="false" />
      </div>
    ),
    main: (
      <div className="auth-card auth-card-main">
        <div className="auth-story">
          <span className="is-done" />
          <span className="is-now" />
          <span />
        </div>
        <div className="auth-card-head">
          <AppLogo className="auth-card-avatar" alt="" />
          <span className="auth-card-title">
            <strong>{v.main.name}</strong>
            <span>{v.main.town}, Oriental Mindoro</span>
          </span>
        </div>
        <div className="auth-card-photo">
          <img className="auth-card-img" src={v.main.src} alt="" draggable="false" />
        </div>
        <span className="auth-pill"><PillIcon size={14} weight="bold" />{v.pill.text}</span>
      </div>
    ),
    round: (
      <span className="auth-round">
        <span className="auth-round-clip"><img src={v.round} alt="" draggable="false" /></span>
      </span>
    ),
  };
}

/**
 * Left side of the computer Log in / Sign up pages: a few shop cards and
 * the headline. The pieces follow the mouse at different depths
 * (the main card tilts toward it) and stay still otherwise, on touch screens
 * and for reduced motion. The seller log in has its own products, notes and
 * gold accent. Decorative only; hidden on phones.
 */
export default function AuthHero({ seller = false }) {
  const kind = seller ? 'seller' : 'buyer';
  const v = SCENES[kind];
  const heroRef = useRef(null);
  const { Icon: NoteIcon } = v.note;
  const Sticker = v.sticker;
  const pieces = shopPieces(v);

  // The pointer's place on the page, -1..1 each way, as --px / --py.
  useEffect(() => {
    const el = heroRef.current;
    const media = window.matchMedia?.('(pointer: fine) and (prefers-reduced-motion: no-preference)');
    if (!el || !media?.matches) return undefined;
    let frame = 0;
    const set = (x, y) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    const onMove = (e) => set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    const onLeave = () => set(0, 0);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={heroRef} className={`auth-hero is-${kind}`}>
      <div className="auth-stage" aria-hidden="true">
        <div className="auth-layer" style={{ '--depth': 6 }}>
          <span className="auth-glow" />
        </div>

        <div className="auth-layer" style={{ '--depth': 14 }}>{pieces.back}</div>

        <div className="auth-layer auth-layer-main" style={{ '--depth': 8 }}>{pieces.main}</div>

        <div className="auth-layer" style={{ '--depth': 22 }}>{pieces.round}</div>

        <div className="auth-layer" style={{ '--depth': 28 }}>
          <div className="auth-note">
            <span className="auth-note-icon"><NoteIcon size={26} weight="fill" /></span>
            <span className="auth-note-text">
              <strong>{v.note.title}</strong>
              <span>{v.note.sub}</span>
            </span>
          </div>
        </div>

        <div className="auth-layer" style={{ '--depth': 22 }}>
          <span className="auth-sticker"><Sticker size={26} weight="fill" /></span>
        </div>
      </div>

      <h1 className="auth-hero-title">
        {v.lead}
        <span>{v.highlight}</span>
      </h1>
    </div>
  );
}
