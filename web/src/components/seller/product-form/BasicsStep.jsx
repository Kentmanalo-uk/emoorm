import { Package } from '@phosphor-icons/react';
import PhotoPicker from './PhotoPicker';
import { Field, FieldError, MoneyInput, RadioCards } from './parts';
import { EXAMPLES, NAME_MAX, DESCRIPTION_MAX, peso } from './formState';

const PRICE_WORDS = {
  REGULAR: { label: 'Price' },
  READY_TO_EAT: { label: 'Price', hint: 'For one serving.' },
  COOK_TO_ORDER: { label: 'Price', hint: 'Different sizes and prices? Add them in the next step.' },
  LIVESTOCK: { label: 'Price per head', hint: 'For one animal.' },
};

/**
 * Step 1: photos, name, category (then "What kind?" when the category has a
 * real choice), price and a short description.
 */
export default function BasicsStep({
  form, set, errors, categories, kind, kindOpts, onCategory, onKind, priceFrom, onPackage, editing,
}) {
  const ex = EXAMPLES[kind] || EXAMPLES.REGULAR;
  const words = PRICE_WORDS[kind] || PRICE_WORDS.REGULAR;

  return (
    <>
      <Field label="Photos" required error={errors.images}>
        <PhotoPicker images={form.images} onChange={(imgs) => set('images', imgs)} />
      </Field>

      <Field label={kind === 'LIVESTOCK' ? 'Name of the listing' : 'Name'} required error={errors.name} htmlFor="pf-name">
        <input
          id="pf-name"
          className="pf-input"
          value={form.name}
          maxLength={NAME_MAX}
          onChange={(e) => set('name', e.target.value)}
          placeholder={ex.name}
          autoComplete="off"
        />
      </Field>

      <Field label="Category" required error={errors.categoryId} htmlFor="pf-category">
        <select
          id="pf-category"
          className="pf-input pf-select"
          value={form.categoryId}
          onChange={(e) => onCategory(e.target.value)}
        >
          <option value="">Choose a category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>

      {kindOpts.length > 1 && (
        <div className="pf-field pf-kind" data-invalid={errors.kind ? 'true' : undefined}>
          <span className="pf-label" id="pf-kind-label">
            What kind?<span className="pf-req" aria-hidden="true"> *</span>
          </span>
          <RadioCards
            label="What kind?"
            options={kindOpts}
            value={kind}
            onChange={onKind}
            columns={kindOpts.length}
            invalid={!!errors.kind}
          />
          <FieldError text={errors.kind} />
        </div>
      )}

      <Field
        label={words.label}
        required
        error={errors.price}
        htmlFor="pf-price"
        hint={priceFrom ? null : words.hint}
        className="pf-field--price"
      >
        {priceFrom ? (
          <div className="pf-derived" aria-live="polite">
            <strong>
              {priceFrom.span
                ? `${priceFrom.span.min === priceFrom.span.max ? '' : 'from '}${peso(priceFrom.span.min)}`
                : 'Set a price for each one'}
            </strong>
            <small>{priceFrom.text}</small>
          </div>
        ) : (
          <MoneyInput id="pf-price" value={form.price} onChange={(v) => set('price', v)} placeholder={ex.price} invalid={!!errors.price} />
        )}
      </Field>

      <Field
        label="Description"
        required
        error={errors.description}
        htmlFor="pf-description"
        aside={form.description.length > DESCRIPTION_MAX - 200 ? `${form.description.length}/${DESCRIPTION_MAX}` : null}
      >
        <textarea
          id="pf-description"
          className="pf-input pf-textarea"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={ex.description}
        />
      </Field>

      {!editing && (
        <button type="button" className="pf-package-hint" onClick={onPackage}>
          <Package size={18} aria-hidden="true" />
          <span>Selling several products as one set? <strong>Create a package</strong></span>
        </button>
      )}
    </>
  );
}
