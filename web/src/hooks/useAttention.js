import { useCallback, useEffect, useState } from 'react';
import axios from '../lib/axios';

/**
 * What is waiting on this account, keyed by the route it lives at.
 *
 * Both shells badge their sidebar from one request: `/moderation/attention`
 * for admins, `/stores/my/attention` for sellers. Each item already carries
 * the route it belongs to, so the caller looks up `byLink['/admin/reports']`
 * instead of restating the mapping.
 *
 * A failure is silent — a sidebar that shows no badge is a far better outcome
 * than one that shows an error where the navigation should be.
 *
 * @param {String|null} endpoint - null disables the hook entirely
 * @param {Number} intervalMs - how often to refresh; 0 fetches once
 */
export default function useAttention(endpoint, intervalMs = 60000) {
  const [byLink, setByLink] = useState({});
  const [total, setTotal] = useState(0);

  const load = useCallback(async (signal) => {
    if (!endpoint) return;
    try {
      const res = await axios.get(endpoint, { signal });
      const items = Array.isArray(res.data) ? res.data : [];
      const next = {};
      let sum = 0;
      for (const item of items) {
        if (!item?.link) continue;
        next[item.link] = {
          count: item.count || 0,
          severity: item.severity || 'low',
          label: item.label || '',
        };
        sum += item.count || 0;
      }
      setByLink(next);
      setTotal(sum);
    } catch {
      /* leave the last good counts in place */
    }
  }, [endpoint]);

  useEffect(() => {
    if (!endpoint) {
      setByLink({});
      setTotal(0);
      return undefined;
    }
    const controller = new AbortController();
    load(controller.signal);
    if (!intervalMs) return () => controller.abort();

    const timer = setInterval(() => load(controller.signal), intervalMs);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [endpoint, intervalMs, load]);

  return { byLink, total, refresh: () => load() };
}
