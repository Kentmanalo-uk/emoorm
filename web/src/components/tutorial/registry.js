import {
  Opening, WhatIs, WhatToSell, Sellers, Start, AddProduct, Journey, Local, Success, Cta,
} from './scenes';

// The scenes by chapter key (timeline.json), and every picture they show.
export const SCENES = {
  open: Opening, what: WhatIs, sell: WhatToSell, who: Sellers, start: Start, add: AddProduct, journey: Journey, local: Local, success: Success, cta: Cta,
};

const SHOT = (name) => `/tutorial/${name}.webp`;
const ASSET = (name) => `/assets/${name}`;

/** Every picture the tutorial shows, to load before it plays. */
export const PRELOAD = [
  ...['register', 'sell-steps', 'store', 'store-products', 'search', 'product-mango', 'product-hens', 'product-hens-rows', 'cart', 'checkout', 'orders', 'apply',
    'seller-home', 'seller-products', 'seller-orders', 'seller-notifications', 'form-basics', 'form-details', 'form-ready', 'form-animal', 'form-review',
    'live-home', 'live-municipals', 'live-stores', 'photo-mango', 'photo-vegetables', 'photo-onions', 'photo-hens', 'photo-shrimp', 'photo-seafood'].map(SHOT),
  ...['fruits.jpg', 'seafood.jpg', 'handicrafts.jpg', 'wellness.jpg', 'vegetables.jpg'].map(ASSET),
  '/brand-icon.png',
];

