import { Field, MoneyInput, Switch } from './parts';
import { RETURN_POLICIES } from './formState';

/**
 * "More details (optional)": what most products don't need. A sale price,
 * a lower price for buying many, the size or amount, and returns.
 */
export default function MoreDetails({
  form, set, errors, kind, by, policyMode, onPolicy, onClearPolicy,
}) {
  const unit = kind === 'LIVESTOCK' ? 'animals' : 'pieces';
  const bulkOn = form.priceTiers.length > 0;
  const toggleBulk = (on) => set('priceTiers', on ? [{ minQty: '', price: '' }] : []);

  return (
    <div className="pf-more-list">
      {kind === 'REGULAR' && (
        <Field label="Size or amount" htmlFor="pf-size" hint="Example: 250 g pack, 1 kilo, 12 pieces">
          <input
            id="pf-size"
            className="pf-input"
            value={form.size}
            maxLength={60}
            onChange={(e) => set('size', e.target.value)}
            autoComplete="off"
          />
        </Field>
      )}

      {by ? (
        <p className="pf-hint pf-more-note">
          {by === 'sizes' ? 'Each size has its own price,' : 'Each choice has its own price,'} so there is no sale price here. To sell for less, lower those prices.
        </p>
      ) : (
        <>
          <div className={`pf-more-item${form.saleOn ? ' is-on' : ''}`} data-invalid={errors.salePrice ? 'true' : undefined}>
            <Switch
              checked={form.saleOn}
              onChange={(on) => set('saleOn', on)}
              label="Put it on sale"
              sub="Buyers see the lower price, with the old price crossed out."
            />
            {form.saleOn && (
              <div className="pf-grid-2">
                <Field label="Sale price" required error={errors.salePrice} htmlFor="pf-sale-price" hint={form.price ? `Lower than ₱${form.price}` : null}>
                  <MoneyInput id="pf-sale-price" value={form.salePrice} onChange={(v) => set('salePrice', v)} invalid={!!errors.salePrice} placeholder="" />
                </Field>
                <div />
                <Field label="Sale starts" htmlFor="pf-sale-start" hint="Leave empty to start now.">
                  <input id="pf-sale-start" className="pf-input" type="datetime-local" value={form.saleStartsAt} onChange={(e) => set('saleStartsAt', e.target.value)} />
                </Field>
                <Field label="Sale ends" htmlFor="pf-sale-end" hint="Leave empty to keep it until you switch it off.">
                  <input id="pf-sale-end" className="pf-input" type="datetime-local" value={form.saleEndsAt} onChange={(e) => set('saleEndsAt', e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          <div className={`pf-more-item${bulkOn ? ' is-on' : ''}`} data-invalid={errors.priceTiers ? 'true' : undefined}>
            <Switch
              checked={bulkOn}
              onChange={toggleBulk}
              label="Cheaper when they buy many"
              sub={`Example: 10 ${unit} or more at ₱90 each`}
            />
            {bulkOn && (
              <div className="pf-tiers">
                {form.priceTiers.map((t, i) => (
                  <div className="pf-tier" key={i}>
                    <label>
                      <span>From</span>
                      <input
                        className="pf-input"
                        type="number"
                        inputMode="numeric"
                        min="2"
                        step="1"
                        value={t.minQty}
                        placeholder="10"
                        aria-label={`Cheaper price ${i + 1}: from how many`}
                        onChange={(e) => set('priceTiers', form.priceTiers.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))}
                      />
                      <span>{unit}, each</span>
                    </label>
                    <MoneyInput
                      value={t.price}
                      label={`Cheaper price ${i + 1}: price of each`}
                      placeholder=""
                      onChange={(v) => set('priceTiers', form.priceTiers.map((x, j) => (j === i ? { ...x, price: v } : x)))}
                    />
                    <button type="button" className="pf-tier-remove" aria-label="Remove this price" onClick={() => set('priceTiers', form.priceTiers.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                {errors.priceTiers && <p className="pf-error" role="alert">{errors.priceTiers}</p>}
                {form.priceTiers.length < 4 && (
                  <button type="button" className="pf-tier-add" onClick={() => set('priceTiers', [...form.priceTiers, { minQty: '', price: '' }])}>+ Add another</button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="pf-field">
        <span className="pf-label">If something is wrong with it</span>
        <div className="pf-policies" role="radiogroup" aria-label="Returns">
          {[...RETURN_POLICIES, { key: 'custom', title: 'In my own words', hint: 'Write your own rule' }].map((p) => (
            <button
              type="button"
              key={p.key}
              role="radio"
              aria-checked={policyMode === p.key}
              className={`pf-policy${policyMode === p.key ? ' is-on' : ''}`}
              onClick={() => onPolicy(p.key)}
            >
              <span className="pf-radio" aria-hidden="true" />
              <span><strong>{p.title}</strong><small>{p.hint}</small></span>
            </button>
          ))}
        </div>
        {policyMode && (
          <div className="pf-policy-text">
            <label htmlFor="pf-policy">What buyers will read</label>
            <textarea
              id="pf-policy"
              className="pf-input pf-textarea"
              rows={3}
              maxLength={2000}
              value={form.returnPolicy}
              onChange={(e) => set('returnPolicy', e.target.value)}
              placeholder="Example: Returns accepted within 7 days for damaged or wrong items."
            />
            <small className="pf-hint">Buyers can ask to return it for as many days as your words say (like &ldquo;within 14 days&rdquo;), or 7 days if they don&rsquo;t say.</small>
            <button type="button" className="pf-link" onClick={onClearPolicy}>No return rule</button>
          </div>
        )}
      </div>
    </div>
  );
}
