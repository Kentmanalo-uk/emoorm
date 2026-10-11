import { Link } from 'react-router-dom';
import useSeo from '../lib/seo';
import {
  Storefront, ShieldCheck, Truck, IdentificationCard, ChatsCircle, ArrowCounterClockwise,
  MapPin, Translate, GraduationCap, Lifebuoy, ArrowRight,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import AppLogo from '../components/AppLogo';
import './About.css';

/*
 * About Emoorm, the app's cleaner layout (mobile app/about.js): a soft
 * pink-to-mint hero with three quick facts, the mission in one card, a
 * numbered "How it works" timeline, one list of what you can do (each with
 * its own gradient icon), the towns as chips, the team as compact rows and a
 * brand-gradient help card. On phones the site footer closes this page (it
 * is off Home there; Footer.jsx).
 *
 * Class names start with "ab-" so the phone layer's flattening of
 * ".about-hero", ".about-feature"… (styles/phone-app.css) leaves these cards
 * alone.
 */

const MUNICIPALITIES = [
  'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan',
  'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria',
];

const FACTS = [
  { value: '15', label: 'towns served' },
  { value: 'Local', label: 'sellers only' },
  { value: '3', label: 'ways to pay' },
];

const FEATURES = [
  {
    icon: Storefront,
    colors: ['#6ee7b7', '#047857'],
    title: 'Local stores, direct from the source',
    text: 'Every store is run by a local seller who manages their own listings, stock, orders and fulfillment from the Seller Center.',
  },
  {
    icon: ShieldCheck,
    colors: ['#93c5fd', '#2563eb'],
    title: 'Reviewed sellers and listings',
    text: 'Seller applications and new products are checked by a municipal or platform administrator before they appear to buyers.',
  },
  {
    icon: Truck,
    colors: ['#fcd34d', '#ea580c'],
    title: 'Delivery or store pickup',
    text: 'Sellers choose whether they deliver, offer pickup, or both, and set the municipalities and barangays they deliver to.',
  },
  {
    icon: IdentificationCard,
    colors: ['#c4b5fd', '#7c3aed'],
    title: 'Identity verification',
    text: 'Buyers verify once with a valid Philippine government ID before checking out. The ID photo is only read, never stored.',
  },
  {
    icon: ChatsCircle,
    colors: ['#f9a8d4', '#db2777'],
    title: 'Messaging and support',
    text: 'Chat with stores about products and orders, and reach your municipal administrator through the support chat.',
  },
  {
    icon: ArrowCounterClockwise,
    colors: ['#5eead4', '#0f766e'],
    title: 'Returns and reviews',
    text: 'Request a return for damaged, wrong or incomplete items, and rate products after your order is completed.',
  },
  {
    icon: MapPin,
    colors: ['#fca5a5', '#dc2626'],
    title: 'Store map and image search',
    text: 'Find sellers near you on the store map, or search for a product using a photo.',
  },
  {
    icon: Translate,
    colors: ['#7dd3fc', '#0284c7'],
    title: 'English, Tagalog and Bisaya',
    text: 'Browse the marketplace in the language you are most comfortable with.',
  },
];

const STEPS = [
  { title: 'Create an account', text: 'Sign up with your email or Google account. Browsing is free.' },
  { title: 'Find local products', text: 'Search, filter by category, or explore a municipality.' },
  { title: 'Order from the seller', text: 'Pick delivery or pickup and a payment method the seller accepts.' },
  { title: 'Track and receive', text: 'Get notified as your order is confirmed, prepared and completed.' },
];

const DEVELOPERS = [
  { name: 'Mike Fernandez', role: 'Developer' },
  { name: 'Kent Manalo', role: 'Developer' },
  { name: 'John Paul Quisto', role: 'Developer' },
];

const initials = (name) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');

/** Each feature icon's gradient, once on the page, for the icons to point at. */
function FeatureGradients() {
  return (
    <svg className="ab-gradients" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {FEATURES.map(({ title, colors: [from, to] }, index) => (
          <linearGradient key={title} id={`ab-grad-${index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

const About = () => {
  useSeo({
    title: 'About E-MOORM',
    description: 'E-MOORM is a hyperlocal marketplace connecting buyers and sellers '
      + 'across Oriental Mindoro, Philippines.',
    path: '/about',
  });

  return (
    <Layout>
      <div className="ab">
        <FeatureGradients />

        {/* Hero: the soft pink-to-mint wash, the mark on a white tile, three quick facts. */}
        <section className="ab-hero">
          <div className="ab-hero-inner">
            <span className="ab-logo-tile"><AppLogo className="ab-logo" alt="" /></span>
            <p className="ab-eyebrow">About Emoorm</p>
            <h1 className="ab-title" data-bar-title="About Emoorm">Oriental Mindoro&apos;s local online marketplace</h1>
            <p className="ab-lead">
              Emoorm connects buyers with farmers, fishers, artisans and food producers across Oriental Mindoro,
              so fresh produce, local delicacies and handcrafted goods from every town are only a few taps away.
            </p>
            <ul className="ab-facts" aria-label="Emoorm at a glance">
              {FACTS.map((fact) => (
                <li key={fact.label} className="ab-fact">
                  <strong>{fact.value}</strong>
                  <span>{fact.label}</span>
                </li>
              ))}
            </ul>
            <div className="ab-actions">
              <Link to="/products" className="ab-pill ab-pill--primary">Browse products</Link>
              <Link to="/sell" className="ab-pill">Sell on Emoorm</Link>
            </div>
          </div>
        </section>

        <div className="ab-body">
          <div className="ab-pair">
            <section className="ab-section">
              <h2 className="ab-h2">Our mission</h2>
              <div className="ab-card ab-mission">
                <p>
                  Many local producers in Oriental Mindoro depend on market days, word of mouth and long trips between
                  towns to reach buyers. Emoorm gives them an online store they manage themselves, and gives buyers one
                  place to discover and order products made and grown in the province.
                </p>
                <p>
                  Sellers list and manage their own products, and buyers arrange payment and delivery directly with the
                  seller of their choice. Emoorm does not process or hold payments; depending on the seller, buyers can
                  pay by Cash on Delivery, GCash or QR Ph.
                </p>
              </div>
            </section>

            {/* How it works: a numbered timeline. */}
            <section className="ab-section" id="how-it-works">
              <h2 className="ab-h2">How it works</h2>
              <ol className="ab-card ab-steps">
                {STEPS.map(({ title, text }, index) => (
                  <li key={title} className="ab-step">
                    <span className="ab-step-dot" aria-hidden="true">{index + 1}</span>
                    <div className="ab-step-body">
                      <strong className="ab-item-title">{title}</strong>
                      <span className="ab-item-text">{text}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="ab-note">
                Residents who want to sell can <Link to="/seller/apply">apply as a seller</Link>. Applications are reviewed
                by a municipal or platform administrator before the store goes live.
              </p>
            </section>
          </div>

          {/* What you can do: one list, a gradient icon each. */}
          <section className="ab-section">
            <h2 className="ab-h2">What you can do on Emoorm</h2>
            <ul className="ab-card ab-list ab-features">
              {FEATURES.map(({ icon: Icon, colors, title, text }, index) => (
                <li key={title} className="ab-row">
                  <span className="ab-feature-icon" style={{ background: `${colors[0]}33` }} aria-hidden="true">
                    <Icon size={22} weight="fill" style={{ fill: `url(#ab-grad-${index})` }} />
                  </span>
                  <div className="ab-row-body">
                    <h3 className="ab-item-title">{title}</h3>
                    <p className="ab-item-text">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="ab-section">
            <h2 className="ab-h2">Coverage</h2>
            <p className="ab-sub">Emoorm serves all fifteen municipalities of Oriental Mindoro.</p>
            <ul className="ab-towns">
              {MUNICIPALITIES.map((name) => <li key={name} className="ab-town">{name}</li>)}
            </ul>
          </section>

          <section className="ab-section">
            <h2 className="ab-h2">The team behind Emoorm</h2>
            <p className="ab-sub">
              Emoorm was developed by 4th-year Bachelor of Science in Information Technology students of
              Mindoro State University.
            </p>
            <ul className="ab-card ab-list ab-team">
              {DEVELOPERS.map((dev) => (
                <li key={dev.name} className="ab-row ab-person">
                  <span className="ab-avatar" aria-hidden="true">{initials(dev.name)}</span>
                  <div className="ab-row-body">
                    <strong className="ab-item-title">{dev.name}</strong>
                    <span className="ab-item-text">{dev.role} · BSIT 4th Year · Mindoro State University</span>
                  </div>
                </li>
              ))}
              <li className="ab-row ab-person ab-adviser">
                <span className="ab-avatar ab-avatar--adviser" aria-hidden="true">
                  <GraduationCap size={22} weight="fill" />
                </span>
                <div className="ab-row-body">
                  <span className="ab-eyebrow ab-eyebrow--row">Project Adviser</span>
                  <strong className="ab-item-title">Christian Cabrera</strong>
                  <span className="ab-item-text">Professor · Master&apos;s degree holder · Mindoro State University</span>
                  <span className="ab-item-text ab-adviser-note">The team developed Emoorm under the guidance and advice of Prof. Cabrera.</span>
                </div>
              </li>
            </ul>
          </section>

          {/* Help: the brand's pink-to-green card. */}
          <section className="ab-cta">
            <span className="ab-cta-icon" aria-hidden="true"><Lifebuoy size={22} weight="fill" /></span>
            <h2 className="ab-cta-title">Questions or feedback?</h2>
            <p className="ab-cta-text">Browse the answers in Help &amp; Support, or start a case and tell us what you need. We would love to hear from you.</p>
            <Link to="/help" className="ab-cta-btn">
              Help &amp; Support <ArrowRight size={16} weight="bold" />
            </Link>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default About;
