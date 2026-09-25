import { useEffect, useRef, useState } from 'react';
import { X, Minus, Plus, Truck } from '@phosphor-icons/react';
import ProductImage from './ProductImage';
import './ProductOptionSheet.css';

const CLOSE_MS = 220;

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Phone bottom sheet for picking a product's options (Color, Size, Sack…)
 * and quantity before adding it to the cart or buying it now.
 *
 * mode: 'cart' | 'buy' | null (closed)
 * onConfirm(): runs the add or buy; the sheet only checks that every option
 * group has a pick first.
 */
export default function ProductOptionSheet({
  mode,
  product,
  image,
  selected,
  onSelect,
  quantity,
  onQuantity,
  onConfirm,
  onClose,
  busy = false,
}) {
  const [shown, setShown] = useState(mode);
  const [closing, setClosing] = useState(false);
  const [missing, setMissing] = useState('');
  const timer = useRef(null);
  const bodyRef = useRef(null);

  // Keep the sheet mounted while it slides away.
  useEffect(() => {
    clearTimeout(timer.current);
    if (mode) {
      setShown(mode);
      setClosing(false);
      setMissing('');
    } else if (shown) {
      setClosing(true);
      timer.current = setTimeout(() => { setShown(null); setClosing(false); }, CLOSE_MS);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('pos-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('pos-open');
    };
  }, [shown, onClose]);

  if (!shown || !product) return null;

  const variations = Array.isArray(product.variations) ? product.variations.filter((v) => v?.name) : [];
  const stock = Number(product.stock || 0);
  const outOfStock = stock <= 0;
  const picked = variations.filter((v) => selected[v.name]).map((v) => `${v.name}: ${selected[v.name]}`);
  const unpicked = variations.filter((v) => !selected[v.name]).map((v) => v.name);
  const total = Number(product.price || 0) * quantity;

  const setQty = (n) => onQuantity(Math.max(1, Math.min(stock || 1, n)));

  const confirm = () => {
    const first = variations.find((v) => !selected[v.name]);
    if (first) {
      setMissing(first.name);
      bodyRef.current?.querySelector(`[data-group="${CSS.escape(first.name)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onConfirm();
  };

  const label = shown === 'buy' ? 'Buy now' : 'Add to cart';

  return (
    <div className={`pos-root${closing ? ' is-closing' : ''}`}>
      <button type="button" className="pos-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="pos-sheet" role="dialog" aria-modal="true" aria-label={`${label}: choose options`}>
        <button type="button" className="pos-close" onClick={onClose} aria-label="Close">
          <X size={18} weight="bold" />
        </button>

        <div className="pos-head">
          <div className="pos-thumb">
            <ProductImage src={image} alt={product.name} />
          </div>
          <div className="pos-head-info">
            <div className="pos-price">{peso(product.price)}</div>
            <div className={`pos-stock${outOfStock ? ' is-out' : stock <= (product.lowStockThreshold || 5) ? ' is-low' : ''}`}>
              {outOfStock ? 'Out of stock' : stock <= (product.lowStockThreshold || 5) ? `Only ${stock} left` : `Stock: ${stock}`}
            </div>
            <div className="pos-picked">
              {variations.length === 0
                ? product.name
                : unpicked.length ? `Select ${unpicked.join(', ')}` : picked.join(', ')}
            </div>
          </div>
        </div>

        {product.store?.name && (
          <div className="pos-banner">
            <Truck size={17} weight="fill" />
            <span>Sold by <strong>{product.store.name}</strong></span>
            <span className="pos-banner-note">Delivery options at checkout</span>
          </div>
        )}

        <div className="pos-body" ref={bodyRef}>
          {variations.map((v) => {
            const options = Array.isArray(v.options) ? v.options : [];
            return (
              <section
                key={v.name}
                data-group={v.name}
                className={`pos-group${missing === v.name ? ' is-error' : ''}`}
              >
                <h3 className="pos-group-title">
                  {v.name} <span>({options.length})</span>
                </h3>
                <div className="pos-options" role="radiogroup" aria-label={v.name}>
                  {options.map((opt) => {
                    const on = selected[v.name] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`pos-option${on ? ' is-selected' : ''}`}
                        onClick={() => {
                          onSelect(v.name, on ? undefined : opt);
                          if (missing === v.name) setMissing('');
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {missing === v.name && <p className="pos-error">Please select {v.name}.</p>}
              </section>
            );
          })}

          <section className="pos-group pos-qty-row">
            <h3 className="pos-group-title">Quantity</h3>
            <div className="pos-qty">
              <button type="button" onClick={() => setQty(quantity - 1)} disabled={quantity <= 1} aria-label="Decrease quantity">
                <Minus size={15} weight="bold" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQty(parseInt(e.target.value.replace(/\D/g, '') || '1', 10))}
                aria-label="Quantity"
              />
              <button type="button" onClick={() => setQty(quantity + 1)} disabled={quantity >= stock} aria-label="Increase quantity">
                <Plus size={15} weight="bold" />
              </button>
            </div>
          </section>
          {!outOfStock && quantity >= stock && stock > 1 && (
            <p className="pos-note">You’ve reached the available stock.</p>
          )}
        </div>

        <div className="pos-foot">
          <button
            type="button"
            className={`pos-confirm pos-confirm-${shown}`}
            onClick={confirm}
            disabled={outOfStock || busy}
          >
            {outOfStock ? 'Out of stock' : busy ? 'Please wait…' : (
              <>
                <span>{label}</span>
                {shown === 'buy' && <small>{peso(total)}</small>}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
