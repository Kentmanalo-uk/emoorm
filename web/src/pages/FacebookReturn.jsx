import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { takeFacebookReturn } from '../lib/facebookLogin';

/**
 * Where Facebook sends people back after its login dialog (the redirect URI
 * listed in the Meta app). It checks the answer belongs to the sign-in this
 * tab started, then hands it to the Log in page (or the Seller Login), which
 * finishes it the way it finishes a Google sign-in.
 */
export default function FacebookReturn() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const answer = takeFacebookReturn(location.search);
    const to = answer.seller ? '/seller/login' : '/login';
    navigate(answer.from ? `${to}?redirect=${encodeURIComponent(answer.from)}` : to, {
      replace: true,
      state: { facebookReturn: answer },
    });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--t-neutral-500, #6b7280)' }}>
      Signing in with Facebook…
    </div>
  );
}
