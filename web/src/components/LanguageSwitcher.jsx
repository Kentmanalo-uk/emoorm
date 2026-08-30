import React, { useEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Globe, Check } from '@phosphor-icons/react';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import './LanguageSwitcher.css';

/**
 * Compact language dropdown. Variants:
 *   - "topbar"     : light grey buyer topbar (default)
 *   - "shell"      : white pill for Seller / Admin center topbars
 */
export default function LanguageSwitcher({ variant = 'topbar' }) {
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
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change language"
      >
        {variant === 'shell' ? <Globe size={15} /> : null}
        <span className="lang-switch__label">
          {variant === 'shell' ? active.label : active.short}
        </span>
        <ChevronDown size={14} className={`lang-switch__caret ${open ? 'is-open' : ''}`} />
      </button>

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
