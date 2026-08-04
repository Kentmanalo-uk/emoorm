import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Plus, Minus, ArrowLeft, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './Cart.css';

const Cart = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const {
    items,
    getItemCount,
    getTotalPrice,
    updateQuantity,
    removeItem,
    clearCart
  } = useCartStore();

  const itemCount = getItemCount();
  const subtotal = getTotalPrice();
  const shippingFee = subtotal >= 500 ? 0 : 50;
  const total = subtotal + shippingFee;

  const handleQuantityChange = (itemId, newQuantity) => {
    if (newQuantity < 1) return;
    try {
      updateQuantity(itemId, newQuantity);
    } catch (error) {
      toast.error(error.message || 'Failed to update quantity');
    }
  };

  const handleRemoveItem = (itemId) => {
    if (window.confirm('Remove this item from cart?')) {
      removeItem(itemId);
    }
  };

  const handleClearCart = () => {
    if (window.confirm('Remove all items from cart?')) {
      clearCart();
    }
  };

  const handleCheckout = () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      navigate('/login?redirect=/checkout');
      return;
    }
    navigate('/checkout');
  };

  // Group items by store
  const itemsByStore = items.reduce((acc, item) => {
    const storeId = item.storeId || 'unknown';
    if (!acc[storeId]) {
      acc[storeId] = {
        storeName: item.storeName || 'Unknown Store',
        items: [],
      };
    }
    acc[storeId].items.push(item);
    return acc;
  }, {});

  if (items.length === 0) {
    return (
      <Layout>
        <div className="cart-page">
          <div className="container">
            <div className="cart-empty">
              <ShoppingCart size={64} />
              <h2>Your cart is empty</h2>
              <p>Start shopping to add items to your cart</p>
              <Link to="/products" className="btn-continue-shopping">
                <ShoppingBag size={20} />
                Browse Products
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="cart-page">
        <div className="container">
          {/* Breadcrumbs */}
          <div className="breadcrumbs">
            <Link to="/">Home</Link>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Shopping Cart</span>
          </div>

          {/* Page Header */}
          <div className="cart-header">
            <h1 className="cart-title">
              Shopping Cart
              <span className="cart-count">({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
            </h1>
            <button onClick={handleClearCart} className="btn-clear-cart">
              <Trash2 size={18} />
              Clear Cart
            </button>
          </div>

          <div className="cart-layout">
            {/* Cart Items */}
            <div className="cart-items-section">
              {Object.entries(itemsByStore).map(([storeId, storeData]) => (
                <div key={storeId} className="cart-store-group">
                  <div className="store-group-header">
                    <ShoppingBag size={18} />
                    <span>{storeData.storeName}</span>
                  </div>

                  <div className="cart-items-list">
                    {storeData.items.map((item) => (
                      <div key={item.id} className="cart-item">
                        <Link
                          to={`/product/${item.slug || item.id}`}
                          className="cart-item-image"
                        >
                          <img src={item.image} alt={item.name} />
                        </Link>

                        <div className="cart-item-details">
                          <Link
                            to={`/product/${item.slug || item.id}`}
                            className="cart-item-name"
                          >
                            {item.name}
                          </Link>
                          <p className="cart-item-price">₱{Number(item.price).toFixed(2)}</p>
                          {item.stock !== undefined && item.stock < 10 && item.stock > 0 && (
                            <span className="cart-item-stock-warning">
                              Only {item.stock} left in stock
                            </span>
                          )}
                          {item.stock === 0 && (
                            <span className="cart-item-out-of-stock">
                              Out of stock
                            </span>
                          )}
                        </div>

                        <div className="cart-item-actions">
                          <div className="cart-item-quantity">
                            <button
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              className="quantity-btn"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="quantity-display">{item.quantity}</span>
                            <button
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                              disabled={item.quantity >= (item.stock || 999)}
                              className="quantity-btn"
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <div className="cart-item-subtotal">
                            ₱{(item.price * item.quantity).toFixed(2)}
                          </div>

                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="btn-remove-item"
                            title="Remove item"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Continue Shopping */}
              <Link to="/products" className="btn-continue-shopping-link">
                <ArrowLeft size={18} />
                Continue Shopping
              </Link>
            </div>

            {/* Order Summary */}
            <div className="cart-summary-section">
              <div className="cart-summary-card">
                <h2 className="summary-title">Order Summary</h2>

                <div className="summary-row">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>

                <div className="summary-row">
                  <span>Shipping Fee</span>
                  <span>
                    {shippingFee === 0 ? (
                      <span className="free-shipping">FREE</span>
                    ) : (
                      `₱${shippingFee.toFixed(2)}`
                    )}
                  </span>
                </div>

                {subtotal < 500 && (
                  <div className="shipping-notice">
                    Add ₱{(500 - subtotal).toFixed(2)} more for free shipping
                  </div>
                )}

                <div className="summary-divider"></div>

                <div className="summary-total">
                  <span>Total</span>
                  <span className="total-amount">₱{total.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  className="btn-checkout"
                  disabled={items.some(item => item.stock === 0)}
                >
                  Proceed to Checkout
                </button>

                {items.some(item => item.stock === 0) && (
                  <p className="checkout-warning">
                    Please remove out of stock items before checkout
                  </p>
                )}

                {/* Payment Methods */}
                <div className="accepted-payments">
                  <p className="payments-label">We Accept:</p>
                  <div className="payment-icons">
                    <div className="payment-icon">Cash</div>
                    <div className="payment-icon">GCash</div>
                    <div className="payment-icon">Bank</div>
                  </div>
                </div>

                {/* Security Notice */}
                <div className="security-notice">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L3 3V7C3 10.5 5.5 13.5 8 14.5C10.5 13.5 13 10.5 13 7V3L8 1Z"
                      stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                  <span>Secure Checkout</span>
                </div>
              </div>

              {/* Voucher Section (Optional) */}
              <div className="voucher-card">
                <h3 className="voucher-title">Have a voucher?</h3>
                <div className="voucher-input-group">
                  <input
                    type="text"
                    placeholder="Enter voucher code"
                    className="voucher-input"
                  />
                  <button className="btn-apply-voucher">Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Cart;
