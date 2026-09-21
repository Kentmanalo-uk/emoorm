import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Storefront, Trash as Trash2, Plus, Minus, ArrowLeft, ShoppingCart, Star, MagnifyingGlass as Search } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import useIdentityGate from '../hooks/useIdentityGate';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ProductImage from '../components/ProductImage';
import './Cart.css';

const SUGGESTION_COUNT = 12;

const Cart = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const { requireVerifiedIdentity, identityDialog } = useIdentityGate();
  const {
    items,
    getItemCount,
    getTotalPrice,
    updateQuantity,
    removeItem,
    clearCart
  } = useCartStore();

  // "You may also like" — products from similar categories as cart items
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Refetch only when the set of products changes, not on quantity edits.
  const cartProductKey = [...new Set(items.map((i) => i.productId || i.id))].sort().join(',');
  const cartCategoryKey = [...new Set(items.map((i) => i.categoryId).filter(Boolean))].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const fetchSuggestions = async () => {
      setSuggestionsLoading(true);
      try {
        const inCart = new Set(cartProductKey ? cartProductKey.split(',') : []);
        const categoryIds = cartCategoryKey ? cartCategoryKey.split(',').slice(0, 2) : [];
        const requests = [
          ...categoryIds.map((categoryId) => axios.get('/products', { params: { categoryId, pageSize: SUGGESTION_COUNT } })),
          // Newest products fill the rest (and cover empty carts).
          axios.get('/products', { params: { pageSize: SUGGESTION_COUNT + inCart.size, sortBy: 'createdAt', sortOrder: 'desc' } }),
        ];
        const results = await Promise.allSettled(requests);
        const unique = new Map();
        results
          .filter((r) => r.status === 'fulfilled')
          .flatMap((r) => r.value.data || [])
          .forEach((product) => {
            if (!inCart.has(product.id) && !unique.has(product.id)) unique.set(product.id, product);
          });
        if (!cancelled) setSuggestions([...unique.values()].slice(0, SUGGESTION_COUNT));
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    };

    fetchSuggestions();
    return () => { cancelled = true; };
  }, [cartProductKey, cartCategoryKey]);

  const itemCount = getItemCount();
  const cartSearch = (searchParams.get('cartSearch') || '').trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!cartSearch) return items;
    return items.filter((item) => [
      item.name,
      item.storeName,
      ...Object.values(item.selectedVariations || {}),
    ].some((value) => String(value || '').toLowerCase().includes(cartSearch)));
  }, [items, cartSearch]);

  const [selectedIds, setSelectedIds] = useState(() => items.map((item) => item.id));

  useEffect(() => {
    setSelectedIds((prev) => {
      const known = new Set(prev);
      // Auto-select newly added items so the reference "all checked" default holds.
      const merged = items.map((item) => item.id).filter((id) => known.has(id));
      const additions = items.map((item) => item.id).filter((id) => !known.has(id));
      return [...merged, ...additions];
    });
  }, [items]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedSet.has(item.id)),
    [items, selectedSet]
  );
  const selectedCount = selectedItems.reduce((count, item) => count + item.quantity, 0);
  const subtotal = selectedItems.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );
  const shippingFee = subtotal === 0 || subtotal >= 500 ? 0 : 50;
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherLoading, setVoucherLoading] = useState(false);

  const applyVoucher = async () => {
    const code = voucherInput.trim();
    if (!code) return toast.error('Enter a voucher code');
    if (subtotal <= 0) return toast.error('Select items before applying a voucher');
    setVoucherLoading(true);
    try {
      const res = await axios.post('/vouchers/validate', { code, subtotal });
      setAppliedVoucher(res.data);
      toast.success(`Voucher ${res.data.voucher.code} applied`);
    } catch (err) {
      setAppliedVoucher(null);
      toast.error(err?.response?.data?.message || 'Invalid voucher code');
    } finally {
      setVoucherLoading(false);
    }
  };

  const clearVoucher = () => {
    setAppliedVoucher(null);
    setVoucherInput('');
  };

  // Re-validate voucher when subtotal changes and drop it if it no longer applies.
  useEffect(() => {
    if (!appliedVoucher) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.post('/vouchers/validate', {
          code: appliedVoucher.voucher.code,
          subtotal,
        });
        if (!cancelled) setAppliedVoucher(res.data);
      } catch {
        if (!cancelled) setAppliedVoucher(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const discountAmount = appliedVoucher ? Number(appliedVoucher.discountAmount || 0) : 0;
  const total = Math.max(0, subtotal + shippingFee - discountAmount);
  const allSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedSet.has(item.id));
  const selectedStoreCount = new Set(selectedItems.map((item) => item.storeId).filter(Boolean)).size;
  const multiStoreSelected = selectedStoreCount > 1;

  const toggleItemSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleStoreSelected = (storeItems) => {
    const ids = storeItems.map((item) => item.id);
    const allOn = ids.every((id) => selectedSet.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const toggleAllSelected = () => {
    const visibleIds = visibleItems.map((item) => item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

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

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      navigate('/login?redirect=/checkout');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Select at least one item to checkout');
      return;
    }
    const selectedStoreIds = new Set(selectedItems.map((item) => item.storeId).filter(Boolean));
    if (selectedStoreIds.size > 1) {
      toast.error('Checkout is limited to one store per order. Select items from one store only.');
      return;
    }
    if (!(await requireVerifiedIdentity())) return;
    navigate('/checkout', { state: { selectedIds, voucherCode: appliedVoucher?.voucher?.code || null } });
  };

  // Group items by store
  const itemsByStore = visibleItems.reduce((acc, item) => {
    const storeId = item.storeId || 'unknown';
    if (!acc[storeId]) {
      acc[storeId] = {
        storeName: item.storeName || 'Unknown Store',
        storeLogo: item.storeLogo || item.store?.logoUrl || item.store?.logo || null,
        items: [],
      };
    }
    acc[storeId].items.push(item);
    return acc;
  }, {});

  const suggestionsSection = (
    <>
      {(suggestions.length > 0 || suggestionsLoading) && (
        <div className="cart-suggestions">
          <div className="cart-suggestions-head">
            <h2 className="cart-suggestions-title">You may also like</h2>
            <Link to="/products" className="cart-suggestions-more">See more</Link>
          </div>
          {suggestionsLoading ? (
            <div className="cart-suggestions-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="cart-suggestion-card cart-suggestion-skel">
                  <div className="cart-suggestion-skel-img" />
                  <div className="cart-suggestion-skel-line" />
                  <div className="cart-suggestion-skel-line short" />
                </div>
              ))}
            </div>
          ) : (
            <div className="cart-suggestions-grid">
              {suggestions.map((product) => (
                <Link
                  key={product.id}
                  to={`/product/${product.slug}`}
                  className="cart-suggestion-card"
                >
                  <div className="cart-suggestion-image">
                    <ProductImage src={product.images?.[0]} alt={product.name} />
                  </div>
                  <div className="cart-suggestion-info">
                    <h3 className="cart-suggestion-name">{product.name}</h3>
                    <span className="cart-suggestion-price">
                      ₱{Number(product.price).toFixed(2)}
                    </span>
                    <div className="cart-suggestion-rating">
                      <div className="cart-suggestion-stars">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Star key={i} size={11} weight="fill" color="var(--t-warning-500, #f59e0b)" />
                        ))}
                      </div>
                      <span className="cart-suggestion-review-count">
                        ({product.reviewCount ?? 0})
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (items.length === 0) {
    return (
      <Layout>
        <div className="cart-page">
          <div className="container">
            <div className="cart-empty">
              <ShoppingCart size={64} weight="fill" />
              <h2>Your cart is empty</h2>
              <p>Start shopping to add items to your cart</p>
              <Link to="/products" className="btn-continue-shopping">
                <ShoppingBag size={20} />
                Browse Products
              </Link>
            </div>
            {suggestionsSection}
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
              <span className="cart-title-desktop">Shopping Cart</span>
              <span className="cart-title-mobile">Cart</span>
              <span className="cart-count">({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
            </h1>
            <button onClick={handleClearCart} className="btn-clear-cart">
              <Trash2 size={18} />
              <span className="clear-cart-desktop">Clear Cart</span>
              <span className="clear-cart-mobile">Clear</span>
            </button>
          </div>

          {/* Mobile-only select-all + clear row (matches app cart layout) */}
          <div className="cart-select-bar">
            <label className="cart-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAllSelected}
                aria-label="Select all items"
              />
              <span>Select all</span>
            </label>
            <button type="button" onClick={handleClearCart} className="cart-select-clear">
              <Trash2 size={14} /> Clear
            </button>
          </div>

          <div className="cart-layout">
            {/* Cart Items */}
            <div className="cart-items-section">
              {cartSearch && visibleItems.length === 0 && (
                <div className="cart-search-empty">
                  <Search size={30} weight="fill" />
                  <h2>No cart items found</h2>
                  <p>Try another product or store name.</p>
                </div>
              )}
              {Object.entries(itemsByStore).map(([storeId, storeData]) => {
                const storeAllSelected = storeData.items.every((it) => selectedSet.has(it.id));
                return (
                  <div key={storeId} className="cart-store-group">
                    <div className="store-group-header">
                      <label className="cart-store-check">
                        <input
                          type="checkbox"
                          checked={storeAllSelected}
                          onChange={() => toggleStoreSelected(storeData.items)}
                          aria-label={`Select all items from ${storeData.storeName}`}
                        />
                      </label>
                      <span className="cart-store-avatar">
                        {storeData.storeLogo ? (
                          <img
                            src={resolveImg(storeData.storeLogo)}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                              event.currentTarget.nextElementSibling?.classList.add('is-visible');
                            }}
                          />
                        ) : null}
                        <Storefront className={storeData.storeLogo ? '' : 'is-visible'} size={16} />
                      </span>
                      <span>{storeData.storeName}</span>
                    </div>

                    <div className="cart-items-list">
                      {storeData.items.map((item) => (
                        <div key={item.id} className="cart-item">
                          <label className="cart-item-check">
                            <input
                              type="checkbox"
                              checked={selectedSet.has(item.id)}
                              onChange={() => toggleItemSelected(item.id)}
                              aria-label={`Select ${item.name}`}
                            />
                          </label>
                          <Link
                            to={`/product/${item.slug || item.id}`}
                            className="cart-item-image"
                          >
                            <ProductImage src={item.image} alt={item.name} />
                          </Link>

                          <div className="cart-item-details">
                            <Link
                              to={`/product/${item.slug || item.id}`}
                              className="cart-item-name"
                            >
                              {item.name}
                            </Link>
                            <p className="cart-item-price">₱{Number(item.price).toFixed(2)}</p>
                            {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                              <p className="cart-item-variations">
                                {Object.entries(item.selectedVariations).map(([name, value]) => `${name}: ${value}`).join(' · ')}
                              </p>
                            )}
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
                );
              })}

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

                {appliedVoucher && discountAmount > 0 && (
                  <div className="summary-row" style={{ color: 'var(--t-primary-600, #059669)' }}>
                    <span>Voucher ({appliedVoucher.voucher.code})</span>
                    <span>-₱{discountAmount.toFixed(2)}</span>
                  </div>
                )}

                {subtotal < 500 && (
                  <div className="shipping-notice">
                    Add ₱{(500 - subtotal).toFixed(2)} more for free shipping
                  </div>
                )}

                <div className="summary-divider"></div>

                <div className="summary-total">
                  <span className="summary-total-label-desktop">Total</span>
                  <span className="summary-total-label-mobile">
                    {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected • Total
                  </span>
                  <span className="total-amount">₱{total.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  className="btn-checkout"
                  disabled={selectedItems.length === 0 || multiStoreSelected || selectedItems.some(item => item.stock === 0)}
                >
                  <span className="btn-checkout-label-desktop">Proceed to Checkout</span>
                  <span className="btn-checkout-label-mobile">Checkout</span>
                </button>

                {multiStoreSelected && (
                  <p className="checkout-warning">
                    You can only checkout items from one store per order. Please deselect items from other stores.
                  </p>
                )}

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

              {/* Voucher Section */}
              <div className="voucher-card">
                <h3 className="voucher-title">Have a voucher?</h3>
                <div className="voucher-input-group">
                  <input
                    type="text"
                    placeholder="Enter voucher code"
                    className="voucher-input"
                    value={voucherInput}
                    onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                    disabled={voucherLoading || !!appliedVoucher}
                  />
                  {appliedVoucher ? (
                    <button className="btn-apply-voucher" onClick={clearVoucher} type="button">Remove</button>
                  ) : (
                    <button
                      className="btn-apply-voucher"
                      onClick={applyVoucher}
                      disabled={voucherLoading || !voucherInput.trim() || subtotal === 0}
                      type="button"
                    >
                      {voucherLoading ? 'Checking…' : 'Apply'}
                    </button>
                  )}
                </div>
                {appliedVoucher && (
                  <p style={{ marginTop: 8, fontSize: 12, color: 'var(--t-primary-600, #059669)' }}>
                    {appliedVoucher.voucher.description || `Discount of ₱${discountAmount.toFixed(2)} applied.`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {suggestionsSection}
        </div>
      </div>
      {identityDialog}
    </Layout>
  );
};

export default Cart;
