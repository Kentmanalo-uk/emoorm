import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, Camera, Check, CircleNotch, Info, MagnifyingGlass, Minus, Package, Plus, Trash, Warning, X,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { uploadImage } from '../../lib/upload';
import { resolveImg } from '../../lib/media';
import { activeSalePrice } from '../../lib/variantPricing';
import { PACKAGE_KINDS, packageItemsLabel, productKind } from '../../lib/productKinds';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import ConfirmDialog from '../ui/ConfirmDialog';
import { BusyLabel } from '../ui/Spinner';
import './PhoneSaveBar.css';
import './ProductForm.css';
import './PackageForm.css';

/*
 * Create or edit a package: some of the shop's own products sold together at
 * one price. The seller picks from what they already sell instead of typing
 * it all again:
 *   1 What's in it           products and how many of each
 *   2 Name and price         what it is for, a name, one price, how many
 *   3 Photo and description  optional: the items' photos and an "Includes…"
 *                            line stand in when left empty
 *   4 Review                 what buyers will see
 * One step per screen with Back / Next at the bottom, on phones and
 * computers. Each step is a history entry (?step=2), so back goes back a step.
 * Computers show the steps together in one card, beside the review.
 */

const NAME_MIN = 2;
const NAME_MAX = 200;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;
const MAX_LINES = 20;
const MAX_EACH = 99;
const MAX_PHOTOS = 10;
const STOCK_MAX = 1000000;
const LAST_STEP = 4;
const STEP_TITLES = ['Products', 'Name and price', 'Photo', 'Review'];

// Picking what a package is for offers a name to start from.
const NAME_FOR_KIND = {
  FAMILY_MEAL: 'Family Meal Package',
  BIRTHDAY: 'Birthday Package',
  FIESTA: 'Fiesta Package',
  BREAKFAST: 'Breakfast Package',
  FARM_BUNDLE: 'Farm Produce Bundle',
  GIFT_SET: 'Local Product Gift Set',
};

// How far ahead buyers must order (details.noticeHours).
const NOTICE_HOURS = ['2', '6', '12', '24', '48', '72', '168'];

const KIND_TAGS = { READY_TO_EAT: 'Ready to eat', COOK_TO_ORDER: 'Paluto' };

/** "1 day", "2 days", "6 hours", "1 week". */
const aheadText = (hours) => {
  const h = Number(hours) || 0;
  if (h % 168 === 0) return h === 168 ? '1 week' : `${h / 168} weeks`;
  if (h % 24 === 0) return h === 24 ? '1 day' : `${h / 24} days`;
  return h === 1 ? '1 hour' : `${h} hours`;
};

/** ₱2,500 or ₱12.50. */
const peso = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

const priceOf = (p) => activeSalePrice(p) ?? (Number(p?.price) || 0);
const firstImage = (p) => (Array.isArray(p?.images) ? p.images.find(Boolean) : null) || null;
const isWhole = (v) => /^\d+$/.test(String(v).trim());

// What a package can hold: the shop's own products, but neither live animals
// nor other packages, nor ones buyers can't get any more.
const canHold = (p) => !!p && !p.deletedAt
  && !['PACKAGE', 'LIVESTOCK'].includes(productKind(p))
  && !['SUSPENDED', 'ARCHIVED'].includes(p.status);

const toFormState = (product) => {
  const d = product?.details || {};
  return {
    items: (Array.isArray(product?.packageItems) ? product.packageItems : [])
      .map((it) => ({ productId: it.productId, quantity: Number(it.quantity) || 1, product: it.product || null })),
    packageKind: d.packageKind || '',
    name: product?.name || '',
    price: product ? String(Number(product.price) || '') : '',
    stock: product ? String(product.stock ?? '') : '',
    noticeHours: Number(d.noticeHours) > 0 ? String(d.noticeHours) : '',
    fulfillment: product?.fulfillment || null,
    // The seller's own photos and words: empty while the items' stand in.
    images: product && !d.autoCover && Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    description: product && !d.autoDescription ? product.description || '' : '',
  };
};

/**
 * @param {Object} [product] - The package being edited (with packageItems)
 * @param {Object} [store] - The seller's shop (its fulfillmentMode)
 * @param {Array<{key, label}>} [sellBlockers] - What the shop still needs
 *   before buyers can order
 */
