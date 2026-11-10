import { describe, expect, it } from 'vitest';
import { mergeSuggestions } from '../../components/seller/product-form/formState';

const cats = ['Seafood', 'Handicrafts', 'Beverages', 'Fruits', 'Vegetables'].map((name) => ({ id: name.toLowerCase(), name }));
const pick = (...ids) => ids.map((id) => cats.find((c) => c.id === id));

describe('category hints: the word list and what the site learned', () => {
  it('puts one both agree on first, then a confident learned one, then the word list', () => {
    const merged = mergeSuggestions(pick('fruits', 'beverages'), [
      { id: 'seafood', confidence: 0.8 }, { id: 'beverages', confidence: 0.3 },
    ], cats);
    expect(merged.map((c) => c.id)).toEqual(['beverages', 'seafood', 'fruits']);
  });

  it('keeps the word list ahead of an unsure learned one, three at most, no repeats', () => {
    const merged = mergeSuggestions(pick('fruits'), [{ id: 'vegetables', confidence: 0.35 }, { id: 'fruits', confidence: 0.4 }], cats);
    expect(merged.map((c) => c.id)).toEqual(['fruits', 'vegetables']);
    expect(mergeSuggestions(pick('fruits', 'seafood', 'beverages'), [{ id: 'handicrafts', confidence: 0.9 }], cats)).toHaveLength(3);
  });

  it('ignores categories it does not know, and works with nothing learned', () => {
    expect(mergeSuggestions(pick('fruits'), [{ id: 'gone', confidence: 0.9 }], cats).map((c) => c.id)).toEqual(['fruits']);
    expect(mergeSuggestions([], undefined, cats)).toEqual([]);
  });
});
