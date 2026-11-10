import { describe, expect, it, vi } from 'vitest';
import { planActions, runSteps } from '../moormy/actions';
import { resultsPath, searchFromUrl, buildContext } from '../moormy/pageContext';

describe('Moormy drives the results page', () => {
  it('writes her search as the results page address, as its own filters do', () => {
    expect(resultsPath({ query: 'pasalubong' })).toBe('/products?q=pasalubong');
    expect(resultsPath({
      query: 'honey', maxPrice: 259, sort: 'cheapest', municipalityId: 'm-1', categoryId: 'c-1',
    })).toBe('/products?q=honey&category=c-1&municipalityId=m-1&maxPrice=259&sort=price-low');
    expect(resultsPath({ query: 'honey', sort: 'priciest' })).toBe('/products?q=honey&sort=price-high');
    // Browsing everything: best sellers first, as she found them.
    expect(resultsPath({ query: '' })).toBe('/products?sort=top-sales');
    // Nothing odd gets in: bad ids, negative prices.
    expect(resultsPath({ query: 'x', categoryId: '../evil', minPrice: -5 })).toBe('/products?q=x');
  });

  it('reads the page back: its sort in her words, and the products it lists, in order', () => {
    expect(searchFromUrl('/products', '?q=honey&sort=price-low&maxPrice=259')).toMatchObject({
      query: 'honey', sort: 'cheapest', maxPrice: 259,
    });
    expect(searchFromUrl('/products', '?q=honey&sort=relevance').sort).toBeNull();
    const ctx = buildContext({
      pathname: '/products', search: '?q=honey', page: { path: '/products', listed: 'p3,p1,bad id,p2' },
    });
    expect(ctx.listed).toEqual(['p3', 'p1', 'p2']);
    // Another page's list never comes along.
    expect(buildContext({ pathname: '/products', page: { path: '/cart', listed: 'p1' } }).listed).toEqual([]);
    expect(buildContext({ pathname: '/cart', page: { path: '/cart', listed: 'p1' } }).listed).toEqual([]);
  });

  it('shows results on the page, goes back, scrolls: one page per reply', () => {
    const steps = planActions([
      { type: 'show_results', search: { query: 'honey', sort: 'cheapest' } },
      { type: 'back' },
      { type: 'scroll' },
    ]);
    expect(steps).toEqual([
      { kind: 'results', to: '/products?q=honey&sort=price-low' },
      { kind: 'scroll' },
    ]);
    const navigate = vi.fn();
    const scroll = vi.fn();
    const notes = runSteps([...steps, { kind: 'back' }], { cart: {}, navigate, scroll });
    expect(navigate).toHaveBeenNthCalledWith(1, '/products?q=honey&sort=price-low');
    expect(navigate).toHaveBeenNthCalledWith(2, -1);
    expect(scroll).toHaveBeenCalledOnce();
    expect(notes.map((n) => n.kind)).toEqual(['results', 'scroll', 'back']);
    // A malformed proposal does nothing.
    expect(planActions([{ type: 'show_results' }, { type: 'show_results', search: 'x' }])).toEqual([]);
  });
});
