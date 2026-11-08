import { useId, useState } from 'react';
import { CaretLeft, MagnifyingGlass, X } from '../../lib/icons';
import PageMenu from '../layout/PageMenu';

/**
 * The search at the top of the band: searches the palengke only (the page
 * sends it with badge=PALENGKE). Mounted again (key) when the address's
 * search changes, so Back or a cleared search shows what is searched.
 */
function BandSearch({ q, onSearch }) {
  const [text, setText] = useState(q);
  const submit = (e) => {
    e.preventDefault();
    onSearch(text.trim());
    e.currentTarget.querySelector('input')?.blur();
  };
  return (
    <form className="plg-search" role="search" onSubmit={submit}>
      <MagnifyingGlass size={18} weight="bold" className="plg-search-icon" aria-hidden="true" />
      <input
        type="search"
        enterKeyHint="search"
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        placeholder="Hanapin sa Palengke"
        aria-label="Search the palengke"
      />
      {text && (
        <button
          type="button"
          className="plg-search-clear"
          aria-label="Clear the search"
          onClick={() => { setText(''); if (q) onSearch(''); }}
        >
          <X size={13} weight="bold" />
        </button>
      )}
      <button type="submit" className="plg-search-go">Hanapin</button>
    </form>
  );
}

/*
 * PALENGKE in Archivo Black, semi-expanded (wdth 112, the Home banners'
 * type), outlined to a path once (graphics: opentype.js on Google Fonts'
 * Archivo; SIL Open Font License 1.1), so the page loads no font for it.
 * 100 units a size: the caps stand 70 high, from x 7 to 662.
 */
const WORD_PATH = [
  'M30.8 0L7.4 0L7.4-68.8L55.4-68.8Q62-68.8 67.1-65.8Q72.2-62.8 75.1-57.5Q77.9-52.2 77.9-45.2L77.9-45.2Q77.9-38 75-32.6Q72.1-27.2 67-24.2Q61.9-21.3 55.4-21.3L55.4-21.3L30.8-21.3L30.8 0',
  'Z',
  'M30.8-52.1L30.8-37.9L48.2-37.9Q51.9-37.9 53.7-39.7Q55.5-41.5 55.5-45L55.5-45Q55.5-47.4 54.7-48.9Q53.8-50.5 52.3-51.3Q50.7-52.1 48.2-52.1L48.2-52.1L30.8-52.1',
  'ZM98.4 0L74.3 0L103.5-68.8L130-68.8L159.2 0L134.2 0L130.7-9.4L101.8-9.4L98.4 0Z',
  'M111.9-37L107.9-25.7L124.7-25.7L120.7-37Q120.3-38 119.8-39.5Q119.3-41 118.8-42.8Q118.2-44.6 117.7-46.4Q117.2-48.2 116.7-49.6L116.7-49.6L116-49.6Q115.5-47.8 114.8-45.6Q114-43.3 113.3-41.1Q112.6-38.8 111.9-37L111.9-37',
  'ZM230.8 0L167.4 0L167.4-68.8L190.8-68.8L190.8-18.3L230.8-18.3L230.8 0Z',
  'M307.5 0L240.3 0L240.3-68.8L306.8-68.8L306.8-52L263.7-52L263.7-42.8L300.7-42.8L300.7-26.8L263.7-26.8L263.7-16.8L307.5-16.8L307.5 0',
  'Z',
  'M340.9 0L319.2 0L319.2-68.8L339.4-68.8L367.1-42.1Q367.8-41.4 369.1-39.9Q370.4-38.5 371.8-36.9Q373.2-35.4 374.1-34.4L374.1-34.4L374.8-34.5Q374.8-36.6 374.8-39.2Q374.8-41.7 374.8-43.5L374.8-43.5L374.8-68.8L396.4-68.8L396.4 0L376.4 0L348.2-27.3Q346.3-29.2 344.6-31Q342.8-32.9 341.5-34.3L341.5-34.3L340.8-34.2Q340.9-32.6 340.9-30.3Q340.9-28.1 340.9-26.4L340.9-26.4L340.9 0',
  'Z',
  'M446.4 1.2L446.4 1.2Q427.4 1.2 417.9-7.7Q408.3-16.6 408.3-34.4L408.3-34.4Q408.3-46.2 413.3-54.1Q418.3-62 427.8-66Q437.2-70 450.5-70L450.5-70Q458.5-70 465.6-68.4Q472.6-66.7 478-63.4Q483.4-60.2 486.5-55.3Q489.5-50.4 489.5-43.9L489.5-43.9L466.9-43.9Q466.9-46.1 465.7-47.8Q464.5-49.6 462.4-50.8Q460.2-52 457.4-52.6Q454.6-53.2 451.5-53.2L451.5-53.2Q446.7-53.2 443.1-52.1Q439.5-51 437.1-48.8Q434.7-46.7 433.5-43.7Q432.3-40.6 432.3-36.6L432.3-36.6L432.3-32.2Q432.3-26.8 434.4-23.1Q436.4-19.4 440.5-17.5Q444.6-15.6 450.8-15.6L450.8-15.6Q455.1-15.6 458.8-16.6Q462.4-17.6 464.7-19.5Q466.9-21.4 466.9-24L466.9-24L466.9-24.4L448.6-24.4L448.6-38.4L489.5-38.4L489.5 0L476.8 0L474.6-7.2Q471.1-4.5 466.9-2.6Q462.6-0.7 457.6 0.3Q452.5 1.2 446.4 1.2',
  'Z',
  'M526.9 0L503.5 0L503.5-68.8L526.9-68.8L526.9-38.9L555.8-68.8L584.8-68.8L557.3-40.6L585.5 0L557.4 0L540.4-25.8L526.9-14L526.9 0',
  'Z',
  'M662 0L594.8 0L594.8-68.8L661.3-68.8L661.3-52L618.2-52L618.2-42.8L655.2-42.8L655.2-26.8L618.2-26.8L618.2-16.8L662-16.8L662 0',
  'Z',
].join('');

