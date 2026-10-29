import { useEffect, useRef, useState } from 'react';
import { PencilSimple } from '@phosphor-icons/react';
import PhoneSheet from '../PhoneSheet';
import { BusyLabel } from '../../ui/Spinner';
import { peso } from '../../../lib/format';

/** A typed price as a number, or null when it isn't one buyers can pay. */
const priceValue = (text) => {
  const v = Number(String(text).replace(/,/g, '').trim());
  return Number.isFinite(v) && v > 0 && v <= 10000000 ? Math.round(v * 100) / 100 : null;
};

/**
 * Computers: the price in a My products row, changed where it is ("Change"
 * turns it into a box; Enter saves, Escape puts it back), like the stock
 * beside it. onSave(price) resolves true when it went through.
 */
export function InlinePrice({ product, unit, busy = false, disabledReason = '', onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = () => {
    setValue(String(Number(product.price) || ''));
    setEditing(true);
  };
  const price = priceValue(value);
  const same = price !== null && price === Number(product.price);
  const save = async () => {
    if (price === null || busy) return;
    if (same) { setEditing(false); return; }
    if (await onSave(price)) setEditing(false);
  };

  if (!editing) {
    return (
      <span className="sp-price">
        <span className="sp-price-value">
          {peso(product.price)}
          {unit && <span className="product-price-unit">{unit}</span>}
        </span>
        <button
          type="button"
          className="sp-price-change"
          onClick={start}
          disabled={Boolean(disabledReason)}
          title={disabledReason || `Change the price of ${product.name}`}
          aria-label={`Change the price of ${product.name}`}
        >
          <PencilSimple size={12} /> Change
        </button>
      </span>
    );
  }

  return (
    <form
      className="sp-price-form"
      onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
    >
      <span className="sp-price-input">
        <span aria-hidden="true">₱</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          aria-label={`New price of ${product.name}`}
          aria-invalid={price === null}
          disabled={busy}
        />
      </span>
      <button type="submit" className="btn-seller-outline product-restock-btn" disabled={busy || price === null}>
        {busy ? <BusyLabel>Saving…</BusyLabel> : 'Save'}
      </button>
      <button type="button" className="sp-price-cancel" onClick={() => setEditing(false)} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

/** Phones: the same change in a sheet, from a row's ⋯. */
export function PriceSheet({ product, busy = false, onClose, onSave }) {
  const [value, setValue] = useState(() => String(Number(product?.price) || ''));
  const price = priceValue(value);
  const same = price !== null && product && price === Number(product.price);
  return (
    <PhoneSheet
      open={!!product}
      title="Change price"
      onClose={onClose}
      footer={(
        <button
          type="button"
          className="scm-btn"
          disabled={busy || price === null || same}
          onClick={() => onSave(price)}
        >
          {busy ? <BusyLabel>Saving…</BusyLabel> : price !== null && !same ? `Set to ${peso(price)}` : 'Save'}
        </button>
      )}
    >
      {product && (
        <div className="sp-stock">
          <p className="sp-stock-now">{product.name}: now <strong>{peso(product.price)}</strong></p>
          <label className="sp-price-input sp-price-input--big">
            <span aria-hidden="true">₱</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
              aria-label="New price"
              aria-invalid={price === null}
            />
          </label>
          <p className="sp-stock-help">Buyers see the new price as soon as you save. Orders already placed keep theirs.</p>
        </div>
      )}
    </PhoneSheet>
  );
}
