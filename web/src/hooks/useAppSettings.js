import { useQuery } from '@tanstack/react-query';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';

export const APP_SETTINGS_QUERY_KEY = ['app-settings'];

export const DEFAULT_APP_SETTINGS = {
  appLogo: '/brand-icon.png',
  productPlaceholder: '/brand-icon.png',
  // null means the palette the application ships with.
  theme: null,
  // Default delivery fee for stores that have not set their own. The
  // server applies the same rule. Matches the server's default.
  deliveryFee: 50,
  // Whether buyers must verify their ID before checking out.
  requireBuyerVerification: true,
};

/**
 * The delivery fee a store charges, as the server computes it at POST
 * /orders: the store's own fee, or the platform default when it has none.
 * Pickup has no fee.
 * @param {object|null} store - store record (deliveryFee may be null)
 * @param {object} settings - from useAppSettings()
 * @param {'DELIVERY'|'PICKUP'} fulfillmentMethod
 */
export const storeDeliveryFee = (store, settings, fulfillmentMethod = 'DELIVERY') => {
  if (fulfillmentMethod === 'PICKUP') return 0;
  if (store && store.deliveryFee !== null && store.deliveryFee !== undefined && store.deliveryFee !== '') {
    return Number(store.deliveryFee);
  }
  return Number(settings?.deliveryFee ?? DEFAULT_APP_SETTINGS.deliveryFee);
};

export const resolveAppSettingImage = (value) => (
  value === '/brand-icon.png' ? value : resolveImg(value) || '/brand-icon.png'
);

export default function useAppSettings() {
  const query = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await axios.get('/app-settings');
      return { ...DEFAULT_APP_SETTINGS, ...(response.data || {}) };
    },
    staleTime: 10 * 60 * 1000,
  });

  return {
    ...query,
    settings: query.data || DEFAULT_APP_SETTINGS,
  };
}