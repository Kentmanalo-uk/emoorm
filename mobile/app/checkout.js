import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DeviceMobileIcon, MoneyIcon, QrCodeIcon, StorefrontIcon, TruckIcon,
} from '../src/lib/icons';
import apiClient from '../src/api/client';
import useAuthStore from '../src/store/authStore';
import useCartStore, { checkLines, patchLines } from '../src/store/cartStore';
import { buyNowLines, clearBuyNow, saveBuyNow } from '../src/lib/buyNow';
import ScreenHeader from '../src/components/ScreenHeader';
import CheckoutChoiceCard, { CheckoutCourierMark } from '../src/components/checkout/CheckoutChoiceCard';
import CheckoutAddressPicker from '../src/components/checkout/CheckoutAddressPicker';
import {
  CheckoutBar, CheckoutField, CheckoutMoormoveMark, CheckoutPayLater, CheckoutSavedAddresses, CheckoutSection,
  CheckoutStatus, CheckoutStoreItems, CheckoutSuccess, CheckoutSummary,
} from '../src/components/checkout/CheckoutParts';
import { rangeLabel } from '../src/components/orders/orderProgress';
import useCartIdentityGate, { isIdentityRequiredError } from '../src/components/cart/useCartIdentityGate';
import LocationPicker from '../src/components/maps/LocationPicker';
import PickupRoute from '../src/components/maps/PickupRoute';
import { validPin } from '../src/components/maps/mapUtils';
import { cartPeso as peso, storeDeliveryFee, useCartSettings } from '../src/components/cart/cartSettings';
import { spanLabel } from '../src/lib/availability';
import { toast } from '../src/lib/toast';
import { font, t, themed } from '../src/theme';

/*
 * Checkout (web/src/pages/Checkout.jsx, phone layout .co-phone): one page of
 * flat panels — fulfillment, address or contact, delivery option, the items,
 * payment, notes and the summary with a voucher — and a bottom bar with the
 * total and Place Order. Same calls and rules as the website: the cart's
 * selected lines only, one shop per order, its coverage and fee for the
 * address, couriers (paid online), a MoorMove rider (its signed quote's fee,
 * by distance to the pin), Available Today windows, and QR payments
 * made later from To Pay once the seller confirms.
 */

// Same rules the server applies at POST /orders.
const CONTACT_NUMBER_RE = /^(09\d{9}|\+639\d{9})$/;
const normalizeContact = (value) => String(value || '').replace(/[\s-]/g, '');
const QR_LABELS = { GCASH: 'GCash', QRPH: 'QR Ph' };
/** "To Brgy. Poblacion" (or "To Roxas"): where the seller's fee is for, when it is priced by place. */
const placeText = (place) => {
  if (!place) return '';
  if (!place.barangay) return place.town ? `To ${place.town}` : '';
  return `To ${/^(brgy\.?|bgy\.?|barangay)\s/i.test(place.barangay) ? place.barangay : `Brgy. ${place.barangay}`}`;
};
/**
 * MoorMove's free-delivery promos for a shop in this town (web lib/moormove
 * promosForTown): a promo without towns runs everywhere.
 */
const promosForTown = (promos, townId) => (promos || []).filter((p) => !Array.isArray(p.townIds)
  || (townId != null && p.townIds.map(String).includes(String(townId))));
