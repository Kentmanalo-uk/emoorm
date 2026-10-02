import { Link, useLocation } from 'react-router-dom';
import { DotsThree, MagnifyingGlass } from '@phosphor-icons/react';
import Layout from './layout/Layout';
import ProfileGuest from './ProfileGuest';
import EmptyArt from './ui/EmptyArt';
import './LoginGate.css';

/**
 * What a signed-out visitor sees on a phone when they tap a bottom-nav tab
 * that needs an account: the tab's own title, as when signed in, then a line
 * of text and a Log in button. The bottom navigation stays, so they can
 * simply tap somewhere else. The title bar keeps the tab's own tools (search,
 * ⋯) where they are when signed in; each one leads to Log in.
 */
const GATES = {
  cart: {
    heading: 'Cart',
    title: 'Your cart is empty',
    body: 'Log in to add products and check out.',
    art: 'cart',
    search: false,
  },
  messages: {
    heading: 'Messages',
    title: 'No messages yet',
    body: 'Log in to chat with sellers about their products.',
    art: 'messages',
    search: true,
  },
  notifications: {
    heading: 'Notifications',
    title: 'No notifications yet',
    body: 'Log in to follow your orders and hear from the shops you like.',
    art: 'notifications',
    search: true,
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
  // `from` brings them back to this tab once they are signed in.
  const toLogin = { to: '/login', state: { from: location } };

  return (
    <Layout showFooter={false}>
      <div className="login-gate-page">
        <div className="login-gate-head">
          <h1 className="login-gate-heading">{gate.heading}</h1>
          <div className="login-gate-tools">
            {gate.search && (
              <Link {...toLogin} className="login-gate-tool" aria-label={`Search ${gate.heading.toLowerCase()}: log in first`}>
                <MagnifyingGlass size={19} />
              </Link>
            )}
            <Link {...toLogin} className="login-gate-tool" aria-label={`${gate.heading} options: log in first`}>
              <DotsThree size={22} weight="bold" />
            </Link>
          </div>
        </div>
        <section className="login-gate">
          {gate.art && <EmptyArt name={gate.art} size={112} className="login-gate-art" />}
          <h2 className="login-gate-title">{gate.title}</h2>
          <p className="login-gate-body">{gate.body}</p>
          <Link {...toLogin} className="login-gate-btn">
            Log in
          </Link>
        </section>
      </div>
    </Layout>
  );
}
