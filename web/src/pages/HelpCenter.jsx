import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import './Profile.css';

const topics = [
  {
    title: 'Orders & Delivery',
    items: [
      { label: 'Tracking an order', to: '/profile/orders' },
      { label: 'Cancelling an order', to: '/profile/orders' },
      { label: 'Pickup locations', to: '/' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { label: 'Accepted payment methods', to: '/' },
      { label: 'Refund status', to: '/profile/orders' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Update your profile', to: '/profile/settings' },
      { label: 'Reset your password', to: '/forgot-password' },
      { label: 'Manage addresses', to: '/profile/addresses' },
    ],
  },
  {
    title: 'Selling on Emoorm',
    items: [
      { label: 'Apply as a seller', to: '/seller/apply' },
      { label: 'Seller dashboard', to: '/seller' },
    ],
  },
];

const topicGuides = {
  buying: {
    title: 'How to Buy',
    text: 'Browse products, choose a seller, add items to your cart, and complete checkout with your delivery or pickup details.',
  },
  returns: {
    title: 'Returns & Refunds',
    text: 'Open My Orders after delivery or pickup to request a return for eligible items. The seller reviews your request and records any refund in the return timeline.',
  },
  delivery: {
    title: 'Shipping & Delivery',
    text: 'Each seller sets their delivery coverage and pickup location. Checkout shows available fulfillment options for the store you selected.',
  },
  payments: {
    title: 'Payment Methods',
    text: 'Sellers may offer Cash on Delivery, GCash, or QR Ph. For prepaid checkout, enter the reference number and upload the payment proof requested by the seller.',
  },
};

const HelpCenter = () => {
  const [searchParams] = useSearchParams();
  const guide = topicGuides[searchParams.get('topic')];

  return (
    <Layout>
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="profile-page-wrap">
          <header className="profile-page-header">
            <h1 className="profile-page-title">Help Center</h1>
          </header>

          {guide && (
            <section className="help-topic-card">
              <h2 className="help-topic-title">{guide.title}</h2>
              <p className="profile-page-subtitle">{guide.text}</p>
              <Link to="/customer-care" className="help-topic-link">Need more help? Contact Support</Link>
            </section>
          )}

          <div className="help-topics">
            {topics.map((t) => (
              <div key={t.title} className="help-topic-card">
                <h3 className="help-topic-title">{t.title}</h3>
                <ul className="help-topic-list">
                  {t.items.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="help-topic-link">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HelpCenter;

