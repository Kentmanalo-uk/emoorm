import toast from 'react-hot-toast';
import useCartStore from '../../store/cartStore';
import { saleInfo } from '../../lib/variantPricing';
import { parseImages } from '../../lib/media';
import { isStockless, minOrder, productKind } from '../../lib/productKinds';

/*
 * A product in a live's bag: what its button does. Straight into the cart
 * where it can be (the same line the product page's shelves add), its page
 * where a choice has to be made first (options, an offer for an animal).
 */

export const outOfStock = (p) => p.stock === 0 && !isStockless(p);

/** 'cart' | 'options' | 'offer' | 'sold-out' */
export const bagAction = (p) => {
  if (productKind(p) === 'LIVESTOCK') return 'offer';
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
    useCartStore.getState().addItem({
      id: p.id,
      productId: p.id,
      name: p.name,
      price: saleInfo(p).price,
      priceTiers: p.priceTiers,
      image: parseImages(p.images)[0] || '/placeholder-product.png',
      storeId: p.storeId || p.store?.id,
      storeName: p.store?.name,
      storeLogo: p.store?.logo || null,
      readyToSell: p.store?.readyToSell,
      vacationUntil: p.store?.vacationUntil,
      stock: p.stock,
      listingKind: p.listingKind,
      availability: p.availability,
      productType: p.productType,
      details: p.details,
      fulfillment: p.fulfillment,
      weightGrams: p.weightGrams,
      packageItems: p.packageItems,
      slug: p.slug,
      categoryId: p.categoryId,
      selectedVariations: null,
    }, minOrder(p));
    toast.success('Added to cart');
    return true;
  } catch (err) {
    toast.error(err.message || 'Could not add to cart');
    return false;
  }
}
