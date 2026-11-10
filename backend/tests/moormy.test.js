const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { understand, pricesOf, wordsToNumber } = require('../src/moormy/understand');
const engine = require('../src/moormy/engine');

after(h.cleanup);

// Letters only: the request reader drops numbers as prices.
const tag = `q${h.RUN}`.replace(/\d/g, (d) => 'abcdefghij'[d]);

const ref = {
  towns: [{ id: 't1', name: 'Bongabong' }, { id: 't2', name: 'Calapan City' }],
  categories: [{ id: 'c1', name: 'Seafood' }, { id: 'c2', name: 'Local Delicacies' }],
};

test('understanding: the blueprint\'s example requests', () => {
  const cases = [
    ['Find me something sweet.', 'search', { query: 'sweet' }],
    ['Show me local products.', 'search', {}],
    ['Do you have anything under one hundred pesos?', 'search', { maxPrice: 100 }],
    ['Find me a gift for my mother.', 'search', { query: 'gift' }],
    ['Which one is cheaper?', 'compare', {}],
    ['Can you compare these two?', 'compare', {}],
    ['Show me the best-rated products.', 'search', { sort: 'rating' }],
    ['Add this to my cart.', 'cart_add', { pointsHere: true }],
    ['Where is my order?', 'orders', {}],
    ['Take me to my shopping cart.', 'navigate', { to: '/cart' }],
    ['Show me cheaper ones.', 'cheaper', {}],
    ['Find something similar but cheaper', 'similar', { cheaper: true }],
    ['Is this good for gifts?', 'about', {}],
    ['Can you remove the last item?', 'cart_remove', { ordinal: -1 }],
    ['Hey Moormy, find me sweet products under 100 pesos', 'search', { query: 'sweet', maxPrice: 100 }],
  ];
  for (const [text, intent, expected] of cases) {
    const u = understand(text, ref);
    assert.equal(u.intent, intent, text);
    for (const [k, v] of Object.entries(expected)) assert.equal(u[k], v, `${text}: ${k}`);
  }
});

test('understanding: Tagalog, towns, categories, prices in words', () => {
  const u = understand('May seafood ba galing Calapan na 200 pababa?', ref);
  assert.equal(u.intent, 'search');
  assert.equal(u.category.name, 'Seafood');
  assert.equal(u.town.name, 'Calapan City');
  assert.equal(u.maxPrice, 200);
  assert.equal(u.query, '');
  assert.equal(understand('Nasaan na ang order ko?', ref).intent, 'orders');
  assert.equal(understand('Paano magbayad gamit GCash?', ref).intent, 'guide');
  assert.equal(understand('Idagdag ang pangalawa sa cart', ref).ordinal, 2);
  assert.equal(understand('pasalubong na mura', ref).sort, 'cheapest');
  assert.equal(understand('hi moormy', ref).intent, 'greeting');
  assert.equal(wordsToNumber('one hundred fifty'), 150);
  assert.equal(wordsToNumber('dalawang daan'), 200);
  assert.equal(wordsToNumber('isang libo'), 1000);
  assert.deepEqual(pricesOf('between 100 and 250 pesos'), { minPrice: 100, maxPrice: 250 });
  assert.deepEqual(pricesOf('over 500'), { minPrice: 500, maxPrice: null });
  assert.equal(pricesOf('budget ko 1.5k').maxPrice, 1500);
});

const seller = h.user('SELLER');
const shopP = seller.then((s) => h.shop(s));
const make = async (name, price, extra = {}) => h.product(await shopP, {
  name: `${name} ${tag}`, price, description: `${name}. A local favourite. ${tag}`, ...extra,
});
const turn = (text, state = {}, context = {}, user = null) => engine.turn({
  text, state, context: { pageType: 'home', ...context }, user,
});

