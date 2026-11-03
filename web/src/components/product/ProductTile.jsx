import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Star } from '../../lib/icons';
import ProductImage from '../ProductImage';
import ImageOverlay from './ImageOverlay';
import { SaleWas } from '../ui/SaleTag';
import { ProductTodayTag } from '../today/TodayTag';
import useProductPeek from '../peek/useProductPeek';
import KindPrice from './kinds/KindPrice';
import { notTakingOrders } from '../../lib/availability';
import { parseImages } from '../../lib/media';
import { isStockless } from '../../lib/productKinds';
import { saleInfo } from '../../lib/variantPricing';
import './ProductTile.css';

/** Stars only from real reviews; sold only from settled orders; else "New". */
function ProductStats({ product }) {
  const reviews = Number(product.reviewCount || 0);
  const rating = Number(product.averageRating || 0);
  const sold = Number(product.soldCount || 0);
  if (reviews === 0 && sold === 0) {
    return (
      <div className="product-rating-row">
        <span className="product-review-count product-new">New</span>
      </div>
    );
  }
  return (
    <div className="product-rating-row">
      {reviews > 0 && (
        <>
          <div className="product-stars" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star
                key={i}
                size={11}
                weight={i < Math.round(rating) ? 'fill' : 'regular'}
                color={i < Math.round(rating) ? 'var(--t-warning-500, #f59e0b)' : 'var(--t-neutral-300, #d1d5db)'}
              />
            ))}
          </div>
          <span className="product-review-count">({reviews})</span>
        </>
      )}
      {sold > 0 && <span className="product-review-count product-sold">{sold} sold</span>}
    </div>
  );
}

/**
 * The product card, everywhere a product is shown as a card: Home's design,
 * in one place so no page can drift from it.
 *
 * onAddToCart(event, product): adds the quick cart button on the photo.
 * store: the shop, for a product that does not carry its own (the preview).
 * preview: not a link, so taps stay in the shop builder.
 * children: what a page adds on the photo (a Featured badge, a remove button).
 */
export default memo(function ProductTile({
  product, onAddToCart, store, preview = false, className = '', children,
}) {
  const peekProduct = useProductPeek();
  const cls = `product-card ${className}`.trim();
  const body = (
    <>
      <div className="product-image">
        <ProductImage src={parseImages(product.images)[0]} alt={product.name} />
        <ImageOverlay product={product} store={store || product.store} />
        {product.stock === 0 && !isStockless(product) && !notTakingOrders(product) && (
          <div className="product-badge out-of-stock">Out of Stock</div>
        )}
        {children}
        {onAddToCart && !preview && !notTakingOrders(product) && (
          <button
            type="button"
            className="product-cart-fab"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddToCart(e, product);
            }}
            aria-label="Add to cart"
          >
            <ShoppingCart size={16} />
          </button>
        )}
      </div>
      <div className="product-info">
        <span className="product-name"><ProductTodayTag product={product} />{product.name}</span>
        <span className="product-price"><KindPrice product={product}>₱{saleInfo(product).price.toFixed(2)}</KindPrice> <SaleWas product={product} compact /></span>
        <ProductStats product={product} />
      </div>
    </>
  );
  if (preview) return <div className={cls}>{body}</div>;
  return <Link to={`/product/${product.slug}`} className={cls} {...peekProduct(product, { store })}>{body}</Link>;
});
