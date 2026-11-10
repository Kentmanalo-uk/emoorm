const store = require('./store');
const { loadCatalog } = require('./catalog');
const { dailyUnits, weekly, daysSinceFirstSale } = require('./sales');

/**
 * Module 02, demand forecasting (ML_DOC.MD): expected units for the next 7,
 * 30 and 90 days per product, from its own weekly sales, worked out weekly.
 *
 * Sales here are few and uneven, so the methods are the light ones the
 * blueprint asks for, chosen per product by how well each would have
 * predicted the product's own last 4 weeks (time-based validation):
 *
 *   naive   next week = last week (the baseline every method is judged against)
 *   ma4     the average of the last 4 weeks
 *   ses     simple exponential smoothing (level only)
 *   holt    Holt's smoothing with a damped trend
 *
 * The one with the lowest error (MAE) is refitted on all weeks and used. Its
 * validation error (RMSE) gives the range (80%). With less than 10 weeks of
 * history there is nothing to validate on: the 4-week average is used and
 * marked an early estimate. Below the minimum (6 weeks since the first sale
 * and 6 units) nothing is forecast, and the seller is told why.
 */

const MODEL = 'forecasting';
const TTL_MS = 9 * 24 * 60 * 60 * 1000; // outlives one missed weekly run
const HISTORY_WEEKS = 26;
const HOLDOUT = 4;
const Z80 = 1.28; // two-sided 80%

const LIMITS = {
  minWeeks: 6, // since the first sale
  minUnits: 6, // in the history
  validateWeeks: 10, // enough to hold out 4 and fit on 6+
  ninetyDayWeeks: 26, // a 90-day forecast needs half a year behind it
};

const round1 = (v) => Math.round(v * 10) / 10;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);

// ── Methods: each returns a function h -> forecast h weeks ahead ─────────────

const naive = (y) => () => y[y.length - 1] || 0;
const ma4 = (y) => {
  const m = mean(y.slice(-4));
  return () => m;
};
const ses = (alpha) => (y) => {
  let level = y[0] || 0;
  for (let i = 1; i < y.length; i += 1) level = alpha * y[i] + (1 - alpha) * level;
  return () => level;
};
const holt = (alpha, beta, phi = 0.9) => (y) => {
  let level = y[0] || 0;
  let trend = y.length > 1 ? y[1] - y[0] : 0;
  for (let i = 1; i < y.length; i += 1) {
    const last = level;
    level = alpha * y[i] + (1 - alpha) * (last + phi * trend);
    trend = beta * (level - last) + (1 - beta) * phi * trend;
  }
  return (h) => {
    let damp = 0;
    for (let k = 1; k <= h; k += 1) damp += phi ** k;
    return level + damp * trend;
  };
};

const METHODS = [
  { name: 'naive', fit: naive },
  { name: 'ma4', fit: ma4 },
  ...[0.2, 0.4, 0.6].map((a) => ({ name: `ses(${a})`, fit: ses(a) })),
  ...[0.2, 0.4].flatMap((a) => [0.1, 0.3].map((b) => ({ name: `holt(${a},${b})`, fit: holt(a, b) }))),
];

/** Errors of a forecast against what happened. MAPE only over weeks that sold. */
const errors = (forecast, actual) => {
  const diffs = actual.map((a, i) => forecast[i] - a);
  const mae = mean(diffs.map(Math.abs));
  const rmse = Math.sqrt(mean(diffs.map((d) => d * d)));
  const sold = actual.map((a, i) => [a, diffs[i]]).filter(([a]) => a > 0);
  const mape = sold.length ? mean(sold.map(([a, d]) => Math.abs(d) / a)) : null;
  return { mae, rmse, mape };
};

/** How a method would have done on the last HOLDOUT weeks, fitted on the rest. */
const validate = (method, y) => {
  const train = y.slice(0, -HOLDOUT);
  const test = y.slice(-HOLDOUT);
  const f = method.fit(train);
  return errors(test.map((_, i) => Math.max(0, f(i + 1))), test);
};

/** Expected units over `days`, from a weekly forecast function. */
const over = (f, days) => {
  const whole = Math.floor(days / 7);
  let total = 0;
  for (let h = 1; h <= whole; h += 1) total += Math.max(0, f(h));
  const part = days / 7 - whole;
  if (part > 0) total += Math.max(0, f(whole + 1)) * part;
  return total;
};

/**
 * One product's forecast from its weekly units (oldest first), or why there is none.
 * @param {number[]} y - weekly units, the last ending today
 * @param {number} sinceFirstSaleDays
 */
