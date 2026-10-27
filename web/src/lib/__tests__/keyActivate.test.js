import { expect, test, vi } from 'vitest';
import { keyActivate } from '../keyActivate';

const press = (props, key, target) => {
  const e = { key, target, currentTarget: target, preventDefault: vi.fn() };
  props.onKeyDown(e);
  return e;
};

test('a clickable row is a button for the keyboard: Tab reaches it, Enter and Space press it', () => {
  const run = vi.fn();
  const props = keyActivate(run);
  expect(props.role).toBe('button');
  expect(props.tabIndex).toBe(0);
  const row = {};
  expect(press(props, 'Enter', row).preventDefault).toHaveBeenCalled();
  press(props, ' ', row);
  press(props, 'a', row);
  expect(run).toHaveBeenCalledTimes(2);
  // A key pressed in something inside the row (a field) is left to it.
  props.onKeyDown({ key: 'Enter', target: {}, currentTarget: row, preventDefault: vi.fn() });
  expect(run).toHaveBeenCalledTimes(2);
});
