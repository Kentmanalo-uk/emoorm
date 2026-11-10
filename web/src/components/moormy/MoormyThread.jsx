import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowClockwise, CaretLeft, CaretRight, Microphone, NotePencil, PaperPlaneTilt, Question, Translate,
} from '../../lib/icons';
import axios from '../../lib/axios';
import { getCurrentLanguage } from '../../lib/googleTranslate';
import { setMoormyChat, useMoormyChat } from '../../lib/moormyChat';
import useCartStore from '../../store/cartStore';
import { buildContext } from '../../lib/moormy/pageContext';
import { planActions, replyFor, runSteps } from '../../lib/moormy/actions';
import {
  Cards, Compare, CartSummary, Orders,
} from './MoormyAnswer';
import MoreMenu from '../MoreMenu';
import ReplyText from './ReplyText';
import MoormyAvatar from './MoormyAvatar';
import MoormyVoiceSheet from './MoormyVoiceSheet';
import { speechWakeSupported } from '../../lib/moormy/wake/speechWake';
import './Moormy.css';

/*
 * The buyer's chat with Moormy, in the Messages thread pane: the same
 * Moormy as the floating one (POST /moormy/turn: finding products, cheaper,
 * comparing, the cart, orders, how-to questions), in English or Tagalog.
 *
 * Typed chat: she never moves the page from here (the owner's rule); places
 * and results come as links, products as cards to tap. Adding to the cart
 * happens in place; removing asks first.
 */

// Shopping things to ask, beside the how-to questions of the intro.
const STARTERS = {
  en: ['Find pasalubong under ₱200', 'Show me fresh vegetables', "What's in my cart?"],
  tl: ['Pasalubong na 200 pababa', 'Ipakita ang sariwang gulay', 'Ano ang laman ng cart ko?'],
};

/** A suggestion as the chips want it: from the intro ({ id, question }) or from her (a string). */
const chipOf = (p) => (typeof p === 'string' ? { id: p, question: p } : p);

const UI = {
  en: {
    role: 'AI shopping helper',
    note: 'She answers questions about shopping on Emoorm only, and can make mistakes. Check important details.',
    suggested: 'Suggested questions',
    placeholder: 'Ask Moormy…',
    newChat: 'New chat',
    switchLang: 'Answer in Tagalog',
    help: 'Help Center',
    retry: 'Try again',
    cantLoad: "Moormy can't load right now.",
    offline: "I couldn't reach Emoorm just now. Check your connection and try again.",
    typing: 'Moormy is typing',
    voice: 'Voice assistant',
    voiceCta: 'Turn on “Hey Moormy”',
  },
  tl: {
    role: 'AI shopping helper',
    note: 'Tungkol lang sa pamimili sa Emoorm ang sinasagot niya, at puwede siyang magkamali. Suriin ang mahahalagang detalye.',
    suggested: 'Mga puwedeng itanong',
    placeholder: 'Magtanong kay Moormy…',
    newChat: 'Bagong chat',
    switchLang: 'Answer in English',
    help: 'Help Center',
    retry: 'Subukan ulit',
    cantLoad: 'Hindi ma-load si Moormy ngayon.',
    offline: 'Hindi ko maabot ang Emoorm ngayon. Tingnan ang koneksyon mo at subukan ulit.',
    typing: 'Nagta-type si Moormy',
    voice: 'Voice assistant',
    voiceCta: 'I-on ang “Hey Moormy”',
  },
};
const LANG_KEY = 'emoorm-moormy-lang';

/** The language chosen before (here or on her seller page), else the app's. */
const loadLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'tl') return saved;
  } catch { /* falls back to the app's language */ }
  return getCurrentLanguage() === 'tl' ? 'tl' : 'en';
};

/** Her own Tagalog is left alone by the app's page translation (Google Translate). */
const tlProps = (lang) => (lang === 'tl' ? { translate: 'no', className: 'notranslate' } : {});

