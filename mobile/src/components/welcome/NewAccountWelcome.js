import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import useAuthStore from '../../store/authStore';
import {
  isPromotionShowing, markNewAccountWelcomeShown, newAccountWelcomeDue, welcomeReady,
} from '../../lib/welcome';
import WelcomePopup from './WelcomePopup';

// Not buyer screens: the Seller Center, the Sell pages, the sign-in sheets
// and the app's own hand-offs. The welcome waits for the first buyer screen.
const NOT_BUYER = /^\/(seller|sell|seller-apply|seller-login|admin|login|register|forgot-password|reset-password|verify-email|google-signin|qr-approve|qr-scan)(\/|$)/;
// Screens someone shops on: "Start shopping" just closes there; anywhere else
// (Profile, Notifications…) it goes to Home.
const SHOPPING = /^\/($|home|search|search-by-image|products?|store|stores|store-map|category|cart|checkout|today|live|municipality)(\/|$)/;

// Long enough for the sign-up sheet to slide away first.
const DELAY_MS = 700;

/**
 * "Welcome, Ana! Your account is ready" (web components/welcome/
 * NewAccountWelcome.jsx): once per account, on the first buyer screen after
 * the account was made (lib/welcome.js). Mount it once, app-wide, beside the
 * navigator (app/_layout.js), so it follows the real screen. It waits for
 * Home's promotion pop-up to be gone.
 */
export default function NewAccountWelcome() {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [open, setOpen] = useState(null);

  const eligible = Boolean(user) && (!user.role || user.role === 'BUYER') && !NOT_BUYER.test(pathname);

  useEffect(() => {
    if (open || !eligible) return undefined;
    let timer = 0;
    let live = true;
    const tryOpen = () => {
      if (!live) return;
      // Home's promotion goes first.
      if (isPromotionShowing()) {
        timer = setTimeout(tryOpen, 600);
        return;
      }
      if (!newAccountWelcomeDue(user)) return;
      markNewAccountWelcomeShown(user);
      setOpen({ name: user.fullName || '' });
    };
    welcomeReady.then(() => {
      if (!live || !newAccountWelcomeDue(user)) return;
      timer = setTimeout(tryOpen, DELAY_MS);
    });
    return () => { live = false; clearTimeout(timer); };
  }, [eligible, user, open]);

  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <WelcomePopup
      variant="new"
      name={open.name}
      onClose={close}
      onAction={() => {
        close();
        if (!SHOPPING.test(pathname)) router.navigate('/');
      }}
    />
  );
}
