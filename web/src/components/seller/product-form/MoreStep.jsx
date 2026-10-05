import { Plus } from '@phosphor-icons/react';
import ChoiceGroup from './ChoiceGroup';
import {
  Field, FieldError, MoneyInput, MoreRow, RadioCards,
} from './parts';
import {
  CHOICE_TYPES, FOOD_CHOICE_TYPES, RETURN_POLICIES, MAX_GROUPS, peso,
} from './formState';

const FOOD = ['READY_TO_EAT', 'COOK_TO_ORDER'];

/**
 * Step 3: extras most products don't need, each closed until opened:
 * choices, a sale, bulk prices, weight and returns (only those that fit
 * the kind).
 */
export default function MoreStep({
  form, set, errors, kind, offers, by, couriersOn, open, onToggleRow,
  hasOptions, onHasOptions, groupActions, policyMode, onPolicy, onClearPolicy,
}) {
  const food = FOOD.includes(kind);
  const groups = hasOptions ? form.variations.filter((g) => g.name.trim() || g.choices.length) : [];
  const choicesSummary = groups.length
    ? groups.map((g) => `${g.name.trim() || 'Choice'}: ${g.choices.join(', ') || '…'}`).join(' · ')
    : 'None. It comes in one kind only.';
  const saleSummary = form.saleOn && Number(form.salePrice) > 0 ? `On sale at ${peso(form.salePrice)}` : 'Off';
  const tiers = form.priceTiers.filter((t) => t.minQty !== '' && t.price !== '');
  const bulkSummary = tiers.length ? tiers.map((t) => `${t.minQty}+ at ${peso(t.price)}`).join(', ') : 'Off';
  const policy = RETURN_POLICIES.find((p) => p.key === policyMode);
  const returnsSummary = policy ? policy.title : policyMode === 'custom' ? 'In your own words' : 'No return policy';
  const choiceErr = errors.options || Object.keys(errors).some((k) => k.startsWith('group-') && errors[k]);

  return (
    <div className="pf-more-list">
      {offers.choices && (
        <MoreRow
          title="Choices"
          summary={choicesSummary}
          open={open.includes('choices')}
          onToggle={() => onToggleRow('choices')}
          invalid={!!choiceErr}
        >
          <p className="pf-hint">{food ? 'Does it come in different flavors or styles?' : 'Does it come in different sizes, weights or colors?'}</p>
          <RadioCards
            label="Does it come in different choices?"
            columns={2}
            value={hasOptions}
            onChange={onHasOptions}
            options={[
              { key: false, label: 'No', hint: 'It comes in one kind only' },
              { key: true, label: 'Yes', hint: food ? 'e.g. Original and Spicy' : 'e.g. 250g and 1kg, or Small and Large' },
            ]}
          />
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
                  types={food ? FOOD_CHOICE_TYPES : CHOICE_TYPES}
                  noPrice={!offers.choicePrices}
                  noStock={!offers.choiceStock}
                  onChange={(patch) => groupActions.update(g.key, patch)}
                  onAddChoices={(raw) => groupActions.addChoices(g.key, raw)}
                  onRemoveChoice={(c) => groupActions.removeChoice(g.key, c)}
                  onToggle={(flag) => groupActions.toggleFlag(g.key, flag)}
                  onRemove={() => groupActions.remove(g.key)}
                />
              ))}
              {form.variations.length < MAX_GROUPS && (
                <button type="button" className="pf-add-group" onClick={groupActions.add}>
                  <Plus size={16} /> Add another choice type
                  <small>{food ? 'e.g. Rice as well as Flavor' : 'e.g. Color as well as Size'}</small>
                </button>
              )}
            </div>
          )}
        </MoreRow>
      )}

      {by ? (
        <p className="pf-hint pf-more-note">
          {by === 'sizes' ? 'Each size has its own price,' : 'Each choice has its own price,'} so there is no sale or bulk price. Lower those prices instead.
        </p>
      ) : (
        <>
          <MoreRow
            title="Sale price"
            summary={saleSummary}
            open={open.includes('sale')}
            onToggle={() => onToggleRow('sale')}
            invalid={!!errors.salePrice}
          >
            <div className={`pf-sale${form.saleOn ? ' is-on' : ''}`}>
              <label className="pf-sale-toggle">
                <input type="checkbox" checked={form.saleOn} onChange={(e) => set('saleOn', e.target.checked)} />
                <span>
                  <strong>Put it on sale</strong>
                  <small>Buyers see the lower price with the regular one crossed out. Saved by buyers? They are told.</small>
                </span>
              </label>
              {form.saleOn && (
                <div className="pf-grid-2">
                  <Field label="Sale price" required error={errors.salePrice} htmlFor="pf-sale-price">
                    <MoneyInput id="pf-sale-price" value={form.salePrice} onChange={(v) => set('salePrice', v)} invalid={!!errors.salePrice} placeholder={form.price ? `Lower than ${form.price}` : '0.00'} />
                  </Field>
                  <Field label="Starts" optional htmlFor="pf-sale-start" hint="Empty: right away.">
                    <input id="pf-sale-start" className="pf-input" type="datetime-local" value={form.saleStartsAt} onChange={(e) => set('saleStartsAt', e.target.value)} />
                  </Field>
                  <Field label="Ends" optional htmlFor="pf-sale-end" hint="Empty: until you turn it off. Set it for a flash sale.">
                    <input id="pf-sale-end" className="pf-input" type="datetime-local" value={form.saleEndsAt} onChange={(e) => set('saleEndsAt', e.target.value)} />
                  </Field>
                </div>
              )}
            </div>
          </MoreRow>

          <MoreRow
            title="Bulk prices"
            summary={bulkSummary}
            open={open.includes('bulk')}
            onToggle={() => onToggleRow('bulk')}
            invalid={!!errors.priceTiers}
          >
            <div className="pf-tiers">
              <small className="pf-hint">Lower prices when a buyer orders more, like 10 or more at ₱90 each.</small>
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
                      aria-label={`Bulk price ${i + 1}: from how many`}
                      onChange={(e) => set('priceTiers', form.priceTiers.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))}
                    />
                    <span>{kind === 'LIVESTOCK' ? 'heads' : 'units'}</span>
                  </label>
                  <MoneyInput
                    value={t.price}
                    label={`Bulk price ${i + 1}: price each`}
                    onChange={(v) => set('priceTiers', form.priceTiers.map((x, j) => (j === i ? { ...x, price: v } : x)))}
                  />
                  <button type="button" className="pf-tier-remove" aria-label="Remove this bulk price" onClick={() => set('priceTiers', form.priceTiers.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {errors.priceTiers && <p className="pf-tier-error">{errors.priceTiers}</p>}
              {form.priceTiers.length < 4 && (
                <button type="button" className="pf-tier-add" onClick={() => set('priceTiers', [...form.priceTiers, { minQty: '', price: '' }])}>+ Add a bulk price</button>
              )}
            </div>
          </MoreRow>
        </>
      )}

      {offers.weight && !couriersOn && (
        <MoreRow
          title="Weight with packaging"
          summary={form.weightKg ? `${form.weightKg} kg` : 'Not set. Needed only if you ship with couriers.'}
          open={open.includes('weight')}
          onToggle={() => onToggleRow('weight')}
          invalid={!!errors.weightKg}
        >
          <Field label="Weight with packaging" optional error={errors.weightKg} htmlFor="pf-weight" hint="Needed if you ship with couriers: they charge by weight.">
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
                placeholder="e.g. 0.5"
              />
              <span>kg</span>
            </div>
          </Field>
        </MoreRow>
      )}

      <MoreRow
        title="Returns"
        summary={returnsSummary}
        open={open.includes('returns')}
        onToggle={() => onToggleRow('returns')}
      >
        <p className="pf-hint">What can buyers do if something is wrong with it?</p>
        <div className="pf-policies" role="radiogroup" aria-label="Return policy">
          {[...RETURN_POLICIES, { key: 'custom', title: 'Write my own', hint: 'In your own words' }].map((p) => (
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
            <small className="pf-hint">Buyers can ask for a return for as many days as your words say (for example &ldquo;within 14 days&rdquo;); 7 days when they don&rsquo;t say.</small>
            <button type="button" className="pf-link" onClick={onClearPolicy}>No return policy</button>
          </div>
        )}
      </MoreRow>
    </div>
  );
}
