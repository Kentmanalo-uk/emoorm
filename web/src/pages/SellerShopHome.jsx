import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ArrowUp, ArrowDown, Trash, Plus, CaretDown, ImageSquare, Star, Images, ChatText,
  UploadSimple, X, Eye, Check, MagnifyingGlass, Sparkle, ArrowSquareOut,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import {
  SECTION_KINDS, KIND_ORDER, HOME_PRESETS, newSection, sectionReady, buildPreset,
} from '../lib/shopHome';
import ShopHome from '../components/shop/ShopHome';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { BusyLabel } from '../components/ui/Spinner';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './SellerDashboard.css';
import './SellerShopHome.css';

/*
 * Decorate my shop → Shop home: the seller builds the Home tab of their shop
 * page from sections (banner, spotlight products, gallery, message), each in
 * a style they pick, with a live preview of what buyers will see.
 */

const KIND_ICON = { banner: ImageSquare, spotlight: Star, gallery: Images, message: ChatText };
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Small drawings of each style (60 × 40), so a seller sees the layout before picking it.
const THUMBS = {
  'banner:slider': [[4, 6, 52, 24, 'img'], [24, 33, 4, 2, 'dot'], [30, 33, 4, 2, 'dot2'], [36, 33, 4, 2, 'dot2']],
  'banner:wide': [[2, 3, 56, 16, 'img'], [2, 21, 56, 16, 'img2']],
  'banner:cards': [[3, 6, 40, 26, 'img'], [46, 6, 40, 26, 'img2']],
  'spotlight:grid': [[6, 3, 23, 16, 'img'], [31, 3, 23, 16, 'img'], [6, 21, 23, 16, 'img2'], [31, 21, 23, 16, 'img2']],
  'spotlight:carousel': [[3, 8, 18, 24, 'img'], [23, 8, 18, 24, 'img'], [43, 8, 18, 24, 'img2']],
  'spotlight:hero': [[4, 3, 52, 18, 'img'], [4, 23, 25, 14, 'img2'], [31, 23, 25, 14, 'img2']],
  'spotlight:list': [[4, 4, 10, 9, 'img'], [17, 7, 36, 3, 'line'], [4, 16, 10, 9, 'img'], [17, 19, 36, 3, 'line'], [4, 28, 10, 9, 'img'], [17, 31, 36, 3, 'line']],
  'gallery:grid': [[4, 4, 16, 15, 'img'], [22, 4, 16, 15, 'img2'], [40, 4, 16, 15, 'img'], [4, 21, 16, 15, 'img2'], [22, 21, 16, 15, 'img'], [40, 21, 16, 15, 'img2']],
  'gallery:mosaic': [[4, 4, 34, 32, 'img'], [40, 4, 16, 15, 'img2'], [40, 21, 16, 15, 'img2']],
  'gallery:strip': [[3, 8, 30, 24, 'img'], [35, 8, 30, 24, 'img2']],
  'message:card': [[4, 6, 52, 28, 'soft'], [9, 12, 9, 9, 'fill'], [21, 13, 28, 3, 'line'], [21, 19, 22, 3, 'line']],
  'message:highlight': [[4, 6, 52, 28, 'fill'], [10, 14, 30, 3, 'white'], [10, 20, 22, 3, 'white']],
  'message:quote': [[4, 6, 52, 28, 'dash'], [27, 10, 6, 5, 'fill'], [14, 19, 32, 3, 'line'], [18, 25, 24, 3, 'line']],
};

function StyleThumb({ kind, style }) {
  const boxes = THUMBS[`${kind}:${style}`] || [];
  return (
    <svg className="shb-thumb" viewBox="0 0 60 40" aria-hidden="true">
      {boxes.map(([x, y, w, h, k], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx={k === 'line' || k === 'white' ? 1.5 : 3} className={`shb-thumb-${k}`} />
      ))}
    </svg>
  );
}

