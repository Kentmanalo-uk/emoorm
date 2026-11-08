import { useEffect, useRef } from 'react';
import { Check } from '../../lib/icons';
import {
  BasketArt, FishArt, LivestockArt, TagArt, TONES, TrendArt,
} from '../art/FlatArt';
import { GulayMark, PrutasMark } from './PalengkeMarks';

/*
 * The cards under the band: what kind of produce (a category, by slug, as
 * GET /products?categorySlug= takes it) and two ways to order the list.
 * Each card has its own colour: the mark's hue, and a pill in a deeper
 * shade of it that white reads on.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const PLG_KINDS = [
  { slug: '', label: 'Lahat', name: 'Everything', art: (s) => <BasketArt size={s} look="pop" tone={TONES.green} />, pill: ['#10B981', '#047857'] },
  { slug: 'vegetables', label: 'Gulay', name: 'Vegetables', art: (s) => <GulayMark size={s} />, pill: ['#22C55E', '#15803D'] },
  { slug: 'fruits', label: 'Prutas', name: 'Fruits', art: (s) => <PrutasMark size={s} />, pill: ['#F59E0B', '#C2410C'] },
  { slug: 'seafood', label: 'Seafood', name: 'Seafood', art: (s) => <FishArt size={s} look="pop" tone={TONES.sky} />, pill: ['#0EA5E9', '#1D4ED8'] },
  { slug: 'livestock', label: 'Hayop', name: 'Livestock', art: (s) => <LivestockArt size={s} look="pop" tone={TONES.amber} />, pill: ['#F97316', '#B91C1C'] },
];

// eslint-disable-next-line react-refresh/only-export-components
export const PLG_ORDERS = [
  // A soft hyphen: the long word may break in the pill on phones.
  { key: 'top-sales', label: 'Pinaka­mabenta', art: (s) => <TrendArt size={s} look="pop" tone={TONES.rose} />, pill: ['#F43F5E', '#BE185D'] },
  { key: 'price-low', label: 'Pinaka­mura', art: (s) => <TagArt size={s} look="pop" tone={TONES.violet} />, pill: ['#8B5CF6', '#6D28D9'] },
];

function Card({
  on, label, art, pill, onClick, size,
}) {
  return (
    <button
      type="button"
      className={`plg-card${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={onClick}
      style={{ '--c1': pill[0], '--c2': pill[1] }}
    >
      <span className="plg-card-art">{art(size)}</span>
      {/* A long word may take two lines in the pill, smaller. */}
      <span className={`plg-card-pill${label.length > 9 ? ' is-long' : ''}`}>{label}</span>
      {on && <span className="plg-card-check" aria-hidden="true"><Check size={11} weight="bold" /></span>}
    </button>
  );
}

/**
 * kinds: the kinds whose category exists (the page filters PLG_KINDS).
 * cat / sort: what is chosen; onCat(slug) / onSort(key) choose. A sort card
 * chosen again goes back to the newest first.
 */
export default function PalengkeCards({
  kinds, cat, sort, onCat, onSort, isPhone,
}) {
  const size = isPhone ? 50 : 62;
  const row = useRef(null);
  // A chosen card past the screen's edge (an order, opened from a link):
  // the row starts scrolled to show it. The row only, never the page.
  useEffect(() => {
    const el = row.current;
    const on = el ? [...el.querySelectorAll('.plg-card.is-on')].pop() : null;
    if (!on) return;
    const past = on.offsetLeft + on.offsetWidth + 12 - el.clientWidth;
    if (past > el.scrollLeft) el.scrollLeft = past;
  }, []);
  return (
    <div ref={row} className="plg-cards notranslate" translate="no" role="toolbar" aria-label="Filter the palengke">
      {kinds.map((k) => (
        <Card
          key={k.slug || 'all'}
          on={cat === k.slug}
          label={k.label}
          art={k.art}
          pill={k.pill}
          size={size}
          onClick={() => onCat(k.slug)}
        />
      ))}
      <span className="plg-cards-gap" aria-hidden="true" />
      {PLG_ORDERS.map((o) => (
        <Card
          key={o.key}
          on={sort === o.key}
          label={o.label}
          art={o.art}
          pill={o.pill}
          size={size}
          onClick={() => onSort(sort === o.key ? '' : o.key)}
        />
      ))}
    </div>
  );
}
