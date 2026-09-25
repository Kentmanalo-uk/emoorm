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
  Money,
  QrCode,
  DeviceMobile,
  NotePencil,
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
import useAppSettings, { storeDeliveryFee } from '../hooks/useAppSettings';
import { isIdentityRequiredError } from '../lib/identity';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './Checkout.css';

// Same rules the server applies at POST /orders.
const CONTACT_NUMBER_RE = /^(09\d{9}|\+639\d{9})$/;
const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9 -]{4,64}$/;
const normalizeContact = (value) => String(value || '').replace(/[\s-]/g, '');

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const { items: allItems, clearCart, revalidate } = useCartStore();
  const { requireVerifiedIdentity, showIdentityRequired, identityDialog } = useIdentityGate();
  const { settings } = useAppSettings();
  const isPhone = usePhoneLayout();

  // Refresh price / stock / availability of every line before anything is placed.
  const [revalidating, setRevalidating] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    (async () => {
      if (useCartStore.getState().items.length === 0) return;
      setRevalidating(true);
      try {
        const { capped, unavailable } = await revalidate();
        if (cancelled) return;
        if (capped.length) toast(`Quantity reduced to available stock: ${capped.join(', ')}`);
        if (unavailable.length) toast.error(`${unavailable.length} ${unavailable.length === 1 ? 'item is' : 'items are'} no longer available`);
      } catch {
        // Leave the lines as they are; the server re-checks at order time.
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(true);
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
  const [storeInfo, setStoreInfo] = useState({}); // { [storeId]: { store, error, covered, checked } }
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeLoadAttempt, setStoreLoadAttempt] = useState(0);

  // Lines flagged by re-validation stay visible but can't be ordered.
  const unavailableItems = useMemo(() => items.filter((it) => it.unavailable), [items]);
  const orderableItems = useMemo(() => items.filter((it) => !it.unavailable), [items]);

  const subtotal = useMemo(
    () => orderableItems.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0),
    [orderableItems]
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
      } finally {
        // The picker keeps its town list disabled until this lands, so a
        // selection cannot be made before there is an id to attach to it.
        setMunicipalitiesLoading(false);
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

  // Fetch each store's settings once (Retry bumps the attempt counter)
  useEffect(() => {
    let cancelled = false;
    if (storeIds.length === 0) return undefined;
    (async () => {
      setStoresLoading(true);
      const results = await Promise.all(
        storeIds.map(async (id) => {
          try {
            const res = await axios.get(`/stores/${id}`);
            return { id, store: res.data || null, error: !res.data };
          } catch {
            return { id, store: null, error: true };
          }
        })
      );
      if (cancelled) return;
      setStoreInfo((prev) => {
        const next = { ...prev };
        for (const { id, store, error } of results) {
          next[id] = { ...(next[id] || {}), store, error };
        }
        return next;
      });
      setStoresLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeIds.join(','), storeLoadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A store that failed to load blocks checkout: its payment / fulfilment
  // rules are unknown, so nothing can be assumed available.
  const storeLoadFailed = useMemo(
    () => !storesLoading && storeIds.some((id) => storeInfo[id]?.error),
    [storesLoading, storeIds, storeInfo]
  );

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

  // Checkout holds one store's items; its own delivery fee applies.
  const checkoutStore = storeInfo[storeIds[0]]?.store || null;
  const shippingFee = orderableItems.length > 0 ? storeDeliveryFee(checkoutStore, settings, fulfillmentMethod) : 0;
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
      toast.error(err?.message || 'Invalid voucher code');
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
    else if (!CONTACT_NUMBER_RE.test(normalizeContact(deliveryForm.contactNumber))) {
      errs.contactNumber = 'Enter a valid PH mobile number (09XXXXXXXXX or +639XXXXXXXXX).';
    }
    if (fulfillmentMethod === 'DELIVERY') {
      if (!deliveryForm.street.trim()) errs.street = 'Street / house address is required.';
      if (!deliveryForm.barangay.trim()) errs.barangay = 'Barangay is required.';
      if (!deliveryForm.municipality.trim()) errs.municipality = 'Municipality is required.';
    }
    setDeliveryErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Returns an error message, or '' when the prepaid fields are acceptable.
  const validatePrepaid = () => {
    if (paymentMethod !== 'GCASH' && paymentMethod !== 'QRPH') return '';
    const reference = paymentReference.trim();
    if (!reference) return 'Please enter your payment reference number.';
    if (!PAYMENT_REFERENCE_RE.test(reference)) return 'Reference must be 4–64 letters, numbers, spaces or dashes.';
    if (!paymentProofUrl) return 'Please upload your payment proof screenshot.';
    return '';
  };

  // One page: point the buyer at the section that needs attention.
  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (storeLoadFailed) {
      toast.error('Store details could not be loaded. Retry before placing your order.');
      return;
    }
    if (unavailableItems.length > 0) {
      toast.error('Remove the unavailable items from your cart before placing the order.');
      return;
    }
    if (orderableItems.length === 0) {
      toast.error('There is nothing available to order.');
      return;
    }
    if (!validateDelivery()) {
      toast.error(fulfillmentMethod === 'DELIVERY' ? 'Please complete your delivery address.' : 'Please complete your contact details.');
      scrollToSection('co-address');
      return;
    }
    if (anyCoverageMissing) {
      toast.error('This store does not deliver to your address. Choose Pickup or update your address.');
      scrollToSection('co-address');
      return;
    }
    const prepaidError = validatePrepaid();
    if (prepaidError) {
      toast.error(prepaidError);
      scrollToSection('co-payment');
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
          paymentReference: paymentMethod === 'COD' ? undefined : paymentReference.trim() || undefined,
          paymentProofUrl: paymentMethod === 'COD' ? undefined : paymentProofUrl || undefined,
          voucherCode: appliedVoucher?.voucher?.code || undefined,
          deliveryAddress:
            fulfillmentMethod === 'DELIVERY' ? buildDeliveryAddress() : pickupAddr,
          contactNumber: normalizeContact(deliveryForm.contactNumber),
          deliveryNotes: notes || undefined,
          buyerMunicipalityId: deliveryForm.municipalityId || undefined,
          buyerBarangay: deliveryForm.barangay || undefined,
          buyerProvince: deliveryForm.province || undefined,
          items: storeItems.filter((item) => !item.unavailable).map((item) => ({
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
      toast.error(error?.message || 'Failed to place order. Please try again.');
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

  const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const itemCount = orderableItems.reduce((n, it) => n + Number(it.quantity || 0), 0);
  const variationText = (item) => (item.selectedVariations && Object.keys(item.selectedVariations).length
    ? Object.entries(item.selectedVariations).map(([name, value]) => `${name}: ${value}`).join(', ')
    : '');

  const placeDisabled = isSubmitting || revalidating || storesLoading || unavailableItems.length > 0 || storeLoadFailed;
  const placeLabel = isSubmitting ? 'Placing Order…' : storesLoading ? 'Loading store details…' : 'Place Order';

  const activeQrStore = (paymentMethod === 'GCASH' || paymentMethod === 'QRPH')
    ? storeIds.map((id) => storeInfo[id]?.store).find((s) => s?.paymentQrImage)
    : null;

  return (
    <Layout>
      <div className={`checkout-page${isPhone ? ' co-phone' : ''}`}>
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

          <div className="checkout-layout">
            <div className="checkout-main">

              {/* Store details are required to know what can be offered */}
              {storeLoadFailed && (
                <div className="checkout-section">
                  <div className="store-status bad checkout-store-error" role="alert">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>Couldn't load store details</strong>
                      <p>Payment and fulfilment options depend on the store's settings. Check your connection and try again.</p>
                      <button
                        type="button"
                        className="btn-back"
                        onClick={() => setStoreLoadAttempt((n) => n + 1)}
                        disabled={storesLoading}
                      >
                        {storesLoading ? 'Retrying…' : 'Retry'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {unavailableItems.length > 0 && (
                <div className="checkout-section">
                  <div className="store-status bad" role="alert">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>{unavailableItems.length === 1 ? 'An item is' : `${unavailableItems.length} items are`} no longer available</strong>
                      <p>{unavailableItems.map((it) => it.name).join(', ')}. Remove {unavailableItems.length === 1 ? 'it' : 'them'} from your cart to place this order.</p>
                      <Link to="/cart" className="btn-back">Back to cart</Link>
                    </div>
                  </div>
                </div>
              )}

              {!storeLoadFailed && (
                <>
                  {/* Fulfillment */}
                  <div className="checkout-section" id="co-fulfillment">
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
                          <p>
                            {fulfillmentAvailability.delivery
                              ? `Delivered to your address · ${peso(storeDeliveryFee(checkoutStore, settings, 'DELIVERY'))} delivery fee`
                              : 'Not available for this store'}
                          </p>
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
                          <p>{fulfillmentAvailability.pickup ? 'Pick up at the store · no delivery fee' : 'Not available for this store'}</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Address / contact */}
                  <div className="checkout-section" id="co-address">
                    <div className="section-header">
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
                          dbLoading={municipalitiesLoading}
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
                  </div>

                  {/* Items, per store */}
                  <div className="checkout-section co-items-section" id="co-items">
                    <div className="section-header">
                      <Package size={24} />
                      <h2>Order Items ({itemCount})</h2>
                    </div>
                    {storeIds.map((id) => {
                      const storeName = storeInfo[id]?.store?.name || itemsByStore[id][0]?.storeName || 'Store';
                      return (
                        <div className="co-m-store" key={id}>
                          <div className="co-m-store-head">
                            <StoreIcon size={18} />
                            <span>{storeName}</span>
                          </div>
                          {itemsByStore[id].map((item) => (
                            <div key={item.id} className={`co-m-item${item.unavailable ? ' is-unavailable' : ''}`}>
                              <ProductImage src={item.image || item.images?.[0]} alt={item.name} className="co-m-item-img" />
                              <div className="co-m-item-info">
                                <p className="co-m-item-name">{item.name}</p>
                                {variationText(item) && <p className="co-m-item-var">{variationText(item)}</p>}
                                {item.unavailable ? (
                                  <p className="co-m-item-bad">{item.unavailableReason || 'Unavailable'}</p>
                                ) : (
                                  <div className="co-m-item-row">
                                    <span className="co-m-item-price">{peso(item.price)}</span>
                                    <span className="co-m-item-qty">×{item.quantity}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <div className="co-m-ship">
                            <span>
                              {fulfillmentMethod === 'PICKUP' ? <StoreIcon size={16} /> : <Truck size={16} />}
                              {fulfillmentMethod === 'PICKUP' ? 'Pickup at the store' : 'Delivery fee'}
                            </span>
                            <span>{fulfillmentMethod === 'PICKUP' ? 'No fee' : peso(shippingFee)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Payment */}
                  <div className="checkout-section" id="co-payment">
                    <div className="section-header">
                      <CreditCard size={24} />
                      <h2>Payment Method</h2>
                    </div>
                    <div className="payment-methods">
                      {[
                        { value: 'COD', label: 'Cash on Delivery / Pickup', desc: 'Pay when you receive/pick up your order', enabled: paymentAvailability.cod, Icon: Money },
                        { value: 'GCASH', label: 'GCash (QR)', desc: 'Scan and pay via GCash', enabled: paymentAvailability.gcash, Icon: DeviceMobile },
                        { value: 'QRPH', label: 'QR Ph', desc: 'Scan and pay via QR Ph', enabled: paymentAvailability.qrph, Icon: QrCode },
                      ].map(({ value, label, desc, enabled, Icon }) => (
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
                          <span className={`payment-icon payment-icon-${value.toLowerCase()}`} aria-hidden="true">
                            <Icon size={20} />
                          </span>
                          <div className="payment-details">
                            <strong>{label}</strong>
                            <p>{enabled ? desc : 'Not available for this store'}</p>
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
                          <h4>Scan to pay {peso(total)}</h4>
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
                  </div>

                  {/* Notes */}
                  <div className="checkout-section" id="co-notes">
                    <div className="section-header">
                      <NotePencil size={24} />
                      <h2>Order Notes (Optional)</h2>
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any special instructions for the seller…"
                      className="order-notes-textarea"
                      rows="3"
                      maxLength={500}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Summary */}
            <div className="checkout-sidebar">
              <div className="checkout-summary">
                <h3>Order Summary</h3>
                <div className="summary-row">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                  <span>{peso(subtotal)}</span>
                </div>
                <div className="summary-row">
                  <span>{fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Delivery Fee'}</span>
                  <span>{fulfillmentMethod === 'PICKUP' ? 'No fee' : peso(shippingFee)}</span>
                </div>
                {appliedVoucher && discountAmount > 0 && (
                  <div className="summary-row" style={{ color: 'var(--t-primary-600, #059669)' }}>
                    <span>Voucher ({appliedVoucher.voucher.code})</span>
                    <span>-{peso(discountAmount)}</span>
                  </div>
                )}
                <div className="summary-divider"></div>
                <div className="summary-total">
                  <span>Total</span>
                  <span className="total-amount">{peso(total)}</span>
                </div>

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
                        className="btn-continue co-voucher-apply"
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

                {!isPhone && (
                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    disabled={placeDisabled}
                    className="btn-place-order co-place-desktop"
                  >
                    {placeLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isPhone && (
        <div className="co-m-bar">
          {discountAmount > 0 && (
            <div className="co-m-saving">
              Voucher {appliedVoucher?.voucher?.code} saves you {peso(discountAmount)} on this order.
            </div>
          )}
          <div className="co-m-bar-row">
            <div className="co-m-total">
              <span>Total ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
              <strong>{peso(total)}</strong>
            </div>
            <button
              type="button"
              className="co-m-cta"
              onClick={handlePlaceOrder}
              disabled={placeDisabled}
            >
              {placeLabel}
            </button>
          </div>
        </div>
      )}
      {identityDialog}
    </Layout>
  );
};

export default Checkout;
