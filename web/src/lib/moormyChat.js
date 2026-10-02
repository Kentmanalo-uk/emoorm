import { useSyncExternalStore } from 'react';

/*
 * The buyer's chat with Ate Moormy, kept on this device per account. The
 * Messages list reads it (her row shows the last message; before the first
 * question she gets the intro card with its own question box instead) and
 * her chat writes it.
 */

const MAX_KEPT = 40;
const keyFor = (userId) => `emoorm-moormy-buyer-${userId || 'me'}`;
const EMPTY = { messages: [], asked: [], tried: false, updatedAt: null };

const cache = new Map(); // userId -> chat
const listeners = new Set();

const load = (userId) => {
  if (cache.has(userId)) return cache.get(userId);
  let chat = EMPTY;
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    if (saved && Array.isArray(saved.messages)) chat = { ...EMPTY, ...saved };
  } catch { /* starts fresh */ }
  cache.set(userId, chat);
  return chat;
};

/** Replace the chat (or update it from the current one). */
export const setMoormyChat = (userId, next) => {
  const current = load(userId);
  const value = typeof next === 'function' ? next(current) : next;
  const chat = {
    ...value,
    messages: value.messages.slice(-MAX_KEPT),
    tried: hasTriedMoormy(value),
    updatedAt: new Date().toISOString(),
  };
  cache.set(userId, chat);
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(chat));
  } catch { /* kept for this visit only */ }
  listeners.forEach((fn) => fn());
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** { messages, asked, updatedAt } for this account, live. */
export const useMoormyChat = (userId) => useSyncExternalStore(subscribe, () => load(userId));

/**
 * Whether this account has asked her anything yet: the intro card's job is
 * done, and stays done after "New chat" (which keeps `tried`).
 */
export const hasTriedMoormy = (chat) => Boolean(chat.tried) || chat.messages.some((m) => m.role === 'user');
