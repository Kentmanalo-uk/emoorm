import { useEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Globe, Check } from '../lib/icons';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import LanguageTip from './LanguageTip';
import useHoverMenu from '../hooks/useHoverMenu';
import { useArrowAt } from '../hooks/useHeadCard';
import './LanguageSwitcher.css';

/**
 * Compact language dropdown. Variants:
 *   - "topbar"     : light grey buyer topbar (default)
 *   - "shell"      : white pill for Seller / Admin center topbars
 *
 * `tip`: show the "change the language here" card under the button;
 * `onTipDone` hears when it is dismissed (Got it, or the menu opened).
 *
 * The list opens on hover (or a click) and grows out of the button, then
 * shrinks back into it when it closes (LanguageSwitcher.css).
 */
export default function LanguageSwitcher({ variant = 'topbar', tip = false, onTipDone }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => getCurrentLanguage());
  const ref = useRef(null);
  const { hoverProps, dismiss, hovering } = useHoverMenu(setOpen);
  useArrowAt(ref, open);

  useEffect(() => {
    setCurrent(getCurrentLanguage());
  }, []);

  // The tip makes way once the list opens, however it was opened.
  useEffect(() => {
    if (open && tip) onTipDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const toggle = () => {
    setOpen((v) => (hovering() ? true : !v));
  };

  const handlePick = (code) => {
    dismiss();
    if (code === current) return;
    setLanguage(code);
  };

  return (
    <div
      ref={ref}
      className={`lang-switch lang-switch--${variant} notranslate${open ? ' is-open' : ''}`}
      translate="no"
      {...hoverProps}
    >
      <button
        type="button"
        className="lang-switch__trigger"
        onClick={toggle}
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

      {tip && !open && <LanguageTip variant="topbar" onDone={() => onTipDone?.()} />}

      <ul className="lang-switch__menu" role="listbox" aria-hidden={!open} inert={!open}>
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
    </div>
  );
}
