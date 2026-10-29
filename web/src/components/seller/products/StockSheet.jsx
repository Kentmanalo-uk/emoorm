import { useState } from 'react';
import { Minus, Plus } from '../../../lib/icons';
import PhoneSheet from '../PhoneSheet';
import { BusyLabel } from '../../ui/Spinner';
import {
  STOCK_MODES, stockActionLabel, stockDelta, stockWords,
} from './stock';

const QUICK = [5, 10, 20, 50];

/**
 * Change one product's stock in a sheet: Add, Remove or Set to, with a
 * counter and quick amounts. The button says exactly what will happen
 * ("Add 5 items", "Set to 12"). Phones open it from a row; computers from
 * the dashboard's "Running low" (/seller/products?restock=<id>).
 *
 * onSave(delta, { mode, amount }) resolves true when it went through.
 */
export default function StockSheet({ product, busy = false, onClose, onSave }) {
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('1');
  const words = stockWords(product);
  const current = Number(product?.stock) || 0;
  const delta = product ? stockDelta(mode, amount, current) : null;
  const n = Number(amount) || 0;

  const pickMode = (key) => {
    setMode(key);
    // "Set to" starts from what there is now; the others from one.
    setAmount(key === 'set' ? String(current) : '1');
  };
  const step = (by) => setAmount((v) => String(Math.max(0, (Number(v) || 0) + by)));

  const problem = mode === 'remove' && n > current
    ? `There ${current === 1 ? 'is' : 'are'} only ${current} now.`
    : mode === 'set' && String(amount).trim() !== '' && n === current
      ? `It is already ${current}.`
      : '';

  return (
    <PhoneSheet
      open={!!product}
      title={product ? `Stock: ${product.name}` : 'Stock'}
      className="sp-stock-sheet"
      onClose={onClose}
      footer={(
        <button
          type="button"
          className="scm-btn"
          disabled={busy || delta === null}
          onClick={() => onSave(delta, { mode, amount: n })}
        >
          {busy ? <BusyLabel>Saving…</BusyLabel> : stockActionLabel(product, mode, amount)}
        </button>
      )}
    >
      {product && (
        <div className="sp-stock">
          <p className="sp-stock-now">{words.now}: <strong>{current}</strong></p>
          <div className="sp-stock-modes" role="radiogroup" aria-label="What to do">
            {STOCK_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                className={mode === m.key ? 'is-on' : ''}
                onClick={() => pickMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="sp-stock-stepper">
            <button type="button" aria-label="One less" onClick={() => step(-1)} disabled={n <= 0}>
              <Minus size={20} weight="bold" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label={mode === 'set' ? 'How many there are now' : mode === 'remove' ? 'How many to remove' : 'How many to add'}
              aria-describedby="sp-stock-help"
            />
            <button type="button" aria-label="One more" onClick={() => step(1)}>
              <Plus size={20} weight="bold" />
            </button>
          </div>
          {mode !== 'set' && (
            <div className="sp-stock-quick" role="group" aria-label="Quick amounts">
              {QUICK.map((q) => (
                <button key={q} type="button" onClick={() => setAmount(String(q))}>
                  {mode === 'remove' ? '−' : '+'}{q}
                </button>
              ))}
            </div>
          )}
          <p className={`sp-stock-help${problem ? ' is-warn' : ''}`} id="sp-stock-help" aria-live="polite">
            {problem || (mode === 'set'
              ? 'After counting: type how many you have now.'
              : mode === 'remove'
                ? 'For ones that spoiled, broke or sold outside Emoorm.'
                : 'For new stock that came in.')}
            {!problem && delta !== null && ` You will have ${current + delta}.`}
          </p>
        </div>
      )}
    </PhoneSheet>
  );
}
