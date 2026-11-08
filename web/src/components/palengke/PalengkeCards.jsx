import { useEffect, useRef } from 'react';
import { Check } from '../../lib/icons';
import {
  BasketArt, FishArt, LivestockArt, PiggyArt, TONES, TrendArt,
} from '../art/FlatArt';
import useShortcutLook from '../../hooks/useShortcutLook';
import { GulayMark, PrutasMark } from './PalengkeMarks';

/*
 * The cards under the carousel: what kind of produce (a category, by slug,
 * as GET /products?categorySlug= takes it) and two ways to order the list.
 * The marks are the Home shortcuts' own, in the look the super admin chose
 * for them (glass or 3D, useShortcutLook). The rest is flat: a pill in one
 * deep shade of the mark's hue that white reads on, a pale wash of its tint
 * behind the card (a stronger one when chosen).
 */
// eslint-disable-next-line react-refresh/only-export-components
export const PLG_KINDS = [
  { slug: '', label: 'Lahat', name: 'Everything', art: (s, look) => <BasketArt size={s} look={look} />, color: '#047857', tint: TONES.green[0] },
  { slug: 'vegetables', label: 'Gulay', name: 'Vegetables', art: (s, look) => <GulayMark size={s} look={look} />, color: '#15803D', tint: TONES.emerald[0] },
  { slug: 'fruits', label: 'Prutas', name: 'Fruits', art: (s, look) => <PrutasMark size={s} look={look} />, color: '#C2410C', tint: TONES.orange[0] },
  { slug: 'seafood', label: 'Seafood', name: 'Seafood', art: (s, look) => <FishArt size={s} look={look} />, color: '#0369A1', tint: TONES.sky[0] },
  { slug: 'livestock', label: 'Hayop', name: 'Livestock', art: (s, look) => <LivestockArt size={s} look={look} />, color: '#B45309', tint: TONES.amber[0] },
];

// eslint-disable-next-line react-refresh/only-export-components
export const PLG_ORDERS = [
  // A soft hyphen: the long word may break in the pill on phones.
  { key: 'top-sales', label: 'Pinaka­mabenta', art: (s, look) => <TrendArt size={s} look={look} />, color: '#B91C1C', tint: TONES.red[0] },
  { key: 'price-low', label: 'Pinaka­mura', art: (s, look) => <PiggyArt size={s} look={look} />, color: '#6D28D9', tint: TONES.violet[0] },
];

function Card({
  on, label, art, color, tint, onClick, size, look,
}) {
  return (
    <button
      type="button"
      className={`plg-card${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={onClick}
      style={{ '--c': color, '--l': tint }}
    >
      <span className="plg-card-art">{art(size, look)}</span>
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
  const look = useShortcutLook();
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
          color={k.color}
          tint={k.tint}
          size={size}
          look={look}
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
          color={o.color}
          tint={o.tint}
          size={size}
          look={look}
          onClick={() => onSort(sort === o.key ? '' : o.key)}
        />
      ))}
    </div>
  );
}
