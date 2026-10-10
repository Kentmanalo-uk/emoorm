import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CircleNotch, Info, ArrowLeft, Check, CheckCircle, CaretDown, Package, Plus,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import useAppSettings from '../../hooks/useAppSettings';
import { productKind, headsLabel } from '../../lib/productKinds';
import ConfirmDialog from '../ui/ConfirmDialog';
import { BusyLabel } from '../ui/Spinner';
import PhotoPicker from './product-form/PhotoPicker';
import CategoryPicker from './product-form/CategoryPicker';
import ChoiceGroup from './product-form/ChoiceGroup';
import KindDetails from './product-form/KindDetails';
import MoreDetails from './product-form/MoreDetails';
import PreviewCard from './product-form/PreviewCard';
import WayField from './product-form/WayField';
import {
  Card, Field, MoneyInput, RadioCards, Stepper, Switch,
} from './product-form/parts';
import {
  DETAIL_TITLES, EXAMPLES, RETURN_POLICIES, MAX_GROUPS, NAME_MAX, DESCRIPTION_MAX,
  CHOICE_TYPES, FOOD_CHOICE_TYPES,
  toFormState, kindOptions, switchKind, kindOffers, withDrafts, pricedBy, priceSpan, buildPayload,
  checkAll, hasErrors, cardsWithErrors, draftProduct, policyModeFor, guessKind,
  emptyGroup, mergeChoices, peso,
} from './product-form/formState';
import './PhoneSaveBar.css';
import './ProductForm.css';

/*
 * Add / edit a product (every kind but packages, which have their own form)
 * on one page, top to bottom, in a few white cards: photos, name and
 * category, price and how many, choices (only when switched on), how buyers
 * get it, the kind's own questions (food, animals) and "More details",
 * closed until wanted. One button at the bottom saves it.
 */

const FOOD = ['READY_TO_EAT', 'COOK_TO_ORDER'];
const RECENT_MAX = 5;

/** A short line under the category on what was set for this kind. */
const KIND_NOTES = {
  REGULAR: 'Sold from your stock. Say below how many you have.',
  READY_TO_EAT: 'Cooked food you sell today. A few questions about it are added below.',
  COOK_TO_ORDER: 'You cook it after someone orders. Cooking questions are added below.',
  LIVESTOCK: 'A live animal, sold per head. Questions about the animal are added below.',
};

const PRICE_WORDS = {
  REGULAR: { label: 'Price', hint: 'Example: 85' },
  READY_TO_EAT: { label: 'Price of one serving', hint: 'Example: 120' },
  COOK_TO_ORDER: { label: 'Price', hint: 'Bigger sizes cost more? Set them in "About the cooking" below.' },
  LIVESTOCK: { label: 'Price for one animal', hint: 'Buyers can offer a price, and you agree in chat.' },
};

const WAY_TEXT = { PICKUP: 'Pickup only', DELIVERY: 'Delivery only' };

