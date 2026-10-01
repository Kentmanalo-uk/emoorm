import {
  OrangeSlice, Carrot, Cow, Fish, Shrimp, Jar, Basket, Cookie, Sun, Coffee, ForkKnife,
  Grains, Egg, Plant, Flower, TShirt, Bread, Pepper, Drop, Gift, Armchair, Tractor, Storefront,
} from '@phosphor-icons/react';

/**
 * Icons for the homepage's icon style of "Shop by Category". Each has a
 * gradient (light corner → deep), words that pick it from a category's name,
 * and a label for the admin picker. The API accepts the same keys
 * (backend/src/utils/categoryIcons.js).
 */
export const CATEGORY_ICONS = {
  fruit: { label: 'Fruit', Icon: OrangeSlice, colors: ['#fde047', '#f97316'], words: ['fruit', 'mango', 'banana', 'citrus', 'prutas'] },
  vegetable: { label: 'Vegetables', Icon: Carrot, colors: ['#bef264', '#15803d'], words: ['vegetable', 'veggie', 'gulay'] },
  livestock: { label: 'Livestock', Icon: Cow, colors: ['#fdba74', '#9a3412'], words: ['livestock', 'animal', 'cattle', 'goat', 'pig', 'duck', 'hayop'] },
  seafood: { label: 'Seafood', Icon: Fish, colors: ['#67e8f9', '#1d4ed8'], words: ['seafood', 'fish', 'isda'] },
  shellfish: { label: 'Shrimp & shellfish', Icon: Shrimp, colors: ['#fda4af', '#e11d48'], words: ['shrimp', 'crab', 'shellfish', 'hipon'] },
  processed: { label: 'Jars & processed', Icon: Jar, colors: ['#fcd34d', '#c2410c'], words: ['processed', 'canned', 'preserve', 'jam', 'sauce', 'bottled'] },
  handicraft: { label: 'Handicrafts', Icon: Basket, colors: ['#fbbf24', '#92400e'], words: ['handicraft', 'craft', 'woven', 'handmade', 'basket'] },
  delicacy: { label: 'Delicacies & snacks', Icon: Cookie, colors: ['#f9a8d4', '#be185d'], words: ['delicac', 'kakanin', 'snack', 'sweet', 'dessert'] },
  dried: { label: 'Dried goods', Icon: Sun, colors: ['#fde68a', '#ea580c'], words: ['dried', 'tuyo', 'dilis', 'daing'] },
  beverage: { label: 'Drinks', Icon: Coffee, colors: ['#c4b5fd', '#6d28d9'], words: ['beverage', 'drink', 'coffee', 'juice', 'tea', 'inumin'] },
  meat: { label: 'Meat & poultry', Icon: ForkKnife, colors: ['#fca5a5', '#b91c1c'], words: ['meat', 'poultry', 'chicken', 'pork', 'beef', 'karne'] },
  rice: { label: 'Rice & grains', Icon: Grains, colors: ['#fef08a', '#a16207'], words: ['rice', 'grain', 'bigas', 'corn', 'mais'] },
  egg: { label: 'Eggs', Icon: Egg, colors: ['#fef3c7', '#d97706'], words: ['egg', 'itlog'] },
  plant: { label: 'Plants', Icon: Plant, colors: ['#86efac', '#166534'], words: ['plant', 'seedling', 'garden', 'halaman'] },
  flower: { label: 'Flowers', Icon: Flower, colors: ['#f5d0fe', '#a21caf'], words: ['flower', 'bulaklak'] },
  clothing: { label: 'Clothing', Icon: TShirt, colors: ['#a5b4fc', '#4338ca'], words: ['cloth', 'apparel', 'wear', 'shirt', 'damit'] },
  bakery: { label: 'Bread & bakery', Icon: Bread, colors: ['#fed7aa', '#c2410c'], words: ['bread', 'bake', 'pastry', 'tinapay'] },
  spice: { label: 'Spices', Icon: Pepper, colors: ['#fca5a5', '#dc2626'], words: ['spice', 'pepper', 'condiment', 'sili'] },
  honey: { label: 'Honey & oils', Icon: Drop, colors: ['#fde047', '#b45309'], words: ['honey', 'oil', 'syrup', 'pulot'] },
  gift: { label: 'Gifts & pasalubong', Icon: Gift, colors: ['#f0abfc', '#9333ea'], words: ['gift', 'souvenir', 'pasalubong'] },
  home: { label: 'Home & decor', Icon: Armchair, colors: ['#cbd5e1', '#334155'], words: ['home', 'furniture', 'decor'] },
  farm: { label: 'Farm supplies', Icon: Tractor, colors: ['#bbf7d0', '#166534'], words: ['farm', 'tool', 'equipment', 'fertilizer'] },
  shop: { label: 'General', Icon: Storefront, colors: ['#6ee7b7', '#047857'], words: [] },
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

/**
 * The icon key a category shows: its chosen one, else the first whose words
 * appear in its name or slug, else the general shop icon.
 * @param {{icon?: String|null, name?: String, slug?: String}} category
 * @returns {String}
 */
export const categoryIconKey = (category) => {
  if (category?.icon && CATEGORY_ICONS[category.icon]) return category.icon;
  const text = `${category?.name || ''} ${category?.slug || ''}`.toLowerCase();
  const match = CATEGORY_ICON_KEYS.find((key) => CATEGORY_ICONS[key].words.some((w) => text.includes(w)));
  return match || 'shop';
};
