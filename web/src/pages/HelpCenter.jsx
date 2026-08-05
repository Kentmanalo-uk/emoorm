import React from 'react';
import { Link } from 'react-router-dom';
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

const HelpCenter = () => (
  <Layout>
    <div className="container" style={{ padding: '32px 0' }}>
      <div className="profile-page-wrap">
        <header className="profile-page-header">
          <h1 className="profile-page-title">Help Center</h1>
        </header>

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

export default HelpCenter;

