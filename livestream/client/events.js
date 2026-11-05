/*
 * A live's news (comments, hearts, the pinned product, viewers, the end),
 * by long-poll: one request open at a time, answered the moment something
 * happens or after 20 seconds of quiet. Works through any proxy or CDN that
 * passes plain requests, which a WebSocket on shared hosting may not.
 *
 *   const stop = followLive({ base, id, viewer, since, onNews });
 *   const heart = heartSender({ base, id }); heart(); heart(); …
 */

export function followLive({
  base, id, viewer, since = 0, onNews, onError,
}) {
  const root = `${base.replace(/\/$/, '')}/${id}`;
  let v = since;
  let stopped = false;
  let controller = new AbortController();
  let failures = 0;

  const run = async () => {
    while (!stopped) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`${root}/events?v=${v}&viewer=${encodeURIComponent(viewer)}`, { signal: controller.signal });
        if (res.status === 404) {
          onNews({ status: 'ENDED', comments: [] });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        // eslint-disable-next-line no-await-in-loop
        const body = await res.json();
        failures = 0;
        if (body?.data) {
          v = body.data.v;
          onNews(body.data);
          if (body.data.status === 'ENDED') return;
        }
      } catch (err) {
        if (stopped) return;
        failures += 1;
        onError?.(err);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, Math.min(5000, 500 * failures)); });
      }
    }
  };
  run();

  return () => {
    stopped = true;
    controller.abort();
    controller = null;
  };
}

/** Taps on the heart, sent together about once a second. */
export function heartSender({ base, id }) {
  const url = `${base.replace(/\/$/, '')}/${id}/hearts`;
  let pending = 0;
  let timer = null;
  const send = () => {
    timer = null;
    const n = Math.min(30, pending);
    pending = 0;
    if (!n) return;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n }),
      keepalive: true,
    }).catch(() => {});
  };
  const tap = () => {
    pending += 1;
    if (!timer) timer = setTimeout(send, 900);
  };
  tap.flush = send;
  return tap;
}

/** A random id for this viewer, kept for the tab (counts viewers, not people). */
export function viewerId() {
  try {
    let id = sessionStorage.getItem('emoorm.liveViewer');
    if (!id) {
      id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      sessionStorage.setItem('emoorm.liveViewer', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}
