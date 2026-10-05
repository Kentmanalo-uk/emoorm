import { useEffect, useState } from 'react';

/**
 * The guided setup (/seller/welcome) sends the seller to other pages for a
 * few steps (the ID check, the payment QR, a product...). It leaves the step
 * to come back to here, and the Seller Center shows a "Back to setup" pill
 * (SetupReturnPill) until they return or close it (web/src/lib/setupReturn.js).
 *
 * The website keeps it for the browser tab (sessionStorage); the app keeps it
 * while the app runs, which is the same thing for a phone.
 *
 *   setSetupReturn('payment')   before router.push('/seller/fulfillment/payment')
 *   clearSetupReturn()          back in the setup, or the pill's X
 *   useSetupReturn()            the step to return to, or null
 */
let step = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(step));

export const getSetupReturn = () => step;

export const setSetupReturn = (next) => {
  step = next ? String(next) : null;
  emit();
};

export const clearSetupReturn = () => {
  step = null;
  emit();
};

/** Calls `fn` whenever the step to return to changes. */
export const onSetupReturn = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The step to return to, kept in step with the guided setup. */
export function useSetupReturn() {
  const [current, setCurrent] = useState(step);
  useEffect(() => {
    setCurrent(step);
    return onSetupReturn(setCurrent);
  }, []);
  return current;
}
