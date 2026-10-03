import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Question, EyeSlash } from '@phosphor-icons/react';
import axios from '../lib/axios';
import { resolveImg, firstImage } from '../lib/media';
import { confirmAction } from '../lib/confirm';
import SellerPageHead from '../components/seller/SellerPageHead';
import Skeleton from '../components/ui/Skeleton';
import EmptyArt from '../components/ui/EmptyArt';
import './SellerDashboard.css';
import './SellerQuestions.css';

/**
 * Questions buyers asked on the shop's products. Answered ones show on the
 * product page for everyone; the asker is notified.
 */
export default function SellerQuestions() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('id');
  const [tab, setTab] = useState('open');
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = (status) => axios.get('/questions/store', { params: { status } })
    .then((res) => setData(res.data))
    .catch(() => setData({ items: [], open: 0 }));
  useEffect(() => { load(tab); }, [tab]);

  useEffect(() => {
    if (!focusId || !data) return;
    document.getElementById(`q-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId, data]);

  const answer = async (q) => {
    setBusyId(q.id);
    try {
      await axios.post(`/questions/${q.id}/answer`, { answer: (drafts[q.id] ?? q.answer ?? '').trim() });
      toast.success('Answer posted on the product page');
      setDrafts((d) => ({ ...d, [q.id]: undefined }));
      load(tab);
    } catch (err) {
      toast.error(err.message || 'Could not post the answer');
    } finally {
      setBusyId(null);
    }
  };

  const hide = async (q) => {
    if (!(await confirmAction({ title: 'Hide this question?', message: 'It disappears from the product page. Use this for spam or rude questions.', confirmLabel: 'Hide', danger: true }))) return;
    try {
      await axios.post(`/questions/${q.id}/hide`);
      load(tab);
    } catch (err) {
      toast.error(err.message || 'Could not hide the question');
    }
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead title="Buyer questions" subtitle="Answers show on the product page, so the next buyer knows too." />
        <div className="sq-tabs" role="tablist">
          {[['open', `To answer${data?.open ? ` (${data.open})` : ''}`], ['all', 'All']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {data === null ? (
          <div className="seller-card" style={{ padding: 20 }}><Skeleton.Text lines={3} height={14} /></div>
        ) : data.items.length === 0 ? (
          <div className="seller-card sq-empty">
            <EmptyArt name="messages" size={96} />
            <p>{tab === 'open' ? 'No questions waiting. Nice!' : 'No questions yet. Buyers can ask on each product page.'}</p>
          </div>
        ) : (
          <ul className="sq-list">
            {data.items.map((q) => (
              <li key={q.id} id={`q-${q.id}`} className={`seller-card sq-item${q.id === focusId ? ' is-focus' : ''}`}>
                <Link to={`/product/${q.product.slug}`} className="sq-product">
                  {firstImage(q.product.images) ? <img src={resolveImg(firstImage(q.product.images))} alt="" /> : <span />}
                  <b>{q.product.name}</b>
                </Link>
                <p className="sq-question"><Question size={16} weight="fill" /> {q.question}</p>
                <small className="sq-meta">{q.askedBy} · {new Date(q.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</small>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={drafts[q.id] ?? q.answer ?? ''}
                  placeholder="Your answer"
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                />
                <div className="sq-actions">
                  <button type="button" className="btn-seller-outline sq-hide" onClick={() => hide(q)}><EyeSlash size={15} /> Hide</button>
                  <button
                    type="button"
                    className="btn-seller-primary"
                    disabled={busyId === q.id || !String(drafts[q.id] ?? q.answer ?? '').trim()}
                    onClick={() => answer(q)}
                  >
                    {q.answer ? 'Update answer' : 'Answer'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
