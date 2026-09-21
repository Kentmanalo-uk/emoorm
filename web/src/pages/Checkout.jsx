import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  MapPin,
  Package,
  CreditCard,
  CheckCircle,
  CaretLeft as ChevronLeft,
  Truck,
  Storefront as StoreIcon,
  Warning as AlertTriangle,
  UploadSimple as Upload,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ProductImage from '../components/ProductImage';
import { uploadImage } from '../lib/upload';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import PhAddressPicker from '../components/common/PhAddressPicker';
import useIdentityGate from '../hooks/useIdentityGate';
import { isIdentityRequiredError } from '../lib/identity';
import './Checkout.css';

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const { items: allItems, getTotalPrice, clearCart } = useCartStore();
  const { requireVerifiedIdentity, showIdentityRequired, identityDialog } = useIdentityGate();

  // Direct visits to /checkout get the verification prompt straight away.
  useEffect(() => {
    if (isAuthenticated) requireVerifiedIdentity();
  }, [isAuthenticated, requireVerifiedIdentity]);

  // Restrict checkout to the items selected on the Cart page (if provided).
  const selectedIds = location.state?.selectedIds;
  const incomingVoucherCode = location.state?.voucherCode || '';
  const items = useMemo(() => {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return allItems;
    const allow = new Set(selectedIds);
    return allItems.filter((it) => allow.has(it.id));
  }, [allItems, selectedIds]);

  const [currentStep, setCurrentStep] = useState(1);
  const [deliveryForm, setDeliveryForm] = useState({
    fullName: '',
    contactNumber: '',
    street: '',
    barangay: '',
    barangayCode: '',
    municipality: '',
    municipalityId: '',
    municipalityName: '',
    municipalityCode: '',
    province: 'Oriental Mindoro',
    provinceCode: '',
  });
  const [deliveryErrors, setDeliveryErrors] = useState({});
  const [municipalities, setMunicipalities] = useState([]);
  const [fulfillmentMethod, setFulfillmentMethod] = useState('DELIVERY');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const checkoutIdRef = useRef(null);

  // Voucher state
  const [voucherInput, setVoucherInput] = useState(incomingVoucherCode);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherLoading, setVoucherLoading] = useState(false);

  // Saved delivery addresses
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null); // null = manual entry
  const [addressesLoaded, setAddressesLoaded] = useState(false);

  // Per-store settings + coverage
  const [storeInfo, setStoreInfo] = useState({}); // { [storeId]: { store, covered, checked } }

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0),
    [items]
  );

  // Group items by store
  const itemsByStore = useMemo(() => {
    return items.reduce((acc, item) => {
      if (!acc[item.storeId]) acc[item.storeId] = [];
      acc[item.storeId].push(item);
      return acc;
    }, {});
  }, [items]);

  const storeIds = useMemo(() => Object.keys(itemsByStore), [itemsByStore]);

  // Auth + cart guard
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login?redirect=/checkout');
      return;
    }
    if (items.length > 0 && storeIds.length > 1 && !orderSuccess) {
      toast.error('Checkout is limited to one store per order.');
      navigate('/cart', { replace: true });
      return;
    }
    if (items.length === 0 && !orderSuccess) {
      navigate('/cart');
    }
  }, [isAuthenticated, items, navigate, orderSuccess, storeIds]);

  // Load municipalities + prefill address
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/municipalities');
        setMunicipalities(res.data || []);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const applySavedAddress = (addr) => {
    setSelectedAddressId(addr.id);
    setDeliveryForm((prev) => ({
      ...prev,
      fullName: addr.fullName || '',
      contactNumber: addr.contactNumber || '',
      street: addr.street || '',
      barangay: addr.barangay || '',
      municipality: addr.municipality?.name || '',
      municipalityId: addr.municipalityId || '',
      municipalityName: addr.municipality?.name || '',
      province: addr.province || 'Oriental Mindoro',
    }));
    setDeliveryErrors({});
  };

  const useManualAddress = () => {
    setSelectedAddressId(null);
  };

  // Load saved addresses and prefill from the default one, if any
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const res = await axios.get('/addresses');
        const list = res.data || [];
        setSavedAddresses(list);
        const def = list.find((a) => a.isDefault) || list[0];
        if (def) applySavedAddress(def);
      } catch {
        // non-fatal — falls back to manual entry prefilled from profile
      } finally {
        setAddressesLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!addressesLoaded || savedAddresses.length === 0) {
      if (user) {
        setDeliveryForm((prev) => ({
          ...prev,
          fullName: user.fullName || prev.fullName,
          contactNumber: user.contactNumber || prev.contactNumber,
          street: user.address || prev.street,
          barangay: user.barangay || prev.barangay,
          municipality: user.municipality?.name || prev.municipality,
          municipalityId: user.municipalityId || prev.municipalityId,
          municipalityName: user.municipality?.name || prev.municipalityName,
          province: user.province || prev.province || 'Oriental Mindoro',
        }));
      }
    }
  }, [user, addressesLoaded, savedAddresses.length]);

  // Fetch each store's settings once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        storeIds.map(async (id) => {
          try {
            const res = await axios.get(`/stores/${id}`);
            return { id, store: res.data };
          } catch {
            return { id, store: null };
          }
        })
      );
      if (cancelled) return;
      setStoreInfo((prev) => {
        const next = { ...prev };
        for (const { id, store } of results) {
          next[id] = { ...(next[id] || {}), store };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [storeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coverage check on delivery address change (debounced by simple effect)
  const checkCoverage = useCallback(async () => {
    if (fulfillmentMethod !== 'DELIVERY') return;
    if (!deliveryForm.municipalityId) return;
    const params = { municipalityId: deliveryForm.municipalityId };
    if (deliveryForm.barangay) params.barangay = deliveryForm.barangay;
    const results = await Promise.all(
      storeIds.map(async (id) => {
        try {
          const res = await axios.get(`/stores/${id}/coverage`, { params });
          return { id, covered: !!res.data?.covered };
        } catch {
          return { id, covered: false };
        }
      })
    );
    setStoreInfo((prev) => {
      const next = { ...prev };
      for (const { id, covered } of results) {
        next[id] = { ...(next[id] || {}), covered, checked: true };
      }
      return next;
    });
  }, [fulfillmentMethod, deliveryForm.municipalityId, deliveryForm.barangay, storeIds]);

  useEffect(() => {
    checkCoverage();
  }, [checkCoverage]);

  // Available payment methods across stores
  const paymentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (stores.length === 0) return { cod: true, gcash: true, qrph: true };
    return {
      cod: stores.every((s) => s.acceptsCod !== false),
      gcash: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'GCASH'),
      qrph: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'QRPH'),
    };
  }, [storeIds, storeInfo]);

  // Fulfillment availability
  const fulfillmentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (stores.length === 0) return { delivery: true, pickup: true };
    return {
      delivery: stores.every(
        (s) => s.fulfillmentMode === 'DELIVERY' || s.fulfillmentMode === 'BOTH'
      ),
      pickup: stores.every(
        (s) => s.fulfillmentMode === 'PICKUP' || s.fulfillmentMode === 'BOTH'
      ),
    };
  }, [storeIds, storeInfo]);

  // Ensure selected fulfillmentMethod is available; auto-switch if needed
  useEffect(() => {
    if (fulfillmentMethod === 'DELIVERY' && !fulfillmentAvailability.delivery && fulfillmentAvailability.pickup) {
      setFulfillmentMethod('PICKUP');
    } else if (fulfillmentMethod === 'PICKUP' && !fulfillmentAvailability.pickup && fulfillmentAvailability.delivery) {
      setFulfillmentMethod('DELIVERY');
    }
  }, [fulfillmentAvailability, fulfillmentMethod]);

  // Ensure payment method is valid
  useEffect(() => {
    if (paymentMethod === 'COD' && !paymentAvailability.cod) {
      if (paymentAvailability.gcash) setPaymentMethod('GCASH');
      else if (paymentAvailability.qrph) setPaymentMethod('QRPH');
    }
  }, [paymentAvailability, paymentMethod]);

  const anyCoverageMissing = useMemo(
    () =>
      fulfillmentMethod === 'DELIVERY' &&
      storeIds.some((id) => storeInfo[id]?.checked && !storeInfo[id]?.covered),
    [fulfillmentMethod, storeIds, storeInfo]
  );

  const shippingFee = fulfillmentMethod === 'PICKUP' ? 0 : subtotal >= 500 ? 0 : 50;
  const discountAmount = appliedVoucher ? Number(appliedVoucher.discountAmount || 0) : 0;
  const total = Math.max(0, subtotal + shippingFee - discountAmount);

  const applyVoucher = async (codeOverride) => {
    const code = String(codeOverride ?? voucherInput ?? '').trim();
    if (!code) return toast.error('Enter a voucher code');
    if (subtotal <= 0) return toast.error('No items to apply a voucher to');
    setVoucherLoading(true);
    try {
      const res = await axios.post('/vouchers/validate', { code, subtotal });
      setAppliedVoucher(res.data);
      setVoucherInput(res.data.voucher.code);
      toast.success(`Voucher ${res.data.voucher.code} applied`);
    } catch (err) {
      setAppliedVoucher(null);
      toast.error(err?.response?.data?.message || 'Invalid voucher code');
    } finally {
      setVoucherLoading(false);
    }
  };

  const removeVoucher = () => {
    setAppliedVoucher(null);
    setVoucherInput('');
  };

  useEffect(() => {
    if (incomingVoucherCode) applyVoucher(incomingVoucherCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingVoucherCode]);

  useEffect(() => {
    if (!appliedVoucher) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.post('/vouchers/validate', { code: appliedVoucher.voucher.code, subtotal });
        if (!cancelled) setAppliedVoucher(res.data);
      } catch {
        if (!cancelled) setAppliedVoucher(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const handleDeliveryChange = (e) => {
    const { name, value } = e.target;
    if (name === 'municipality') {
      const muni = municipalities.find((m) => m.name === value);
      setDeliveryForm((prev) => ({ ...prev, municipality: value, municipalityId: muni?.id || '' }));
    } else {
      setDeliveryForm((prev) => ({ ...prev, [name]: value }));
    }
    if (deliveryErrors[name]) setDeliveryErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateDelivery = () => {
    const errs = {};
    if (!deliveryForm.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!deliveryForm.contactNumber.trim()) errs.contactNumber = 'Contact number is required.';
    if (fulfillmentMethod === 'DELIVERY') {
      if (!deliveryForm.street.trim()) errs.street = 'Street / house address is required.';
      if (!deliveryForm.barangay.trim()) errs.barangay = 'Barangay is required.';
      if (!deliveryForm.municipality.trim()) errs.municipality = 'Municipality is required.';
    }
    setDeliveryErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goToStep = (step) => {
    if (step === 1) return setCurrentStep(1);
    if (step === 2) {
      if (!validateDelivery()) return;
      if (anyCoverageMissing) {
        toast.error('One or more stores does not deliver to your address. Please choose Pickup or update your address.');
        return;
      }
      setCurrentStep(2);
    } else if (step === 3 && paymentMethod) {
      if ((paymentMethod === 'GCASH' || paymentMethod === 'QRPH')) {
        if (!paymentReference.trim()) {
          toast.error('Please enter your payment reference number.');
          return;
        }
        if (!paymentProofUrl) {
          toast.error('Please upload your payment proof screenshot.');
          return;
        }
      }
      setCurrentStep(3);
    }
  };

  const buildDeliveryAddress = () =>
    `${deliveryForm.street}, ${deliveryForm.barangay}, ${deliveryForm.municipality}, ${deliveryForm.province || 'Oriental Mindoro'}`;

  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const res = await uploadImage(file);
      setPaymentProofUrl(res.url);
      toast.success('Proof uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingProof(false);
      e.target.value = '';
    }
  };

  const handlePlaceOrder = async () => {
    if (storeIds.length !== 1) {
      toast.error('Select items from one store before checkout.');
      navigate('/cart');
      return;
    }
    if (paymentMethod !== 'COD' && (!paymentReference.trim() || !paymentProofUrl)) {
      toast.error('Please provide a payment reference and upload proof of payment.');
      setCurrentStep(2);
      return;
    }
    if (!(await requireVerifiedIdentity())) return;
    setIsSubmitting(true);
    if (!checkoutIdRef.current) {
      checkoutIdRef.current = window.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    const checkoutId = checkoutIdRef.current;
    try {
      const orderPromises = Object.entries(itemsByStore).map(([storeId, storeItems]) => {
        const info = storeInfo[storeId];
        const pickupAddr = info?.store?.pickupAddress || '';
        return axios.post('/orders', {
          storeId,
          checkoutKey: `${checkoutId}:${storeId}`,
          fulfillmentMethod,
          paymentMethod,
          paymentReference: paymentReference || undefined,
          paymentProofUrl: paymentProofUrl || undefined,
          voucherCode: appliedVoucher?.voucher?.code || undefined,
          deliveryAddress:
            fulfillmentMethod === 'DELIVERY' ? buildDeliveryAddress() : pickupAddr,
          contactNumber: deliveryForm.contactNumber,
          deliveryNotes: notes || undefined,
          buyerMunicipalityId: deliveryForm.municipalityId || undefined,
          buyerBarangay: deliveryForm.barangay || undefined,
          buyerProvince: deliveryForm.province || undefined,
          items: storeItems.map((item) => ({
            productId: item.productId || item.id,
            quantity: item.quantity,
            selectedVariations: item.selectedVariations || undefined,
          })),
        });
      });

      const settled = await Promise.allSettled(orderPromises);
      const responses = settled
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
      const failed = settled.find((result) => result.status === 'rejected');
      if (failed) {
        await Promise.allSettled(
          responses
            .map((response) => response.data?.id)
            .filter(Boolean)
            .map((id) => axios.post(`/orders/${id}/cancel`)),
        );
        throw failed.reason;
      }
      // Only remove the items that were part of this order — leave any unselected items in the cart.
      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        selectedIds.forEach((id) => useCartStore.getState().removeItem(id));
      } else {
        clearCart();
      }

      const firstOrder = responses[0]?.data;
      if (firstOrder?.id) setOrderId(firstOrder.id);

      setOrderSuccess(true);
      toast.success('Order placed successfully!');
    } catch (error) {
      if (isIdentityRequiredError(error)) {
        showIdentityRequired();
        return;
      }
      const backendMsg = error?.response?.data?.message;
      toast.error(backendMsg || error?.message || 'Failed to place order. Please try again.');
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
                {orderId && (
                  <Link to={`/orders/${orderId}/receipt`} className="btn-view-orders">View Receipt</Link>
                )}
                <Link to="/profile/orders" className="btn-view-orders">My Orders</Link>
                <Link to="/products" className="btn-continue-shopping-success">Continue Shopping</Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const activeQrStore = (paymentMethod === 'GCASH' || paymentMethod === 'QRPH')
    ? storeIds.map((id) => storeInfo[id]?.store).find((s) => s?.paymentQrImage)
    : null;

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
              <span className="step-label">Fulfillment</span>
            </div>
            <div className="step-line"></div>
            <div className={`checkout-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
              <div className="step-number">2</div>
              <span className="step-label">Payment</span>
            </div>
            <div className="step-line"></div>
            <div className={`checkout-step ${currentStep >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <span className="step-label">Review</span>
            </div>
          </div>

          <div className="checkout-layout">
            <div className="checkout-main">

              {/* Step 1: Fulfillment + Address */}
              {currentStep === 1 && (
                <div className="checkout-section">
                  <div className="section-header">
                    <Truck size={24} />
                    <h2>Fulfillment Method</h2>
                  </div>

                  <div className="fulfillment-picker">
                    <label
                      className={`fulfillment-option ${fulfillmentMethod === 'DELIVERY' ? 'selected' : ''} ${!fulfillmentAvailability.delivery ? 'disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="DELIVERY"
                        checked={fulfillmentMethod === 'DELIVERY'}
                        onChange={() => setFulfillmentMethod('DELIVERY')}
                        disabled={!fulfillmentAvailability.delivery}
                      />
                      <Truck size={18} />
                      <div>
                        <strong>Delivery</strong>
                        <p>{fulfillmentAvailability.delivery ? 'Have it delivered to your address' : 'Not available for these stores'}</p>
                      </div>
                    </label>
                    <label
                      className={`fulfillment-option ${fulfillmentMethod === 'PICKUP' ? 'selected' : ''} ${!fulfillmentAvailability.pickup ? 'disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="PICKUP"
                        checked={fulfillmentMethod === 'PICKUP'}
                        onChange={() => setFulfillmentMethod('PICKUP')}
                        disabled={!fulfillmentAvailability.pickup}
                      />
                      <StoreIcon size={18} />
                      <div>
                        <strong>Pickup</strong>
                        <p>{fulfillmentAvailability.pickup ? 'Pick up at the store' : 'Not available for these stores'}</p>
                      </div>
                    </label>
                  </div>

                  <div className="section-header" style={{ marginTop: 24 }}>
                    <MapPin size={24} />
                    <h2>{fulfillmentMethod === 'DELIVERY' ? 'Delivery Address' : 'Contact Details'}</h2>
                  </div>

                  {fulfillmentMethod === 'DELIVERY' && savedAddresses.length > 0 && (
                    <div className="saved-address-picker">
                      {savedAddresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={`saved-address-option ${selectedAddressId === addr.id ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="savedAddress"
                            checked={selectedAddressId === addr.id}
                            onChange={() => applySavedAddress(addr)}
                          />
                          <div>
                            <strong>
                              {addr.label ? `${addr.label} — ` : ''}{addr.fullName}
                              {addr.isDefault && <span className="saved-address-default-tag">Default</span>}
                            </strong>
                            <p>{addr.street}, {addr.barangay}, {addr.municipality?.name}, {addr.province || 'Oriental Mindoro'}</p>
                            <p className="saved-address-phone">{addr.contactNumber}</p>
                          </div>
                        </label>
                      ))}
                      <label className={`saved-address-option ${selectedAddressId === null ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="savedAddress"
                          checked={selectedAddressId === null}
                          onChange={useManualAddress}
                        />
                        <div>
                          <strong>Enter a different address</strong>
                          <p>Use a one-off address for this order</p>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="address-form">
                    <div className="form-group">
                      <label className="form-label">Full Name</label>
                      <input
                        type="text"
                        name="fullName"
                        className={`form-input ${deliveryErrors.fullName ? 'form-input-error' : ''}`}
                        placeholder="Juan Dela Cruz"
                        value={deliveryForm.fullName}
                        onChange={handleDeliveryChange}
                      />
                      {deliveryErrors.fullName && <span className="form-error">{deliveryErrors.fullName}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Contact Number</label>
                      <input
                        type="text"
                        name="contactNumber"
                        className={`form-input ${deliveryErrors.contactNumber ? 'form-input-error' : ''}`}
                        placeholder="09xxxxxxxxx"
                        value={deliveryForm.contactNumber}
                        onChange={handleDeliveryChange}
                      />
                      {deliveryErrors.contactNumber && <span className="form-error">{deliveryErrors.contactNumber}</span>}
                    </div>

                    {fulfillmentMethod === 'DELIVERY' && (
                      <PhAddressPicker
                        value={{
                          province: deliveryForm.province,
                          provinceCode: deliveryForm.provinceCode,
                          municipalityId: deliveryForm.municipalityId,
                          municipalityName: deliveryForm.municipality || deliveryForm.municipalityName,
                          municipalityCode: deliveryForm.municipalityCode,
                          barangay: deliveryForm.barangay,
                          barangayCode: deliveryForm.barangayCode,
                          street: deliveryForm.street,
                        }}
                        onChange={(next) => {
                          setDeliveryForm((prev) => ({
                            ...prev,
                            province: next.province ?? prev.province,
                            provinceCode: next.provinceCode ?? prev.provinceCode,
                            municipalityId: next.municipalityId ?? prev.municipalityId,
                            municipalityName: next.municipalityName ?? prev.municipalityName,
                            municipality: next.municipalityName ?? prev.municipality,
                            municipalityCode: next.municipalityCode ?? prev.municipalityCode,
                            barangay: next.barangay ?? prev.barangay,
                            barangayCode: next.barangayCode ?? prev.barangayCode,
                            street: next.street ?? prev.street,
                          }));
                          setDeliveryErrors((prev) => ({
                            ...prev,
                            street: '',
                            barangay: '',
                            municipality: '',
                            municipalityId: '',
                          }));
                        }}
                        dbMunicipalities={municipalities}
                        errors={deliveryErrors}
                      />
                    )}
                  </div>

                  {/* Per-store status */}
                  {storeIds.length > 0 && (
                    <div className="store-status-list">
                      {storeIds.map((id) => {
                        const info = storeInfo[id];
                        const storeName = info?.store?.name || itemsByStore[id][0]?.storeName || 'Store';
                        if (fulfillmentMethod === 'PICKUP') {
                          return (
                            <div key={id} className="store-status ok">
                              <StoreIcon size={16} />
                              <div>
                                <strong>{storeName}</strong>
                                <p>Pickup at: {info?.store?.pickupAddress || '—'}</p>
                                {info?.store?.pickupInstructions && (
                                  <p className="store-status-note">{info.store.pickupInstructions}</p>
                                )}
                              </div>
                            </div>
                          );
                        }
                        // DELIVERY
                        if (!info?.checked) return null;
                        return info.covered ? (
                          <div key={id} className="store-status ok">
                            <CheckCircle size={16} />
                            <div>
                              <strong>{storeName}</strong>
                              <p>Delivers to your address</p>
                            </div>
                          </div>
                        ) : (
                          <div key={id} className="store-status bad">
                            <AlertTriangle size={16} />
                            <div>
                              <strong>{storeName}</strong>
                              <p>Does not deliver to your address. Choose Pickup or update your address.</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => goToStep(2)}
                    className="btn-continue"
                    disabled={anyCoverageMissing}
                  >
                    Continue to Payment
                  </button>
                </div>
              )}

              {/* Step 2: Payment */}
              {currentStep === 2 && (
                <div className="checkout-section">
                  <div className="section-header">
                    <CreditCard size={24} />
                    <h2>Payment Method</h2>
                  </div>
                  <div className="payment-methods">
                    {[
                      { value: 'COD', label: 'Cash on Delivery / Pickup', desc: 'Pay when you receive/pick up your order', enabled: paymentAvailability.cod },
                      { value: 'GCASH', label: 'GCash (QR)', desc: 'Scan and pay via GCash', enabled: paymentAvailability.gcash },
                      { value: 'QRPH', label: 'QR Ph', desc: 'Scan and pay via QR Ph', enabled: paymentAvailability.qrph },
                    ].map(({ value, label, desc, enabled }) => (
                      <div
                        key={value}
                        className={`payment-card ${paymentMethod === value ? 'selected' : ''} ${!enabled ? 'disabled' : ''}`}
                        onClick={() => enabled && setPaymentMethod(value)}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={value}
                          checked={paymentMethod === value}
                          onChange={() => enabled && setPaymentMethod(value)}
                          disabled={!enabled}
                        />
                        <div className="payment-details">
                          <strong>{label}</strong>
                          <p>{enabled ? desc : 'Not available for these stores'}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(paymentMethod === 'GCASH' || paymentMethod === 'QRPH') && activeQrStore && (
                    <div className="qr-payment-panel">
                      <div className="qr-payment-image">
                        <img src={resolveImg(activeQrStore.paymentQrImage)} alt="Payment QR code" />
                      </div>
                      <div className="qr-payment-details">
                        <h4>Scan to pay</h4>
                        {activeQrStore.paymentInstructions && (
                          <p className="qr-instructions">{activeQrStore.paymentInstructions}</p>
                        )}
                        <div className="form-group">
                          <label className="form-label">Reference / Transaction ID</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Enter reference number from your payment app"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Payment proof <span style={{ color: 'var(--t-danger-600, #dc2626)' }}>*</span></label>
                          {paymentProofUrl ? (
                            <div className="proof-preview">
                              <img src={resolveImg(paymentProofUrl)} alt="Payment proof" />
                              <button
                                type="button"
                                className="btn-back"
                                onClick={() => setPaymentProofUrl('')}
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className="proof-uploader">
                              <Upload size={16} />
                              <span>{uploadingProof ? 'Uploading…' : 'Upload screenshot'}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleProofUpload}
                                disabled={uploadingProof}
                                hidden
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="checkout-section-actions">
                    <button onClick={() => goToStep(1)} className="btn-back">Back</button>
                    <button onClick={() => goToStep(3)} className="btn-continue">Review Order</button>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
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
                        <ProductImage src={item.image || item.images?.[0]} alt={item.name} />
                        <div className="review-item-details">
                          <p className="review-item-name">{item.name}</p>
                          <p className="review-item-quantity">Qty: {item.quantity}</p>
                        </div>
                        <div className="review-item-price">₱{(item.price * item.quantity).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="review-section">
                    <h3>{fulfillmentMethod === 'DELIVERY' ? 'Delivery Address' : 'Contact / Pickup'}</h3>
                    <p><strong>{deliveryForm.fullName}</strong></p>
                    <p>{deliveryForm.contactNumber}</p>
                    {fulfillmentMethod === 'DELIVERY' ? (
                      <p>{buildDeliveryAddress()}</p>
                    ) : (
                      storeIds.map((id) => (
                        <p key={id}>
                          <strong>{storeInfo[id]?.store?.name}:</strong> {storeInfo[id]?.store?.pickupAddress || '—'}
                        </p>
                      ))
                    )}
                    <button onClick={() => goToStep(1)} className="btn-change">Change</button>
                  </div>

                  <div className="review-section">
                    <h3>Payment Method</h3>
                    <p className="review-payment">
                      {paymentMethod === 'COD' && 'Cash on Delivery / Pickup'}
                      {paymentMethod === 'GCASH' && `GCash — Ref: ${paymentReference || '—'}`}
                      {paymentMethod === 'QRPH' && `QR Ph — Ref: ${paymentReference || '—'}`}
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

            {/* Summary */}
            <div className="checkout-sidebar">
              <div className="checkout-summary">
                <h3>Order Summary</h3>
                <div className="summary-row">
                  <span>Subtotal ({items.length} items)</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>{fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Shipping Fee'}</span>
                  <span>{shippingFee === 0 ? <span className="free-text">FREE</span> : `₱${shippingFee.toFixed(2)}`}</span>
                </div>
                {appliedVoucher && discountAmount > 0 && (
                  <div className="summary-row" style={{ color: 'var(--t-primary-600, #059669)' }}>
                    <span>Voucher ({appliedVoucher.voucher.code})</span>
                    <span>-₱{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="summary-divider"></div>
                <div className="summary-total">
                  <span>Total</span>
                  <span className="total-amount">₱{total.toFixed(2)}</span>
                </div>
                {fulfillmentMethod === 'DELIVERY' && subtotal < 500 && (
                  <div className="shipping-reminder">
                    Add ₱{(500 - subtotal).toFixed(2)} more for free shipping
                  </div>
                )}

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--t-neutral-200, #e5e7eb)' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Voucher</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={voucherInput}
                      onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      disabled={voucherLoading || !!appliedVoucher}
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--t-neutral-300, #d1d5db)', borderRadius: 6, fontSize: 13 }}
                    />
                    {appliedVoucher ? (
                      <button type="button" onClick={removeVoucher} className="btn-back" style={{ padding: '8px 12px', fontSize: 13 }}>Remove</button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => applyVoucher()}
                        disabled={voucherLoading || !voucherInput.trim() || subtotal === 0}
                        className="btn-continue"
                        style={{ padding: '8px 12px', fontSize: 13, width: 'auto' }}
                      >
                        {voucherLoading ? '…' : 'Apply'}
                      </button>
                    )}
                  </div>
                  {appliedVoucher && (
                    <p style={{ marginTop: 6, fontSize: 12, color: 'var(--t-primary-600, #059669)' }}>
                      {appliedVoucher.voucher.description || 'Voucher applied'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {identityDialog}
    </Layout>
  );
};

export default Checkout;
