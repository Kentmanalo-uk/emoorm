import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CircleNotch, Info, ArrowLeft, ArrowRight, Check, CheckCircle,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import useAppSettings from '../../hooks/useAppSettings';
import { productKind, kindLabel, headsLabel } from '../../lib/productKinds';
import ConfirmDialog from '../ui/ConfirmDialog';
import { BusyLabel } from '../ui/Spinner';
import BasicsStep from './product-form/BasicsStep';
import DetailsStep from './product-form/DetailsStep';
import MoreStep from './product-form/MoreStep';
import ReviewStep from './product-form/ReviewStep';
import {
  STEPS, DETAIL_TITLES, RETURN_POLICIES, MAX_GROUPS,
  toFormState, kindOptions, switchKind, kindOffers, withDrafts, pricedBy, priceSpan, buildPayload,
  checkStep, checkAll, hasErrors, rowsWithErrors, draftProduct, detailLines, policyModeFor,
  emptyGroup, mergeChoices, peso,
} from './product-form/formState';
import './PhoneSaveBar.css';
import './ProductForm.css';

/*
 * Add / edit a product (every kind but packages, which have their own form),
 * as a few easy questions in four steps: Basics, Details for the kind of
 * product, Extras (closed until wanted) and a Review of what buyers
 * will see.
 *
 * One step per screen with Back / Next at the bottom, on phones and
 * computers. Each step is a history entry (?step=2), so the browser's (or
 * the top bar's) back goes back a step.
 */

const LAST_STEP = STEPS.length;
const FOOD = ['READY_TO_EAT', 'COOK_TO_ORDER'];

const STEP_HINTS = {
  basics: 'What you sell, a photo and its price.',
  more: 'All optional. Skip this step if you don’t need them.',
  review: 'Check it, then add it to your shop.',
};
const DETAIL_HINTS = {
  REGULAR: 'How many you have and how buyers get it.',
  READY_TO_EAT: 'How many you have today, until when, and how buyers get it.',
  COOK_TO_ORDER: 'Sizes, cooking time, and when you cook.',
  LIVESTOCK: 'About the animal, and how buyers get it.',
};

const WAY_TEXT = { PICKUP: 'Pickup only', DELIVERY: 'Delivery only' };

/**
 * @param {Object} [product] - The product being edited
 * @param {Array} categories - Categories to choose from (with their kind)
 * @param {Array<{key, label}>} [sellBlockers] - What the shop still needs
 *   before it can sell; while any are left, buyers see products but cannot order.
 */
