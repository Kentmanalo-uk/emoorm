import { describe, expect, it } from 'vitest';
import {
  pageTypeFor, searchFromUrl, orderIdFrom, cartForContext, buildContext, PAGE_TYPES,
} from '../moormy/pageContext';

describe('pageTypeFor', () => {
  const cases = [
    ['/', '', 'home'],
    ['/search', '?q=rice', 'search'],
    ['/products', '', 'search'],
    ['/search/image', '', 'search'],
    ['/category/seafood', '', 'category'],
    ['/product/bibingka-rice-cake-1', '', 'product'],
    ['/product/bibingka-rice-cake-1/reviews', '', 'product'],
    ['/cart', '', 'cart'],
    ['/checkout', '', 'checkout'],
    ['/profile/orders', '', 'orders'],
    ['/profile/orders', '?status=PENDING', 'orders'],
    ['/profile/orders', '?id=abc-123', 'order'],
    ['/orders/abc-123/receipt', '', 'order'],
    ['/store/mindoro-crafts-hub', '', 'store'],
    ['/profile', '', 'profile'],
    ['/profile/settings', '', 'profile'],
    ['/stores', '', 'other'],
    ['/help', '', 'other'],
    ['/cart/', '', 'cart'],
  ];
  it.each(cases)('%s%s -> %s', (path, search, type) => {
    expect(pageTypeFor(path, search)).toBe(type);
  });

  it('only ever answers a page type the server knows', () => {
    for (const [path, search] of cases) expect(PAGE_TYPES).toContain(pageTypeFor(path, search));
    expect(pageTypeFor(undefined)).toBe('home');
    expect(pageTypeFor('/some/thing/else')).toBe('other');
  });
});

describe('searchFromUrl', () => {
  it('reads the query and filters of a results page', () => {
    expect(searchFromUrl('/search', '?q=%20rice%20&category=cat-1&municipalityId=town-2&minPrice=50&maxPrice=100')).toEqual({
      query: 'rice', categoryId: 'cat-1', municipalityId: 'town-2', minPrice: 50, maxPrice: 100, sort: null,
    });
  });

  it('leaves out what is missing or not a valid id or price', () => {
    expect(searchFromUrl('/products', '?category=bad id!&minPrice=-5&maxPrice=abc')).toEqual({
      query: '', categoryId: null, municipalityId: null, minPrice: null, maxPrice: null, sort: null,
    });
  });

  it('is null away from results pages', () => {
    expect(searchFromUrl('/', '?q=rice')).toBeNull();
    expect(searchFromUrl('/product/x', '?q=rice')).toBeNull();
  });
});

describe('orderIdFrom', () => {
  it('finds the order of a receipt or of My Orders opened on one', () => {
    expect(orderIdFrom('/orders/ord-1/receipt')).toBe('ord-1');
    expect(orderIdFrom('/profile/orders', '?id=ord-2')).toBe('ord-2');
    expect(orderIdFrom('/profile/orders', '')).toBeNull();
    expect(orderIdFrom('/cart', '?id=ord-2')).toBeNull();
  });
});

describe('cartForContext', () => {
  it('sends one line per product, quantities added up, ids only', () => {
    const items = [
      { id: 'p1:', productId: 'p1', quantity: 2, price: 10, name: 'A' },
      { id: 'p1:{"Size":"L"}', productId: 'p1', quantity: 1 },
      { id: 'p2:', quantity: '3' },
      { id: 'bad id:', quantity: 1 },
    ];
    expect(cartForContext(items)).toEqual([
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 3 },
    ]);
    expect(cartForContext(null)).toEqual([]);
  });
});

describe('buildContext', () => {
  const page = { path: '/product/honey', productId: 'prod-9', storeId: 'store-3' };

  it('uses what the page said only on that page', () => {
    const here = buildContext({ pathname: '/product/honey', page });
    expect(here).toMatchObject({ pageType: 'product', productId: 'prod-9', storeId: 'store-3', route: '/product/honey' });
    const elsewhere = buildContext({ pathname: '/product/other', page });
    expect(elsewhere.productId).toBeNull();
    expect(elsewhere.storeId).toBeNull();
  });

  it('carries the search, the order and the cart', () => {
    const c = buildContext({
      pathname: '/category/seafood', search: '?maxPrice=200', page: { path: '/category/seafood', categoryId: 'cat-7' }, cartItems: [{ productId: 'p1', quantity: 1 }],
    });
    expect(c.pageType).toBe('category');
    expect(c.search).toMatchObject({ categoryId: 'cat-7', maxPrice: 200 });
    expect(c.cart).toEqual([{ productId: 'p1', quantity: 1 }]);
    expect(buildContext({ pathname: '/profile/orders', search: '?id=o-1' }).orderId).toBe('o-1');
    expect(buildContext({ pathname: '/' }).search).toBeNull();
  });
});
