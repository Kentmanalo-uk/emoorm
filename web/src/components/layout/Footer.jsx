import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import { useMunicipalities, useCategories } from '../../hooks/useReferenceData';
import { queryKeys, policy } from '../../lib/queryKeys';
import AppLogo from '../AppLogo';
import './Footer.css';

// The footer renders on every page, so these three reads used to fire on every
// navigation. They now share the app-wide query cache with the rest of the
// screens, which replaced the per-module request dedupe that used to live here.

const PAYMENT_OPTIONS = ['Cash on Delivery', 'GCash', 'QR Ph', 'Bank Transfer'];
const LANGUAGE_NAMES = ['English', 'Tagalog', 'Bisaya'];

const BUYER_GUIDES = [
  { to: '/help?topic=buying', label: 'How to Buy' },
  { to: '/help?topic=payments', label: 'Payment Methods' },
  { to: '/help?topic=delivery', label: 'Shipping & Delivery' },
  { to: '/help?topic=returns', label: 'Returns & Refunds' },
  { to: '/profile/verification', label: 'Verify Your Identity' },
  { to: '/search/image', label: 'Search by Image' },
];

const SELLER_TOOLS = [
  { to: '/sell', label: 'Sell on Emoorm' },
  { to: '/seller/apply', label: 'Seller Application' },
  { to: '/seller', label: 'Seller Center' },
  { to: '/seller/fulfillment', label: 'Delivery & Pickup Settings' },
  { to: '/seller/analytics', label: 'Sales Analytics' },
  { to: '/seller/finance', label: 'Finance' },
];

