import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowClockwise, CaretLeft, CaretRight, CaretUp, GearSix, Microphone, NotePencil, PaperPlaneTilt,
  ShoppingCart, SpeakerHigh, SpeakerSlash, Stop, Trash, WifiSlash, X,
} from '../../lib/icons';
import axios from '../../lib/axios';
import { peso } from '../../lib/format';
import { getCurrentLanguage } from '../../lib/googleTranslate';
import useAuthStore from '../../store/authStore';
import useCartStore from '../../store/cartStore';
import useFocusTrap from '../../hooks/useFocusTrap';
import { buildContext, getMoormyPage, pageTypeFor } from '../../lib/moormy/pageContext';
import { planActions, replyFor, runSteps } from '../../lib/moormy/actions';
import {
  loadTalk, saveTalk, clearTalk, loadPrefs, savePrefs,
} from '../../lib/moormy/talk';
import {
  recognitionSupported, listenOnce, hearProblem, say, stopSpeaking,
} from '../../lib/moormy/speech';
import ProductTile from '../product/ProductTile';
import MoormyFace from './MoormyFace';
import ReplyText from './ReplyText';
import MoormyVoiceSettings from './MoormyVoiceSettings';
import './Moormy.css';
import './MoormyGlobal.css';

/*
 * Moormy's panel (docs/moormy, Phases 2, 4 and 5): a conversation typed or
 * spoken, answered by the shopping engine (POST /moormy/turn) with real
 * products, comparisons, the cart and the person's orders. What she proposes
 * to do (go to a page, add to or remove from the cart) is done here, with the
 * site's own router and cart; removing asks first.
 *
 * States, shown under her name: idle, listening (the mic), thinking (the
 * server), speaking (her reply aloud), error / offline.
 */

const STARTERS = {
  product: ['Is this good for gifts?', 'Find something similar but cheaper', 'Add this to my cart'],
  search: ['Show me cheaper ones', 'Show the best-rated', 'Show more'],
  category: ['Show me cheaper ones', 'Show the best-rated', 'Show more'],
  cart: ['What’s in my cart?', 'Remove the last item', 'Take me to checkout'],
  orders: ['Where is my order?', 'Show my orders'],
  default: ['Find sweet treats under ₱100', 'Show me local products', 'Where is my order?'],
};

const STATUS = {
  idle: 'Your shopping helper',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  offline: 'You’re offline',
  error: 'Something went wrong',
};

const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Her Tagalog is left as it is by the site's page translation. */
const keepLang = (lang) => (lang === 'tl' ? { translate: 'no' } : {});
const keepClass = (lang) => (lang === 'tl' ? ' notranslate' : '');

function Cards({ cards, onPick }) {
  if (!cards?.length) return null;
  return (
    <div className="mmg-cards" onClick={(e) => { if (e.target.closest('a')) onPick?.(); }}>
      {cards.map((p) => (
        <div key={p.id} className="mmg-card"><ProductTile product={p} /></div>
      ))}
    </div>
  );
}

