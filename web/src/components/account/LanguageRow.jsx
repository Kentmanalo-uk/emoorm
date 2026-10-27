import { useState } from 'react';
import { CaretRight as ChevronRight, Translate } from '@phosphor-icons/react';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../../lib/googleTranslate';

// Phones: the language switch (computers have it in the topbar), in the
// Profile tab's More list, signed in or not (ProfileGuest). The row shows
// the language in use; tapping it opens the phone's own picker.
const LANGUAGE_WORD = { en: 'Language', tl: 'Wika', ceb: 'Pinulongan' };

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
