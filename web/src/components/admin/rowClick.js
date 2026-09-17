const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"]';

/**
 * Row click handler for admin tables: opens details unless the click landed on
 * a control inside the row (buttons, checkboxes, links) or selected text.
 */
export const rowOpen = (open) => (event) => {
  if (event.target.closest(INTERACTIVE)) return;
  if (window.getSelection?.().toString()) return;
  open();
};

export const rowKeyOpen = (open) => (event) => {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    open();
  }
};
