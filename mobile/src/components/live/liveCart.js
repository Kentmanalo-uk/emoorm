import useCartStore from '../../store/cartStore';
import { toast } from '../../lib/toast';
import { saleInfo } from '../../lib/variantPricing';
import { isLivestock, isStockless, minOrder } from '../orders/orderLines';
import { cartRefusal, quickCartLine } from '../product/productLib';

/*
 * A product in a live's bag: what its button does (as the website's
 * components/live/liveCart.js). Straight into the cart where it can be, its
 * page where a choice has to be made first (options, an offer for an animal).
 */

export const outOfStock = (p) => p.stock === 0 && !isStockless(p);

/** 'cart' | 'options' | 'offer' | 'sold-out' */
export const bagAction = (p) => {
  if (isLivestock(p)) return 'offer';
  if (outOfStock(p)) return 'sold-out';
  if (Array.isArray(p.variations) && p.variations.length > 0) return 'options';
  return 'cart';
};

export const BAG_LABELS = {
  cart: 'Add to cart',
  options: 'Choose',
  offer: 'Make an offer',
  'sold-out': 'Sold out',
};

/** Adds one to the cart; false when it could not. */
export function addFromLive(p) {
  try {
    const line = quickCartLine(p, saleInfo(p).price);
    const refusal = cartRefusal(line);
    if (refusal) throw new Error(refusal);
    useCartStore.getState().addItem(line, minOrder(p));
    toast.success('Added to cart');
    return true;
  } catch (err) {
    toast.error(err.message || 'Could not add to cart');
    return false;
  }
}
