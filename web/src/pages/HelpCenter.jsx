import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';

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
    <div className="help-page container" style={{ padding: '32px 0' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Help Center</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Find answers to common questions about buying, selling, and using Emoorm.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {topics.map((t) => (
          <div
            key={t.title}
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              padding: 16,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>
              {t.title}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {t.items.map((item) => (
                <li key={item.label} style={{ padding: '4px 0' }}>
                  <Link
                    to={item.to}
                    style={{ fontSize: 13, color: '#0369a1', textDecoration: 'none' }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </Layout>
);

export default HelpCenter;
