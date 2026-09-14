import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../../lib/axios';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    axios.get('/categories')
      .then((res) => { if (!cancelled) setCategories((res.data || []).slice(0, 8)); })
      .catch(() => { /* footer categories are optional */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <footer className="footer">
      <div className="container">
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
                <span className="footer-payment-badge">GCash</span>
                <span className="footer-payment-badge">Cash on Delivery</span>
                <span className="footer-payment-badge">Maya</span>
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
          <div className="footer-info">
            <h3 className="footer-info-title">Buy & Sell on Emoorm</h3>
            <p className="footer-info-text">
              Emoorm connects buyers with farmers, fishers, artisans, and food producers across Oriental Mindoro.
              Browse fresh produce, local delicacies, seafood, and handcrafted goods in one place.
            </p>
          </div>

          <div className="footer-info">
            <h3 className="footer-info-title">Discover Authentic Products from Every Corner of Oriental Mindoro</h3>
            <p className="footer-info-text">
              Shop local across all fifteen municipalities of Oriental Mindoro: Baco, Bansud, Bongabong, Bulalacao, Calapan City, Gloria, Mansalay, Naujan, Pinamalayan, Pola, Puerto Galera, Roxas, San Teodoro, Socorro, and Victoria.
            </p>
          </div>

          <div className="footer-categories">
            <h3 className="footer-categories-title">Fresh Produce</h3>
            <p className="footer-categories-text">
              Vegetables • Fruits • Meat & Poultry • Seafood • Rice & Grains
            </p>
          </div>

          <div className="footer-categories">
            <h3 className="footer-categories-title">Food & Snacks</h3>
            <p className="footer-categories-text">
              Delicacies • Snacks • Beverages • Condiments • Dried Fish
            </p>
          </div>

          <div className="footer-categories">
            <h3 className="footer-categories-title">Lifestyle & Crafts</h3>
            <p className="footer-categories-text">
              Handicrafts • Wellness • Natural Products • Woven Items • Bamboo Crafts
            </p>
          </div>

          <div className="footer-categories">
            <h3 className="footer-categories-title">Municipalities</h3>
            <p className="footer-categories-text">
              Calapan City • Puerto Galera • Naujan • Pinamalayan • Bansud • Bongabong • Bulalacao • Gloria • Mansalay • Pola • Roxas • San Teodoro • Socorro • Victoria
            </p>
          </div>

          <hr className="footer-divider" />

          <div className="footer-copyright">
            <p>&copy; {currentYear} Emoorm. All rights reserved.</p>
            <div className="footer-legal">
              <Link to="/privacy">Privacy Policy</Link>
              <span>•</span>
              <Link to="/terms">Terms of Service</Link>
              <span>•</span>
              <Link to="/cookies">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
