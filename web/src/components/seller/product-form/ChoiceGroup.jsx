import { X, Plus, Trash } from '@phosphor-icons/react';
import { FieldError, MoneyInput, Switch } from './parts';

/**
 * One choice type (like Weight: 250g, 1kg) with its choices, and optionally
 * a price and a stock count for each.
 * @param {Array} types - the usual choice types to tap (CHOICE_TYPES)
 * @param {Boolean} noPrice - the kind has one price for every choice
 * @param {Boolean} noStock - the kind keeps no stock per choice
 */
export default function ChoiceGroup({
  group, index, count, error, types, onChange, onAddChoices, onRemoveChoice, onToggle, onRemove,
  noPrice = false, noStock = false,
}) {
  const type = types.find((t) => t.name.toLowerCase() === group.name.trim().toLowerCase());
  const suggestions = (type?.suggestions || []).filter(
    (s) => !group.choices.some((c) => c.toLowerCase() === s.toLowerCase()),
  );
  const typeLabel = group.name.trim() || 'choice';
  const priced = group.priced && !noPrice;
  const stocked = group.stocked && !noStock;
  const showTable = (priced || stocked) && group.choices.length > 0;

  return (
    <div className={`pf-group${error ? ' has-error' : ''}`} data-invalid={error ? 'true' : undefined}>
      <div className="pf-group-top">
        <span className="pf-group-title">{count > 1 ? `Choice type ${index + 1}` : 'Choice type'}</span>
        <button type="button" className="pf-link pf-link--danger" onClick={onRemove}>
          <Trash size={14} /> Remove
        </button>
      </div>

      <div className="pf-type-chips" role="group" aria-label="Common choice types">
        {types.map((t) => {
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
            placeholder={`Type one, e.g. ${type?.example || types[0]?.example || '250g'}`}
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

      {!(noPrice && noStock) && (
        <div className="pf-switches">
          {!noPrice && (
            <Switch
              checked={!!group.priced}
              onChange={() => onToggle('priced')}
              label="Each choice has its own price"
              sub="e.g. 250g ₱100, 1kg ₱300"
            />
          )}
          {!noStock && (
            <Switch
              checked={!!group.stocked}
              onChange={() => onToggle('stocked')}
              label="Each choice has its own stock"
              sub="Count how many of each you have"
            />
          )}
        </div>
      )}

      {(priced || stocked) && !group.choices.length && (
        <p className="pf-hint">Add the choices first, then fill in each one here.</p>
      )}

      {showTable && (
        <div className={`pf-table${priced && stocked ? ' pf-table--both' : ''}`}>
          <div className="pf-table-row pf-table-head" aria-hidden="true">
            <span>{typeLabel}</span>
            {priced && <span>Price</span>}
            {stocked && <span>Stock</span>}
          </div>
          {group.choices.map((c) => (
            <div className="pf-table-row" key={c}>
              <span className="pf-table-name">{c}</span>
              {priced && (
                <MoneyInput
                  small
                  value={group.prices[c] ?? ''}
                  onChange={(v) => onChange((g) => ({ prices: { ...g.prices, [c]: v } }))}
                  label={`Price for ${c}`}
                />
              )}
              {stocked && (
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
