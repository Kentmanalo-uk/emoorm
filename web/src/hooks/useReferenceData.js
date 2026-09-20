import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from '../lib/axios';
import { queryKeys, policy } from '../lib/queryKeys';

/**
 * Shared reads for the data that several screens need at once.
 *
 * Before these hooks, `/municipalities` was fetched from fourteen different
 * components and `/categories` from seven, each with its own useEffect — so
 * opening a page could issue the same request three or four times. Going
 * through one query key means React Query de-duplicates concurrent callers
 * into a single request and serves the rest from cache.
 *
 * All of this is public reference data: no user-specific value is cached here.
 */

/**
 * Municipalities served by the platform. Effectively static.
 * @returns {Object} React Query result; `municipalities` is always an array
 */
export function useMunicipalities({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.municipalities,
    queryFn: async () => (await axios.get('/municipalities')).data || [],
    enabled,
    ...policy.reference,
  });
  return { ...query, municipalities: query.data || [] };
}

/**
 * Product categories.
 * @param {Object} [options]
 * @param {Boolean} [options.activeOnly] - Exclude deactivated categories
 * @returns {Object} React Query result; `categories` is always an array
 */
export function useCategories({ activeOnly = true, enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.categories(activeOnly),
    queryFn: async () => (
      await axios.get('/categories', { params: activeOnly ? undefined : { includeInactive: 'true' } })
    ).data || [],
    enabled,
    ...policy.reference,
  });
  return { ...query, categories: query.data || [] };
}

/**
 * Homepage banners.
 * @returns {Object} React Query result; `banners` is always an array
 */
export function useBanners() {
  const query = useQuery({
    queryKey: queryKeys.banners,
    queryFn: async () => (await axios.get('/banners')).data || [],
    ...policy.publicContent,
  });
  return { ...query, banners: query.data || [] };
}

/**
 * Invalidators for the admin screens that edit this reference data, so an
 * edit shows up everywhere without a page reload.
 * @returns {Object} One invalidator per reference resource
 */
export function useReferenceInvalidation() {
  const queryClient = useQueryClient();
  return {
    categories: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
    municipalities: () => queryClient.invalidateQueries({ queryKey: ['municipalities'] }),
    banners: () => queryClient.invalidateQueries({ queryKey: queryKeys.banners }),
    // A category rename changes the labels embedded in product payloads.
    products: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    stores: () => queryClient.invalidateQueries({ queryKey: ['stores'] }),
  };
}
