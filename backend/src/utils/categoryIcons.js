/**
 * Icon keys a category may use on the homepage's icon style. The web draws
 * each one (web/src/lib/categoryIcons.js keeps the same keys); the API only
 * checks a key is one of these.
 */
const CATEGORY_ICON_KEYS = [
  'fruit', 'vegetable', 'livestock', 'seafood', 'shellfish', 'processed', 'handicraft',
  'delicacy', 'dried', 'beverage', 'meat', 'rice', 'egg', 'plant', 'flower', 'clothing',
  'bakery', 'spice', 'honey', 'gift', 'home', 'farm', 'shop',
];

module.exports = { CATEGORY_ICON_KEYS };
