import { describe, expect, it } from 'vitest';
import { findWake } from '../moormy/wake/speechWake';

describe('"Hey Moormy" in what the speech service heard', () => {
  it('finds her name however it was written, and what was said after it', () => {
    expect(findWake('Hey Moormy')).toEqual({ found: true, rest: '' });
    expect(findWake('hey mormy find me pasalubong')).toEqual({ found: true, rest: 'find me pasalubong' });
    expect(findWake('Hey moor me what is in my cart')).toEqual({ found: true, rest: 'what is in my cart' });
    expect(findWake('hey Murphy show cheaper')).toEqual({ found: true, rest: 'show cheaper' });
    expect(findWake('Hi Moormy, tap best sellers')).toEqual({ found: true, rest: 'tap best sellers' });
    // Alone at the start, spelled close: her too.
    expect(findWake('Moormy open the first one')).toEqual({ found: true, rest: 'open the first one' });
  });

  it('leaves other words alone', () => {
    for (const text of ['hey money', 'hey Mary how are you', 'I like Moormy', 'hey more milk', 'hello there', 'good morning', '']) {
      expect(findWake(text).found, text).toBe(false);
    }
  });
});
