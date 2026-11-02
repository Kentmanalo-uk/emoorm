import EmptyArt from '../components/ui/EmptyArt';
import { Link, useNavigate } from 'react-router-dom';
import { productKind } from '../lib/productKinds';
import { Trash as Trash2 } from '../lib/icons';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import useWishlistStore from '../store/wishlistStore';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './Wishlist.css';
import ProductTile from '../components/product/ProductTile';
import { confirmAction } from '../lib/confirm';

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
    // Live animals are bought by making an offer on their page.
    if (productKind(product) === 'LIVESTOCK') { navigate(`/product/${product.slug}`); return; }
    if (!isAuthenticated) { navigate('/login'); return; }
    try {
      addItem({ ...product, quantity: 1 });
      toast.success(`${product.name} added to cart`);
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
    }
  };

  const handleRemove = (product) => {
    removeItem(product.id);
    toast.success('Removed from wishlist');
  };

  const handleClearAll = async () => {
    if (!(await confirmAction({ title: 'Remove everything from your wishlist?', confirmLabel: 'Remove all', danger: true }))) return;
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
              {items.length > 0 && <p>{items.length} saved item{items.length !== 1 ? 's' : ''}</p>}
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
                <EmptyArt name="wishlist" size={96} />
                <p className="empty-state-text">Your wishlist is empty</p>
                <p className="empty-state-hint">
                  Save products you love and come back to them anytime.
                </p>
                <Link to="/products" className="empty-state-button">Browse Products</Link>
              </div>
            </div>
          ) : (
            <div className="wishlist-empty">
              <EmptyArt name="wishlist" size={112} />
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
  const remove = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove(product);
  };
  return (
    <ProductTile product={product} onAddToCart={product.stock === 0 ? undefined : (e, p) => onAddToCart(p)}>
      <button type="button" className="product-card-corner" onClick={remove} aria-label={`Remove ${product.name}`} title="Remove">
        <Trash2 size={14} />
      </button>
    </ProductTile>
  );
}