/** /seller/decorate/home */
export default function SellerShopHome() {
  const { store, setStore } = useOutletContext() || {};
  const isPhone = usePhoneLayout();
  const [sections, setSections] = useState([]);
  const [saved, setSaved] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      axios.get('/stores/my/home').then((r) => r.data?.sections || []).catch(() => []),
      axios.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 100 } }).then((r) => r.data || []).catch(() => []),
    ]).then(([home, list]) => {
      if (cancelled) return;
      setSections(home);
      setSaved(JSON.stringify(home));
      setProducts(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const lookup = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const dirty = JSON.stringify(sections) !== saved;
  const themeVars = { '--shop-primary': store?.primaryColor || '#047857', '--shop-secondary': store?.secondaryColor || '#F59E0B' };

  const update = (id, changes) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  const move = (id, by) => setSections((list) => {
    const i = list.findIndex((s) => s.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const add = (kind) => {
    const s = newSection(kind);
    setSections((list) => [...list, s]);
    setOpenId(s.id);
    setAdding(false);
    setTimeout(() => document.getElementById(`shb-sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const applyPreset = (p) => {
    const banner = store?.bannerImage || store?.coverImage || null;
    const list = buildPreset(p, {
      banner: banner && banner.startsWith('/uploads/') ? banner : null,
      productIds: products.map((x) => x.id),
      description: store?.description || '',
    });
    setSections(list);
    setOpenId(list[0]?.id || null);
    setPreset(null);
    toast.success(`${p.name} layout added. Change anything, then save.`);
  };

  const save = async () => {
    const notReady = sections.find((s) => !sectionReady(s));
    if (notReady) {
      setOpenId(notReady.id);
      document.getElementById(`shb-sec-${notReady.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast.error(notReady.type === 'spotlight' ? 'Pick at least one product for the spotlight, or remove it.'
        : notReady.type === 'message' ? 'Write the message, or remove that section.'
          : 'Add at least one photo to that section, or remove it.');
      return;
    }
    setSaving(true);
    try {
      await axios.put('/stores/my/home', { sections });
      setSaved(JSON.stringify(sections));
      setStore?.((prev) => (prev ? { ...prev, homeLayout: sections.length ? { sections } : null } : prev));
      toast.success(sections.length ? 'Shop home saved. Buyers see it on your shop page.' : 'Home tab removed from your shop page');
    } catch (err) {
      toast.error(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const preview = (
    <div className="shb-phone" style={themeVars}>
      <div className="shb-phone-head">
        <span className="shb-phone-logo">
          {store?.logo ? <img src={resolveImg(store.logo)} alt="" /> : (store?.name || 'S').charAt(0).toUpperCase()}
        </span>
        <strong>{store?.name || 'Your shop'}</strong>
      </div>
      <div className="shb-phone-tabs" aria-hidden="true">
        <span className="is-on">Home</span><span>Products</span><span>Categories</span><span>About</span>
      </div>
      <div className="shb-phone-body">
        {sections.some(sectionReady)
          ? <ShopHome sections={sections.filter(sectionReady)} lookup={lookup} preview />
          : <p className="shb-phone-empty">Add a section to see your Home here.</p>}
      </div>
    </div>
  );

  if (loading) {
    return <div className="seller-dashboard shb"><div className="seller-container"><p className="shb-loading">Loading your shop home…</p></div></div>;
  }

  return (
    <div className="seller-dashboard shb">
      <div className="seller-container shb-wrap">
        <div className="shb-editor">
          <section className="shb-intro">
            <div>
              <h2>Your shop&apos;s Home tab</h2>
              <p>The first thing buyers see on your shop page. Mix photos, your best products and a few words, each in the style you like.</p>
            </div>
            {store?.slug && (
              <a className="shb-live" href={`/store/${store.slug}`} target="_blank" rel="noreferrer">
                View shop <ArrowSquareOut size={13} weight="bold" />
              </a>
            )}
          </section>

          <section className="shb-presets" aria-label="Starter layouts">
            <h3><Sparkle size={15} weight="fill" /> Start from a layout</h3>
            <div className="shb-preset-list">
              {HOME_PRESETS.map((p) => (
                <button type="button" key={p.key} className="shb-preset" onClick={() => (sections.length ? setPreset(p) : applyPreset(p))}>
                  <strong>{p.name}</strong>
                  <span>{p.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {sections.length === 0 && (
            <p className="shb-empty">No sections yet. Start from a layout above, or add your own below.</p>
          )}

          {sections.map((s, i) => (
            <SectionEditor
              key={s.id}
              section={s}
              index={i}
              count={sections.length}
              open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              onChange={(changes) => update(s.id, changes)}
              onMove={(by) => move(s.id, by)}
              onRemove={() => setRemoving(s)}
              products={products}
              lookup={lookup}
            />
          ))}

          {adding ? (
            <section className="shb-add-pick" aria-label="Add a section">
              <div className="shb-add-head">
                <strong>Add a section</strong>
                <button type="button" className="shb-icon-btn" onClick={() => setAdding(false)} aria-label="Close"><X size={16} /></button>
              </div>
              <div className="shb-kinds">
                {KIND_ORDER.map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <button type="button" key={k} className={`shb-kind is-${k}`} onClick={() => add(k)}>
                      <span className="shb-kind-icon"><Icon size={22} weight="fill" /></span>
                      <strong>{SECTION_KINDS[k].label}</strong>
                      <span>{SECTION_KINDS[k].hint}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : sections.length < 12 && (
            <button type="button" className="shb-add" onClick={() => setAdding(true)}>
              <Plus size={18} weight="bold" /> Add a section
            </button>
          )}
        </div>

        {!isPhone && (
          <aside className="shb-preview" aria-label="Preview">
            <span className="shb-preview-label"><Eye size={14} /> What buyers see</span>
            {preview}
          </aside>
        )}
      </div>

      <div className="shb-savebar">
        {isPhone && (
          <button type="button" className="shb-btn shb-btn-ghost" onClick={() => setPreviewOpen(true)}>
            <Eye size={17} /> Preview
          </button>
        )}
        <button type="button" className="shb-btn shb-btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <BusyLabel>Saving…</BusyLabel> : dirty ? 'Save shop home' : <><Check size={16} weight="bold" /> Saved</>}
        </button>
      </div>

      {isPhone && previewOpen && (
        <div className="shb-sheet" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="shb-sheet-head">
            <strong>What buyers see</strong>
            <button type="button" className="shb-icon-btn" onClick={() => setPreviewOpen(false)} aria-label="Close preview"><X size={18} /></button>
          </div>
          <div className="shb-sheet-body">{preview}</div>
        </div>
      )}

      <ConfirmDialog
        open={!!preset}
        title={`Use the ${preset?.name || ''} layout?`}
        message="It replaces the sections you have now. Nothing is saved until you tap Save."
        confirmLabel="Use layout"
        onConfirm={() => applyPreset(preset)}
        onCancel={() => setPreset(null)}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove this section?"
        message="It disappears from your Home tab when you save."
        confirmLabel="Remove"
        danger
        onConfirm={() => { setSections((list) => list.filter((s) => s.id !== removing.id)); setRemoving(null); }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function SectionEditor({ section: s, index, count, open, onToggle, onChange, onMove, onRemove, products, lookup }) {
  const kind = SECTION_KINDS[s.type];
  const Icon = KIND_ICON[s.type];
  const style = kind.styles.find((x) => x.key === s.style) || kind.styles[0];
  const ready = sectionReady(s);
  return (
    <section id={`shb-sec-${s.id}`} className={`shb-sec is-${s.type}${open ? ' is-open' : ''}${ready ? '' : ' is-incomplete'}`}>
      <div className="shb-sec-head">
        <button type="button" className="shb-sec-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="shb-sec-icon"><Icon size={18} weight="fill" /></span>
          <span className="shb-sec-name">
            <strong>{s.title || kind.label}</strong>
            <small>{kind.label} · {style.name}{ready ? '' : ' · needs content'}</small>
          </span>
          <CaretDown size={16} weight="bold" className="shb-caret" />
        </button>
        <div className="shb-sec-tools">
          <button type="button" className="shb-icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={15} /></button>
          <button type="button" className="shb-icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down"><ArrowDown size={15} /></button>
          <button type="button" className="shb-icon-btn is-danger" onClick={onRemove} aria-label="Remove section"><Trash size={15} /></button>
        </div>
      </div>

      {open && (
        <div className="shb-sec-body">
          <div className="shb-field">
            <span className="shb-label">Style</span>
            <div className="shb-styles" role="radiogroup" aria-label={`${kind.label} style`}>
              {kind.styles.map((st) => (
                <button
                  type="button"
                  key={st.key}
                  role="radio"
                  aria-checked={s.style === st.key}
                  className={`shb-style${s.style === st.key ? ' is-on' : ''}`}
                  onClick={() => onChange({ style: st.key })}
                  title={st.desc}
                >
                  <StyleThumb kind={s.type} style={st.key} />
                  <strong>{st.name}</strong>
                  <span>{st.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="shb-field">
            <span className="shb-label">Heading {s.type !== 'spotlight' && <em>(optional)</em>}</span>
            <input
              className="shb-input"
              value={s.title || ''}
              maxLength={60}
              placeholder={s.type === 'banner' ? 'e.g. Harvest sale' : s.type === 'gallery' ? 'e.g. Our farm in Baco' : s.type === 'message' ? 'e.g. Open daily, 7am to 6pm' : 'e.g. Best sellers'}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>

          {(s.type === 'banner' || s.type === 'gallery') && (
            <PhotosField section={s} max={kind.maxImages} onChange={onChange} products={products} />
          )}
          {s.type === 'spotlight' && (
            <SpotlightField section={s} max={kind.maxProducts} onChange={onChange} products={products} lookup={lookup} />
          )}
          {s.type === 'message' && (
            <label className="shb-field">
              <span className="shb-label">Message</span>
              <textarea
                className="shb-input shb-textarea"
                rows={4}
                maxLength={400}
                value={s.body || ''}
                placeholder="e.g. All our vegetables are picked the morning you order. Message us for bulk orders!"
                onChange={(e) => onChange({ body: e.target.value })}
              />
              <small className="shb-count">{(s.body || '').length}/400</small>
            </label>
          )}
        </div>
      )}
    </section>
  );
}

function PhotosField({ section: s, max, onChange, products }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const images = s.images || [];
  const setImg = (i, changes) => onChange({ images: images.map((img, j) => (j === i ? { ...img, ...changes } : img)) });

  const addFiles = async (files) => {
    const room = max - images.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast(`Only ${max} photos fit in this section.`);
    let next = [...images];
    for (const file of list) {
      if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) { toast.error(`${file.name}: use a JPG, PNG or WebP photo`); continue; }
      setBusy((n) => n + 1);
      try {
        const { url } = await uploadImage(file);
        next = [...next, s.type === 'banner' ? { url, productId: null } : { url, caption: '' }];
        onChange({ images: next });
      } catch (err) {
        toast.error(err.message || 'Upload failed');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  return (
    <div className="shb-field">
      <span className="shb-label">Photos <em>{images.length}/{max}</em></span>
      <div className="shb-photos">
        {images.map((img, i) => (
          <div className="shb-photo" key={`${img.url}-${i}`}>
            <div className="shb-photo-img">
              <img src={resolveImg(img.url)} alt="" />
              <button type="button" className="shb-photo-x" onClick={() => onChange({ images: images.filter((_, j) => j !== i) })} aria-label="Remove photo"><X size={13} weight="bold" /></button>
            </div>
            {s.type === 'banner' ? (
              <select className="shb-input shb-photo-link" value={img.productId || ''} onChange={(e) => setImg(i, { productId: e.target.value || null })} aria-label="Opens product">
                <option value="">No link</option>
                {products.map((p) => <option key={p.id} value={p.id}>Opens: {p.name}</option>)}
              </select>
            ) : (
              <input className="shb-input shb-photo-link" value={img.caption || ''} maxLength={80} placeholder="Caption (optional)" onChange={(e) => setImg(i, { caption: e.target.value })} />
            )}
          </div>
        ))}
        {images.length < max && (
          <button type="button" className="shb-photo-add" onClick={() => input.current?.click()} disabled={busy > 0}>
            <UploadSimple size={22} />
            <span>{busy ? 'Uploading…' : 'Add photos'}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files || []); e.target.value = ''; }} />
      <small className="shb-hint">{s.type === 'banner' ? 'Wide photos look best (about 2 : 1). A photo can open one of your products.' : 'Photos of your shop, farm or workshop.'}</small>
    </div>
  );
}

function SpotlightField({ section: s, max, onChange, products, lookup }) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const ids = s.productIds || [];
  const picked = ids.map((id) => lookup.get(id)).filter(Boolean);
  const toggle = (id) => {
    if (ids.includes(id)) onChange({ productIds: ids.filter((x) => x !== id) });
    else if (ids.length >= max) toast(`Up to ${max} products in one spotlight.`);
    else onChange({ productIds: [...ids, id] });
  };
  const moveOne = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ productIds: next });
  };
  const shown = products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="shb-field">
      <span className="shb-label">Products <em>{ids.length}/{max}</em></span>
      {picked.length > 0 && (
        <ol className="shb-picked">
          {picked.map((p, i) => (
            <li key={p.id}>
              <img src={resolveImg(p.images?.[0]) || '/brand-icon.png'} alt="" />
              <span className="shb-picked-name">{p.name}<small>{peso(p.price)}</small></span>
              <button type="button" className="shb-icon-btn" onClick={() => moveOne(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" className="shb-icon-btn" onClick={() => moveOne(i, 1)} disabled={i === picked.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
              <button type="button" className="shb-icon-btn is-danger" onClick={() => toggle(p.id)} aria-label={`Remove ${p.name}`}><X size={14} /></button>
            </li>
          ))}
        </ol>
      )}
      {products.length === 0 ? (
        <p className="shb-hint">Your live products show up here to pick from.</p>
      ) : (
        <button type="button" className="shb-pick-btn" onClick={() => setPicking((v) => !v)}>
          <Plus size={15} weight="bold" /> {picking ? 'Done choosing' : ids.length ? 'Choose more products' : 'Choose products'}
        </button>
      )}
      {picking && (
        <div className="shb-picker">
          <label className="shb-search">
            <MagnifyingGlass size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your products" />
          </label>
          <ul>
            {shown.map((p) => {
              const on = ids.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" className={`shb-pick${on ? ' is-on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={on}>
                    <img src={resolveImg(p.images?.[0]) || '/brand-icon.png'} alt="" />
                    <span className="shb-picked-name">{p.name}<small>{peso(p.price)}</small></span>
                    <span className="shb-pick-check">{on && <Check size={12} weight="bold" />}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="shb-hint">No product matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
