import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, Trash as Trash2, Package } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import { resolveImg } from '../lib/media';
import useWishlistStore from '../store/wishlistStore';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './Wishlist.css';

export default function Wishlist() {
  return (
    <Layout>
      <WishlistContent />
    </Layout>
  );
}

export function WishlistContent({ hideBreadcrumbs = false } = {}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { items, removeItem, clear } = useWishlistStore();
  const { addItem } = useCartStore();

  const handleAddToCart = (product) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    addItem({ ...product, quantity: 1 });
    toast.success(`${product.name} added to cart`);
  };

  const handleRemove = (product) => {
    removeItem(product.id);
    toast.success('Removed from wishlist');
  };

  const handleClearAll = () => {
    if (!window.confirm('Remove all items from your wishlist?')) return;
    clear();
    toast.success('Wishlist cleared');
  };

  return (
    <div className={hideBreadcrumbs ? 'profile-page-wrap' : 'wishlist-page'}>
      <div className={hideBreadcrumbs ? '' : 'wishlist-container'}>

        {!hideBreadcrumbs && (
          <div className="wishlist-breadcrumbs">
            <Link to="/">Home</Link><span>/</span>
            <span>Wishlist</span>
          </div>
        )}

        {hideBreadcrumbs ? (
          <header className="profile-page-header wishlist-page-header">
            <h1 className="profile-page-title">My Wishlist</h1>
            {items.length > 0 && (
              <button className="wishlist-clear-btn" onClick={handleClearAll}>
                <Trash2 size={14} /> Clear all
              </button>
            )}
          </header>
        ) : (
          <div className="wishlist-header">
            <div>
              <h1>My Wishlist</h1>
              <p>{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
            </div>
            {items.length > 0 && (
              <button className="wishlist-clear-btn" onClick={handleClearAll}>
                <Trash2 size={14} /> Clear all
              </button>
            )}
          </div>
        )}

        {items.length === 0 ? (
          hideBreadcrumbs ? (
            <div className="profile-section">
              <div className="empty-state">
                <Heart size={40} strokeWidth={1.5} />
                <p className="empty-state-text">Your wishlist is empty</p>
                <p className="empty-state-hint">
                  Save products you love and come back to them anytime.
                </p>
                <Link to="/products" className="empty-state-button">Browse Products</Link>
              </div>
            </div>
          ) : (
            <div className="wishlist-empty">
              <Heart size={56} />
              <h2>Your wishlist is empty</h2>
              <p>Save products you love and come back to them anytime.</p>
              <Link to="/products" className="wishlist-shop-btn">
                Browse Products
              </Link>
            </div>
          )
        ) : (
          <div className="wishlist-grid">
            {items.map((product) => (
              <WishlistCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WishlistCard({ product, onAddToCart, onRemove }) {
  const price = Number(product.price);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount = compareAt && compareAt > price
    ? Math.round(((compareAt - price) / compareAt) * 100)
    : null;
  const images = Array.isArray(product.images) ? product.images : [];

  return (
    <div className="wishlist-card">
      <Link to={`/product/${product.slug}`} className="wishlist-card-img-wrap">
        {images[0]
          ? <img src={resolveImg(images[0]) || images[0]} alt={product.name} />
          : <div className="wishlist-card-no-img"><Package size={28} /></div>}
        {discount && <span className="wishlist-card-discount">-{discount}%</span>}
      </Link>

      <button className="wishlist-card-remove" onClick={() => onRemove(product)} title="Remove">
        <Trash2 size={14} />
      </button>

      <div className="wishlist-card-body">
        <Link to={`/product/${product.slug}`} className="wishlist-card-name">
          {product.name}
        </Link>

        {product.store?.name && (
          <Link to={`/store/${product.store.slug}`} className="wishlist-card-store">
            {product.store.name}
          </Link>
        )}

        <div className="wishlist-card-price-row">
          <span className="wishlist-card-price">₱{price.toFixed(2)}</span>
          {compareAt && <span className="wishlist-card-compare">₱{compareAt.toFixed(2)}</span>}
        </div>

        <button
          className="wishlist-card-cart-btn"
          onClick={() => onAddToCart(product)}
          disabled={product.stock === 0}
        >
          <ShoppingCart size={14} />
          {product.stock === 0 ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
