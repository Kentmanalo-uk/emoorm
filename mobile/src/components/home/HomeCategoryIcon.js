import Svg, { Defs, G, LinearGradient, Stop } from 'react-native-svg';
import {
  ArmchairIcon, BasketIcon, BreadIcon, CarrotIcon, CoffeeIcon, CookieIcon, CowIcon, DropIcon, EggIcon,
  FishIcon, FlowerIcon, ForkKnifeIcon, GiftIcon, GrainsIcon, JarIcon, OrangeSliceIcon, PepperIcon,
  PlantIcon, ShrimpIcon, StorefrontIcon, SunIcon, TShirtIcon, TractorIcon,
} from 'phosphor-react-native';

/*
 * Home's "Shop by Category" icons (web/src/lib/categoryIcons.js and
 * web/src/components/CategoryIcon.jsx): each category's Phosphor icon in its
 * fill weight, filled with its gradient (light corner → deep).
 */
export const CATEGORY_ICONS = {
  fruit: { Icon: OrangeSliceIcon, colors: ['#fde047', '#f97316'], words: ['fruit', 'mango', 'banana', 'citrus', 'prutas'] },
  vegetable: { Icon: CarrotIcon, colors: ['#bef264', '#15803d'], words: ['vegetable', 'veggie', 'gulay'] },
  livestock: { Icon: CowIcon, colors: ['#fdba74', '#9a3412'], words: ['livestock', 'animal', 'cattle', 'goat', 'pig', 'duck', 'hayop'] },
  seafood: { Icon: FishIcon, colors: ['#67e8f9', '#1d4ed8'], words: ['seafood', 'fish', 'isda'] },
  shellfish: { Icon: ShrimpIcon, colors: ['#fda4af', '#e11d48'], words: ['shrimp', 'crab', 'shellfish', 'hipon'] },
  processed: { Icon: JarIcon, colors: ['#fcd34d', '#c2410c'], words: ['processed', 'canned', 'preserve', 'jam', 'sauce', 'bottled'] },
  handicraft: { Icon: BasketIcon, colors: ['#fbbf24', '#92400e'], words: ['handicraft', 'craft', 'woven', 'handmade', 'basket'] },
  delicacy: { Icon: CookieIcon, colors: ['#f9a8d4', '#be185d'], words: ['delicac', 'kakanin', 'snack', 'sweet', 'dessert'] },
  dried: { Icon: SunIcon, colors: ['#fde68a', '#ea580c'], words: ['dried', 'tuyo', 'dilis', 'daing'] },
  beverage: { Icon: CoffeeIcon, colors: ['#c4b5fd', '#6d28d9'], words: ['beverage', 'drink', 'coffee', 'juice', 'tea', 'inumin'] },
  meat: { Icon: ForkKnifeIcon, colors: ['#fca5a5', '#b91c1c'], words: ['meat', 'poultry', 'chicken', 'pork', 'beef', 'karne'] },
  rice: { Icon: GrainsIcon, colors: ['#fef08a', '#a16207'], words: ['rice', 'grain', 'bigas', 'corn', 'mais'] },
  egg: { Icon: EggIcon, colors: ['#fef3c7', '#d97706'], words: ['egg', 'itlog'] },
  plant: { Icon: PlantIcon, colors: ['#86efac', '#166534'], words: ['plant', 'seedling', 'garden', 'halaman'] },
  flower: { Icon: FlowerIcon, colors: ['#f5d0fe', '#a21caf'], words: ['flower', 'bulaklak'] },
  clothing: { Icon: TShirtIcon, colors: ['#a5b4fc', '#4338ca'], words: ['cloth', 'apparel', 'wear', 'shirt', 'damit'] },
  bakery: { Icon: BreadIcon, colors: ['#fed7aa', '#c2410c'], words: ['bread', 'bake', 'pastry', 'tinapay'] },
  spice: { Icon: PepperIcon, colors: ['#fca5a5', '#dc2626'], words: ['spice', 'pepper', 'condiment', 'sili'] },
  honey: { Icon: DropIcon, colors: ['#fde047', '#b45309'], words: ['honey', 'oil', 'syrup', 'pulot'] },
  gift: { Icon: GiftIcon, colors: ['#f0abfc', '#9333ea'], words: ['gift', 'souvenir', 'pasalubong'] },
  home: { Icon: ArmchairIcon, colors: ['#cbd5e1', '#334155'], words: ['home', 'furniture', 'decor'] },
  farm: { Icon: TractorIcon, colors: ['#bbf7d0', '#166534'], words: ['farm', 'tool', 'equipment', 'fertilizer'] },
  shop: { Icon: StorefrontIcon, colors: ['#6ee7b7', '#047857'], words: [] },
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

/**
 * The icon key a category shows: its chosen one, else the first whose words
 * appear in its name or slug, else the general shop icon.
 */
export const categoryIconKey = (category) => {
  if (category?.icon && CATEGORY_ICONS[category.icon]) return category.icon;
  const words = `${category?.name || ''} ${category?.slug || ''}`.toLowerCase();
  const match = CATEGORY_ICON_KEYS.find((key) => CATEGORY_ICONS[key].words.some((w) => words.includes(w)));
  return match || 'shop';
};

// A Phosphor icon's filled paths (its 256-unit drawing), to fill with a
// gradient inside our own <Svg> (as EmptyArt does): an icon component
// cannot carry a gradient on Android/iOS.
const iconPaths = (Icon) => Icon({}).props.weights.get('fill');

/** A category's icon, filled with its gradient. */
export default function HomeCategoryIcon({ category, iconKey, size = 40, style }) {
  const key = iconKey && CATEGORY_ICONS[iconKey] ? iconKey : categoryIconKey(category);
  const { Icon, colors: [from, to] } = CATEGORY_ICONS[key];
  const id = `home-cat-grad-${key}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" style={style} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <G fill={`url(#${id})`}>{iconPaths(Icon)}</G>
    </Svg>
  );
}