function Compare({ compare }) {
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

function CartSummary({ cart, onPick }) {
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

function Orders({ orders, onPick }) {
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

export default function MoormyPanel({
  open, onClose, wakeTick = 0, onWakeReady, isPhone,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [talk, setTalk] = useState(loadTalk);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [status, setStatus] = useState('idle');
  const [problem, setProblem] = useState('');
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [view, setView] = useState('chat'); // chat | settings
  const [speakingId, setSpeakingId] = useState(null);
  // Phones: after she acts on the page, a small bar instead of the sheet,
  // so the page shows and the conversation goes on (the mic is on the bar).
  const [mini, setMini] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const earRef = useRef(null); // speech recognition in progress
  const stopVoiceRef = useRef(null); // stops her reply
  const busyRef = useRef(false);
  const talkRef = useRef(talk);
  useEffect(() => { talkRef.current = talk; }, [talk]);
  const canHear = useMemo(() => recognitionSupported(), []);
  const wakeRef = useRef(null); // lib/moormy/wakeControl, once loaded

  const update = useCallback((fn) => {
    setTalk((cur) => {
      const next = fn(cur);
      saveTalk(next);
      return next;
    });
  }, []);

  const lang = talk.state?.lang || (getCurrentLanguage() === 'tl' ? 'tl' : 'en');

  // The mic of "Hey Moormy" is held off while the browser hears a request
  // or she speaks (lib/moormy/wakeControl).
  const holdEar = () => (wakeRef.current ? wakeRef.current.hold() : () => {});

  const stopVoice = useCallback(() => {
    stopVoiceRef.current?.();
    stopVoiceRef.current = null;
    stopSpeaking();
  }, []);

  const speak = useCallback((m, { force = false } = {}) => {
    if (!m?.speak) return;
    if (!force && loadPrefs().muted) return;
    stopVoice();
    const release = holdEar();
    setSpeakingId(m.id);
    stopVoiceRef.current = say(m.speak, m.lang, {
      onStart: () => setStatus((s) => (s === 'idle' || s === 'thinking' ? 'speaking' : s)),
      onEnd: () => {
        release();
        setSpeakingId((id) => (id === m.id ? null : id));
        setStatus((s) => (s === 'speaking' ? 'idle' : s));
      },
    });
  }, [stopVoice]);

  /** One turn: ask the engine, then do what it proposes. */
  const ask = useCallback(async (text, via, retryOf = null) => {
    if (busyRef.current) return;
    const question = String(text || '').trim().slice(0, 500);
    if (!question) return;
    busyRef.current = true;
    stopVoice();
    setProblem('');
    setStatus('thinking');
    const userMsg = retryOf ? null : { id: newId('u'), role: 'user', text: question, via };
    update((c) => ({
      ...c,
      messages: [...c.messages.filter((m) => !m.error), ...(userMsg ? [userMsg] : [])],
    }));
    const cartItems = useCartStore.getState().items;
    const context = buildContext({
      pathname: window.location.pathname, search: window.location.search, page: getMoormyPage(), cartItems,
    });
    const state = talkRef.current.state || (getCurrentLanguage() === 'tl' ? { lang: 'tl' } : null);
    try {
      const res = await axios.post('/moormy/turn', { text: question, state, context }, { quiet: true });
      const d = res?.data || {};
      const signedIn = useAuthStore.getState().isAuthenticated;
      const steps = planActions(d.actions, {
        signedIn, cards: d.cards, cartItems, route: context.route,
      });
      const notes = runSteps(steps, {
        cart: useCartStore.getState(),
        navigate,
        scroll: () => window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: 'smooth' }),
      });
      // Results she put on the page are not shown again in the panel.
      const onPage = steps.some((s) => s.kind === 'results');
      const confirm = steps.find((s) => s.kind === 'confirmRemove');
      const buttons = steps
        .filter((s) => s.kind === 'link' || s.kind === 'signIn')
        .map((s) => ({ to: s.to, label: s.kind === 'signIn' ? 'Sign in' : (s.label || 'Open') }));
      const words = replyFor(d, notes);
      const reply = {
        id: newId('a'),
        role: 'assistant',
        lang: words.lang,
        intent: d.intent,
        text: words.text,
        speak: words.speak,
        cards: !onPage && Array.isArray(d.cards) ? d.cards : [],
        onPage,
        compare: d.compare || null,
        cart: d.cart || null,
        orders: Array.isArray(d.orders) ? d.orders : null,
        links: Array.isArray(d.links) ? d.links.filter((l) => l?.to && l?.label) : [],
        suggestions: Array.isArray(d.suggestions) ? d.suggestions.slice(0, 4) : [],
        notes: words.notes,
        buttons,
        confirm: confirm ? { productId: confirm.productId, name: confirm.name, status: 'ask' } : null,
      };
      update((c) => ({ messages: [...c.messages, reply], state: d.state || c.state }));
      setStatus('idle');
      // Spoken to, she answers out loud; typed to, she stays quiet (a phone in
      // a jeepney should not suddenly talk). Any reply can be played.
      if (via === 'voice') speak(reply);
      // Phones: the panel covers the page, so what she did on it is shown,
      // with her in a small bar to go on talking.
      if (isPhone && steps.some((s) => ['go', 'results', 'back', 'scroll', 'choose', 'offer'].includes(s.kind))) setMini(true);
    } catch (err) {
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || (!err?.status && /network/i.test(err?.message || 'network'));
      setStatus(offline ? 'offline' : 'error');
      update((c) => ({
        ...c,
        messages: [...c.messages, {
          id: newId('e'),
          role: 'assistant',
          error: true,
          text: offline
            ? 'I can’t reach Emoorm right now. Check your connection and try again.'
            : (err?.message || 'Something went wrong. Please try again.'),
          retry: { text: question, via },
        }],
      }));
    } finally {
      busyRef.current = false;
    }
  }, [navigate, isPhone, speak, stopVoice, update]);

  const send = (e) => {
    e?.preventDefault();
    const text = draft;
    setDraft('');
    ask(text, 'text');
  };

  // ── The mic: one request by voice ──────────────────────────────────────
  const stopListening = useCallback(() => earRef.current?.stop(), []);

  const startListening = useCallback(() => {
    if (!canHear || busyRef.current || earRef.current) return;
    stopVoice();
    setProblem('');
    setInterim('');
    const release = holdEar();
    setStatus('listening');
    earRef.current = listenOnce({
      lang,
      onText: (t) => setInterim(t),
      onEnd: (error, said) => {
        earRef.current = null;
        release();
        setInterim('');
        if (said && !error) {
          setStatus('idle');
          ask(said, 'voice');
        } else if (error) {
          setStatus('error');
          setProblem(hearProblem(error));
        } else {
          setStatus('idle');
        }
      },
    });
  }, [canHear, lang, ask, stopVoice]);

  // "Hey Moormy" heard: she opens (MoormyGlobal) and listens for the request.
  const lastWake = useRef(wakeTick);
  useEffect(() => {
    if (wakeTick === lastWake.current) return;
    lastWake.current = wakeTick;
    setView('chat');
    // A moment for the panel to show, and for the wake listener to let go of the mic.
    const t = setTimeout(startListening, 250);
    return () => clearTimeout(t);
  }, [wakeTick, startListening]);

  // The wake controller, when this device has a voice (its badge in MoormyGlobal).
  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    import('../../lib/moormy/wakeControl').then((w) => {
      if (cancelled) return;
      wakeRef.current = w;
      off = onWakeReady?.(w) || (() => {});
    }).catch(() => {});
    return () => { cancelled = true; off(); };
  }, [onWakeReady]);

  // Closed: no listening, no talking.
  useEffect(() => {
    if (open) return;
    earRef.current?.abort();
    stopVoice();
    setView('chat');
    setMini(false);
    setStatus((s) => (s === 'thinking' ? s : 'idle'));
  }, [open, stopVoice]);

  // Opened: the newest turn in view, the box ready to type in (not on phones:
  // the keyboard would cover what she said).
  useEffect(() => {
    if (!open || view !== 'chat') return;
    endRef.current?.scrollIntoView({ block: 'end' });
    if (!isPhone) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, view, isPhone]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [talk.messages.length, status, open]);

  useEffect(() => () => {
    earRef.current?.abort();
    stopSpeaking();
  }, []);

  const trapRef = useFocusTrap(open && !mini, { onClose, modal: isPhone });

  const setMuted = (muted) => {
    setPrefs(savePrefs({ muted }));
    if (muted) stopVoice();
  };

  const answerRemove = (m, yes) => {
    if (yes) {
      useCartStore.getState().removeItem(m.confirm.productId);
    }
    update((c) => ({
      ...c,
      messages: c.messages.map((x) => (x.id === m.id ? {
        ...x,
        confirm: { ...x.confirm, status: yes ? 'done' : 'kept' },
      } : x)),
    }));
  };

  const newChat = () => {
    stopVoice();
    clearTalk();
    setTalk({ messages: [], state: null });
    setProblem('');
    setStatus('idle');
  };

  const pageType = pageTypeFor(location.pathname, location.search);
  const starters = STARTERS[pageType] || STARTERS.default;
  const last = [...talk.messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const busy = status === 'thinking';
  const onPick = isPhone ? onClose : undefined;

  const statusText = status === 'error' && problem ? problem : STATUS[status];

  // Phones, after she acted: her last words and the mic, over the page.
  if (isPhone && mini && open) {
    const said = [...talk.messages].reverse().find((m) => m.role === 'assistant');
    let line = said?.text || 'Ask me anything.';
    if (status === 'listening') line = interim || 'Listening…';
    else if (status === 'thinking') line = 'Thinking…';
    else if (status === 'error' && problem) line = problem;
    const hers = !['listening', 'thinking', 'error'].includes(status);
    return (
      <section className="mmg-mini" aria-label="Moormy, your shopping helper" data-status={status}>
        <button type="button" className={`mmg-face is-${status}`} onClick={() => setMini(false)} aria-label="Open the chat with Moormy">
          <MoormyFace size={34} />
        </button>
        <p
          className={`mmg-mini-text${hers ? keepClass(said?.lang) : ''}`}
          {...(hers ? keepLang(said?.lang) : {})}
          role="status"
          aria-live="polite"
        >
          {line}
        </p>
        {canHear && (
          <button
            type="button"
            className={`mmg-mic${status === 'listening' ? ' is-on' : ''}`}
            onClick={status === 'listening' ? stopListening : startListening}
            disabled={busy}
            aria-label={status === 'listening' ? 'Stop listening' : 'Talk to Moormy'}
            aria-pressed={status === 'listening'}
          >
            <Microphone size={19} weight={status === 'listening' ? 'fill' : 'regular'} />
          </button>
        )}
        <button type="button" className="mmg-icon" onClick={() => setMini(false)} aria-label="Open the chat">
          <CaretUp size={18} weight="bold" />
        </button>
        <button type="button" className="mmg-icon" onClick={onClose} aria-label="Close Moormy">
          <X size={18} weight="bold" />
        </button>
      </section>
    );
  }

  return (
    <section
      ref={trapRef}
      className={`mmg-panel${open ? ' is-open' : ''}${isPhone ? ' is-phone' : ''}`}
      role="dialog"
      aria-modal={isPhone ? 'true' : undefined}
      aria-label="Moormy, your shopping helper"
      aria-hidden={!open}
      inert={!open}
      data-status={status}
    >
      <header className="mmg-head">
        {view === 'settings' ? (
          <button type="button" className="mmg-icon" onClick={() => setView('chat')} aria-label="Back to the chat">
            <CaretLeft size={18} weight="bold" />
          </button>
        ) : null}
        <span className={`mmg-face is-${status}`}><MoormyFace size={38} /></span>
        <div className="mmg-title">
          <strong>Moormy <span className="mmy-ai-tag">AI</span></strong>
          <small className={`mmg-status is-${status}`} role="status" aria-live="polite">
            {status === 'offline' && <WifiSlash size={12} />}
            {statusText}
          </small>
        </div>
        <div className="mmg-head-tools">
          {status === 'speaking' && (
            <button type="button" className="mmg-icon is-stop" onClick={stopVoice} aria-label="Stop talking" title="Stop">
              <Stop size={16} weight="fill" />
            </button>
          )}
          <button
            type="button"
            className="mmg-icon"
            onClick={() => setMuted(!prefs.muted)}
            aria-pressed={prefs.muted}
            aria-label={prefs.muted ? 'Turn her voice on' : 'Mute her voice'}
            title={prefs.muted ? 'Voice off' : 'Voice on'}
          >
            {prefs.muted ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} />}
          </button>
          {view === 'chat' && talk.messages.length > 0 && (
            <button type="button" className="mmg-icon" onClick={newChat} aria-label="New chat" title="New chat">
              <NotePencil size={18} />
            </button>
          )}
          {view === 'chat' && (
            <button type="button" className="mmg-icon" onClick={() => setView('settings')} aria-label="Moormy settings" title="Settings">
              <GearSix size={18} />
            </button>
          )}
          <button type="button" className="mmg-icon" onClick={onClose} aria-label="Close Moormy">
            <X size={18} weight="bold" />
          </button>
        </div>
      </header>

      {view === 'settings' ? (
        <MoormyVoiceSettings
          muted={prefs.muted}
          onMuted={setMuted}
          canHear={canHear}
        />
      ) : (
        <>
          <div className="mmg-thread" role="log" aria-label="Chat with Moormy">
            {talk.messages.length === 0 && (
              <div className="mmg-hello">
                <MoormyFace size={64} />
                <strong>Hi, I’m Moormy!</strong>
                <p>Ask me to find products, compare prices, or check your cart and orders. Type, or tap the mic and talk.</p>
              </div>
            )}

            {talk.messages.map((m) => (m.role === 'user' ? (
              <div key={m.id} className="mmg-row is-self">
                <p className="mmg-bubble is-self notranslate" translate="no">
                  {m.via === 'voice' && <Microphone size={12} className="mmg-via" aria-label="Said" />}
                  {m.text}
                </p>
              </div>
            ) : (
              <div key={m.id} className={`mmg-row${m.error ? ' is-error' : ''}`}>
                <div className="mmg-reply">
                  <div className={`mmg-bubble mmy-bubble${m.error ? ' is-error' : ''}${keepClass(m.lang)}`} {...keepLang(m.lang)}>
                    <ReplyText text={m.text} />
                    {m.error && m.retry && (
                      <button type="button" className="mmy-retry" disabled={busy} onClick={() => ask(m.retry.text, m.retry.via, m)}>
                        <ArrowClockwise size={14} /> Try again
                      </button>
                    )}
                    {!m.error && m.speak && (
                      <button
                        type="button"
                        className="mmg-replay"
                        onClick={() => (speakingId === m.id ? stopVoice() : speak(m, { force: true }))}
                        aria-label={speakingId === m.id ? 'Stop' : 'Say it again'}
                        title={speakingId === m.id ? 'Stop' : 'Say it again'}
                      >
                        {speakingId === m.id ? <Stop size={12} weight="fill" /> : <SpeakerHigh size={13} />}
                      </button>
                    )}
                  </div>
                  {m.notes?.filter((n) => n.text).map((n) => (
                    <p key={`${n.kind}${n.text}`} className={`mmg-note${n.ok ? ' is-ok' : ''}`}>{n.text}</p>
                  ))}
                  <Compare compare={m.compare} />
                  <CartSummary cart={m.cart} onPick={onPick} />
                  <Orders orders={m.orders} onPick={onPick} />
                  <Cards cards={m.compare ? [] : m.cards} onPick={onPick} />
                  {m.confirm && (
                    m.confirm.status === 'ask' ? (
                      <div className="mmg-confirm" role="group" aria-label={`Remove ${m.confirm.name}?`}>
                        <button type="button" className="mmg-action is-danger" onClick={() => answerRemove(m, true)}>
                          <Trash size={14} /> Remove
                        </button>
                        <button type="button" className="mmg-action is-quiet" onClick={() => answerRemove(m, false)}>Keep it</button>
                      </div>
                    ) : (
                      <p className={`mmg-note${m.confirm.status === 'done' ? ' is-ok' : ''}`}>
                        {m.confirm.status === 'done' ? `Removed ${m.confirm.name} from your cart.` : 'Okay, I left it in your cart.'}
                      </p>
                    )
                  )}
                  {(m.buttons?.length > 0 || m.links?.length > 0) && (
                    <div className="mmg-buttons">
                      {[...(m.buttons || []), ...(m.links || [])].map((b) => (
                        <Link key={`${b.to}${b.label}`} to={b.to} className="mmg-action" onClick={onPick}>
                          {b.label} <CaretRight size={12} weight="bold" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )))}

            {busy && (
              <div className="mmg-row">
                <div className="mmg-bubble mmy-bubble mmy-typing" aria-label="Moormy is thinking"><span /><span /><span /></div>
              </div>
            )}
            {status === 'listening' && (
              <div className="mmg-row is-self">
                <p className="mmg-bubble is-self is-interim notranslate" translate="no">
                  {interim || 'Listening…'}
                </p>
              </div>
            )}

            {!busy && status !== 'listening' && (
              <div className={`mmy-chips mmg-chips${keepClass(last?.lang)}`} {...keepLang(last?.lang)}>
                {(last?.suggestions?.length ? last.suggestions : starters).map((s) => (
                  <button key={s} type="button" className="mmy-chip" onClick={() => ask(s, 'text')}>{s}</button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="mmg-composer" onSubmit={send}>
            <input
              ref={inputRef}
              value={status === 'listening' ? interim : draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={status === 'listening' ? 'Listening…' : 'Ask Moormy…'}
              aria-label="Ask Moormy"
              maxLength={500}
              enterKeyHint="send"
              readOnly={status === 'listening'}
              className="notranslate"
              translate="no"
            />
            {canHear && (
              <button
                type="button"
                className={`mmg-mic${status === 'listening' ? ' is-on' : ''}`}
                onClick={status === 'listening' ? stopListening : startListening}
                disabled={busy}
                aria-label={status === 'listening' ? 'Stop listening' : 'Talk to Moormy'}
                aria-pressed={status === 'listening'}
                title={status === 'listening' ? 'Stop' : 'Talk'}
              >
                <Microphone size={19} weight={status === 'listening' ? 'fill' : 'regular'} />
              </button>
            )}
            <button type="submit" className="mmg-send" disabled={busy || !draft.trim() || status === 'listening'} aria-label="Send">
              <PaperPlaneTilt size={18} weight="fill" />
            </button>
          </form>
          {canHear && status === 'listening' && (
            <p className="mmg-privacy">Your words go to your browser’s speech service to be turned into text.</p>
          )}
        </>
      )}
    </section>
  );
}
