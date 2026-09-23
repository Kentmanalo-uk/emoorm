import { Link } from 'react-router-dom';
import useSeo from '../lib/seo';
import {
  Storefront, ShieldCheck, Truck, IdentificationCard, ChatsCircle, ArrowCounterClockwise,
  MapPin, Translate, UserPlus, MagnifyingGlass, ShoppingCart, Package, GraduationCap, Code,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import AppLogo from '../components/AppLogo';
import './About.css';

const MUNICIPALITIES = [
  'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan',
  'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria',
];

const FEATURES = [
  {
    icon: Storefront,
    title: 'Local stores, direct from the source',
    text: 'Every store is run by a local seller who manages their own listings, stock, orders and fulfillment from the Seller Center.',
  },
  {
    icon: ShieldCheck,
    title: 'Reviewed sellers and listings',
    text: 'Seller applications and new products are checked by a municipal or platform administrator before they appear to buyers.',
  },
  {
    icon: Truck,
    title: 'Delivery or store pickup',
    text: 'Sellers choose whether they deliver, offer pickup, or both, and set the municipalities and barangays they deliver to.',
  },
  {
    icon: IdentificationCard,
    title: 'Identity verification',
    text: 'Buyers verify once with a valid Philippine government ID before checking out. The ID photo is only read, never stored.',
  },
  {
    icon: ChatsCircle,
    title: 'Messaging and support',
    text: 'Chat with stores about products and orders, and reach your municipal administrator through the support chat.',
  },
  {
    icon: ArrowCounterClockwise,
    title: 'Returns and reviews',
    text: 'Request a return for damaged, wrong or incomplete items, and rate products after your order is completed.',
  },
  {
    icon: MapPin,
    title: 'Store map and image search',
    text: 'Find sellers near you on the store map, or search for a product using a photo.',
  },
  {
    icon: Translate,
    title: 'English, Tagalog and Bisaya',
    text: 'Browse the marketplace in the language you are most comfortable with.',
  },
];

const STEPS = [
  { icon: UserPlus, title: 'Create an account', text: 'Sign up with your email or Google account. Browsing is free.' },
  { icon: MagnifyingGlass, title: 'Find local products', text: 'Search, filter by category, or explore a municipality.' },
  { icon: ShoppingCart, title: 'Order from the seller', text: 'Pick delivery or pickup and a payment method the seller accepts.' },
  { icon: Package, title: 'Track and receive', text: 'Get notified as your order is confirmed, prepared and completed.' },
];

const DEVELOPERS = [
  { name: 'Mike Fernandez', role: 'Developer' },
  { name: 'Kent Manalo', role: 'Developer' },
  { name: 'John Paul Quisto', role: 'Developer' },
];

const initials = (name) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');

const About = () => {
  useSeo({
    title: 'About E-MOORM',
    description: 'E-MOORM is a hyperlocal marketplace connecting buyers and sellers '
      + 'across Oriental Mindoro, Philippines.',
    path: '/about',
  });

  return (
  <Layout>
    <div className="about-page">
      <section className="about-hero">
        <AppLogo className="about-hero-logo" alt="" />
        <p className="about-eyebrow">About Emoorm</p>
        <h1>Oriental Mindoro&apos;s local online marketplace</h1>
        <p className="about-lead">
          Emoorm connects buyers with farmers, fishers, artisans and food producers across Oriental Mindoro,
          so fresh produce, local delicacies and handcrafted goods from every town are only a few taps away.
        </p>
        <div className="about-hero-actions">
          <Link to="/products" className="about-btn about-btn-primary">Browse products</Link>
          <Link to="/sell" className="about-btn">Sell on Emoorm</Link>
        </div>
      </section>

      <section className="about-section">
        <h2>Our mission</h2>
        <div className="about-mission">
          <p>
            Many local producers in Oriental Mindoro depend on market days, word of mouth and long trips between
            towns to reach buyers. Emoorm gives them an online store they manage themselves, and gives buyers one
            place to discover and order products made and grown in the province.
          </p>
          <p>
            Sellers list and manage their own products, and buyers arrange payment and delivery directly with the
            seller of their choice. Emoorm does not process or hold payments; depending on the seller, buyers can
            pay by Cash on Delivery, GCash, QR Ph or bank transfer.
          </p>
        </div>
      </section>

      <section className="about-section" id="how-it-works">
        <h2>How it works</h2>
        <ol className="about-steps">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title}>
              <span className="about-step-num">{index + 1}</span>
              <Icon size={28} weight="fill" className="about-step-icon" />
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <p className="about-note">
          Residents who want to sell can <Link to="/seller/apply">apply as a seller</Link>. Applications are reviewed
          by a municipal or platform administrator before the store goes live.
        </p>
      </section>

      <section className="about-section">
        <h2>What you can do on Emoorm</h2>
        <div className="about-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="about-feature">
              <Icon size={26} weight="fill" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h2>Coverage</h2>
        <p className="about-muted">Emoorm serves all fifteen municipalities of Oriental Mindoro.</p>
        <ul className="about-towns">
          {MUNICIPALITIES.map((name) => <li key={name}>{name}</li>)}
        </ul>
      </section>

      <section className="about-section">
        <h2>The team behind Emoorm</h2>
        <p className="about-muted">
          Emoorm was developed by 4th-year Bachelor of Science in Information Technology students of
          Mindoro State University.
        </p>

        <div className="about-team">
          {DEVELOPERS.map((dev) => (
            <article key={dev.name} className="about-person">
              <span className="about-avatar">{initials(dev.name)}</span>
              <strong>{dev.name}</strong>
              <span className="about-person-role"><Code size={14} weight="bold" /> {dev.role}</span>
              <span className="about-person-meta">BSIT 4th Year · Mindoro State University</span>
            </article>
          ))}
        </div>

        <article className="about-adviser">
          <span className="about-avatar about-avatar--adviser">
            <GraduationCap size={30} weight="fill" />
          </span>
          <div>
            <p className="about-eyebrow">Project Adviser</p>
            <strong>Christian Cabrera</strong>
            <span>Professor · Master&apos;s degree holder · Mindoro State University</span>
            <p>The team developed Emoorm under the guidance and advice of Prof. Cabrera.</p>
          </div>
        </article>
      </section>

      <section className="about-cta">
        <h2>Questions or feedback?</h2>
        <p>Browse the answers in Help &amp; Support, or start a case and tell us what you need. We would love to hear from you.</p>
        <div className="about-hero-actions">
          <Link to="/help" className="about-btn about-btn-primary">Help &amp; Support</Link>
        </div>
      </section>
      </div>
    </Layout>
  );
};

export default About;
