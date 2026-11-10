import { describe, expect, it, vi } from 'vitest';
import {
  planActions, runSteps, safePath, signInPath, cartLineFor, replyFor,
} from '../moormy/actions';
import { pickVoice, speakable, hearLang } from '../moormy/speech';

const card = (over = {}) => ({
  id: 'p1',
  name: 'Bibingka',
  slug: 'bibingka',
  price: '180',
  salePrice: null,
  stock: 10,
  listingKind: 'REGULAR',
  productType: 'REGULAR',
  images: ['/uploads/a.jpg'],
  variations: null,
  storeId: 's1',
  store: { id: 's1', name: 'Crafts Hub', readyToSell: true },
  ...over,
});

describe('safePath', () => {
  it('keeps the site’s own pages only', () => {
    expect(safePath('/cart')).toBe('/cart');
    expect(safePath('/profile/orders?id=1')).toBe('/profile/orders?id=1');
    expect(safePath('//evil.example')).toBeNull();
    expect(safePath('https://evil.example')).toBeNull();
    expect(safePath('javascript:alert(1)')).toBeNull();
    expect(safePath('/a b')).toBeNull();
    expect(safePath(null)).toBeNull();
  });

  it('signs in and comes back', () => {
    expect(signInPath('/')).toBe('/login');
    expect(signInPath('/search?q=rice')).toBe('/login?redirect=%2Fsearch%3Fq%3Drice');
    expect(signInPath('//evil')).toBe('/login');
  });
});

describe('planActions: navigate', () => {
  it('goes at once, unless optional (a button)', () => {
    expect(planActions([{ type: 'navigate', to: '/cart', place: 'cart' }])).toEqual([{ kind: 'go', to: '/cart', place: 'cart' }]);
    expect(planActions([{ type: 'navigate', to: '/profile/orders', label: 'My orders', optional: true }]))
      .toEqual([{ kind: 'link', to: '/profile/orders', label: 'My orders' }]);
  });

  it('never follows an outside address', () => {
    expect(planActions([{ type: 'navigate', to: 'https://evil.example' }])).toEqual([]);
  });

  it('only one page at a time: the rest become buttons', () => {
    const steps = planActions([{ type: 'navigate', to: '/cart' }, { type: 'navigate', to: '/stores' }]);
    expect(steps.map((s) => s.kind)).toEqual(['go', 'link']);
  });

  it('"sign in first" is a button that comes back here, not a jump', () => {
    expect(planActions([{ type: 'navigate', to: '/login', label: 'Sign in' }], { signedIn: false, route: '/cart' }))
      .toEqual([{ kind: 'signIn', to: '/login?redirect=%2Fcart', why: 'page' }]);
    expect(planActions([{ type: 'navigate', to: '/login' }], { signedIn: true })).toEqual([]);
  });
});

describe('planActions: cart', () => {
  const add = [{ type: 'cart_add', productId: 'p1', quantity: 2 }];

  it('adds for a signed-in shopper', () => {
    const [step] = planActions(add, { signedIn: true, cards: [card()] });
    expect(step).toMatchObject({ kind: 'add', productId: 'p1', quantity: 2 });
  });

  it('asks a guest to sign in instead', () => {
    const [step] = planActions(add, { signedIn: false, cards: [card()], route: '/search?q=x' });
    expect(step).toMatchObject({ kind: 'signIn', why: 'cart', to: '/login?redirect=%2Fsearch%3Fq%3Dx' });
  });

  it('opens the product when an option must be picked, or an offer made', () => {
    const [choose] = planActions(add, { signedIn: true, cards: [card({ variations: [{ name: 'Size', options: ['S', 'L'] }] })] });
    expect(choose).toMatchObject({ kind: 'choose', to: '/product/bibingka' });
    const [offer] = planActions(add, { signedIn: true, cards: [card({ productType: 'LIVESTOCK' })] });
    expect(offer).toMatchObject({ kind: 'offer', to: '/product/bibingka' });
  });

  it('ignores a product it was not shown', () => {
    expect(planActions(add, { signedIn: true, cards: [] })).toEqual([]);
  });

  it('removing asks first, and only for what is in the cart', () => {
    const remove = [{ type: 'cart_remove', productId: 'p1', confirm: true }];
    expect(planActions(remove, { cards: [card()], cartItems: [{ id: 'p1:', productId: 'p1', name: 'Bibingka' }] }))
      .toEqual([{ kind: 'confirmRemove', productId: 'p1', name: 'Bibingka' }]);
    expect(planActions(remove, { cards: [card()], cartItems: [] })).toEqual([]);
  });

  it('drops anything it does not know', () => {
    expect(planActions([{ type: 'place_order' }, null, 'x'], { signedIn: true })).toEqual([]);
    expect(planActions(undefined)).toEqual([]);
  });
});

