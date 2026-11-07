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
  // Delivery by distance: deliveryFee is the starting fee, covering the
  // first deliveryIncludedKm km by road; each km after costs deliveryPerKm.
  deliveryPerKm: 10,
  deliveryIncludedKm: 3,
  // Whether buyers must verify their ID before checking out.
  requireBuyerVerification: true,
  availableTodayEnabled: true,
  // Home's "Shop by Category": 'IMAGE' (pictures) or 'ICON' (gradient icons).
  categoryStyle: 'IMAGE',
  // Home's shortcuts and the seller's tools: 'GLASS' or 'POP' (glossy 3D).
  shortcutArtStyle: 'GLASS',
  // Their size, as a percent of the standard one: 85, 100, 115 or 130.
  shortcutIconScale: 100,
  // The header bars on phones: 'GLOW' (pink to green), 'WHITE' or 'GREEN'.
  mobileHeaderStyle: 'GLOW',
  // Liquid glass on phones: 'ALL', 'MENUS' (not the tab bar) or 'OFF'.
  mobileGlass: 'ALL',
  // Sign-in methods the super admin switches (email always on).
  loginGoogle: true,
  loginFacebook: true,
  loginPhone: false,
  // MoorMove rider delivery, switched on by the super admin.
  moormoveEnabled: false,
  // 3D / AR product views, switched on by the super admin.
  product3dEnabled: true,
  // How long a new order waits for its shop before it is cancelled on its
  // own, in hours. Two days unless the super admin changes it; the server
  // holds the same default.
  orderConfirmHours: 48,
  // Invites (referrals): off until the super admin turns them on. The
  // server sends every key; this is only the shape before it answers.
  referralSettings: { enabled: false },
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

/**
 * A window of hours in the words a person uses: "2 days", "36 hours".
 * The same rule as the server's windowLabel (utils/orderWindow), so a
 * number set once by a super admin reads the same everywhere.
 */
export const confirmWindowLabel = (hours) => {
  const n = Number(hours);
  if (Number.isInteger(n) && n >= 24 && n % 24 === 0) {
    const days = n / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${n} hour${n === 1 ? '' : 's'}`;
};

/**
 * Fills {{confirmWindow}} in copy written before the number was known.
 * The teaching text cannot name a number a super admin may change, and
 * the assistants already do this server-side (assistantCore's fill), so
 * the two never end up saying different things.
 */
export const fillSettingTokens = (text, settings) => String(text ?? '').replace(
  /\{\{(\w+)\}\}/g,
  (whole, key) => (key === 'confirmWindow'
    ? confirmWindowLabel(settings?.orderConfirmHours ?? DEFAULT_APP_SETTINGS.orderConfirmHours)
    : whole),
);

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