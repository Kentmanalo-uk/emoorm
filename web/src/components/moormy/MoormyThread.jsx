import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowClockwise, CaretLeft, CaretRight, NotePencil, PaperPlaneTilt, Question, Translate,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { getCurrentLanguage } from '../../lib/googleTranslate';
import { setMoormyChat, useMoormyChat } from '../../lib/moormyChat';
import MoreMenu from '../MoreMenu';
import ReplyText from './ReplyText';
import MoormyAvatar from './MoormyAvatar';
import './Moormy.css';

/*
 * The buyer's chat with Ate Moormy, in the Messages thread pane: questions
 * about shopping on Emoorm, answered in English or Tagalog, with suggested
 * questions to tap and links to the page an answer is about.
 */

const UI = {
  en: {
    role: 'AI shopping helper',
    note: 'She answers questions about shopping on Emoorm only, and can make mistakes. Check important details.',
    suggested: 'Suggested questions',
    placeholder: 'Ask Ate Moormy…',
    newChat: 'New chat',
    switchLang: 'Answer in Tagalog',
    help: 'Help Center',
    retry: 'Try again',
    cantLoad: "Ate Moormy can't load right now.",
    offline: "I couldn't reach Emoorm just now. Check your connection and try again.",
    typing: 'Ate Moormy is typing',
  },
  tl: {
    role: 'AI shopping helper',
    note: 'Tungkol lang sa pamimili sa Emoorm ang sinasagot niya, at puwede siyang magkamali. Suriin ang mahahalagang detalye.',
    suggested: 'Mga puwedeng itanong',
    placeholder: 'Magtanong kay Ate Moormy…',
    newChat: 'Bagong chat',
    switchLang: 'Answer in English',
    help: 'Help Center',
    retry: 'Subukan ulit',
    cantLoad: 'Hindi ma-load si Ate Moormy ngayon.',
    offline: 'Hindi ko maabot ang Emoorm ngayon. Tingnan ang koneksyon mo at subukan ulit.',
    typing: 'Nagta-type si Ate Moormy',
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
  const chat = useMoormyChat(userId);
  const { messages, asked } = chat;
  const [lang, setLang] = useState(loadLang);
  const [intro, setIntro] = useState(null); // null loading, false failed
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
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
      const res = await axios.post('/buyer-assistant/chat', request.presetId
        ? { presetId: request.presetId, history: request.history, asked: request.asked, lang: request.lang }
        : { question: request.question, history: request.history, asked: request.asked, lang: request.lang },
      { quiet: true });
      const d = res.data || {};
      update((c) => ({
        ...c,
        asked: request.presetId && !c.asked.includes(request.presetId) ? [...c.asked, request.presetId] : c.asked,
        messages: [...c.messages, {
          id: `a${Date.now()}`, role: 'assistant', text: d.reply, lang: d.lang, links: d.links || [], suggestions: d.suggestions || [],
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
  }, [update]);

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
    ask({ question, presetId, history, asked, lang });
  }, [busy, messages, asked, lang, update, ask]);

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

  const chooseLang = (next) => {
    setLang(next);
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
      {list.map((p) => (
        <button key={p.id} type="button" className="mmy-chip" disabled={busy} onClick={() => send({ presetId: p.id, text: p.question })}>
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
          <div className="msgr-thread-name">Ate Moormy <span className="mmy-ai-tag">AI</span></div>
          <div className="msgr-thread-sub">{t.role}</div>
        </div>
        <MoreMenu
          className="msgr-thread-more"
          buttonClassName="msgr-thread-menu"
          label="Ate Moormy options"
          iconSize={22}
          items={[
            messages.length > 0 && { key: 'new', icon: <NotePencil size={17} />, label: t.newChat, onClick: () => update((c) => ({ ...c, messages: [], asked: [] })) },
            { key: 'lang', icon: <Translate size={17} />, label: t.switchLang, onClick: () => chooseLang(lang === 'tl' ? 'en' : 'tl') },
            { key: 'help', icon: <Question size={17} />, label: t.help, to: '/help' },
          ]}
        />
      </header>

      <div className="msgr-messages mmy-messages" role="log" aria-live="polite" aria-label="Chat with Ate Moormy">
        <div className="mmy-hero" {...tlProps(lang)}>
          <MoormyAvatar size={64} glow />
          <strong>Ate Moormy</strong>
          <small>{t.note}</small>
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
            {chips(intro.presets, intro.lang)}
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
    </div>
  );
}
