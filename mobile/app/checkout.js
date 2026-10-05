import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DeviceMobileIcon, MoneyIcon, QrCodeIcon, StorefrontIcon, TruckIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import useAuthStore from '../src/store/authStore';
import useCartStore from '../src/store/cartStore';
import ScreenHeader from '../src/components/ScreenHeader';
import CheckoutChoiceCard, { CheckoutCourierMark } from '../src/components/checkout/CheckoutChoiceCard';
import CheckoutAddressPicker from '../src/components/checkout/CheckoutAddressPicker';
import {
  CheckoutBar, CheckoutField, CheckoutPayLater, CheckoutSavedAddresses, CheckoutSection,
  CheckoutStatus, CheckoutStoreItems, CheckoutSuccess, CheckoutSummary,
} from '../src/components/checkout/CheckoutParts';
import useCartIdentityGate, { isIdentityRequiredError } from '../src/components/cart/useCartIdentityGate';
import { cartPeso as peso, storeDeliveryFee, useCartSettings } from '../src/components/cart/cartSettings';
import { spanLabel } from '../src/lib/availability';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';

/*
 * Checkout (web/src/pages/Checkout.jsx, phone layout .co-phone): one page of
 * flat panels — fulfillment, address or contact, delivery option, the items,
 * payment, notes and the summary with a voucher — and a bottom bar with the
 * total and Place Order. Same calls and rules as the website: the cart's
 * selected lines only, one shop per order, its coverage and fee for the
 * address, couriers (paid online), Available Today windows, and QR payments
 * made later from To Pay once the seller confirms.
 */

// Same rules the server applies at POST /orders.
const CONTACT_NUMBER_RE = /^(09\d{9}|\+639\d{9})$/;
const normalizeContact = (value) => String(value || '').replace(/[\s-]/g, '');
const QR_LABELS = { GCASH: 'GCash', QRPH: 'QR Ph' };
const newCheckoutId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;

