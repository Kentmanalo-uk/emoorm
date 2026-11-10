const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const store = require('./store');
const settings = require('./settings');
const runner = require('./runner');
const counters = require('./counters');
const { MODULES, byKey, isBuilt } = require('./modules');

/**
 * What the super admin's ML page (/admin/ml) reads and does: the engine's
 * state, each module's last run and version, runs, versions, a run now, and
 * a roll back. The switches themselves are app settings (PUT /app-settings
 * { mlSettings }).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const status = async () => {
  const current = settings.read((await require('../services/appSetting.service').get()).mlSettings);
  const since = new Date(Date.now() - 7 * DAY_MS);
  const [recent, active, counts, failures, predictions, openAlerts] = await Promise.all([
    prisma.mlTrainingRun.findMany({ orderBy: { startedAt: 'desc' }, take: 300 }),
    prisma.mlModelVersion.findMany({ where: { status: 'ACTIVE' } }),
    prisma.mlEventCount.groupBy({ by: ['eventType'], where: { day: { gte: since } }, _sum: { count: true } }),
    prisma.mlTrainingRun.count({ where: { startedAt: { gte: since }, status: { in: ['FAILED', 'TIMED_OUT'] } } }),
    prisma.mlPrediction.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.mlAlert.count({ where: { status: 'PENDING_REVIEW' } }),
  ]);
  const lastRunOf = (key) => recent.find((r) => r.modelKey === key) || null;
  const lastOkOf = (key) => recent.find((r) => r.modelKey === key && r.status === 'OK') || null;
  const jobs = require('../lib/runtimeStatus').snapshot().jobs || {};

  return {
    enabled: current.enabled,
    busy: runner.isBusy(),
    budgetMs: runner.BUDGET_MS,
    modules: MODULES.map((m) => ({
      key: m.key,
      number: m.number,
      name: m.name,
      what: m.what,
      phase: m.phase,
      everyMs: m.every,
      built: isBuilt(m.key),
      on: current.enabled && current.modules[m.key] && isBuilt(m.key),
      switchedOn: current.modules[m.key],
      lastRun: lastRunOf(m.key),
      lastSuccess: lastOkOf(m.key),
      activeVersion: active.find((v) => v.modelKey === m.key) || null,
      job: jobs[`ml-${m.key}`] || null,
    })),
    housekeeping: { lastRun: lastRunOf('housekeeping'), job: jobs['ml-housekeeping'] || null },
    week: {
      events: Object.fromEntries(counters.EVENTS.map((e) => [e, counts.find((c) => c.eventType === e)?._sum.count || 0])),
      failedRuns: failures,
    },
    pendingCounts: counters.pending(),
    livePredictions: predictions,
    openAlerts,
    recentRuns: recent.slice(0, 10),
  };
};

const keyOrThrow = (key) => {
  if (key !== 'housekeeping' && !byKey.has(key)) throw new ApiError('No such ML module', 404);
  return key;
};

const runs = async ({ module: key, page = 1, pageSize = 20 }) => {
  if (key) keyOrThrow(key);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const p = Math.max(1, Number(page) || 1);
  const [rows, total] = await store.listRuns({ modelKey: key || undefined, take: size, skip: (p - 1) * size });
  return { rows, total, page: p, pageSize: size };
};

const versions = (key) => store.listVersions(keyOrThrow(key));

/**
 * Run a module now. It runs in the background (a job can take its whole
 * time budget); the run appears in the list when it ends.
 */
const runNow = async (key) => {
  keyOrThrow(key);
  if (key === 'housekeeping') {
    runner.runModule('housekeeping', { trigger: 'MANUAL', job: runner.housekeeping }).catch(() => {});
    return { started: true };
  }
  if (!isBuilt(key)) throw new ApiError('This module is not available yet', 409);
  if (!(await settings.isOn(key))) throw new ApiError('Switch the engine and this module on first', 409);
  if (runner.isBusy()) throw new ApiError(`${runner.isBusy()} is running; try again in a minute`, 409);
  runner.runModule(key, { trigger: 'MANUAL' }).catch(() => {});
  return { started: true };
};

/** Put an older (or newer) version of a model back in use. */
const activate = async (key, version, actor, req) => {
  keyOrThrow(key);
  const done = await store.activateVersion(key, version);
  if (!done) throw new ApiError('No such version', 404);
  // record() logs its own failures and never throws.
  await require('../services/auditLog.service').record({
    actor, req, action: 'ML_MODEL_ACTIVATED', entity: 'MlModelVersion', entityId: done.id, details: { model: key, version: done.version },
  });
  return done;
};

module.exports = {
  status, runs, versions, runNow, activate,
};
