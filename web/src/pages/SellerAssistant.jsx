import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowClockwise, CaretRight, NotePencil, PaperPlaneRight,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import ReplyText from '../components/moormy/ReplyText';
import MoormyFace from '../components/moormy/MoormyFace';
import useAuthStore from '../store/authStore';
import SellerPageHead from '../components/seller/SellerPageHead';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { getCurrentLanguage } from '../lib/googleTranslate';
import './SellerDashboard.css';
import './SellerAssistant.css';

/*
 * Ate Moormy: the sellers' AI assistant. Answers questions about selling on
 * Emoorm only, in English or Tagalog; suggested questions to tap; links to
 * the page an answer is about. The chat stays on this device (per account)
 * until "New chat".
 */

/** Her page's own words, in each language she speaks. */
const UI = {
  en: {
    subtitle: 'Your AI assistant for selling on Emoorm',
    role: 'AI seller assistant',
    note: 'She answers questions about selling on Emoorm only, and can make mistakes. Check important details.',
    language: 'Language',
    suggested: 'Suggested questions',
    placeholder: 'Ask Ate Moormy about your shop…',
    newChat: 'New chat',
    retry: 'Try again',
    cantLoad: "Ate Moormy can't load right now.",
    offline: "I couldn't reach Emoorm just now. Check your connection and try again.",
    typing: 'Ate Moormy is typing',
  },
  tl: {
    subtitle: 'Ang AI assistant mo sa pagbebenta sa Emoorm',
    role: 'AI seller assistant',
    note: 'Tungkol lang sa pagbebenta sa Emoorm ang sinasagot niya, at puwede siyang magkamali. Suriin ang mahahalagang detalye.',
    language: 'Wika',
    suggested: 'Mga puwedeng itanong',
    placeholder: 'Magtanong kay Ate Moormy…',
    newChat: 'Bagong chat',
    retry: 'Subukan ulit',
    cantLoad: 'Hindi ma-load si Ate Moormy ngayon.',
    offline: 'Hindi ko maabot ang Emoorm ngayon. Tingnan ang koneksyon mo at subukan ulit.',
    typing: 'Nagta-type si Ate Moormy',
  },
};
const LANG_KEY = 'emoorm-moormy-lang';

/** The language chosen here before, else Tagalog when the app is in Tagalog. */
const loadLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'tl') return saved;
  } catch { /* falls back to the app's language */ }
  return getCurrentLanguage() === 'tl' ? 'tl' : 'en';
};

/** Her own Tagalog is left alone by the app's page translation (Google Translate). */
const tlAttrs = (lang) => (lang === 'tl' ? { translate: 'no' } : {});
const tlClass = (lang) => (lang === 'tl' ? ' notranslate' : '');

const MAX_KEPT = 40;
const storeKey = (userId) => `emoorm-moormy-${userId || 'me'}`;
const loadChat = (userId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(userId)) || 'null');
    return saved && Array.isArray(saved.messages) ? saved : null;
  } catch {
    return null;
  }
};
const saveChat = (userId, chat) => {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(chat));
  } catch { /* the chat just starts fresh next time */ }
};

function Avatar({ size = 32 }) {
  return (
    <span className="sa-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <MoormyFace size={size} />
    </span>
  );
}

