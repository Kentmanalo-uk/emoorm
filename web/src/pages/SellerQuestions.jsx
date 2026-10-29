import { useCallback, useEffect, useState } from 'react';
import EmptyState from '../components/ui/EmptyState';
import LoadFailed from '../components/ui/LoadFailed';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Question, EyeSlash } from '@phosphor-icons/react';
import axios from '../lib/axios';
import { resolveImg, firstImage } from '../lib/media';
import { confirmAction } from '../lib/confirm';
import { timeAgo } from '../lib/format';
import SellerPageHead from '../components/seller/SellerPageHead';
import Skeleton from '../components/ui/Skeleton';
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
  const [loadFailed, setLoadFailed] = useState(false);
  // Kept across tab changes, so the To answer count doesn't blink.
  const [openCount, setOpenCount] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  // A failed load says so (with Try again) instead of looking like "No
  // questions waiting"; questions already on screen stay while it retries.
  const load = useCallback((status) => axios.get('/questions/store', { params: { status } })
    .then((res) => { setData(res.data); setOpenCount(res.data?.open || 0); setLoadFailed(false); })
    .catch(() => setLoadFailed(true)), []);
  useEffect(() => { load(tab); }, [tab, load]);

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

  const pickTab = (key) => {
    if (key === tab) return;
    setData(null);
    setTab(key);
  };

  let body;
  if (loadFailed && !data) {
    body = <div className="seller-card sq-empty"><LoadFailed onRetry={() => load(tab)} what="buyer questions" compact /></div>;
  } else if (data === null) {
    body = <div className="seller-card sq-loading"><Skeleton.Text lines={3} height={14} /></div>;
  } else if (data.items.length === 0) {
    body = (
      <div className="seller-card sq-empty">
        <EmptyState
          className="ui-empty--inset"
          art="messages"
          title={tab === 'open' ? 'No questions waiting' : 'No questions yet'}
          text={tab === 'open'
            ? 'New questions from buyers show up here.'
            : 'Buyers can ask about a product on its page.'}
        />
      </div>
    );
  } else {
    body = (
      <ul className="sq-list">
        {data.items.map((q) => {
          const draft = drafts[q.id] ?? q.answer ?? '';
          const boxId = `sq-answer-${q.id}`;
          return (
            <li key={q.id} id={`q-${q.id}`} className={`seller-card sq-item${q.id === focusId ? ' is-focus' : ''}`}>
              <Link to={`/product/${q.product.slug}`} className="sq-product">
                {firstImage(q.product.images) ? <img src={resolveImg(firstImage(q.product.images))} alt="" /> : <span />}
                <b>{q.product.name}</b>
              </Link>
              <p className="sq-question"><Question size={16} weight="fill" aria-hidden="true" /> {q.question}</p>
              <small className="sq-meta">{q.askedBy} · {timeAgo(q.createdAt)}{q.answer ? ' · Answered' : ''}</small>
              <label htmlFor={boxId} className="sq-label">{q.answer ? 'Your answer' : 'Answer'} <span>(everyone sees it on the product page)</span></label>
              <textarea
                id={boxId}
                rows={2}
                maxLength={1000}
                value={draft}
                placeholder="e.g. Yes po, available pa. Fresh every morning."
                onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
              />
              <div className="sq-actions">
                <button type="button" className="btn-seller-outline sq-hide" onClick={() => hide(q)}><EyeSlash size={15} /> Hide</button>
                <button
                  type="button"
                  className="btn-seller-primary"
                  disabled={busyId === q.id || !String(draft).trim()}
                  onClick={() => answer(q)}
                >
                  {q.answer ? 'Update answer' : 'Post answer'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead title="Buyer questions" subtitle="Answers show on the product page, so the next buyer knows too." />
        <div className="sq-tabs" role="tablist" aria-label="Show questions">
          {[['open', `To answer${openCount ? ` (${openCount})` : ''}`], ['all', 'All']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => pickTab(key)}>{label}</button>
          ))}
        </div>
        {loadFailed && data && (
          <p className="sq-stale" role="status">
            Couldn&apos;t refresh the questions.{' '}
            <button type="button" onClick={() => load(tab)}>Try again</button>
          </p>
        )}
        {body}
      </div>
    </div>
  );
}
