import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * The welcome pop-up's memory (components/welcome/WelcomePopup.js; the
 * website's web/src/lib/welcome.js, same keys).
 *
 *   Visitor      Home, signed out: once per install.
 *   New account  the first buyer screen after an account is made, once per
 *                account. Every sign-up path calls markNewAccount(user) the
 *                moment the server has made the account (Register: email and
 *                Google "complete your account"; Login: the same completion
 *                step there). A user whose createdAt is under an hour old
 *                counts too, for an account made somewhere else.
 *
 * AsyncStorage is asynchronous, so the flags are read once into memory
 * (welcomeReady) and every check after that is synchronous; writes go to
 * both.
 */
const VISITOR_KEY = 'emoorm.welcome.visitor';
const PENDING_KEY = 'emoorm.welcome.new';
const SHOWN_KEY = 'emoorm.welcome.shown';

const HOUR = 60 * 60 * 1000;
// A sign-up that never reaches a buyer screen (a seller going straight to
// their shop) stops waiting after a day.
const PENDING_FOR = 24 * HOUR;

const mem = {};

const write = (key, value) => {
  mem[key] = value;
  const job = value == null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value);
  job.catch(() => { /* full storage: remembered for this run only */ });
};
const readJson = (key, fallback) => {
  try { return JSON.parse(mem[key]) ?? fallback; } catch { return fallback; }
};

/** Resolves once the saved flags are in memory (never rejects). */
export const welcomeReady = AsyncStorage.multiGet([VISITOR_KEY, PENDING_KEY, SHOWN_KEY])
  .then((pairs) => {
    pairs.forEach(([key, value]) => {
      // A write made before the read finished wins.
      if (!(key in mem)) mem[key] = value;
    });
  })
  .catch(() => {});

export const visitorWelcomeSeen = () => mem[VISITOR_KEY] === '1';
export const markVisitorWelcomeSeen = () => write(VISITOR_KEY, '1');

/** The server has just made this account (call right before storing the sign-in). */
export function markNewAccount(user) {
  if (!user?.id) return;
  write(PENDING_KEY, JSON.stringify({ id: String(user.id), at: Date.now() }));
}

const shownIds = () => {
  const list = readJson(SHOWN_KEY, []);
  return Array.isArray(list) ? list.map(String) : [];
};

/** Is the new-account welcome owed to this user? (after welcomeReady) */
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
  // Someone with an account is past the visitor's welcome on this phone.
  markVisitorWelcomeSeen();
}

/*
 * Home's promotion pop-up goes first: while it shows, the new-account
 * welcome waits (the website looks for .home-promo-backdrop in the page).
 * Home reports it through VisitorWelcome's `promotion` prop.
 */
let promotionShowing = false;
export const setPromotionShowing = (on) => { promotionShowing = Boolean(on); };
export const isPromotionShowing = () => promotionShowing;
