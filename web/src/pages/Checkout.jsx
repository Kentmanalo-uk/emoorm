import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Package, CreditCard, CheckCircle, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './Checkout.css';

const Checkout = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { items, getTotalPrice, clearCart } = useCartStore();

  const [currentStep, setCurrentStep] = useState(1);
  // Delivery address fields â€” pre-filled from profile
  const [deliveryForm, setDeliveryForm] = useState({
    fullName: '',
    contactNumber: '',
    street: '',
    barangay: '',
    municipality: '',
  });
  const [deliveryErrors, setDeliveryErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState(null);

  const subtotal = getTotalPrice();
  const shippingFee = subtotal >= 500 ? 0 : 50;
  const total = subtotal + shippingFee;

  // Pre-fill delivery form from the user's stored profile
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login?redirect=/checkout'); return; }
    if (items.length === 0) { navigate('/cart'); return; }
    if (user) {
      setDeliveryForm({
        fullName: user.fullName || '',
        contactNumber: user.contactNumber || '',
        street: user.address || '',
        barangay: user.barangay || '',
        municipality: user.municipality?.name || '',
      });
    }
  }, [isAuthenticated, items, navigate, user]);

  const handleDeliveryChange = (e) => {
    const { name, value } = e.target;
    setDeliveryForm((prev) => ({ ...prev, [name]: value }));
    if (deliveryErrors[name]) setDeliveryErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateDelivery = () => {
    const errs = {};
    if (!deliveryForm.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!deliveryForm.contactNumber.trim()) errs.contactNumber = 'Contact number is required.';
    if (!deliveryForm.street.trim()) errs.street = 'Street / house address is required.';
    if (!deliveryForm.barangay.trim()) errs.barangay = 'Barangay is required.';
    if (!deliveryForm.municipality.trim()) errs.municipality = 'Municipality is required.';
    setDeliveryErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goToStep = (step) => {
    if (step === 1) { setCurrentStep(1); return; }
    if (step === 2) {
      if (!validateDelivery()) return;
      setCurrentStep(2);
    } else if (step === 3 && paymentMethod) {
      setCurrentStep(3);
    }
  };

  const buildDeliveryAddress = () =>
    `${deliveryForm.street}, ${deliveryForm.barangay}, ${deliveryForm.municipality}, Oriental Mindoro`;

  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    try {
      // Group items by store
      const itemsByStore = items.reduce((acc, item) => {
        if (!acc[item.storeId]) acc[item.storeId] = [];
        acc[item.storeId].push(item);
        return acc;
      }, {});

      const orderPromises = Object.entries(itemsByStore).map(([storeId, storeItems]) =>
        axios.post('/orders', {
          storeId,
          deliveryAddress: buildDeliveryAddress(),
          contactNumber: deliveryForm.contactNumber,
          deliveryNotes: notes || undefined,
          items: storeItems.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        })
      );

      const responses = await Promise.all(orderPromises);
      clearCart();

      const firstOrder = responses[0]?.data;
      if (firstOrder?.id) setOrderId(firstOrder.id);

      setOrderSuccess(true);
      toast.success('Order placed successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) return null;

  if (orderSuccess) {
    return (
      <Layout>
        <div className="checkout-page">
          <div className="container">
            <div className="order-success-card">
              <CheckCircle size={64} className="success-icon" />
              <h1>Order Placed Successfully!</h1>
              <p>Thank you for your order. Your order has been received and is being processed.</p>
              {orderId && (
                <div className="order-reference">
                  <strong>Order ID:</strong> {orderId}
                </div>
              )}
              <div className="order-success-actions">
                <Link to="/profile/orders" className="btn-view-orders">View My Orders</Link>
                <Link to="/products" className="btn-continue-shopping-success">Continue Shopping</Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="checkout-page">
        <div className="container">
          <div className="breadcrumbs">
            <Link to="/">Home</Link>
            <span className="breadcrumb-separator">/</span>
            <Link to="/cart">Cart</Link>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Checkout</span>
          </div>

          <div className="checkout-header">
            <h1 className="checkout-title">Checkout</h1>
            <Link to="/cart" className="btn-back-to-cart"><ChevronLeft size={18} />Back to Cart</Link>
          </div>

          {/* Progress Steps */}
          <div className="checkout-steps">
            <div className={`checkout-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
              <div className="step-number">1</div>
              <span className="step-label">Delivery Address</span>
            </div>
            <div className="step-line"></div>
            <div className={`checkout-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
              <div className="step-number">2</div>
              <span className="step-label">Payment Method</span>
            </div>
            <div className="step-line"></div>
            <div className={`checkout-step ${currentStep >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <span className="step-label">Review Order</span>
            </div>
          </div>

          <div className="checkout-layout">
            <div className="checkout-main">

              {/* Step 1: Delivery Address (inline form) */}
              {currentStep === 1 && (
                <div className="checkout-section">
                  <div className="section-header">
                    <MapPin size={24} />
                    <h2>Delivery Address</h2>
                  </div>
                  <div className="address-form">
                    {[
                      { name: 'fullName', label: 'Full Name', placeholder: 'Juan Dela Cruz' },
                      { name: 'contactNumber', label: 'Contact Number', placeholder: '09xxxxxxxxx' },
                      { name: 'street', label: 'Street / House No.', placeholder: '123 Rizal St.' },
                      { name: 'barangay', label: 'Barangay', placeholder: 'Barangay Poblacion' },
                      { name: 'municipality', label: 'Municipality', placeholder: 'Calapan City' },
                    ].map(({ name, label, placeholder }) => (
                      <div key={name} className="form-group">
                        <label className="form-label">{label}</label>
                        <input
                          type="text"
                          name={name}
                          className={`form-input ${deliveryErrors[name] ? 'form-input-error' : ''}`}
                          placeholder={placeholder}
                          value={deliveryForm[name]}
                          onChange={handleDeliveryChange}
                        />
                        {deliveryErrors[name] && <span className="form-error">{deliveryErrors[name]}</span>}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => goToStep(2)} className="btn-continue">
                    Continue to Payment
                  </button>
                </div>
              )}

              {/* Step 2: Payment Method */}
              {currentStep === 2 && (
                <div className="checkout-section">
                  <div className="section-header">
                    <CreditCard size={24} />
                    <h2>Payment Method</h2>
                  </div>
                  <div className="payment-methods">
                    {[
                      { value: 'COD', label: 'Cash on Delivery', desc: 'Pay when you receive your order' },
                      { value: 'GCASH', label: 'GCash', desc: 'Pay securely with GCash' },
                      { value: 'BANK_TRANSFER', label: 'Bank Transfer', desc: 'Transfer directly to our bank account' },
                    ].map(({ value, label, desc }) => (
                      <div
                        key={value}
                        className={`payment-card ${paymentMethod === value ? 'selected' : ''}`}
                        onClick={() => setPaymentMethod(value)}
                      >
                        <input type="radio" name="payment" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} />
                        <div className="payment-details">
                          <strong>{label}</strong>
                          <p>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="checkout-section-actions">
                    <button onClick={() => goToStep(1)} className="btn-back">Back</button>
                    <button onClick={() => goToStep(3)} className="btn-continue">Review Order</button>
                  </div>
                </div>
              )}

              {/* Step 3: Review Order */}
              {currentStep === 3 && (
                <div className="checkout-section">
                  <div className="section-header">
                    <Package size={24} />
                    <h2>Review Your Order</h2>
                  </div>

                  <div className="review-items">
                    <h3>Order Items ({items.length})</h3>
                    {items.map((item) => (
                      <div key={item.id} className="review-item">
                        <img src={item.image || item.images?.[0] || '/placeholder.png'} alt={item.name} />
                        <div className="review-item-details">
                          <p className="review-item-name">{item.name}</p>
                          <p className="review-item-quantity">Qty: {item.quantity}</p>
                        </div>
                        <div className="review-item-price">â‚±{(item.price * item.quantity).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="review-section">
                    <h3>Delivery Address</h3>
                    <p><strong>{deliveryForm.fullName}</strong></p>
                    <p>{deliveryForm.contactNumber}</p>
                    <p>{buildDeliveryAddress()}</p>
                    <button onClick={() => goToStep(1)} className="btn-change">Change</button>
                  </div>

                  <div className="review-section">
                    <h3>Payment Method</h3>
                    <p className="review-payment">
                      {paymentMethod === 'COD' && 'Cash on Delivery'}
                      {paymentMethod === 'GCASH' && 'GCash'}
                      {paymentMethod === 'BANK_TRANSFER' && 'Bank Transfer'}
                    </p>
                    <button onClick={() => goToStep(2)} className="btn-change">Change</button>
                  </div>

                  <div className="review-section">
                    <h3>Order Notes (Optional)</h3>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any special instructions..."
                      className="order-notes-textarea"
                      rows="3"
                    />
                  </div>

                  <div className="checkout-section-actions">
                    <button onClick={() => goToStep(2)} className="btn-back">Back</button>
                    <button onClick={handlePlaceOrder} disabled={isSubmitting} className="btn-place-order">
                      {isSubmitting ? 'Placing Order...' : 'Place Order'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Order Summary Sidebar */}
            <div className="checkout-sidebar">
              <div className="checkout-summary">
                <h3>Order Summary</h3>
                <div className="summary-row">
                  <span>Subtotal ({items.length} items)</span>
                  <span>â‚±{subtotal.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>Shipping Fee</span>
                  <span>{shippingFee === 0 ? <span className="free-text">FREE</span> : `â‚±${shippingFee.toFixed(2)}`}</span>
                </div>
                <div className="summary-divider"></div>
                <div className="summary-total">
                  <span>Total</span>
                  <span className="total-amount">â‚±{total.toFixed(2)}</span>
                </div>
                {subtotal < 500 && (
                  <div className="shipping-reminder">
                    Add â‚±{(500 - subtotal).toFixed(2)} more for free shipping
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
