import { useState } from 'react';
import { CaretLeft, MagnifyingGlass, X } from '../../lib/icons';
import PageMenu from '../layout/PageMenu';
import PalengkeBasket from './PalengkeBasket';
import {
  PlgCalamansi, PlgLeaf, PlgSparkle, PlgTomato,
} from './PalengkeMarks';

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

/**
 * The top of the Palengke page, a campaign band: the search (on phones
 * between Back and ⋯), a small kicker, the huge word, the yellow strip,
 * and the basket of produce bursting out on the right with a few pieces
 * floating round it. Behind: the green, a pink sun, light rays, a faint
 * checked floor and a little confetti.
 */
export default function PalengkeBand({
  q, onSearch, isPhone, onBack,
}) {
  return (
    <header className="plg-band">
      <div className="plg-band-bg" aria-hidden="true">
        <span className="plg-rays" />
        <span className="plg-sun" />
        <span className="plg-floor" />
        <i className="plg-bit is-ring" />
        <i className="plg-bit is-dot" />
        <i className="plg-bit is-tri" />
        <i className="plg-bit is-plus" />
        <i className="plg-bit is-ring2" />
        <i className="plg-bit is-dash" />
      </div>

      <div className="plg-band-bar">
        {isPhone && (
          <button type="button" className="plg-round" onClick={onBack} aria-label="Back">
            <CaretLeft size={22} weight="bold" />
          </button>
        )}
        <BandSearch key={q} q={q} onSearch={onSearch} />
        {isPhone && <PageMenu className="plg-menu" />}
      </div>

      <div className="plg-band-body">
        <div className="plg-band-copy notranslate" translate="no">
          <h1 className="plg-title">
            <span className="plg-kicker">E-MOORM</span>
            <span className="plg-word" data-text="Palengke">Palengke</span>
          </h1>
          <p className="plg-strip">
            <span className="plg-strip-lead">Gulay, prutas at iba pa</span>
            <span className="plg-strip-dot" aria-hidden="true" />
            <span>mula sa Mindoro</span>
          </p>
        </div>
        <div className="plg-band-art" aria-hidden="true">
          <PlgSparkle className="plg-prop is-spark" size={28} />
          <PlgLeaf className="plg-prop is-leaf" size={40} />
          <PalengkeBasket size={isPhone ? 176 : 340} className="plg-basket" />
          <PlgTomato className="plg-prop is-tomato" size={40} />
          <PlgCalamansi className="plg-prop is-lime" size={30} />
          <PlgSparkle className="plg-prop is-spark2" size={18} />
        </div>
      </div>
    </header>
  );
}
