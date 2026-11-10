const prisma = require('../config/database');

/**
 * The ML engine's storage (the ml_* tables): results worked out ahead of
 * time, model versions, runs and alerts. Model parameters are small JSON in
 * the database rather than files: the app folder is replaced on every deploy,
 * and the database is already private and backed up.
 */

// ── Predictions ─────────────────────────────────────────────────────────────

const BATCH = 200;

/**
 * One stored result, or null when there is none or it has gone stale.
 * @returns {Promise<{ value, meta, modelVersion, generatedAt, expiresAt }|null>}
 */
const getPrediction = async (modelKey, predictionType, entityType, entityId) => {
  const row = await prisma.mlPrediction.findUnique({
    where: {
      modelKey_predictionType_entityType_entityId: {
        modelKey, predictionType, entityType, entityId: String(entityId),
      },
    },
  });
  if (!row || row.expiresAt <= new Date()) return null;
  return {
    value: row.value, meta: row.meta, modelVersion: row.modelVersion, generatedAt: row.generatedAt, expiresAt: row.expiresAt,
  };
};

/** Several at once (same model and kind): entityId -> value, stale ones left out. */
const getPredictions = async (modelKey, predictionType, entityType, entityIds) => {
  const ids = [...new Set((entityIds || []).map(String))];
  if (!ids.length) return new Map();
  const rows = await prisma.mlPrediction.findMany({
    where: {
      modelKey, predictionType, entityType, entityId: { in: ids }, expiresAt: { gt: new Date() },
    },
    select: { entityId: true, value: true },
  });
  return new Map(rows.map((r) => [r.entityId, r.value]));
};

/**
 * Replace every result of one model and kind with a run's output, in one
 * transaction, so readers see the old set or the new one, never half.
 * @param {Array<{ entityType, entityId, value, meta? }>} rows
 * @returns {Promise<number>} rows written
 */
const replacePredictions = async (modelKey, predictionType, modelVersion, rows, ttlMs) => {
  const expiresAt = new Date(Date.now() + ttlMs);
  const generatedAt = new Date();
  const data = rows.map((r) => ({
    modelKey,
    modelVersion,
    predictionType,
    entityType: r.entityType,
    entityId: String(r.entityId),
    value: r.value,
    meta: r.meta ?? undefined,
    generatedAt,
    expiresAt,
  }));
  const writes = [prisma.mlPrediction.deleteMany({ where: { modelKey, predictionType } })];
  for (let i = 0; i < data.length; i += BATCH) {
    writes.push(prisma.mlPrediction.createMany({ data: data.slice(i, i + BATCH) }));
  }
  await prisma.$transaction(writes);
  return data.length;
};

const purgeExpiredPredictions = async () => (
  await prisma.mlPrediction.deleteMany({ where: { expiresAt: { lte: new Date() } } })
).count;

// ── Model versions ──────────────────────────────────────────────────────────

const activeCache = new Map(); // modelKey -> { at, row }
const ACTIVE_TTL_MS = 60 * 1000;

/** The version in use (cached a minute), or null. */
const getActiveVersion = async (modelKey) => {
  const hit = activeCache.get(modelKey);
  if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.row;
  const row = await prisma.mlModelVersion.findFirst({ where: { modelKey, status: 'ACTIVE' } });
  activeCache.set(modelKey, { at: Date.now(), row });
  return row;
};

/** A new version, not in use until activated. */
const createVersion = async (modelKey, { algorithm, params = null, metrics = null }) => {
  const last = await prisma.mlModelVersion.findFirst({ where: { modelKey }, orderBy: { version: 'desc' }, select: { version: true } });
  return prisma.mlModelVersion.create({
    data: {
      // The column holds 80 characters.
      modelKey, version: (last?.version || 0) + 1, algorithm: String(algorithm).slice(0, 80), params: params ?? undefined, metrics: metrics ?? undefined,
    },
  });
};

/**
 * Put a version in use: the one in use now is retired (kept for a roll back).
 * Rolling back is activating an older version.
 */
