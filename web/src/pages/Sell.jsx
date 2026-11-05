import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useSeo from '../lib/seo';
import {
  ArrowRight, Plus, Minus, House, PlayCircle, GraduationCap, Lifebuoy, Check, Heart,
  Package, ClipboardText, ChatCircleDots, User,
} from '../lib/icons';
import useAuthStore from '../store/authStore';
import { usePhoneLayout } from '../hooks/useMobileNav';
import useAccountSwitchStore from '../store/accountSwitchStore';
import { useCategories, useMunicipalities } from '../hooks/useReferenceData';
import { queryKeys, policy } from '../lib/queryKeys';
import Footer from '../components/layout/Footer';
import AppLogo from '../components/AppLogo';
import DraggableMascot from '../components/avatars/DraggableMascot';
import CategoryIcon from '../components/CategoryIcon';
import { ShopLogoArt } from '../components/shop/ShopArt';
import axios from '../lib/axios';
import { resolveImg, srcSetFor } from '../lib/media';
import './Sell.css';

/*
 * /sell: why and how to open a shop on Emoorm.
 *
 * Built around Emoorm's own mark, white on the brand green, with one thing
 * at the centre: the Seller Center on a phone, a new order arriving. Each
 * section has its own composition (giant numbers, benefits shown as the
 * thing a seller sees: a receipt, the barangays they deliver to, a buyer's
 * message; a timeline; a moving ribbon of what Mindoro sells), in the order
 * Lazada's seller page answers questions: what is in it for me, how, what,
 * who helps. The numbers, categories and shops are the live ones.
 */

/* Each step with the screen it happens on (the Seller Academy's shots). */
const STEPS = [
  { title: 'Create your account', desc: 'With your email or Google.', time: 'About 2 min', shot: '/tutorial/register.webp' },
  { title: 'Register your shop', desc: 'Shop name, your town, how you deliver, a valid ID.', time: 'About 5 min', shot: '/tutorial/apply.webp' },
  { title: 'List your products', desc: 'Photos, prices, stock. Add more any time.', time: 'A few minutes each', shot: '/tutorial/form-basics.webp' },
  { title: 'Start selling', desc: 'Your town’s admin approves your shop.', time: '1–2 business days', shot: '/tutorial/seller-orders.webp' },
];

/* Answers match how the platform works; see the site footer. */
const FAQS = [
  { q: 'How much does it cost to sell?', a: 'Nothing. Opening a shop and listing products is free, and Emoorm takes no commission on your sales.' },
  { q: 'How do I get paid?', a: 'Buyers pay you directly: cash on delivery, GCash or QR Ph, depending on what you accept. Emoorm does not process or hold payments, so there is no payout waiting period.' },
  { q: 'How long does approval take?', a: 'An administrator for your municipality reviews each application, usually within 1 to 2 business days. You are notified once your shop is live.' },
  { q: 'Do I have to deliver?', a: 'No. You choose the barangays you deliver to, and you can offer pickup from your shop instead of, or alongside, delivery.' },
  { q: 'What about returns?', a: 'A buyer can ask to return an item within 7 days if it arrives damaged, wrong, incomplete or not as described, unless your own return policy says otherwise. You review each request.' },
  { q: 'Can I sell and buy with the same account?', a: 'Yes. Your account switches between your personal profile and your Seller Center, and your shopping stays private.' },
];

const HELP = [
  { icon: PlayCircle, label: 'Watch how selling works', note: '3 min', to: '/sell/tutorial' },
  { icon: GraduationCap, label: 'Seller Academy', note: 'Free lessons', to: '/sell/academy' },
  { icon: Lifebuoy, label: 'Help Centre', note: 'A real person answers', to: '/help' },
];

const BARANGAYS = [
  ['Calapan', true], ['Baco', true], ['Naujan', false], ['Victoria', true],
  ['Socorro', false], ['Pola', true], ['Pinamalayan', false], ['Gloria', false],
];

const PRODUCE = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=320&q=70';
const SHOWN_SHOPS = 8;