/**
 * The word as the LOKAL banner draws its own: a face from white into a
 * pale mint, top to bottom, over one soft copy of it, down and to the
 * right, in a deep green. No outline, no stacked sides.
 */
function PalengkeWord() {
  const id = `plgw${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="plg-word" viewBox="1 -74 672 90" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1="0" y1="-70" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D1FAE5" />
        </linearGradient>
        <filter id={`${id}s`} x="-5%" y="-30%" width="110%" height="160%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      <path className="plg-word-shadow" d={WORD_PATH} transform="translate(2.5 4.4)" filter={`url(#${id}s)`} />
      <path d={WORD_PATH} fill={`url(#${id}f)`} />
    </svg>
  );
}

/**
 * The top of the Palengke page, a green band: the search (on phones between
 * Back and ⋯), then the E-MOORM logo in a kicker and the word, centred.
 */
export default function PalengkeBand({
  q, onSearch, isPhone, onBack,
}) {
  return (
    <header className="plg-band">
      <div className="plg-band-bar">
        {isPhone && (
          <button type="button" className="plg-round" onClick={onBack} aria-label="Back">
            <CaretLeft size={22} weight="bold" />
          </button>
        )}
        <BandSearch key={q} q={q} onSearch={onSearch} />
        {isPhone && <PageMenu className="plg-menu" />}
      </div>

      <h1 className="plg-title notranslate" translate="no">
        <span className="sr-only">E-MOORM Palengke</span>
        <span className="plg-kicker" aria-hidden="true">
          <img src="/brand-icon-white.svg" alt="" width="24" height="24" />
          <span>E-MOORM</span>
        </span>
        <PalengkeWord />
      </h1>
    </header>
  );
}
