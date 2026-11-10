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
      { kind: 'scroll', dir: 'down' },
    ]);
    const navigate = vi.fn();
    const scroll = vi.fn();
    const notes = runSteps([...steps, { kind: 'back' }], { cart: {}, navigate, scroll });
    expect(navigate).toHaveBeenNthCalledWith(1, '/products?q=honey&sort=price-low');
    expect(navigate).toHaveBeenNthCalledWith(2, -1);
    expect(scroll).toHaveBeenCalledWith('down');
    expect(notes.map((n) => n.kind)).toEqual(['results', 'scroll', 'back']);
    // A malformed proposal does nothing.
    expect(planActions([{ type: 'show_results' }, { type: 'show_results', search: 'x' }])).toEqual([]);
  });
});

describe('typed in the chat, nothing moves; spoken to, she works the screen', () => {
  const proposals = [
    { type: 'show_results', search: { query: 'honey' } },
    { type: 'navigate', to: '/cart' },
    { type: 'back' },
    { type: 'scroll', dir: 'up' },
    { type: 'press', i: 4, label: 'Follow' },
    { type: 'press', i: 7, label: 'Remove', confirm: true },
    {
      type: 'fill', i: 2, label: 'Quantity', value: '3',
    },
  ];

  it('typed: links and buttons to tap, no page moves', () => {
    const steps = planActions(proposals, { drive: false });
    expect(steps).toEqual([
      { kind: 'link', to: '/products?q=honey', label: 'See them on the page' },
      { kind: 'link', to: '/cart', label: null },
      { kind: 'offerPress', i: 4, label: 'Follow' },
      { kind: 'offerPress', i: 7, label: 'Remove' },
      {
        kind: 'offerFill', i: 2, label: 'Quantity', value: '3',
      },
    ]);
    const navigate = vi.fn();
    runSteps(steps, { cart: {}, navigate });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('spoken: the page moves, presses and types, asks before "Remove"', () => {
    const steps = planActions(proposals, { drive: true });
    expect(steps.map((s) => s.kind)).toEqual(['results', 'link', 'scroll', 'press', 'confirmPress', 'fill']);
    // Stand-ins for a button and a field (no browser here).
    const element = (tag) => {
      const events = {};
      return {
        tagName: tag,
        isConnected: true,
        value: '',
        classList: { add: vi.fn(), remove: vi.fn() },
        scrollIntoView: vi.fn(),
        focus: vi.fn(),
        click: vi.fn(),
        dispatchEvent: (e) => { (events[e.type] ||= vi.fn())(e); return true; },
        events,
      };
    };
    const press = element('BUTTON');
    const field = element('INPUT');
    const refs = new Map([[4, press], [2, field]]);
    const notes = runSteps(steps, {
      cart: {}, navigate: vi.fn(), scroll: vi.fn(), refs,
    });
    expect(press.click).toHaveBeenCalledOnce();
    expect(press.classList.add).toHaveBeenCalledWith('mmg-target');
    expect(field.value).toBe('3');
    expect(field.events.input).toHaveBeenCalled();
    expect(notes.filter((n) => n.kind === 'press' || n.kind === 'fill').every((n) => n.ok)).toBe(true);
    // Gone from the page by then: said, not pressed.
    const gone = runSteps([{ kind: 'press', i: 9, label: 'Old' }], { cart: {}, navigate: vi.fn(), refs: new Map() });
    expect(gone[0]).toMatchObject({ ok: false });
  });
});
