import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Question, Storefront } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import './ProductQuestions.css';

const when = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Product page: questions buyers asked and the shop's answers, and a box to
 * ask one. Your own unanswered questions show to you as "waiting".
 */
export default function ProductQuestions({ product, isOwnProduct = false }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/questions/product/${product.id}`)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData({ items: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [product.id, isAuthenticated]);

  const ask = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/product/${product.slug}`)}`);
      return;
    }
    setSending(true);
    try {
      const res = await axios.post(`/questions/product/${product.id}`, { question: draft.trim() });
      setData((d) => ({ ...d, items: [res.data, ...(d?.items || [])], total: (d?.total || 0) + 1 }));
      setDraft('');
      toast.success('Sent to the shop. You will be notified when they answer.');
    } catch (err) {
      toast.error(err.message || 'Could not send your question');
    } finally {
      setSending(false);
    }
  };

  const items = data?.items || [];

  return (
    <div className="pdp-detail-card pq" id="pdp-questions">
      <div className="pdp-section-head">
        <h2 className="pdp-section-title">
          Questions
          {data?.total > 0 && <span className="pdp-section-count">{data.total}</span>}
        </h2>
      </div>
      <div className="pdp-section-body">
        {!isOwnProduct && (
          <form className="pq-ask" onSubmit={ask}>
            <input
              value={draft}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask the shop about this product, e.g. How ripe are they?"
              aria-label="Your question"
            />
            <button type="submit" disabled={sending || draft.trim().length < 5}>{sending ? 'Sending…' : 'Ask'}</button>
          </form>
        )}
        {data === null ? null : items.length === 0 ? (
          <p className="pq-empty"><Question size={18} /> No questions yet.</p>
        ) : (
          <ul className="pq-list">
            {items.map((q) => (
              <li key={q.id} className="pq-item">
                <p className="pq-q"><b>Q</b><span>{q.question}<small>{q.askedBy}{q.mine ? ' (you)' : ''} · {when(q.createdAt)}</small></span></p>
                {q.answer ? (
                  <p className="pq-a"><b><Storefront size={13} weight="fill" /></b><span>{q.answer}<small>The shop · {when(q.answeredAt)}</small></span></p>
                ) : (
                  <p className="pq-waiting">Waiting for the shop to answer</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
