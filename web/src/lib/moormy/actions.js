import { saleInfo } from '../variantPricing';
import { parseImages } from '../media';
import { productKind } from '../productKinds';

/**
 * Moormy's actions (docs/moormy, Phase 5). The server only proposes them
 * ({ type: 'navigate' | 'cart_add' | 'cart_remove' }); the page decides what
 * it may do and does it with its own router and cart, the same way its own
 * buttons do. planActions is pure: it turns proposals into steps.
 *
 * Steps:
 *   { kind: 'go', to }                    go there now
 *   { kind: 'link', to, label }           a button; the person decides
 *   { kind: 'signIn', to, why }           a Sign in button (why: 'cart' | 'page')
 *   { kind: 'add', productId, quantity, product }
 *   { kind: 'choose', to, product }       options to pick: open its page
 *   { kind: 'offer', to, product }        live animals: make an offer on its page
 *   { kind: 'confirmRemove', productId, name }   asked in the panel first
 *
 * Never: placing, paying for or cancelling an order. Nothing here can.
 */

/** Only this site's own pages: "/cart", never "//evil.example" or "https:…". */
export const safePath = (to) => (typeof to === 'string' && /^\/(?!\/)[^\s\\]*$/.test(to) && to.length <= 300 ? to : null);

const isLogin = (to) => /^\/login(?:[/?#]|$)/.test(to);

/** The sign-in page, coming back here afterwards. */
export const signInPath = (route = '/') => {
  const back = safePath(route) || '/';
  return back === '/' ? '/login' : `/login?redirect=${encodeURIComponent(back)}`;
};

const hasOptions = (product) => Array.isArray(product?.variations) && product.variations.length > 0;

/**
 * Turn the server's proposals into steps.
 * @param {Object[]} actions - from the turn
 * @param {{ signedIn: boolean, cards?: Object[], cartItems?: Object[], route?: string }} ctx
 */
export const planActions = (actions, {
  signedIn = false, cards = [], cartItems = [], route = '/',
} = {}) => {
  const steps = [];
  const byId = new Map((cards || []).map((p) => [p.id, p]));
  let went = false;
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'navigate') {
      const to = safePath(a.to);
      if (!to) continue;
      if (isLogin(to)) {
        // "Please sign in first": a button, coming back to this page.
        if (!signedIn) steps.push({ kind: 'signIn', to: signInPath(route), why: 'page' });
      } else if (a.optional || went) {
        steps.push({ kind: 'link', to, label: a.label || null });
      } else {
        steps.push({ kind: 'go', to, place: a.place || null });
        went = true;
      }
    } else if (a.type === 'cart_add') {
      const product = byId.get(a.productId);
      if (!product) continue;
      const to = `/product/${product.slug}`;
      if (!signedIn) {
        steps.push({ kind: 'signIn', to: signInPath(route), why: 'cart', product });
      } else if (productKind(product) === 'LIVESTOCK') {
        steps.push({ kind: 'offer', to, product });
      } else if (hasOptions(product)) {
        steps.push({ kind: 'choose', to, product });
      } else {
        steps.push({
          kind: 'add', productId: product.id, quantity: Math.max(1, Math.min(999, parseInt(a.quantity, 10) || 1)), product,
        });
      }
    } else if (a.type === 'cart_remove') {
      // Only what is in the cart, and only after a yes in the panel.
      const inCart = (cartItems || []).find((l) => (l.productId || String(l.id).split(':')[0]) === a.productId);
      if (!inCart) continue;
      const name = byId.get(a.productId)?.name || inCart.name || 'this item';
      steps.push({ kind: 'confirmRemove', productId: a.productId, name });
    }
  }
  return steps;
};

/**
 * A product card from Moormy as a cart line: what the search page's quick
 * add puts in the cart (pages/Products.jsx), so the cart cannot tell them
 * apart. Products with options never come here (they open their page).
 */
export const cartLineFor = (product) => ({
  id: product.id,
  productId: product.id,
  name: product.name,
  price: saleInfo(product).price,
  image: parseImages(product.images)[0] || '/placeholder-product.png',
  storeId: product.storeId || product.store?.id,
  storeName: product.store?.name,
  storeLogo: product.store?.logoUrl || product.store?.logo || null,
  readyToSell: product.store?.readyToSell,
  vacationUntil: product.store?.vacationUntil,
  stock: product.stock,
  listingKind: product.listingKind,
  availability: product.availability,
  productType: product.productType,
  details: product.details,
  fulfillment: product.fulfillment,
  weightGrams: product.weightGrams,
  packageItems: product.packageItems,
  slug: product.slug,
  categoryId: product.categoryId,
  selectedVariations: null,
});

/**
 * Carry out the steps that need no question. Returns notes for the panel:
 * { kind, ok, text?, to? }. `cart` is the cart store's state (addItem),
 * `navigate` the router's.
 */
export const runSteps = (steps, { cart, navigate }) => {
  const notes = [];
  for (const step of steps) {
    if (step.kind === 'go') {
      navigate(step.to);
      notes.push({ kind: 'go', ok: true, to: step.to });
    } else if (step.kind === 'add') {
      try {
        cart.addItem(cartLineFor(step.product), step.quantity);
        notes.push({ kind: 'add', ok: true, text: `Added to your cart: ${step.product.name}${step.quantity > 1 ? ` × ${step.quantity}` : ''}.` });
      } catch (err) {
        notes.push({ kind: 'add', ok: false, text: err?.message || "Couldn't add it to your cart." });
      }
    } else if (step.kind === 'choose') {
      navigate(step.to);
      notes.push({ kind: 'choose', ok: false, to: step.to, text: `${step.product.name} has options. Pick one on its page, then add it to your cart.` });
    } else if (step.kind === 'offer') {
      navigate(step.to);
      notes.push({ kind: 'offer', ok: false, to: step.to, text: 'Live animals are bought by making an offer to the seller on their page.' });
    } else if (step.kind === 'signIn' && step.why === 'cart') {
      notes.push({ kind: 'signIn', ok: false, text: `Sign in first, then I can add ${step.product?.name || 'it'} to your cart.` });
    }
  }
  return notes;
};

/**
 * What she says after the page acted. A cart add that did not happen (a
 * guest, options to pick, the cart refused) is said in the page's words
 * instead of hers ("Adding … to your cart" would not be true); English, so
 * the site's translator can turn it into Tagalog. Otherwise her words, with
 * what the page did added to what is read aloud.
 */
export const replyFor = (d, notes) => {
  const instead = d?.intent === 'cart_add' && notes.find((n) => !n.ok && n.text && ['signIn', 'choose', 'offer', 'add'].includes(n.kind));
  if (instead) {
    return {
      text: instead.text, speak: instead.text, lang: 'en', notes: notes.filter((n) => n !== instead),
    };
  }
  const extra = notes.filter((n) => n.text).map((n) => n.text);
  return {
    text: d?.say || '',
    speak: [d?.speak || d?.say, ...extra].filter(Boolean).join(' '),
    lang: d?.lang === 'tl' ? 'tl' : 'en',
    notes,
  };
};
