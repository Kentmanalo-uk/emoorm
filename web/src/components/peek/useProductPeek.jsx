import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowSquareOut, HandCoins, Heart, ShareNetwork, ShoppingCart, SlidersHorizontal, Storefront,
} from '@phosphor-icons/react';
import useAuthStore from '../../store/authStore';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import { saleInfo } from '../../lib/variantPricing';
import { parseImages } from '../../lib/media';
import {
  isStockless, minOrder, priceUnit, productKind,
} from '../../lib/productKinds';
import { startsFrom } from '../product/kinds/buying';
import { peekProps, sharePeek } from './peekCore';
import { ProductPeekCard } from './PeekCards';

/*
 * A product's long-press preview: its photo, name, price, rating and shop,
 * with Add to cart (or Choose options / Make an offer), the wishlist, the
 * shop and Share under it.
 *
 *   const peekProduct = useProductPeek();
 *   <Link to={…} {...peekProduct(product, { store, extra })}>
 *
 * `store`: the shop, for lists whose products leave it out (the shop's own
 * page); `onOpen` defaults to the product page; `extra` adds actions after
 * the usual ones; `cart: false` leaves out Add to cart.
 */

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const outOfStock = (p) => p.stock === 0 && !isStockless(p);

export default function useProductPeek() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addItem = useCartStore((s) => s.addItem);

  return (product, {
    store, onOpen, extra = [], cart = true,
  } = {}) => peekProps(() => {
    if (!product?.slug && !onOpen) return null;
    const p = product.store || !store ? product : { ...product, store };
    const page = `/product/${p.slug}`;
    const openPage = () => navigate(page);
    const open = onOpen || openPage;
    const signIn = () => navigate(`/login?redirect=${encodeURIComponent(page)}`);
    const wishlisted = useWishlistStore.getState().items.some((item) => item.id === p.id);

    // As the product page's shelves add one: straight into the cart.
    const addToCart = () => {
      if (!isAuthenticated) { signIn(); return; }
      try {
        addItem({
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
      } catch (err) {
        toast.error(err.message || 'Could not add to cart');
      }
    };
    const toggleWishlist = () => {
      if (!isAuthenticated) { signIn(); return; }
      useWishlistStore.getState().toggleItem(p);
      toast.success(wishlisted ? 'Removed from wishlist' : 'Added to wishlist');
    };
    const share = () => sharePeek({
      title: p.name,
      text: `${p.name} — ${startsFrom(p) ? 'from ' : ''}${peso(saleInfo(p).price)}${priceUnit(p)} on E-MOORM`,
      url: `${window.location.origin}${page}`,
    });

    let buy = null;
    if (cart && p.slug) {
      if (productKind(p) === 'LIVESTOCK') buy = { key: 'offer', label: 'Make an offer', Icon: HandCoins, onClick: openPage };
      else if (outOfStock(p)) buy = null;
      // A list that left out the options: no quick add, its page has it.
      else if (p.variations === undefined) buy = null;
      else if (Array.isArray(p.variations) && p.variations.length > 0) {
        buy = { key: 'options', label: 'Choose options', Icon: SlidersHorizontal, onClick: openPage };
      } else buy = { key: 'cart', label: 'Add to cart', Icon: ShoppingCart, onClick: addToCart };
    }

    return {
      label: p.name,
      content: <ProductPeekCard product={p} />,
      onOpen: open,
      actions: [
        { key: 'open', label: 'View product', Icon: ArrowSquareOut, onClick: open },
        buy,
        p.id && p.slug ? {
          key: 'wish',
          label: wishlisted ? 'Remove from wishlist' : 'Add to wishlist',
          Icon: Heart,
          iconWeight: wishlisted ? 'fill' : 'regular',
          onClick: toggleWishlist,
        } : null,
        p.store?.slug ? { key: 'shop', label: 'Visit shop', Icon: Storefront, onClick: () => navigate(`/store/${p.store.slug}`) } : null,
        p.slug ? { key: 'share', label: 'Share', Icon: ShareNetwork, onClick: share } : null,
        ...extra,
      ],
    };
  });
}
