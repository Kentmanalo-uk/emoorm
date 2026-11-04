import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowSquareOut, MagnifyingGlass as Search, Trash } from '../lib/icons';
import AdminLayout from '../components/admin/AdminLayout';
import ReasonDialog from '../components/admin/ReasonDialog';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import EmptyArt from '../components/ui/EmptyArt';
import ImageOverlay from '../components/product/ImageOverlay';
import axios from '../lib/axios';
import { timeAgo } from '../lib/format';
import '../components/admin/AdminLayout.css';
import './AdminModeration.css';
import './AdminPhotoDesigns.css';

const PAGE_SIZE = 24;

/**
 * Photo designs (super admin, and town admins for their town): every shop's
 * own designs, which show to buyers as soon as they are saved. Remove one
 * that misleads (a fake "FDA approved" badge, someone else's logo); the
 * products wearing it go back to plain photos and the shop is told why.
 */
export default function AdminPhotoDesigns() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], total: 0, failed: false });
  const [target, setTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  // Search as you type: the box settles for a moment, then asks.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = setTimeout(() => { setSearch(next); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const queryKey = `${search}|${page}|${reloadTick}`;
  const isLoading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    axios.get('/photo-designs/admin', { params: { page, pageSize: PAGE_SIZE, q: search || undefined } })
      .then((res) => {
        if (!cancelled) {
          setResult({
            key: queryKey, rows: res.data?.designs || [], total: res.data?.total || 0, failed: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key: queryKey, rows: [], total: 0, failed: true });
      });
    return () => { cancelled = true; };
  }, [queryKey, search, page]);

  const remove = async (reason) => {
    if (!target) return;
    setRemoving(true);
    try {
      await axios.post(`/photo-designs/admin/${target.id}/remove`, { reason });
      toast.success('Design removed. The shop is told why.');
      setTarget(null);
      if (result.rows.length === 1 && page > 1) setPage(page - 1);
      else setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.message || 'Could not remove the design');
    } finally {
      setRemoving(false);
    }
  };

  const { rows, total, failed } = result;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Photo designs</h1>
          <p className="admin-page-sub">Designs shops made for their product photos. They show to buyers right away; remove one that misleads and the shop sees your reason.</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Shops&apos; designs
            {total > 0 && <span className="am-count">({total.toLocaleString('en-PH')})</span>}
          </h2>
          <div className="admin-toolbar">
            <label className="am-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search designs"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search design or shop name…"
              />
            </label>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={4} rows={4} />
        ) : failed ? (
          <LoadFailed what="the designs" onRetry={() => setReloadTick((t) => t + 1)} compact />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="designs" size={104} />
            <p>{search ? 'No designs match this search' : 'No shop has made its own design yet'}</p>
          </div>
        ) : (
          <>
            <div className="apd-grid">
              {rows.map((d) => (
                <article key={d.id} className="apd-card">
                  <div className="apd-preview">
                    <span className="apd-sample" aria-hidden="true" />
                    <ImageOverlay design="custom" store={d.store} layers={d.layers} />
                  </div>
                  <div className="apd-body">
                    <strong className="apd-name">{d.name}</strong>
                    <a className="admin-link" href={`/store/${d.store?.slug}`} target="_blank" rel="noopener noreferrer">
                      {d.store?.name} <ArrowSquareOut size={12} />
                    </a>
                    <span className="apd-meta">
                      {[d.store?.municipality?.name, d.products ? `on ${d.products} product${d.products === 1 ? '' : 's'}` : 'not on a product', `changed ${timeAgo(d.updatedAt)}`].filter(Boolean).join(' · ')}
                    </span>
                    <button type="button" className="admin-btn admin-btn-danger apd-remove" onClick={() => setTarget(d)}>
                      <Trash size={13} /> Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {pages > 1 && (
              <div className="admin-pagination">
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <ReasonDialog
        open={!!target}
        title="Remove this design?"
        message={target
          ? `"${target.name}" by ${target.store?.name || 'this shop'} is deleted${target.products ? `, and its ${target.products} product${target.products === 1 ? '' : 's'} go back to plain photos` : ''}. The shop is told your reason.`
          : ''}
        confirmLabel="Remove design"
        placeholder="Why it is being removed, e.g. a health claim the shop cannot back"
        required
        loading={removing}
        onConfirm={remove}
        onCancel={() => setTarget(null)}
      />
    </AdminLayout>
  );
}
