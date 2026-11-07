import { useState } from 'react';
import { CaretRight as ChevronRight, Translate } from '../../lib/icons';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../../lib/googleTranslate';

// Phones: the language switch (computers have it in the topbar), in the
// Profile tab's More list, signed in or not (ProfileGuest). The row shows
// the language in use; tapping it opens the phone's own picker.
const LANGUAGE_WORD = { en: 'Language', tl: 'Wika', ceb: 'Pinulongan' };

/**
 * The same switch as one of Profile's shortcuts (phones): the mark over the
 * word, the phone's own picker laid invisibly over the tile.
 */
export function LanguageTile({ Art, look, className = '' }) {
  const [current] = useState(getCurrentLanguage);
  return (
    <label className={`${className} pf-m-lang notranslate`.trim()} translate="no">
      <Art size={36} glass look={look} />
      <span>{LANGUAGE_WORD[current] || LANGUAGE_WORD.en}</span>
      <select
        value={current}
        onChange={(e) => { if (e.target.value !== current) setLanguage(e.target.value); }}
        aria-label="Language"
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}

export default function LanguageRow() {
  const [current] = useState(getCurrentLanguage);
  const active = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0];
  return (
    <label className="pf-m-row pf-m-lang notranslate" translate="no">
      <span className="pf-m-row-icon"><Translate size={19} weight="fill" /></span>
      <span className="pf-m-row-label">{LANGUAGE_WORD[current] || LANGUAGE_WORD.en}</span>
      <span className="pf-m-row-hint">{active.label}</span>
      <ChevronRight size={16} className="pf-m-row-chev" />
      <select
        value={current}
        onChange={(e) => { if (e.target.value !== current) setLanguage(e.target.value); }}
        aria-label="Language"
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
