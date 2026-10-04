import { useEffect, useState } from 'react';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import { hasTriedMoormy, useMoormyChat } from '../../lib/moormyChat';
import MoormyAvatar from './MoormyAvatar';
import './Moormy.css';

/*
 * Ate Moormy at the top of the buyer's Messages list.
 *
 * Until the buyer first asks her something: an introduction with its own
 * question box (the greeting types itself in, the box suggests questions in
 * turn). Sending opens her chat with the question asked. After that she is a
 * chat row like the others, showing the last thing said.
 */

const EXAMPLES = [
  'How do I pay with GCash?',
  'Can I pick up my order?',
  'How do I return an item?',
  'Where is my order?',
  'Paano mag-cancel ng order?',
];

const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The greeting, typed in once. */
function useTyped(text) {
  const [count, setCount] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (count >= text.length) return undefined;
    const id = setTimeout(() => setCount((n) => n + 1), count === 0 ? 450 : 22);
    return () => clearTimeout(id);
  }, [count, text.length]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

function IntroCard({ firstName, onAsk }) {
  const greeting = `Hi${firstName ? ` ${firstName}` : ''}! I'm your shopping helper. Ask me anything about buying on Emoorm.`;
  const { shown, done } = useTyped(greeting);
  const [draft, setDraft] = useState('');
  const [example, setExample] = useState(0);
  const [sending, setSending] = useState(false);

  // The box suggests a question at a time while it is empty.
  useEffect(() => {
    if (draft || reducedMotion()) return undefined;
    const id = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(id);
  }, [draft]);

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    // A beat for the send button's flourish, then her chat opens.
    setTimeout(() => onAsk(text), reducedMotion() ? 0 : 260);
  };

  return (
    <section className={`mmy-intro${sending ? ' is-sending' : ''}`} aria-label="Ate Moormy, your AI shopping helper">
      <div className="mmy-intro-head">
        <MoormyAvatar size={44} glow />
        <div className="mmy-intro-text">
          <div className="mmy-intro-name">
            <strong>Ate Moormy</strong>
            <span className="mmy-ai-tag">AI</span>
          </div>
          <p>
            <span className="sr-only">{greeting}</span>
            <span aria-hidden="true">{shown}</span>
            {!done && <span className="mmy-caret" aria-hidden="true" />}
          </p>
        </div>
      </div>
      <form className="mmy-ask" onSubmit={submit}>
        <div className="mmy-ask-field">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            enterKeyHint="send"
            aria-label="Ask Ate Moormy"
            disabled={sending}
          />
          {!draft && (
            <span key={example} className="mmy-ask-hint" aria-hidden="true">{EXAMPLES[example]}</span>
          )}
        </div>
        <button type="submit" className="mmy-ask-send" disabled={!draft.trim() || sending} aria-label="Send to Ate Moormy">
          <PaperPlaneTilt size={18} weight="fill" />
        </button>
      </form>
    </section>
  );
}

/**
 * userId, firstName: the signed-in buyer. active: her chat is open.
 * onOpen(question?): open her chat (asking the question, from the intro card).
 */
export default function MoormyEntry({ userId, firstName, active, onOpen }) {
  const chat = useMoormyChat(userId);

  if (!hasTriedMoormy(chat)) return <IntroCard firstName={firstName} onAsk={(text) => onOpen(text)} />;

  const last = [...chat.messages].reverse().find((m) => !m.error);
  const preview = !last
    ? 'Ask me anything about shopping'
    : last.role === 'user' ? `You: ${last.text}` : String(last.text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ');

  return (
    <button type="button" className={`msgr-convo-item mmy-convo${active ? ' is-active' : ''}`} onClick={() => onOpen()}>
      <div className="msgr-avatar">
        <MoormyAvatar size={44} />
      </div>
      <div className="msgr-convo-body">
        <div className="msgr-convo-row">
          <span className="msgr-convo-title">Ate Moormy <span className="mmy-ai-tag">AI</span></span>
          <span className="msgr-convo-time">{last ? timeOf(chat.updatedAt) : ''}</span>
        </div>
        <div className="msgr-convo-row">
          <span className="msgr-convo-preview">{preview}</span>
        </div>
        <div className="msgr-convo-role">AI shopping helper</div>
      </div>
    </button>
  );
}
