import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, X, Plus, Trash, CircleNotch, Info, ArrowLeft, Check,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { uploadImage } from '../../lib/upload';
import { resolveImg } from '../../lib/media';
import ConfirmDialog from '../ui/ConfirmDialog';
import './ProductForm.css';

/*
 * Add / edit a product, written for sellers who are not "techy": five short
 * steps in the order people think about a listing (photos, what it is, its
 * choices, price and stock, returns), plain words, and the Save button always
 * in reach at the bottom of the screen.
 *
 * The payload is the same one the product API has always taken.
 */

const MAX_IMAGES = 10;
const NAME_MIN = 2;
const NAME_MAX = 200;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;
const MAX_GROUPS = 10;
const MAX_CHOICES = 30;

// Common choice types. Picking one names the group and offers its usual
// choices as one-tap suggestions; nothing is added without a tap.
const CHOICE_TYPES = [
  { name: 'Weight', example: '250g', suggestions: ['250g', '500g', '1kg'] },
  { name: 'Size', example: 'Small', suggestions: ['Small', 'Medium', 'Large'] },
  { name: 'Color', example: 'Red', suggestions: ['Red', 'Blue', 'Green', 'Black', 'White'] },
  { name: 'Pack size', example: '1 piece', suggestions: ['1 piece', '3 pieces', '6 pieces'] },
];

const RETURN_POLICIES = [
  {
    key: 'none',
    title: 'No returns',
    hint: 'Only if the item is wrong or damaged',
    text: 'No returns or refunds accepted unless the item is incorrect or damaged on arrival.',
  },
  {
    key: '7day',
    title: '7-day returns',
    hint: 'For wrong or damaged items, with proof',
    text: 'Returns or refunds accepted within 7 days for incorrect or damaged items. Buyer must provide proof.',
  },
  {
    key: 'perishable',
    title: 'Perishable goods',
    hint: 'Report problems on delivery with a photo',
    text: 'For perishable goods, report incorrect or damaged items on delivery with photo proof.',
  },
];

let groupSeq = 0;
const nextKey = () => {
  groupSeq += 1;
  return `g${groupSeq}`;
};

const asStrings = (obj) => (obj && typeof obj === 'object'
  ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]))
  : {});

const toFormState = (product) => ({
  name: product?.name || '',
  description: product?.description || '',
  price: product ? String(Number(product.price) || '') : '',
  stock: product ? String(product.stock ?? '') : '',
  categoryId: product?.categoryId || product?.category?.id || '',
  images: Array.isArray(product?.images) ? product.images.filter(Boolean) : [],
  returnPolicy: product?.returnPolicy || '',
  variations: Array.isArray(product?.variations)
    ? product.variations.map((v) => ({
      key: nextKey(),
      name: v?.name || '',
      choices: Array.isArray(v?.options) ? v.options.map(String) : [],
      draft: '',
      priced: !!(v?.prices && Object.keys(v.prices).length),
      prices: asStrings(v?.prices),
      stocked: !!(v?.stocks && Object.keys(v.stocks).length),
      stocks: asStrings(v?.stocks),
    }))
    : [],
});

const emptyGroup = () => ({
  key: nextKey(), name: '', choices: [], draft: '', priced: false, prices: {}, stocked: false, stocks: {},
});

const policyModeFor = (text) => {
  if (!text) return null;
  return RETURN_POLICIES.find((p) => p.text === text)?.key || 'custom';
};

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isWhole = (v) => /^\d+$/.test(String(v).trim());

/** Split "250g, 500g" into choices; skip blanks and ones already there. */
const mergeChoices = (existing, raw) => {
  const out = [...existing];
  for (const part of String(raw).split(',')) {
    const choice = part.trim().slice(0, 80);
    if (!choice || out.length >= MAX_CHOICES) continue;
    if (!out.some((c) => c.toLowerCase() === choice.toLowerCase())) out.push(choice);
  }
  return out;
};