export default function SellerAssistant() {
  const user = useAuthStore((s) => s.user);
  const isPhone = usePhoneLayout();
  const [lang, setLang] = useState(loadLang);
  const [intro, setIntro] = useState(null); // null loading, false failed
  const [messages, setMessages] = useState(() => loadChat(user?.id)?.messages || []);
  const [asked, setAsked] = useState(() => loadChat(user?.id)?.asked || []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const t = UI[lang];

  const loadIntro = useCallback(() => {
    setIntro(null);
    axios.get('/seller-assistant', { params: { lang } })
      .then((res) => setIntro(res.data))
      .catch(() => setIntro(false));
  }, [lang]);

  const chooseLang = (next) => {
    if (next === lang) return;
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch { /* chosen for this visit only */ }
  };

  useEffect(() => { loadIntro(); }, [loadIntro]);

  useEffect(() => {
    saveChat(user?.id, { messages: messages.slice(-MAX_KEPT), asked });
  }, [messages, asked, user?.id]);

  // The newest message (or the typing dots) in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: messages.length ? 'smooth' : 'auto' });
  }, [messages, busy]);

  const newChat = useCallback(() => {
    setMessages([]);
    setAsked([]);
    setDraft('');
  }, []);

  // Phones: "New chat" sits on the top bar (SellerLayout).
  useEffect(() => {
    window.addEventListener('moormy:new-chat', newChat);
    return () => window.removeEventListener('moormy:new-chat', newChat);
  }, [newChat]);

  /** Ask the server; the answer (or what went wrong) joins the chat. */
  const ask = async (request) => {
    setBusy(true);
    try {
      const res = await axios.post('/seller-assistant/chat', request.presetId
        ? { presetId: request.presetId, history: request.history, asked, lang: request.lang }
        : { question: request.question, history: request.history, asked, lang: request.lang });
      const d = res.data || {};
      setMessages((prev) => [...prev, {
        id: `a${Date.now()}`,
        role: 'assistant',
        text: d.reply,
        lang: d.lang,
        links: d.links || [],
        suggestions: d.suggestions || [],
      }]);
      if (request.presetId) setAsked((prev) => (prev.includes(request.presetId) ? prev : [...prev, request.presetId]));
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `e${Date.now()}`,
        role: 'assistant',
        error: true,
        text: err.message && !/network/i.test(err.message) ? err.message : UI[request.lang]?.offline || UI.en.offline,
        retry: request,
      }]);
    } finally {
      setBusy(false);
      if (!isPhone) inputRef.current?.focus();
    }
  };

  const send = ({ text, presetId }) => {
    if (busy) return;
    const question = presetId
      ? intro?.presets?.find((p) => p.id === presetId)?.question || text
      : String(text || '').trim();
    if (!question) return;
    // What was said before, for follow-up questions (not failed tries).
    const history = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev.filter((m) => !m.error), { id: `u${Date.now()}`, role: 'user', text: question }]);
    if (!presetId) {
      setDraft('');
      if (inputRef.current) inputRef.current.style.height = '';
    }
    ask({ question, presetId, history, lang });
  };

  // The question is already in the chat: only the failed answer goes.
  const retry = (failed) => {
    setMessages((prev) => prev.filter((m) => m.id !== failed.id));
    ask(failed.retry);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send({ text: draft });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send({ text: draft });
    }
  };

  // The box grows with the question, up to a few lines.
  const onInput = (e) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const chips = (list, listLang) => (
    <div className={`sa-chips${tlClass(listLang)}`} {...tlAttrs(listLang)}>
      {list.map((p) => (
        <button key={p.id} type="button" className="sa-chip" disabled={busy} onClick={() => send({ presetId: p.id, text: p.question })}>
          {p.question}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`seller-dashboard sa-page${isPhone ? ' is-phone' : ''}`}>
      <div className="seller-container">
        {!isPhone && (
          <SellerPageHead
            title="Ate Moormy"
            subtitle={t.subtitle}
            actions={(
              <button type="button" className="btn-seller-outline" onClick={newChat} disabled={busy || !messages.length}>
                <NotePencil size={16} /> {t.newChat}
              </button>
            )}
          />
        )}

        <div className="seller-card sa-card">
          <div className="sa-scroll" role="log" aria-live="polite" aria-label="Chat with Ate Moormy">
            <div className={`sa-hero${tlClass(lang)}`} {...tlAttrs(lang)}>
              <Avatar size={56} />
              <strong>Ate Moormy</strong>
              <span>{t.role}</span>
              <small>{t.note}</small>
              {/* The language she answers in: English or Tagalog. */}
              <div className="sa-lang" role="group" aria-label={t.language}>
                {[['en', 'English'], ['tl', 'Tagalog']].map(([code, label]) => (
                  <button key={code} type="button" aria-pressed={lang === code} onClick={() => chooseLang(code)} disabled={busy}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {intro === false && (
              <div className="sa-row is-assistant">
                <Avatar />
                <div className="sa-bubble is-error">
                  <p>{t.cantLoad}</p>
                  <button type="button" className="sa-retry" onClick={loadIntro}><ArrowClockwise size={14} /> {t.retry}</button>
                </div>
              </div>
            )}

            {intro && (
              <div className="sa-row is-assistant">
                <Avatar />
                <div className={`sa-bubble${tlClass(intro.lang)}`} {...tlAttrs(intro.lang)}><ReplyText text={intro.greeting} /></div>
              </div>
            )}
            {intro && !messages.length && (
              <div className="sa-suggest">
                <span className={`sa-suggest-label${tlClass(intro.lang)}`} {...tlAttrs(intro.lang)}>{UI[intro.lang]?.suggested || t.suggested}</span>
                {chips(intro.presets, intro.lang)}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`sa-row is-${m.role}`}>
                {m.role === 'assistant' && <Avatar />}
                <div className="sa-message">
                  <div className={`sa-bubble${m.error ? ' is-error' : ''}${tlClass(m.role === 'assistant' ? m.lang : null)}`} {...tlAttrs(m.role === 'assistant' ? m.lang : null)}>
                    {m.role === 'user' ? <p>{m.text}</p> : <ReplyText text={m.text} />}
                    {m.error && m.retry && (
                      <button type="button" className="sa-retry" onClick={() => retry(m)} disabled={busy}>
                        <ArrowClockwise size={14} /> {t.retry}
                      </button>
                    )}
                  </div>
                  {m.role === 'assistant' && m.links?.length > 0 && (
                    <div className="sa-links">
                      {m.links.map((l) => (
                        <Link key={`${l.to}${l.label}`} to={l.to} className="sa-link">
                          {l.label} <CaretRight size={14} weight="bold" />
                        </Link>
                      ))}
                    </div>
                  )}
                  {m === lastAssistant && !busy && m.suggestions?.length > 0 && chips(m.suggestions, m.lang)}
                </div>
              </div>
            ))}

            {busy && (
              <div className="sa-row is-assistant">
                <Avatar />
                <div className="sa-bubble sa-typing" aria-label={t.typing}>
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={endRef} className="sa-end" />
          </div>

          <form className="sa-composer" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={onInput}
              onKeyDown={onKeyDown}
              maxLength={500}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              enterKeyHint="send"
              disabled={intro === false}
            />
            <button type="submit" className="sa-send" disabled={busy || !draft.trim()} aria-label="Send">
              <PaperPlaneRight size={20} weight="fill" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
