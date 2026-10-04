import { Link } from 'react-router-dom';
import {
  Package, Heart, ChatText as MessageSquare, Bell, Storefront as Store, ShoppingBag, Truck,
  CaretRight as ChevronRight, Star, Question, MapPin, ArrowCounterClockwise, Lifebuoy,
} from '@phosphor-icons/react';
import Layout from './layout/Layout';
import PageMenu from './layout/PageMenu';
import GradientUserIcon from './ui/GradientUserIcon';
import ToolGradients from './ui/ToolGradients';
import RecentlyViewed from './account/RecentlyViewed';
import '../pages/Profile.css';
import './ProfileGuest.css';

// Anything that needs an account goes to the login page, which sends the
// shopper on to what they tapped once they are signed in.
const needsLogin = (pathname) => ({ to: '/login', state: { from: { pathname } } });

const PURCHASE = [
  ['To Pay', ShoppingBag, '/profile/orders?status=to_pay'],
  ['To Ship', Package, '/profile/orders?status=to_ship'],
  ['To Receive', Truck, '/profile/orders?status=to_receive'],
  ['To Pick Up', Store, '/profile/orders?status=to_pickup'],
];

// One line in the lists, as on the signed-in Profile.
function Row({ link, icon: Icon, label }) {
  return (
    <Link {...link} className="pf-m-row">
      <span className="pf-m-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="pf-m-row-label">{label}</span>
      <ChevronRight size={16} className="pf-m-row-chev" />
    </Link>
  );
}

/**
 * The Profile tab for a signed-out visitor on a phone: the same page a
 * signed-in shopper sees (Profile.jsx, phone layout), with the account card
 * replaced by a sign-in card and Log in / Sign up buttons.
 */
export default function ProfileGuest() {
  return (
    <Layout showFooter={false}>
      <div className="profile-page profile-guest">
        <div className="container">
          <div className="profile-grid">
            <div className="profile-main">
              <div className="pf-m">
                <div className="profile-mobile-page-header">
                  <h1>Profile</h1>
                  <div className="profile-mobile-header-actions">
                    <Link to="/help" className="profile-mobile-header-action" aria-label="Help and support">
                      <Question size={19} />
                    </Link>
                    <PageMenu />
                  </div>
                </div>

                <section className="pf-m-card">
                  <div className="pf-m-id">
                    <span className="pf-m-avatar" aria-hidden="true"><GradientUserIcon size={64} /></span>
                    <span className="pf-m-id-text pf-guest-text">
                      <strong>Welcome to E-MOORM</strong>
                      <span>Log in to track orders, save favourites and chat with local sellers.</span>
                    </span>
                  </div>
                  <div className="pf-guest-actions">
                    <Link {...needsLogin('/profile')} className="pf-guest-btn is-primary">Log in</Link>
                    <Link to="/register" className="pf-guest-btn">Sign up</Link>
                  </div>
                </section>

                <section className="pf-m-section">
                  <div className="pf-m-section-head">
                    <h2>My Purchase</h2>
                    <Link {...needsLogin('/profile/orders')}>See all <ChevronRight size={13} weight="bold" /></Link>
                  </div>
                  <ToolGradients />
                  <div className="pf-m-purchase">
                    {PURCHASE.map(([label, Icon, to]) => (
                      <Link key={label} {...needsLogin(to)}>
                        <span className="pf-m-purchase-icon"><Icon size={24} weight="fill" /></span>
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </section>

                <RecentlyViewed />

                <section className="pf-m-section pf-m-list">
                  <h2>Orders &amp; shopping</h2>
                  <Row link={needsLogin('/profile/orders')} icon={Package} label="My Orders" />
                  <Row link={needsLogin('/profile/returns')} icon={ArrowCounterClockwise} label="Returns & refunds" />
                  <Row link={needsLogin('/profile/addresses')} icon={MapPin} label="My Addresses" />
                  <Row link={needsLogin('/profile/wishlist')} icon={Heart} label="Wishlist" />
                  <Row link={needsLogin('/profile/followed-stores')} icon={Store} label="Followed Stores" />
                  <Row link={needsLogin('/profile/reviews')} icon={Star} label="My Reviews" />
                </section>

                <section className="pf-m-section pf-m-list">
                  <h2>Inbox</h2>
                  <Row link={needsLogin('/profile/messages')} icon={MessageSquare} label="Messages" />
                  <Row link={needsLogin('/profile/notifications')} icon={Bell} label="Notifications" />
                </section>

                <section className="pf-m-section pf-m-list">
                  <h2>More</h2>
                  <Row link={{ to: '/sell' }} icon={ShoppingBag} label="Sell on Emoorm" />
                  <Row link={{ to: '/help' }} icon={Lifebuoy} label="Help & Support" />
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