export default function ProductForm({ product = null, categories = [], onCancel, onSaved }) {
  const editing = !!product;
  const [initial] = useState(() => toFormState(product));
  const [form, setForm] = useState(initial);
  const [hasOptions, setHasOptions] = useState(initial.variations.length > 0);
  const [policyMode, setPolicyMode] = useState(() => policyModeFor(initial.returnPolicy));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const rootRef = useRef(null);

  // Phones: the form takes the whole screen, so the bottom tab bar steps
  // aside and the Save bar sits at the bottom edge instead.
  useEffect(() => {
    document.body.classList.add('pf-open');
    return () => document.body.classList.remove('pf-open');
  }, []);

  // After a failed save, bring the first problem into view.
  useEffect(() => {
    if (!attempt) return;
    const first = rootRef.current?.querySelector('[data-invalid="true"]');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [attempt]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  const groups = hasOptions ? form.variations : [];
  const pricedGroup = groups.find((g) => g.priced) || null;
  const stockedGroup = groups.find((g) => g.stocked) || null;
  const priceRange = (() => {
    if (!pricedGroup) return null;
    const values = pricedGroup.choices.map((c) => Number(pricedGroup.prices[c])).filter((n) => n > 0);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  })();
  const stockTotal = stockedGroup
    ? stockedGroup.choices.reduce((sum, c) => sum + (parseInt(stockedGroup.stocks[c] || '0', 10) || 0), 0)
    : 0;

  /* ── choice groups ───────────────────────────────────────────── */
  const updateGroup = (key, patch) => {
    setForm((f) => ({
      ...f,
      variations: f.variations.map((g) => (g.key === key ? { ...g, ...(typeof patch === 'function' ? patch(g) : patch) } : g)),
    }));
    if (errors[`group-${key}`]) setErrors((e) => ({ ...e, [`group-${key}`]: '' }));
  };

  const chooseHasOptions = (yes) => {
    setHasOptions(yes);
    if (yes && form.variations.length === 0) {
      setForm((f) => ({ ...f, variations: [emptyGroup()] }));
    }
    setErrors((e) => ({ ...e, options: '' }));
  };

  const addGroup = () => {
    if (form.variations.length >= MAX_GROUPS) return;
    setForm((f) => ({ ...f, variations: [...f.variations, emptyGroup()] }));
  };

  const removeGroup = (key) => {
    if (!form.variations.some((g) => g.key !== key)) setHasOptions(false);
    setForm((f) => ({ ...f, variations: f.variations.filter((g) => g.key !== key) }));
  };

  const addChoices = (key, raw) => {
    updateGroup(key, (g) => ({ choices: mergeChoices(g.choices, raw ?? g.draft), draft: raw === undefined ? '' : g.draft }));
  };

  const removeChoice = (key, choice) => {
    updateGroup(key, (g) => {
      const prices = { ...g.prices };
      const stocks = { ...g.stocks };
      delete prices[choice];
      delete stocks[choice];
      return { choices: g.choices.filter((c) => c !== choice), prices, stocks };
    });
  };

  // Only one group can carry prices, and only one stock: switching it on
  // for one group switches it off for the others.
  const toggleGroupFlag = (key, flag) => {
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
  };

  /* ── return policy ───────────────────────────────────────────── */
  const pickPolicy = (key) => {
    setPolicyMode(key);
    if (key === 'custom') {
      if (policyModeFor(form.returnPolicy) !== 'custom') set('returnPolicy', '');
    } else {
      set('returnPolicy', RETURN_POLICIES.find((p) => p.key === key)?.text || '');
    }
  };

  const clearPolicy = () => {
    setPolicyMode(null);
    set('returnPolicy', '');
  };

  /* ── save ────────────────────────────────────────────────────── */
  const validate = (state, optionGroups) => {
    const errs = {};
    if (!state.images.length) errs.images = 'Add at least one photo of the product.';
    const name = state.name.trim();
    if (!name) errs.name = 'Enter the product name.';
    else if (name.length < NAME_MIN) errs.name = 'The name is too short.';
    if (!state.categoryId) errs.categoryId = 'Choose a category.';
    const description = state.description.trim();
    if (description.length < DESCRIPTION_MIN) {
      errs.description = description
        ? `Write a little more (at least ${DESCRIPTION_MIN} letters).`
        : 'Describe the product so buyers know what they are getting.';
    }

    if (hasOptions) {
      const used = optionGroups.filter((g) => g.name.trim() || g.choices.length);
      if (!used.length) errs.options = 'Add at least one choice, or pick "No" above.';
      const seen = new Set();
      for (const g of used) {
        const gName = g.name.trim();
        const k = `group-${g.key}`;
        if (!gName) errs[k] = 'Give this choice type a name, for example Weight.';
        else if (!g.choices.length) errs[k] = `Add at least one ${gName.toLowerCase()} choice.`;
        else if (seen.has(gName.toLowerCase())) errs[k] = 'Each choice type needs a different name.';
        else if (g.priced) {
          const missing = g.choices.find((c) => !(Number(g.prices[c]) > 0));
          if (missing) errs[k] = `Enter a price for "${missing}".`;
        }
        if (!errs[k] && g.stocked) {
          const bad = g.choices.find((c) => (g.stocks[c] ?? '') !== '' && !isWhole(g.stocks[c]));
          if (bad) errs[k] = `Stock for "${bad}" must be a whole number, like 5.`;
        }
        seen.add(gName.toLowerCase());
      }
    }

    const priced = hasOptions && optionGroups.some((g) => g.priced && g.choices.length);
    if (!priced && !(Number(state.price) > 0)) errs.price = 'Enter a price higher than ₱0.';
    const stocked = hasOptions && optionGroups.some((g) => g.stocked && g.choices.length);
    if (!stocked && state.stock !== '' && !isWhole(state.stock)) errs.stock = 'Stock must be a whole number, like 10.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    // Choices typed but not added yet still count.
    const optionGroups = form.variations.map((g) => (g.draft.trim()
      ? { ...g, choices: mergeChoices(g.choices, g.draft), draft: '' }
      : g));
    const state = { ...form, variations: optionGroups };
    if (optionGroups.some((g, i) => g !== form.variations[i])) setForm(state);

    const errs = validate(state, optionGroups);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error('Please check the highlighted parts.');
      setAttempt((n) => n + 1);
      return;
    }

    const cleanGroups = hasOptions
      ? optionGroups.filter((g) => g.name.trim() && g.choices.length)
      : [];
    const pGroup = cleanGroups.find((g) => g.priced);
    const sGroup = cleanGroups.find((g) => g.stocked);
    const minPrice = pGroup ? Math.min(...pGroup.choices.map((c) => Number(pGroup.prices[c]))) : null;
    const total = sGroup
      ? sGroup.choices.reduce((sum, c) => sum + (parseInt(sGroup.stocks[c] || '0', 10) || 0), 0)
      : null;

    const payload = {
      name: state.name.trim(),
      description: state.description.trim(),
      price: pGroup ? minPrice : parseFloat(state.price),
      stock: sGroup ? total : (state.stock !== '' ? parseInt(state.stock, 10) : 0),
      categoryId: state.categoryId,
      images: state.images,
      returnPolicy: state.returnPolicy.trim() || null,
      variations: cleanGroups.map((g) => ({
        name: g.name.trim(),
        options: g.choices,
        ...(g.priced ? { prices: Object.fromEntries(g.choices.map((c) => [c, Number(g.prices[c])])) } : {}),
        ...(g.stocked ? { stocks: Object.fromEntries(g.choices.map((c) => [c, parseInt(g.stocks[c] || '0', 10) || 0])) } : {}),
      })),
    };

    setSaving(true);
    try {
      const res = editing
        ? await axios.put(`/products/${product.id}`, payload)
        : await axios.post('/products', payload);
      onSaved?.(res?.data || null, { created: !editing });
    } catch (err) {
      toast.error(err.message || 'Could not save the product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const requestCancel = () => {
    if (dirty && !saving) setConfirmLeave(true);
    else onCancel?.();
  };

  return (
    <form className="pf" ref={rootRef} onSubmit={handleSubmit} noValidate>
      <button type="button" className="pf-back" onClick={requestCancel}>
        <ArrowLeft size={16} /> Back to products
      </button>

      {editing && product.status === 'APPROVED' && (
        <div className="pf-note">
          <Info size={16} />
          <span>This product is live. Your changes show to buyers as soon as you save.</span>
        </div>
      )}

      {/* 1 · Photos */}
      <Section step={1} title="Photos" tag="Required" hint="Clear, bright photos sell better. The first photo is the cover." invalid={!!errors.images}>
        <PhotoPicker
          images={form.images}
          onChange={(imgs) => set('images', imgs)}
        />
        <FieldError text={errors.images} />
      </Section>

      {/* 2 · About the product */}
      <Section step={2} title="About the product">
        <Field label="Product name" required error={errors.name} htmlFor="pf-name">
          <input
            id="pf-name"
            className="pf-input"
            value={form.name}
            maxLength={NAME_MAX}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Fresh Ampalaya"
            autoComplete="off"
          />
        </Field>
        <Field label="Category" required error={errors.categoryId} htmlFor="pf-category">
          <select
            id="pf-category"
            className="pf-input pf-select"
            value={form.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field
          label="Description"
          required
          error={errors.description}
          htmlFor="pf-description"
          hint={errors.description ? null : 'How fresh it is, its size or weight, where it comes from.'}
          aside={`${form.description.length}/${DESCRIPTION_MAX}`}
        >
          <textarea
            id="pf-description"
            className="pf-input pf-textarea"
            rows={4}
            maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. Harvested this morning from our farm in Bansud. Sold per kilo."
          />
        </Field>
      </Section>

      {/* 3 · Choices */}
      <Section
        step={3}
        title="Choices"
        tag="Optional"
        hint="Does it come in different sizes, weights or colors?"
        invalid={!!errors.options}
      >
        <div className="pf-yesno" role="radiogroup" aria-label="Does it come in different choices?">
          <button
            type="button"
            role="radio"
            aria-checked={!hasOptions}
            className={`pf-yesno-btn${!hasOptions ? ' is-on' : ''}`}
            onClick={() => chooseHasOptions(false)}
          >
            <span className="pf-radio" aria-hidden="true" />
            <span><strong>No</strong><small>It comes in one kind only</small></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={hasOptions}
            className={`pf-yesno-btn${hasOptions ? ' is-on' : ''}`}
            onClick={() => chooseHasOptions(true)}
          >
            <span className="pf-radio" aria-hidden="true" />
            <span><strong>Yes</strong><small>e.g. 250g and 1kg, or Small and Large</small></span>
          </button>
        </div>
        <FieldError text={errors.options} />

        {hasOptions && (
          <div className="pf-groups">
            {form.variations.map((g, index) => (
              <ChoiceGroup
                key={g.key}
                group={g}
                index={index}
                count={form.variations.length}
                error={errors[`group-${g.key}`]}
                onChange={(patch) => updateGroup(g.key, patch)}
                onAddChoices={(raw) => addChoices(g.key, raw)}
                onRemoveChoice={(c) => removeChoice(g.key, c)}
                onToggle={(flag) => toggleGroupFlag(g.key, flag)}
                onRemove={() => removeGroup(g.key)}
              />
            ))}
            {form.variations.length < MAX_GROUPS && (
              <button type="button" className="pf-add-group" onClick={addGroup}>
                <Plus size={16} /> Add another choice type
                <small>e.g. Color as well as Size</small>
              </button>
            )}
          </div>
        )}
      </Section>

      {/* 4 · Price and stock */}
      <Section step={4} title="Price and stock" className="pf-section--price">
        <div className="pf-grid-2">
          <Field label="Price" required error={errors.price} htmlFor="pf-price">
            {pricedGroup ? (
              <div className="pf-derived" aria-live="polite">
                <strong>
                  {priceRange
                    ? (priceRange.min === priceRange.max ? peso(priceRange.min) : `${peso(priceRange.min)} – ${peso(priceRange.max)}`)
                    : 'Set a price for each choice'}
                </strong>
                <small>From each {pricedGroup.name || 'choice'} price above</small>
              </div>
            ) : (
              <div className={`pf-money${errors.price ? ' is-invalid' : ''}`}>
                <em>₱</em>
                <input
                  id="pf-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
          </Field>
          <Field
            label="Stock"
            error={errors.stock}
            htmlFor="pf-stock"
            hint={stockedGroup ? null : 'How many you can sell right now.'}
          >
            {stockedGroup ? (
              <div className="pf-derived" aria-live="polite">
                <strong>{stockTotal} in total</strong>
                <small>From each {stockedGroup.name || 'choice'} stock above</small>
              </div>
            ) : (
              <input
                id="pf-stock"
                className={`pf-input${errors.stock ? ' is-invalid' : ''}`}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.stock}
                onChange={(e) => set('stock', e.target.value)}
                placeholder="0"
              />
            )}
          </Field>
        </div>
      </Section>

      {/* 5 · Returns */}
      <Section step={5} title="Returns" tag="Optional" hint="What can buyers do if something is wrong with the item?">
        <div className="pf-policies" role="radiogroup" aria-label="Return policy">
          {RETURN_POLICIES.map((p) => (
            <button
              type="button"
              key={p.key}
              role="radio"
              aria-checked={policyMode === p.key}
              className={`pf-policy${policyMode === p.key ? ' is-on' : ''}`}
              onClick={() => pickPolicy(p.key)}
            >
              <span className="pf-radio" aria-hidden="true" />
              <span><strong>{p.title}</strong><small>{p.hint}</small></span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={policyMode === 'custom'}
            className={`pf-policy${policyMode === 'custom' ? ' is-on' : ''}`}
            onClick={() => pickPolicy('custom')}
          >
            <span className="pf-radio" aria-hidden="true" />
            <span><strong>Write my own</strong><small>In your own words</small></span>
          </button>
        </div>
        {policyMode && (
          <div className="pf-policy-text">
            <label htmlFor="pf-policy">What buyers will see</label>
            <textarea
              id="pf-policy"
              className="pf-input pf-textarea"
              rows={3}
              maxLength={2000}
              value={form.returnPolicy}
              onChange={(e) => set('returnPolicy', e.target.value)}
              placeholder="e.g. Returns accepted within 7 days for damaged or wrong items."
            />
            <button type="button" className="pf-link" onClick={clearPolicy}>No return policy</button>
          </div>
        )}
      </Section>

      <div className="pf-footer">
        <button type="button" className="pf-btn pf-btn--ghost" onClick={requestCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="pf-btn pf-btn--primary" disabled={saving}>
          {saving ? <CircleNotch size={17} className="pf-spin" /> : <Check size={17} weight="bold" />}
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="What you entered for this product will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => { setConfirmLeave(false); onCancel?.(); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </form>
  );
}

function Section({ step, title, tag, hint, invalid, className = '', children }) {
  return (
    <section className={`pf-section ${className}`.trim()} data-invalid={invalid ? 'true' : undefined}>
      <header className="pf-section-head">
        <span className="pf-step" aria-hidden="true">{step}</span>
        <div>
          <h2>
            {title}
            {tag && <em className={`pf-tag${tag === 'Required' ? ' pf-tag--req' : ''}`}>{tag}</em>}
          </h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      <div className="pf-section-body">{children}</div>
    </section>
  );
}

function Field({ label, required, error, hint, aside, htmlFor, children }) {
  return (
    <div className={`pf-field${error ? ' has-error' : ''}`} data-invalid={error ? 'true' : undefined}>
      <div className="pf-label-row">
        <label className="pf-label" htmlFor={htmlFor}>
          {label}{required && <span className="pf-req" aria-hidden="true"> *</span>}
        </label>
        {aside && <span className="pf-aside">{aside}</span>}
      </div>
      {children}
      {error ? <FieldError text={error} /> : hint && <p className="pf-hint">{hint}</p>}
    </div>
  );
}

function FieldError({ text }) {
  if (!text) return null;
  return <p className="pf-error" role="alert">{text}</p>;
}

function Switch({ checked, onChange, label, sub }) {
  return (
    <label className={`pf-switch${checked ? ' is-on' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <span className="pf-switch-track" aria-hidden="true"><span /></span>
      <span className="pf-switch-text">
        <strong>{label}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </label>
  );
}

function ChoiceGroup({ group, index, count, error, onChange, onAddChoices, onRemoveChoice, onToggle, onRemove }) {
  const type = CHOICE_TYPES.find((t) => t.name.toLowerCase() === group.name.trim().toLowerCase());
  const suggestions = (type?.suggestions || []).filter(
    (s) => !group.choices.some((c) => c.toLowerCase() === s.toLowerCase()),
  );
  const typeLabel = group.name.trim() || 'choice';
  const showTable = (group.priced || group.stocked) && group.choices.length > 0;

  return (
    <div className={`pf-group${error ? ' has-error' : ''}`} data-invalid={error ? 'true' : undefined}>
      <div className="pf-group-top">
        <span className="pf-group-title">{count > 1 ? `Choice type ${index + 1}` : 'Choice type'}</span>
        <button type="button" className="pf-link pf-link--danger" onClick={onRemove}>
          <Trash size={14} /> Remove
        </button>
      </div>

      <div className="pf-type-chips" role="group" aria-label="Common choice types">
        {CHOICE_TYPES.map((t) => {
          const on = t.name.toLowerCase() === group.name.trim().toLowerCase();
          return (
            <button
              type="button"
              key={t.name}
              className={`pf-type-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange({ name: t.name })}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      <input
        className="pf-input"
        value={group.name}
        maxLength={80}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Or type your own, e.g. Flavor"
        aria-label="Choice type name"
      />

      <div className="pf-choices">
        <span className="pf-label">Choices</span>
        {group.choices.length > 0 && (
          <div className="pf-chips">
            {group.choices.map((c) => (
              <span className="pf-chip" key={c}>
                {c}
                <button type="button" onClick={() => onRemoveChoice(c)} aria-label={`Remove ${c}`}>
                  <X size={12} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="pf-add-row">
          <input
            className="pf-input"
            value={group.draft}
            maxLength={200}
            onChange={(e) => onChange({ draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddChoices();
              }
            }}
            placeholder={`Type one, e.g. ${type?.example || '250g'}`}
            aria-label="Add a choice"
            enterKeyHint="done"
          />
          <button type="button" className="pf-add-btn" onClick={() => onAddChoices()} disabled={!group.draft.trim()}>
            <Plus size={15} weight="bold" /> Add
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="pf-suggest">
            <span>Tap to add:</span>
            {suggestions.map((s) => (
              <button type="button" key={s} onClick={() => onAddChoices(s)}>+ {s}</button>
            ))}
          </div>
        )}
      </div>

      <div className="pf-switches">
        <Switch
          checked={!!group.priced}
          onChange={() => onToggle('priced')}
          label="Each choice has its own price"
          sub={`e.g. 250g ₱100, 1kg ₱300`}
        />
        <Switch
          checked={!!group.stocked}
          onChange={() => onToggle('stocked')}
          label="Each choice has its own stock"
          sub="Count how many of each you have"
        />
      </div>

      {(group.priced || group.stocked) && !group.choices.length && (
        <p className="pf-hint">Add the choices first, then fill in each one here.</p>
      )}

      {showTable && (
        <div className={`pf-table${group.priced && group.stocked ? ' pf-table--both' : ''}`}>
          <div className="pf-table-row pf-table-head" aria-hidden="true">
            <span>{typeLabel}</span>
            {group.priced && <span>Price</span>}
            {group.stocked && <span>Stock</span>}
          </div>
          {group.choices.map((c) => (
            <div className="pf-table-row" key={c}>
              <span className="pf-table-name">{c}</span>
              {group.priced && (
                <label className="pf-money pf-money--sm">
                  <em>₱</em>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={group.prices[c] ?? ''}
                    onChange={(e) => onChange((g) => ({ prices: { ...g.prices, [c]: e.target.value } }))}
                    placeholder="0.00"
                    aria-label={`Price for ${c}`}
                  />
                </label>
              )}
              {group.stocked && (
                <input
                  className="pf-input pf-input--sm"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={group.stocks[c] ?? ''}
                  onChange={(e) => onChange((g) => ({ stocks: { ...g.stocks, [c]: e.target.value } }))}
                  placeholder="0"
                  aria-label={`Stock for ${c}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <FieldError text={error} />
    </div>
  );
}

function PhotoPicker({ images, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const list = Array.isArray(images) ? images : [];

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    const room = MAX_IMAGES - list.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_IMAGES} photos`);
      return;
    }
    const chosen = files.slice(0, room);
    if (files.length > room) toast(`Only ${room} more photo${room === 1 ? '' : 's'} can be added`);

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

  const makeCover = (idx) => {
    const next = [...list];
    const [picked] = next.splice(idx, 1);
    onChange([picked, ...next]);
  };

  const removeAt = (idx) => onChange(list.filter((_, i) => i !== idx));
  const pick = () => inputRef.current?.click();

  return (
    <div className="pf-photos-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple
        onChange={handleFiles}
        hidden
      />
      {list.length === 0 && !uploading ? (
        <button type="button" className="pf-photo-empty" onClick={pick}>
          <span className="pf-photo-empty-icon"><Camera size={26} /></span>
          <strong>Add photos</strong>
          <small>Take a photo or choose from your gallery · up to {MAX_IMAGES}</small>
        </button>
      ) : (
        <div className="pf-photos">
          {list.map((src, idx) => (
            <div key={`${src}-${idx}`} className={`pf-photo${idx === 0 ? ' is-cover' : ''}`}>
              <img src={resolveImg(src) || src} alt={`Product photo ${idx + 1}`} />
              <button type="button" className="pf-photo-remove" onClick={() => removeAt(idx)} aria-label={`Remove photo ${idx + 1}`}>
                <X size={14} weight="bold" />
              </button>
              {idx === 0
                ? <span className="pf-photo-cover">Cover</span>
                : <button type="button" className="pf-photo-makecover" onClick={() => makeCover(idx)}>Make cover</button>}
            </div>
          ))}
          {uploading > 0 && (
            <div className="pf-photo pf-photo--loading" aria-live="polite">
              <CircleNotch size={22} className="pf-spin" />
              <span>Uploading…</span>
            </div>
          )}
          {list.length + uploading < MAX_IMAGES && !uploading && (
            <button type="button" className="pf-photo-add" onClick={pick}>
              <Camera size={22} />
              <span>Add photo</span>
              <small>{list.length}/{MAX_IMAGES}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
