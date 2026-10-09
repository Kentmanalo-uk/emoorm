import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Money,
  QrCode,
  DeviceMobile,
  NotePencil,
  ClockCountdown,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import ProductImage from '../components/ProductImage';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import PhAddressPicker from '../components/common/PhAddressPicker';
import StoreLocationMap from '../components/maps/StoreLocationMap';
import PickupRoute, { validPin } from '../components/maps/PickupRoute';
import useIdentityGate from '../hooks/useIdentityGate';
import useAppSettings, { storeDeliveryFee } from '../hooks/useAppSettings';
import { isIdentityRequiredError } from '../lib/identity';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { qrMethod } from '../lib/qrPayment';
import { BusyLabel } from '../components/ui/Spinner';
import ChoiceCard from '../components/ui/ChoiceCard';
import { spanLabel } from '../lib/availability';
import { CourierMark } from '../components/orders/CourierTracking';
import {
  allowsCourier, allowsMethod, cookDaysLabel, cookReady,
} from '../lib/productKinds';
import { orderEta, onDayStart } from '../lib/eta';
import {
  lineKind, lineNote, lineUnit, countLabel, whenLabel, orderByLabel,
} from '../lib/orderLines';
import './Checkout.css';

// Same rules the server applies at POST /orders.
const CONTACT_NUMBER_RE = /^(09\d{9}|\+639\d{9})$/;
const normalizeContact = (value) => String(value || '').replace(/[\s-]/g, '');