test('search, cheaper, more: real products at their real prices, the conversation remembered', async () => {
  const yema = await make('Yema Sweets', 90);
  const jam = await make('Mango Jam Sweets', 150);
  const tart = await make('Ube Tart Sweets', 250);
  const r = await turn(`sweets ${tag}`);
  assert.equal(r.intent, 'search');
  const ids = r.cards.map((c) => c.id);
  assert.deepEqual([...ids].sort(), [yema.id, jam.id, tart.id].sort());
  // Every card is a real, published product at its stored price.
  for (const c of r.cards) {
    // eslint-disable-next-line no-await-in-loop
    const row = await h.prisma.product.findUnique({ where: { id: c.id } });
    assert.equal(Number(c.price), Number(row.price));
  }
  assert.deepEqual(r.state.lastSearch.query, `sweets ${tag}`);

  const under = await turn(`sweets ${tag} under 200`);
  assert.ok(under.cards.every((c) => Number(c.price) <= 200));
  assert.ok(!under.cards.some((c) => c.id === tart.id));

  // "Cheaper ones": below the middle of what was shown, cheapest first.
  const cheaper = await turn('Show me cheaper ones', r.state);
  assert.equal(cheaper.intent, 'cheaper');
  assert.ok(cheaper.cards.length >= 1);
  assert.ok(cheaper.cards.every((c) => Number(c.price) < 150));
  assert.equal(cheaper.cards[0].id, yema.id);

  // Nothing at all: said plainly, nothing invented.
  const none = await turn(`zzqqxx ${tag}vv`);
  assert.equal(none.cards.length, 0);
  assert.match(none.say, /couldn't find|Nothing/);
  // "Cheaper" after nothing was found: no claim about what is cheapest.
  const after = await turn('cheaper', none.state);
  assert.equal(after.intent, 'cheaper');
  assert.equal(after.cards.length, 0);
  assert.match(after.say, /Nothing is showing yet/);
  // After a comparison, she does not offer the same comparison again.
  const cmp = await turn('compare the first and second', r.state);
  assert.equal(cmp.intent, 'compare');
  assert.ok(!cmp.suggestions.some((s) => /compare/i.test(s)));
});

test('compare and "about": facts from the records, ordinals into what was shown', async () => {
  const a = await make('Coco Vinegar Bottle', 80);
  const b = await make('Coco Vinegar Gallon', 200, { stock: 0 });
  const found = await turn(`coco vinegar ${tag}`, {}, {});
  const state = found.state;
  const cmp = await turn('compare the first and second', state);
  assert.equal(cmp.intent, 'compare');
  assert.equal(cmp.compare.products.length, 2);
  assert.match(cmp.say, /₱120 cheaper/);
  assert.match(cmp.say, new RegExp(a.name.split(' ')[0]));

  // On a product page: "how much is this", "is it in stock".
  const price = await turn('how much is this?', {}, { pageType: 'product', productId: b.id });
  assert.equal(price.intent, 'about');
  assert.match(price.say, /₱200/);
  const stock = await turn('is this in stock?', {}, { pageType: 'product', productId: b.id });
  assert.match(stock.say, /out of stock/);
  // "Tell me about the second one" points into the list shown.
  const second = state.shown[1];
  const about = await turn('tell me about the second one', state);
  assert.equal(about.cards[0].id, second);
});

test('cart: totals from the database, add only what can be sold, remove asks first', async () => {
  const p = await make('Banana Chips Pack', 60);
  const q = await make('Dried Fish Pack', 140);
  // The page says the price is ₱1: the server reads the real one.
  const view = await turn('what is in my cart', {}, { cart: [{ productId: p.id, quantity: 2, price: 1 }, { productId: q.id, quantity: 1 }] });
  assert.equal(view.intent, 'cart_view');
  assert.equal(view.cart.total, 260);
  assert.equal(view.cart.items, 3);

  const add = await turn('add this to my cart', {}, { pageType: 'product', productId: q.id });
  assert.equal(add.intent, 'cart_add');
  const card = add.cards[0];
  if (card.store.readyToSell === false) {
    assert.equal(add.actions.length, 0);
    assert.match(add.say, /can't be added/);
  } else {
    assert.deepEqual(add.actions, [{ type: 'cart_add', productId: q.id, quantity: 1 }]);
  }

  const remove = await turn('remove the last item', {}, { pageType: 'cart', cart: [{ productId: p.id, quantity: 2 }, { productId: q.id, quantity: 1 }] });
  assert.equal(remove.intent, 'cart_remove');
  assert.deepEqual(remove.actions, [{ type: 'cart_remove', productId: q.id, confirm: true }]);
  assert.match(remove.say, /Remove .*Dried Fish/);
  // What she offers next follows the request, even with a card shown.
  assert.ok(remove.suggestions.includes('Take me to checkout'));
  assert.ok(!remove.suggestions.some((s) => /compare/i.test(s)));
  assert.ok(!view.suggestions.includes('What\'s in my cart?'), 'no offer to show what was just shown');
});

test('orders: only the person\'s own, and guests are asked to sign in', async () => {
  const buyer = await h.user('BUYER');
  const other = await h.user('BUYER');
  const p = await make('Kakanin Box', 120);
  const mine = await h.order(buyer, await shopP, [{ product: p }], { status: 'CONFIRMED' });
  const theirs = await h.order(other, await shopP, [{ product: p }]);

  const guest = await turn('where is my order?');
  assert.equal(guest.actions[0].to, '/login');

  const r = await turn('where is my order?', {}, {}, buyer);
  assert.equal(r.intent, 'orders');
  assert.equal(r.orders[0].orderNumber, mine.orderNumber);
  assert.match(r.say, /confirmed by the shop/);
  assert.ok(!JSON.stringify(r).includes(theirs.orderNumber));

  const snoop = await turn(`status of ${theirs.orderNumber}`, {}, {}, buyer);
  assert.ok(!JSON.stringify(snoop).includes(theirs.id));
});

test('the guide answers how-to questions without any outside AI', async () => {
  const buyer = await h.user('BUYER');
  const r = await turn('How do I pay with GCash?', {}, {}, buyer);
  assert.equal(r.intent, 'guide');
  assert.match(r.say, /GCash/);
  const intro = await require('../src/services/buyerAssistant.service').getIntro(buyer);
  assert.equal(intro.ai, false, 'the buyer side never calls the hosted model');
  const off = await turn('what is the weather today', {}, {}, buyer);
  assert.match(off.say, /not sure|naintindihan/);
});

test('what the page sends is cleaned: bad ids, huge quantities, unknown pages', () => {
  const s = engine.cleanState({
    shown: ['ok-id', '../../etc', 'x'.repeat(100), 5], focus: "1' OR 1=1", lastSearch: { maxPrice: -5, sort: 'drop table', page: 999 },
  });
  assert.deepEqual(s.shown, ['ok-id']);
  assert.equal(s.focus, null);
  assert.equal(s.lastSearch.maxPrice, null);
  assert.equal(s.lastSearch.sort, null);
  assert.equal(s.lastSearch.page, 50);
  const c = engine.cleanContext({ pageType: 'admin', cart: [{ productId: 'a1', quantity: 1e9 }, { productId: '<script>' }] });
  assert.equal(c.pageType, 'other');
  assert.deepEqual(c.cart, [{ productId: 'a1', quantity: 999 }]);
});

test('the endpoint: guests and buyers, and a request too long', async () => {
  const res = await h.api('POST', '/moormy/turn', { body: { text: `sweets ${tag}`, context: { pageType: 'home' } } });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.intent, 'search');
  assert.ok(Array.isArray(res.body.data.suggestions));
  assert.equal((await h.api('POST', '/moormy/turn', { body: { text: 'x'.repeat(501) } })).status, 400);
  const buyer = await h.user('BUYER');
  const signed = await h.api('POST', '/moormy/turn', { token: h.token(buyer), body: { text: 'hi' } });
  assert.match(signed.body.data.say, /Hi|Hello/);
});
