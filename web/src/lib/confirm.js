/*
 * "Are you sure?" with the app's own dialog, from anywhere, in one line:
 *
 *   if (!(await confirmAction({ title: 'Delete this address?', danger: true }))) return;
 *
 * <ConfirmHost /> (components/ui/ConfirmHost.jsx, mounted once in App.jsx)
 * shows it; the promise answers true for the confirm button, false for
 * Cancel, Escape or a tap outside.
 */
let current = null; // { title, message, confirmLabel, cancelLabel, danger, resolve }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function confirmAction({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  // A second question while one is open answers the first with "no".
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { title, message, confirmLabel, cancelLabel, danger, resolve };
    emit();
  });
}

export const answerConfirm = (value) => {
  const open = current;
  current = null;
  emit();
  open?.resolve(value);
};

export const subscribeConfirm = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The question on screen now (or null). */
export const currentConfirm = () => current;