export default function PackageForm({ product = null, store = null, onCancel, onSaved, sellBlockers = [] }) {
  const editing = !!product;
  const isPhone = usePhoneLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [initial] = useState(() => toFormState(product));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const rootRef = useRef(null);

  // The step on screen.
  const step = Math.min(LAST_STEP, Math.max(1, parseInt(params.get('step') || '1', 10) || 1));
  const shows = (n) => step === n;

  // The shop's products to choose from: the first 100 (newest first); a
  // shop with more is searched on the server.
  const [shopProducts, setShopProducts] = useState(null);
  const [shopTotal, setShopTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  useEffect(() => {
    let live = true;
    axios.get('/products/my/products', { params: { pageSize: 100 } })
      .then((res) => {
        if (!live) return;
        setShopProducts(res.data || []);
        setShopTotal(res.pagination?.total || 0);
      })
      .catch((err) => {
        if (!live) return;
        setShopProducts([]);
        toast.error(err.message || 'Could not load your products');
      });
    return () => { live = false; };
  }, []);

  const searching = shopTotal > 100 ? query.trim() : '';
  useEffect(() => {
    if (!searching) return undefined;
    let live = true;
    const timer = window.setTimeout(() => {
      axios.get('/products/my/products', { params: { pageSize: 50, search: searching } })
        .then((res) => { if (live) setFound({ q: searching, list: res.data || [] }); })
        .catch(() => {});
    }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [searching]);
  const serverFound = searching && found?.q === searching ? found.list : null;

  // Couriers only take packages of weighed goods: say so when the shop uses them.
  const [couriersOn, setCouriersOn] = useState(false);
  useEffect(() => {
    let live = true;
    axios.get('/couriers/my-store')
      .then((res) => { if (live) setCouriersOn((res.data?.couriers || []).length > 0); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // A new step starts at the top of the screen.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // After a failed check, bring the first problem into view.
  useEffect(() => {
    if (!attempt) return;
    const first = rootRef.current?.querySelector('[data-invalid="true"]');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [attempt]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  /* ── what's in it ───────────────────────────────────────────── */
  const fresh = useMemo(() => new Map((shopProducts || []).map((p) => [p.id, p])), [shopProducts]);
  // An item as it is now (the list), or as the package last saved it.
  const itemOf = (line) => fresh.get(line.productId) || line.product || { id: line.productId, name: 'A product' };
  // An item deleted since (it can't be saved in), or one buyers can't see.
  const lineIssue = (line) => {
    const p = itemOf(line);
    if (p.deletedAt) return 'gone';
    if (['SUSPENDED', 'ARCHIVED'].includes(p.status)) return 'hidden';
    return null;
  };

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (p) => !q || String(p?.name || '').toLowerCase().includes(q);
    const loaded = serverFound
      ? serverFound.filter(canHold)
      : (shopProducts || []).filter((p) => canHold(p) && matches(p));
    const byId = new Map(loaded.map((p) => [p.id, p]));
    // The package's own items first, as it was opened; the rest stay put
    // while the seller ticks them.
    const first = initial.items
      .map((l) => byId.get(l.productId) || (l.product && matches(l.product) ? l.product : null))
      .filter(Boolean);
    const firstIds = new Set(first.map((p) => p.id));
    return [...first, ...loaded.filter((p) => !firstIds.has(p.id))];
  }, [query, serverFound, shopProducts, initial]);

  const leftOut = (shopProducts || []).filter((p) => !p.deletedAt && ['PACKAGE', 'LIVESTOCK'].includes(productKind(p))).length;
  const lineFor = (id) => form.items.find((l) => l.productId === id);
  const units = form.items.reduce((sum, l) => sum + l.quantity, 0);
  const worth = Math.round(form.items.reduce((sum, l) => sum + priceOf(itemOf(l)) * l.quantity, 0) * 100) / 100;

  const toggleItem = (p) => {
    if (lineFor(p.id)) {
      set('items', form.items.filter((l) => l.productId !== p.id));
      return;
    }
    if (form.items.length >= MAX_LINES) {
      toast.error(`A package holds up to ${MAX_LINES} different products`);
      return;
    }
    set('items', [...form.items, { productId: p.id, quantity: 1, product: p }]);
  };

  const setQuantity = (id, n) => {
    set('items', n < 1
      ? form.items.filter((l) => l.productId !== id)
      : form.items.map((l) => (l.productId === id ? { ...l, quantity: Math.min(MAX_EACH, n) } : l)));
  };

  /* ── name and price ─────────────────────────────────────────── */
  const pickKind = (key) => {
    const next = form.packageKind === key ? '' : key;
    const suggested = NAME_FOR_KIND[form.packageKind] || '';
    const name = form.name.trim();
    // The name follows the choice until the seller types their own.
    const follow = !name || name === suggested;
    setForm((f) => ({ ...f, packageKind: next, name: follow ? NAME_FOR_KIND[next] || '' : f.name }));
    if (follow && errors.name) setErrors((e) => ({ ...e, name: '' }));
  };

  const price = Number(form.price);
  const saved = worth > 0 && price > 0 ? Math.round((worth - price) * 100) / 100 : null;
  const percent = saved > 0 ? Math.round((saved / worth) * 100) : 0;

  const stockNumber = parseInt(form.stock, 10) || 0;
  const noticeChoices = form.noticeHours && !NOTICE_HOURS.includes(form.noticeHours)
    ? [...NOTICE_HOURS, form.noticeHours]
    : NOTICE_HOURS;

  // How buyers get it: asked only when the shop offers both.
  const shopMode = store?.fulfillmentMode || null;
  const askWay = !shopMode || shopMode === 'BOTH';
  const wayChoices = [
    { key: form.fulfillment === 'BOTH' ? 'BOTH' : null, label: 'Pickup or delivery', hint: 'Buyers choose' },
    { key: 'PICKUP', label: 'Pickup only', hint: 'Buyers pick it up from you' },
    { key: 'DELIVERY', label: 'Delivery only', hint: 'You bring it to buyers' },
  ];
  const wayOn = (key) => (key === null || key === 'BOTH' ? !form.fulfillment || form.fulfillment === 'BOTH' : form.fulfillment === key);
  const pickupOnly = shopMode === 'PICKUP' || (askWay && form.fulfillment === 'PICKUP');
  const deliveryOnly = shopMode === 'DELIVERY' || (askWay && form.fulfillment === 'DELIVERY');
  const wayText = pickupOnly ? 'Pickup only' : deliveryOnly ? 'Delivery only' : 'Pickup or delivery';
  const courierOk = form.items.length > 0 && form.items.every((l) => {
    const p = fresh.get(l.productId);
    return p && productKind(p) === 'REGULAR' && Number(p.weightGrams) > 0;
  });
  const courierNote = couriersOn && !pickupOnly && form.items.length > 0 && !courierOk;

  /* ── photo and words ────────────────────────────────────────── */
  const itemPhotos = form.items.map((l) => firstImage(itemOf(l))).filter(Boolean).slice(0, 4);
  const photos = form.images.length ? form.images : itemPhotos;
  const contents = packageItemsLabel(form.items.map((l) => ({ quantity: l.quantity, product: { name: itemOf(l).name } })));
  const autoDescription = contents ? `Includes: ${contents}` : '';

  /* ── checks and saving ──────────────────────────────────────── */
  const check = (f, only) => {
    const errs = {};
    const want = (n) => !only || only === n;
    if (want(1)) {
      const total = f.items.reduce((sum, l) => sum + l.quantity, 0);
      const gone = f.items.find((l) => lineIssue(l) === 'gone');
      if (!f.items.length) errs.items = 'Choose the products in this package.';
      else if (gone) errs.items = `${itemOf(gone).name} is no longer in your shop. Take it out of the package.`;
      else if (total < 2) errs.items = 'A package needs at least 2 items. Add another product, or more of this one.';
    }
    if (want(2)) {
      const name = f.name.trim();
      if (!name) errs.name = 'Give the package a name.';
      else if (name.length < NAME_MIN) errs.name = 'The name is too short.';
      if (!(Number(f.price) > 0)) errs.price = 'Enter the package price (more than ₱0).';
      if (String(f.stock).trim() === '') errs.stock = 'Say how many packages you can sell.';
      else if (!isWhole(f.stock) || Number(f.stock) > STOCK_MAX) errs.stock = 'Enter a whole number, like 5.';
    }
    if (want(3)) {
      const text = f.description.trim();
      if (text && text.length < DESCRIPTION_MIN) {
        errs.description = `Write a little more (at least ${DESCRIPTION_MIN} letters), or leave it empty.`;
      }
    }
    return errs;
  };

  const stepOf = (errs) => (errs.items ? 1 : errs.name || errs.price || errs.stock ? 2 : 3);

  const goStep = (n) => {
    const next = new URLSearchParams(params);
    if (n <= 1) next.delete('step');
    else next.set('step', String(n));
    navigate({ search: `?${next.toString()}` }, { state: location.state });
  };

  const goNext = () => {
    const errs = check(form, step);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error('Please check the highlighted part.');
      setAttempt((n) => n + 1);
      return;
    }
    goStep(step + 1);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const requestCancel = () => {
    if (dirty && !saving) setConfirmLeave(true);
    else onCancel?.();
  };

  const goBack = () => {
    if (step > 1) navigate(-1);
    else requestCancel();
  };

  const save = async (e) => {
    e?.preventDefault();
    if (saving) return;
    // Enter in a field moves on rather than saving early.
    if (step < LAST_STEP) {
      goNext();
      return;
    }
    const errs = check(form);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error('Please check the highlighted parts.');
      if (stepOf(errs) < step) navigate(stepOf(errs) - step);
      setAttempt((n) => n + 1);
      return;
    }

    const details = {};
    if (form.packageKind) details.packageKind = form.packageKind;
    if (Number(form.noticeHours) > 0) details.noticeHours = Number(form.noticeHours);
    const payload = {
      productType: 'PACKAGE',
      name: form.name.trim(),
      price: Number(form.price),
      stock: parseInt(form.stock, 10),
      packageItems: form.items.map(({ productId, quantity }) => ({ productId, quantity })),
      details,
      // Empty: the server writes "Includes: …" and uses the items' photos,
      // and keeps them up to date when the items change.
      description: form.description.trim(),
      images: form.images,
      // A shop that offers one way only: as the shop.
      fulfillment: askWay ? form.fulfillment : null,
    };
    if (editing) {
      // The count this form opened with, so packages sold meanwhile are kept.
      payload.stockWas = Number(product.stock) || 0;
    } else {
      // Packages are made a few at a time: only "sold out" is worth a warning.
      payload.lowStockThreshold = 0;
    }

    setSaving(true);
    try {
      const res = editing
        ? await axios.put(`/products/${product.id}`, payload)
        : await axios.post('/products', payload);
      onSaved?.(res?.data || null, { created: !editing });
    } catch (err) {
      toast.error(err.message || 'Could not save the package. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = editing ? 'Save changes' : 'Add package';

  return (
    <form className={`pkf pkf--steps${isPhone ? '' : ' pkf--wide'}`} ref={rootRef} onSubmit={save} noValidate>
      {!isPhone && (
        <button type="button" className="pkf-back" onClick={requestCancel}>
          <ArrowLeft size={16} /> Back to products
        </button>
      )}

      {isPhone ? (
        <div className="pkf-progress">
          <span>{editing ? 'Edit package' : 'New package'} · Step {step} of {LAST_STEP}</span>
          <div className="pkf-progress-bar" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <i key={n} className={n <= step ? 'is-on' : ''} />)}
          </div>
        </div>
      ) : (
        <ol className="pf-track" aria-label="Steps">
          {STEP_TITLES.map((title, i) => {
            const n = i + 1;
            const state = n === step ? 'is-current' : n < step ? 'is-done' : '';
            return (
              <li key={title} className={state}>
                <button type="button" onClick={() => n < step && navigate(n - step)} disabled={n >= step} aria-current={n === step ? 'step' : undefined}>
                  <span className="pf-track-num" aria-hidden="true">{n < step ? <Check size={13} weight="bold" /> : n}</span>
                  <span>{title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {shows(1) && (sellBlockers?.length > 0 ? (
        <div className="pkf-note pkf-note--draft">
          <Info size={16} />
          <span>
            Buyers can see this package, but can&apos;t order it until your shop is ready to sell.
            {' '}Still to do: {sellBlockers.map((b) => b.label).join(', ')}.
          </span>
        </div>
      ) : editing && product.status === 'APPROVED' && (
        <div className="pkf-note">
          <Info size={16} />
          <span>This package is live. Your changes show to buyers as soon as you save.</span>
        </div>
      ))}

      <div className="pkf-card">
        <div className="pkf-main">
          {/* 1 · What's in it */}
          {shows(1) && (
            <Section
              n={1}
              title="What's in the package?"
              hint="Choose from the products you already sell, then set how many of each."
              invalid={!!errors.items}
            >
              <div className="pkf-search">
                <MagnifyingGlass size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your products"
                  aria-label="Search your products"
                  enterKeyHint="search"
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={12} weight="bold" />
                  </button>
                )}
              </div>

              {shopProducts === null ? (
                <ul className="pkf-picks" aria-busy="true">
                  {[0, 1, 2].map((i) => <li key={i} className="pkf-pick pkf-pick--loading" />)}
                </ul>
              ) : choices.length === 0 ? (
                query ? (
                  <p className="pkf-empty">No products match &ldquo;{query}&rdquo;.</p>
                ) : (
                  <div className="pkf-empty pkf-empty--first">
                    <Package size={28} />
                    <strong>Add the products you sell first</strong>
                    <span>Then come back and put some of them together here.</span>
                  </div>
                )
              ) : (
                <ul className="pkf-picks">
                  {choices.map((p) => {
                    const line = lineFor(p.id);
                    const issue = line ? lineIssue(line) : null;
                    return (
                      <PickRow
                        key={p.id}
                        product={p}
                        line={line}
                        tag={KIND_TAGS[productKind(p)] || (p.status === 'HIDDEN' ? 'Hidden' : '')}
                        warning={issue === 'gone'
                          ? 'No longer in your shop. Take it out.'
                          : issue === 'hidden' ? 'Buyers can\'t see this product now.' : ''}
                        onToggle={() => toggleItem(p)}
                        onQuantity={(n) => setQuantity(p.id, n)}
                      />
                    );
                  })}
                </ul>
              )}
              {leftOut > 0 && !query && (
                <p className="pkf-hint">Live animals and other packages can&apos;t go in a package.</p>
              )}

              <div className={`pkf-total${form.items.length ? ' is-on' : ''}`} aria-live="polite">
                {form.items.length ? (
                  <>
                    <span>{units} {units === 1 ? 'item' : 'items'} in the package</span>
                    <strong>Worth {peso(worth)} if bought separately</strong>
                  </>
                ) : (
                  <span>Nothing chosen yet. Tap the products that go in it.</span>
                )}
              </div>
              <FieldError text={errors.items} />
            </Section>
          )}

          {/* 2 · Name and price */}
          {shows(2) && (
            <Section n={2} title="Name and price" hint="Give it a name and one price for everything inside.">
              <Field label="What is the package for?" tag="Optional" hint="Pick one and we'll suggest a name.">
                <div className="pkf-kinds" role="radiogroup" aria-label="What the package is for">
                  {PACKAGE_KINDS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      role="radio"
                      aria-checked={form.packageKind === k.key}
                      className={`pkf-kind${form.packageKind === k.key ? ' is-on' : ''}`}
                      onClick={() => pickKind(k.key)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Package name" tag="Required" error={errors.name} htmlFor="pkf-name">
                <input
                  id="pkf-name"
                  className="pkf-input"
                  value={form.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Fiesta Food Package"
                  autoComplete="off"
                />
              </Field>

              <Field label="Package price" tag="Required" error={errors.price} htmlFor="pkf-price">
                <div className="pkf-money">
                  <em>₱</em>
                  <input
                    id="pkf-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder="e.g. 2500"
                  />
                </div>
                {!errors.price && worth > 0 && (
                  saved === null ? (
                    <p className="pkf-hint">Bought one by one, these cost {peso(worth)}.</p>
                  ) : saved > 0 ? (
                    <p className="pkf-save is-good">
                      <Check size={15} weight="bold" />
                      Buyers save {peso(saved)}{percent >= 1 ? ` (${percent}%)` : ''} compared with buying each one ({peso(worth)}).
                    </p>
                  ) : saved === 0 ? (
                    <p className="pkf-save">Same as buying each one. A lower price gives buyers a reason to choose the package.</p>
                  ) : (
                    <p className="pkf-save is-warn">
                      <Warning size={15} weight="fill" />
                      That is {peso(-saved)} more than buying each one ({peso(worth)}).
                    </p>
                  )
                )}
              </Field>

              <Field
                label="How many packages can you sell?"
                tag="Required"
                error={errors.stock}
                htmlFor="pkf-stock"
                hint="Counted on its own: selling a package doesn't lower your products' stock."
              >
                <div className="pkf-count">
                  <button
                    type="button"
                    aria-label="One less"
                    disabled={stockNumber <= 0}
                    onClick={() => set('stock', String(Math.max(0, stockNumber - 1)))}
                  >
                    <Minus size={18} weight="bold" />
                  </button>
                  <input
                    id="pkf-stock"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={(e) => set('stock', e.target.value)}
                    placeholder="e.g. 5"
                  />
                  <button
                    type="button"
                    aria-label="One more"
                    onClick={() => set('stock', String(Math.min(STOCK_MAX, stockNumber + 1)))}
                  >
                    <Plus size={18} weight="bold" />
                  </button>
                </div>
              </Field>

              <Field
                label="How early must buyers order?"
                tag="Optional"
                htmlFor="pkf-notice"
                hint="Useful for food you cook for the order."
              >
                <select
                  id="pkf-notice"
                  className="pkf-input pkf-select"
                  value={form.noticeHours}
                  onChange={(e) => set('noticeHours', e.target.value)}
                >
                  <option value="">No need: buyers can order any time</option>
                  {noticeChoices.map((h) => <option key={h} value={h}>At least {aheadText(h)} ahead</option>)}
                </select>
              </Field>

              <Field
                label="How buyers get it"
                tag={askWay ? 'Optional' : null}
                hint={askWay ? null : `Your shop offers ${shopMode === 'PICKUP' ? 'pickup' : 'delivery'} only.`}
              >
                {askWay ? (
                  <div className="pkf-ways" role="radiogroup" aria-label="How buyers get it">
                    {wayChoices.map((w) => (
                      <button
                        key={w.label}
                        type="button"
                        role="radio"
                        aria-checked={wayOn(w.key)}
                        className={`pkf-way${wayOn(w.key) ? ' is-on' : ''}`}
                        onClick={() => set('fulfillment', w.key)}
                      >
                        <span className="pkf-radio" aria-hidden="true" />
                        <span><strong>{w.label}</strong><small>{w.hint}</small></span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="pkf-fixed">{shopMode === 'PICKUP' ? 'Buyers pick it up from you.' : 'You deliver it to buyers.'}</div>
                )}
                {courierNote && (
                  <p className="pkf-hint pkf-hint--note">
                    <Info size={14} />
                    Couriers can&apos;t take this package: it has cooked food or items with no weight. Buyers get it by pickup or your own delivery.
                  </p>
                )}
              </Field>
            </Section>
          )}

          {/* 3 · Photo and description */}
          {shows(3) && (
            <Section
              n={3}
              title="Photo and description"
              tag="Optional"
              hint="Skip this and buyers see your items' photos and a list of what's inside."
              invalid={!!errors.description}
            >
              <Field label="Package photo" tag="Optional">
                <PackagePhotos
                  images={form.images}
                  itemPhotos={itemPhotos}
                  onChange={(imgs) => set('images', imgs)}
                />
              </Field>
              <Field
                label="Description"
                tag="Optional"
                htmlFor="pkf-description"
                error={errors.description}
                aside={`${form.description.length}/${DESCRIPTION_MAX}`}
                hint={autoDescription ? `Leave it empty and buyers see: "${autoDescription}"` : null}
              >
                <textarea
                  id="pkf-description"
                  className="pkf-input pkf-textarea"
                  rows={4}
                  maxLength={DESCRIPTION_MAX}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="e.g. Good for 15 to 20 people. Perfect for birthdays and fiestas."
                />
              </Field>
            </Section>
          )}
        </div>

        {/* 4 · Review */}
        {shows(4) && (
          <aside className="pkf-side">
            <Section n={4} title="Review" hint="This is how buyers will see your package.">
              <Preview
                photos={photos}
                kind={PACKAGE_KINDS.find((k) => k.key === form.packageKind && k.key !== 'OTHER')?.label}
                name={form.name.trim()}
                price={price}
                worth={worth}
                saved={saved}
                items={form.items.map((l) => ({ ...l, item: itemOf(l) }))}
                stock={form.stock === '' ? null : stockNumber}
                ahead={Number(form.noticeHours) > 0 ? aheadText(form.noticeHours) : ''}
                way={wayText}
                description={form.description.trim() || autoDescription}
                onEdit={(n) => navigate(n - step)}
              />
            </Section>
          </aside>
        )}
      </div>

      {isPhone ? (
        <>
          <div className="pkf-bar-space" aria-hidden="true" />
          <div className="scm-savebar pkf-bar" role="group" aria-label="Steps">
            <button type="button" className="scm-savebar-btn scm-savebar-cancel" onClick={goBack} disabled={saving}>
              {step > 1 ? 'Back' : 'Cancel'}
            </button>
            {step < LAST_STEP ? (
              <button type="button" className="scm-savebar-btn scm-savebar-save" onClick={goNext}>
                {step === 3 && !form.images.length && !form.description.trim() ? 'Skip' : 'Next'}
              </button>
            ) : (
              <button type="submit" className="scm-savebar-btn scm-savebar-save" disabled={saving}>
                {saving ? <BusyLabel>Saving…</BusyLabel> : saveLabel}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="pkf-footer">
          <button type="button" className="pkf-btn pkf-btn--ghost" onClick={goBack} disabled={saving}>
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          {step < LAST_STEP ? (
            <button type="button" className="pkf-btn pkf-btn--primary" onClick={goNext}>
              {step === 3 && !form.images.length && !form.description.trim() ? 'Skip' : 'Next'} <ArrowRight size={17} weight="bold" />
            </button>
          ) : (
            <button type="submit" className="pkf-btn pkf-btn--primary" disabled={saving}>
              {saving ? <CircleNotch size={17} className="pkf-spin" /> : <Check size={17} weight="bold" />}
              {saving ? <BusyLabel>Saving…</BusyLabel> : saveLabel}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="What you entered for this package will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => { setConfirmLeave(false); onCancel?.(); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </form>
  );
}

function Section({ n, title, tag, hint, invalid, children }) {
  return (
    <section className="pkf-section" data-invalid={invalid ? 'true' : undefined}>
      <header className="pkf-section-head">
        <span className="pkf-num" aria-hidden="true">{n}</span>
        <div>
          <h2>
            {title}
            {tag && <em className="pkf-tag">{tag}</em>}
          </h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      <div className="pkf-section-body">{children}</div>
    </section>
  );
}

function Field({ label, tag, error, hint, aside, htmlFor, children }) {
  return (
    <div className={`pkf-field${error ? ' has-error' : ''}`} data-invalid={error ? 'true' : undefined}>
      <div className="pkf-label-row">
        {htmlFor
          ? <label className="pkf-label" htmlFor={htmlFor}>{label}</label>
          : <span className="pkf-label">{label}</span>}
        {tag && <em className={`pkf-tag${tag === 'Required' ? ' pkf-tag--req' : ''}`}>{tag}</em>}
        {aside && <span className="pkf-aside">{aside}</span>}
      </div>
      {children}
      {error ? <FieldError text={error} /> : hint && <p className="pkf-hint">{hint}</p>}
    </div>
  );
}

function FieldError({ text }) {
  if (!text) return null;
  return <p className="pkf-error" role="alert">{text}</p>;
}

function Thumb({ src, className = 'pkf-thumb' }) {
  if (!src) {
    return <span className={`${className} pkf-thumb--none`} aria-hidden="true"><Package size={18} /></span>;
  }
  return <img src={resolveImg(src) || src} alt="" className={className} loading="lazy" />;
}

/** One of the shop's products: tap to put it in (or take it out), then how many. */
function PickRow({ product, line, tag, warning, onToggle, onQuantity }) {
  const on = !!line;
  return (
    <li className={`pkf-pick${on ? ' is-on' : ''}${warning ? ' has-warning' : ''}`}>
      <button type="button" className="pkf-pick-main" onClick={onToggle} aria-pressed={on}>
        <span className="pkf-check" aria-hidden="true">{on && <Check size={13} weight="bold" />}</span>
        <Thumb src={firstImage(product)} />
        <span className="pkf-pick-text">
          <strong>{product.name}</strong>
          <small>
            {peso(priceOf(product))} each
            {tag && <em>{tag}</em>}
          </small>
          {warning && <span className="pkf-pick-warn">{warning}</span>}
        </span>
      </button>
      {on && <Stepper value={line.quantity} onChange={onQuantity} label={product.name} />}
    </li>
  );
}

function Stepper({ value, onChange, label }) {
  // What is being typed: a cleared box waits for a number.
  const [draft, setDraft] = useState(null);
  const change = (n) => {
    setDraft(null);
    onChange(n);
  };
  return (
    <div className="pkf-stepper" role="group" aria-label={`How many ${label}`}>
      <button
        type="button"
        onClick={() => change(value - 1)}
        aria-label={value <= 1 ? `Take ${label} out` : 'One less'}
        className={value <= 1 ? 'is-remove' : ''}
      >
        {value <= 1 ? <Trash size={15} /> : <Minus size={15} weight="bold" />}
      </button>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        max={MAX_EACH}
        step="1"
        value={draft ?? value}
        aria-label={`How many ${label}`}
        onChange={(e) => {
          const raw = e.target.value;
          const n = parseInt(raw, 10);
          if (raw === '' || !Number.isFinite(n)) {
            setDraft('');
            return;
          }
          change(Math.min(MAX_EACH, Math.max(1, n)));
        }}
        onBlur={() => setDraft(null)}
      />
      <button type="button" onClick={() => change(value + 1)} disabled={value >= MAX_EACH} aria-label="One more">
        <Plus size={15} weight="bold" />
      </button>
    </div>
  );
}

/** The seller's own photos, or the items' photos standing in until they add one. */
function PackagePhotos({ images, itemPhotos, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const list = Array.isArray(images) ? images : [];

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    const room = MAX_PHOTOS - list.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos`);
      return;
    }
    const chosen = files.slice(0, room);
    setUploading(chosen.length);
    const uploaded = [];
    for (const file of chosen) {
      try {
        const res = await uploadImage(file);
        uploaded.push(res.url);
      } catch (err) {
        toast.error(err.message || 'A photo could not be uploaded');
      }
      setUploading((n) => Math.max(0, n - 1));
    }
    setUploading(0);
    if (uploaded.length) onChange([...list, ...uploaded]);
  };

  const pick = () => inputRef.current?.click();
  const makeCover = (idx) => {
    const next = [...list];
    const [moved] = next.splice(idx, 1);
    onChange([moved, ...next]);
  };

  return (
    <div className="pkf-photos-wrap">
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple hidden onChange={handleFiles} />
      {list.length === 0 && !uploading ? (
        <div className="pkf-autocover">
          {itemPhotos.length > 0 && (
            <div className="pkf-autocover-pics">
              {itemPhotos.map((src, i) => <Thumb key={`${src}-${i}`} src={src} className="pkf-autocover-pic" />)}
            </div>
          )}
          <p>{itemPhotos.length ? 'For now, buyers see these photos of your items.' : 'Buyers see your items\' photos until you add one.'}</p>
          <button type="button" className="pkf-photo-btn" onClick={pick}>
            <Camera size={18} /> Add your own photo
          </button>
        </div>
      ) : (
        <>
          <div className="pkf-photos">
            {list.map((src, idx) => (
              <div key={`${src}-${idx}`} className={`pkf-photo${idx === 0 ? ' is-cover' : ''}`}>
                <img src={resolveImg(src) || src} alt={`Package photo ${idx + 1}`} />
                <button type="button" className="pkf-photo-remove" onClick={() => onChange(list.filter((_, i) => i !== idx))} aria-label={`Remove photo ${idx + 1}`}>
                  <X size={14} weight="bold" />
                </button>
                {idx === 0
                  ? <span className="pkf-photo-cover">Cover</span>
                  : <button type="button" className="pkf-photo-makecover" onClick={() => makeCover(idx)}>Make cover</button>}
              </div>
            ))}
            {uploading > 0 && (
              <div className="pkf-photo pkf-photo--loading" aria-live="polite">
                <CircleNotch size={22} className="pkf-spin" />
                <span>Uploading…</span>
              </div>
            )}
            {list.length + uploading < MAX_PHOTOS && !uploading && (
              <button type="button" className="pkf-photo-add" onClick={pick}>
                <Camera size={22} />
                <span>Add photo</span>
              </button>
            )}
          </div>
          {!uploading && (
            <button type="button" className="pkf-link" onClick={() => onChange([])}>
              Use my items&apos; photos instead
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Roughly what buyers see on the package's page. */
function Preview({ photos, kind, name, price, worth, saved, items, stock, ahead, way, description, onEdit }) {
  const [cover, ...rest] = photos;
  return (
    <div className="pkf-preview">
      <div className="pkf-preview-photo">
        {cover ? <img src={resolveImg(cover) || cover} alt="" /> : <Package size={40} aria-hidden="true" />}
        <span className="pkf-preview-badge"><Package size={13} weight="fill" /> Package</span>
      </div>
      {rest.length > 0 && (
        <div className="pkf-preview-thumbs">
          {rest.slice(0, 4).map((src, i) => <Thumb key={`${src}-${i}`} src={src} className="pkf-preview-thumb" />)}
        </div>
      )}
      <div className="pkf-preview-body">
        {kind && <span className="pkf-preview-kind">{kind}</span>}
        <h3 className={name ? '' : 'is-empty'}>{name || 'Your package name'}</h3>
        <p className="pkf-preview-price">
          <strong>{price > 0 ? peso(price) : '₱ —'}</strong>
          <span>/ package</span>
        </p>
        {saved > 0 && (
          <p className="pkf-preview-save">
            <s>{peso(worth)}</s> Save {peso(saved)}
          </p>
        )}

        <div className="pkf-preview-block">
          <div className="pkf-preview-head">
            <h4>What&apos;s included</h4>
            {onEdit && <button type="button" className="pkf-link" onClick={() => onEdit(1)}>Change</button>}
          </div>
          {items.length ? (
            <ul className="pkf-preview-items">
              {items.map((l) => (
                <li key={l.productId}>
                  <Thumb src={firstImage(l.item)} className="pkf-preview-item-pic" />
                  <span><b>{l.quantity} x</b> {l.item.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pkf-preview-none">No products chosen yet.</p>
          )}
        </div>

        <ul className="pkf-preview-facts">
          {stock !== null && <li>{stock > 0 ? `${stock} ${stock === 1 ? 'package' : 'packages'} available` : 'Sold out'}</li>}
          {ahead && <li>Order at least {ahead} ahead</li>}
          <li>{way}</li>
        </ul>

        {description && (
          <div className="pkf-preview-block">
            <div className="pkf-preview-head">
              <h4>Description</h4>
              {onEdit && <button type="button" className="pkf-link" onClick={() => onEdit(3)}>Change</button>}
            </div>
            <p className="pkf-preview-desc">{description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
