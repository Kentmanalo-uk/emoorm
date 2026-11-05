import { memo, useEffect } from 'react';
import { PushPin, ShoppingBag, X } from '../../lib/icons';
import { parseImages, resolveImg } from '../../lib/media';
import { peso } from '../../lib/format';
import { saleInfo } from '../../lib/variantPricing';
import { BAG_LABELS, bagAction } from './liveCart';
import './live.css';

/*
 * A live's product bag: every product the shop is showing, numbered as the
 * seller says them out loud ("number 3, ₱250"), in a sheet over the video
 * (the live keeps playing above it).
 *
 * Viewers: onAction(product) adds it or opens it. The seller (`host`): onPin.
 */
function LiveBagSheet({
  open, onClose, bag, pinnedId, onAction, onOpen, host = false, onPin,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`lv-sheet-wrap${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <button type="button" className="lv-sheet-scrim" onClick={onClose} aria-label="Close the bag" tabIndex={open ? 0 : -1} />
      <section className="lv-sheet" role="dialog" aria-label="Products in this live">
        <header className="lv-sheet-head">
          <ShoppingBag size={20} weight="fill" />
          <h2>{host ? 'Your products' : 'Shop the live'}</h2>
          <span className="lv-sheet-count">{bag.length}</span>
          <button type="button" className="lv-sheet-close" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}><X size={18} /></button>
        </header>
        {bag.length === 0 ? (
          <p className="lv-sheet-empty">{host ? 'No products in this live yet.' : 'The shop has not added products to this live yet.'}</p>
        ) : (
          <ol className="lv-bag">
            {bag.map((p, i) => {
              const { price, regular } = saleInfo(p);
              const action = bagAction(p);
              const pinned = p.id === pinnedId;
              return (
                <li key={p.id} className={`lv-bag-item${pinned ? ' is-pinned' : ''}`}>
                  <button type="button" className="lv-bag-photo" onClick={() => onOpen?.(p)} tabIndex={open ? 0 : -1}>
                    <img src={resolveImg(parseImages(p.images)[0]) || '/placeholder-product.png'} alt="" loading="lazy" decoding="async" />
                    <span className="lv-bag-no">{i + 1}</span>
                  </button>
                  <div className="lv-bag-info">
                    <button type="button" className="lv-bag-name" onClick={() => onOpen?.(p)} tabIndex={open ? 0 : -1}>{p.name}</button>
                    <div className="lv-bag-price">
                      <strong>{peso(price)}</strong>
                      {regular && <s>{peso(regular)}</s>}
                    </div>
                    {pinned && <span className="lv-bag-pin-note"><PushPin size={12} weight="fill" /> Showing now</span>}
                  </div>
                  {host ? (
                    <button type="button" className={`lv-bag-btn${pinned ? ' is-on' : ''}`} onClick={() => onPin(pinned ? null : p.id)} tabIndex={open ? 0 : -1}>
                      <PushPin size={15} weight={pinned ? 'fill' : 'regular'} /> {pinned ? 'Unpin' : 'Pin'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`lv-bag-btn${action === 'cart' ? ' is-buy' : ''}`}
                      disabled={action === 'sold-out'}
                      onClick={() => onAction(p)}
                      tabIndex={open ? 0 : -1}
                    >
                      {BAG_LABELS[action]}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

export default memo(LiveBagSheet);
