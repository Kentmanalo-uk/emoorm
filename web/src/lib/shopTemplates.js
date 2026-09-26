/**
 * Shop templates for "Decorate my shop": ready-made colour pairs a seller
 * can apply in one tap. Applying one saves the shop's primary and accent
 * colours (the same fields as Shop profile → Shop colors), which is what the
 * storefront is painted with.
 *
 * `keywords` match category names, so the picker can recommend the template
 * that suits what the shop sells.
 */
export const SHOP_TEMPLATES = [
  {
    key: 'fresh',
    name: 'Fresh Market',
    tagline: 'Green and sunny, for farm-fresh food',
    primary: '#059669',
    secondary: '#F59E0B',
    keywords: ['vegetable', 'fruit', 'rice', 'farm', 'produce', 'grocery', 'food', 'meat', 'poultry', 'egg'],
  },
  {
    key: 'island',
    name: 'Island Blue',
    tagline: 'Sea and sky, for seafood and island goods',
    primary: '#0369A1',
    secondary: '#22D3EE',
    keywords: ['fish', 'seafood', 'marine', 'dried', 'shell', 'beach'],
  },
  {
    key: 'sunset',
    name: 'Sunset Crafts',
    tagline: 'Warm orange, for handmade crafts and gifts',
    primary: '#EA580C',
    secondary: '#FACC15',
    keywords: ['craft', 'handicraft', 'souvenir', 'art', 'gift', 'weave', 'native'],
  },
  {
    key: 'charcoal',
    name: 'Charcoal',
    tagline: 'Dark and sharp, for tools and gadgets',
    primary: '#111827',
    secondary: '#F59E0B',
    dark: true,
    keywords: ['electronic', 'gadget', 'tool', 'hardware', 'automotive', 'appliance'],
  },
  {
    key: 'blossom',
    name: 'Blossom Pink',
    tagline: 'Soft pink, for beauty, babies and fashion',
    primary: '#DB2777',
    secondary: '#F472B6',
    keywords: ['baby', 'kid', 'beauty', 'fashion', 'cloth', 'flower', 'apparel', 'cosmetic'],
  },
  {
    key: 'coffee',
    name: 'Coffee & Cacao',
    tagline: 'Rich brown, for coffee, cacao and woodwork',
    primary: '#92400E',
    secondary: '#D97706',
    keywords: ['coffee', 'cacao', 'chocolate', 'wood', 'furniture', 'bakery', 'bread', 'kakanin'],
  },
];

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** The template the shop is using now, or null for its own colours. */
export const templateInUse = (store) => SHOP_TEMPLATES.find(
  (t) => same(t.primary, store?.primaryColor) && same(t.secondary, store?.secondaryColor),
) || null;

/** The template that suits the shop's product categories best. */
export const recommendTemplate = (categoryNames = []) => {
  const names = categoryNames.map((n) => String(n || '').toLowerCase());
  return SHOP_TEMPLATES.find((t) => t.keywords.some((k) => names.some((n) => n.includes(k))))
    || SHOP_TEMPLATES[0];
};

export const findTemplate = (key) => SHOP_TEMPLATES.find((t) => t.key === key) || null;