/* iOS's status bar glyphs: signal, Wi-Fi, battery. */
function StatusGlyphs() {
  return (
    <span className="sl-status-glyphs">
      <svg viewBox="0 0 18 12" width="17" height="11"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
      <svg viewBox="0 0 16 12" width="15" height="11"><path d="M8 11.6 5.6 9.1a3.4 3.4 0 0 1 4.8 0Z" /><path d="M8 4.6c1.9 0 3.6.7 4.9 2l-1.4 1.5a4.9 4.9 0 0 0-7 0L3.1 6.6A6.9 6.9 0 0 1 8 4.6Z" /><path d="M8 0c3.2 0 6.1 1.3 8 3.3l-1.4 1.5A9 9 0 0 0 8 2 9 9 0 0 0 1.4 4.8L0 3.3A11 11 0 0 1 8 0Z" /></svg>
      <svg viewBox="0 0 27 12" width="25" height="11"><rect x="0.5" y="0.5" width="22" height="11" rx="3.4" fill="none" stroke="currentColor" opacity="0.4" /><rect x="2" y="2" width="15.5" height="8" rx="2" /><path d="M24 4v4a2 2 0 0 0 0-4Z" opacity="0.45" /></svg>
    </span>
  );
}

/* The Seller Center on a recent iPhone Pro (titanium frame, Dynamic Island,
   side buttons), a new order dropping in as an iOS banner now and then.
   It turns to face you and comes closer (Sell.css): on phones as the page
   scrolls, from the top of the page until the phone nears the top of the
   screen; on computers on hover, in CSS.

   On phones the browser runs it, tied to the scroll (a scroll-driven
   animation, off the main thread); this only measures where it ends
   (--zoom-end) when the layout changes. Browsers without that get --zoom
   from a scroll listener instead, once a frame. */
const SCROLL_DRIVEN = typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()');

