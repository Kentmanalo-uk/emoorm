/*
 * expo-observe (startup and screen timings on the EAS dashboard), but
 * never at the cost of the app starting.
 *
 * It needs a native module, ExpoAppMetrics, and a development build made
 * before expo-observe was added to package.json does not contain it.
 * The import then throws while app/_layout.js is still being evaluated,
 * so the root layout exports nothing, expo-router is handed undefined
 * for every route, and the only error you see is
 *
 *   TypeError: Cannot read property 'ErrorBoundary' of undefined
 *
 * which says nothing about the real cause. Timings are worth having; they
 * are not worth a blank app, and the thing most likely to be missing a
 * native module is a build someone is in the middle of working on.
 *
 * So the import is attempted, and if the native side is not there the app
 * runs with the measuring turned off. Rebuild the dev client (or use Expo
 * Go, which bundles the module) to get the numbers back.
 */
let real = null;
try {
  // eslint-disable-next-line global-require
  real = require('expo-observe');
} catch (err) {
  console.warn(
    `[observe] expo-observe is not available in this build (${err?.message || err}). `
    + 'Startup and screen timings are off; everything else works as normal.',
  );
}

const passthrough = ({ children }) => children;

/** Observe.configure(...) if it is there; otherwise it does nothing. */
export const Observe = real?.Observe ?? { configure: () => {} };

/**
 * The root wrapper. Without expo-observe this hands the component back
 * unchanged, so expo-router still gets a real default export.
 */
export const ObserveRoot = real?.ObserveRoot ?? Object.assign(passthrough, {
  wrap: (Component) => Component,
});

/** markInteractive() and the rest; no-ops when the module is missing. */
export const useObserve = real?.useObserve ?? (() => ({ markInteractive: () => {} }));

export default { Observe, ObserveRoot, useObserve };
