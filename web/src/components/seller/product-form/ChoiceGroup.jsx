import { X, Plus, Trash } from '@phosphor-icons/react';
import { FieldError, MoneyInput } from './parts';

const anyFilled = (values) => Object.values(values || {}).some((v) => String(v ?? '').trim() !== '');

/**
 * One kind of choice (like Size: Small, Medium, Large): what is different,
 * the choices typed in as chips, then a small table with a price and how
 * many for each. Left empty, the table means "the same for all".
 * @param {Array} types - the usual kinds to tap (CHOICE_TYPES)
 * @param {Boolean} showPrice - a price column (one kind of choice can have it)
 * @param {Boolean} showStock - a "how many" column (one kind of choice can have it)
 */
export default function ChoiceGroup({
  group, index, count, error, types, onChange, onAddChoices, onRemoveChoice, onRemove,
  showPrice = false, showStock = false,
}) {
  const type = types.find((t) => t.name.toLowerCase() === group.name.trim().toLowerCase());
  const suggestions = (type?.suggestions || []).filter(
    (s) => !group.choices.some((c) => c.toLowerCase() === s.toLowerCase()),
  );
  const what = group.name.trim() || 'Choice';
  const showTable = (showPrice || showStock) && group.choices.length > 0;
  const nameId = `pf-group-${group.key}-name`;
  const addId = `pf-group-${group.key}-add`;

  // Typing a price (or how many) for one choice turns it on for this kind
  // of choice; clearing them all turns it off again.
  const setPrice = (choice, v) => onChange((g) => {
    const prices = { ...g.prices, [choice]: v };
    return { prices, priced: anyFilled(prices) };
  });
  const setStock = (choice, v) => onChange((g) => {
    const stocks = { ...g.stocks, [choice]: v };
    return { stocks, stocked: anyFilled(stocks) };
  });

  return (
    <div className={`pf-group${error ? ' has-error' : ''}`} data-invalid={error ? 'true' : undefined}>
      <div className="pf-group-top">
        <span className="pf-group-title">{count > 1 ? `Choice ${index + 1}` : 'Your choices'}</span>
        <button type="button" className="pf-link pf-link--danger" onClick={onRemove}>
          <Trash size={15} /> Remove
        </button>
      </div>

      <div className="pf-field">
        <label className="pf-label" htmlFor={nameId}>What is different?</label>
        <div className="pf-type-chips" role="group" aria-label="Tap one">
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
          id={nameId}
          className="pf-input"
          value={group.name}
          maxLength={80}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Or type your own"
          autoComplete="off"
        />
      </div>

      <div className="pf-field">
        <label className="pf-label" htmlFor={addId}>
          {group.name.trim() ? `Which ${group.name.trim().toLowerCase()}s?` : 'Choices'}
        </label>
        {group.choices.length > 0 && (
          <div className="pf-chips">
            {group.choices.map((c) => (
              <span className="pf-chip" key={c}>
                {c}
                <button type="button" onClick={() => onRemoveChoice(c)} aria-label={`Remove ${c}`}>
                  <X size={13} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="pf-add-row">
          <input
            id={addId}
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
            placeholder="Type one, then tap Add"
            autoComplete="off"
            enterKeyHint="done"
          />
          <button type="button" className="pf-add-btn" onClick={() => onAddChoices()} disabled={!group.draft.trim()}>
            <Plus size={16} weight="bold" /> Add
          </button>
        </div>
        {suggestions.length > 0 ? (
          <div className="pf-suggest">
            <span>Tap to add:</span>
            {suggestions.map((s) => (
              <button type="button" key={s} onClick={() => onAddChoices(s)}>+ {s}</button>
            ))}
          </div>
        ) : (
          !group.choices.length && <p className="pf-hint">Example: {type?.example || types[0]?.example || 'Small'}</p>
        )}
      </div>

      {showTable && (
        <div className="pf-field">
          <span className="pf-label">
            {showPrice && showStock ? 'Price and how many of each' : showPrice ? 'Price of each' : 'How many of each'}
          </span>
          <div className={`pf-table${showPrice && showStock ? ' pf-table--both' : ''}`}>
            <div className="pf-table-row pf-table-head" aria-hidden="true">
              <span>{what}</span>
              {showPrice && <span>Price</span>}
              {showStock && <span>How many</span>}
            </div>
            {group.choices.map((c) => (
              <div className="pf-table-row" key={c}>
                <span className="pf-table-name">{c}</span>
                {showPrice && (
                  <MoneyInput
                    small
                    value={group.prices[c] ?? ''}
                    onChange={(v) => setPrice(c, v)}
                    placeholder=""
                    label={`Price of ${c}`}
                  />
                )}
                {showStock && (
                  <input
                    className="pf-input pf-input--sm"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={group.stocks[c] ?? ''}
                    onChange={(e) => setStock(c, e.target.value)}
                    aria-label={`How many ${c}`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="pf-hint">
            {showPrice && showStock
              ? 'Leave a column empty if it is the same for all.'
              : showPrice ? 'Leave it empty if they all have the same price.' : 'Leave it empty to count them all together.'}
          </p>
        </div>
      )}

      <FieldError text={error} />
    </div>
  );
}
