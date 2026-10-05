import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

/*
 * What the cart and checkout need from the admin's app settings
 * (web/src/hooks/useAppSettings.js): the platform's default delivery fee.
 * Asked for once per app run.
 */
export const DEFAULT_CART_SETTINGS = { deliveryFee: 50, requireBuyerVerification: true };

let cached = null;
let pending = null;
const load = () => {
  pending = pending || apiClient.get('/app-settings')
    .then((res) => { cached = { ...DEFAULT_CART_SETTINGS, ...(res?.data || {}) }; return cached; })
    .catch(() => { pending = null; return DEFAULT_CART_SETTINGS; });
  return pending;
};

export function useCartSettings() {
  const [settings, setSettings] = useState(cached || DEFAULT_CART_SETTINGS);
  useEffect(() => {
    let live = true;
    load().then((s) => { if (live) setSettings(s); });
    return () => { live = false; };
  }, []);
  return settings;
}

/** A store's delivery fee: its own, else the platform default (web storeDeliveryFee). */
export const storeDeliveryFee = (store, settings, fulfillmentMethod = 'DELIVERY') => {
  if (fulfillmentMethod === 'PICKUP') return 0;
  if (store && store.deliveryFee !== null && store.deliveryFee !== undefined && store.deliveryFee !== '') {
    return Number(store.deliveryFee);
  }
  return Number(settings?.deliveryFee ?? DEFAULT_CART_SETTINGS.deliveryFee);
};

/** ₱1,234.50 */
export const cartPeso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
