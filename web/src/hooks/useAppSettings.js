import { useQuery } from '@tanstack/react-query';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';

export const APP_SETTINGS_QUERY_KEY = ['app-settings'];

export const DEFAULT_APP_SETTINGS = {
  appLogo: '/brand-icon.png',
  productPlaceholder: '/brand-icon.png',
  // null means the palette the application ships with.
  theme: null,
  // Checkout pricing, quoted by the cart and checkout and applied by the
  // server from the same record. Defaults match the server's defaults.
  deliveryFee: 50,
  freeDeliveryThreshold: 500,
  // Whether buyers must verify their ID before checking out.
  requireBuyerVerification: true,
};

/**
 * Delivery fee for a given subtotal under the platform rule.
 * @param {object} settings - from useAppSettings()
 * @param {number} subtotal
 * @param {'DELIVERY'|'PICKUP'} fulfillmentMethod
 */
export const quoteDeliveryFee = (settings, subtotal, fulfillmentMethod = 'DELIVERY') => {
  if (fulfillmentMethod === 'PICKUP') return 0;
  const sub = Number(subtotal || 0);
  if (sub <= 0) return 0;
  const fee = Number(settings?.deliveryFee ?? DEFAULT_APP_SETTINGS.deliveryFee);
  const free = Number(settings?.freeDeliveryThreshold ?? DEFAULT_APP_SETTINGS.freeDeliveryThreshold);
  return sub >= free ? 0 : fee;
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