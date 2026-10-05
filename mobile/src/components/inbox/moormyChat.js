import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * The buyer's chat with Ate Moormy, kept on this device per account
 * (web/src/lib/moormyChat.js, same storage key). The Messages list reads it
 * (her row shows the last message; before the first question she gets the
 * intro card with its own question box instead) and her chat writes it.
 */

const MAX_KEPT = 40;
const keyFor = (userId) => `emoorm-moormy-buyer-${userId || 'me'}`;
const EMPTY = { messages: [], asked: [], tried: false, updatedAt: null, loaded: false };

const cache = new Map(); // userId -> chat
const loading = new Set();
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

/**
 * Whether this account has asked her anything yet: the intro card's job is
 * done, and stays done after "New chat" (which keeps `tried`).
 */
export const hasTriedMoormy = (chat) => Boolean(chat.tried) || chat.messages.some((m) => m.role === 'user');

const read = (userId) => cache.get(userId) || EMPTY;

const load = (userId) => {
  if (cache.has(userId) || loading.has(userId)) return;
  loading.add(userId);
  AsyncStorage.getItem(keyFor(userId))
    .then((raw) => {
      const saved = JSON.parse(raw || 'null');
      if (!cache.has(userId)) {
        cache.set(userId, saved && Array.isArray(saved.messages) ? { ...EMPTY, ...saved, loaded: true } : { ...EMPTY, loaded: true });
      }
    })
    .catch(() => { if (!cache.has(userId)) cache.set(userId, { ...EMPTY, loaded: true }); })
    .finally(() => { loading.delete(userId); notify(); });
};

/** Replace the chat (or update it from the current one). */
export const setMoormyChat = (userId, next) => {
  const current = read(userId);
  const value = typeof next === 'function' ? next(current) : next;
  const chat = {
    ...value,
    messages: value.messages.slice(-MAX_KEPT),
    tried: hasTriedMoormy(value),
    updatedAt: new Date().toISOString(),
    loaded: true,
  };
  cache.set(userId, chat);
  const { loaded, ...saved } = chat;
  AsyncStorage.setItem(keyFor(userId), JSON.stringify(saved)).catch(() => { /* kept for this visit only */ });
  notify();
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** { messages, asked, updatedAt, loaded } for this account, live. */
export const useMoormyChat = (userId) => {
  useEffect(() => { load(userId); }, [userId]);
  return useSyncExternalStore(subscribe, () => read(userId));
};
