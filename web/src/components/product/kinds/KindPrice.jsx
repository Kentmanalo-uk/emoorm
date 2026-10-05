import { priceUnit } from '../../../lib/productKinds';
import { startsFrom } from './buying';
import './KindPrice.css';

/**
 * A product card's price with what it is for: "from" before a paluto priced
 * by size, " / head" or " / package" after the amount. The amount is the
 * children, formatted as each card does it; other products show it alone.
 */
export default function KindPrice({ product, children }) {
  const unit = priceUnit(product);
  return (
    <>
      {startsFrom(product) && <span className="kind-price-from">from </span>}
      {children}
      {unit && <span className="kind-price-unit">{unit}</span>}
    </>
  );
}
