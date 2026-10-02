import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowsClockwise, Checks, EnvelopeOpen, Funnel, Heart, MagnifyingGlass, Storefront,
} from '@phosphor-icons/react';
import Layout from './layout/Layout';
import MoreMenu from './MoreMenu';
import ProfileGuest from './ProfileGuest';
import EmptyArt from './ui/EmptyArt';
import './LoginGate.css';

/**
 * What a signed-out visitor sees on a phone when they tap a bottom-nav tab
 * that needs an account: the tab's own title, as when signed in, then a line
 * of text and a Log in button. The bottom navigation stays, so they can
 * simply tap somewhere else. The title bar keeps the tab's own tools where
 * they are when signed in: search leads to Log in, and ⋯ opens the tab's
 * menu, whose account-only choices lead to Log in too.
 */
const GATES = {
  cart: {
    heading: 'Cart',
    title: 'Your cart is empty',
    body: 'Log in to add products and check out.',
    art: 'cart',
    search: false,
    // As the signed-in menu; `open` choices work without an account.
    menu: [
      { key: 'shop', Icon: Storefront, label: 'Continue shopping', open: '/products' },
      { key: 'wish', Icon: Heart, label: 'My wishlist' },
    ],
  },
  messages: {
    heading: 'Messages',
    title: 'No messages yet',
    body: 'Log in to chat with sellers about their products.',
    art: 'messages',
    search: true,
    menu: [
      { key: 'read', Icon: EnvelopeOpen, label: 'Mark all as read' },
      { key: 'unread', Icon: Funnel, label: 'Show unread only' },
      { key: 'refresh', Icon: ArrowsClockwise, label: 'Refresh' },
    ],
  },
  notifications: {
    heading: 'Notifications',
    title: 'No notifications yet',
    body: 'Log in to follow your orders and hear from the shops you like.',
    art: 'notifications',
    search: true,
    menu: [
      { key: 'read', Icon: Checks, label: 'Mark all as read' },
      { key: 'shops', Icon: Storefront, label: 'Manage shop alerts' },
    ],
  },
  profile: {
    heading: 'Profile',
    title: 'You’re not logged in',
    body: 'Log in to see your orders, addresses and saved items.',
  },
};

export default function LoginGate({ page }) {
  const location = useLocation();
  const navigate = useNavigate();
  // The Profile tab shows the page itself, with a sign-in card in place of
  // the shopper's photo and name.
  if (page === 'profile') return <ProfileGuest />;
  const gate = GATES[page] || GATES.profile;
  // `from` brings them back to this tab once they are signed in.
  const toLogin = { to: '/login', state: { from: location } };
  const menu = (gate.menu || []).map(({ key, Icon, label, open }) => ({
    key,
    icon: <Icon size={17} />,
    label,
    ...(open ? { to: open } : { onClick: () => navigate('/login', { state: { from: location } }) }),
  }));

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
            {menu.length > 0 && (
              <MoreMenu
                className="login-gate-more"
                buttonClassName="login-gate-tool"
                label={`${gate.heading} options`}
                iconSize={22}
                items={menu}
              />
            )}
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
