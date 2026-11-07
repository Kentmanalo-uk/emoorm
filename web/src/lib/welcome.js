/*
 * The welcome pop-up's memory (components/welcome/WelcomePopup.jsx).
 *
 *   Visitor   Home, signed out: once per browser.
 *   New account  the first buyer page after an account is made, once per
 *             account. Every sign-up path calls markNewAccount(user) the
 *             moment the server has made the account (Register: email and
 *             Google/Facebook/phone "complete your account"; Login: the same
 *             completion step there). A user whose createdAt is under an
 *             hour old counts too, for an account made somewhere else.
 */
const VISITOR_KEY = 'emoorm.welcome.visitor';
const PENDING_KEY = 'emoorm.welcome.new';
const SHOWN_KEY = 'emoorm.welcome.shown';

const HOUR = 60 * 60 * 1000;
// A sign-up that never reaches a buyer page (a seller going straight to
// their shop) stops waiting after a day.
const PENDING_FOR = 24 * HOUR;

const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: nothing remembered */ }
};
const readJson = (key, fallback) => {
  try { return JSON.parse(read(key)) ?? fallback; } catch { return fallback; }
};

export const visitorWelcomeSeen = () => read(VISITOR_KEY) === '1';
export const markVisitorWelcomeSeen = () => write(VISITOR_KEY, '1');

/** The server has just made this account (call right after storeLogin). */
export function markNewAccount(user) {
  if (!user?.id) return;
  write(PENDING_KEY, JSON.stringify({ id: String(user.id), at: Date.now() }));
}

const shownIds = () => {
  const list = readJson(SHOWN_KEY, []);
  return Array.isArray(list) ? list.map(String) : [];
};

/** Is the new-account welcome owed to this user? */
export function newAccountWelcomeDue(user) {
  if (!user?.id) return false;
  const id = String(user.id);
  if (shownIds().includes(id)) return false;
  const pending = readJson(PENDING_KEY, null);
  if (pending?.id === id && Date.now() - Number(pending.at || 0) < PENDING_FOR) return true;
  const created = Date.parse(user.createdAt || '');
  return Number.isFinite(created) && Date.now() - created < HOUR && Date.now() - created > -HOUR;
}

export function markNewAccountWelcomeShown(user) {
  if (!user?.id) return;
  const id = String(user.id);
  write(SHOWN_KEY, JSON.stringify([...shownIds().filter((x) => x !== id), id].slice(-20)));
  const pending = readJson(PENDING_KEY, null);
  if (pending?.id === id) write(PENDING_KEY, null);
  // Someone with an account is past the visitor's welcome on this browser.
  markVisitorWelcomeSeen();
}
