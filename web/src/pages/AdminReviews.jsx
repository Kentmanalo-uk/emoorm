import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Star, MagnifyingGlass as Search, Trash, ArrowSquareOut, X } from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import ReasonDialog from '../components/admin/ReasonDialog';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import EmptyArt from '../components/ui/EmptyArt';
import { timeAgo } from '../lib/format';
import '../components/admin/AdminLayout.css';
import './AdminModeration.css';
import Select from '../components/ui/Select';

const PAGE_SIZE = 20;

function Stars({ rating }) {
  return (
    <span className="am-stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} weight={n <= rating ? 'fill' : 'regular'} className={n <= rating ? 'is-on' : ''} />
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const [searchParams, setSearchParams] = useSearchParams();
  // ?storeId= (from a shop's record) shows that shop's reviews only.
  const storeId = searchParams.get('storeId') || '';
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], pagination: { total: 0, totalPages: 0 }, failed: false });
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Search as you type: the box settles for a moment, then asks.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = setTimeout(() => { setSearch(next); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const queryKey = `${search}|${rating}|${storeId}|${page}|${reloadTick}`;
  const isLoading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    const params = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (rating) params.rating = rating;
    if (storeId) params.storeId = storeId;
    axios.get('/moderation/reviews', { params })
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: queryKey,
          rows: res.data || [],
          pagination: res.pagination || { total: 0, totalPages: 0 },
          failed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Shown as a failed load with Retry, never as "No reviews yet".
        setResult({ key: queryKey, rows: [], pagination: { total: 0, totalPages: 0 }, failed: true });
      });
    return () => { cancelled = true; };
  }, [queryKey, search, rating, page, storeId]);

  const removeReview = async (reason) => {
    if (!target) return;
    setDeleting(true);
    try {
      await axios.post(`/moderation/reviews/${target.id}/remove`, { reason });
      toast.success('Review removed. The reviewer is told why.');
      setTarget(null);
      if (result.rows.length === 1 && page > 1) setPage(page - 1);
      else setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to remove review');
    } finally {
      setDeleting(false);
    }
  };

  const clearStore = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('storeId');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const { rows, pagination, failed } = result;
  const storeName = rows.find((r) => r.product?.store?.id === storeId)?.product?.store?.name;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Reviews</h1>
          <p className="admin-page-sub">Remove reviews that break the rules; the reviewer sees your reason</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Product reviews
            {pagination.total > 0 && <span className="am-count">({pagination.total.toLocaleString('en-PH')})</span>}
          </h2>
          <div className="admin-toolbar">
            <label className="am-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search reviews"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search comment, product, store, reviewer…"
              />
            </label>
            <Select
              aria-label="Filter by rating"
              className="admin-select"
              value={rating}
              onChange={(e) => { setRating(e.target.value); setPage(1); }}
            >
              <option value="">All ratings</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>
              ))}
            </Select>
          </div>
        </div>

        {storeId && (
          <div className="am-chips">
            <span className="am-chip">
              Store: {storeName || 'this shop'}
              <button type="button" onClick={clearStore} aria-label="Show every shop's reviews"><X size={12} /></button>
            </span>
          </div>
        )}

        {isLoading ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : failed ? (
          <LoadFailed what="the reviews" onRetry={() => setReloadTick((t) => t + 1)} compact />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="reviews" size={104} />
            <p>{search || rating || storeId ? 'No reviews match these filters' : 'No reviews yet'}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table am-table">
                <thead>
                  <tr>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Product</th>
                    <th>Store</th>
                    <th>Reviewer</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Rating"><Stars rating={r.rating} /></td>
                      <td data-label="Comment">
                        {r.comment
                          ? <span className="am-comment">{r.comment}</span>
                          : <em className="am-muted">No comment</em>}
                        {r.sellerReply && (
                          <span className="am-reply"><strong>Seller replied:</strong> {r.sellerReply}</span>
                        )}
                      </td>
                      <td data-label="Product">
                        {r.product?.slug ? (
                          <a className="admin-link" href={`/product/${r.product.slug}`} target="_blank" rel="noopener noreferrer">
                            {r.product.name} <ArrowSquareOut size={12} />
                          </a>
                        ) : (r.product?.name || '—')}
                      </td>
                      <td data-label="Store">{r.product?.store?.name || '—'}</td>
                      <td data-label="Reviewer">{r.user?.fullName || '—'}</td>
                      <td data-label="Date">
                        <time className="am-time" dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString('en-PH')}>
                          {timeAgo(r.createdAt)}
                        </time>
                      </td>
                      <td className="am-actions">
                        <button type="button" className="admin-btn admin-btn-danger" onClick={() => setTarget(r)}>
                          <Trash size={13} /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <ReasonDialog
        open={!!target}
        title="Remove this review?"
        message={target
          ? `The ${target.rating}-star review by ${target.user?.fullName || 'this user'} on "${target.product?.name || 'this product'}" is taken down and the product's rating recalculated. ${target.user?.fullName || 'The reviewer'} is told your reason.`
          : ''}
        confirmLabel="Remove review"
        placeholder="Why it is being removed, e.g. abusive words, or not about the product"
        required
        loading={deleting}
        onConfirm={removeReview}
        onCancel={() => !deleting && setTarget(null)}
      />
    </AdminLayout>
  );
}