const parseIds = (raw) => {
  if (!raw) return null;
  try {
    const list = JSON.parse(Array.isArray(raw) ? raw[0] : raw);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
};

export default function Checkout() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const allItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const revalidate = useCartStore((s) => s.revalidate);
  const { requireVerifiedIdentity, showIdentityRequired, identityDialog } = useCartIdentityGate();
  const settings = useCartSettings();

  const scrollRef = useRef(null);
  const sectionY = useRef({});
  const markSection = (key) => (e) => { sectionY.current[key] = e.nativeEvent.layout.y; };
  const scrollToSection = (key) => {
    const y = sectionY.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  };

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
        if (capped.length) toast.info(`Quantity reduced to available stock: ${capped.join(', ')}`);
        if (unavailable.length) toast.error(`${unavailable.length} ${unavailable.length === 1 ? 'item is' : 'items are'} no longer available`);
      } catch {
        // Leave the lines as they are; the server re-checks at order time.
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Direct visits to /checkout get the verification prompt straight away.
  useEffect(() => {
    if (isAuthenticated) requireVerifiedIdentity();
  }, [isAuthenticated, requireVerifiedIdentity]);

  // Only the lines selected on the cart (all of them when none were named).
  const selectedIds = useMemo(() => parseIds(params.selectedIds), [params.selectedIds]);
  const incomingVoucherCode = String(params.voucherCode || '');
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
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const checkoutIdRef = useRef(null);

  const [voucherInput, setVoucherInput] = useState(incomingVoucherCode);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherLoading, setVoucherLoading] = useState(false);

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null); // null = manual entry
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const pinnedAddress = savedAddresses.find((a) => a.id === selectedAddressId) || null;

  const [storeInfo, setStoreInfo] = useState({}); // { [storeId]: { store, error, covered, fee, checked } }
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeLoadAttempt, setStoreLoadAttempt] = useState(0);

  // Lines flagged by re-validation stay visible but can't be ordered.
  const unavailableItems = useMemo(() => items.filter((it) => it.unavailable), [items]);
  const orderableItems = useMemo(() => items.filter((it) => !it.unavailable), [items]);
  const subtotal = useMemo(() => orderableItems.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0), [orderableItems]);

  const itemsByStore = useMemo(() => items.reduce((acc, item) => {
    if (!acc[item.storeId]) acc[item.storeId] = [];
    acc[item.storeId].push(item);
    return acc;
  }, {}), [items]);
  const storeIds = useMemo(() => Object.keys(itemsByStore), [itemsByStore]);

  // Cart guard (sign-in is guarded by the app's layout).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (items.length > 0 && storeIds.length > 1 && !orderSuccess) {
      toast.error('Checkout is limited to one store per order.');
      router.replace('/cart');
      return;
    }
    if (items.length === 0 && !orderSuccess && useCartStore.persist.hasHydrated()) {
      router.replace('/cart');
    }
  }, [isAuthenticated, items, orderSuccess, storeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    apiClient.get('/municipalities')
      .then((res) => { if (live) setMunicipalities(res.data || []); })
      .catch(() => {})
      .finally(() => { if (live) setMunicipalitiesLoading(false); });
    return () => { live = false; };
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

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let live = true;
    apiClient.get('/addresses')
      .then((res) => {
        if (!live) return;
        const list = res.data || [];
        setSavedAddresses(list);
        const def = list.find((a) => a.isDefault) || list[0];
        if (def) applySavedAddress(def);
      })
      .catch(() => {})
      .finally(() => { if (live) setAddressesLoaded(true); });
    return () => { live = false; };
  }, [isAuthenticated]);

  // No saved address: start from the profile's.
  useEffect(() => {
    if ((!addressesLoaded || savedAddresses.length === 0) && user) {
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
  }, [user, addressesLoaded, savedAddresses.length]);

  // Each store's settings (Retry bumps the attempt counter).
  const storeKey = storeIds.join(',');
  useEffect(() => {
    if (storeIds.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      setStoresLoading(true);
      const results = await Promise.all(storeIds.map(async (id) => {
        try {
          const res = await apiClient.get(`/stores/${id}`);
          return { id, store: res.data || null, error: !res.data };
        } catch {
          return { id, store: null, error: true };
        }
      }));
      if (cancelled) return;
      setStoreInfo((prev) => {
        const next = { ...prev };
        results.forEach(({ id, store, error }) => { next[id] = { ...(next[id] || {}), store, error }; });
        return next;
      });
      setStoresLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeKey, storeLoadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A store that failed to load blocks checkout: its rules are unknown.
  const storeLoadFailed = !storesLoading && storeIds.some((id) => storeInfo[id]?.error);

  // Coverage (and this address's fee) for each store.
  const checkCoverage = useCallback(async () => {
    if (fulfillmentMethod !== 'DELIVERY' || !deliveryForm.municipalityId) return;
    const query = { municipalityId: deliveryForm.municipalityId };
    if (deliveryForm.barangay) query.barangay = deliveryForm.barangay;
    const results = await Promise.all(storeIds.map(async (id) => {
      try {
        const res = await apiClient.get(`/stores/${id}/coverage`, { params: query });
        return { id, covered: !!res.data?.covered, fee: res.data?.fee ?? null };
      } catch {
        return { id, covered: false, fee: null };
      }
    }));
    setStoreInfo((prev) => {
      const next = { ...prev };
      results.forEach(({ id, covered, fee }) => { next[id] = { ...(next[id] || {}), covered, fee, checked: true }; });
      return next;
    });
  }, [fulfillmentMethod, deliveryForm.municipalityId, deliveryForm.barangay, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { checkCoverage(); }, [checkCoverage]);

  // Delivery by the seller or by a courier the shop ships with (paid online).
  const [shipQuote, setShipQuote] = useState(null);
  const [deliveryChoice, setDeliveryChoice] = useState('SELLER');
  const quoteKey = JSON.stringify([
    storeIds[0] || null,
    orderableItems.map((it) => [it.productId || it.id, it.quantity]),
    deliveryForm.municipalityId || null,
    deliveryForm.barangay || null,
  ]);
  useEffect(() => {
    const [storeId, lines, municipalityId, barangay] = JSON.parse(quoteKey);
    if (fulfillmentMethod !== 'DELIVERY' || !storeId || lines.length === 0) return undefined;
    let cancelled = false;
    apiClient.post('/couriers/quote', {
      storeId,
      items: lines.map(([productId, quantity]) => ({ productId, quantity })),
      municipalityId: municipalityId || undefined,
      barangay: barangay || undefined,
    })
      .then((res) => { if (!cancelled) setShipQuote(res.data || null); })
      .catch(() => { if (!cancelled) setShipQuote(null); });
    return () => { cancelled = true; };
  }, [quoteKey, fulfillmentMethod]);

  // Available Today lines: by the shop or picked up, ready in their window.
  const todayLines = useMemo(() => items.filter((it) => it.listingKind === 'TODAY' && it.availability), [items]);
  const todayReady = todayLines.length
    ? {
      from: Math.min(...todayLines.map((it) => new Date(it.availability.readyFrom).getTime())),
      to: Math.max(...todayLines.map((it) => new Date(it.availability.readyUntil).getTime())),
    }
    : null;

  const sellerDelivers = shipQuote ? shipQuote.seller?.offered !== false : true;
  const sellerReaches = sellerDelivers && shipQuote?.seller?.covered !== false;
  const onlineReady = Boolean(shipQuote?.onlinePaymentReady);
  const courierChoices = shipQuote?.couriers || [];
  const courierPickable = (c) => c.fee != null && onlineReady && !todayLines.length;
  const choiceValid = (choice) => (choice === 'SELLER'
    ? sellerReaches
    : courierChoices.some((c) => c.id === choice && courierPickable(c)));
  const activeChoice = choiceValid(deliveryChoice)
    ? deliveryChoice
    : (sellerReaches ? 'SELLER' : courierChoices.find(courierPickable)?.id || 'SELLER');
  const chosenCourier = fulfillmentMethod === 'DELIVERY' && activeChoice !== 'SELLER'
    ? courierChoices.find((c) => c.id === activeChoice) || null
    : null;

  const paymentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (stores.length === 0) return { cod: true, gcash: true, qrph: true };
    return {
      // Courier deliveries are paid online.
      cod: !chosenCourier && stores.every((s) => s.acceptsCod !== false),
      gcash: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'GCASH'),
      qrph: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'QRPH'),
    };
  }, [storeKey, storeInfo, chosenCourier]); // eslint-disable-line react-hooks/exhaustive-deps

  const fulfillmentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (stores.length === 0) return { delivery: true, pickup: true };
    return {
      delivery: stores.every((s) => s.fulfillmentMode === 'DELIVERY' || s.fulfillmentMode === 'BOTH')
        && todayLines.every((it) => it.availability.fulfillment !== 'PICKUP'),
      pickup: stores.every((s) => s.fulfillmentMode === 'PICKUP' || s.fulfillmentMode === 'BOTH')
        && todayLines.every((it) => it.availability.fulfillment !== 'DELIVERY'),
    };
  }, [storeKey, storeInfo, todayLines]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fulfillmentMethod === 'DELIVERY' && !fulfillmentAvailability.delivery && fulfillmentAvailability.pickup) {
      setFulfillmentMethod('PICKUP');
    } else if (fulfillmentMethod === 'PICKUP' && !fulfillmentAvailability.pickup && fulfillmentAvailability.delivery) {
      setFulfillmentMethod('DELIVERY');
    }
  }, [fulfillmentAvailability, fulfillmentMethod]);

  useEffect(() => {
    if (paymentMethod === 'COD' && !paymentAvailability.cod) {
      if (paymentAvailability.gcash) setPaymentMethod('GCASH');
      else if (paymentAvailability.qrph) setPaymentMethod('QRPH');
    }
  }, [paymentAvailability, paymentMethod]);

  const anyCoverageMissing = fulfillmentMethod === 'DELIVERY' && !chosenCourier
    && storeIds.some((id) => storeInfo[id]?.checked && !storeInfo[id]?.covered);

  // One store per checkout: its fee for this address, or its standard fee until the quote is in.
  const checkoutStore = storeInfo[storeIds[0]]?.store || null;
  const quoted = storeInfo[storeIds[0]];
  const deliveryFee = quoted?.checked && quoted.covered && quoted.fee != null
    ? Number(quoted.fee)
    : storeDeliveryFee(checkoutStore, settings, 'DELIVERY');
  const shippingFee = orderableItems.length > 0 && fulfillmentMethod === 'DELIVERY'
    ? (chosenCourier ? Number(chosenCourier.fee) : deliveryFee)
    : 0;
  const discountAmount = appliedVoucher ? Number(appliedVoucher.discountAmount || 0) : 0;
  const total = Math.max(0, subtotal + shippingFee - discountAmount);

  const applyVoucher = async (codeOverride) => {
    const code = String(codeOverride ?? voucherInput ?? '').trim();
    if (!code) { toast.error('Enter a voucher code'); return; }
    if (subtotal <= 0) { toast.error('No items to apply a voucher to'); return; }
    setVoucherLoading(true);
    try {
      const res = await apiClient.post('/vouchers/validate', { code, subtotal, storeId: storeIds[0] });
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
  // The cart's voucher, once there is a subtotal to apply it to.
  const voucherTried = useRef(false);
  useEffect(() => {
    if (!incomingVoucherCode || voucherTried.current || subtotal <= 0) return;
    voucherTried.current = true;
    applyVoucher(incomingVoucherCode);
  }, [incomingVoucherCode, subtotal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!appliedVoucher) return undefined;
    let cancelled = false;
    apiClient.post('/vouchers/validate', { code: appliedVoucher.voucher.code, subtotal })
      .then((res) => { if (!cancelled) setAppliedVoucher(res.data); })
      .catch(() => { if (!cancelled) setAppliedVoucher(null); });
    return () => { cancelled = true; };
  }, [subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (name) => (value) => {
    setDeliveryForm((prev) => ({ ...prev, [name]: value }));
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

  const buildDeliveryAddress = () => `${deliveryForm.street}, ${deliveryForm.barangay}, ${deliveryForm.municipality}, ${deliveryForm.province || 'Oriental Mindoro'}`;

  const handlePlaceOrder = async () => {
    if (storeIds.length !== 1) {
      toast.error('Select items from one store before checkout.');
      router.replace('/cart');
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
      scrollToSection('address');
      return;
    }
    if (fulfillmentMethod === 'DELIVERY' && !sellerDelivers && !chosenCourier) {
      toast.error('Choose a courier to deliver your order.');
      scrollToSection('delivery');
      return;
    }
    if (anyCoverageMissing) {
      toast.error(courierChoices.some(courierPickable)
        ? 'The seller does not deliver to your address. Choose a courier, Pickup, or another address.'
        : 'This store does not deliver to your address. Choose Pickup or update your address.');
      scrollToSection('address');
      return;
    }
    // Locked before the identity check (a network call), so a second tap
    // in the meantime cannot send the order twice.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    if (!(await requireVerifiedIdentity())) {
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    // One key per checkout: a retry after a lost response finds the order
    // already placed instead of placing it again.
    if (!checkoutIdRef.current) checkoutIdRef.current = newCheckoutId();
    const checkoutId = checkoutIdRef.current;
    try {
      const [storeId, storeItems] = Object.entries(itemsByStore)[0];
      const pickupAddr = storeInfo[storeId]?.store?.pickupAddress || '';
      const response = await apiClient.post('/orders', {
        storeId,
        checkoutKey: `${checkoutId}:${storeId}`,
        fulfillmentMethod,
        // QR orders are paid later, from To Pay, once the seller confirms.
        paymentMethod,
        courierId: chosenCourier?.id || undefined,
        voucherCode: appliedVoucher?.voucher?.code || undefined,
        deliveryAddress: fulfillmentMethod === 'DELIVERY' ? buildDeliveryAddress() : pickupAddr,
        contactNumber: normalizeContact(deliveryForm.contactNumber),
        deliveryNotes: notes || undefined,
        ...(fulfillmentMethod === 'DELIVERY' && pinnedAddress?.latitude != null
          ? { deliveryLatitude: pinnedAddress.latitude, deliveryLongitude: pinnedAddress.longitude }
          : {}),
        buyerMunicipalityId: deliveryForm.municipalityId || undefined,
        buyerBarangay: deliveryForm.barangay || undefined,
        buyerProvince: deliveryForm.province || undefined,
        items: storeItems.filter((item) => !item.unavailable).map((item) => ({
          productId: item.productId || item.id,
          quantity: item.quantity,
          selectedVariations: item.selectedVariations || undefined,
        })),
      });
      // Only the lines of this order leave the cart.
      setOrderSuccess(true);
      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        selectedIds.forEach((id) => useCartStore.getState().removeItem(id));
      } else {
        clearCart();
      }
      if (response?.data?.id) setOrderId(response.data.id);
      toast.success('Order placed successfully!');
    } catch (error) {
      // Refused (stock, address…): the next attempt is a new checkout.
      if (error?.status && error.status < 500) checkoutIdRef.current = null;
      if (isIdentityRequiredError(error)) {
        showIdentityRequired();
        return;
      }
      toast.error(error?.message || 'Failed to place order. Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) return null;

  if (orderSuccess) {
    const payLater = paymentMethod !== 'COD';
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Order Placed Successfully!" backTo="/cart" />
        <ScrollView contentContainerStyle={styles.successContent}>
          <CheckoutSuccess
            orderId={orderId}
            payLater={payLater}
            onReceipt={() => router.push(`/receipt/${orderId}`)}
            onOrders={() => router.push(payLater ? '/orders?status=to_pay' : '/orders')}
            onShop={() => router.push('/products')}
          />
        </ScrollView>
      </View>
    );
  }

  const itemCount = orderableItems.reduce((n, it) => n + Number(it.quantity || 0), 0);
  const placeDisabled = isSubmitting || revalidating || storesLoading || unavailableItems.length > 0 || storeLoadFailed;
  let placeLabel = 'Place Order';
  if (isSubmitting) placeLabel = 'Placing Order…';
  else if (storesLoading) placeLabel = 'Loading store details…';

  const activeQrStore = (paymentMethod === 'GCASH' || paymentMethod === 'QRPH')
    ? storeIds.map((id) => storeInfo[id]?.store).find((s) => s?.paymentQrImage)
    : null;
  const pickup = fulfillmentMethod === 'PICKUP';
  const shipLabel = pickup ? 'Pickup' : chosenCourier ? `Shipping (${chosenCourier.name})` : 'Delivery Fee';
  const shipAmount = pickup ? 'No fee' : peso(shippingFee);
  const courierHelp = courierChoices.some(courierPickable);

  const payments = [
    {
      value: 'COD', label: 'Cash on Delivery / Pickup', desc: 'Pay when you receive/pick up your order', enabled: paymentAvailability.cod, Icon: MoneyIcon, color: '#059669',
      off: chosenCourier ? 'Not available with courier delivery' : null,
    },
    { value: 'GCASH', label: 'GCash (QR)', desc: 'Pay with GCash after the seller confirms', enabled: paymentAvailability.gcash, Icon: DeviceMobileIcon, color: t.info[600] },
    { value: 'QRPH', label: 'QR Ph', desc: 'Pay with QR Ph after the seller confirms', enabled: paymentAvailability.qrph, Icon: QrCodeIcon, color: t.danger[700] },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Checkout" backTo="/cart" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {storeLoadFailed ? (
            <CheckoutSection>
              <CheckoutStatus
                tone="bad"
                title="Couldn't load store details"
                lines={["Payment and fulfilment options depend on the store's settings. Check your connection and try again."]}
                action={{ label: storesLoading ? 'Retrying…' : 'Retry', disabled: storesLoading, onPress: () => setStoreLoadAttempt((n) => n + 1) }}
              />
            </CheckoutSection>
          ) : null}

          {unavailableItems.length > 0 ? (
            <CheckoutSection>
              <CheckoutStatus
                tone="bad"
                title={`${unavailableItems.length === 1 ? 'An item is' : `${unavailableItems.length} items are`} no longer available`}
                lines={[`${unavailableItems.map((it) => it.name).join(', ')}. Remove ${unavailableItems.length === 1 ? 'it' : 'them'} from your cart to place this order.`]}
                action={{ label: 'Back to cart', onPress: () => router.replace('/cart') }}
              />
            </CheckoutSection>
          ) : null}

          {!storeLoadFailed ? (
            <>
              <CheckoutSection title="Fulfillment Method" onLayout={markSection('fulfillment')}>
                {todayReady ? (
                  <Text style={styles.todayReady}>Available Today: ready {spanLabel(todayReady.from, todayReady.to)}</Text>
                ) : null}
                <View style={[styles.choices, styles.fulfillmentChoices]}>
                  <CheckoutChoiceCard
                    checked={fulfillmentMethod === 'DELIVERY'}
                    disabled={!fulfillmentAvailability.delivery}
                    onPress={() => setFulfillmentMethod('DELIVERY')}
                    media={(color) => <TruckIcon size={20} weight="fill" color={color} />}
                    title="Delivery"
                    desc={fulfillmentAvailability.delivery ? 'Delivered to your address' : 'Not available for this store'}
                  />
                  <CheckoutChoiceCard
                    checked={pickup}
                    disabled={!fulfillmentAvailability.pickup}
                    onPress={() => setFulfillmentMethod('PICKUP')}
                    media={(color) => <StorefrontIcon size={20} weight="fill" color={color} />}
                    title="Pickup"
                    desc={fulfillmentAvailability.pickup ? 'Pick up at the store · no delivery fee' : 'Not available for this store'}
                    aside={fulfillmentAvailability.pickup ? 'Free' : ''}
                  />
                </View>
              </CheckoutSection>

              <CheckoutSection title={pickup ? 'Contact Details' : 'Delivery Address'} onLayout={markSection('address')}>
                {!pickup && savedAddresses.length > 0 ? (
                  <CheckoutSavedAddresses
                    addresses={savedAddresses}
                    selectedId={selectedAddressId}
                    onPick={applySavedAddress}
                    onManual={() => setSelectedAddressId(null)}
                  />
                ) : null}

                <View style={styles.addressForm}>
                  <CheckoutField
                    label="Full Name"
                    value={deliveryForm.fullName}
                    onChangeText={setField('fullName')}
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                    error={deliveryErrors.fullName}
                  />
                  <CheckoutField
                    label="Contact Number"
                    value={deliveryForm.contactNumber}
                    onChangeText={setField('contactNumber')}
                    placeholder="09xxxxxxxxx"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    error={deliveryErrors.contactNumber}
                  />
                  {!pickup ? (
                    <View style={styles.picker}>
                      <CheckoutAddressPicker
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
                          setDeliveryErrors((prev) => ({ ...prev, street: '', barangay: '', municipality: '', municipalityId: '' }));
                        }}
                        dbMunicipalities={municipalities}
                        dbLoading={municipalitiesLoading}
                        errors={deliveryErrors}
                      />
                    </View>
                  ) : null}
                </View>

                {storeIds.length > 0 ? (
                  <View style={styles.statusList}>
                    {storeIds.map((id) => {
                      const info = storeInfo[id];
                      const storeName = info?.store?.name || itemsByStore[id][0]?.storeName || 'Store';
                      if (pickup) {
                        return (
                          <CheckoutStatus
                            key={id}
                            Icon={StorefrontIcon}
                            title={storeName}
                            lines={[`Pickup at: ${info?.store?.pickupAddress || '—'}`]}
                            note={info?.store?.pickupInstructions || ''}
                          />
                        );
                      }
                      if (!info?.checked) return null;
                      return info.covered ? (
                        <CheckoutStatus key={id} title={storeName} lines={['Delivers to your address']} />
                      ) : (
                        <CheckoutStatus
                          key={id}
                          tone="bad"
                          title={storeName}
                          lines={[courierHelp
                            ? 'The seller does not deliver here, but a courier can. Choose one below.'
                            : 'Does not deliver to your address. Choose Pickup or update your address.']}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </CheckoutSection>

              {!pickup && shipQuote && (sellerDelivers || courierChoices.length > 0) ? (
                <CheckoutSection title="Delivery Option" onLayout={markSection('delivery')}>
                  <View style={styles.choices}>
                    {sellerDelivers ? (() => {
                      const notHere = quoted?.checked && !quoted.covered;
                      return (
                        <CheckoutChoiceCard
                          checked={activeChoice === 'SELLER'}
                          disabled={notHere}
                          onPress={() => setDeliveryChoice('SELLER')}
                          media={(color) => <TruckIcon size={20} weight="fill" color={color} />}
                          title="Delivered by the seller"
                          desc={notHere ? "Doesn't deliver to your address" : 'Cash on delivery or online payment'}
                          aside={notHere ? '' : deliveryFee === 0 ? 'Free' : peso(deliveryFee)}
                        />
                      );
                    })() : null}
                    {courierChoices.map((c) => {
                      let why = null;
                      if (c.fee == null) why = c.reason === 'NO_WEIGHT' ? "Not available: the seller hasn't set the item weight" : 'Not available for this weight';
                      else if (!onlineReady) why = "Not available: the shop doesn't take online payment yet";
                      return (
                        <CheckoutChoiceCard
                          key={c.id}
                          checked={activeChoice === c.id}
                          disabled={Boolean(why)}
                          onPress={() => setDeliveryChoice(c.id)}
                          plainMedia
                          media={<CheckoutCourierMark courier={c} size={30} />}
                          title={c.name}
                          desc={why || `Online payment only · ${(Number(shipQuote.weightGrams || 0) / 1000).toLocaleString('en-PH', { maximumFractionDigits: 2 })} kg`}
                          aside={why ? '' : peso(c.fee)}
                        />
                      );
                    })}
                  </View>
                  {chosenCourier ? (
                    <Text style={styles.deliveryNote}>
                      Courier deliveries are paid online with GCash or QR Ph after the seller confirms your order.
                      {' '}The seller ships it with {chosenCourier.name} and you can track it in My Orders.
                    </Text>
                  ) : null}
                </CheckoutSection>
              ) : null}

              <CheckoutSection title={`Order Items (${itemCount})`}>
                {storeIds.map((id, index) => (
                  <CheckoutStoreItems
                    key={id}
                    first={index === 0}
                    storeName={storeInfo[id]?.store?.name || itemsByStore[id][0]?.storeName || 'Store'}
                    items={itemsByStore[id]}
                    pickup={pickup}
                    shipLabel={pickup ? 'Pickup at the store' : chosenCourier ? `Shipping · ${chosenCourier.name}` : 'Delivery fee'}
                    shipAmount={pickup ? 'No fee' : peso(shippingFee)}
                  />
                ))}
              </CheckoutSection>

              <CheckoutSection title="Payment Method">
                <View style={[styles.choices, styles.paymentChoices]}>
                  {payments.map(({ value, label, desc, enabled, Icon, color, off }) => (
                    <CheckoutChoiceCard
                      key={value}
                      checked={paymentMethod === value}
                      disabled={!enabled}
                      onPress={() => setPaymentMethod(value)}
                      mediaColor={color}
                      media={(c) => <Icon size={20} weight="fill" color={c} />}
                      title={label}
                      desc={enabled ? desc : off || 'Not available for this store'}
                    />
                  ))}
                </View>
                {activeQrStore ? (
                  <CheckoutPayLater shopName={activeQrStore.name} total={total} methodLabel={QR_LABELS[activeQrStore.paymentQrType] || 'GCash'} />
                ) : null}
              </CheckoutSection>

              <CheckoutSection title="Order Notes (Optional)">
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add any special instructions for the seller…"
                  placeholderTextColor="#757575"
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  textAlignVertical="top"
                  accessibilityLabel="Order notes"
                  style={styles.notes}
                />
              </CheckoutSection>
            </>
          ) : null}

          <CheckoutSummary
            itemCount={itemCount}
            subtotal={subtotal}
            shipLabel={shipLabel}
            shipAmount={shipAmount}
            voucher={appliedVoucher}
            discountAmount={discountAmount}
            total={total}
            voucherInput={voucherInput}
            onVoucherInput={setVoucherInput}
            voucherLoading={voucherLoading}
            onApply={() => applyVoucher()}
            onRemove={removeVoucher}
          />
        </ScrollView>

        <CheckoutBar
          saving={discountAmount > 0 ? `Voucher ${appliedVoucher?.voucher?.code} saves you ${peso(discountAmount)} on this order.` : ''}
          itemCount={itemCount}
          total={total}
          busy={isSubmitting}
          label={placeLabel}
          disabled={placeDisabled}
          onPress={handlePlaceOrder}
        />
      </KeyboardAvoidingView>
      {identityDialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  flex: { flex: 1 },
  // Panels 8px apart; the live phone page is white between them.
  content: { gap: 8, paddingBottom: 18 },
  successContent: { paddingBottom: 24 },
  choices: { gap: 10 },
  fulfillmentChoices: { marginBottom: 8 },
  // The payment cards sit flush (gap 0), unlike the fulfillment ones.
  paymentChoices: { gap: 0, marginBottom: 8 },
  todayReady: {
    marginTop: -4,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: t.primary[50],
    color: t.primary[700],
    fontSize: 14,
    lineHeight: 22.4,
    ...font(500),
  },
  addressForm: { gap: 10, marginBottom: 16 },
  picker: {},
  statusList: { gap: 8, marginBottom: 16 },
  deliveryNote: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: t.primary[50],
    color: t.primary[800],
    fontSize: 13,
    lineHeight: 19.5,
    ...font(400),
  },
  notes: {
    height: 95,
    marginBottom: 7,
    padding: 10.5,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 8,
    backgroundColor: '#fff',
    fontSize: 16,
    lineHeight: 24,
    ...font(400),
    color: '#000',
  },
});
