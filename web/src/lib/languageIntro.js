import { useEffect, useState } from 'react';
import { getCurrentLanguage, setLanguage } from './googleTranslate';

/**
 * The first visit asks once: English or Tagalog. After the choice, Home
 * points at the language switch in the header ("you can change it here"),
 * until the buyer taps "Got it" or opens the switch.
 *
 * Someone who already picked a language (emoorm.lang) is never asked.
 * Choosing Tagalog reloads the page (Google's translator reads its cookie at
 * load), so the pointer waits in storage and shows after the reload.
 */
const ASKED_KEY = 'emoorm.langAsked';
const TIP_KEY = 'emoorm.langTip';
const LANG_KEY = 'emoorm.lang';
const EVENT = 'emoorm:language-intro';

const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: the card shows again next visit */ }
};

function readState() {
  const asking = !read(ASKED_KEY) && !read(LANG_KEY);
  return { asking, tip: !asking && read(TIP_KEY) === '1' };
}

const notify = () => window.dispatchEvent(new Event(EVENT));

export function chooseFirstLanguage(code) {
  write(ASKED_KEY, '1');
  write(TIP_KEY, '1');
  if (code !== getCurrentLanguage()) {
    setLanguage(code);
    return;
  }
  write(LANG_KEY, code);
  notify();
}

export function dismissLanguageTip() {
  if (read(TIP_KEY) == null) return;
  write(TIP_KEY, null);
  notify();
}

/** { asking, tip }: the first-visit card is up / the pointer is waiting. */
export function useLanguageIntro() {
  const [state, setState] = useState(readState);
  useEffect(() => {
    const onChange = () => setState(readState());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return state;
}
