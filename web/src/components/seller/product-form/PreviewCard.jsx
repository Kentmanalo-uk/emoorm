import { Image as ImageIcon } from '@phosphor-icons/react';
import { resolveImg } from '../../../lib/media';
import { kindFacts, priceUnit } from '../../../lib/productKinds';
import { peso } from './formState';

const BADGES = {
  READY_TO_EAT: 'Available today',
  COOK_TO_ORDER: 'Cooked to order',
  LIVESTOCK: 'Live animal',
};

/** What buyers will see: the product's card with its key facts. */
export default function PreviewCard({ draft, kind, way, todayQty }) {
  const cover = draft.images[0];
  const facts = kind ? kindFacts(draft) : [];
  const unit = priceUnit(draft);
  const price = draft.fromPrice && draft.priceTo ? `from ${peso(draft.price)}` : peso(draft.price);
  return (
    <div className="pf-preview">
      <div className="pf-preview-img">
        {cover ? <img src={resolveImg(cover) || cover} alt="" /> : <span><ImageIcon size={32} /> No photo yet</span>}
        {BADGES[kind] && <em className="pf-preview-badge">{BADGES[kind]}</em>}
      </div>
      <div className="pf-preview-body">
        <strong className="pf-preview-name">{draft.name || 'Your product name'}</strong>
        <div className="pf-preview-price">
          {draft.salePrice ? (
            <>
              <b>{peso(draft.salePrice)}{unit}</b>
              <s>{peso(draft.price)}</s>
            </>
          ) : (
            <b>{draft.price > 0 ? `${price}${unit}` : 'No price yet'}</b>
          )}
        </div>
        {(facts.length > 0 || todayQty > 0) && (
          <ul className="pf-preview-facts">
            {facts.map((f) => <li key={f}>{f}</li>)}
            {todayQty > 0 && <li>{todayQty} left today</li>}
          </ul>
        )}
        {way && <span className="pf-preview-way">{way}</span>}
      </div>
    </div>
  );
}
