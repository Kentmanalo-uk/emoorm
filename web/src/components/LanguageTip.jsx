import { Translate } from '@phosphor-icons/react';
import { getCurrentLanguage } from '../lib/googleTranslate';
import './LanguageTip.css';

// In the language just chosen: on computers it points at the topbar switch,
// on phones at the Profile tab (the switch is in Profile, under More).
const TEXT = {
  en: {
    title: 'Change language anytime',
    topbar: 'Switch between English and Tagalog here.',
    nav: 'Find it in Profile, under More.',
    ok: 'Got it',
  },
  tl: {
    title: 'Palitan ang wika kahit kailan',
    topbar: 'Dito ka puwedeng lumipat sa English o Tagalog.',
    nav: 'Nasa Profile ito, sa ilalim ng Iba pa.',
    ok: 'Sige',
  },
  ceb: {
    title: 'Usba ang pinulongan bisan kanus-a',
    topbar: 'Diri ka makabalhin sa English o Tagalog.',
    nav: 'Naa kini sa Profile.',
    ok: 'Sige',
  },
};

/** The pointer after the first-visit language choice. `variant`: topbar | nav. */
export default function LanguageTip({ variant = 'topbar', onDone }) {
  const t = TEXT[getCurrentLanguage()] || TEXT.en;
  return (
    <div className={`lang-tip lang-tip--${variant} notranslate`} translate="no" role="status">
      <span className="lang-tip-arrow" aria-hidden="true" />
      <Translate size={26} weight="fill" className="lang-tip-icon" aria-hidden="true" />
      <div className="lang-tip-copy">
        <strong>{t.title}</strong>
        <p>{t[variant] || t.topbar}</p>
      </div>
      <button type="button" className="lang-tip-ok" onClick={onDone}>{t.ok}</button>
    </div>
  );
}
