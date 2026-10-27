import { expect, test } from 'vitest';
import { validPin } from '../pins';

test('a pin counts only inside the Philippines', () => {
  expect(validPin(13.41, 121.18)).toBe(true); // Calapan
  expect(validPin('13.41', '121.18')).toBe(true);
  expect(validPin(0, 0)).toBe(false); // an unset pin
  expect(validPin(null, 121)).toBe(false);
  expect(validPin('', '')).toBe(false);
  expect(validPin(35.68, 139.69)).toBe(false); // Tokyo
});
