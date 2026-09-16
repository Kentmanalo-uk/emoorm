import { useQuery } from '@tanstack/react-query';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';

export const APP_SETTINGS_QUERY_KEY = ['app-settings'];

export const DEFAULT_APP_SETTINGS = {
  appLogo: '/brand-icon.png',
  productPlaceholder: '/brand-icon.png',
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