/**
 * pendingAsk: { id, text } typed in the Messages intro card, asked as soon
 * as the chat opens (onAsked then clears it).
 */
export default function MoormyThread({ userId, pendingAsk, onAsked, onBack }) {
  const navigate = useNavigate();
  const chat = useMoormyChat(userId);
  const { messages, asked } = chat;
  const [lang, setLang] = useState(loadLang);
  const [intro, setIntro] = useState(null); // null loading, false failed
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  // "Hey Moormy" is set up here (there is no Moormy sticker on the pages).
  const [voiceOpen, setVoiceOpen] = useState(false);
  const canVoice = speechWakeSupported();
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const handledAsk = useRef(null);
  const t = UI[lang];

  const update = useCallback((fn) => setMoormyChat(userId, fn), [userId]);

  const loadIntro = useCallback(() => {
    setIntro(null);
    axios.get('/buyer-assistant', { params: { lang }, quiet: true })
      .then((res) => setIntro(res.data))
      .catch(() => setIntro(false));
  }, [lang]);

  useEffect(() => { loadIntro(); }, [loadIntro]);

  // The newest message (or the typing dots) in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: messages.length ? 'smooth' : 'auto' });
  }, [messages.length, busy]);

  /** Ask the server; the answer (or what went wrong) joins the chat. */
  const ask = useCallback(async (request) => {
    setBusy(true);
    try {
      const cartItems = useCartStore.getState().items;
      const context = {
        ...buildContext({
          pathname: window.location.pathname, search: window.location.search, page: null, cartItems,
        }),
        drive: false,
      };
      const state = request.state || { lang: request.lang };
      const res = await axios.post('/moormy/turn', { text: request.question, state, context }, { quiet: true });
      const d = res.data || {};
      const steps = planActions(d.actions, {
        signedIn: true, cards: d.cards, cartItems, route: context.route, drive: false,
      });
      // Only what happens in place runs (adding to the cart); nothing moves the page.
      const notes = runSteps(steps, { cart: useCartStore.getState(), navigate });
      const words = replyFor(d, notes);
      const links = [
        ...steps
          .filter((x) => x.kind === 'link' || x.kind === 'signIn' || ((x.kind === 'choose' || x.kind === 'offer') && x.go === false))
          .map((x) => ({
            to: x.to,
            label: x.kind === 'signIn' ? 'Sign in' : (x.product ? `Open ${x.product.name}` : (x.label || 'Open')),
          })),
        ...(Array.isArray(d.links) ? d.links.filter((l) => l?.to && l?.label) : []),
      ];
      const remove = steps.find((x) => x.kind === 'confirmRemove');
      update((c) => ({
        ...c,
        state: d.state || c.state,
        messages: [...c.messages, {
          id: `a${Date.now()}`,
          role: 'assistant',
          text: words.text,
          lang: words.lang,
          links,
          suggestions: Array.isArray(d.suggestions) ? d.suggestions.slice(0, 4) : [],
          cards: Array.isArray(d.cards) ? d.cards : [],
          compare: d.compare || null,
          cart: d.cart || null,
          orders: Array.isArray(d.orders) ? d.orders : null,
          notes: notes.filter((n) => n.text && n.kind === 'add').map((n) => ({ ok: n.ok, text: n.text })),
          confirm: remove ? { productId: remove.productId, name: remove.name, status: 'ask' } : null,
        }],
      }));
    } catch (err) {
      update((c) => ({
        ...c,
        messages: [...c.messages, {
          id: `e${Date.now()}`,
          role: 'assistant',
          error: true,
          text: err.message && !/network/i.test(err.message) ? err.message : UI[request.lang]?.offline || UI.en.offline,
          retry: request,
        }],
      }));
    } finally {
      setBusy(false);
    }
  }, [update, navigate]);

  const send = useCallback(({ text, presetId }) => {
    if (busy) return;
    const question = String(text || '').trim();
    if (!question) return;
    // What was said before, for follow-up questions (not failed tries).
    const history = messages.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, content: m.text }));
    update((c) => ({ ...c, messages: [...c.messages.filter((m) => !m.error), { id: `u${Date.now()}`, role: 'user', text: question }] }));
    if (!presetId) {
      setDraft('');
      if (inputRef.current) inputRef.current.style.height = '';
    }
    ask({
      question, presetId, history, asked, lang, state: chat.state,
    });
  }, [busy, messages, asked, lang, update, ask, chat.state]);

  // The question typed in the intro card: asked once, as the chat opens.
  useEffect(() => {
    if (!pendingAsk || handledAsk.current === pendingAsk.id) return;
    handledAsk.current = pendingAsk.id;
    send({ text: pendingAsk.text });
    onAsked?.();
  }, [pendingAsk, send, onAsked]);

  const retry = (failed) => {
    update((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== failed.id) }));
    ask(failed.retry);
  };

  // "Remove … from your cart?" answered here.
  const answerRemove = (m, yes) => {
    if (yes) useCartStore.getState().removeItem(m.confirm.productId);
    update((c) => ({
      ...c,
      messages: c.messages.map((x) => (x.id === m.id ? { ...x, confirm: { ...x.confirm, status: yes ? 'done' : 'kept' } } : x)),
    }));
  };

  const chooseLang = (next) => {
    setLang(next);
    // She answers in the language chosen from now on.
    update((c) => ({ ...c, state: { ...(c.state || {}), lang: next } }));
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch { /* chosen for this visit only */ }
  };

  const onInput = (e) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const chips = (list, listLang) => (
    <div className="mmy-chips" {...tlProps(listLang)}>
      {list.map(chipOf).map((p) => (
        <button key={p.id} type="button" className="mmy-chip" disabled={busy} onClick={() => send({ text: p.question })}>
          {p.question}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mmy-thread">
      <header className="msgr-thread-head">
        <button type="button" className="msgr-thread-back" onClick={onBack} aria-label="Back to conversations">
          <CaretLeft size={22} />
        </button>
        <MoormyAvatar size={40} />
        <div className="msgr-thread-title">
          <div className="msgr-thread-name">Moormy <span className="mmy-ai-tag">AI</span></div>
          <div className="msgr-thread-sub">{t.role}</div>
        </div>
        <MoreMenu
          className="msgr-thread-more"
          buttonClassName="msgr-thread-menu"
          label="Moormy options"
          iconSize={22}
          items={[
            messages.length > 0 && { key: 'new', icon: <NotePencil size={17} />, label: t.newChat, onClick: () => update((c) => ({
              ...c, messages: [], asked: [], state: { lang },
            })),
            },
            canVoice && {
              key: 'voice', icon: <Microphone size={17} />, label: t.voice, onClick: () => setVoiceOpen(true),
            },
            { key: 'lang', icon: <Translate size={17} />, label: t.switchLang, onClick: () => chooseLang(lang === 'tl' ? 'en' : 'tl') },
            { key: 'help', icon: <Question size={17} />, label: t.help, to: '/help' },
          ]}
        />
      </header>

      <div className="msgr-messages mmy-messages" role="log" aria-live="polite" aria-label="Chat with Moormy">
        <div className="mmy-hero" {...tlProps(lang)}>
          <MoormyAvatar size={64} />
          <strong>Moormy</strong>
          <small>{t.note}</small>
          {canVoice && (
            <button type="button" className="mmy-voice-cta" onClick={() => setVoiceOpen(true)}>
              <Microphone size={15} /> {t.voiceCta}
            </button>
          )}
        </div>

        {intro === false && (
          <div className="msgr-bubble-row">
            <MoormyAvatar size={28} />
            <div className="msgr-bubble mmy-bubble is-error">
              <p>{t.cantLoad}</p>
              <button type="button" className="mmy-retry" onClick={loadIntro}><ArrowClockwise size={14} /> {t.retry}</button>
            </div>
          </div>
        )}
        {intro && (
          <div className="msgr-bubble-row mmy-row">
            <MoormyAvatar size={28} />
            <div className="msgr-bubble mmy-bubble" {...tlProps(intro.lang)}><ReplyText text={intro.greeting} /></div>
          </div>
        )}
        {intro && !messages.length && !busy && (
          <div className="mmy-suggest">
            <span className="mmy-suggest-label" {...tlProps(intro.lang)}>{UI[intro.lang]?.suggested || t.suggested}</span>
            {chips([...(STARTERS[intro.lang] || STARTERS.en), ...intro.presets], intro.lang)}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msgr-bubble-row mmy-row${m.role === 'user' ? ' is-self' : ''}`}>
            {m.role === 'assistant' && <MoormyAvatar size={28} />}
            <div className="mmy-message">
              <div
                className={`msgr-bubble mmy-bubble${m.error ? ' is-error' : ''}`}
                {...(m.role === 'assistant' ? tlProps(m.lang) : {})}
              >
                {m.role === 'user' ? <p>{m.text}</p> : <ReplyText text={m.text} />}
                {m.error && m.retry && (
                  <button type="button" className="mmy-retry" onClick={() => retry(m)} disabled={busy}>
                    <ArrowClockwise size={14} /> {t.retry}
                  </button>
                )}
              </div>
              {m.role === 'assistant' && m.notes?.map((n) => (
                <p key={n.text} className={`mmg-note${n.ok ? ' is-ok' : ''}`}>{n.text}</p>
              ))}
              {m.role === 'assistant' && (
                <>
                  <Cards cards={m.compare ? [] : m.cards} />
                  <Compare compare={m.compare} />
                  <CartSummary cart={m.cart} />
                  <Orders orders={m.orders} />
                </>
              )}
              {m.role === 'assistant' && m.confirm && (
                m.confirm.status === 'ask' ? (
                  <div className="mmg-confirm" role="group" aria-label={`Remove ${m.confirm.name}?`}>
                    <button type="button" className="mmg-action is-danger" onClick={() => answerRemove(m, true)}>Remove</button>
                    <button type="button" className="mmg-action is-quiet" onClick={() => answerRemove(m, false)}>Keep it</button>
                  </div>
                ) : (
                  <p className={`mmg-note${m.confirm.status === 'done' ? ' is-ok' : ''}`}>
                    {m.confirm.status === 'done' ? `Removed ${m.confirm.name} from your cart.` : 'Okay, I left it in your cart.'}
                  </p>
                )
              )}
              {m.role === 'assistant' && m.links?.length > 0 && (
                <div className="mmy-links">
                  {m.links.map((l) => (
                    <Link key={`${l.to}${l.label}`} to={l.to} className="mmy-link">
                      {l.label} <CaretRight size={13} weight="bold" />
                    </Link>
                  ))}
                </div>
              )}
              {m === lastAssistant && !busy && m.suggestions?.length > 0 && chips(m.suggestions, m.lang)}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msgr-bubble-row mmy-row">
            <MoormyAvatar size={28} />
            <div className="msgr-bubble mmy-bubble mmy-typing" aria-label={t.typing}>
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="msgr-composer" onSubmit={(e) => { e.preventDefault(); send({ text: draft }); }}>
        <div className="msgr-composer-row">
          <textarea
            ref={inputRef}
            rows={1}
            className="msgr-composer-input"
            value={draft}
            onChange={onInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send({ text: draft });
              }
            }}
            maxLength={500}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            enterKeyHint="send"
          />
          <button type="submit" className="msgr-composer-send mmy-send" disabled={busy || !draft.trim()} aria-label="Send">
            <PaperPlaneTilt size={20} weight="fill" />
          </button>
        </div>
      </form>
      {voiceOpen && <MoormyVoiceSheet onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}
