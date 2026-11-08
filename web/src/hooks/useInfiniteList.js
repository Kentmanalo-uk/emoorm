import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * A list that loads its next batch on its own as the end of it comes near,
 * as Home's Explore Products does, so every item can be reached by scrolling
 * (no page 2 for people to miss).
 *
 *   const list = useInfiniteList({
 *     listKey: `products:${filters}`,          // a change starts over at batch 1
 *     loadPage: async (page) => ({ items, total, totalPages, extra }),
 *     readSaved: (key) => readCache(key),      // what showed last time, or undefined
 *     save: (key, saved) => writeCache(key, saved),
 *   });
 *   {list.items.map(…)}
 *   <ListEnd list={list} />                    // the watched end, spinner, Try again
 *
 * - The first batch is asked for whenever the list (listKey) changes. What
 *   was saved for that list shows at once meanwhile: on opening the page,
 *   every batch loaded so far, so Back finds the whole list and the spot in
 *   it as left; on a change of list while the page is open (a filter, a
 *   sort), only its first batch, unless `restoreAll` (a Back between two
 *   filters of the same page). The fresh first batch then replaces the
 *   start of it.
 * - One request at a time; items are kept once each (by id).
 * - A later batch that fails waits for Try again (no retry loop).
 * - The end counts as near up to `ahead` screens below the screen, or
 *   anywhere above it (already scrolled past: a jump to the bottom of a tall
 *   page skips over it). A hidden end (display: none) never counts.
 *
 * Returns items, total, hasMore, loading (nothing to show yet), error (the
 * first batch failed with nothing to show), loadingMore, failed (a later
 * batch failed), extra (from the first batch), watchEnd (a ref callback for the element under
 * the list), loadMore, reload.
 */

const startFrom = (key, saved, all = true) => {
  const items = Array.isArray(saved?.items) ? saved.items : null;
  const page = items ? Math.max(1, saved.page || 1) : 0;
  // Only the first batch: a list picked anew starts at its top.
  const firstOnly = !all && page > 1 && saved.firstSize > 0;
  return {
    key,
    items: firstOnly ? items.slice(0, saved.firstSize) : (items || []),
    // Batches loaded: 0 until the first has come (or was saved).
    page: firstOnly ? 1 : page,
    firstSize: saved?.firstSize || 0,
    total: saved?.total || 0,
    totalPages: saved?.totalPages || 0,
    extra: saved?.extra,
    error: null,
  };
};

const snapshot = (s) => ({
  items: s.items, page: s.page, firstSize: s.firstSize, total: s.total, totalPages: s.totalPages, extra: s.extra,
});

export default function useInfiniteList({
  listKey, loadPage, readSaved, save, enabled = true, ahead = 1.5, restoreAll = false,
}) {
  const [state, setState] = useState(() => startFrom(listKey, enabled ? readSaved?.(listKey) : undefined));
  // Another list (a filter, a sort): start from its own saved copy.
  if (state.key !== listKey) {
    setState(startFrom(listKey, enabled ? readSaved?.(listKey) : undefined, restoreAll));
  }
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const [endEl, setEndEl] = useState(null);

  const latest = useRef(state);
  const calls = useRef({ loadPage, save });
  useEffect(() => {
    latest.current = state;
    calls.current = { loadPage, save };
  });
  // Each first batch starts a new generation: answers for an older one
  // (another list) are dropped.
  const generation = useRef(0);
  const busy = useRef(false);

  // The first batch, whenever the list changes (and on reload).
  useEffect(() => {
    if (!enabled) return undefined;
    const gen = ++generation.current;
    busy.current = true;
    setRefreshing(true);
    setLoadingMore(false);
    setFailed(false);
    (async () => {
      try {
        const res = await calls.current.loadPage(1);
        if (gen !== generation.current) return;
        const cur = latest.current;
        const fresh = Array.isArray(res?.items) ? res.items : [];
        const ids = new Set(fresh.map((item) => item.id));
        // Later batches loaded before (shown from the saved copy) stay after
        // the fresh first one.
        const rest = cur.key === listKey && cur.page > 1 ? cur.items.filter((item) => !ids.has(item.id)) : [];
        const next = {
          key: listKey,
          items: [...fresh, ...rest],
          page: rest.length ? cur.page : 1,
          firstSize: fresh.length,
          total: res?.total ?? fresh.length,
          totalPages: res?.totalPages ?? 1,
          extra: res?.extra,
          error: null,
        };
        latest.current = next;
        setState(next);
        calls.current.save?.(listKey, snapshot(next));
      } catch (error) {
        if (gen !== generation.current) return;
        // Offline and the like: the list shown last time stays.
        setState((s) => (s.key === listKey && s.page > 0 ? s : { ...s, error }));
      } finally {
        if (gen === generation.current) {
          busy.current = false;
          setRefreshing(false);
        }
      }
    })();
    return () => {
      // Dropped: the list changed (or the page closed) meanwhile.
      if (gen === generation.current) generation.current += 1;
    };
  }, [listKey, enabled, round]);

  const loadMore = useCallback(async () => {
    const cur = latest.current;
    if (busy.current || cur.page < 1 || cur.page >= cur.totalPages) return;
    const gen = generation.current;
    busy.current = true;
    setLoadingMore(true);
    setFailed(false);
    try {
      const res = await calls.current.loadPage(cur.page + 1);
      if (gen !== generation.current) return;
      const now = latest.current;
      const seen = new Set(now.items.map((item) => item.id));
      const more = (Array.isArray(res?.items) ? res.items : []).filter((item) => !seen.has(item.id));
      const next = {
        ...now,
        items: [...now.items, ...more],
        page: cur.page + 1,
        total: res?.total ?? now.total,
        totalPages: res?.totalPages ?? now.totalPages,
      };
      latest.current = next;
      setState(next);
      calls.current.save?.(now.key, snapshot(next));
    } catch {
      if (gen === generation.current) setFailed(true);
    } finally {
      if (gen === generation.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  const hasMore = state.page >= 1 && state.page < state.totalPages;

  // A fresh observer after each batch reports at once whether the end is
  // still that close (a tall screen can need two batches in a row).
  useEffect(() => {
    if (!endEl || !enabled || !hasMore || failed || loadingMore || refreshing) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: `100000px 0px ${Math.round(window.innerHeight * ahead)}px 0px` });
    observer.observe(endEl);
    return () => observer.disconnect();
  }, [endEl, enabled, hasMore, failed, loadingMore, refreshing, state.page, loadMore, ahead]);

  const reload = useCallback(() => setRound((r) => r + 1), []);

  return {
    items: state.items,
    total: state.total,
    extra: state.extra,
    hasMore,
    // Nothing to show yet (no saved copy): the skeleton.
    loading: enabled && state.page === 0 && !state.error,
    error: state.page === 0 ? state.error : null,
    refreshing,
    loadingMore,
    failed,
    watchEnd: setEndEl,
    loadMore,
    reload,
  };
}
