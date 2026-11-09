import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * A list that loads its next batch on its own as the end of it comes near,
 * as Home's Explore Products does, so every item can be reached by scrolling
 * (no page 2 for people to miss). The app's port of
 * web/src/hooks/useInfiniteList.js; the same options and the same answer,
 * with "near the end" read from the scroll instead of an observer.
 *
 *   const list = useInfiniteList({
 *     listKey: `products:${filters}`,          // a change starts over at batch 1
 *     loadPage: async (page) => {              // one batch (page 1, 2, …)
 *       const res = await apiClient.get('/products', { params: { ...params, page } });
 *       return { items: res.data, total: res.pagination?.total, totalPages: res.pagination?.totalPages, extra: res };
 *     },
 *     readSaved: (key) => cache.get(key),      // what showed last time, or undefined
 *     save: (key, saved) => cache.set(key, saved),
 *   });
 *
 * Under a FlatList (the list is the FlatList's data):
 *
 *   <FlatList data={list.items} {...list.endProps}
 *     ListFooterComponent={<ListEnd list={list} />} />
 *
 *   endProps is { onEndReached, onEndReachedThreshold: ahead } plus the
 *   scrollProps below: the list's own end check and the scroll's both
 *   ask (one request at a time), so a list whose cells render late (the
 *   web preview's FlatList) still loads on. A FlatList with its own
 *   onScroll / onLayout / onContentSizeChange puts them after the spread
 *   and calls list.checkScroll(e) from its onScroll.
 *
 * Under a ScrollView (the list is the last thing in it):
 *
 *   <ScrollView {...list.scrollProps}>        // onScroll, onLayout, onContentSizeChange, scrollEventThrottle
 *     …the grid of list.items…
 *     <ListEnd list={list} />
 *   </ScrollView>
 *
 *   A screen with its own onScroll (or layout handlers) calls
 *   list.checkScroll(e) from it instead: it takes a scroll event, or
 *   { offset, viewport, content } in px.
 *
 * - The first batch is asked for whenever the list (listKey) changes. What
 *   was saved for that list shows at once meanwhile: on opening the screen,
 *   every batch loaded so far, so Back finds the whole list as left; on a
 *   change of list while the screen is open (a filter, a sort), only its
 *   first batch, unless `restoreAll`. The fresh first batch then replaces
 *   the start of it.
 * - One request at a time; items are kept once each (by id).
 * - A later batch that fails waits for Try again (no retry loop).
 * - The end counts as near up to `ahead` screens below the screen, or
 *   anywhere above it (already scrolled past). After each batch it is
 *   checked again once the list reports its new height, so a tall screen
 *   loads two in a row and a long one waits for the scroll.
 * - `enabled: false` (a hidden tab, the list not wanted yet) asks for nothing.
 *
 * Returns items, total, hasMore, loading (nothing to show yet), error (the
 * first batch failed with nothing to show), refreshing (the first batch is
 * being asked for), loadingMore, failed (a later batch failed), extra (from
 * the first batch), endProps, scrollProps, checkScroll, loadMore, reload
 * (the first batch again: pull to refresh; returns a promise that settles
 * when it has come).
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

/** A scroll event (or plain numbers) as { offset, viewport, content }. */
const readMetrics = (e) => {
  const n = e?.nativeEvent;
  if (n?.contentOffset && n?.layoutMeasurement && n?.contentSize) {
    return { offset: n.contentOffset.y, viewport: n.layoutMeasurement.height, content: n.contentSize.height };
  }
  if (e && typeof e.offset === 'number') return e;
  return null;
};

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
  // Waiting on reload(): settled when its first batch has come.
  const reloadDone = useRef([]);
  const settleReload = () => {
    reloadDone.current.splice(0).forEach((fn) => fn());
  };

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
          settleReload();
        }
      }
    })();
    return () => {
      // Dropped: the list changed (or the screen closed) meanwhile.
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

  // What may ask for the next batch on its own now (not after a failure,
  // which waits for Try again).
  const canAuto = useRef(false);
  canAuto.current = enabled && hasMore && !failed && !loadingMore && !refreshing;

  // The last scroll seen, to check again after each batch.
  const metrics = useRef({ offset: 0, viewport: 0, content: 0 });
  const nearEnd = (m) => m.viewport > 0 && m.content - (m.offset + m.viewport) <= m.viewport * ahead;

  const checkScroll = useCallback((e) => {
    const m = readMetrics(e);
    if (m) metrics.current = { ...metrics.current, ...m };
    if (canAuto.current && nearEnd(metrics.current)) loadMore();
  }, [loadMore, ahead]); // eslint-disable-line react-hooks/exhaustive-deps

  // After each batch there is no check of its own: the old height would
  // still say "near" (the list has not grown on screen yet). The list's
  // next size report (onContentSizeChange, in scrollProps) checks with the
  // new height, so a tall screen still loads a second batch and a long
  // list waits for the scroll.

  const scrollProps = {
    onScroll: checkScroll,
    scrollEventThrottle: 100,
    onLayout: (e) => checkScroll({ ...metrics.current, viewport: e.nativeEvent.layout.height }),
    onContentSizeChange: (_w, h) => checkScroll({ ...metrics.current, content: h }),
  };

  const endProps = {
    ...scrollProps,
    onEndReached: () => { if (canAuto.current) loadMore(); },
    onEndReachedThreshold: ahead,
  };

  const enabledNow = useRef(enabled);
  enabledNow.current = enabled;
  const reload = useCallback(() => new Promise((resolve) => {
    if (!enabledNow.current) { resolve(); return; }
    reloadDone.current.push(resolve);
    setRound((r) => r + 1);
  }), []);

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
    endProps,
    scrollProps,
    checkScroll,
    loadMore,
    reload,
  };
}
