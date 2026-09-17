import { useEffect, useState } from 'react';
import { Star, MagnifyingGlass as Search, Trash, ChatCenteredText, ArrowSquareOut } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminModeration.css';

const PAGE_SIZE = 20;

function Stars({ rating }) {
  return (
    <span className="am-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} weight={n <= rating ? 'fill' : 'regular'} className={n <= rating ? 'is-on' : ''} />
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], pagination: { total: 0, totalPages: 0 } });
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const queryKey = `${search}|${rating}|${page}|${reloadTick}`;
  const isLoading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    const params = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (rating) params.rating = rating;
    axios.get('/moderation/reviews', { params })
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: queryKey,
          rows: res.data || [],
          pagination: res.pagination || { total: 0, totalPages: 0 },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message || 'Failed to load reviews');
        setResult({ key: queryKey, rows: [], pagination: { total: 0, totalPages: 0 } });
      });
    return () => { cancelled = true; };
  }, [queryKey, search, rating, page]);

  const submitSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await axios.delete(`/reviews/${target.id}`);
      toast.success('Review removed');
      setTarget(null);
      if (result.rows.length === 1 && page > 1) setPage(page - 1);
      else setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to remove review');
    } finally {
      setDeleting(false);
    }
  };

  const { rows, pagination } = result;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Reviews</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Product reviews
            {pagination.total > 0 && <span className="am-count">({pagination.total})</span>}
          </h2>
          <div className="admin-toolbar">
            <form className="am-search" onSubmit={submitSearch}>
              <Search size={15} />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (!e.target.value && search) { setSearch(''); setPage(1); }
                }}
                placeholder="Search comment, product, store, reviewer…"
              />
            </form>
            <select
              className="admin-select"
              value={rating}
              onChange={(e) => { setRating(e.target.value); setPage(1); }}
            >
              <option value="">All ratings</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <ChatCenteredText size={36} weight="fill" />
            <p>{search || rating ? 'No reviews match these filters' : 'No reviews yet'}</p>
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
                    <th aria-label="Actions" />
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
                      <td data-label="Date" className="am-nowrap">
                        {new Date(r.createdAt).toLocaleDateString('en-PH')}
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
                <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button className="admin-page-btn" disabled={!pagination.hasNext && page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!target}
        title="Remove this review?"
        message={target ? `The ${target.rating}-star review by ${target.user?.fullName || 'this user'} on "${target.product?.name || 'this product'}" will be permanently deleted and the product rating recalculated.` : ''}
        confirmLabel="Remove review"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setTarget(null)}
      />
    </AdminLayout>
  );
}
