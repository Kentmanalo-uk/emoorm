import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { isAuthSheetPath } from '../../lib/authSheet';
import { useLanguageIntro } from '../../lib/languageIntro';
import { markNewAccountWelcomeShown, newAccountWelcomeDue } from '../../lib/welcome';

// The card and its art load only when someone has just made an account.
const WelcomePopup = lazy(() => import('./WelcomePopup'));

// Not buyer pages: the Seller Center, the admin panel, the Sell pages, the
// sign-in sheets and the app's own hand-offs. The welcome waits for the
// first buyer page instead.
const NOT_BUYER = /^\/(seller|sell|admin|app-google|app-live|facebook-return|verify-email)(\/|$)/;
// Pages someone shops on: "Start shopping" just closes there; anywhere else
// (Profile, Notifications…) it goes to Home.
const SHOPPING = /^\/($|home|search|products?|store|stores|category|cart|checkout|today|live|municipality)(\/|$)/;

// Long enough for the sign-up sheet to slide away first.
const DELAY_MS = 700;

/**
 * "Welcome, Ana! Your account is ready": once per account, on the first
 * buyer page after the account was made (lib/welcome.js). Mounted once,
 * beside the routes (App.jsx), so it follows the real address even while a
 * sign-in sheet keeps rendering the page under it. Waits for Home's own
 * promotion and the first-visit language card to be gone.
 */
export default function NewAccountWelcome() {
  const user = useAuthStore((st) => st.user);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const intro = useLanguageIntro();
  const [open, setOpen] = useState(null);

  const eligible = Boolean(user) && (!user.role || user.role === 'BUYER')
    && !isAuthSheetPath(pathname) && !NOT_BUYER.test(pathname)
    && !intro.asking && !intro.tip;

  useEffect(() => {
    if (open || !eligible || !newAccountWelcomeDue(user)) return undefined;
    let timer = 0;
    const tryOpen = () => {
      // Home's promotion (or another pop-up of its kind) goes first.
      if (document.querySelector('.home-promo-backdrop, .lang-choice')) {
        timer = window.setTimeout(tryOpen, 600);
        return;
      }
      markNewAccountWelcomeShown(user);
      setOpen({ name: user.fullName || '' });
    };
    timer = window.setTimeout(tryOpen, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, user, open]);

  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <Suspense fallback={null}>
      <WelcomePopup
        variant="new"
        name={open.name}
        onClose={close}
        onAction={() => {
          close();
          if (!SHOPPING.test(window.location.pathname)) navigate('/');
        }}
      />
    </Suspense>
  );
}
