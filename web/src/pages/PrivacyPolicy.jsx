import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import './Legal.css';

const PrivacyPolicy = () => (
  <Layout>
    <div className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: August 2026</p>

      <p>
        This Privacy Policy explains what information Emoorm collects when you use our website
        and mobile app, and how that information is used. It applies to buyers, sellers, and
        administrators on the platform.
      </p>

      <h2>Information we collect</h2>
      <p>When you create an account, we collect:</p>
      <ul>
        <li>Your name, email address, and password (stored in encrypted/hashed form).</li>
        <li>Your contact number, municipality, barangay, and address, where you provide them.</li>
        <li>A profile photo, if you choose to upload one.</li>
      </ul>
      <p>If you apply to sell on Emoorm, we additionally collect:</p>
      <ul>
        <li>Your shop name, shop description, and shop address.</li>
        <li>
          A government-issued ID (front and back) and a selfie photo, used only to verify seller
          applications.
        </li>
      </ul>
      <p>When you use the platform, we also store:</p>
      <ul>
        <li>Products you list, order, review, message about, or add to your cart/wishlist.</li>
        <li>Order details such as items purchased, delivery/pickup address, and order status.</li>
        <li>Messages you send through the in-app messaging feature between buyers and sellers.</li>
      </ul>

      <h2>What we do not collect</h2>
      <p>
        Emoorm does not process or store payment card details. Payments (Cash on Delivery, GCash,
        or a seller's own QR e-wallet) are made directly between the buyer and the seller, outside
        of the platform. We do not collect precise GPS location — only the municipality, barangay,
        and address text you provide.
      </p>

      <h2>How we use your information</h2>
      <ul>
        <li>To create and manage your account and let you sign in.</li>
        <li>To let you browse, order, sell, message, and review products and stores.</li>
        <li>To review and approve seller applications and product listings.</li>
        <li>To send account-related emails, such as password reset links and order updates.</li>
        <li>To investigate reports of abuse, fraud, or policy violations.</li>
      </ul>

      <h2>Sharing your information</h2>
      <p>
        Your name and, where relevant, contact number and delivery address are shared with the
        seller (or buyer) of an order so that it can be fulfilled. Your seller verification
        documents (ID and selfie) are only visible to municipal and platform administrators
        reviewing your application. We do not sell your personal information to third parties.
      </p>
      <p>
        If you choose to sign in with Google, Google will share your basic account information
        (name and email) with Emoorm, in line with Google's own privacy practices.
      </p>

      <h2>Data retention and your choices</h2>
      <p>
        We keep your account information for as long as your account is active. You can update
        your profile information at any time from your account settings. To request deletion of
        your account or data, contact us using the details below.
      </p>

      <h2>Security</h2>
      <p>
        We take reasonable technical measures to protect your information, including password
        hashing and access controls on administrator accounts. No online service can guarantee
        perfect security, so please use a strong, unique password for your account.
      </p>

      <h2>Philippine Data Privacy Act</h2>
      <p>
        We aim to handle personal information in a manner consistent with the Data Privacy Act of
        2012 (Republic Act No. 10173) of the Philippines. This policy may be updated from time to
        time as our services evolve.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this policy or your data can be sent to{' '}
        <a href="mailto:support@emoorm.com">support@emoorm.com</a>, or visit our{' '}
        <Link to="/help">Help Centre</Link>.
      </p>
    </div>
  </Layout>
);

export default PrivacyPolicy;
