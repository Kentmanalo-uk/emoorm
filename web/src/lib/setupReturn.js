import { useEffect, useState } from 'react';

/**
 * The guided setup (/seller/welcome) sends the seller to other pages for a
 * few steps (the ID check, the payment QR, a product...). It leaves the step
 * to come back to here, and the Seller Center shows a "Back to setup" pill
 * until they return or close it. Kept for the browser tab only.
 */
const KEY = 'emoorm.setupReturn';
const EVENT = 'emoorm:setup-return';

const read = () => {
  try { return sessionStorage.getItem(KEY) || null; } catch { return null; }
};

export const getSetupReturn = read;

export const setSetupReturn = (step) => {
  try { sessionStorage.setItem(KEY, step); } catch { /* storage off: no pill */ }
  window.dispatchEvent(new Event(EVENT));
};

export const clearSetupReturn = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  window.dispatchEvent(new Event(EVENT));
};

/** Calls `fn` whenever the step to return to changes. */
export const onSetupReturn = (fn) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

/** The step to return to, kept in step with the guided setup. */
export function useSetupReturn() {
  const [step, setStep] = useState(read);
  useEffect(() => onSetupReturn(() => setStep(read())), []);
  return step;
}