export default function ProductForm({ product = null, categories = [], onCancel, onSaved, sellBlockers = [] }) {
  const editing = !!product;
  const isPhone = usePhoneLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const outlet = useOutletContext();
  const shopMode = outlet?.store?.fulfillmentMode || null;
  const { settings } = useAppSettings();
  const todayOn = settings?.availableTodayEnabled !== false;

  const [initial, setInitial] = useState(() => toFormState(product));
  const [form, setForm] = useState(initial);
  const [hasOptions, setHasOptions] = useState(initial.variations.length > 0);
  const [policyMode, setPolicyMode] = useState(() => policyModeFor(initial.returnPolicy));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // What leaving is for: 'cancel' or 'package' (asked while there are changes).
  const [confirmLeave, setConfirmLeave] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [openRows, setOpenRows] = useState([]);
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
  // aside and the step bar sits at the bottom edge instead.
  useEffect(() => {
    document.body.classList.add('pf-open');
    return () => document.body.classList.remove('pf-open');
  }, []);

  // The step on screen.
  const step = Math.min(LAST_STEP, Math.max(1, parseInt(params.get('step') || '1', 10) || 1));

  // Opened on a later step (a reload): the answers are gone, so start over.
  const openedOn = useRef(step);
  useEffect(() => {
    if (openedOn.current <= 1) return;
    const next = new URLSearchParams(params);
    next.delete('step');
    navigate({ search: next.toString() ? `?${next.toString()}` : '' }, { replace: true, state: location.state });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A new step starts at the top of the screen.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // After a failed check, bring the first problem into view.
  useEffect(() => {
    if (!attempt) return;
    const first = rootRef.current?.querySelector('[data-invalid="true"]');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [attempt, step]);

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
    // Cooked food: the perishable returns rule fits, unless one is chosen.
    if (next !== form.kind && FOOD.includes(next) && !editing && !out.returnPolicy) {
      out = { ...out, returnPolicy: RETURN_POLICIES.find((p) => p.key === 'perishable').text };
      setPolicyMode('perishable');
    }
    setForm(out);
    setHasOptions(has);
  };

  const onCategory = (id) => {
    const opts = id ? optionsFor(categories.find((c) => c.id === id)) : [];
    let next = form.kind;
    if (opts.length === 1) next = opts[0].key;
    else if (!(form.kindPicked && opts.some((o) => o.key === form.kind))) next = null;
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

  /* ── choice groups ───────────────────────────────────────────── */
  const updateGroup = (key, change) => {
    setForm((f) => ({
      ...f,
      variations: f.variations.map((g) => (g.key === key ? { ...g, ...(typeof change === 'function' ? change(g) : change) } : g)),
    }));
    if (errors[`group-${key}`]) setErrors((e) => ({ ...e, [`group-${key}`]: '' }));
  };

  const groupActions = {
    update: updateGroup,
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
        return { choices: g.choices.filter((c) => c !== choice), prices, stocks };
      });
    },
    // Only one group can carry prices, and only one stock: switching it on
    // for one group switches it off for the others.
    toggleFlag: (key, flag) => {
      const turningOn = !form.variations.find((g) => g.key === key)?.[flag];
      const other = turningOn ? form.variations.find((g) => g.key !== key && g[flag]) : null;
      if (other) {
        const what = flag === 'priced' ? 'Prices' : 'Stock';
        toast(`${what} per choice moved from ${other.name || 'the other type'} to this one`);
      }
      setForm((f) => ({
        ...f,
        variations: f.variations.map((g) => {
          if (g.key === key) return { ...g, [flag]: turningOn };
          return turningOn ? { ...g, [flag]: false } : g;
        }),
      }));
      setErrors((e) => ({ ...e, price: '', stock: '', [`group-${key}`]: '' }));
    },
  };

  const chooseHasOptions = (yes) => {
    setHasOptions(yes);
    if (yes && form.variations.length === 0) setForm((f) => ({ ...f, variations: [emptyGroup()] }));
    setErrors((e) => ({ ...e, options: '' }));
  };

  const toggleRow = (row) => setOpenRows((rows) => (rows.includes(row) ? rows.filter((r) => r !== row) : [...rows, row]));
  const openWithErrors = (errs) => {
    const rows = rowsWithErrors(errs);
    if (rows.length) setOpenRows((open) => [...new Set([...open, ...rows])]);
  };

  /* ── steps ────────────────────────────────────────────────────── */
  const goStep = (n) => {
    const next = new URLSearchParams(params);
    if (n <= 1) next.delete('step');
    else next.set('step', String(n));
    navigate({ search: next.toString() ? `?${next.toString()}` : '' }, { state: location.state });
  };

  // Typed but not added choices count; keep them merged in.
  const settled = () => {
    const state = withDrafts(form);
    if (state !== form) setForm(state);
    return state;
  };

  const goNext = () => {
    const state = settled();
    const key = STEPS[step - 1]?.key;
    const errs = key && key !== 'review' ? checkStep(key, state, ctx) : {};
    setErrors(errs);
    if (hasErrors(errs)) {
      toast.error('Please check the highlighted part.');
      openWithErrors(errs);
      setAttempt((n) => n + 1);
      return;
    }
    goStep(step + 1);
  };

  // Back to an earlier step; when editing, any step (saving checks them all).
  const jumpTo = (n) => {
    if (n < step) navigate(n - step);
    else if (n > step && editing) goStep(n);
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

  const goBack = () => {
    if (step > 1) navigate(-1);
    else requestCancel();
  };

  /* ── save ─────────────────────────────────────────────────────── */
  const save = async (e) => {
    e?.preventDefault();
    if (saving) return;
    // Enter in a field moves on rather than saving early.
    if (step < LAST_STEP) {
      goNext();
      return;
    }
    const state = settled();
    const { errors: errs, first } = checkAll(state, ctx);
    setErrors(errs);
    if (first >= 0) {
      toast.error('Please check the highlighted parts.');
      openWithErrors(errs);
      if (first + 1 < step) navigate(first + 1 - step);
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
    if (step > 1) navigate(1 - step);
    window.scrollTo({ top: 0 });
  };

  /* ── what buyers will see ─────────────────────────────────────── */
  const draft = draftProduct(form, ctx);
  const askWay = !shopMode || shopMode === 'BOTH';
  const wayText = WAY_TEXT[askWay ? form.fulfillment : shopMode] || 'Pickup or delivery';
  const todayQty = kind === 'READY_TO_EAT' && !editing && form.postToday ? parseInt(form.todayQty, 10) || 0 : 0;
  const kindWord = kindOpts.find((k) => k.key === kind)?.label || (kind ? kindLabel(kind) : '');
  const tiers = form.priceTiers.filter((t) => t.minQty !== '' && t.price !== '');
  const policy = RETURN_POLICIES.find((p) => p.key === policyMode);
  const choiceGroups = hasOptions && offers.choices ? form.variations.filter((g) => g.name.trim() && g.choices.length) : [];
  const sumup = [
    {
      step: 1,
      title: 'Basics',
      lines: [
        [category?.name, ctx.kindAsked && kindWord].filter(Boolean).join(' · '),
        form.description.trim() && `${form.description.trim().slice(0, 90)}${form.description.trim().length > 90 ? '…' : ''}`,
      ],
    },
    { step: 2, title: DETAIL_TITLES[kind] || 'Details', lines: [...detailLines(form, ctx), wayText] },
    {
      step: 3,
      title: STEPS[2].title,
      lines: [
        choiceGroups.length ? `Choices: ${choiceGroups.map((g) => g.name.trim()).join(', ')}` : '',
        !by && form.saleOn && Number(form.salePrice) > 0 ? `On sale at ${peso(form.salePrice)}` : '',
        !by && tiers.length ? `${tiers.length} bulk ${tiers.length === 1 ? 'price' : 'prices'}` : '',
        offers.weight && !couriersOn && form.weightKg ? `${form.weightKg} kg with packaging` : '',
        policy ? `Returns: ${policy.title}` : policyMode === 'custom' ? 'Returns: in your own words' : 'No return policy',
      ],
    },
  ];

  const priceFrom = by ? {
    span,
    text: by === 'sizes' ? 'From the sizes in Details' : 'From each choice’s price in Extras',
  } : null;

  const stepTitle = (s) => (s.key === 'details' ? DETAIL_TITLES[kind] || 'Details' : s.title);
  const stepHint = (s) => {
    if (s.key === 'details') return DETAIL_HINTS[kind] || 'Questions for what you sell.';
    if (s.key === 'review' && editing) return 'This is how buyers will see it.';
    return STEP_HINTS[s.key];
  };
  const saveLabel = editing ? 'Save changes' : kind === 'LIVESTOCK' ? 'Add animal' : 'Add product';

  const bodies = {
    basics: (
      <BasicsStep
        form={form}
        set={set}
        errors={errors}
        categories={categories}
        kind={kind}
        kindOpts={kindOpts}
        onCategory={onCategory}
        onKind={onKind}
        priceFrom={priceFrom}
        onPackage={requestPackage}
        editing={editing}
      />
    ),
    details: (
      <DetailsStep
        form={form}
        set={set}
        patch={patch}
        errors={errors}
        ctx={{ kind, editing, couriersOn, shopMode, stockedGroup }}
      />
    ),
    more: (
      <MoreStep
        form={form}
        set={set}
        errors={errors}
        kind={kind}
        offers={offers}
        by={by}
        couriersOn={couriersOn}
        open={openRows}
        onToggleRow={toggleRow}
        hasOptions={hasOptions}
        onHasOptions={chooseHasOptions}
        groupActions={groupActions}
        policyMode={policyMode}
        onPolicy={pickPolicy}
        onClearPolicy={clearPolicy}
      />
    ),
    review: (
      <ReviewStep draft={draft} kind={kind} way={wayText} todayQty={todayQty} sections={sumup} onEdit={jumpTo} />
    ),
  };

  if (savedAnimal) {
    const unitPrice = Number(savedAnimal.price) || 0;
    return (
      <div className="pf" ref={rootRef}>
        <section className="pf-done">
          <CheckCircle size={44} weight="fill" className="pf-done-icon" aria-hidden="true" />
          <h2>{savedAnimal.name} is listed</h2>
          <p className="pf-done-facts">{headsLabel(savedAnimal.stock)} · {peso(unitPrice)} / head</p>
          <p>
            Have more animals that differ, like another age, sex or weight? List each one on its own.
            We copy these details, so you only add the photos and name.
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

  return (
    <form className={`pf pf--steps${isPhone ? '' : ' pf--wide'}`} ref={rootRef} onSubmit={save} noValidate>
      {!isPhone && (
        <button type="button" className="pf-back" onClick={requestCancel}>
          <ArrowLeft size={16} /> Back to products
        </button>
      )}

      {isPhone ? (
        <div className="pf-progress">
          <span>Step {step} of {LAST_STEP}</span>
          <div className="pf-progress-bar" aria-hidden="true">
            {STEPS.map((s, i) => <i key={s.key} className={i < step ? 'is-on' : ''} />)}
          </div>
        </div>
      ) : (
        <ol className="pf-track" aria-label="Steps">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const state = n === step ? 'is-current' : n < step ? 'is-done' : '';
            const canGo = n < step || (editing && n !== step);
            return (
              <li key={s.key} className={state}>
                <button type="button" onClick={() => jumpTo(n)} disabled={!canGo} aria-current={n === step ? 'step' : undefined}>
                  <span className="pf-track-num" aria-hidden="true">{n < step ? <Check size={13} weight="bold" /> : n}</span>
                  <span>{stepTitle(s)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {step === 1 && (sellBlockers?.length > 0 ? (
        <div className="pf-note pf-note--draft">
          <Info size={16} />
          <span>
            Buyers can see this product, but can&apos;t order it until your shop is ready to sell.
            {' '}Still to do: {sellBlockers.map((b) => b.label).join(', ')}.
          </span>
        </div>
      ) : editing && product.status === 'APPROVED' && (
        <div className="pf-note">
          <Info size={16} />
          <span>This product is live. Your changes show to buyers as soon as you save.</span>
        </div>
      ))}

      {STEPS.map((s) => s.key === STEPS[step - 1].key && (
        <section key={s.key} className={`pf-section pf-section--${s.key}`} aria-labelledby={`pf-step-${s.key}`}>
          <header className="pf-section-head">
            <h2 id={`pf-step-${s.key}`}>{stepTitle(s)}</h2>
            <p>{stepHint(s)}</p>
          </header>
          <div className="pf-section-body">{bodies[s.key]}</div>

          {!isPhone && (
            <div className="pf-footer">
              <button type="button" className="pf-btn pf-btn--ghost" onClick={goBack} disabled={saving}>
                {step > 1 ? 'Back' : 'Cancel'}
              </button>
              {step < LAST_STEP ? (
                <button type="button" className="pf-btn pf-btn--primary" onClick={goNext}>
                  Next <ArrowRight size={17} weight="bold" />
                </button>
              ) : (
                <button type="submit" className="pf-btn pf-btn--primary" disabled={saving}>
                  {saving ? <CircleNotch size={17} className="pf-spin" /> : <Check size={17} weight="bold" />}
                  {saving ? <BusyLabel>Saving…</BusyLabel> : saveLabel}
                </button>
              )}
            </div>
          )}
        </section>
      ))}

      {isPhone && (
        <>
          <div className="pf-bar-space" aria-hidden="true" />
          <div className="scm-savebar pf-bar" role="group" aria-label="Steps">
            <button type="button" className="scm-savebar-btn scm-savebar-cancel" onClick={goBack} disabled={saving}>
              {step > 1 ? 'Back' : 'Cancel'}
            </button>
            {step < LAST_STEP ? (
              <button type="button" className="scm-savebar-btn scm-savebar-save" onClick={goNext}>
                Next
              </button>
            ) : (
              <button type="submit" className="scm-savebar-btn scm-savebar-save" disabled={saving}>
                {saving ? <BusyLabel>Saving…</BusyLabel> : saveLabel}
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmLeave}
        title="Leave without saving?"
        message="What you entered for this product will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
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
