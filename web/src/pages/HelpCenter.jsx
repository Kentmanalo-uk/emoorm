import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useSeo from '../lib/seo';
import { Lifebuoy, PaperPlaneRight, CircleNotch } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import { SUPPORT_CATEGORIES, SUBJECT_MAX, MESSAGE_MAX } from '../lib/supportCategories';
import useAuthStore from '../store/authStore';
import './Profile.css';
import './HelpCenter.css';

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

/**
 * Start a support case. Every "contact us" entry point on the buyer side now
 * lands here, so the form has to carry what Customer Care and Feedback used to
 * collect separately — the concern type does that.
 */
function GetHelpPanel() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({ category: 'ORDER', subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3) {
      toast.error('Give your case a short subject (at least 3 characters).');
      return;
    }
    if (!message) {
      toast.error('Tell us what you need help with.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post('/support/cases', { category: form.category, subject, message });
      toast.success('Your case was sent to your municipal support team.');
      setForm({ category: 'ORDER', subject: '', message: '' });
      navigate(res.data?.id ? `/profile/support?c=${res.data.id}` : '/profile/support');
    } catch (err) {
      toast.error(err.message || 'Could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="hc-panel" id="get-help">
      <div className="hc-panel-head">
        <span className="hc-panel-icon"><Lifebuoy size={22} weight="fill" /></span>
        <div>
          <h2 className="hc-panel-title">Get help</h2>
          <p className="hc-panel-sub">
            Orders, payments, an account problem or an idea for Emoorm — pick what it is about and
            your municipal admin replies in a thread you can follow.
          </p>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="hc-signin">
          <p>Sign in to start a case. Your answers and their replies are kept together in My Support Cases.</p>
          <Link to="/login?redirect=/help" className="hc-submit">Sign in to get help</Link>
        </div>
      ) : (
        <form className="hc-form" onSubmit={submit}>
          <label className="hc-field">
            <span>What is it about?</span>
            <select value={form.category} onChange={set('category')}>
              {SUPPORT_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="hc-field">
            <span>Subject</span>
            <input
              value={form.subject}
              onChange={set('subject')}
              maxLength={SUBJECT_MAX}
              placeholder="e.g. My order has not arrived"
            />
          </label>

          <label className="hc-field hc-field-wide">
            <span>Tell us more</span>
            <textarea
              value={form.message}
              onChange={set('message')}
              maxLength={MESSAGE_MAX}
              rows={5}
              placeholder="Include order numbers, store names or anything else that helps us sort this out."
            />
          </label>

          <div className="hc-form-foot">
            <small>{form.message.length}/{MESSAGE_MAX}</small>
            <div className="hc-form-actions">
              <Link to="/profile/support" className="hc-secondary">My support cases</Link>
              <button type="submit" className="hc-submit" disabled={submitting}>
                {submitting
                  ? <CircleNotch size={15} className="hc-spin" />
                  : <PaperPlaneRight size={15} weight="fill" />}
                {submitting ? 'Sending…' : 'Start a case'}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

const HelpCenter = () => {
  useSeo({
    title: 'Help & Support',
    description: 'Answers about buying, payments, delivery and returns on E-MOORM, '
      + 'plus a direct line to your municipal support team.',
    path: '/help',
  });

  const [searchParams] = useSearchParams();
  const guide = topicGuides[searchParams.get('topic')];

  return (
    <Layout>
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="profile-page-wrap">
          <header className="profile-page-header">
            <h1 className="profile-page-title">Help &amp; Support</h1>
            <p className="profile-page-subtitle">
              Answers to the usual questions, and a way to reach a real person when you need one.
            </p>
          </header>

          {guide && (
            <section className="help-topic-card">
              <h2 className="help-topic-title">{guide.title}</h2>
              <p className="profile-page-subtitle">{guide.text}</p>
              <a href="#get-help" className="help-topic-link">Need more help? Start a support case</a>
            </section>
          )}

          <GetHelpPanel />

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