describe('runSteps', () => {
  it('goes, adds, and reports what it could not do', () => {
    const navigate = vi.fn();
    const added = [];
    const cart = { addItem: (line, q) => added.push([line.productId, q, line.price]) };
    const notes = runSteps([
      { kind: 'go', to: '/cart' },
      { kind: 'add', productId: 'p1', quantity: 1, product: card() },
      { kind: 'signIn', why: 'cart', to: '/login' },
      { kind: 'confirmRemove', productId: 'p1', name: 'Bibingka' },
    ], { cart, navigate });
    expect(navigate).toHaveBeenCalledWith('/cart');
    expect(added).toEqual([['p1', 1, 180]]);
    expect(notes.map((n) => [n.kind, n.ok])).toEqual([['go', true], ['add', true], ['signIn', false]]);
  });

  it('passes on the cart’s own refusal', () => {
    const cart = { addItem: () => { throw new Error("This shop isn't taking orders yet"); } };
    const [note] = runSteps([{ kind: 'add', productId: 'p1', quantity: 1, product: card() }], { cart, navigate: () => {} });
    expect(note).toEqual({ kind: 'add', ok: false, text: "This shop isn't taking orders yet" });
  });

  it('builds the same line as the search page’s quick add', () => {
    const line = cartLineFor(card({ salePrice: '150' }));
    expect(line).toMatchObject({
      id: 'p1', productId: 'p1', name: 'Bibingka', storeId: 's1', storeName: 'Crafts Hub', readyToSell: true, slug: 'bibingka', selectedVariations: null,
    });
    expect(typeof line.price).toBe('number');
  });
});

describe('replyFor', () => {
  const d = {
    intent: 'cart_add', lang: 'tl', say: 'Idadagdag ko ang Bibingka sa cart mo.', speak: 'Idadagdag ko ang Bibingka sa cart mo.',
  };

  it('a guest is told to sign in, not that it is being added', () => {
    const notes = runSteps([{ kind: 'signIn', why: 'cart', product: card() }], { cart: {}, navigate: () => {} });
    const r = replyFor(d, notes);
    expect(r.text).toBe('Sign in first, then I can add Bibingka to your cart.');
    expect(r.speak).toBe(r.text);
    expect(r.lang).toBe('en');
    expect(r.notes).toEqual([]);
  });

  it('a done add keeps her words and reads the note too', () => {
    const notes = runSteps([{ kind: 'add', productId: 'p1', quantity: 1, product: card() }], { cart: { addItem: () => {} }, navigate: () => {} });
    const r = replyFor(d, notes);
    expect(r.text).toBe(d.say);
    expect(r.lang).toBe('tl');
    expect(r.speak).toBe(`${d.say} Added to your cart: Bibingka.`);
    expect(r.notes).toHaveLength(1);
  });

  it('other answers are hers as they are', () => {
    expect(replyFor({ intent: 'search', lang: 'en', say: 'Found 3.' }, [])).toEqual({
      text: 'Found 3.', speak: 'Found 3.', lang: 'en', notes: [],
    });
  });
});

describe('speech helpers', () => {
  it('hears Filipino when she speaks Tagalog', () => {
    expect(hearLang('tl')).toBe('fil-PH');
    expect(hearLang('en')).toBe('en-PH');
    expect(hearLang(undefined)).toBe('en-PH');
  });

  it('picks a fitting voice', () => {
    const voices = [{ lang: 'en-US', name: 'US' }, { lang: 'fil-PH', name: 'Fil' }, { lang: 'en-PH', name: 'PH' }];
    expect(pickVoice(voices, 'tl').name).toBe('Fil');
    expect(pickVoice(voices, 'en').name).toBe('PH');
    expect(pickVoice([{ lang: 'en-GB', name: 'GB' }], 'tl')).toBeNull();
    expect(pickVoice([], 'en')).toBeNull();
  });

  it('reads prices and bold words naturally', () => {
    expect(speakable('**Bibingka** is ₱180.00 now')).toBe('Bibingka is 180.00 pesos now');
  });
});
