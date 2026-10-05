import { Image as ImageIcon, PencilSimple } from '@phosphor-icons/react';
import { resolveImg } from '../../../lib/media';
import { kindFacts, priceUnit } from '../../../lib/productKinds';
import { peso } from './formState';

const BADGES = {
  READY_TO_EAT: 'Available today',
  COOK_TO_ORDER: 'Cooked to order',
  LIVESTOCK: 'Live animal',
};

/** What buyers will see: the product's card with its key facts. */
export function PreviewCard({ draft, kind, way, todayQty }) {
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

/**
 * Step 4: the preview, and on phones a short sum-up of each step with a way
 * back to change it.
 * @param {Array<{ step, title, lines }>} sections - the sum-up (phones)
 */
export default function ReviewStep({ draft, kind, way, todayQty, sections, onEdit }) {
  return (
    <>
      <PreviewCard draft={draft} kind={kind} way={way} todayQty={todayQty} />
      {sections && (
        <div className="pf-sumup">
          {sections.map((s) => (
            <div className="pf-sumup-row" key={s.step}>
              <div>
                <strong>{s.title}</strong>
                {s.lines.filter(Boolean).map((line) => <span key={line}>{line}</span>)}
              </div>
              <button type="button" className="pf-sumup-edit" onClick={() => onEdit(s.step)} aria-label={`Change ${s.title}`}>
                <PencilSimple size={15} /> Change
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