const readRecent = (key) => {
  if (!key) return [];
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const keepRecent = (key, id) => {
  if (!key || !id) return;
  try {
    const list = [id, ...readRecent(key).filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* private window: nothing to remember */
  }
};

/**
 * @param {Object} [product] - The product being edited
 * @param {Array} categories - Categories to choose from (with their kind)
 * @param {Array} [recentProducts] - The seller's products, for "Used before"
 * @param {Array<{key, label}>} [sellBlockers] - What the shop still needs
 *   before it can sell; while any are left, buyers see products but cannot order.
 */
export default function ProductForm({
  product = null, categories = [], recentProducts = [], onCancel, onSaved, sellBlockers = [],
}) {
  const editing = !!product;
  const isPhone = usePhoneLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutletContext();
  const shopMode = outlet?.store?.fulfillmentMode || null;
  const { settings } = useAppSettings();
  const todayOn = settings?.availableTodayEnabled !== false;
  const recentKey = outlet?.store?.id ? `pf:recent-categories:${outlet.store.id}` : null;

  const [initial, setInitial] = useState(() => toFormState(product));
  const [form, setForm] = useState(initial);
  const [hasOptions, setHasOptions] = useState(initial.variations.length > 0);
  const [policyMode, setPolicyMode] = useState(() => policyModeFor(initial.returnPolicy));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // What leaving is for: 'cancel' or 'package' (asked while there are changes).
  const [confirmLeave, setConfirmLeave] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  // A new live animal just saved: offer to list another like it.
  const [savedAnimal, setSavedAnimal] = useState(null);
  const lastSaved = useRef(null);
  const rootRef = useRef(null);

  // A shop that ships with couriers needs every regular product's weight:
  // it is how the shipping fee is worked out.
  const [couriersOn, setCouriersOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    axios.get('/couriers/my-store')
      .then((res) => { if (!cancelled) setCouriersOn((res.data?.couriers || []).length > 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Phones: the form takes the whole screen, so the bottom tab bar steps
  // aside for the save bar.
  useEffect(() => {
    document.body.classList.add('pf-open');
    return () => document.body.classList.remove('pf-open');
  }, []);

  // After a save with problems, bring the first one into view.
  useEffect(() => {
    if (!attempt) return;
    const first = rootRef.current?.querySelector('[data-invalid="true"]');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [attempt]);

  // Categories used before: remembered on this device, then the shop's
  // other products, newest first.
  const recent = useMemo(() => {
    const fromProducts = [...(recentProducts || [])]
      .filter((p) => p?.categoryId && productKind(p) !== 'PACKAGE')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .map((p) => p.categoryId);
    return [...new Set([...readRecent(recentKey), ...fromProducts])].slice(0, RECENT_MAX);
  }, [recentProducts, recentKey]);

  /* ── kind ─────────────────────────────────────────────────────── */
  const originalKind = product ? productKind(product) : null;
  const optionsFor = (category) => kindOptions(category, originalKind)
    .filter((k) => k.key !== 'READY_TO_EAT' || todayOn || originalKind === 'READY_TO_EAT');
  const category = categories.find((c) => c.id === form.categoryId) || product?.category || null;
  const kindOpts = form.categoryId ? optionsFor(category) : [];
  const kind = form.kind;
  const ctx = { kind, kindAsked: kindOpts.length > 1, hasOptions, couriersOn, editing };
  const offers = kindOffers(kind);
  const by = pricedBy(form, ctx);
  const span = priceSpan(form, ctx);
  const stockedGroup = kind === 'REGULAR' && hasOptions ? form.variations.find((g) => g.stocked && g.choices.length) : null;

  const pickPolicy = (key) => {
    setPolicyMode(key);
    if (key === 'custom') {
      if (policyModeFor(form.returnPolicy) !== 'custom') setForm((f) => ({ ...f, returnPolicy: '' }));
    } else {
      setForm((f) => ({ ...f, returnPolicy: RETURN_POLICIES.find((p) => p.key === key)?.text || '' }));
    }
  };

  const clearPolicy = () => {
    setPolicyMode(null);
    setForm((f) => ({ ...f, returnPolicy: '' }));
  };

  // Switch the kind on a copy of the form (base) and keep it.
  const applyKind = (base, next) => {
    const { form: switched, hasOptions: has } = switchKind(base, next, hasOptions);
    let out = switched;
    // Cooked food: the fresh-food returns rule fits, unless one is chosen.
    if (next !== form.kind && FOOD.includes(next) && !editing && !out.returnPolicy) {
      out = { ...out, returnPolicy: RETURN_POLICIES.find((p) => p.key === 'perishable').text };
      setPolicyMode('perishable');
    }
    setForm(out);
    setHasOptions(has);
  };

  // Choosing a category sets the kind: its only one, the one already
  // picked, or the one the name points to.
  const onCategory = (id) => {
    const opts = id ? optionsFor(categories.find((c) => c.id === id)) : [];
    let next = form.kind;
    if (opts.length === 1) next = opts[0].key;
    else if (!(form.kindPicked && opts.some((o) => o.key === form.kind))) next = guessKind(form.name, opts);
    const picked = opts.length > 1 && form.kindPicked && next === form.kind;
    applyKind({ ...form, categoryId: id, kindPicked: picked }, next);
    setErrors((e) => ({ ...e, categoryId: '', kind: '' }));
  };

  const onKind = (next) => {
    applyKind({ ...form, kindPicked: true }, next);
    setErrors((e) => ({ ...e, kind: '', price: '' }));
  };

  /* ── fields ───────────────────────────────────────────────────── */
  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  // Several fields at once; their problems are cleared.
  const patch = (fields) => {
    setForm((f) => ({ ...f, ...fields }));
    if (Object.keys(fields).some((k) => errors[k])) {
      setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(fields).map((k) => [k, ''])) }));
    }
  };

  // Live animals: "males and females" only fits more than one.
  const setHeads = (v) => {
    if ((parseInt(v, 10) || 0) <= 1 && form.sex === 'MIXED') patch({ stock: v, sex: '' });
    else set('stock', v);
  };

  /* ── choices ─────────────────────────────────────────────────── */
  const updateGroup = (key, change) => {
    setForm((f) => ({
      ...f,
      variations: f.variations.map((g) => (g.key === key ? { ...g, ...(typeof change === 'function' ? change(g) : change) } : g)),
    }));
    setErrors((e) => (e[`group-${key}`] || e.price || e.stock || e.options
      ? { ...e, [`group-${key}`]: '', price: '', stock: '', options: '' }
      : e));
  };

  const groupActions = {
    add: () => {
      if (form.variations.length >= MAX_GROUPS) return;
      setForm((f) => ({ ...f, variations: [...f.variations, emptyGroup()] }));
    },
    remove: (key) => {
      if (!form.variations.some((g) => g.key !== key)) setHasOptions(false);
      setForm((f) => ({ ...f, variations: f.variations.filter((g) => g.key !== key) }));
    },
    addChoices: (key, raw) => {
      updateGroup(key, (g) => ({ choices: mergeChoices(g.choices, raw ?? g.draft), draft: raw === undefined ? '' : g.draft }));
    },
    removeChoice: (key, choice) => {
      updateGroup(key, (g) => {
        const prices = { ...g.prices };
        const stocks = { ...g.stocks };
        delete prices[choice];
        delete stocks[choice];
        const filled = (o) => Object.values(o).some((v) => String(v ?? '').trim() !== '');
        return {
          choices: g.choices.filter((c) => c !== choice), prices, stocks, priced: filled(prices), stocked: filled(stocks),
        };
      });
    },
  };

  const chooseHasOptions = (yes) => {
    setHasOptions(yes);
    if (yes && form.variations.length === 0) setForm((f) => ({ ...f, variations: [emptyGroup()] }));
    setErrors((e) => ({ ...e, options: '' }));
  };

  /* ── leaving ──────────────────────────────────────────────────── */
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  // Animals saved from this form reach the list as it closes.
  const leave = () => {
    if (lastSaved.current) onSaved?.(lastSaved.current, { created: true });
    else onCancel?.();
  };
  const toPackage = () => navigate('/seller/products/new?type=package', { replace: true, state: location.state });

  const requestCancel = () => {
    if (dirty && !saving) setConfirmLeave('cancel');
    else leave();
  };
  const requestPackage = () => {
    if (dirty) setConfirmLeave('package');
    else toPackage();
  };

  /* ── save ─────────────────────────────────────────────────────── */
  const save = async (e) => {
    e?.preventDefault();
    if (saving) return;
    // Typed but not added choices count; keep them merged in.
    const state = withDrafts(form);
    if (state !== form) setForm(state);
    const { errors: errs } = checkAll(state, ctx);
    setErrors(errs);
    if (hasErrors(errs)) {
      toast.error('Some parts need fixing. Look for the red words.');
      if (cardsWithErrors(errs).more) setMoreOpen(true);
      setAttempt((n) => n + 1);
      return;
    }

    const payload = buildPayload(state, { kind, hasOptions, editing, product });
    setSaving(true);
    try {
      const res = editing
        ? await axios.put(`/products/${product.id}`, payload)
        : await axios.post('/products', payload);
      const saved = res?.data || null;
      keepRecent(recentKey, state.categoryId);
      if (saved?.todayPostError) toast.error(saved.todayPostError, { duration: 7000 });
      if (!editing && kind === 'LIVESTOCK') {
        lastSaved.current = saved;
        setSavedAnimal(saved);
        window.scrollTo({ top: 0 });
        return;
      }
      onSaved?.(saved, { created: !editing });
    } catch (err) {
      toast.error(err.message || 'Could not save the product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // The animal's details again, for one more listing: new photos and name.
  const addAnother = () => {
    const next = { ...form, name: '', images: [], kindPicked: true };
    setForm(next);
    setInitial(next);
    setErrors({});
    setSavedAnimal(null);
    window.scrollTo({ top: 0 });
  };

  /* ── which cards are filled in ────────────────────────────────── */
  const live = cardsWithErrors(checkAll(withDrafts(form), ctx).errors);
  const showStock = !kind || kind === 'REGULAR' || kind === 'LIVESTOCK';
  const showOptions = !!kind && offers.choices;
  const showWay = kind !== 'LIVESTOCK';
  const detailTitle = DETAIL_TITLES[kind];
  const food = FOOD.includes(kind);
  const types = food ? FOOD_CHOICE_TYPES : CHOICE_TYPES;
  const priceTitle = kind === 'LIVESTOCK' ? 'Price and how many animals' : showStock ? 'Price and how many' : 'Price';
  const optionsTitle = food ? 'Flavors or sizes' : 'Sizes or colors';

  const cards = [
    { id: 'photos', title: 'Photos', done: form.images.length > 0 },
    { id: 'about', title: 'Name and category', done: !live.about },
    { id: 'price', title: priceTitle, done: !live.price },
    showOptions && { id: 'options', title: optionsTitle, done: hasOptions && !live.options, optional: true },
    showWay && { id: 'way', title: 'How buyers get it', done: !live.way },
    detailTitle && { id: 'details', title: detailTitle, done: !live.details },
  ].filter(Boolean);
  const doneOf = Object.fromEntries(cards.map((c) => [c.id, c.done]));
  const left = cards.filter((c) => !c.optional && !c.done).length;

  const goToCard = (id) => {
    document.getElementById(`pf-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── what buyers will see ─────────────────────────────────────── */
  const draft = draftProduct(form, ctx);
  const askWay = !shopMode || shopMode === 'BOTH';
  const wayText = WAY_TEXT[askWay ? form.fulfillment : shopMode] || 'Pickup or delivery';
  const todayQty = kind === 'READY_TO_EAT' && !editing && form.postToday ? parseInt(form.todayQty, 10) || 0 : 0;
  const ex = EXAMPLES[kind] || EXAMPLES.REGULAR;
  const priceWords = PRICE_WORDS[kind] || PRICE_WORDS.REGULAR;
  const saveLabel = editing ? 'Save changes' : 'Put on sale';
  const policy = RETURN_POLICIES.find((p) => p.key === policyMode);
  const moreSummary = [
    kind === 'REGULAR' && form.size.trim() && form.size.trim(),
    !by && form.saleOn && Number(form.salePrice) > 0 && `On sale at ${peso(form.salePrice)}`,
    !by && form.priceTiers.some((t) => t.minQty !== '' && t.price !== '') && 'Cheaper when buying many',
    policy ? `Returns: ${policy.title}` : policyMode === 'custom' && 'Returns: your own words',
  ].filter(Boolean).join(' · ') || 'Sale price, cheaper for many, returns';

  if (savedAnimal) {
    const unitPrice = Number(savedAnimal.price) || 0;
    return (
      <div className="pf" ref={rootRef}>
        <section className="pf-done">
          <CheckCircle size={44} weight="fill" className="pf-done-icon" aria-hidden="true" />
          <h2>{savedAnimal.name} is on sale</h2>
          <p className="pf-done-facts">{headsLabel(savedAnimal.stock)} · {peso(unitPrice)} for one</p>
          <p>
            Have more animals that are different, like another age, sex or weight? List each one on its own.
            We keep these answers, so you only add the photos and name.
          </p>
          <div className="pf-done-actions">
            <button type="button" className="pf-btn pf-btn--ghost" onClick={addAnother}>Add another animal like this</button>
            <button type="button" className="pf-btn pf-btn--primary" onClick={() => onSaved?.(savedAnimal, { created: true })}>
              <Check size={17} weight="bold" /> Done
            </button>
          </div>
        </section>
      </div>
    );
  }

  const priceField = (
    <Field
      label={priceWords.label}
      required
      error={errors.price}
      htmlFor="pf-price"
      hint={by ? null : priceWords.hint}
      className="pf-field--price"
    >
      {by ? (
        <div className="pf-derived" aria-live="polite">
          <strong>
            {span
              ? (span.min === span.max ? peso(span.min) : `${peso(span.min)} – ${peso(span.max)}`)
              : 'Type a price for each one below'}
          </strong>
          <small>{by === 'sizes' ? 'From the sizes below.' : 'Each choice has its own price (see below).'}</small>
        </div>
      ) : (
        <MoneyInput id="pf-price" value={form.price} onChange={(v) => set('price', v)} placeholder="" invalid={!!errors.price} />
      )}
    </Field>
  );

  const stockField = kind === 'LIVESTOCK' ? (
    <Field
      label="How many animals?"
      required
      error={errors.stock}
      htmlFor="pf-heads"
      hint="Same age, sex and size? List them together. Different ones get their own listing."
    >
      <Stepper
        id="pf-heads"
        value={form.stock}
        onChange={setHeads}
        min={0}
        max={10000}
        unit={(parseInt(form.stock, 10) || 0) === 1 ? 'animal' : 'animals'}
        invalid={!!errors.stock}
        label="How many animals"
      />
    </Field>
  ) : (
    <Field
      label="How many do you have?"
      required
      error={errors.stock}
      htmlFor="pf-stock"
      hint={stockedGroup ? null : 'It goes down by itself when someone buys.'}
    >
      {stockedGroup ? (
        <div className="pf-derived" aria-live="polite">
          <strong>{stockedGroup.choices.reduce((n, c) => n + (parseInt(stockedGroup.stocks[c] || '0', 10) || 0), 0)} in all</strong>
          <small>Counted from your choices below.</small>
        </div>
      ) : (
        <Stepper id="pf-stock" value={form.stock} onChange={(v) => set('stock', v)} invalid={!!errors.stock} label="How many you have" />
      )}
    </Field>
  );

  const optionsSwitch = {
    REGULAR: { label: 'It comes in different sizes or colors', sub: 'Example: Small, Medium, Large' },
    READY_TO_EAT: { label: 'It comes in different flavors or sizes', sub: 'Example: Original and Spicy' },
    COOK_TO_ORDER: { label: 'Buyers can pick a flavor or style', sub: 'Example: Grilled or Fried' },
  }[kind] || { label: 'It comes in different sizes or colors', sub: 'Example: Small, Medium, Large' };

  const showKindNote = !!kind && !!form.categoryId && (kindOpts.length > 1 || kind !== 'REGULAR');

  const body = (
    <div className="pf-cards-col">
      {sellBlockers?.length > 0 ? (
        <div className="pf-note pf-note--draft">
          <Info size={18} />
          <span>
            Buyers can see this product, but can&apos;t order it until your shop is ready to sell.
            {' '}Still to do: {sellBlockers.map((b) => b.label).join(', ')}.
          </span>
        </div>
      ) : editing && product.status === 'APPROVED' && (
        <div className="pf-note">
          <Info size={18} />
          <span>This product is on sale now. Buyers see your changes as soon as you save.</span>
        </div>
      )}

      {/* 1. Photos */}
      <Card id="photos" title="Photos" done={doneOf.photos} hint="The first photo is the one buyers see first.">
        <Field error={errors.images}>
          <PhotoPicker images={form.images} onChange={(imgs) => set('images', imgs)} invalid={!!errors.images} />
        </Field>
      </Card>

      {/* 2. Name and category */}
      <Card id="about" title="Name and category" done={doneOf.about}>
        <Field
          label={kind === 'LIVESTOCK' ? 'Name of the animal for sale' : 'Product name'}
          required
          error={errors.name}
          htmlFor="pf-name"
          hint={ex.name.replace(/^e\.g\. /, 'Example: ')}
          aside={form.name.length ? `${form.name.length}/${NAME_MAX}` : null}
        >
          <input
            id="pf-name"
            className="pf-input pf-input--lg"
            value={form.name}
            maxLength={NAME_MAX}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field label="Category" required error={errors.categoryId} hint={form.categoryId ? null : 'Tap the one it belongs to. Buyers find it there.'}>
          <CategoryPicker
            categories={categories}
            value={form.categoryId}
            onChange={onCategory}
            name={form.name}
            recent={recent}
            invalid={!!errors.categoryId}
          />
        </Field>

        {kindOpts.length > 1 && (
          <div className="pf-field pf-kind" data-invalid={errors.kind ? 'true' : undefined}>
            <span className="pf-label" id="pf-kind-label">What kind is it?</span>
            <RadioCards
              label="What kind is it?"
              options={kindOpts}
              value={kind}
              onChange={onKind}
              columns={1}
              invalid={!!errors.kind}
            />
            {errors.kind && <p className="pf-error" role="alert">{errors.kind}</p>}
          </div>
        )}
        {showKindNote && (
          <p className="pf-kind-note" aria-live="polite">
            <Info size={17} aria-hidden="true" />
            <span>{KIND_NOTES[kind]}</span>
          </p>
        )}

        <Field
          label="Tell buyers about it"
          required
          error={errors.description}
          htmlFor="pf-description"
          hint={ex.description.replace(/^e\.g\. /, 'Example: ')}
          aside={form.description.length > DESCRIPTION_MAX - 200 ? `${form.description.length}/${DESCRIPTION_MAX}` : null}
        >
          <textarea
            id="pf-description"
            className="pf-input pf-textarea"
            rows={3}
            maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        {!editing && (
          <button type="button" className="pf-package-hint" onClick={requestPackage}>
            <Package size={18} aria-hidden="true" />
            <span>Selling a few products together as one set? <strong>Make a package</strong></span>
          </button>
        )}
      </Card>

      {/* 3. Price and how many */}
      <Card id="price" title={priceTitle} done={doneOf.price}>
        <div className={showStock ? 'pf-grid-2' : ''}>
          {priceField}
          {showStock && stockField}
        </div>
      </Card>

      {/* 4. Sizes, colors or flavors: only when switched on */}
      {showOptions && (
        <Card id="options" title={optionsTitle} done={doneOf.options} optional>
          <div data-invalid={errors.options ? 'true' : undefined}>
            <Switch checked={hasOptions} onChange={chooseHasOptions} label={optionsSwitch.label} sub={optionsSwitch.sub} />
          </div>
          {errors.options && <p className="pf-error" role="alert">{errors.options}</p>}
          {hasOptions && (
            <div className="pf-groups">
              {form.variations.map((g, index) => (
                <ChoiceGroup
                  key={g.key}
                  group={g}
                  index={index}
                  count={form.variations.length}
                  error={errors[`group-${g.key}`]}
                  types={types}
                  showPrice={offers.choicePrices && (g.priced || !form.variations.some((x) => x.key !== g.key && x.priced))}
                  showStock={offers.choiceStock && (g.stocked || !form.variations.some((x) => x.key !== g.key && x.stocked))}
                  onChange={(change) => updateGroup(g.key, change)}
                  onAddChoices={(raw) => groupActions.addChoices(g.key, raw)}
                  onRemoveChoice={(c) => groupActions.removeChoice(g.key, c)}
                  onRemove={() => groupActions.remove(g.key)}
                />
              ))}
              {form.variations.length < MAX_GROUPS && (
                <button type="button" className="pf-add-group" onClick={groupActions.add}>
                  <Plus size={17} /> Add another
                  <small>{food ? 'like Rice as well as Flavor' : 'like Color as well as Size'}</small>
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 5. How buyers get it (and the weight couriers need) */}
      {showWay && (
        <Card id="way" title="How buyers get it" done={doneOf.way}>
          <WayField
            value={form.fulfillment}
            onChange={(v) => set('fulfillment', v)}
            shopMode={shopMode}
            kind={kind}
            couriersOn={couriersOn}
            label={null}
          />
          {offers.weight && (
            <Field
              label="Weight with the packaging"
              required={couriersOn}
              optional={!couriersOn}
              error={errors.weightKg}
              htmlFor="pf-weight"
              hint={couriersOn
                ? 'Couriers use it to work out the delivery fee. Example: 0.5 kg'
                : 'Only needed if a courier delivers it. Example: 0.5 kg'}
            >
              <div className="pf-unit">
                <input
                  id="pf-weight"
                  className={`pf-input${errors.weightKg ? ' is-invalid' : ''}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.weightKg}
                  onChange={(e) => set('weightKg', e.target.value)}
                />
                <span>kg</span>
              </div>
            </Field>
          )}
        </Card>
      )}

      {/* 6. Food and animals: their own questions */}
      {detailTitle && (
        <Card id="details" title={detailTitle} done={doneOf.details}>
          <KindDetails form={form} set={set} patch={patch} errors={errors} ctx={{ kind, editing }} />
        </Card>
      )}

      {/* 7. More details: closed until wanted */}
      <section className={`pf-card pf-card--more${moreOpen ? ' is-open' : ''}`} id="pf-card-more">
        <button
          type="button"
          className="pf-more-toggle"
          aria-expanded={moreOpen}
          aria-controls="pf-more-body"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="pf-more-toggle-text">
            <span className="pf-more-toggle-title">More details <em className="pf-opt">Optional</em></span>
            <small>{moreSummary}</small>
          </span>
          <CaretDown size={20} className="pf-more-caret" aria-hidden="true" />
        </button>
        {moreOpen && (
          <div className="pf-card-body" id="pf-more-body">
            <MoreDetails
              form={form}
              set={set}
              errors={errors}
              kind={kind}
              by={by}
              policyMode={policyMode}
              onPolicy={pickPolicy}
              onClearPolicy={clearPolicy}
            />
          </div>
        )}
      </section>
    </div>
  );

  return (
    <form className={`pf pf--page${isPhone ? '' : ' pf--wide'}`} ref={rootRef} onSubmit={save} noValidate>
      {!isPhone && (
        <button type="button" className="pf-back" onClick={requestCancel}>
          <ArrowLeft size={16} /> Back to products
        </button>
      )}

      {isPhone ? body : (
        <div className="pf-layout">
          {body}
          <aside className="pf-aside-col" aria-label="Your progress">
            <div className="pf-aside-card">
              <h3>Your progress</h3>
              <ul className="pf-checklist">
                {cards.map((c) => (
                  <li key={c.id} className={c.done ? 'is-done' : ''}>
                    <button type="button" onClick={() => goToCard(c.id)}>
                      <span className="pf-check" aria-hidden="true">{c.done && <Check size={13} weight="bold" />}</span>
                      <span>{c.title}</span>
                      {c.optional && !c.done && <em>Optional</em>}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="pf-aside-left">
                {left ? `${left} ${left === 1 ? 'part' : 'parts'} left to fill in` : 'All set. You can save it now.'}
              </p>
            </div>
            <div className="pf-aside-card">
              <h3>What buyers see</h3>
              <PreviewCard draft={draft} kind={kind} way={showWay ? wayText : null} todayQty={todayQty} />
            </div>
          </aside>
        </div>
      )}

      {isPhone ? (
        <>
          <div className="pf-bar-space" aria-hidden="true" />
          <div className="scm-savebar pf-bar" role="group" aria-label="Save">
            <button type="button" className="scm-savebar-btn scm-savebar-cancel" onClick={requestCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="scm-savebar-btn scm-savebar-save" disabled={saving}>
              {saving ? <BusyLabel>Saving…</BusyLabel> : saveLabel}
            </button>
          </div>
        </>
      ) : (
        <div className="pf-footer">
          <span className="pf-footer-note">
            {left ? `${left} ${left === 1 ? 'part' : 'parts'} left to fill in` : 'All set.'}
          </span>
          <button type="button" className="pf-btn pf-btn--ghost" onClick={requestCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="pf-btn pf-btn--primary" disabled={saving}>
            {saving ? <CircleNotch size={17} className="pf-spin" /> : <Check size={17} weight="bold" />}
            {saving ? <BusyLabel>Saving…</BusyLabel> : saveLabel}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmLeave}
        title="Leave without saving?"
        message="What you typed for this product will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep going"
        danger
        onConfirm={() => {
          const to = confirmLeave;
          setConfirmLeave(null);
          if (to === 'package') toPackage();
          else leave();
        }}
        onCancel={() => setConfirmLeave(null)}
      />
    </form>
  );
}