// The rider quote's token ran out (web quoteRanOut): ask for the fee again.
const quoteRanOut = (quote) => Boolean(quote?.staleAt) && Date.now() >= quote.staleAt;
const kmText = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;
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
  // MoorMove riders (web lib/moormove useMoormove): offered only while the
  // super admin has them on and the server can reach MoorMove; with the
  // free-delivery promos MoorMove runs now.
  const ridersSwitch = settings?.moormoveEnabled === true;
  const [riderStatus, setRiderStatus] = useState({ enabled: false, promos: [] });
  useEffect(() => {
    if (!ridersSwitch) {
      setRiderStatus({ enabled: false, promos: [] });
      return undefined;
    }
    let live = true;
    apiClient.get('/moormove/status')
      .then((res) => {
        if (!live) return;
        const on = res?.data?.enabled === true;
        setRiderStatus({ enabled: on, promos: on && Array.isArray(res.data.promos) ? res.data.promos : [] });
      })
      .catch(() => { if (live) setRiderStatus({ enabled: false, promos: [] }); });
    return () => { live = false; };
  }, [ridersSwitch]);
  const ridersOn = ridersSwitch && riderStatus.enabled;
  const riderPromos = ridersOn ? riderStatus.promos : [];

  const scrollRef = useRef(null);
  // The bottom bar floats over the page: the page keeps room for it.
  const [barHeight, setBarHeight] = useState(120);
  const sectionY = useRef({});
  const markSection = (key) => (e) => { sectionY.current[key] = e.nativeEvent.layout.y; };
  const scrollToSection = (key) => {
    const y = sectionY.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  };

  // Buy now: its own lines, with the quantity picked, and the cart left as
  // it is (src/lib/buyNow). null: the cart's lines.
  const buyNowId = (Array.isArray(params.buyNow) ? params.buyNow[0] : params.buyNow) || null;
  const [buyNowItems, setBuyNowItems] = useState(() => buyNowLines(buyNowId));
  useEffect(() => {
    if (buyNowId && buyNowItems) saveBuyNow(buyNowId, buyNowItems);
  }, [buyNowId, buyNowItems]);
  // Leaving checkout forgets them.
  useEffect(() => () => clearBuyNow(), []);

  // Refresh price / stock / availability of every line before anything is placed.
  const [revalidating, setRevalidating] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    (async () => {
      if (buyNowItems ? buyNowItems.length === 0 : useCartStore.getState().items.length === 0) return;
      setRevalidating(true);
      try {
        let result;
        if (buyNowItems) {
          result = await checkLines(buyNowItems);
          if (!cancelled) setBuyNowItems((lines) => (lines ? patchLines(lines, result.patches) : lines));
        } else {
          result = await revalidate();
        }
        const { capped, unavailable, raised = [] } = result;
        if (cancelled) return;
        if (capped.length) toast.info(`Quantity reduced to available stock: ${capped.join(', ')}`);
        if (raised.length) toast.info(`Changed to the minimum order: ${raised.join(', ')}`);
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
    if (buyNowItems) return buyNowItems;
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return allItems;
    const allow = new Set(selectedIds);
    return allItems.filter((it) => allow.has(it.id));
  }, [allItems, selectedIds, buyNowItems]);

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
  // The exact delivery spot, for the rider: the saved address's own pin, or
  // one dropped here (a one-off address, or a saved one that has none yet,
  // which is then saved back to it). Every delivery order carries one.
  const [deliveryPin, setDeliveryPin] = useState(null);
  const pinSpot = useRef({ form: 0, pin: 0 });

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
    if (items.length === 0 && !orderSuccess && (buyNowItems || useCartStore.persist.hasHydrated())) {
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

  // Delivery fees of failed rider trips the buyer still owes, per shop
  // (GET /orders/unpaid-fees): an order from that shop carries them, and
  // can't be cash on delivery. The server adds them to the order itself.
  const [unpaidFees, setUnpaidFees] = useState([]);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let live = true;
    apiClient.get('/orders/unpaid-fees')
      .then((res) => { if (live) setUnpaidFees(res?.data?.stores || res?.stores || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [isAuthenticated]);
  const owedFor = (id) => unpaidFees.find((s) => String(s.storeId) === String(id)) || null;
  const owedLines = (id) => (owedFor(id)?.items || []).map((it, i) => ({
    key: it.id || String(i), label: `Unpaid delivery fee (order ${it.orderNumber || '—'})`, amount: Number(it.amount) || 0,
  }));
  const owed = owedFor(storeIds[0]);
  const owedTotal = owedLines(storeIds[0]).reduce((sum, line) => sum + line.amount, 0);
  const codBlocked = Boolean(owed?.codBlocked);

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
        // place: the barangay or town the fee is for (priced by place).
        return { id, covered: !!res.data?.covered, fee: res.data?.fee ?? null, place: res.data?.place || null };
      } catch {
        return { id, covered: false, fee: null };
      }
    }));
    setStoreInfo((prev) => {
      const next = { ...prev };
      results.forEach(({ id, covered, fee, place }) => { next[id] = { ...(next[id] || {}), covered, fee, place, checked: true }; });
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

  // A MoorMove rider: offered when riders are on and the shop takes them
  // (its pin is where the rider picks up). The fee is by distance, so it
  // waits for the buyer's pin; the server prices the order the same way.
  const riderStore = storeInfo[storeIds[0]]?.store || null;
  const ridersOffered = ridersOn && fulfillmentMethod === 'DELIVERY' && Boolean(riderStore)
    && riderStore.moormoveEnabled !== false && validPin(riderStore.latitude, riderStore.longitude);
  // { key, available, reason, fee, listFee, promo, distanceKm, distanceSource,
  //   eta, rideMinutes, quoteToken, quoteExpiresAt, staleAt }
  const [riderQuote, setRiderQuote] = useState(null);
  // Asks for the rider fee again (the last quote ran out).
  const [riderRefresh, setRiderRefresh] = useState(0);
  const riderKey = ridersOffered && deliveryPin && validPin(deliveryPin.latitude, deliveryPin.longitude)
    ? JSON.stringify([
      storeIds[0],
      Number(deliveryPin.latitude).toFixed(6),
      Number(deliveryPin.longitude).toFixed(6),
      orderableItems.map((it) => [it.productId || it.id, it.quantity]),
      deliveryForm.municipalityId || null,
      deliveryForm.barangay || null,
    ])
    : null;
  useEffect(() => {
    if (!riderKey) return undefined;
    const [storeId, lat, lng, lines, municipalityId, barangay] = JSON.parse(riderKey);
    let cancelled = false;
    // A pin being dragged settles first.
    const timer = setTimeout(() => {
      apiClient.post('/moormove/quote', {
        storeId,
        lat: Number(lat),
        lng: Number(lng),
        items: lines.map(([productId, quantity]) => ({ productId, quantity })),
        // The buyer's town and barangay: whether a rider covers this area.
        municipalityId: municipalityId || undefined,
        barangay: barangay || undefined,
      })
        .then((res) => {
          if (cancelled) return;
          const quote = res?.data || {};
          // The quote's token holds for 30 minutes: ask again a little before
          // (at least a minute on, in case this phone's clock is off).
          const left = quote.quoteExpiresAt ? new Date(quote.quoteExpiresAt).getTime() - Date.now() - 30e3 : null;
          setRiderQuote({ key: riderKey, ...quote, staleAt: left == null ? null : Date.now() + Math.max(60e3, left) });
        })
        .catch((err) => {
          if (!cancelled) {
            setRiderQuote({
              key: riderKey,
              available: false,
              reason: err?.status >= 500 || !err?.status ? "Riders can't be reached right now. Try again in a moment." : err?.message || null,
              fee: null,
            });
          }
        });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [riderKey, riderRefresh]);
  // Only the answer for this pin and these items counts.
  const riderAnswer = riderQuote && riderQuote.key === riderKey ? riderQuote : null;
  // A new quote before this one's token runs out, so the order is charged the fee shown.
  const riderStaleAt = riderAnswer?.staleAt || null;
  useEffect(() => {
    if (!riderStaleAt) return undefined;
    const timer = setTimeout(() => setRiderRefresh((n) => n + 1), Math.max(0, riderStaleAt - Date.now()));
    return () => clearTimeout(timer);
  }, [riderStaleAt]);
  const riderReady = Boolean(riderAnswer?.available) && riderAnswer.fee != null;
  // A MoorMove free-delivery promo: no fee for the buyer (MoorMove pays the rider).
  const riderPromo = riderReady && Number(riderAnswer.fee) === 0 && riderAnswer.promo ? riderAnswer.promo : null;
  // Promos MoorMove runs for this shop's town, for the banner over the options
  // (not when no rider can come to this address).
  const shopPromos = ridersOffered && !(riderAnswer && !riderReady)
    ? promosForTown(riderPromos, riderStore?.municipalityId)
    : [];

  // Available Today lines: by the shop or picked up, ready in their window.
  const todayLines = useMemo(() => items.filter((it) => it.listingKind === 'TODAY' && it.availability), [items]);
  const todayReady = todayLines.length
    ? {
      from: Math.min(...todayLines.map((it) => new Date(it.availability.readyFrom).getTime())),
      to: Math.max(...todayLines.map((it) => new Date(it.availability.readyUntil).getTime())),
      // Only pre-orders: say so ("Pre-order: ready tomorrow…").
      preOrder: todayLines.every((it) => it.availability.mode === 'PRE_ORDER'),
    }
    : null;

  const sellerDelivers = shipQuote ? shipQuote.seller?.offered !== false : true;
  const sellerReaches = sellerDelivers && shipQuote?.seller?.covered !== false;
  const onlineReady = Boolean(shipQuote?.onlinePaymentReady);
  const courierChoices = shipQuote?.couriers || [];
  const courierPickable = (c) => c.fee != null && onlineReady && !todayLines.length;
  // The pick, or the first way that works when it no longer does.
  const choiceValid = (choice) => {
    if (choice === 'SELLER') return sellerReaches;
    if (choice === 'MOORMOVE') return riderReady;
    return courierChoices.some((c) => c.id === choice && courierPickable(c));
  };
  const activeChoice = choiceValid(deliveryChoice)
    ? deliveryChoice
    : (sellerReaches ? 'SELLER' : courierChoices.find(courierPickable)?.id || (riderReady ? 'MOORMOVE' : 'SELLER'));
  const riderChosen = fulfillmentMethod === 'DELIVERY' && activeChoice === 'MOORMOVE' && riderReady;
  const riderFree = riderChosen && Boolean(riderPromo);
  const chosenCourier = fulfillmentMethod === 'DELIVERY' && activeChoice !== 'SELLER' && activeChoice !== 'MOORMOVE'
    ? courierChoices.find((c) => c.id === activeChoice) || null
    : null;

  const paymentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (stores.length === 0) return { cod: true, gcash: true, qrph: true };
    return {
      // Courier deliveries are paid online; so is an order carrying an unpaid fee.
      cod: !chosenCourier && !codBlocked && stores.every((s) => s.acceptsCod !== false),
      gcash: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'GCASH'),
      qrph: stores.every((s) => s.paymentQrImage && s.paymentQrType === 'QRPH'),
    };
  }, [storeKey, storeInfo, chosenCourier, codBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const anyCoverageMissing = fulfillmentMethod === 'DELIVERY' && !chosenCourier && !riderChosen
    && storeIds.some((id) => storeInfo[id]?.checked && !storeInfo[id]?.covered);

  // One store per checkout: its fee for this address, or its standard fee until the quote is in.
  const checkoutStore = storeInfo[storeIds[0]]?.store || null;
  const quoted = storeInfo[storeIds[0]];
  const deliveryFee = quoted?.checked && quoted.covered && quoted.fee != null
    ? Number(quoted.fee)
    : storeDeliveryFee(checkoutStore, settings, 'DELIVERY');
  const shippingFee = orderableItems.length > 0 && fulfillmentMethod === 'DELIVERY'
    ? (chosenCourier ? Number(chosenCourier.fee) : riderChosen ? Number(riderAnswer.fee) : deliveryFee)
    : 0;
  // How far the rider goes (the fee is by distance), beside the fee.
  const kmNote = riderChosen && riderAnswer.distanceKm != null
    ? ` · ${kmText(riderAnswer.distanceKm)}${riderAnswer.distanceSource === 'ESTIMATE' ? ' (estimated distance)' : ''}`
    : '';
  const discountAmount = appliedVoucher ? Number(appliedVoucher.discountAmount || 0) : 0;
  const total = Math.max(0, subtotal + shippingFee - discountAmount) + (orderableItems.length > 0 ? owedTotal : 0);

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
      if (!deliveryPin || !validPin(deliveryPin.latitude, deliveryPin.longitude)) errs.pin = 'Pin your delivery spot on the map so the rider can find you.';
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
      toast.error(buyNowItems
        ? 'This item can\'t be ordered right now.'
        : 'Remove the unavailable items from your cart before placing the order.');
      return;
    }
    if (orderableItems.length === 0) {
      toast.error('There is nothing available to order.');
      return;
    }
    if (!validateDelivery()) {
      const pinOnly = fulfillmentMethod === 'DELIVERY' && (!deliveryPin || !validPin(deliveryPin.latitude, deliveryPin.longitude))
        && deliveryForm.street.trim() && deliveryForm.barangay.trim() && deliveryForm.municipality.trim();
      toast.error(pinOnly ? 'Pin your delivery spot on the map.' : fulfillmentMethod === 'DELIVERY' ? 'Please complete your delivery address.' : 'Please complete your contact details.');
      if (pinOnly) {
        const y = sectionY.current.address;
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y + pinSpot.current.form + pinSpot.current.pin - 80), animated: true });
      } else {
        scrollToSection('address');
      }
      return;
    }
    // The rider fee's quote ran out: ask again and let the buyer look it over.
    if (riderChosen && quoteRanOut(riderAnswer)) {
      setRiderRefresh((n) => n + 1);
      toast.error('Checking the rider fee again. Look it over, then place your order.');
      scrollToSection('delivery');
      return;
    }
    if (fulfillmentMethod === 'DELIVERY' && !sellerDelivers && !chosenCourier && !riderChosen) {
      toast.error('Choose a courier to deliver your order.');
      scrollToSection('delivery');
      return;
    }
    // Cash on delivery waits until the shop's unpaid delivery fee is paid.
    if (paymentMethod === 'COD' && codBlocked) {
      toast.error(owed?.message || 'Pay the unpaid delivery fee first: choose GCash or QR Ph.');
      scrollToSection('payment');
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
        // A MoorMove rider: priced by distance on the server, cash on delivery allowed.
        deliveryPartner: riderChosen ? 'MOORMOVE' : undefined,
        // The quote the buyer saw: the order is charged exactly that fee.
        riderQuoteToken: riderChosen && riderAnswer.quoteToken ? riderAnswer.quoteToken : undefined,
        voucherCode: appliedVoucher?.voucher?.code || undefined,
        deliveryAddress: fulfillmentMethod === 'DELIVERY' ? buildDeliveryAddress() : pickupAddr,
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
      // Buy now never went through the cart: the cart stays as it was.
      // Otherwise only the lines of this order leave the cart.
      setOrderSuccess(true);
      if (buyNowItems) {
        clearBuyNow();
      } else if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        selectedIds.forEach((id) => useCartStore.getState().removeItem(id));
      } else {
        clearCart();
      }
      if (response?.data?.id) setOrderId(response.data.id);
      // A saved address pinned here for the first time keeps its pin.
      if (fulfillmentMethod === 'DELIVERY' && pinnedAddress && !validPin(pinnedAddress.latitude, pinnedAddress.longitude) && deliveryPin) {
        apiClient.put(`/addresses/${pinnedAddress.id}`, { latitude: deliveryPin.latitude, longitude: deliveryPin.longitude }).catch(() => {});
      }
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
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.successContent}>
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
  let shipLabel = 'Delivery Fee';
  if (pickup) shipLabel = 'Pickup';
  else if (chosenCourier) shipLabel = `Shipping (${chosenCourier.name})`;
  else if (riderChosen) shipLabel = 'Rider fee';
  let shipAmount = peso(shippingFee);
  if (pickup) shipAmount = 'No fee';
  else if (riderFree) shipAmount = 'Free (MoorMove promo)';
  const courierHelp = courierChoices.some(courierPickable);

  const payments = [
    {
      value: 'COD', label: 'Cash on Delivery / Pickup', desc: 'Pay when you receive/pick up your order', enabled: paymentAvailability.cod, Icon: MoneyIcon, color: t.primary[600],
      off: codBlocked ? (owed?.message || 'Pay the unpaid delivery fee first: choose GCash or QR Ph.') : chosenCourier ? 'Not available with courier delivery' : null,
    },
    { value: 'GCASH', label: 'GCash (QR)', desc: 'Pay with GCash after the seller confirms', enabled: paymentAvailability.gcash, Icon: DeviceMobileIcon, color: t.info[600] },
    { value: 'QRPH', label: 'QR Ph', desc: 'Pay with QR Ph after the seller confirms', enabled: paymentAvailability.qrph, Icon: QrCodeIcon, color: t.danger[700] },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Checkout" backTo={buyNowItems ? '/' : '/cart'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} ref={scrollRef} style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: 18 + barHeight }]} keyboardShouldPersistTaps="handled">
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
                lines={[buyNowItems
                  ? `${unavailableItems.map((it) => it.name).join(', ')} can't be ordered right now.`
                  : `${unavailableItems.map((it) => it.name).join(', ')}. Remove ${unavailableItems.length === 1 ? 'it' : 'them'} from your cart to place this order.`]}
                action={buyNowItems
                  ? { label: 'Go back', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) }
                  : { label: 'Back to cart', onPress: () => router.replace('/cart') }}
              />
            </CheckoutSection>
          ) : null}

          {!storeLoadFailed ? (
            <>
              <CheckoutSection title="Fulfillment Method" onLayout={markSection('fulfillment')}>
                {todayReady ? (
                  <Text style={styles.todayReady}>{todayReady.preOrder ? 'Pre-order' : 'Available Today'}: ready {spanLabel(todayReady.from, todayReady.to)}</Text>
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
                    onManual={() => { setSelectedAddressId(null); setDeliveryPin(null); }}
                  />
                ) : null}

                <View style={styles.addressForm} onLayout={(e) => { pinSpot.current.form = e.nativeEvent.layout.y; }}>
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

                  {!pickup ? (
                    <View style={styles.pin} onLayout={(e) => { pinSpot.current.pin = e.nativeEvent.layout.y; }}>
                      <Text style={styles.pinLabel}>Pin your delivery spot</Text>
                      <Text style={styles.pinHelp}>
                        {pinnedAddress && deliveryPin && validPin(pinnedAddress.latitude, pinnedAddress.longitude)
                          ? 'From your saved address. Drag the pin if the spot has moved.'
                          : 'Tap the map at your house (or use your location). The rider follows this pin.'}
                      </Text>
                      <LocationPicker
                        value={deliveryPin}
                        onChange={({ latitude, longitude }) => {
                          setDeliveryPin({ latitude, longitude });
                          if (deliveryErrors.pin) setDeliveryErrors((prev) => ({ ...prev, pin: '' }));
                        }}
                        height={240}
                        lockToPhilippines
                        hint="Tap the map where the house is."
                        error={Boolean(deliveryErrors.pin)}
                      />
                      {deliveryErrors.pin ? <Text style={styles.pinError}>{deliveryErrors.pin}</Text> : null}
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
                          >
                            {info?.store ? <PickupRoute store={info.store} /> : null}
                          </CheckoutStatus>
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
                          lines={[riderReady
                            ? 'The seller does not deliver here, but a MoorMove rider can. Choose it below.'
                            : courierHelp
                              ? 'The seller does not deliver here, but a courier can. Choose one below.'
                              : 'Does not deliver to your address. Choose Pickup or update your address.']}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </CheckoutSection>

              {!pickup && ((shipQuote && (sellerDelivers || courierChoices.length > 0)) || ridersOffered) ? (
                <CheckoutSection title="Delivery Option" onLayout={markSection('delivery')}>
                  {shopPromos.length > 0 ? (
                    <Text style={styles.promoBanner}>
                      MoorMove free delivery: {shopPromos.map((p) => `${p.title}${p.maxKm ? ` (within ${p.maxKm} km)` : ''}`).join(' · ')}
                    </Text>
                  ) : null}
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
                          desc={notHere ? "Doesn't deliver to your address" : [placeText(quoted?.place), 'Cash on delivery or online payment'].filter(Boolean).join(' · ')}
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
                    {ridersOffered ? (() => {
                      const pinned = deliveryPin && validPin(deliveryPin.latitude, deliveryPin.longitude);
                      let why = null;
                      if (!pinned) why = 'Drop your pin to see the rider fee';
                      else if (!riderAnswer) why = 'Checking the rider fee…';
                      else if (!riderReady) why = riderAnswer.reason || 'No rider for this address right now';
                      const eta = riderReady && riderAnswer.eta?.from && riderAnswer.eta?.to
                        ? rangeLabel({ from: new Date(riderAnswer.eta.from), to: new Date(riderAnswer.eta.to) })
                        : null;
                      // The shop's preparation, then the ride once the rider has it.
                      const ride = riderReady && riderAnswer.rideMinutes != null ? Math.max(1, Math.round(Number(riderAnswer.rideMinutes))) : null;
                      let timing = null;
                      if (eta) timing = ride ? `ready ${eta}, then ~${ride} min ride` : `arrives ${eta}`;
                      const km = riderReady && riderAnswer.distanceKm != null ? kmText(riderAnswer.distanceKm) : null;
                      let aside = '';
                      if (!why) {
                        aside = riderPromo ? (
                          <Text style={styles.freeFee}>
                            {Number(riderAnswer.listFee) > 0 ? <Text style={styles.freeFeeWas}>{peso(riderAnswer.listFee)}{'\n'}</Text> : null}
                            Free
                          </Text>
                        ) : peso(riderAnswer.fee);
                      }
                      return (
                        <CheckoutChoiceCard
                          checked={activeChoice === 'MOORMOVE'}
                          disabled={Boolean(why)}
                          onPress={() => setDeliveryChoice('MOORMOVE')}
                          plainMedia
                          media={<CheckoutMoormoveMark size={30} />}
                          title={riderPromo ? (
                            <>
                              MoorMove{'\n'}
                              <Text style={styles.promoBadge}>{` Free delivery · ${riderPromo.title}, by MoorMove `}</Text>
                            </>
                          ) : 'MoorMove'}
                          desc={why || ['A local rider brings it', km, timing, 'cash on delivery OK'].filter(Boolean).join(' · ')}
                          aside={aside}
                        />
                      );
                    })() : null}
                  </View>
                  {riderChosen ? (
                    <Text style={styles.deliveryNote}>
                      A MoorMove rider picks up your order at the shop and brings it to your pin. You can see the rider on a map in My Orders.
                      {riderFree ? ` You pay no delivery fee: MoorMove's ${riderPromo.title} promo covers it.` : ''}
                      {paymentMethod === 'COD' ? ` Pay ${peso(total)} to the rider when it arrives${riderFree ? ', for the items only' : ''}.` : ''}
                    </Text>
                  ) : null}
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
                    shipLabel={pickup ? 'Pickup at the store' : chosenCourier ? `Shipping · ${chosenCourier.name}` : riderChosen ? 'MoorMove rider' : 'Delivery fee'}
                    shipAmount={shipAmount}
                    shipNote={kmNote}
                    shipFree={riderFree}
                    extras={owedLines(id)}
                  />
                ))}
              </CheckoutSection>

              <CheckoutSection title="Payment Method" onLayout={markSection('payment')}>
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
            shipNote={kmNote}
            shipFree={riderFree}
            voucher={appliedVoucher}
            discountAmount={discountAmount}
            extras={orderableItems.length > 0 ? owedLines(storeIds[0]) : []}
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
          onLayout={(e) => setBarHeight(Math.round(e.nativeEvent.layout.height))}
        />
      </KeyboardAvoidingView>
      {identityDialog}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
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
  // The delivery spot on the map (.checkout-pin, a .form-group: margin 4px 0 14px).
  pin: { marginTop: 4, marginBottom: 14, gap: 6 },
  pinLabel: { fontSize: 12.5, lineHeight: 20, ...font(600), color: t.neutral[700] },
  // .checkout-pin-help: margin 2px 0 8px, on top of the group's 6px gap.
  pinHelp: { marginTop: 2, marginBottom: 8, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  pinError: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.danger[600] },
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
  // MoorMove free-delivery promo (.co-mm-promo-banner): the banner over the
  // options, the green badge on the MoorMove choice (.co-mm-promo
  // .choice-card-badge) and its usual fee struck through (.co-free-fee).
  promoBanner: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: t.primary[50],
    color: t.primary[800],
    fontSize: 13,
    lineHeight: 18.2,
    ...font(600),
  },
  promoBadge: {
    backgroundColor: t.primary[100],
    color: t.primary[800],
    fontSize: 11,
    ...font(600),
  },
  freeFee: { color: t.primary[700] },
  freeFeeWas: {
    color: t.neutral[400],
    fontSize: 12,
    ...font(500),
    textDecorationLine: 'line-through',
  },
  notes: {
    height: 95,
    marginBottom: 7,
    padding: 10.5,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 8,
    backgroundColor: t.neutral[0],
    fontSize: 16,
    lineHeight: 24,
    ...font(400),
    color: t.neutral[900],
  },
}));
