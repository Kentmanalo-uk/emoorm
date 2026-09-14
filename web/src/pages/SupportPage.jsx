import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChatCircleDots, CheckCircle, Star } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import './SupportPage.css';

const PAGE_CONFIG = {
  care: {
    type: 'CUSTOMER_CARE',
    title: 'Customer Care',
    subtitle: 'Tell us what you need help with. Your request is saved for the Emoorm Support team to review.',
    icon: ChatCircleDots,
    categories: [
      ['ORDER', 'Order'], ['PAYMENT', 'Payment'], ['DELIVERY', 'Delivery'],
      ['RETURN', 'Return or refund'], ['ACCOUNT', 'Account'], ['SELLER', 'Seller'], ['OTHER', 'Other'],
    ],
    submit: 'Send support request',
  },
  feedback: {
    type: 'FEEDBACK',
    title: 'Feedback',
    subtitle: 'Share what is working well or what Emoorm can improve. Your feedback is stored for review.',
    icon: Star,
    categories: [
      ['APP_EXPERIENCE', 'App experience'], ['PRODUCTS', 'Products'], ['SELLERS', 'Sellers'],
      ['DELIVERY', 'Delivery'], ['FEATURE_REQUEST', 'Feature request'], ['OTHER', 'Other'],
    ],
    submit: 'Submit feedback',
  },
};

const STATUS_LABELS = { OPEN: 'Open', IN_REVIEW: 'In review', CLOSED: 'Closed' };

export default function SupportPage({ variant }) {
  const config = PAGE_CONFIG[variant];
  const Icon = config.icon;
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ category: config.categories[0][0], subject: '', message: '', rating: '' });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=/${variant === 'care' ? 'customer-care' : 'feedback'}`, { replace: true });
      return;
    }
    let active = true;
    axios.get('/support/my', { params: { type: config.type, pageSize: 10 } })
      .then((response) => active && setTickets(response.data || []))
      .catch((error) => active && toast.error(error.message || 'Unable to load your requests'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [config.type, isAuthenticated, navigate, variant]);

  const submit = async (event) => {
    event.preventDefault();
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3 || message.length < 10) {
      toast.error('Add a subject and at least 10 characters of detail.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await axios.post('/support', {
        type: config.type,
        category: form.category,
        subject,
        message,
        rating: variant === 'feedback' && form.rating ? Number(form.rating) : undefined,
      });
      setTickets((current) => [response.data, ...current]);
      setForm({ category: config.categories[0][0], subject: '', message: '', rating: '' });
      toast.success(variant === 'care' ? 'Support request sent' : 'Feedback submitted');
    } catch (error) {
      toast.error(error.message || 'Unable to submit your request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <Layout>
      <main className="support-page">
        <div className="support-container">
          <nav className="support-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>{config.title}</span></nav>
          <section className="support-intro">
            <span className="support-icon"><Icon size={28} weight="fill" /></span>
            <div><h1>{config.title}</h1><p>{config.subtitle}</p></div>
          </section>

          <div className="support-layout">
            <section className="support-card">
              <h2>{variant === 'care' ? 'How can we help?' : 'Tell us what you think'}</h2>
              <form className="support-form" onSubmit={submit}>
                <label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{config.categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Subject<input value={form.subject} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder={variant === 'care' ? 'What do you need help with?' : 'What would you like to share?'} /></label>
                {variant === 'feedback' && <label>Overall experience<select value={form.rating} onChange={(event) => setForm((current) => ({ ...current, rating: event.target.value }))}><option value="">Optional rating</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} out of 5</option>)}</select></label>}
                <label>Details<textarea value={form.message} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Include enough detail for the team to help." rows={6} /></label>
                <div className="support-form-footer"><span>{form.message.length}/2000</span><button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : config.submit}</button></div>
              </form>
            </section>

            <aside className="support-history support-card">
              <h2>Your recent {variant === 'care' ? 'requests' : 'feedback'}</h2>
              {loading ? <p className="support-muted">Loading...</p> : tickets.length === 0 ? <p className="support-muted">Nothing submitted yet.</p> : <div className="support-ticket-list">{tickets.map((ticket) => <article key={ticket.id} className="support-ticket"><div><strong>{ticket.subject}</strong><span>{ticket.category.replaceAll('_', ' ').toLowerCase()}</span></div><span className={`support-ticket-status is-${ticket.status.toLowerCase()}`}>{STATUS_LABELS[ticket.status] || ticket.status}</span></article>)}</div>}
              {variant === 'care' && <Link className="support-help-link" to="/help">Browse Help Centre</Link>}
            </aside>
          </div>
        </div>
      </main>
    </Layout>
  );
}