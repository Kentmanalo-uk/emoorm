import { afterEach, expect, test, vi } from 'vitest';
import { peso, pesoShort, pesoWhole, chatTime, timeAgo } from '../format';

afterEach(() => vi.useRealTimers());

test('money: two decimals, compact, and whole', () => {
  expect(peso(1250)).toBe('₱1,250.00');
  expect(peso('99.5')).toBe('₱99.50');
  expect(peso(undefined)).toBe('₱0.00');
  expect(pesoShort(1250)).toBe('₱1,250');
  expect(pesoShort(12.5)).toBe('₱12.50');
  expect(pesoShort(0.1 + 0.2)).toBe('₱0.30');
  expect(pesoWhole(1250.4).replace(/\s/g, '')).toBe('₱1,250');
});

test('times: today a clock time, else a date; and how long ago', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T10:00:00+08:00'));
  expect(chatTime('2026-10-27T08:30:00+08:00')).toMatch(/8:30/);
  expect(chatTime('2026-10-21T08:30:00+08:00')).toMatch(/Oct\s*21/);
  expect(chatTime(null)).toBe('');
  expect(timeAgo(new Date(Date.now() - 20 * 1000))).toBe('just now');
  expect(timeAgo(new Date(Date.now() - 5 * 60000))).toBe('5m ago');
  expect(timeAgo(new Date(Date.now() - 3 * 3600000))).toBe('3h ago');
  expect(timeAgo(new Date(Date.now() - 2 * 86400000))).toBe('2d ago');
  expect(timeAgo('2026-10-01T09:00:00+08:00')).toMatch(/Oct\s*1/);
  expect(timeAgo('not a date')).toBe('');
});