function PhoneScene({ followScroll }) {
  const sceneRef = useRef(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!followScroll || !scene) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    // Done once the scene's top is a fifth of the way down the screen.
    const span = () => Math.max(120, scene.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.2);

    if (SCROLL_DRIVEN) {
      const measure = () => scene.style.setProperty('--zoom-end', `${Math.round(span())}px`);
      measure();
      // The headline above can rewrap (fonts arriving, rotating the phone).
      const observer = new ResizeObserver(measure);
      observer.observe(scene.parentElement);
      window.addEventListener('resize', measure);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', measure);
        scene.style.removeProperty('--zoom-end');
      };
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const t = Math.min(1, Math.max(0, window.scrollY / span()));
      // Eased in and out, so it settles rather than stops.
      scene.style.setProperty('--zoom', (t * t * (3 - 2 * t)).toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      scene.style.removeProperty('--zoom');
    };
  }, [followScroll]);

  return (
    <div className="sl-scene" aria-hidden="true" ref={sceneRef}>
      <img className="sl-scene-mark" src="/brand-icon-white.svg" alt="" />
      <span className="sl-scene-sun" />
      <div className="sl-iphone">
        <span className="sl-iphone-btn sl-iphone-btn--action" />
        <span className="sl-iphone-btn sl-iphone-btn--vol-up" />
        <span className="sl-iphone-btn sl-iphone-btn--vol-down" />
        <span className="sl-iphone-btn sl-iphone-btn--side" />
        <span className="sl-iphone-btn sl-iphone-btn--camera" />
        <div className="sl-iphone-bezel">
          <div className="sl-phone-screen">
            <div className="sl-status">
              <span className="sl-status-time">9:41</span>
              <StatusGlyphs />
            </div>
            <span className="sl-island"><i /></span>
            <div className="sl-toast">
              <span className="sl-toast-icon"><img src="/brand-icon-white.svg" alt="" /></span>
              <span className="sl-toast-text">
                <span className="sl-toast-head"><b>EMOORM</b><small>now</small></span>
                <span><b>New order</b> · Bibingka × 4 · ₱240</span>
              </span>
            </div>
            <span className="sl-glass" />
            <span className="sl-home-bar" />
          <div className="sl-app-top">
            <AppLogo className="sl-app-logo" alt="" />
            <span>Seller Center</span>
          </div>
          <p className="sl-app-hi">Good morning, Ana</p>
          <div className="sl-app-today">
            <span className="sl-app-label">Earned today</span>
            <span className="sl-app-amount">₱1,240</span>
            <span className="sl-app-bars">
              {[38, 55, 42, 70, 58, 86, 100].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
            </span>
          </div>
          <p className="sl-app-section">To pack</p>
          {[['Biko', '2 bilao', '0% 40%'], ['Suman sa ibos', '10 pcs', '60% 70%'], ['Kalamay', '3 jars', '90% 20%'], ['Turon', '12 pcs', '30% 90%']].map(([name, qty, pos]) => (
            <div key={name} className="sl-app-row">
              <span className="sl-app-thumb" style={{ backgroundImage: `url(${PRODUCE})`, backgroundPosition: pos }} />
              <span className="sl-app-name">{name}<small>{qty}</small></span>
              <span className="sl-app-pack">Pack</span>
            </div>
          ))}
            <nav className="sl-app-tabs">
              {[[House, 'Home', true], [Package, 'Products'], [ClipboardText, 'Orders'], [ChatCircleDots, 'Chat'], [User, 'Me']].map(([Icon, label, on]) => (
                <span key={label} className={on ? 'is-on' : ''}><Icon size={20} weight={on ? 'fill' : 'regular'} />{label}</span>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sell() {
  useSeo({
    title: 'Sell on E-MOORM — Reach customers across Oriental Mindoro',
    description: 'Open a shop on E-MOORM and sell to customers across Oriental Mindoro. '
      + 'Free to start, approved by your municipal administrator.',
    path: '/sell',
  });

  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const isPhone = usePhoneLayout();
  const startAccountSwitch = useAccountSwitchStore((s) => s.start);
  const isSeller = isAuthenticated && user?.role === 'SELLER';
  useEffect(() => {
    if (isSeller) startAccountSwitch('seller', '/seller', { replace: true });
  }, [isSeller, startAccountSwitch]);
  const [openFaq, setOpenFaq] = useState(0);


  // The live catalogue and towns (usually already in the page: lib/boot).
  const { categories } = useCategories();
  const { municipalities } = useMunicipalities();
  // The same request, and cached answer, as the footer's shop list.
  const { data: shops = [] } = useQuery({
    queryKey: queryKeys.stores({ page: 1, pageSize: 12 }),
    queryFn: async () => (await axios.get('/stores', { params: { page: 1, pageSize: 12 } })).data || [],
    ...policy.publicContent,
  });
  const shownShops = shops.filter((s) => s.logo).slice(0, SHOWN_SHOPS);

  const isPending = isAuthenticated && user?.sellerApplicationStatus === 'PENDING';

  // The waving mascot (on the graphics card, so it never slows the scroll)
  // is held still while it is off screen, so a phone does no work for it.
  const mascotRef = useRef(null);
  useEffect(() => {
    const el = mascotRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(([entry]) => el.toggleAttribute('data-still', !entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [isPending]);

  // The three "why" pictures play a little scene on hover (Sell.css). A
  // phone has no hover: there each plays as it comes well into view, and
  // again the next time it does.
  useEffect(() => {
    if (!window.matchMedia('(hover: none)').matches) return undefined;
    const arts = document.querySelectorAll('.sl-feature-art');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.intersectionRatio >= 0.6) e.target.classList.add('is-live');
        else if (!e.isIntersecting) e.target.classList.remove('is-live');
      });
    }, { threshold: [0, 0.6] });
    arts.forEach((a) => observer.observe(a));
    return () => observer.disconnect();
  }, []);
  const ctaLabel = isPending ? 'Application pending' : isAuthenticated ? 'Apply to sell' : 'Start selling';
  const handleCTA = () => {
    if (isPending) return;
    navigate(isAuthenticated ? '/seller/apply' : '/register?redirect=/seller/apply');
  };

  // Sellers already have a shop: this page switches them to it instead. The
  // return sits below every hook (a changing hook count is a render error).
  if (isSeller) return null;

  const towns = municipalities.length || 15;
  // The ribbon needs enough items to run past the screen edge: repeated.
  const ribbon = categories.length ? Array.from({ length: Math.ceil(12 / categories.length) }, () => categories).flat() : [];

  return (
    <div className="sl">
      <header className="sl-header">
        <div className="sl-wrap sl-header-inner">
          <Link to="/" className="sl-logo" aria-label="Emoorm home">
            <img src="/brand-icon-white.svg" alt="" className="sl-logo-img" />
            <span>emoorm</span>
            <em>for sellers</em>
          </Link>
          <nav className="sl-nav" aria-label="On this page">
            <a href="#why">Why Emoorm</a>
            <a href="#steps">How it works</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="sl-header-actions">
            {!isAuthenticated && <Link to="/seller/login" className="sl-header-login">Log in</Link>}
            <button type="button" className="sl-btn sl-btn--light sl-btn--small" onClick={handleCTA} disabled={isPending}>
              {ctaLabel}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* The promise, and the Seller Center at work. */}
        <section className="sl-hero">
          <div className="sl-wrap sl-hero-grid">
            <div className="sl-hero-copy">
              <h1 className="sl-h1">
                Your stall,<br />
                open to all of<br />
                <span>Oriental Mindoro.</span>
              </h1>
              <p className="sl-hero-sub">
                Farmers, fisherfolk, cooks and makers sell on Emoorm to buyers in every town,
                for free. You set the prices, the delivery and the payment.
              </p>
              <div className="sl-hero-actions">
                {/* One of the avatars' creatures, sitting on the button's
                    edge and waving the visitor to it. */}
                <span className="sl-cta-wrap">
                  <button type="button" className="sl-btn sl-btn--light" onClick={handleCTA} disabled={isPending}>
                    {ctaLabel} {!isPending && <ArrowRight size={17} weight="bold" />}
                  </button>
                  {!isPending && (
                    <span className="sl-mascot" aria-hidden="true" ref={mascotRef}>
                      <span className="sl-mascot-say">Tara! It&apos;s free</span>
                      <DraggableMascot size={72} />
                    </span>
                  )}
                </span>
                {isPending ? (
                  <span className="sl-hero-note">Your application is being reviewed (1–2 business days).</span>
                ) : (
                  <Link to="/sell/tutorial" className="sl-hero-watch">
                    <PlayCircle size={22} weight="fill" /> See how it works <small>3 min</small>
                  </Link>
                )}
              </div>
            </div>
            <PhoneScene followScroll={isPhone} />
          </div>
        </section>

        {/* Three numbers, as big as they matter. */}
        <section className="sl-numbers" aria-label="Selling on Emoorm in numbers">
          <div className="sl-wrap sl-numbers-row">
            <p><strong>₱0</strong><span>to open your shop</span></p>
            <p><strong>0%</strong><span>commission on what you sell</span></p>
            <p><strong>{towns}</strong><span>towns and cities of buyers</span></p>
          </div>
        </section>

        {/* Why: each reason shown as the thing a seller sees. */}
        <section id="why" className="sl-why">
          <div className="sl-wrap">
            <div className="sl-feature">
              <div className="sl-feature-copy">
                <h2 className="sl-h2">Keep every peso.</h2>
                <p>
                  No listing fee, no monthly fee, no cut of your sales. Buyers pay you directly by
                  cash on delivery, GCash or QR Ph, and Emoorm never holds your money.
                </p>
              </div>
              <div className="sl-feature-art" aria-hidden="true">
                <div className="sl-receipt">
                  <p className="sl-receipt-head">Order #EM-2417 <span>Paid to you</span></p>
                  <p><span>Bibingka × 4</span><span>₱240.00</span></p>
                  <p><span>Delivery · Calapan</span><span>₱30.00</span></p>
                  <p className="sl-receipt-fee"><span>Emoorm fee</span><span>₱0.00</span></p>
                  <p className="sl-receipt-total"><span>You receive</span><span>₱270.00</span></p>
                  <span className="sl-receipt-stamp"><b>₱0</b>fee</span>
                </div>
              </div>
            </div>

            <div className="sl-feature sl-feature--flip">
              <div className="sl-feature-copy">
                <h2 className="sl-h2">Deliver where you want.</h2>
                <p>
                  Pick the barangays you serve and your own fee, or let buyers pick up at your
                  stall. Change it any day; your shop follows.
                </p>
              </div>
              <div className="sl-feature-art" aria-hidden="true">
                <div className="sl-areas">
                  {BARANGAYS.map(([name, on], i) => (
                    <span key={name} className={on ? 'is-on' : ''} style={{ '--i': i }}>{on && <Check size={14} weight="bold" />}{name}</span>
                  ))}
                  <span className="sl-areas-pickup"><i /> Pickup at my stall</span>
                </div>
              </div>
            </div>

            <div className="sl-feature">
              <div className="sl-feature-copy">
                <h2 className="sl-h2">Talk to your buyers.</h2>
                <p>
                  Confirm sizes, reserve a batch, agree on a time. Buyers message your shop
                  before and after they order, and every chat stays with the order.
                </p>
              </div>
              <div className="sl-feature-art" aria-hidden="true">
                <div className="sl-chat">
                  <p className="sl-chat-in" style={{ '--i': 0 }}>Pwede pa-reserve ng 2 bilao na biko para bukas?</p>
                  <p className="sl-chat-out" style={{ '--i': 1 }}>
                    Opo! Ready po by 3pm. Pickup or deliver?
                    <span className="sl-chat-heart"><Heart size={13} weight="fill" /></span>
                  </p>
                  <p className="sl-chat-in" style={{ '--i': 2 }}>Deliver po, Brgy. Lazareto 🙏</p>
                  <p className="sl-chat-typing" aria-hidden="true"><i /><i /><i /></p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How: a timeline, each step over the top half of a phone showing
            its screen, fading out where the step begins. */}
        <section id="steps" className="sl-steps">
          <div className="sl-wrap">
            <h2 className="sl-h2">Open your shop in four steps.</h2>
            <p className="sl-steps-sub">About ten minutes on your phone or computer. Nothing to print or mail.</p>
            <ol className="sl-timeline">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <div className="sl-shot" aria-hidden="true">
                    <div className="sl-shot-phone">
                      <div className="sl-shot-screen">
                        <div className="sl-status">
                          <span className="sl-status-time">9:41</span>
                          <StatusGlyphs />
                        </div>
                        <span className="sl-island"><i /></span>
                        <img src={s.shot} alt="" width="720" height="1558" loading="lazy" decoding="async" />
                      </div>
                    </div>
                  </div>
                  <span className="sl-timeline-n">{i + 1}</span>
                  <p className="sl-timeline-title">{s.title}</p>
                  <p className="sl-timeline-desc">{s.desc}</p>
                  <p className="sl-timeline-time">{s.time}</p>
                </li>
              ))}
            </ol>
            <button type="button" className="sl-btn sl-btn--brand" onClick={handleCTA} disabled={isPending}>
              {ctaLabel} {!isPending && <ArrowRight size={17} weight="bold" />}
            </button>
          </div>
        </section>

        {/* What: the live categories, moving. */}
        {ribbon.length > 0 && (
          <section className="sl-sell">
            <div className="sl-wrap">
              <h2 className="sl-h2">Sell what Mindoro<br />grows, catches and makes.</h2>
            </div>
            <div className="sl-ribbon" aria-label="Categories you can sell in">
              {[0, 1].map((row) => (
                <div key={row} className={`sl-ribbon-row${row ? ' is-reverse' : ''}`}>
                  <div className="sl-ribbon-track">
                    {[...ribbon, ...ribbon].map((c, i) => (
                      <Link key={`${c.id}-${i}`} to={`/category/${c.slug}`} className="sl-ribbon-item" tabIndex={i < ribbon.length ? 0 : -1} aria-hidden={i >= ribbon.length}>
                        <span className="sl-ribbon-art">
                          {c.image
                            ? <img src={resolveImg(c.image)} srcSet={srcSetFor(c.image)} sizes="48px" alt="" loading="lazy" decoding="async" />
                            : <CategoryIcon category={c} size={26} />}
                        </span>
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Who: real shops, once there are a few to show. */}
        {shownShops.length >= 4 && (
          <section className="sl-shops">
            <div className="sl-wrap sl-shops-inner">
              <h2 className="sl-shops-title">Already selling here</h2>
              <ul>
                {shownShops.map((s) => (
                  <li key={s.id}>
                    <Link to={`/store/${s.slug}`} title={s.name}>
                      {s.logo
                        ? <img src={resolveImg(s.logo)} srcSet={srcSetFor(s.logo)} sizes="56px" alt={s.name} loading="lazy" decoding="async" />
                        : <ShopLogoArt name={s.name} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Questions, and where to learn more. */}
        <section id="faq" className="sl-faq">
          <div className="sl-wrap sl-faq-grid">
            <div>
              <h2 className="sl-h2">Questions sellers ask.</h2>
              <ul className="sl-help">
                {HELP.map(({ icon: Icon, label, note, to }) => (
                  <li key={label}>
                    <Link to={to}><Icon size={22} weight="fill" /> <span>{label}<small>{note}</small></span> <ArrowRight size={16} /></Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sl-faq-list">
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q} className={`sl-faq-item${open ? ' is-open' : ''}`}>
                    <button type="button" aria-expanded={open} onClick={() => setOpenFaq(open ? -1 : i)}>
                      <span>{f.q}</span>
                      {open ? <Minus size={18} /> : <Plus size={18} />}
                    </button>
                    {/* Kept in the page, collapsed by a grid row, so it animates. */}
                    <div className="sl-faq-a" aria-hidden={!open}><div><p>{f.a}</p></div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="sl-close">
          <img className="sl-close-mark" src="/brand-icon-white.svg" alt="" aria-hidden="true" />
          <div className="sl-wrap">
            <h2>Your buyers are already here.</h2>
            <div className="sl-close-actions">
              <button type="button" className="sl-btn sl-btn--light" onClick={handleCTA} disabled={isPending}>
                {ctaLabel} {!isPending && <ArrowRight size={17} weight="bold" />}
              </button>
              {!isAuthenticated && <Link to="/seller/login" className="sl-close-login">Already selling? Log in</Link>}
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Phones: this page has no bottom bar, so a way back to shopping stays in reach. */}
      {isPhone && (
        <nav aria-label="Back to shopping">
          <Link to="/" className="sell-home-fab" aria-label="Back to home">
            <House size={20} weight="fill" aria-hidden="true" />
            <span>Home</span>
          </Link>
        </nav>
      )}
    </div>
  );
}