const activateVersion = async (modelKey, version) => {
  const target = await prisma.mlModelVersion.findUnique({
    where: { modelKey_version: { modelKey, version: Number(version) } },
  });
  if (!target) return null;
  const now = new Date();
  await prisma.$transaction([
    prisma.mlModelVersion.updateMany({
      where: { modelKey, status: 'ACTIVE', NOT: { id: target.id } },
      data: { status: 'RETIRED' },
    }),
    prisma.mlModelVersion.update({ where: { id: target.id }, data: { status: 'ACTIVE', activatedAt: now } }),
  ]);
  activeCache.delete(modelKey);
  return { ...target, status: 'ACTIVE', activatedAt: now };
};

const listVersions = (modelKey, take = 20) => prisma.mlModelVersion.findMany({
  where: { modelKey }, orderBy: { version: 'desc' }, take,
});

// ── Runs ────────────────────────────────────────────────────────────────────

const startRun = (modelKey, trigger) => prisma.mlTrainingRun.create({ data: { modelKey, trigger } });

/** status: OK | SKIPPED | FAILED | TIMED_OUT */
const finishRun = (id, startedAt, {
  status, modelVersion = null, rowsRead = null, rowsWritten = null, metrics = null, error = null,
}) => prisma.mlTrainingRun.update({
  where: { id },
  data: {
    status,
    modelVersion,
    rowsRead,
    rowsWritten,
    metrics: metrics ?? undefined,
    // A short reason only: never a stack trace or data.
    errorSummary: error ? String(error).slice(0, 500) : null,
    completedAt: new Date(),
    durationMs: Date.now() - new Date(startedAt).getTime(),
  },
});

const listRuns = ({ modelKey, take = 20, skip = 0 } = {}) => Promise.all([
  prisma.mlTrainingRun.findMany({
    where: modelKey ? { modelKey } : {}, orderBy: { startedAt: 'desc' }, take, skip,
  }),
  prisma.mlTrainingRun.count({ where: modelKey ? { modelKey } : {} }),
]);

// ── Alerts ──────────────────────────────────────────────────────────────────

/**
 * Raise an alert once: the same type and dedupe key again (say, the same
 * order) updates nothing and returns null, so a run can be repeated safely.
 */
const raiseAlert = async (alert) => {
  try {
    return await prisma.mlAlert.create({ data: alert });
  } catch (err) {
    if (err?.code === 'P2002') return null; // already raised
    throw err;
  }
};

// ── Housekeeping ────────────────────────────────────────────────────────────

const RUNS_KEEP_DAYS = 90;
const COUNTS_KEEP_DAYS = 400; // a year and a bit, for seasonal comparisons
const CLOSED_ALERTS_KEEP_DAYS = 180;

const purgeOld = async () => {
  const ago = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [predictions, runs, counts, alerts] = await Promise.all([
    purgeExpiredPredictions(),
    prisma.mlTrainingRun.deleteMany({ where: { startedAt: { lt: ago(RUNS_KEEP_DAYS) } } }).then((r) => r.count),
    prisma.mlEventCount.deleteMany({ where: { day: { lt: ago(COUNTS_KEEP_DAYS) } } }).then((r) => r.count),
    prisma.mlAlert.deleteMany({
      where: { status: { in: ['CLEARED', 'RESOLVED'] }, resolvedAt: { lt: ago(CLOSED_ALERTS_KEEP_DAYS) } },
    }).then((r) => r.count),
  ]);
  return {
    predictions, runs, counts, alerts,
  };
};

module.exports = {
  getPrediction,
  getPredictions,
  replacePredictions,
  purgeExpiredPredictions,
  getActiveVersion,
  createVersion,
  activateVersion,
  listVersions,
  startRun,
  finishRun,
  listRuns,
  raiseAlert,
  purgeOld,
  RUNS_KEEP_DAYS,
  COUNTS_KEEP_DAYS,
};
