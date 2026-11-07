import { Link } from 'react-router-dom';
import {
  Package, Storefront as Store, ShoppingBag, Truck,
  CaretRight as ChevronRight, Question, Lifebuoy, Headset, Info,
} from '../lib/icons';
import Layout from './layout/Layout';
import PageMenu from './layout/PageMenu';
import GradientUserIcon from './ui/GradientUserIcon';
import RecentlyViewed from './account/RecentlyViewed';
import { LanguageTile } from './account/LanguageRow';
import ProfileTools from './account/ProfileTools';
import MoreProducts from './product/MoreProducts';
import {
  FlagArt, GlobeArt, HeartArt, ParcelArt, PinArt, ReturnArt, ShopArt, StarArt, TagArt,
} from './art/FlatArt';
import useShortcutLook, { useShortcutScale } from '../hooks/useShortcutLook';
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

/**
 * The Profile tab for a signed-out visitor on a phone: the same page a
 * signed-in shopper sees (Profile.jsx, phone layout), with the account card
 * replaced by a sign-in card and Log in / Sign up buttons.
 */
export default function ProfileGuest() {
  const look = useShortcutLook();
  const scale = useShortcutScale();
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
                      {/* The two doors sit under the welcome, where a
                          signed-in person's email is. */}
                      <span className="pf-guest-actions">
                        <Link {...needsLogin('/profile')} className="pf-guest-btn is-primary">Log in</Link>
                        <Link to="/register" className="pf-guest-btn">Sign up</Link>
                      </span>
                    </span>
                  </div>
                </section>

                <section className="pf-m-section">
                  <div className="pf-m-section-head">
                    <h2>My Purchase</h2>
                    <Link {...needsLogin('/profile/orders')}>See all <ChevronRight size={13} weight="bold" /></Link>
                  </div>
                  <div className="pf-m-purchase">
                    {PURCHASE.map(([label, Icon, to]) => (
                      <Link key={label} {...needsLogin(to)}>
                        <span className="pf-m-purchase-icon"><Icon size={30} weight="light" /></span>
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </section>

                <RecentlyViewed />

                {/* The signed-in Profile's shortcuts and strip; what needs an
                    account asks for one first. */}
                <section className="pf-m-section pf-m-tools-sec" aria-label="Orders and shopping">
                  <ProfileTools scale={scale}>
                    {[
                      ['orders', '/profile/orders', 'My Orders', ParcelArt],
                      ['returns', '/profile/returns', 'Returns & Refunds', ReturnArt],
                      ['addresses', '/profile/addresses', 'My Addresses', PinArt],
                      ['wishlist', '/profile/wishlist', 'Wishlist', HeartArt],
                      ['following', '/profile/followed-stores', 'Followed Stores', ShopArt],
                      ['reviews', '/profile/reviews', 'My Reviews', StarArt],
                      ['offers', '/profile/offers', 'My Offers', TagArt],
                      ['reports', '/profile/reports', 'My Reports', FlagArt],
                    ].map(([key, to, label, Art]) => (
                      <Link key={key} {...needsLogin(to)} className="pf-m-tool">
                        <Art size={36} glass look={look} />
                        <span>{label}</span>
                      </Link>
                    ))}
                    {/* Guests too: the first-visit tip points here. */}
                    <LanguageTile key="language" Art={GlobeArt} look={look} className="pf-m-tool" />
                  </ProfileTools>
                </section>

                <section className="pf-m-section pf-m-links-sec">
                  <nav className="pf-m-links" aria-label="Help and more">
                    {[
                      [{ to: '/help' }, Lifebuoy, 'Help Centre'],
                      [needsLogin('/profile/support'), Headset, 'Help & Support'],
                      [{ to: '/about' }, Info, 'About E-MOORM'],
                      [{ to: '/sell' }, Store, 'Sell on E-MOORM'],
                    ].map(([link, Icon, label]) => (
                      <Link key={label} {...link} className="pf-m-link">
                        <Icon size={20} />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </nav>
                </section>

                <MoreProducts />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
