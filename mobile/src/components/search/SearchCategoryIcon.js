import { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Stop } from 'react-native-svg';
import { ikionShapes } from '../../lib/ikionNative';
import { CATEGORY_ICONS as HOME_ICONS } from '../home/HomeCategoryIcon';

/*
 * A category's icon filled with its gradient (web/src/components/CategoryIcon.jsx,
 * web/src/lib/categoryIcons.js): Home's icon for it (HomeCategoryIcon), in
 * its filled drawing, light corner to deep. The shapes go in the same <Svg>
 * as the gradient (iOS/Android resolve url(#id) inside one drawing only).
 */

// [light, deep] per icon, and the words that pick it from a category's name.
export const CATEGORY_ICONS = {
  fruit: { colors: ['#fde047', '#f97316'], words: ['fruit', 'mango', 'banana', 'citrus', 'prutas'] },
  vegetable: { colors: ['#bef264', '#15803d'], words: ['vegetable', 'veggie', 'gulay'] },
  livestock: { colors: ['#fdba74', '#9a3412'], words: ['livestock', 'animal', 'cattle', 'goat', 'pig', 'duck', 'hayop'] },
  seafood: { colors: ['#67e8f9', '#1d4ed8'], words: ['seafood', 'fish', 'isda'] },
  shellfish: { colors: ['#fda4af', '#e11d48'], words: ['shrimp', 'crab', 'shellfish', 'hipon'] },
  processed: { colors: ['#fcd34d', '#c2410c'], words: ['processed', 'canned', 'preserve', 'jam', 'sauce', 'bottled'] },
  handicraft: { colors: ['#fbbf24', '#92400e'], words: ['handicraft', 'craft', 'woven', 'handmade', 'basket'] },
  delicacy: { colors: ['#f9a8d4', '#be185d'], words: ['delicac', 'kakanin', 'snack', 'sweet', 'dessert'] },
  dried: { colors: ['#fde68a', '#ea580c'], words: ['dried', 'tuyo', 'dilis', 'daing'] },
  beverage: { colors: ['#c4b5fd', '#6d28d9'], words: ['beverage', 'drink', 'coffee', 'juice', 'tea', 'inumin'] },
  meat: { colors: ['#fca5a5', '#b91c1c'], words: ['meat', 'poultry', 'chicken', 'pork', 'beef', 'karne'] },
  rice: { colors: ['#fef08a', '#a16207'], words: ['rice', 'grain', 'bigas', 'corn', 'mais'] },
  egg: { colors: ['#fef3c7', '#d97706'], words: ['egg', 'itlog'] },
  plant: { colors: ['#86efac', '#166534'], words: ['plant', 'seedling', 'garden', 'halaman'] },
  flower: { colors: ['#f5d0fe', '#a21caf'], words: ['flower', 'bulaklak'] },
  clothing: { colors: ['#a5b4fc', '#4338ca'], words: ['cloth', 'apparel', 'wear', 'shirt', 'damit'] },
  bakery: { colors: ['#fed7aa', '#c2410c'], words: ['bread', 'bake', 'pastry', 'tinapay'] },
  spice: { colors: ['#fca5a5', '#dc2626'], words: ['spice', 'pepper', 'condiment', 'sili'] },
  honey: { colors: ['#fde047', '#b45309'], words: ['honey', 'oil', 'syrup', 'pulot'] },
  gift: { colors: ['#f0abfc', '#9333ea'], words: ['gift', 'souvenir', 'pasalubong'] },
  home: { colors: ['#cbd5e1', '#334155'], words: ['home', 'furniture', 'decor'] },
  farm: { colors: ['#bbf7d0', '#166534'], words: ['farm', 'tool', 'equipment', 'fertilizer'] },
  shop: { colors: ['#6ee7b7', '#047857'], words: [] },
};

const KEYS = Object.keys(CATEGORY_ICONS);

/** The icon a category shows: its chosen one, else the first whose words are in its name or slug. */
export const categoryIconKey = (category) => {
  if (category?.icon && CATEGORY_ICONS[category.icon]) return category.icon;
  const text = `${category?.name || ''} ${category?.slug || ''}`.toLowerCase();
  return KEYS.find((key) => CATEGORY_ICONS[key].words.some((w) => text.includes(w))) || 'shop';
};


export default function SearchCategoryIcon({ category, iconKey, size = 40 }) {
  const key = iconKey && CATEGORY_ICONS[iconKey] ? iconKey : categoryIconKey(category);
  const [from, to] = CATEGORY_ICONS[key].colors;
  const id = `cat-grad-${key}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <G fill={`url(#${id})`}>{ikionShapes(HOME_ICONS[key].Icon, { paint: `url(#${id})` })}</G>
    </Svg>
  );
}
