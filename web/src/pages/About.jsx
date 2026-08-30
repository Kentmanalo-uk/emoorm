import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import './Legal.css';

const About = () => (
  <Layout>
    <div className="legal-page">
      <h1>About Emoorm</h1>
      <p className="legal-updated">Oriental Mindoro's local online marketplace</p>

      <p>
        Emoorm is an online marketplace that connects buyers with local farmers, fishers,
        artisans, and food producers across Oriental Mindoro, Philippines. Sellers list and
        manage their own products, and buyers browse, order, and arrange payment and delivery
        directly with the seller of their choice.
      </p>

      <h2>How it works</h2>
      <p>
        Anyone can register as a buyer and browse products for free. Residents who want to sell
        can <Link to="/seller/apply">apply as a seller</Link>; applications are reviewed by a
        municipal or platform administrator before a store goes live. Once approved, a seller
        manages their own store profile, product listings, orders, and fulfillment settings
        (delivery or pickup) from their Seller Center.
      </p>
      <p>
        Emoorm does not process or hold payments on behalf of buyers or sellers. Payment method
        (such as Cash on Delivery, GCash, or a QR-based e-wallet) is arranged directly between the
        buyer and the seller, based on what each individual seller accepts.
      </p>

      <h2>Coverage</h2>
      <p>
        Emoorm currently serves the fifteen municipalities of Oriental Mindoro: Baco, Bansud,
        Bongabong, Bulalacao, Calapan City, Gloria, Mansalay, Naujan, Pinamalayan, Pola, Puerto
        Galera, Roxas, San Teodoro, Socorro, and Victoria.
      </p>

      <h2>Questions</h2>
      <p>
        For help with an order, account, or seller application, visit our{' '}
        <Link to="/help">Help Centre</Link>.
      </p>
    </div>
  </Layout>
);

export default About;
