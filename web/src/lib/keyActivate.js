/**
 * For an element that is clicked but is not a button (a table row, a card):
 * what makes it a button for the keyboard too — reachable with Tab, and
 * pressed with Enter or Space.
 *
 *   <tr onClick={open} {...keyActivate(open)}>
 */
export const keyActivate = (fn) => ({
  role: 'button',
  tabIndex: 0,
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(e);
    }
  },
});

export default keyActivate;
