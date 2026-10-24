import { useEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Globe, Check, Translate } from '@phosphor-icons/react';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import './LanguageSwitcher.css';

// The pointer after the first-visit choice, in the language just chosen.
const TIP_TEXT = {
  en: { text: 'You can change the language here anytime.', ok: 'Got it' },
  tl: { text: 'Dito mo puwedeng palitan ang wika kahit kailan.', ok: 'Sige' },
  ceb: { text: 'Diri nimo mailisan ang pinulongan bisan kanus-a.', ok: 'Sige' },
};

/**
 * Compact language dropdown. Variants:
 *   - "topbar"     : light grey buyer topbar (default)
 *   - "shell"      : white pill for Seller / Admin center topbars
 *   - "phone"      : icon button in the buyer header on phones
 *
 * `tip`: show the "change the language here" pointer under the button;
 * `onTipDone` hears when it is dismissed (Got it, or the menu opened).
 */
export default function LanguageSwitcher({ variant = 'topbar', tip = false, onTipDone }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => getCurrentLanguage());
  const ref = useRef(null);

  useEffect(() => {
    setCurrent(getCurrentLanguage());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0];
  const tipText = TIP_TEXT[current] || TIP_TEXT.en;

  const toggle = () => {
    if (tip) onTipDone?.();
    setOpen((v) => !v);
  };

  const handlePick = (code) => {
    setOpen(false);
    if (code === current) return;
    setLanguage(code);
  };

  return (
    <div ref={ref} className={`lang-switch lang-switch--${variant} notranslate`} translate="no">
      <button
        type="button"
        className="lang-switch__trigger"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={variant === 'phone' ? `Language: ${active.label}` : undefined}
        title="Change language"
      >
        {variant === 'shell' ? <Globe size={15} /> : null}
        {variant === 'phone' ? <Translate size={20} weight="fill" className="lang-switch__icon" /> : null}
        <span className="lang-switch__label">
          {variant === 'shell' ? active.label : active.short}
        </span>
        {variant !== 'phone' && (
          <ChevronDown size={14} className={`lang-switch__caret ${open ? 'is-open' : ''}`} />
        )}
      </button>

      {tip && !open && (
        <div className="lang-switch__tip" role="status">
          <span className="lang-switch__tip-arrow" aria-hidden="true" />
          <Translate size={18} weight="fill" className="lang-switch__tip-icon" aria-hidden="true" />
          <p>{tipText.text}</p>
          <button type="button" onClick={() => onTipDone?.()}>{tipText.ok}</button>
        </div>
      )}

      {open && (
        <ul className="lang-switch__menu" role="listbox">
          {LANGUAGES.map((l) => {
            const isActive = l.code === current;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`lang-switch__option ${isActive ? 'is-active' : ''}`}
                  onClick={() => handlePick(l.code)}
                >
                  <span className="lang-switch__option-label">{l.label}</span>
                  <span className="lang-switch__option-code">{l.short}</span>
                  {isActive && <Check size={14} className="lang-switch__tick" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