const forecastSeries = (y, sinceFirstSaleDays) => {
  const historyWeeks = Math.min(y.length, Math.floor((sinceFirstSaleDays ?? 0) / 7) + 1);
  const series = y.slice(-historyWeeks);
  const units = sum(series);
  if (sinceFirstSaleDays == null || historyWeeks < LIMITS.minWeeks || units < LIMITS.minUnits) {
    return {
      status: 'insufficient',
      historyWeeks: sinceFirstSaleDays == null ? 0 : historyWeeks,
      units,
      needs: { weeks: LIMITS.minWeeks, units: LIMITS.minUnits },
    };
  }

  let chosen;
  let validation = null;
  let baseline = null;
  if (historyWeeks >= LIMITS.validateWeeks) {
    const scored = METHODS.map((m) => ({ m, e: validate(m, series) }));
    baseline = scored.find((s) => s.m.name === 'naive').e;
    // The lowest error; a tie goes to the simpler (earlier) method.
    chosen = scored.reduce((best, s) => (s.e.mae < best.e.mae - 1e-9 ? s : best));
    validation = chosen.e;
    chosen = chosen.m;
  } else {
    chosen = METHODS.find((m) => m.name === 'ma4');
  }
  const f = chosen.fit(series);
  // The spread of a week: the validation error, else how much weeks varied.
  const spread = validation ? validation.rmse : Math.sqrt(mean(series.slice(-4).map((v) => (v - mean(series.slice(-4))) ** 2)));
  const range = (days) => {
    const centre = over(f, days);
    const half = Z80 * spread * Math.sqrt(days / 7);
    return { units: round1(centre), low: round1(Math.max(0, centre - half)), high: round1(centre + half) };
  };
  const last4 = sum(series.slice(-4));
  const prev4 = sum(series.slice(-8, -4));
  let trend = 'steady';
  if (historyWeeks >= 8 && Math.abs(last4 - prev4) >= 2) {
    if (last4 > prev4 * 1.25) trend = 'rising';
    else if (last4 < prev4 * 0.75) trend = 'falling';
  }
  const next7 = range(7);
  return {
    status: validation ? 'ok' : 'early',
    method: chosen.name,
    historyWeeks,
    units,
    weekly: series.slice(-12),
    next7,
    next30: range(30),
    next90: historyWeeks >= LIMITS.ninetyDayWeeks ? range(90) : null,
    // Enough for the coming week, at the top of its range.
    prepare: Math.ceil(next7.high),
    trend,
    validation: validation && {
      mae: round1(validation.mae), rmse: round1(validation.rmse), mape: validation.mape == null ? null : Math.round(validation.mape * 100) / 100,
    },
    baseline: baseline && { mae: round1(baseline.mae) },
  };
};

/** The weekly job. */
const run = async (ctx) => {
  // Every product: paluto has no stock, but its demand is still worth knowing.
  const catalog = await loadCatalog();
  const ids = catalog.map((p) => p.id);
  const sales = await dailyUnits({ days: HISTORY_WEEKS * 7, productIds: ids, timeLeft: ctx.timeLeft });
  const rows = [];
  const tally = { ok: 0, early: 0, insufficient: 0 };
  const maes = [];
  const naiveMaes = [];
  catalog.forEach((p, i) => {
    if (i % 200 === 0 && ctx.timeLeft() < 1500) throw new Error('Ran out of time forecasting');
    const days = sales.get(p.id);
    const result = forecastSeries(weekly(days, HISTORY_WEEKS), daysSinceFirstSale(days));
    tally[result.status] += 1;
    if (result.validation) {
      maes.push(result.validation.mae);
      naiveMaes.push(result.baseline.mae);
    }
    if (result.status !== 'insufficient') rows.push({ entityType: 'product', entityId: p.id, value: result });
  });
  const metrics = {
    products: catalog.length,
    forecast: tally.ok,
    early: tally.early,
    insufficient: tally.insufficient,
    mae: maes.length ? round1(mean(maes)) : null,
    baselineMae: naiveMaes.length ? round1(mean(naiveMaes)) : null,
  };
  if (!rows.length) {
    return {
      skipped: true, reason: `No product has ${LIMITS.minWeeks} weeks and ${LIMITS.minUnits} units of sales yet`, rowsRead: catalog.length, metrics,
    };
  }
  const version = await store.createVersion(MODEL, {
    algorithm: 'Naive, 4-week average, SES or damped Holt, picked on a 4-week holdout',
    params: { limits: LIMITS, holdout: HOLDOUT, historyWeeks: HISTORY_WEEKS },
    metrics,
  });
  const written = await store.replacePredictions(MODEL, 'forecast', version.version, rows, TTL_MS);
  await store.activateVersion(MODEL, version.version);
  return {
    rowsRead: catalog.length, rowsWritten: written, metrics, modelVersion: version.version,
  };
};

/** Forecasts for these products: id -> forecast (products without one left out). */
const forecastsFor = (productIds) => store.getPredictions(MODEL, 'forecast', 'product', productIds);

module.exports = {
  run, forecastSeries, forecastsFor, METHODS, LIMITS, errors, over, MODEL, naive, ma4, ses, holt,
};
