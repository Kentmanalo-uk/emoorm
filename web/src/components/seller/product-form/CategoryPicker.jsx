import { useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';
import { CATEGORY_ICONS, categoryIconKey } from '../../../lib/categoryIcons';
import { suggestCategories } from './formState';

function CategoryIcon({ category, size = 20 }) {
  const { Icon } = CATEGORY_ICONS[categoryIconKey(category)] || CATEGORY_ICONS.shop;
  return <Icon size={size} weight="fill" aria-hidden="true" />;
}

/**
 * Which category the product belongs to: categories that fit the name
 * typed so far, the ones the seller used before, and all of them behind
 * "Choose another".
 * @param {Array} categories - [{ id, name, … }]
 * @param {String} value - the chosen category's id
 * @param {String} name - the product name, for the suggestions
 * @param {Array<String>} recent - ids of categories used before, newest first
 */
export default function CategoryPicker({ categories, value, onChange, name, recent = [], invalid }) {
  // Changing a chosen category, and the full list open.
  const [changing, setChanging] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const chosen = categories.find((c) => c.id === value) || null;
  const suggested = suggestCategories(name, categories);
  const used = recent
    .map((id) => categories.find((c) => c.id === id))
    .filter((c) => c && !suggested.some((s) => s.id === c.id))
    .slice(0, 3);
  const picking = !chosen || changing;
  // Nothing to suggest yet: every category straight away.
  const showList = listOpen || (!suggested.length && !used.length);

  const choose = (id) => {
    onChange(id);
    setChanging(false);
    setListOpen(false);
  };

  const chip = (c) => (
    <button
      type="button"
      key={c.id}
      className={`pf-cat-chip${c.id === value ? ' is-on' : ''}`}
      aria-pressed={c.id === value}
      onClick={() => choose(c.id)}
    >
      <CategoryIcon category={c} size={18} />
      {c.name}
      {c.id === value && <Check size={15} weight="bold" aria-hidden="true" />}
    </button>
  );

  return (
    <div className={`pf-cat${invalid ? ' is-invalid' : ''}`}>
      {chosen && !changing && (
        <div className="pf-cat-chosen">
          <span className="pf-cat-chosen-icon"><CategoryIcon category={chosen} size={22} /></span>
          <span className="pf-cat-chosen-name">{chosen.name}</span>
          <button type="button" className="pf-cat-change" onClick={() => setChanging(true)}>Change</button>
        </div>
      )}

      {picking && (
        <>
          {suggested.length > 0 && (
            <div className="pf-cat-row">
              <span className="pf-cat-row-label">Fits your product:</span>
              {suggested.map(chip)}
            </div>
          )}
          {used.length > 0 && (
            <div className="pf-cat-row">
              <span className="pf-cat-row-label">Used before:</span>
              {used.map(chip)}
            </div>
          )}
          {showList ? (
            <div className="pf-cat-grid" role="group" aria-label="All categories">
              {categories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`pf-cat-tile${c.id === value ? ' is-on' : ''}`}
                  aria-pressed={c.id === value}
                  onClick={() => choose(c.id)}
                >
                  <span className="pf-cat-tile-icon"><CategoryIcon category={c} /></span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="pf-cat-more" aria-expanded="false" onClick={() => setListOpen(true)}>
              Choose another
              <CaretDown size={15} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
