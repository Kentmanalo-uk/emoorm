import { beforeEach, expect, test, vi } from 'vitest';

const get = vi.fn();
vi.mock('../axios', () => ({ default: { get: (...args) => get(...args) } }));

const counts = await import('../unreadCounts');

beforeEach(() => {
  get.mockReset();
  counts.clearUnreadCounts();
});

test('the badge counts come from one request, shared by callers at the same moment', async () => {
  get.mockResolvedValue({ data: { count: 2, shop: 1, support: 3 } });
  await Promise.all([counts.refreshChatCounts(), counts.refreshChatCounts(), counts.refreshChatCounts()]);
  expect(get).toHaveBeenCalledTimes(1);
  expect(counts.useUnreadCounts.getState()).toMatchObject({ chats: 2, shop: 1, support: 3 });
  // Asked again a moment later: not repeated.
  await counts.refreshChatCounts();
  expect(get).toHaveBeenCalledTimes(1);
});

test('notification counts per feed, and a read one comes off at once', () => {
  counts.setNotificationCounts({ BUYER: 4, SELLER: 2, ADMIN: 0 });
  expect(counts.useUnreadCounts.getState().ready).toBe(true);
  counts.countOneRead('BUYER');
  counts.countOneRead('ADMIN');
  expect(counts.useUnreadCounts.getState().notifications).toEqual({ BUYER: 3, SELLER: 2, ADMIN: 0 });
  counts.countChatRead('support');
  expect(counts.useUnreadCounts.getState().support).toBe(0);
});