const COMPANY_LINKS = [
  { to: '/about', label: 'About Emoorm' },
  { to: '/customer-care', label: 'Customer Care' },
  { to: '/feedback', label: 'Feedback' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/cookies', label: 'Cookie Policy' },
];

const MUNICIPALITY_NAMES = 'Baco, Bansud, Bongabong, Bulalacao, Calapan City, Gloria, Mansalay, Naujan, Pinamalayan, Pola, Puerto Galera, Roxas, San Teodoro, Socorro, Victoria';

/** Comma-separated inline link list, as used in the directory section. */
function LinkList({ items }) {
  return (
    <p className="footer-directory-links">
      {items.map((item, index) => (
        <React.Fragment key={item.key || item.to}>
          {index > 0 && ', '}
          <Link to={item.to}>{item.label}</Link>
        </React.Fragment>
      ))}
    </p>
  );
}

// App-style pages where phones hide the site footer (the bottom nav is the navigation).
const APP_PAGE = /^\/(profile|cart|checkout|wishlist|notifications|orders)(\/|$)/;

const Footer = () => {
  const { pathname } = useLocation();
  const currentYear = new Date().getFullYear();
  const { municipalities } = useMunicipalities();
  const { categories: fetchedCategories } = useCategories();
  const { data: stores = [] } = useQuery({
    queryKey: queryKeys.stores({ page: 1, pageSize: 12 }),
    queryFn: async () => (await axios.get('/stores', { params: { page: 1, pageSize: 12 } })).data || [],
    ...policy.publicContent,
  });

  const allCategories = useMemo(
    () => fetchedCategories.filter((c) => c.isActive !== false),
    [fetchedCategories]
  );
  const categories = useMemo(() => allCategories.slice(0, 8), [allCategories]);

  return (
    <footer className={`footer${APP_PAGE.test(pathname) ? ' footer--app-page' : ''}`}>
      <div className="container">
        {/* Brand band: municipality seals (decorative) and the app mark */}
        <div className="footer-brand-band">
          {municipalities.length > 0 ? (
            <div className="footer-municipalities" aria-label="Municipalities of Oriental Mindoro">
              {/* Two rows: 7 seals on top, the rest below. */}
              {[municipalities.slice(0, 7), municipalities.slice(7)].map((row, index) => (
                row.length > 0 && (
                  <ul key={index} className="footer-municipality-row">
                    {row.map((municipality) => (
                      <li key={municipality.id} className="footer-municipality" title={municipality.name}>
                        {municipality.logo ? (
                          <img src={resolveImg(municipality.logo)} alt={municipality.name} loading="lazy" />
                        ) : (
                          <span aria-label={municipality.name}>{municipality.name?.charAt(0).toUpperCase()}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ))}
            </div>
          ) : (
            <p className="footer-categories-text">
              Calapan City • Puerto Galera • Naujan • Pinamalayan • Bansud • Bongabong • Bulalacao • Gloria • Mansalay • Pola • Roxas • San Teodoro • Socorro • Victoria
            </p>
          )}

          <div className="footer-brand">
            <AppLogo className="footer-brand-logo" alt="" />
            <span className="footer-brand-name">Emoorm</span>
          </div>
        </div>

        <div className="footer-content">
          {/* Customer Care */}
          <div className="footer-section">
            <h3 className="footer-title">Customer Care</h3>
            <ul className="footer-links">
              <li><Link to="/help">Help Centre</Link></li>
              <li><Link to="/help?topic=buying">How to Buy</Link></li>
              <li><Link to="/sell">How to Sell</Link></li>
              <li><Link to="/help?topic=returns">Returns & Refunds</Link></li>
              <li><Link to="/help?topic=delivery">Shipping & Delivery</Link></li>
              <li><Link to="/help?topic=payments">Payment Methods</Link></li>
              <li><Link to="/customer-care">Contact Support</Link></li>
              <li><Link to="/feedback">Feedback</Link></li>
            </ul>
          </div>

          {/* Emoorm */}
          <div className="footer-section">
            <h3 className="footer-title">Emoorm</h3>
            <ul className="footer-links">
              <li><Link to="/about">About Emoorm</Link></li>
              <li><Link to="/about#how-it-works">How Emoorm Works</Link></li>
              <li><Link to="/seller/apply">Seller Registration</Link></li>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
            </ul>
          </div>

          {/* My Account */}
          <div className="footer-section">
            <h3 className="footer-title">My Account</h3>
            <ul className="footer-links">
              <li><Link to="/login">Sign In</Link></li>
              <li><Link to="/register">Create Account</Link></li>
              <li><Link to="/profile">My Profile</Link></li>
              <li><Link to="/wishlist">My Wishlist</Link></li>
              <li><Link to="/notifications">Notifications</Link></li>
              <li><Link to="/profile/orders">My Orders</Link></li>
            </ul>
          </div>

          {/* Shop by Category */}
          <div className="footer-section">
            <h3 className="footer-title">Shop by Category</h3>
            <ul className="footer-links">
              {categories.length > 0 ? (
                categories.map((c) => (
                  <li key={c.id}><Link to={`/products?category=${c.id}`}>{c.name}</Link></li>
                ))
              ) : (
                <li><Link to="/products">Browse All Products</Link></li>
              )}
            </ul>
          </div>

          {/* Contact Us */}
          <div className="footer-section">
            <h3 className="footer-title">Contact Us</h3>
            <ul className="footer-contact">
              <li>
                <span className="footer-contact-label">Address:</span>
                <span>Oriental Mindoro, Philippines</span>
              </li>
              <li>
                <span className="footer-contact-label">Phone:</span>
                <a href="tel:+639151931262">+63 915 193 1262</a>
              </li>
              <li>
                <span className="footer-contact-label">Email:</span>
                <a href="mailto:support@emoorm.com">support@emoorm.com</a>
              </li>
              <li>
                <span className="footer-contact-label">Hours:</span>
                <span>Mon-Sat, 8AM - 6PM PHT</span>
              </li>
            </ul>

            <div className="footer-payment">
              <h4 className="footer-subtitle">Payment Methods</h4>
              <div className="footer-payment-methods">
                {PAYMENT_OPTIONS.map((method) => (
                  <span key={method} className="footer-payment-badge">{method}</span>
                ))}
              </div>
            </div>

            <div className="footer-fulfillment">
              <h4 className="footer-subtitle">Fulfillment</h4>
              <div className="footer-fulfillment-methods">
                <span className="footer-fulfillment-badge">Home Delivery</span>
                <span className="footer-fulfillment-badge">Store Pickup</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <section className="footer-directory" aria-label="About Emoorm">
            <article className="footer-about">
              <h3 className="footer-about-title">Oriental Mindoro&apos;s Local Online Marketplace</h3>
              <p>
                Emoorm is an online marketplace that connects buyers with farmers, fishers, artisans, and
                food producers across Oriental Mindoro. Instead of travelling between towns or waiting for
                market day, you can browse fresh produce, dried goods, beverages, local delicacies, and
                handcrafted products from sellers across the province, all in one place. Anyone can create a
                buyer account and browse for free.
              </p>

              <h4>Shop Local, Direct from the Source</h4>
              <p>
                Every store on Emoorm is run by a local seller who manages their own listings, stock, orders,
                and fulfillment from the Seller Center. When you order, you deal directly with the seller, so
                your purchase supports the people who grow, catch, and make the products.
              </p>

              <h4>Reviewed Sellers and Approved Listings</h4>
              <p>
                Residents who want to sell submit a seller application that is reviewed by a municipal or
                platform administrator before their store goes live. New product listings are also checked
                before they appear to buyers, and administrators can suspend stores or listings that break the
                rules. If something looks wrong, you can report a product or seller from its page.
              </p>

              <h4>Payment Arranged with the Seller</h4>
              <p>
                Emoorm does not process or hold payments. Depending on what each seller accepts, you can pay by
                Cash on Delivery, GCash, QR Ph, or bank transfer. For online payments, the seller confirms your
                payment before preparing the order, and you can follow each step from My Orders.
              </p>

              <h4>Delivery or Store Pickup</h4>
              <p>
                Sellers choose whether they deliver, offer pickup, or both, and set the municipalities and
                barangays they deliver to. At checkout you pick the option that suits you, and you are notified
                as your order is confirmed, prepared, and ready for pickup or on its way.
              </p>

              <h4>Safer Checkout with Identity Verification</h4>
              <p>
                To protect sellers from fake orders, buyers verify their identity once before checking out by
                scanning a valid Philippine government ID, such as a PhilSys National ID, driver&apos;s license,
                UMID, or passport. The ID photo is only used to read your name and address and is not stored. If
                automatic verification does not work, your municipal admin can help.
              </p>

              <h4>Returns, Refunds, and Reviews</h4>
              <p>
                If an item arrives damaged, incorrect, incomplete, or not as described, you can request a return
                from your order within 7 days, unless the seller&apos;s return policy says otherwise. After your
                order is completed, you can rate the product and leave a review to help other buyers.
              </p>

              <h4>Talk Directly with Sellers and Support</h4>
              <p>
                Message a store to ask about a product, stock, or delivery before you buy, and keep the
                conversation going after you order. For account or verification concerns, the support chat
                connects you with the administrator of your municipality.
              </p>

              <h4>Made for Mindoreños</h4>
              <p>
                Browse Emoorm in English, Tagalog, or Bisaya, sign in with your email or Google account, find
                sellers near you on the store map, and search for products using a photo. Sellers can switch
                between their personal and seller accounts at any time.
              </p>
            </article>

            <div className="footer-directory-groups">
              <h3 className="footer-about-title">Shop, Places, and Guides</h3>

              {allCategories.length > 0 && (
                <div className="footer-directory-group">
                  <h4>Shop by Category</h4>
                  <LinkList items={allCategories.map((c) => ({ key: c.id, to: `/products?category=${c.id}`, label: c.name }))} />
                </div>
              )}

              <div className="footer-directory-group">
                <h4>Municipalities</h4>
                {municipalities.length > 0 ? (
                  <LinkList items={municipalities.map((m) => ({ key: m.id, to: `/municipality/${m.id}`, label: m.name }))} />
                ) : (
                  <p className="footer-directory-links">{MUNICIPALITY_NAMES}</p>
                )}
              </div>

              {stores.length > 0 && (
                <div className="footer-directory-group">
                  <h4>Local Stores</h4>
                  <LinkList
                    items={[
                      ...stores.map((store) => ({ key: store.id, to: `/store/${store.slug}`, label: store.name })),
                      { key: 'all-stores', to: '/stores', label: 'View all stores' },
                    ]}
                  />
                </div>
              )}

              <div className="footer-directory-group">
                <h4>Buyer Guides</h4>
                <LinkList items={BUYER_GUIDES} />
              </div>

              <div className="footer-directory-group">
                <h4>Seller Tools</h4>
                <LinkList items={SELLER_TOOLS} />
              </div>

              <div className="footer-directory-group">
                <h4>Payment Options</h4>
                <p className="footer-directory-links">{PAYMENT_OPTIONS.join(', ')}</p>
              </div>

              <div className="footer-directory-group">
                <h4>Fulfillment</h4>
                <p className="footer-directory-links">Home Delivery, Store Pickup</p>
              </div>

              <div className="footer-directory-group">
                <h4>Languages</h4>
                <p className="footer-directory-links">{LANGUAGE_NAMES.join(', ')}</p>
              </div>

              <div className="footer-directory-group">
                <h4>Company</h4>
                <LinkList items={COMPANY_LINKS} />
              </div>
            </div>
          </section>

          <hr className="footer-divider" />

          <div className="footer-copyright">
            <p className="footer-copyright-brand">
              <AppLogo className="footer-copyright-logo" alt="" />
              <span>&copy; {currentYear} Emoorm. All rights reserved.</span>
            </p>
            <div className="footer-legal">
              <Link to="/about">About</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/cookies">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
