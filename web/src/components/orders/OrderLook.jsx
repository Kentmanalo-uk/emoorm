/*
 * An order in a seller's list (lib/orderLook.js): the product's photo with
 * where the order stands as a solid badge on its corner, and the status in
 * words over a short track of its four steps. No pale tinted chips: colour
 * only where it says something.
 */
import { Package } from '../../lib/icons';
import { resolveImg, srcSetFor } from '../../lib/media';
import { ORDER_STEPS, orderStage } from '../../lib/orderLook';
import './OrderLook.css';

/**
 * The product's photo. With a status, its badge sits on the corner; a list
 * that is all one status (the completed orders) leaves it off.
 */
export function OrderThumb({ photo, status, className = '' }) {
  const stage = status ? orderStage(status) : null;
  const src = photo ? resolveImg(photo) : null;
  return (
    <span className={`ord-thumb ${className}`.trim()}>
      <span className="ord-thumb-img">
        {src
          ? <img src={src} srcSet={srcSetFor(photo)} sizes="64px" alt="" loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} />
          : <Package size={22} weight="fill" />}
      </span>
      {stage && (
        <span className={`ord-badge is-${stage.tone}`} aria-hidden="true">
          <stage.Icon size={11} weight="bold" />
        </span>
      )}
    </span>
  );
}

/**
 * Where it stands in words, over the track of its four steps: the steps done
 * filled in the status's colour, the one under way breathing. A cancelled
 * order is its words alone.
 */
export function OrderState({ status, label, className = '' }) {
  const { tone, step } = orderStage(status);
  const live = step > 0 && step < ORDER_STEPS;
  return (
    <span className={`ord-state is-${tone} ${className}`.trim()}>
      <span className="ord-state-label">{label}</span>
      {step > 0 && (
        <span className="ord-track" aria-hidden="true">
          {Array.from({ length: ORDER_STEPS }, (_, i) => (
            <i key={i} className={i < step ? (i === step - 1 && live ? 'is-now' : 'is-done') : undefined} />
          ))}
        </span>
      )}
    </span>
  );
}
