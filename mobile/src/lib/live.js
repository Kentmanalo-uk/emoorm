import apiClient from '../api/client';
import { API_BASE_URL } from './config';

/*
 * Live selling (the website's /live, livestream/ at the root of the repo,
 * served by the backend at /api/live). The app plays a live with the
 * phone's own player from its HLS playlist of whole seconds (app/live/[id].js)
 * and goes live through the website's camera page in a web view
 * (app/seller/live.js). This file: the JSON calls, the news long-poll and
 * the hearts, as the website's livestream/client/events.js.
 */

export const LIVE_BASE = `${API_BASE_URL.replace(/\/$/, '')}/live`;

/**
 * The playlist the phone's player follows: whole seconds (?ll=0), not the
 * Low-Latency parts, which stalled on weaker connections. A second or two
 * more delay, and it keeps playing.
 */
export const livePlaylist = (id) => `${LIVE_BASE}/${id}/live.m3u8?ll=0`;

export const liveThumb = (live) => (live?.hasThumb ? `${LIVE_BASE}/${live.id}/thumb.jpg?t=${live.thumbAt || 0}` : null);

/** Lives on now, most watched first (one shop's with `storeId`). */
export const listLives = async (storeId) => {
  const res = await apiClient.get('/live', { params: storeId ? { storeId } : undefined });
  return Array.isArray(res.data) ? res.data : [];
};

export const getLive = async (id) => (await apiClient.get(`/live/${id}`)).data;

export const sendComment = async (id, text) => (await apiClient.post(`/live/${id}/comments`, { text })).data;

/**
 * A live's news (comments, hearts, the pinned product, viewers, the end),
 * one request open at a time, answered the moment something happens.
 * Returns the function that stops it.
 */
export function followLive({
  id, viewer, since = 0, onNews,
}) {
  const root = `${LIVE_BASE}/${id}`;
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
      } catch {
        if (stopped) return;
        failures += 1;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, Math.min(5000, 500 * failures)); });
        controller = new AbortController();
      }
    }
  };
  run();
  return () => {
    stopped = true;
    controller.abort();
  };
}

/** Taps on the heart, sent together about once a second. */
export function heartSender(id) {
  const url = `${LIVE_BASE}/${id}/hearts`;
  let pending = 0;
  let timer = null;
  const send = () => {
    timer = null;
    const n = Math.min(30, pending);
    pending = 0;
    if (!n) return;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n }) }).catch(() => {});
  };
  const tap = () => {
    pending += 1;
    if (!timer) timer = setTimeout(send, 900);
  };
  tap.flush = send;
  return tap;
}

// One id for this app session: counts viewers, not people.
const VIEWER = `app-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
export const viewerId = () => VIEWER;

/** "12:05" or "1:02:05" from seconds. */
export const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** 1.2k, 15k. */
export const compact = (n) => {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(v / 1000)}k`;
};
