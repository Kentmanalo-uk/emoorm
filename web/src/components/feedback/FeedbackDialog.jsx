import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Star, PaperPlaneTilt } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import './FeedbackDialog.css';

/**
 * Feedback about E-MOORM itself, addressed to the people who run it.
 *
 * Deliberately not a support case: a case is a conversation with the municipal
 * admin that someone is waiting on an answer to. This is a one-way note, so it
 * is a dialog you can dismiss rather than a page you navigate to.
 */
const CATEGORIES = [
  { value: 'BUG', label: 'Something is broken' },
  { value: 'USABILITY', label: 'Hard to use' },
  { value: 'PERFORMANCE', label: 'Too slow' },
  { value: 'DESIGN', label: 'How it looks' },
  { value: 'FEATURE_REQUEST', label: 'I wish it could…' },
  { value: 'PRAISE', label: 'Something I like' },
  { value: 'OTHER', label: 'Something else' },
];

const MESSAGE_MAX = 4000;

export default function FeedbackDialog({ onClose }) {
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [category, setCategory] = useState('');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Escape closes it, like every other dialog in the app.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) { toast.error('Please tell us what you think'); return; }

    setSubmitting(true);
    try {
      await axios.post('/feedback', {
        category: category || 'OTHER',
        rating: rating || undefined,
        message: message.trim(),
        // Where they were standing, so a vague "this page is broken" is still
        // actionable. The server trims and never trusts it.
        page: `${location.pathname}${location.search}`,
      });
      toast.success('Thank you — your feedback has been sent');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not send your feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fbd-overlay" onClick={onClose} role="presentation">
      <div
        className="fbd-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fbd-title"
      >
        <div className="fbd-head">
          <div>
            <h2 id="fbd-title">Send feedback</h2>
            <p>Tell us what is working and what is not. This goes straight to the E-MOORM team.</p>
          </div>
          <button type="button" className="fbd-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!isAuthenticated ? (
          <div className="fbd-body">
            <p className="fbd-signin">
              Please sign in first so we can follow up on what you tell us.
            </p>
            <div className="fbd-actions">
              <button type="button" className="fbd-btn-ghost" onClick={onClose}>Close</button>
              <a className="fbd-btn" href={`/login?redirect=${encodeURIComponent(location.pathname)}`}>
                Sign in
              </a>
            </div>
          </div>
        ) : (
          <form className="fbd-body" onSubmit={submit}>
            <div className="fbd-field">
              <label htmlFor="fbd-category">What is this about?</label>
              <select
                id="fbd-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Choose one (optional)</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="fbd-field">
              <label id="fbd-rating-label">How would you rate E-MOORM so far?</label>
              <div className="fbd-stars" role="group" aria-labelledby="fbd-rating-label">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`fbd-star ${(hover || rating) >= n ? 'is-on' : ''}`}
                    onClick={() => setRating(rating === n ? 0 : n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    aria-pressed={rating === n}
                  >
                    <Star size={26} weight={(hover || rating) >= n ? 'fill' : 'regular'} />
                  </button>
                ))}
                {rating > 0 && (
                  <button type="button" className="fbd-clear" onClick={() => setRating(0)}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="fbd-field">
              <label htmlFor="fbd-message">Your feedback</label>
              <textarea
                id="fbd-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                placeholder="What happened, what you expected, or what would make this better…"
                required
              />
              <span className="fbd-count">{message.length}/{MESSAGE_MAX}</span>
            </div>

            <p className="fbd-note">
              Need help with an order or your account? Use{' '}
              <a href="/help">Help &amp; Support</a> instead — someone will reply there.
            </p>

            <div className="fbd-actions">
              <button type="button" className="fbd-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="fbd-btn" disabled={submitting || !message.trim()}>
                <PaperPlaneTilt size={16} weight="fill" />
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
