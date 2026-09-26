import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FacebookLogo, MessengerLogo, WhatsappLogo, TelegramLogo, XLogo,
  EnvelopeSimple, ChatText, ChatCircleDots, LinkSimple, Check, X,
} from '@phosphor-icons/react';
import './ShareSheet.css';

const CLOSE_MS = 220;

const isTouchPhone = () => typeof window !== 'undefined'
  && window.matchMedia('(pointer: coarse)').matches
  && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Where each target sends the link. Phone-only apps are hidden on desktop. */
const targets = ({ url, title, text }) => {
  const u = encodeURIComponent(url);
  const line = encodeURIComponent(`${text || title} ${url}`.trim());
  const phone = isTouchPhone();
  return [
    phone && { key: 'messenger', label: 'Messenger', icon: MessengerLogo, color: '#0084ff', href: `fb-messenger://share/?link=${u}` },
    { key: 'facebook', label: 'Facebook', icon: FacebookLogo, color: '#1877f2', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, popup: true },
    phone && { key: 'viber', label: 'Viber', icon: ChatCircleDots, color: '#7360f2', href: `viber://forward?text=${line}` },
    { key: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo, color: '#25d366', href: `https://wa.me/?text=${line}`, popup: !phone },
    { key: 'telegram', label: 'Telegram', icon: TelegramLogo, color: '#229ed9', href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text || title)}`, popup: !phone },
    { key: 'x', label: 'X', icon: XLogo, color: '#111827', href: `https://twitter.com/intent/tweet?url=${u}&text=${encodeURIComponent(text || title)}`, popup: true },
    phone && { key: 'sms', label: 'Messages', icon: ChatText, color: '#16a34a', href: `sms:?&body=${line}` },
    { key: 'email', label: 'Email', icon: EnvelopeSimple, color: '#6b7280', href: `mailto:?subject=${encodeURIComponent(title)}&body=${line}` },
  ].filter(Boolean);
};

/**
 * Sharing that actually shares.
 *
 * share({ title, text, url }) opens the device's own share menu when the
 * browser has one (phones, Safari, Edge/Chrome on Windows). Everywhere else
 * — Firefox, most desktop browsers, the Facebook and Messenger in-app
 * browsers — it opens this sheet, where each app opens its own share screen
 * with the link filled in. Copying the link is one option among them.
 *
 *   const { share, shareSheet } = useShare();
 *   <button onClick={() => share({ title, url })}>Share</button>
 *   {shareSheet}
 */
export function useShare() {
  const [payload, setPayload] = useState(null);

  const share = useCallback(async ({ title = document.title, text = '', url = window.location.href } = {}) => {
    const data = { title, text, url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        // The person closed the menu: done. Anything else (blocked, not
        // allowed in this browser): fall through to our own sheet.
        if (err?.name === 'AbortError') return;
      }
    }
    setPayload(data);
  }, []);

  const shareSheet = (
    <ShareSheet
      open={!!payload}
      payload={payload}
      onClose={() => setPayload(null)}
    />
  );

  return { share, shareSheet };
}

function ShareSheet({ open, payload, onClose }) {
  const [shown, setShown] = useState(null);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setShown(payload);
      setClosing(false);
      setCopied(false);
    } else if (shown) {
      setClosing(true);
      timer.current = setTimeout(() => { setShown(null); setClosing(false); }, CLOSE_MS);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown, onClose]);

  if (!shown) return null;

  const open_ = (t) => {
    if (t.popup) {
      window.open(t.href, '_blank', 'noopener,noreferrer,width=620,height=640');
    } else {
      window.location.href = t.href;
    }
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown.url);
    } catch {
      // Older browsers: select-and-copy from a hidden field.
      const ta = document.createElement('textarea');
      ta.value = shown.url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(onClose, 900);
  };

  return (
    <div className={`share-root${closing ? ' is-closing' : ''}`}>
      <button type="button" className="share-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="share-sheet" role="dialog" aria-modal="true" aria-label="Share">
        <div className="share-head">
          <span className="share-grabber" aria-hidden="true" />
          <h2>Share</h2>
          <button type="button" className="share-close" onClick={onClose} aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>
        {shown.title && <p className="share-title">{shown.title}</p>}

        <div className="share-grid">
          {targets(shown).map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" className="share-target" onClick={() => open_(t)}>
                <span className="share-target-icon" style={{ background: t.color }}>
                  <Icon size={26} weight="fill" />
                </span>
                <span className="share-target-label">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="share-link">
          <LinkSimple size={18} />
          <span className="share-link-url">{shown.url}</span>
          <button type="button" className={`share-copy${copied ? ' is-done' : ''}`} onClick={copy}>
            {copied ? <><Check size={15} weight="bold" /> Copied</> : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShareSheet;