// Phones: the shop a buyer left for the GCash app to pay. Coming back to a
// checkout the browser reloaded meanwhile, GCash is picked again for them.
const GCASH_RETURN_KEY = 'emoorm-checkout-gcash';
const readGcashReturn = () => {
  try {
    return sessionStorage.getItem(GCASH_RETURN_KEY);
  } catch {
    return null;
  }
};
const writeGcashReturn = (storeId) => {
  try {
    if (storeId) sessionStorage.setItem(GCASH_RETURN_KEY, storeId);
    else sessionStorage.removeItem(GCASH_RETURN_KEY);
  } catch {
    // Private browsing: nothing to remember then.
  }
};

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
        const { capped, unavailable, raised = [] } = await revalidate();
        if (cancelled) return;
        if (capped.length) toast(`Quantity reduced to available stock: ${capped.join(', ')}`);
        if (raised.length) toast(`Changed to the minimum order: ${raised.join(', ')}`);
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
  const pinnedAddress = savedAddresses.find((a) => a.id === selectedAddressId) || null;
  // The exact delivery spot, for the rider: the saved address's own pin, or
  // one dropped here (a one-off address, or a saved one that has none yet,
  // which is then saved back to it). Every delivery order carries one.
  const [deliveryPin, setDeliveryPin] = useState(null);

  // Per-store settings + coverage
  const [storeInfo, setStoreInfo] = useState({}); // { [storeId]: { store, error, covered, fee, checked } }
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
    setDeliveryPin(validPin(addr.latitude, addr.longitude) ? { latitude: addr.latitude, longitude: addr.longitude } : null);
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
    setDeliveryPin(null);
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
  const gcashRestored = useRef(false);
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
      // Back from the GCash app to a reloaded checkout: GCash is picked
      // again (once, and only while the shop still takes it).
      const only = results.length === 1 ? results[0] : null;
      if (!gcashRestored.current && only?.store) {
        gcashRestored.current = true;
        if (readGcashReturn() === only.id && only.store.paymentQrImage && only.store.paymentQrType === 'GCASH') {
          setPaymentMethod('GCASH');
        }
      }
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

  // Coverage check on delivery address change (debounced by simple effect).
  // The answer also carries the fee for this address: stores can price each
  // town or barangay on its own.
  const checkCoverage = useCallback(async () => {
    if (fulfillmentMethod !== 'DELIVERY') return;
    if (!deliveryForm.municipalityId) return;
    const params = { municipalityId: deliveryForm.municipalityId };
    if (deliveryForm.barangay) params.barangay = deliveryForm.barangay;
    const results = await Promise.all(
      storeIds.map(async (id) => {
        try {
          const res = await axios.get(`/stores/${id}/coverage`, { params });
          return { id, covered: !!res.data?.covered, fee: res.data?.fee ?? null };
        } catch {
          return { id, covered: false, fee: null };
        }
      })
    );
    setStoreInfo((prev) => {
      const next = { ...prev };
      for (const { id, covered, fee } of results) {
        next[id] = { ...(next[id] || {}), covered, fee, checked: true };
      }
      return next;
    });
  }, [fulfillmentMethod, deliveryForm.municipalityId, deliveryForm.barangay, storeIds]);

  useEffect(() => {
    checkCoverage();
  }, [checkCoverage]);

  // Delivery by the seller (their fee for this address) or by a courier the
  // shop ships with (its rate for the parcel's weight; paid online only).
  const [shipQuote, setShipQuote] = useState(null);
  const [deliveryChoice, setDeliveryChoice] = useState('SELLER'); // 'SELLER' | courier id
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
    axios.post('/couriers/quote', {
      storeId,
      items: lines.map(([productId, quantity]) => ({ productId, quantity })),
      municipalityId: municipalityId || undefined,
      barangay: barangay || undefined,
    })
      .then((res) => { if (!cancelled) setShipQuote(res.data || null); })
      .catch(() => { if (!cancelled) setShipQuote(null); });
    return () => { cancelled = true; };
  }, [quoteKey, fulfillmentMethod]);

  // Available Today items: delivered by the shop or picked up, never by a
  // courier, in the ways their windows allow; ready in their ready time.
  const todayLines = useMemo(() => items.filter((it) => it.listingKind === 'TODAY' && it.availability), [items]);
  const todayReady = todayLines.length
    ? {
      from: Math.min(...todayLines.map((it) => new Date(it.availability.readyFrom).getTime())),
      to: Math.max(...todayLines.map((it) => new Date(it.availability.readyUntil).getTime())),
    }
    : null;

  // Lines no courier can take: live animals and cooked food go with the shop
  // or the buyer, and so does a package without a weight (the quote names
  // these too, once it is in).
  const noCourierNames = useMemo(() => {
    const names = new Set(shipQuote?.notByCourier || []);
    orderableItems.forEach((it) => {
      const kind = lineKind(it);
      const weightKnown = it.weightGrams !== undefined;
      if (['LIVESTOCK', 'COOK_TO_ORDER', 'READY_TO_EAT'].includes(kind) || (kind === 'PACKAGE' && weightKnown && !allowsCourier(it))) {
        names.add(it.name);
      }
    });
    return [...names];
  }, [shipQuote, orderableItems]);

  const sellerDelivers = shipQuote ? shipQuote.seller?.offered !== false : true;
  // Offered, but not to this address: a courier is picked instead.
  const sellerReaches = sellerDelivers && shipQuote?.seller?.covered !== false;
  const onlineReady = Boolean(shipQuote?.onlinePaymentReady);
  const courierChoices = shipQuote?.couriers || [];
  const courierPickable = (c) => c.fee != null && onlineReady && !todayLines.length && !noCourierNames.length;
  // A shop that only ships with couriers can't deliver what they won't take.
  const courierOnlyBlocked = Boolean(shipQuote) && !sellerDelivers && courierChoices.length > 0 && noCourierNames.length > 0;
  // The pick, or the first way that works when it no longer does.
  const choiceValid = (choice) => (choice === 'SELLER'
    ? sellerReaches
    : courierChoices.some((c) => c.id === choice && courierPickable(c)));
  const activeChoice = choiceValid(deliveryChoice)
    ? deliveryChoice
    : (sellerReaches ? 'SELLER' : courierChoices.find(courierPickable)?.id || 'SELLER');
  const chosenCourier = fulfillmentMethod === 'DELIVERY' && activeChoice !== 'SELLER'
    ? courierChoices.find((c) => c.id === activeChoice) || null
    : null;

  // Available payment methods across stores
  const paymentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (stores.length === 0) return { cod: true, gcash: true, qrph: true };
    return {
      // Courier deliveries are paid online.
      cod: !chosenCourier && stores.every((s) => s.acceptsCod !== false),
      gcash: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'GCASH'),
      qrph: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'QRPH'),
    };
  }, [storeIds, storeInfo, chosenCourier]);

  // Fulfillment availability: the shop's, each Available Today window's, and
  // each product's own (pickup only / delivery only), with why when it is off.
  const fulfillmentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    const shopDelivers = stores.every((s) => s.fulfillmentMode === 'DELIVERY' || s.fulfillmentMode === 'BOTH');
    const shopPickup = stores.every((s) => s.fulfillmentMode === 'PICKUP' || s.fulfillmentMode === 'BOTH');
    const pickupOnly = orderableItems.find((it) => !allowsMethod(it, 'DELIVERY'))
      || todayLines.find((it) => it.availability.fulfillment === 'PICKUP');
    const deliveryOnly = orderableItems.find((it) => !allowsMethod(it, 'PICKUP'))
      || todayLines.find((it) => it.availability.fulfillment === 'DELIVERY');
    const deliveryWhy = !shopDelivers ? 'Not available for this store'
      : pickupOnly ? `${pickupOnly.name} is pickup only`
        : courierOnlyBlocked ? `Couriers can't take ${noCourierNames.join(', ')}` : '';
    const pickupWhy = !shopPickup ? 'Not available for this store'
      : deliveryOnly ? `${deliveryOnly.name} is delivery only` : '';
    return {
      delivery: !deliveryWhy, pickup: !pickupWhy, deliveryWhy, pickupWhy,
    };
  }, [storeIds, storeInfo, todayLines, orderableItems, courierOnlyBlocked, noCourierNames]);

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

  const pickPayment = (value) => {
    setPaymentMethod(value);
    if (value !== 'GCASH') writeGcashReturn(null);
  };

  const anyCoverageMissing = useMemo(
    () =>
      fulfillmentMethod === 'DELIVERY' && !chosenCourier &&
      storeIds.some((id) => storeInfo[id]?.checked && !storeInfo[id]?.covered),
    [fulfillmentMethod, storeIds, storeInfo, chosenCourier]
  );

  // Checkout holds one store's items. Delivery costs what that store charges
  // for this address (its quote), or its standard fee until the quote is in.
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

  // Paluto is cooked after the order, and a package may need ordering ahead:
  // when the order should be ready, by the rules the server sets it with.
  const readyNote = (() => {
    const cooked = orderableItems.filter((it) => lineKind(it) === 'COOK_TO_ORDER');
    const ahead = orderableItems.filter((it) => lineKind(it) === 'PACKAGE' && Number(it.details?.noticeHours) > 0);
    if (!cooked.length && !ahead.length) return null;
    const eta = orderEta(checkoutStore, orderableItems, {
      method: fulfillmentMethod,
      courier: Boolean(chosenCourier),
      townId: deliveryForm.municipalityId || null,
    });
    if (!eta) return null;
    const timed = cooked.length > 0 && !onDayStart(eta.from) && !onDayStart(eta.to);
    const why = [];
    if (cooked.length) {
      why.push(cooked.length === 1 ? `${cooked[0].name} is cooked after you order.` : 'Paluto is cooked after you order.');
      // Past today's order-by time, or not a cooking day: the next one.
      const later = cooked.find((it) => !cookReady(it.details).today);
      if (later) {
        const days = later.details?.cookDays?.length ? cookDaysLabel(later.details) : '';
        const by = orderByLabel(later.details?.orderBy);
        if (days && by) why.push(`The shop cooks it on ${days}, for orders by ${by}.`);
        else if (days) why.push(`The shop cooks it on ${days}.`);
        else if (by) why.push(`Orders after ${by} are cooked the next day.`);
      }
    }
    ahead.forEach((it) => {
      const hours = Number(it.details.noticeHours);
      const notice = hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? 'day' : 'days'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      why.push(`Order ${it.name} at least ${notice} ahead.`);
    });
    return {
      label: fulfillmentMethod === 'PICKUP' ? 'Ready for pickup' : 'Expected',
      when: whenLabel(eta.from, eta.to, timed),
      why: why.join(' '),
    };
  })();

  const applyVoucher = async (codeOverride) => {
    const code = String(codeOverride ?? voucherInput ?? '').trim();
    if (!code) return toast.error('Enter a voucher code');
    if (subtotal <= 0) return toast.error('No items to apply a voucher to');
    setVoucherLoading(true);
    try {
      const res = await axios.post('/vouchers/validate', { code, subtotal, storeId: storeIds[0] });
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
      if (!deliveryPin || !validPin(deliveryPin.latitude, deliveryPin.longitude)) errs.pin = 'Pin your delivery spot on the map so the rider can find you.';
    }
    setDeliveryErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // One page: point the buyer at the section that needs attention.
  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const buildDeliveryAddress = () =>
    `${deliveryForm.street}, ${deliveryForm.barangay}, ${deliveryForm.municipality}, ${deliveryForm.province || 'Oriental Mindoro'}`;

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
    // e.g. a pickup-only item with a delivery-only one: order them apart.
    const methodWhy = fulfillmentMethod === 'DELIVERY' ? fulfillmentAvailability.deliveryWhy : fulfillmentAvailability.pickupWhy;
    if (methodWhy) {
      toast.error(`${methodWhy}. Choose another way to get it, or order it on its own.`);
      scrollToSection('co-fulfillment');
      return;
    }
    if (!validateDelivery()) {
      const pinOnly = fulfillmentMethod === 'DELIVERY' && (!deliveryPin || !validPin(deliveryPin.latitude, deliveryPin.longitude))
        && deliveryForm.street.trim() && deliveryForm.barangay.trim() && deliveryForm.municipality.trim();
      toast.error(pinOnly ? 'Pin your delivery spot on the map.' : fulfillmentMethod === 'DELIVERY' ? 'Please complete your delivery address.' : 'Please complete your contact details.');
      scrollToSection(pinOnly ? 'co-pin' : 'co-address');
      return;
    }
    if (fulfillmentMethod === 'DELIVERY' && !sellerDelivers && !chosenCourier) {
      toast.error('Choose a courier to deliver your order.');
      scrollToSection('co-delivery');
      return;
    }
    if (anyCoverageMissing) {
      toast.error(courierChoices.some(courierPickable)
        ? 'The seller does not deliver to your address. Choose a courier, Pickup, or another address.'
        : 'This store does not deliver to your address. Choose Pickup or update your address.');
      scrollToSection('co-address');
      return;
    }
    // Locked before the identity check (a network call), so a second tap
    // in the meantime cannot send the order twice.
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (!(await requireVerifiedIdentity())) {
      setIsSubmitting(false);
      return;
    }
    // One key per checkout: a retry after a lost response finds the order
    // already placed instead of placing it again.
    if (!checkoutIdRef.current) {
      checkoutIdRef.current = window.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    const checkoutId = checkoutIdRef.current;
    try {
      // One shop per order (the cart sends only one here).
      const [storeId, storeItems] = Object.entries(itemsByStore)[0];
      const info = storeInfo[storeId];
      const pickupAddr = info?.store?.pickupAddress || '';
      const response = await axios.post('/orders', {
        storeId,
        checkoutKey: `${checkoutId}:${storeId}`,
        fulfillmentMethod,
        // QR orders are paid later, from To Pay, once the seller confirms.
        paymentMethod,
        // A courier the buyer chose: priced by weight, paid online.
        courierId: chosenCourier?.id || undefined,
        voucherCode: appliedVoucher?.voucher?.code || undefined,
        deliveryAddress:
          fulfillmentMethod === 'DELIVERY' ? buildDeliveryAddress() : pickupAddr,
        contactNumber: normalizeContact(deliveryForm.contactNumber),
        deliveryNotes: notes || undefined,
        // The delivery spot on the map, for the rider.
        ...(fulfillmentMethod === 'DELIVERY' && deliveryPin
          ? { deliveryLatitude: deliveryPin.latitude, deliveryLongitude: deliveryPin.longitude }
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
      // Only remove the items that were part of this order — leave any unselected items in the cart.
      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        selectedIds.forEach((id) => useCartStore.getState().removeItem(id));
      } else {
        clearCart();
      }

      if (response?.data?.id) setOrderId(response.data.id);
      // A saved address pinned here for the first time keeps its pin.
      if (fulfillmentMethod === 'DELIVERY' && pinnedAddress && !validPin(pinnedAddress.latitude, pinnedAddress.longitude) && deliveryPin) {
        axios.put(`/addresses/${pinnedAddress.id}`, { latitude: deliveryPin.latitude, longitude: deliveryPin.longitude }, { quiet: true }).catch(() => {});
      }

      writeGcashReturn(null);
      setOrderSuccess(true);
      toast.success('Order placed successfully!');
    } catch (error) {
      // The server refused this attempt (stock, address…): the next one is a
      // new checkout, with what is in the cart then.
      if (error?.status && error.status < 500) checkoutIdRef.current = null;
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
              {paymentMethod !== 'COD' && (
                <p className="co-pay-later-next">
                  <ClockCountdown size={18} weight="fill" aria-hidden="true" />
                  <span>No payment yet. Once the seller confirms your order, we&apos;ll notify you and it moves to <strong>To Pay</strong> in My Orders, where you pay with the shop&apos;s QR.</span>
                </p>
              )}
              {orderId && (
                <div className="order-reference">
                  <strong>Order ID:</strong> {orderId}
                </div>
              )}
              <div className="order-success-actions">
                {orderId && (
                  <Link to={`/orders/${orderId}/receipt`} className="btn-view-orders">View Receipt</Link>
                )}
                <Link to={paymentMethod !== 'COD' ? '/profile/orders?status=to_pay' : '/profile/orders'} className="btn-view-orders">My Orders</Link>
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
  const placeLabel = isSubmitting
    ? <BusyLabel size={18}>Placing Order…</BusyLabel>
    : storesLoading ? 'Loading store details…' : 'Place Order';

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
                    {todayReady && (
                      <p className="co-today-ready">
                        Available Today: ready {spanLabel(todayReady.from, todayReady.to)}
                      </p>
                    )}
                    {readyNote && (
                      <div className="co-today-ready co-ready-note">
                        <span>{readyNote.label}: {readyNote.when}</span>
                        <small>{readyNote.why}</small>
                      </div>
                    )}

                    <div className="fulfillment-picker co-choices">
                      <ChoiceCard
                        name="fulfillment"
                        value="DELIVERY"
                        className="co-fulfillment-choice"
                        checked={fulfillmentMethod === 'DELIVERY'}
                        disabled={!fulfillmentAvailability.delivery}
                        onChange={setFulfillmentMethod}
                        media={<Truck size={20} weight="fill" />}
                        title="Delivery"
                        desc={fulfillmentAvailability.delivery ? 'Delivered to your address' : fulfillmentAvailability.deliveryWhy}
                      />
                      <ChoiceCard
                        name="fulfillment"
                        value="PICKUP"
                        className="co-fulfillment-choice"
                        checked={fulfillmentMethod === 'PICKUP'}
                        disabled={!fulfillmentAvailability.pickup}
                        onChange={setFulfillmentMethod}
                        media={<StoreIcon size={20} weight="fill" />}
                        title="Pickup"
                        desc={fulfillmentAvailability.pickup ? 'Pick up at the store · no delivery fee' : fulfillmentAvailability.pickupWhy}
                        aside={fulfillmentAvailability.pickup ? 'Free' : ''}
                      />
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

                      {fulfillmentMethod === 'DELIVERY' && (
                        <div className={`form-group checkout-pin${deliveryErrors.pin ? ' has-error' : ''}`} id="co-pin">
                          <label className="form-label">Pin your delivery spot</label>
                          <p className="checkout-pin-help">
                            {pinnedAddress && deliveryPin && validPin(pinnedAddress.latitude, pinnedAddress.longitude)
                              ? 'From your saved address. Drag the pin if the spot has moved.'
                              : 'Tap the map at your house (or use your location). The rider follows this pin.'}
                          </p>
                          <StoreLocationMap
                            value={deliveryPin}
                            onChange={({ latitude, longitude }) => {
                              setDeliveryPin({ latitude, longitude });
                              if (deliveryErrors.pin) setDeliveryErrors((prev) => ({ ...prev, pin: '' }));
                            }}
                            height={240}
                            lockToPhilippines
                            hint="Tap the map where the house is."
                          />
                          {deliveryErrors.pin && <span className="form-error">{deliveryErrors.pin}</span>}
                        </div>
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
                                  {info?.store && <PickupRoute store={info.store} />}
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
                                <p>
                                  {courierChoices.some(courierPickable)
                                    ? 'The seller does not deliver here, but a courier can. Choose one below.'
                                    : 'Does not deliver to your address. Choose Pickup or update your address.'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* How it is delivered: by the seller or by a courier */}
                  {fulfillmentMethod === 'DELIVERY' && shipQuote && (sellerDelivers || courierChoices.length > 0) && (
                    <div className="checkout-section" id="co-delivery">
                      <div className="section-header">
                        <Truck size={24} />
                        <h2>Delivery Option</h2>
                      </div>
                      <div className="co-choices">
                        {sellerDelivers && (() => {
                          const notHere = quoted?.checked && !quoted.covered;
                          return (
                            <ChoiceCard
                              name="delivery-option"
                              value="SELLER"
                              className="co-delivery-choice"
                              checked={activeChoice === 'SELLER'}
                              disabled={notHere}
                              onChange={setDeliveryChoice}
                              media={<Truck size={20} weight="fill" />}
                              title="Delivered by the seller"
                              desc={notHere ? "Doesn't deliver to your address" : 'Cash on delivery or online payment'}
                              aside={notHere ? '' : deliveryFee === 0 ? 'Free' : peso(deliveryFee)}
                            />
                          );
                        })()}
                        {/* Couriers only take goods: none at all when the order has
                            something they can't carry (the note below says why). */}
                        {!noCourierNames.length && courierChoices.map((c) => {
                          const why = c.fee == null
                            ? (c.reason === 'NO_WEIGHT' ? "Not available: the seller hasn't set the item weight"
                              : c.reason === 'NOT_BY_COURIER' ? 'Not available for this order' : 'Not available for this weight')
                            : !onlineReady ? "Not available: the shop doesn't take online payment yet" : null;
                          return (
                            <ChoiceCard
                              key={c.id}
                              name="delivery-option"
                              value={c.id}
                              className="co-delivery-choice"
                              checked={activeChoice === c.id}
                              disabled={Boolean(why)}
                              onChange={setDeliveryChoice}
                              media={<CourierMark courier={c} size={30} />}
                              title={c.name}
                              desc={why || `Online payment only · ${(Number(shipQuote.weightGrams || 0) / 1000).toLocaleString('en-PH', { maximumFractionDigits: 2 })} kg`}
                              aside={why ? '' : peso(c.fee)}
                            />
                          );
                        })}
                      </div>
                      {chosenCourier && (
                        <p className="co-delivery-note">
                          Courier deliveries are paid online with GCash or QR Ph after the seller confirms your order.
                          The seller ships it with {chosenCourier.name} and you can track it in My Orders.
                        </p>
                      )}
                      {noCourierNames.length > 0 && courierChoices.length > 0 && (
                        <p className="co-delivery-note">
                          Couriers can&apos;t take {noCourierNames.join(', ')}. The seller delivers it{fulfillmentAvailability.pickup ? ', or you can pick it up' : ''}.
                        </p>
                      )}
                    </div>
                  )}

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
                                {lineNote(item) && <p className="co-m-item-var co-m-item-note">{lineNote(item)}</p>}
                                {item.unavailable ? (
                                  <p className="co-m-item-bad">{item.unavailableReason || 'Unavailable'}</p>
                                ) : (
                                  <div className="co-m-item-row">
                                    <span className="co-m-item-price">
                                      {peso(item.price)}
                                      {lineUnit(item) && <small className="co-m-item-unit">{lineUnit(item)}</small>}
                                    </span>
                                    <span className="co-m-item-qty">
                                      {lineKind(item) === 'LIVESTOCK' ? countLabel(item) : `×${item.quantity}`}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <div className="co-m-ship">
                            <span>
                              {fulfillmentMethod === 'PICKUP' ? <StoreIcon size={16} /> : <Truck size={16} />}
                              {fulfillmentMethod === 'PICKUP' ? 'Pickup at the store' : chosenCourier ? `Shipping · ${chosenCourier.name}` : 'Delivery fee'}
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
                    <div className="payment-methods co-choices">
                      {[
                        {
                          value: 'COD', label: 'Cash on Delivery / Pickup', desc: 'Pay when you receive/pick up your order', enabled: paymentAvailability.cod, Icon: Money,
                          off: chosenCourier ? 'Not available with courier delivery' : null,
                        },
                        { value: 'GCASH', label: 'GCash (QR)', desc: 'Pay with GCash after the seller confirms', enabled: paymentAvailability.gcash, Icon: DeviceMobile },
                        { value: 'QRPH', label: 'QR Ph', desc: 'Pay with QR Ph after the seller confirms', enabled: paymentAvailability.qrph, Icon: QrCode },
                      ].map(({ value, label, desc, enabled, Icon, off }) => (
                        <ChoiceCard
                          key={value}
                          name="payment"
                          value={value}
                          className={`co-pay-choice co-pay-${value.toLowerCase()}`}
                          checked={paymentMethod === value}
                          disabled={!enabled}
                          onChange={pickPayment}
                          media={<Icon size={20} weight="fill" />}
                          title={label}
                          desc={enabled ? desc : off || 'Not available for this store'}
                        />
                      ))}
                    </div>

                    {activeQrStore && (
                      <div className="co-pay-later" role="note">
                        <ClockCountdown size={22} weight="fill" className="co-pay-later-icon" aria-hidden="true" />
                        <div>
                          <strong>Pay after the seller confirms your order</strong>
                          <p>
                            Nothing to pay now. When {activeQrStore.name || 'the shop'} confirms your order, we&apos;ll notify you
                            and it moves to <b>To Pay</b> in My Orders. Pay {peso(total)} there with the shop&apos;s {qrMethod(activeQrStore.paymentQrType).label || 'QR'},
                            then send your reference number and screenshot. The seller checks the payment and prepares your order.
                          </p>
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
                  <span>{fulfillmentMethod === 'PICKUP' ? 'Pickup' : chosenCourier ? `Shipping (${chosenCourier.name})` : 'Delivery Fee'}</span>
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
