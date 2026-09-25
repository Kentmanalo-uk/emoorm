import { Link } from 'react-router-dom';
import {
  Package, Heart, ChatText as MessageSquare, Bell, Storefront as Store, ShoppingBag, Truck,
  Gear as Settings, CaretRight as ChevronRight, Star, Question, User,
} from '@phosphor-icons/react';
import Layout from './layout/Layout';
import '../pages/Profile.css';
import './ProfileGuest.css';

// Anything that needs an account goes to the login page, which sends the
// shopper on to what they tapped once they are signed in.
const needsLogin = (pathname) => ({ to: '/login', state: { from: { pathname } } });

const PURCHASE = [
  ['To Pay', ShoppingBag, '/profile/orders?status=pending'],
  ['To Ship', Package, '/profile/orders?status=processing'],
  ['To Receive', Truck, '/profile/orders?status=shipped'],
  ['To Pick Up', Store, '/profile/orders?status=ready'],
];

/**
 * The Profile tab for a signed-out visitor on a phone: the same page as a
 * signed-in shopper sees, with the photo-and-name card replaced by a sign-in
 * prompt and Log in / Sign up buttons.
 */
export default function ProfileGuest() {
  return (
    <Layout showFooter={false}>
      <div className="profile-page profile-guest">
        <div className="container">
          <div className="profile-grid">
            <main className="profile-main">
              <div className="profile-mobile-page-header">
                <h1>Profile</h1>
                <div className="profile-mobile-header-actions">
                  <Link to="/help" className="profile-mobile-header-action" aria-label="Help and support">
                    <Question size={19} />
                  </Link>
                </div>
              </div>

              <div className="profile-header-card profile-guest-card">
                <div className="profile-header-left">
                  <div className="profile-avatar profile-guest-avatar" aria-hidden="true">
                    <User size={34} weight="fill" />
                  </div>
                  <div className="profile-header-info">
                    <h2 className="profile-name">Sign in to manage your account</h2>
                    <p className="profile-email">Track orders, save favourites and chat with local sellers.</p>
                  </div>
                </div>
                <div className="profile-guest-actions">
                  <Link {...needsLogin('/profile')} className="profile-guest-btn is-primary">Log in</Link>
                  <Link to="/register" className="profile-guest-btn">Sign up</Link>
                </div>
              </div>

              <div className="profile-section">
                <div className="profile-section-header">
                  <h3 className="profile-section-title">My Purchase</h3>
                  <Link {...needsLogin('/profile/orders')} className="profile-section-link">See All</Link>
                </div>
                <div className="purchase-status-grid">
                  {PURCHASE.map(([label, Icon, to]) => (
                    <Link key={label} {...needsLogin(to)} className="purchase-status-item">
                      <div className="purchase-status-icon"><Icon size={24} /></div>
                      <span className="purchase-status-label">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="profile-section">
                <h3 className="profile-section-title">Services</h3>
                <div className="services-grid">
                  <Link {...needsLogin('/profile/notifications')} className="service-item">
                    <div className="service-icon"><Bell size={24} /></div>
                    <span className="service-label">Notifications</span>
                  </Link>
                  <Link {...needsLogin('/profile/messages')} className="service-item">
                    <div className="service-icon"><MessageSquare size={24} /></div>
                    <span className="service-label">Messages</span>
                  </Link>
                  <Link {...needsLogin('/profile/wishlist')} className="service-item">
                    <div className="service-icon"><Heart size={24} /></div>
                    <span className="service-label">Wishlist</span>
                  </Link>
                  <Link {...needsLogin('/profile/settings')} className="service-item">
                    <div className="service-icon"><Settings size={24} /></div>
                    <span className="service-label">Settings</span>
                  </Link>
                  <Link to="/sell" className="service-item">
                    <div className="service-icon"><Store size={24} /></div>
                    <span className="service-label">Sell on Emoorm</span>
                  </Link>
                  <Link to="/help" className="service-item">
                    <div className="service-icon"><Question size={24} /></div>
                    <span className="service-label">Help &amp; Support</span>
                  </Link>
                </div>
              </div>

              <div className="profile-mobile-service-section">
                <h3 className="profile-section-title">Activity</h3>
                <div className="profile-mobile-service-list">
                  <Link {...needsLogin('/profile/notifications')} className="profile-mobile-service-item">
                    <Bell size={20} weight="fill" /><span>Notifications</span><ChevronRight size={18} />
                  </Link>
                  <Link {...needsLogin('/profile/messages')} className="profile-mobile-service-item">
                    <MessageSquare size={20} weight="fill" /><span>Messages</span><ChevronRight size={18} />
                  </Link>
                  <Link {...needsLogin('/profile/reviews')} className="profile-mobile-service-item">
                    <Star size={20} weight="fill" /><span>Reviews</span><ChevronRight size={18} />
                  </Link>
                </div>
              </div>

              <div className="profile-mobile-service-section">
                <h3 className="profile-section-title">Shopping</h3>
                <div className="profile-mobile-service-list">
                  <Link {...needsLogin('/profile/wishlist')} className="profile-mobile-service-item">
                    <Heart size={20} weight="fill" /><span>Wishlist</span><ChevronRight size={18} />
                  </Link>
                  <Link {...needsLogin('/profile/followed-stores')} className="profile-mobile-service-item">
                    <Store size={20} weight="fill" /><span>Followed Stores</span><ChevronRight size={18} />
                  </Link>
                </div>
              </div>

              <div className="profile-mobile-service-section">
                <h3 className="profile-section-title">More</h3>
                <div className="profile-mobile-service-list">
                  <Link to="/sell" className="profile-mobile-service-item">
                    <Store size={20} weight="fill" /><span>Sell on Emoorm</span><ChevronRight size={18} />
                  </Link>
                  <Link to="/help" className="profile-mobile-service-item">
                    <Question size={20} weight="fill" /><span>Help &amp; Support</span><ChevronRight size={18} />
                  </Link>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
}
