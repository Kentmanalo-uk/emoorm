import { useEffect, useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import './SearchFilterSheet.css';

const TITLES = {
  all: 'Filters',
  municipality: 'Municipality',
  category: 'Category',
  price: 'Price',
};

/**
 * Phones: the search results' filters in a bottom sheet. `focus` is the chip
 * that opened it ('municipality' | 'category' | 'price'), showing only that
 * choice, or 'all' (the Filter chip) for every one. A choice applies as soon
 * as it is tapped; a single-choice sheet then closes.
 *
 * value: { municipalityId, category, minPrice, maxPrice }
 * onChange(partial) applies part of it; onReset() clears every filter.
 */
export default function SearchFilterSheet({
  focus, onClose, municipalities = [], categories = [], value, onChange, onReset,
}) {
  const open = Boolean(focus);
  const { mounted, closing } = useSheetPresence(open);
  // Each opening starts from the prices in force; the last section stays on
  // screen while the sheet slides away (focus is null by then).
  const [openedFor, setOpenedFor] = useState(focus);
  const [shown, setShown] = useState(focus);
  const [min, setMin] = useState(value.minPrice || '');
  const [max, setMax] = useState(value.maxPrice || '');
  if (focus !== openedFor) {
    setOpenedFor(focus);
    if (focus) {
      setShown(focus);
      setMin(value.minPrice || '');
      setMax(value.maxPrice || '');
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  const all = shown === 'all';
  const pick = (partial) => {
    onChange(partial);
    if (!all) onClose();
  };
  const option = (key, label, selected, partial) => (
    <button key={key} type="button" className={`sfs-option${selected ? ' is-on' : ''}`} onClick={() => pick(partial)}>
      <span>{label}</span>
      {selected && <Check size={18} weight="bold" />}
    </button>
  );

  return (
    <div className={`sfs-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`} onClick={onClose} role="presentation">
      <div className="sfs ui-sheet-panel" role="dialog" aria-modal="true" aria-label={TITLES[shown]} onClick={(e) => e.stopPropagation()}>
        <div className="sfs-head">
          <h2>{TITLES[shown]}</h2>
          <button type="button" className="sfs-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="sfs-body">
          {(all || shown === 'municipality') && (
            <section className="sfs-sec">
              {all && <h3>Municipality</h3>}
              <div className={`sfs-options${all ? ' is-grid' : ''}`}>
                {option('m-all', 'All municipalities', !value.municipalityId, { municipalityId: '' })}
                {municipalities.map((m) => option(m.id, m.name, value.municipalityId === m.id, { municipalityId: m.id }))}
              </div>
            </section>
          )}

          {(all || shown === 'category') && (
            <section className="sfs-sec">
              {all && <h3>Category</h3>}
              <div className={`sfs-options${all ? ' is-grid' : ''}`}>
                {option('c-all', 'All categories', !value.category, { category: '' })}
                {categories.map((c) => option(c.id, c.name, value.category === c.id, { category: c.id }))}
              </div>
            </section>
          )}

          {(all || shown === 'price') && (
            <section className="sfs-sec">
              {all && <h3>Price</h3>}
              <form
                className="sfs-price"
                onSubmit={(e) => { e.preventDefault(); pick({ minPrice: min, maxPrice: max }); }}
              >
                <div className="sfs-price-inputs">
                  <input type="number" inputMode="numeric" min="0" placeholder="₱ Min" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum price" />
                  <span aria-hidden="true">–</span>
                  <input type="number" inputMode="numeric" min="0" placeholder="₱ Max" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum price" />
                </div>
                <div className="sfs-price-actions">
                  <button type="button" className="sfs-btn" onClick={() => { setMin(''); setMax(''); pick({ minPrice: '', maxPrice: '' }); }}>Clear</button>
                  <button type="submit" className="sfs-btn is-primary">Apply price</button>
                </div>
              </form>
            </section>
          )}
        </div>

        {all && (
          <div className="sfs-foot">
            <button type="button" className="sfs-btn" onClick={() => { setMin(''); setMax(''); onReset(); }}>Reset all</button>
            <button type="button" className="sfs-btn is-primary" onClick={onClose}>Show results</button>
          </div>
        )}
      </div>
    </div>
  );
}
