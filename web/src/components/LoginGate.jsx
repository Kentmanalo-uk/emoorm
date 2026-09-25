import { Link, useLocation } from 'react-router-dom';
import Layout from './layout/Layout';
import ProfileGuest from './ProfileGuest';
import './LoginGate.css';

/**
 * What a signed-out visitor sees on a phone when they tap a bottom-nav tab
 * that needs an account: the tab's own title, as when signed in, then a line
 * of text and a Log in button. The bottom navigation stays, so they can
 * simply tap somewhere else.
 */
const GATES = {
  cart: {
    heading: 'Cart',
    title: 'Your cart is empty',
    body: 'Log in to add products and check out.',
  },
  messages: {
    heading: 'Messages',
    title: 'No messages yet',
    body: 'Log in to chat with sellers about their products.',
  },
  notifications: {
    heading: 'Notifications',
    title: 'No notifications yet',
    body: 'Log in to follow your orders and hear from the shops you like.',
  },
  profile: {
    heading: 'Profile',
    title: 'You’re not logged in',
    body: 'Log in to see your orders, addresses and saved items.',
  },
};

export default function LoginGate({ page }) {
  const location = useLocation();
  // The Profile tab shows the page itself, with a sign-in card in place of
  // the shopper's photo and name.
  if (page === 'profile') return <ProfileGuest />;
  const gate = GATES[page] || GATES.profile;

  return (
    <Layout showFooter={false}>
      <div className="login-gate-page">
        <h1 className="login-gate-heading">{gate.heading}</h1>
        <section className="login-gate">
          <h2 className="login-gate-title">{gate.title}</h2>
          <p className="login-gate-body">{gate.body}</p>
          {/* `from` brings them back to this tab once they are signed in. */}
          <Link to="/login" state={{ from: location }} className="login-gate-btn">
            Log in
          </Link>
        </section>
      </div>
    </Layout>
  );
}
