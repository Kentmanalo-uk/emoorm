import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Translate, CaretRight } from '@phosphor-icons/react';
import { chooseFirstLanguage } from '../lib/languageIntro';
import useFocusTrap from '../hooks/useFocusTrap';
import './LanguageChoice.css';

const CHOICES = [
  { code: 'en', label: 'English', note: 'Use E-MOORM in English' },
  { code: 'tl', label: 'Tagalog', note: 'Gamitin ang E-MOORM sa Tagalog' },
];

/**
 * The first-visit card: which language? A centred card on computers, a
 * bottom sheet on phones. Written in both languages and kept out of Google's
 * translator, so it reads the same whatever the page language. Escape picks
 * English.
 */
export default function LanguageChoice() {
  // Escape answers it (English) rather than skipping it.
  const dialogRef = useFocusTrap(true, { onClose: () => chooseFirstLanguage('en') });

  useEffect(() => {
    // Focus the card, not an option, so neither language looks picked (this
    // runs after the trap has focused the first option).
    dialogRef.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [dialogRef]);

  return createPortal(
    <div className="lang-choice-backdrop notranslate" translate="no" role="presentation">
      <div
        ref={dialogRef}
        className="lang-choice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lang-choice-title"
        tabIndex={-1}
      >
        <span className="lang-choice-grip" aria-hidden="true" />
        <Translate size={34} weight="fill" className="lang-choice-icon" aria-hidden="true" />
        <h2 id="lang-choice-title" className="lang-choice-title">Choose your language</h2>
        <p className="lang-choice-sub">Piliin ang iyong wika</p>

        <div className="lang-choice-options">
          {CHOICES.map((c) => (
            <button
              key={c.code}
              type="button"
              className="lang-choice-option"
              lang={c.code}
              onClick={() => chooseFirstLanguage(c.code)}
            >
              <span className="lang-choice-option-text">
                <strong>{c.label}</strong>
                <small>{c.note}</small>
              </span>
              <CaretRight size={16} weight="bold" className="lang-choice-option-chev" aria-hidden="true" />
            </button>
          ))}
        </div>

        <p className="lang-choice-foot">
          You can change it anytime · Puwede mo itong palitan kahit kailan
        </p>
      </div>
    </div>,
    document.body,
  );
}
