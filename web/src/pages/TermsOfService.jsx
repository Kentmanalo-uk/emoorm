import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import './Legal.css';

const TermsOfService = () => (
  <Layout>
    <div className="legal-page">
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: August 2026</p>

      <p>
        These Terms govern your use of the Emoorm website and mobile app (the "Platform"). By
        creating an account or using the Platform, you agree to these Terms.
      </p>

      <h2>What Emoorm is</h2>
      <p>
        Emoorm is a marketplace that lets independent sellers in Oriental Mindoro list products,
        and lets buyers browse and place orders with those sellers. Emoorm is not the seller of
        the products listed on the Platform, and does not manufacture, inspect, or take
        possession of sellers' goods.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>You must provide accurate information when registering and keep it up to date.</li>
        <li>You are responsible for keeping your password and account access secure.</li>
        <li>You must be able to enter into a binding contract to use the Platform.</li>
        <li>
          Selling on Emoorm requires an approved seller application, reviewed by a municipal or
          platform administrator.
        </li>
      </ul>

      <h2>Orders and payment</h2>
      <p>
        Emoorm does not process, hold, or guarantee payments. When you place an order, payment
        (Cash on Delivery, GCash, or a seller's own QR e-wallet, depending on what that seller
        accepts) is made directly between you and the seller. Emoorm is not a party to that
        payment and is not responsible for payment disputes, refunds, or chargebacks — these are
        arranged directly between buyer and seller.
      </p>
      <p>
        Sellers are responsible for the accuracy of their own product listings (description,
        price, stock, and images) and for fulfilling orders they accept.
      </p>

      <h2>Seller responsibilities</h2>
      <ul>
        <li>List only products you are authorized to sell and accurately describe them.</li>
        <li>Keep stock levels and order statuses up to date.</li>
        <li>Comply with applicable Philippine consumer protection and food safety laws.</li>
        <li>Respond to buyer messages and orders in good faith.</li>
      </ul>

      <h2>Prohibited conduct</h2>
      <ul>
        <li>Listing illegal, counterfeit, or prohibited items.</li>
        <li>Posting false, misleading, or fraudulent listings or reviews.</li>
        <li>Harassing, threatening, or abusing other users.</li>
        <li>Attempting to bypass, disrupt, or gain unauthorized access to the Platform.</li>
      </ul>

      <h2>Content and reviews</h2>
      <p>
        You retain ownership of the text, images, and reviews you submit, but you grant Emoorm a
        license to display that content on the Platform so other users can see it. You are
        responsible for content you submit and for having the rights to any images you upload.
      </p>

      <h2>Moderation and suspension</h2>
      <p>
        Administrators may review, hide, or remove listings, reviews, or accounts that violate
        these Terms or applicable law, and may suspend a store or account pending review of a
        report.
      </p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>
        The Platform is provided "as is." Emoorm does not guarantee that products listed by
        sellers will be available, accurately described, or delivered on time, and is not liable
        for losses arising from transactions between buyers and sellers. To the extent permitted
        by law, Emoorm's liability for any claim relating to the Platform is limited to helping
        facilitate communication between the parties involved.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms as the Platform evolves. Continued use of the Platform after an
        update means you accept the revised Terms.
      </p>

      <h2>Governing law</h2>
      <p>These Terms are governed by the laws of the Republic of the Philippines.</p>

      <h2>Contact us</h2>
      <p>
        Questions about these Terms can be sent to{' '}
        <a href="mailto:support@emoorm.com">support@emoorm.com</a>, or visit our{' '}
        <Link to="/help">Help Centre</Link>.
      </p>
    </div>
  </Layout>
);

export default TermsOfService;
