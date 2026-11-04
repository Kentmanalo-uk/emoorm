import { useCallback, useEffect, useState } from 'react';
import {
  Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams,
} from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Copy, PencilSimple, Plus, Trash,
} from '../lib/icons';
import axios from '../lib/axios';
import { resolveImg, srcSetFor } from '../lib/media';
import { MAX_DESIGNS, STARTERS, newId } from '../lib/photoDesign';
import SellerPageHead from '../components/seller/SellerPageHead';
import ImageOverlay from '../components/product/ImageOverlay';
import DesignEditor from '../components/seller/photo-design/DesignEditor';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadFailed from '../components/ui/LoadFailed';
import './SellerPhotoDesigns.css';

/**
 * Photo designs (/seller/photo-designs): the shop's own designs to put over
 * its product photos, next to the ten ready ones. The list, and the editor
 * for a new design (/new, ?start= a starter) or one of them (/:id). A saved
 * design shows to buyers at once on the products wearing it; in a product's
 * form, Photos → Brand your photos picks it.
 */
export default function SellerPhotoDesigns() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const outlet = useOutletContext();
  const store = outlet?.store || null;
  const creating = location.pathname.endsWith('/new');
  const [designs, setDesigns] = useState(null);
  const [failed, setFailed] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(null);
  const [startOpen, setStartOpen] = useState(false);

  const fetchDesigns = useCallback(() => axios.get('/photo-designs')
    .then((res) => { setDesigns(res.data?.designs || []); setFailed(false); })
    .catch(() => setFailed(true)), []);
  const load = () => {
    setFailed(false);
    return fetchDesigns();
  };

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);

  // The shop's own photos to try a design on.
  useEffect(() => {
    let live = true;
    axios.get('/products/my/products', { params: { page: 1, pageSize: 12 }, quiet: true })
      .then((res) => {
        if (!live) return;
        const list = (res.data || []).map((p) => (Array.isArray(p.images) ? p.images[0] : null)).filter(Boolean);
        setPhotos([...new Set(list)]);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const editing = id && designs ? designs.find((d) => d.id === id) : null;
  const full = (designs?.length || 0) >= MAX_DESIGNS;

  const save = async ({ name, layers }) => {
    setSaving(true);
    try {
      if (editing) await axios.put(`/photo-designs/${editing.id}`, { name, layers });
      else await axios.post('/photo-designs', { name, layers });
      toast.success(editing ? 'Design saved. Your products show it now.' : 'Design saved. Pick it in a product\'s Photos.');
      await load();
      navigate('/seller/photo-designs');
    } catch (err) {
      toast.error(err.message || 'Could not save the design');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (d) => {
    try {
      await axios.post('/photo-designs', { name: `${d.name} (copy)`.slice(0, 40), layers: d.layers.layers });
      toast.success('Copied');
      load();
    } catch (err) {
      toast.error(err.message || 'Could not copy it');
    }
  };

  const remove = async () => {
    const d = asking;
    try {
      await axios.delete(`/photo-designs/${d.id}`);
      toast.success('Design deleted');
      setAsking(null);
      await load();
      if (id) navigate('/seller/photo-designs');
    } catch (err) {
      toast.error(err.message || 'Could not delete it');
    }
  };

  const back = (dirty) => {
    if (dirty && !window.confirm('Leave without saving your changes?')) return;
    navigate('/seller/photo-designs');
  };

  // ── The editor ──
  if (creating || id) {
    if (!designs) return failed ? <LoadFailed onRetry={load} what="your designs" /> : <div className="spd-loading" />;
    if (id && !editing) {
      return (
        <div className="spd">
          <p>This design is gone. <Link to="/seller/photo-designs">See your designs</Link></p>
        </div>
      );
    }
    if (creating && full) {
      return (
        <div className="spd">
          <p>{`You have ${MAX_DESIGNS} designs, the most a shop can keep. Delete one to make another.`} <Link to="/seller/photo-designs">See your designs</Link></p>
        </div>
      );
    }
    const starter = STARTERS.find((s) => s.key === params.get('start')) || STARTERS[0];
    const initial = editing
      ? { name: editing.name, layers: editing.layers.layers.map((l) => ({ ...l })) }
      : { name: starter.key === 'blank' ? 'My design' : starter.label, layers: starter.make(store).map((l) => ({ ...l, id: newId() })) };
    return (
      <div className="spd spd-editing">
        <DesignEditor
          key={editing?.id || `new-${starter.key}`}
          initial={initial}
          store={store}
          photos={photos}
          saving={saving}
          onSave={save}
          onBack={back}
          onDelete={editing ? () => setAsking(editing) : null}
        />
        <ConfirmDialog
          open={Boolean(asking)}
          title="Delete this design?"
          message={asking?.products ? `${asking.products} product${asking.products === 1 ? '' : 's'} wear it. Their photos go back to plain.` : 'It is not on any product.'}
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setAsking(null)}
        />
      </div>
    );
  }

  // ── The list ──
  const sample = photos[0] || null;
  return (
    <div className="spd">
      <SellerPageHead
        title="Photo designs"
        subtitle="Make your own designs to put over your product photos: your logo, shop name, words, shapes and pictures. Your photos stay as they are."
        actions={(
          <button type="button" className="spd-new" onClick={() => setStartOpen(true)} disabled={full}>
            <Plus size={17} weight="bold" /> New design
          </button>
        )}
      />

      {failed && !designs && <LoadFailed onRetry={load} what="your designs" />}

      {(startOpen || designs?.length === 0) && !full && (
        <section className="spd-starters" aria-label="Start from">
          <h2>Start from</h2>
          <div className="spd-grid">
            {STARTERS.map((s) => (
              <Link key={s.key} to={`/seller/photo-designs/new?start=${s.key}`} className="spd-card is-starter">
                <span className="spd-preview">
                  {sample ? <img src={resolveImg(sample) || sample} srcSet={srcSetFor(sample)} sizes="(max-width: 768px) 50vw, 240px" alt="" /> : <span className="spd-blank" />}
                  {s.key !== 'blank' && <ImageOverlay design="custom" store={store} layers={s.make(store)} />}
                  {s.key === 'blank' && <span className="spd-plus"><Plus size={28} /></span>}
                </span>
                <strong>{s.label}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}

      {designs?.length > 0 && (
        <section aria-label="Your designs">
          <h2 className="spd-h2">{`Your designs (${designs.length}/${MAX_DESIGNS})`}</h2>
          <div className="spd-grid">
            {designs.map((d) => (
              <div key={d.id} className="spd-card">
                <Link to={`/seller/photo-designs/${d.id}`} className="spd-preview" aria-label={`Edit ${d.name}`}>
                  {sample ? <img src={resolveImg(sample) || sample} srcSet={srcSetFor(sample)} sizes="(max-width: 768px) 50vw, 240px" alt="" /> : <span className="spd-blank" />}
                  <ImageOverlay design="custom" store={store} layers={d.layers} />
                </Link>
                <strong>{d.name}</strong>
                <small>{d.products ? `On ${d.products} product${d.products === 1 ? '' : 's'}` : 'Not on a product yet'}</small>
                <div className="spd-actions">
                  <Link to={`/seller/photo-designs/${d.id}`} className="spd-act"><PencilSimple size={15} /> Edit</Link>
                  <button type="button" className="spd-act" onClick={() => duplicate(d)} disabled={full} aria-label={`Copy ${d.name}`}><Copy size={15} /></button>
                  <button type="button" className="spd-act is-danger" onClick={() => setAsking(d)} aria-label={`Delete ${d.name}`}><Trash size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="spd-help">
        To put a design on a product, open the product, and in Photos turn on Brand your photos, then pick it under Your designs.
      </p>

      <ConfirmDialog
        open={Boolean(asking)}
        title="Delete this design?"
        message={asking?.products ? `${asking.products} product${asking.products === 1 ? '' : 's'} wear it. Their photos go back to plain.` : 'It is not on any product.'}
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onCancel={() => setAsking(null)}
      />
    </div>
  );
}
